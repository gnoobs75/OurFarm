// client/src/world/ActionEffects.js
// Pool-based particle effect system for player action feedback.
// Uses a single Points mesh with a shared buffer to avoid per-particle draw calls.

import * as THREE from 'three';

const MAX_PARTICLES = 200;
const GRAVITY = -2.5;

// --- Custom shader for per-particle color, size, and opacity fade ---
const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;

  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;

  void main() {
    // Soft circle shape
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float softEdge = 1.0 - smoothstep(0.3, 0.5, d);
    gl_FragColor = vec4(vColor, vAlpha * softEdge);
  }
`;

export class ActionEffects {
  constructor(scene) {
    this.scene = scene;

    // Per-particle lifecycle data (CPU side)
    this._particles = new Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this._particles[i] = {
        alive: false,
        age: 0,
        maxAge: 0,
        vx: 0, vy: 0, vz: 0,
        gravityScale: 1,
      };
    }

    // GPU buffer attributes
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    const sizes = new Float32Array(MAX_PARTICLES);
    const alphas = new Float32Array(MAX_PARTICLES);

    // Initialize all particles offscreen / invisible
    for (let i = 0; i < MAX_PARTICLES; i++) {
      positions[i * 3 + 0] = 0;
      positions[i * 3 + 1] = -100; // hidden below ground
      positions[i * 3 + 2] = 0;
      colors[i * 3 + 0] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
      sizes[i] = 0;
      alphas[i] = 0;
    }

    this._geometry = new THREE.BufferGeometry();
    this._geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this._geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this._geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this._geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

    this._material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._points = new THREE.Points(this._geometry, this._material);
    this._points.frustumCulled = false;
    this.scene.add(this._points);
  }

  // ------------------------------------------------------------------
  // Pool helpers
  // ------------------------------------------------------------------

  /** Find the next dead particle slot, or -1 if pool is full. */
  _allocate() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!this._particles[i].alive) return i;
    }
    return -1;
  }

  /** Spawn a single particle into the pool. */
  _spawn(x, y, z, vx, vy, vz, color, size, maxAge, gravityScale = 1) {
    const idx = this._allocate();
    if (idx === -1) return; // pool exhausted — silently skip

    const p = this._particles[idx];
    p.alive = true;
    p.age = 0;
    p.maxAge = maxAge;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.gravityScale = gravityScale;

    // Position
    const pos = this._geometry.attributes.position;
    pos.array[idx * 3 + 0] = x;
    pos.array[idx * 3 + 1] = y;
    pos.array[idx * 3 + 2] = z;

    // Color (THREE.Color helper)
    const c = _tmpColor.set(color);
    const col = this._geometry.attributes.aColor;
    col.array[idx * 3 + 0] = c.r;
    col.array[idx * 3 + 1] = c.g;
    col.array[idx * 3 + 2] = c.b;

    // Size & alpha
    this._geometry.attributes.aSize.array[idx] = size;
    this._geometry.attributes.aAlpha.array[idx] = 1;
  }

  // ------------------------------------------------------------------
  // Public spawn methods
  // ------------------------------------------------------------------

  /**
   * Golden / green sparkles burst upward when a crop is harvested.
   * @param {number} x - tile x coordinate (world units, tile center)
   * @param {number} z - tile z coordinate (world units, tile center)
   */
  spawnHarvest(x, z) {
    const count = 15 + Math.floor(Math.random() * 6); // 15-20
    for (let i = 0; i < count; i++) {
      const color = Math.random() < 0.7 ? 0xffd700 : 0x88cc44;
      const size = 0.03 + Math.random() * 0.03;
      const angle = Math.random() * Math.PI * 2;
      const spread = 0.3 + Math.random() * 0.4;
      const vx = Math.cos(angle) * spread;
      const vz = Math.sin(angle) * spread;
      const vy = 1.2 + Math.random() * 0.8;
      const maxAge = 0.5 + Math.random() * 0.2; // ~0.6s
      this._spawn(x, 0.15, z, vx, vy, vz, color, size, maxAge, 1);
    }
  }

  /**
   * Brown dust puff when hoeing, mining, or chopping.
   * @param {number} x - world x (tile center)
   * @param {number} z - world z (tile center)
   */
  spawnToolHit(x, z) {
    const count = 8 + Math.floor(Math.random() * 5); // 8-12
    for (let i = 0; i < count; i++) {
      const color = Math.random() < 0.5 ? 0x8b7355 : 0xb0a080;
      const size = 0.04 + Math.random() * 0.04;
      const angle = Math.random() * Math.PI * 2;
      const spread = 0.4 + Math.random() * 0.5;
      const vx = Math.cos(angle) * spread;
      const vz = Math.sin(angle) * spread;
      const vy = 0.3 + Math.random() * 0.3; // mostly horizontal, slight upward
      const maxAge = 0.35 + Math.random() * 0.1; // ~0.4s
      this._spawn(x, 0.05, z, vx, vy, vz, color, size, maxAge, 0.5);
    }
  }

  /**
   * Light blue water droplets spray when watering.
   * @param {number} x - world x (tile center)
   * @param {number} z - world z (tile center)
   */
  spawnWatering(x, z) {
    const count = 6 + Math.floor(Math.random() * 5); // 6-10
    for (let i = 0; i < count; i++) {
      const color = 0x88bbff;
      const size = 0.02 + Math.random() * 0.02;
      const angle = Math.random() * Math.PI * 2;
      const spread = 0.2 + Math.random() * 0.3;
      const vx = Math.cos(angle) * spread;
      const vz = Math.sin(angle) * spread;
      const vy = 0.6 + Math.random() * 0.4; // small upward spray
      const maxAge = 0.25 + Math.random() * 0.1; // ~0.3s
      this._spawn(x, 0.2, z, vx, vy, vz, color, size, maxAge, 1.5); // extra gravity → arcs down
    }
  }

  /**
   * Small brown dirt poof when planting seeds.
   * @param {number} x - world x (tile center)
   * @param {number} z - world z (tile center)
   */
  spawnPlanting(x, z) {
    const count = 5 + Math.floor(Math.random() * 4); // 5-8
    for (let i = 0; i < count; i++) {
      const color = 0x5c4a1e;
      const size = 0.03 + Math.random() * 0.02;
      const angle = Math.random() * Math.PI * 2;
      const spread = 0.2 + Math.random() * 0.25;
      const vx = Math.cos(angle) * spread;
      const vz = Math.sin(angle) * spread;
      const vy = 0.2 + Math.random() * 0.2; // low outward spread
      const maxAge = 0.25 + Math.random() * 0.1; // ~0.3s
      this._spawn(x, 0.05, z, vx, vy, vz, color, size, maxAge, 0.8);
    }
  }

  // ------------------------------------------------------------------
  // Per-frame update
  // ------------------------------------------------------------------

  /**
   * Advance all live particles: integrate velocity, apply gravity, fade opacity.
   * @param {number} delta - seconds since last frame
   */
  update(delta) {
    const pos = this._geometry.attributes.position;
    const alphas = this._geometry.attributes.aAlpha;
    let anyAlive = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this._particles[i];
      if (!p.alive) continue;

      p.age += delta;
      if (p.age >= p.maxAge) {
        // Kill particle — hide it
        p.alive = false;
        pos.array[i * 3 + 1] = -100;
        alphas.array[i] = 0;
        continue;
      }

      anyAlive = true;
      const t = p.age / p.maxAge; // 0→1 normalized lifetime

      // Integrate velocity
      pos.array[i * 3 + 0] += p.vx * delta;
      pos.array[i * 3 + 1] += p.vy * delta;
      pos.array[i * 3 + 2] += p.vz * delta;

      // Apply gravity to vy
      p.vy += GRAVITY * p.gravityScale * delta;

      // Fade alpha: full brightness for first 30%, then fade to 0
      alphas.array[i] = t < 0.3 ? 1.0 : 1.0 - ((t - 0.3) / 0.7);
    }

    // Only flag needsUpdate when there are live particles (minor perf win)
    if (anyAlive) {
      pos.needsUpdate = true;
      alphas.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------

  dispose() {
    this.scene.remove(this._points);
    this._geometry.dispose();
    this._material.dispose();
  }
}

// Reusable scratch Color to avoid allocations in hot spawn path
const _tmpColor = new THREE.Color();
