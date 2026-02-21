// client/src/world/AmbientCreatureRenderer.js
// Client-side ambient creatures: birds, butterflies, fish jumps.
// Purely visual — no server involvement. Makes the world feel alive.

import * as THREE from 'three';
import { TILE_SIZE, TILE_TYPES } from '@shared/constants.js';

const BIRD_COUNT = 10;
const BUTTERFLY_COUNT = 12;
const FISH_SPOT_COUNT = 4;

const BIRD_FLEE_DIST = 3;
const BUTTERFLY_FLEE_DIST = 2;

const BIRD_COLORS = [0x8b6b4a, 0x6b5a3a, 0x7a6a5a, 0x554433];
const BUTTERFLY_COLORS = [0xffdd44, 0xff8844, 0xffffff, 0x88ccff, 0xff88cc, 0xaaffaa];

export class AmbientCreatureRenderer {
  constructor(scene, tiles) {
    this.scene = scene;
    this._elapsed = 0;

    // Classify tile positions
    this._grassTiles = [];
    this._waterTiles = [];
    this._flowerTiles = []; // grass tiles that could have flowers (near center-ish)

    for (const tile of tiles) {
      if (tile.type === TILE_TYPES.GRASS) {
        this._grassTiles.push(tile);
        // Use same seeded rand as decoration generator to guess flower spots
        const n = Math.sin(tile.x * 127.1 + tile.z * 311.7) * 43758.5453;
        const r = n - Math.floor(n);
        if (r > 0.08 && r < 0.16) {
          this._flowerTiles.push(tile);
        }
      } else if (tile.type === TILE_TYPES.WATER) {
        this._waterTiles.push(tile);
      }
    }

    // Create creatures
    this._birds = [];
    this._butterflies = [];
    this._fishSpots = [];
    this._meshes = [];

    this._spawnBirds();
    this._spawnButterflies();
    this._initFishSpots();
  }

  // ═══════════════════════════════════════════════
  //  BIRDS
  // ═══════════════════════════════════════════════

  _spawnBirds() {
    const count = Math.min(BIRD_COUNT, this._grassTiles.length);
    for (let i = 0; i < count; i++) {
      const tile = this._grassTiles[Math.floor(Math.random() * this._grassTiles.length)];
      const color = BIRD_COLORS[i % BIRD_COLORS.length];

      // V-shape bird: two angled planes
      const group = new THREE.Group();

      const wingGeo = new THREE.PlaneGeometry(0.08, 0.03);
      const mat = new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide });

      const leftWing = new THREE.Mesh(wingGeo, mat);
      leftWing.position.set(-0.03, 0, 0);
      leftWing.rotation.z = 0.4;
      group.add(leftWing);

      const rightWing = new THREE.Mesh(wingGeo, mat);
      rightWing.position.set(0.03, 0, 0);
      rightWing.rotation.z = -0.4;
      group.add(rightWing);

      // Tiny body dot
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 4, 3),
        mat
      );
      group.add(body);

      const wx = tile.x * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * 0.5;
      const wz = tile.z * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * 0.5;
      group.position.set(wx, 0.05, wz);
      group.scale.setScalar(0.8 + Math.random() * 0.4);

      this.scene.add(group);
      this._meshes.push(group);

      this._birds.push({
        mesh: group,
        leftWing,
        rightWing,
        state: 'idle', // idle | flying | landing
        idleTimer: Math.random() * 4,
        hopTimer: 1 + Math.random() * 3,
        targetPos: null,
        flyProgress: 0,
        startPos: new THREE.Vector3(wx, 0.05, wz),
        bobPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  _updateBirds(delta, playerPos) {
    for (const bird of this._birds) {
      const pos = bird.mesh.position;

      if (bird.state === 'idle') {
        // Bob gently
        bird.bobPhase += delta * 2;
        pos.y = 0.05 + Math.sin(bird.bobPhase) * 0.01;

        // Occasional hop
        bird.hopTimer -= delta;
        if (bird.hopTimer <= 0) {
          bird.hopTimer = 2 + Math.random() * 4;
          pos.x += (Math.random() - 0.5) * 0.3;
          pos.z += (Math.random() - 0.5) * 0.3;
        }

        // Wings flat when idle
        bird.leftWing.rotation.z = 0.3;
        bird.rightWing.rotation.z = -0.3;

        // Check flee
        if (playerPos) {
          const dx = pos.x - playerPos.x;
          const dz = pos.z - playerPos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < BIRD_FLEE_DIST) {
            this._birdStartFlee(bird, playerPos);
          }
        }
      } else if (bird.state === 'flying') {
        bird.flyProgress += delta * 1.2;

        if (bird.flyProgress >= 1) {
          // Arrived
          pos.copy(bird.targetPos);
          pos.y = 0.05;
          bird.state = 'idle';
          bird.hopTimer = 2 + Math.random() * 3;
        } else {
          // Lerp with arc
          const t = bird.flyProgress;
          pos.lerpVectors(bird.startPos, bird.targetPos, t);
          pos.y = 0.05 + Math.sin(t * Math.PI) * 2; // arc height
        }

        // Wing flap while flying
        const flapAngle = Math.sin(this._elapsed * 15) * 0.6;
        bird.leftWing.rotation.z = 0.3 + flapAngle;
        bird.rightWing.rotation.z = -0.3 - flapAngle;

        // Face direction of travel
        if (bird.targetPos) {
          bird.mesh.lookAt(bird.targetPos.x, pos.y, bird.targetPos.z);
        }
      }
    }
  }

  _birdStartFlee(bird, playerPos) {
    bird.state = 'flying';
    bird.flyProgress = 0;
    bird.startPos.copy(bird.mesh.position);

    // Flee away from player
    const dx = bird.mesh.position.x - playerPos.x;
    const dz = bird.mesh.position.z - playerPos.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const dist = 8 + Math.random() * 7;

    bird.targetPos = new THREE.Vector3(
      bird.mesh.position.x + (dx / len) * dist + (Math.random() - 0.5) * 4,
      0.05,
      bird.mesh.position.z + (dz / len) * dist + (Math.random() - 0.5) * 4
    );
    // Clamp to world bounds
    bird.targetPos.x = Math.max(1, Math.min(63, bird.targetPos.x));
    bird.targetPos.z = Math.max(1, Math.min(63, bird.targetPos.z));
  }

  // ═══════════════════════════════════════════════
  //  BUTTERFLIES
  // ═══════════════════════════════════════════════

  _spawnButterflies() {
    const sourceTiles = this._flowerTiles.length > 0 ? this._flowerTiles : this._grassTiles;
    const count = Math.min(BUTTERFLY_COUNT, sourceTiles.length);

    for (let i = 0; i < count; i++) {
      const tile = sourceTiles[Math.floor(Math.random() * sourceTiles.length)];
      const color = BUTTERFLY_COLORS[i % BUTTERFLY_COLORS.length];

      const group = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide });

      // Two tiny wing planes
      const wingGeo = new THREE.PlaneGeometry(0.04, 0.03);
      const leftWing = new THREE.Mesh(wingGeo, mat);
      leftWing.position.set(-0.015, 0, 0);
      leftWing.rotation.y = 0.5;
      group.add(leftWing);

      const rightWing = new THREE.Mesh(wingGeo, mat);
      rightWing.position.set(0.015, 0, 0);
      rightWing.rotation.y = -0.5;
      group.add(rightWing);

      const wx = tile.x * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5);
      const wz = tile.z * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5);
      const wy = 0.2 + Math.random() * 0.3;
      group.position.set(wx, wy, wz);
      group.scale.setScalar(0.6 + Math.random() * 0.4);

      this.scene.add(group);
      this._meshes.push(group);

      this._butterflies.push({
        mesh: group,
        leftWing,
        rightWing,
        phase: Math.random() * Math.PI * 2,
        driftAngle: Math.random() * Math.PI * 2,
        driftSpeed: 0.3 + Math.random() * 0.3,
        baseY: wy,
        fleeing: false,
        fleeTimer: 0,
      });
    }
  }

  _updateButterflies(delta, playerPos) {
    for (const bf of this._butterflies) {
      const pos = bf.mesh.position;
      bf.phase += delta * 3;

      // Wing flutter
      const flapAngle = Math.sin(bf.phase * 3) * 0.7;
      bf.leftWing.rotation.y = 0.3 + flapAngle;
      bf.rightWing.rotation.y = -0.3 - flapAngle;

      if (bf.fleeing) {
        bf.fleeTimer -= delta;
        // Faster movement while fleeing
        bf.driftAngle += delta * 2;
        pos.x += Math.cos(bf.driftAngle) * delta * 2;
        pos.z += Math.sin(bf.driftAngle) * delta * 2;
        pos.y = bf.baseY + Math.sin(bf.phase) * 0.15;

        if (bf.fleeTimer <= 0) {
          bf.fleeing = false;
          bf.baseY = 0.2 + Math.random() * 0.3;
        }
      } else {
        // Lazy spiral drift
        bf.driftAngle += delta * 0.5;
        pos.x += Math.cos(bf.driftAngle) * delta * bf.driftSpeed * 0.3;
        pos.z += Math.sin(bf.driftAngle) * delta * bf.driftSpeed * 0.3;
        pos.y = bf.baseY + Math.sin(bf.phase) * 0.08;

        // Check flee
        if (playerPos) {
          const dx = pos.x - playerPos.x;
          const dz = pos.z - playerPos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < BUTTERFLY_FLEE_DIST) {
            bf.fleeing = true;
            bf.fleeTimer = 1.5 + Math.random();
            bf.driftAngle = Math.atan2(dz, dx); // flee direction: away from player
            bf.driftSpeed = 1.5;
          }
        }
      }

      // Keep in bounds
      pos.x = Math.max(1, Math.min(63, pos.x));
      pos.z = Math.max(1, Math.min(63, pos.z));
    }
  }

  // ═══════════════════════════════════════════════
  //  FISH JUMPS
  // ═══════════════════════════════════════════════

  _initFishSpots() {
    const count = Math.min(FISH_SPOT_COUNT, this._waterTiles.length);
    if (count === 0) return;

    const fishMat = new THREE.MeshLambertMaterial({ color: 0x8899bb, flatShading: true });
    const splashMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.8 });

    for (let i = 0; i < count; i++) {
      const tile = this._waterTiles[Math.floor(Math.random() * this._waterTiles.length)];

      // Fish body: tiny elongated sphere
      const fishGeo = new THREE.SphereGeometry(0.04, 4, 3);
      const fishMesh = new THREE.Mesh(fishGeo, fishMat);
      fishMesh.scale.set(1, 0.6, 2);
      fishMesh.visible = false;

      // Splash particles: 3 tiny spheres
      const splashGroup = new THREE.Group();
      for (let s = 0; s < 3; s++) {
        const splash = new THREE.Mesh(
          new THREE.SphereGeometry(0.02, 4, 3),
          splashMat.clone()
        );
        splash.position.set((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1);
        splashGroup.add(splash);
      }
      splashGroup.visible = false;

      const wx = tile.x * TILE_SIZE + TILE_SIZE / 2;
      const wz = tile.z * TILE_SIZE + TILE_SIZE / 2;
      fishMesh.position.set(wx, -0.1, wz);
      splashGroup.position.set(wx, -0.1, wz);

      this.scene.add(fishMesh);
      this.scene.add(splashGroup);
      this._meshes.push(fishMesh);
      this._meshes.push(splashGroup);

      this._fishSpots.push({
        fishMesh,
        splashGroup,
        wx, wz,
        timer: 5 + Math.random() * 10, // time until next jump
        jumping: false,
        jumpProgress: 0,
        jumpDuration: 0.8,
      });
    }
  }

  _updateFish(delta) {
    for (const spot of this._fishSpots) {
      if (spot.jumping) {
        spot.jumpProgress += delta / spot.jumpDuration;

        if (spot.jumpProgress >= 1) {
          // Jump complete
          spot.jumping = false;
          spot.fishMesh.visible = false;
          spot.splashGroup.visible = false;
          spot.timer = 5 + Math.random() * 10;

          // Move to a new random water tile for next jump
          if (this._waterTiles.length > 0) {
            const tile = this._waterTiles[Math.floor(Math.random() * this._waterTiles.length)];
            spot.wx = tile.x * TILE_SIZE + TILE_SIZE / 2;
            spot.wz = tile.z * TILE_SIZE + TILE_SIZE / 2;
          }
        } else {
          const t = spot.jumpProgress;
          // Fish arc
          const arcY = Math.sin(t * Math.PI) * 0.4;
          spot.fishMesh.position.set(spot.wx, -0.1 + arcY, spot.wz);
          spot.fishMesh.rotation.z = t * Math.PI * 1.5; // flip rotation

          // Splash at start and end
          if (t < 0.15 || t > 0.85) {
            spot.splashGroup.visible = true;
            spot.splashGroup.position.set(spot.wx, -0.05, spot.wz);
            // Scale splash particles
            const splashScale = t < 0.15 ? t / 0.15 : (1 - t) / 0.15;
            spot.splashGroup.children.forEach((s, i) => {
              s.scale.setScalar(splashScale);
              s.position.y = splashScale * 0.08 * (i + 1);
            });
          } else {
            spot.splashGroup.visible = false;
          }
        }
      } else {
        spot.timer -= delta;
        if (spot.timer <= 0) {
          spot.jumping = true;
          spot.jumpProgress = 0;
          spot.fishMesh.visible = true;
          spot.fishMesh.position.set(spot.wx, -0.1, spot.wz);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════
  //  UPDATE / DISPOSE
  // ═══════════════════════════════════════════════

  update(delta, playerPos) {
    this._elapsed += delta;
    this._updateBirds(delta, playerPos);
    this._updateButterflies(delta, playerPos);
    this._updateFish(delta);
  }

  dispose() {
    for (const mesh of this._meshes) {
      this.scene.remove(mesh);
      mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.dispose) child.material.dispose();
        }
      });
    }
    this._meshes = [];
    this._birds = [];
    this._butterflies = [];
    this._fishSpots = [];
  }
}
