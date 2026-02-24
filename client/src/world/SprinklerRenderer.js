import * as THREE from 'three';
import { TILE_SIZE } from '@shared/constants.js';

// Spray range by sprinkler tier
const SPRAY_RANGE = {
  sprinkler: 0.3,
  sprinkler_quality: 0.6,
  sprinkler_iridium: 1.0,
};

// Tier colors
const TIER_COLOR = {
  sprinkler: 0x888888,
  sprinkler_quality: 0xccaa44,
  sprinkler_iridium: 0x8844aa,
};

const PARTICLES_PER_SPRINKLER = 40;
const NOZZLE_Y = 0.15;
const PARTICLE_LIFE_MIN = 0.4;
const PARTICLE_LIFE_MAX = 0.9;
const GRAVITY = -1.2;
const UPWARD_SPEED_MIN = 0.4;
const UPWARD_SPEED_MAX = 0.7;

// Shared water droplet texture (tiny soft circle)
let _dropletTexture = null;
function getDropletTexture() {
  if (_dropletTexture) return _dropletTexture;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(180, 220, 255, 1.0)');
  gradient.addColorStop(0.4, 'rgba(120, 190, 255, 0.8)');
  gradient.addColorStop(1, 'rgba(80, 160, 255, 0.0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  _dropletTexture = new THREE.CanvasTexture(canvas);
  return _dropletTexture;
}

export class SprinklerRenderer {
  constructor(scene) {
    this.scene = scene;
    this.sprinklerMeshes = new Map();
  }

  build(sprinklers) {
    for (const s of sprinklers) {
      this.addSprinkler(s);
    }
  }

  addSprinkler(data) {
    const group = new THREE.Group();
    const tierColor = TIER_COLOR[data.type] ?? 0x888888;
    const isIridium = data.type === 'sprinkler_iridium';
    const range = SPRAY_RANGE[data.type] ?? 0.3;

    // --- Improved base cylinder ---
    const baseGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.12, 8);
    const baseMat = new THREE.MeshPhongMaterial({
      color: tierColor,
      shininess: 80,
      specular: 0x444444,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.06;
    group.add(base);

    // --- Collar ring between base and nozzle ---
    const collarGeo = new THREE.TorusGeometry(0.06, 0.015, 6, 8);
    const collarMat = new THREE.MeshPhongMaterial({
      color: tierColor,
      shininess: 90,
      specular: 0x666666,
    });
    const collar = new THREE.Mesh(collarGeo, collarMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.12;
    group.add(collar);

    // --- Nozzle (rotates) ---
    const nozzleGroup = new THREE.Group();
    nozzleGroup.position.y = NOZZLE_Y;

    const nozzleGeo = new THREE.CylinderGeometry(0.02, 0.04, 0.06, 8);
    const nozzleMat = new THREE.MeshPhongMaterial({
      color: tierColor,
      shininess: 80,
      specular: 0x444444,
    });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzleGroup.add(nozzle);

    // Iridium emissive glow dot on top of nozzle
    if (isIridium) {
      const glowGeo = new THREE.SphereGeometry(0.015, 8, 8);
      const glowMat = new THREE.MeshPhongMaterial({
        color: 0xcc66ff,
        emissive: 0xaa44dd,
        emissiveIntensity: 0.8,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.y = 0.035;
      nozzleGroup.add(glow);
    }

    group.add(nozzleGroup);

    // --- Water spray particle system ---
    const particleCount = PARTICLES_PER_SPRINKLER;
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    // Per-particle state arrays (not uploaded to GPU, used in update)
    const velocities = new Float32Array(particleCount * 3);
    const lifetimes = new Float32Array(particleCount);
    const ages = new Float32Array(particleCount);

    // Initialize particles staggered across their lifecycle
    for (let i = 0; i < particleCount; i++) {
      this._initParticle(i, positions, velocities, lifetimes, ages, range, true);
    }

    const sprayGeo = new THREE.BufferGeometry();
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    sprayGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const sprayMat = new THREE.PointsMaterial({
      map: getDropletTexture(),
      color: 0x88ccff,
      size: 0.03,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    const spray = new THREE.Points(sprayGeo, sprayMat);
    // Spray is in local group space, particles positioned relative to group origin
    spray.position.y = 0;
    group.add(spray);

    // --- Position the group in world space ---
    const wx = data.tileX * TILE_SIZE + TILE_SIZE / 2;
    const wz = data.tileZ * TILE_SIZE + TILE_SIZE / 2;
    group.position.set(wx, 0, wz);

    this.scene.add(group);

    this.sprinklerMeshes.set(data.id, {
      mesh: group,
      data,
      nozzleGroup,
      spray,
      sprayGeo,
      positions,
      velocities,
      lifetimes,
      ages,
      sizes,
      range,
      nozzleAngle: Math.random() * Math.PI * 2,
      shimmerTime: Math.random() * 10,
    });
  }

  /**
   * Initialize or reset a single particle.
   * When stagger=true, particles start at random points in their lifecycle for a filled-out look.
   */
  _initParticle(i, positions, velocities, lifetimes, ages, range, stagger) {
    const lifetime = PARTICLE_LIFE_MIN + Math.random() * (PARTICLE_LIFE_MAX - PARTICLE_LIFE_MIN);
    lifetimes[i] = lifetime;
    ages[i] = stagger ? Math.random() * lifetime : 0;

    // Random radial direction
    const angle = Math.random() * Math.PI * 2;
    const radialSpeed = (0.3 + Math.random() * 0.7) * range / PARTICLE_LIFE_MAX;
    const upSpeed = UPWARD_SPEED_MIN + Math.random() * (UPWARD_SPEED_MAX - UPWARD_SPEED_MIN);

    velocities[i * 3] = Math.cos(angle) * radialSpeed;
    velocities[i * 3 + 1] = upSpeed;
    velocities[i * 3 + 2] = Math.sin(angle) * radialSpeed;

    // Start at nozzle top
    if (stagger) {
      // Simulate forward to the current age for a pre-filled look
      const t = ages[i];
      positions[i * 3] = velocities[i * 3] * t;
      positions[i * 3 + 1] = NOZZLE_Y + velocities[i * 3 + 1] * t + 0.5 * GRAVITY * t * t;
      positions[i * 3 + 2] = velocities[i * 3 + 2] * t;
      // Clamp to ground
      if (positions[i * 3 + 1] < 0) {
        positions[i * 3 + 1] = 0;
        ages[i] = lifetime; // will be respawned next frame
      }
    } else {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = NOZZLE_Y;
      positions[i * 3 + 2] = 0;
    }
  }

  /**
   * Called each frame from the render loop.
   * Animates water spray particles and nozzle rotation.
   */
  update(delta) {
    // Clamp delta to avoid huge jumps on tab-refocus
    const dt = Math.min(delta, 0.1);

    for (const [, entry] of this.sprinklerMeshes) {
      const {
        nozzleGroup,
        positions,
        velocities,
        lifetimes,
        ages,
        sizes,
        range,
        sprayGeo,
        spray,
      } = entry;

      // --- Rotate nozzle ---
      entry.nozzleAngle += dt * 1.5;
      nozzleGroup.rotation.y = entry.nozzleAngle;

      // --- Shimmer time for subtle glint ---
      entry.shimmerTime += dt;
      const shimmerPhase = entry.shimmerTime;

      // --- Update each particle ---
      const count = PARTICLES_PER_SPRINKLER;
      for (let i = 0; i < count; i++) {
        ages[i] += dt;

        if (ages[i] >= lifetimes[i] || positions[i * 3 + 1] < 0) {
          // Respawn at nozzle
          this._initParticle(i, positions, velocities, lifetimes, ages, range, false);
          continue;
        }

        // Integrate position
        const t = ages[i];
        const vx = velocities[i * 3];
        const vy0 = velocities[i * 3 + 1];
        const vz = velocities[i * 3 + 2];

        positions[i * 3] = vx * t;
        positions[i * 3 + 1] = NOZZLE_Y + vy0 * t + 0.5 * GRAVITY * t * t;
        positions[i * 3 + 2] = vz * t;

        // Ground clamp: if below ground, will be reset next frame
        if (positions[i * 3 + 1] < 0) {
          positions[i * 3 + 1] = 0;
        }

        // Size varies over lifetime: grow then shrink, with shimmer
        const lifeRatio = t / lifetimes[i];
        const baseSize = lifeRatio < 0.2
          ? lifeRatio / 0.2
          : 1.0 - (lifeRatio - 0.2) / 0.8;
        // Subtle per-particle shimmer
        const shimmer = 0.85 + 0.15 * Math.sin(shimmerPhase * 8 + i * 1.7);
        sizes[i] = (0.02 + 0.02 * baseSize) * shimmer;
      }

      // Upload updated attributes to GPU
      sprayGeo.attributes.position.needsUpdate = true;
      sprayGeo.attributes.size.needsUpdate = true;

      // Subtle opacity shimmer on the whole spray
      const opShimmer = 0.5 + 0.1 * Math.sin(shimmerPhase * 3);
      spray.material.opacity = opShimmer;
    }
  }

  removeSprinkler(id) {
    const entry = this.sprinklerMeshes.get(id);
    if (entry) {
      this.scene.remove(entry.mesh);
      entry.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map && child.material.map !== _dropletTexture) {
            child.material.map.dispose();
          }
          child.material.dispose();
        }
      });
      this.sprinklerMeshes.delete(id);
    }
  }

  dispose() {
    for (const [id] of this.sprinklerMeshes) {
      this.removeSprinkler(id);
    }
  }
}
