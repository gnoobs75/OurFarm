// client/src/world/AmbientCreatureRenderer.js
// Client-side ambient creatures: birds, butterflies, fish jumps,
// dragonflies, frogs, fireflies, rabbits.
// Purely visual — no server involvement. Makes the world feel alive.

import * as THREE from 'three';
import { TILE_SIZE, TILE_TYPES } from '@shared/constants.js';

const BIRD_COUNT = 10;
const BUTTERFLY_COUNT = 12;
const FISH_SPOT_COUNT = 4;
const DRAGONFLY_COUNT = 6;
const FROG_COUNT = 4;
const FIREFLY_COUNT = 15;
const RABBIT_COUNT = 3;

const BIRD_FLEE_DIST = 3;
const BUTTERFLY_FLEE_DIST = 2;
const FROG_FLEE_DIST = 2.5;
const RABBIT_FLEE_DIST = 4;

const BIRD_COLORS = [0x8b6b4a, 0x6b5a3a, 0x7a6a5a, 0x554433];
const BUTTERFLY_COLORS = [0xffdd44, 0xff8844, 0xffffff, 0x88ccff, 0xff88cc, 0xaaffaa];
const DRAGONFLY_COLORS = [0x33bbaa, 0x44aa88, 0x2299cc, 0x55ccbb];
const FROG_COLORS = [0x4a8a3a, 0x3d7a2e, 0x558844, 0x6b9955];
const RABBIT_COLORS = [0xccbb99, 0xffffff, 0x998877];

export class AmbientCreatureRenderer {
  constructor(scene, tiles) {
    this.scene = scene;
    this._elapsed = 0;

    // Classify tile positions
    this._grassTiles = [];
    this._waterTiles = [];
    this._sandTiles = [];
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
      } else if (tile.type === TILE_TYPES.SAND) {
        this._sandTiles.push(tile);
      }
    }

    // Create creatures
    this._birds = [];
    this._butterflies = [];
    this._fishSpots = [];
    this._dragonflies = [];
    this._frogs = [];
    this._fireflies = [];
    this._rabbits = [];
    this._meshes = [];

    this._spawnBirds();
    this._spawnButterflies();
    this._initFishSpots();
    this._spawnDragonflies();
    this._spawnFrogs();
    this._spawnFireflies();
    this._spawnRabbits();
  }

  // ═══════════════════════════════════════════════
  //  BIRDS
  // ═══════════════════════════════════════════════

  _spawnBirds() {
    const count = Math.min(BIRD_COUNT, this._grassTiles.length);
    for (let i = 0; i < count; i++) {
      const tile = this._grassTiles[Math.floor(Math.random() * this._grassTiles.length)];
      const color = BIRD_COLORS[i % BIRD_COLORS.length];

      // V-shape bird: two angled planes + body + beak
      const group = new THREE.Group();

      const wingGeo = new THREE.PlaneGeometry(0.08, 0.03);
      const mat = new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide });

      const leftWing = new THREE.Mesh(wingGeo, mat);
      leftWing.position.set(-0.03, 0, 0);
      leftWing.rotation.z = 0.4;
      group.add(leftWing);

      const rightWing = new THREE.Mesh(wingGeo, mat);
      rightWing.position.set(0.03, 0, 0);
      rightWing.rotation.z = -0.4;
      group.add(rightWing);

      // Body (slightly larger)
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 4, 3),
        mat
      );
      group.add(body);

      // Tiny beak (small cone pointing forward, orange)
      const beakMat = new THREE.MeshPhongMaterial({ color: 0xff8800 });
      const beak = new THREE.Mesh(
        new THREE.ConeGeometry(0.006, 0.02, 4),
        beakMat
      );
      beak.rotation.x = -Math.PI / 2; // point forward
      beak.position.set(0, 0, -0.025);
      group.add(beak);

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
      const mat = new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide });

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

    const fishMat = new THREE.MeshPhongMaterial({ color: 0x8899bb });
    const splashMat = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });

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
  //  DRAGONFLIES
  // ═══════════════════════════════════════════════

  _spawnDragonflies() {
    const count = Math.min(DRAGONFLY_COUNT, this._waterTiles.length);
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const tile = this._waterTiles[Math.floor(Math.random() * this._waterTiles.length)];
      const color = DRAGONFLY_COLORS[i % DRAGONFLY_COLORS.length];

      const group = new THREE.Group();

      // Elongated thin body (small cylinder, iridescent blue/green)
      const bodyMat = new THREE.MeshPhongMaterial({ color, shininess: 80 });
      const bodyGeo = new THREE.CylinderGeometry(0.004, 0.003, 0.06, 4);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.rotation.x = Math.PI / 2; // orient along z-axis
      group.add(body);

      // Head (tiny sphere at front)
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.006, 4, 3),
        bodyMat
      );
      head.position.set(0, 0, -0.035);
      group.add(head);

      // 4 transparent wings (2 pairs)
      const wingMat = new THREE.MeshPhongMaterial({
        color: 0xddffff,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });

      // Front pair (slightly larger)
      const frontWingGeo = new THREE.PlaneGeometry(0.04, 0.01);
      const frontLeft = new THREE.Mesh(frontWingGeo, wingMat);
      frontLeft.position.set(-0.015, 0.002, -0.01);
      frontLeft.rotation.z = 0.1;
      group.add(frontLeft);

      const frontRight = new THREE.Mesh(frontWingGeo, wingMat);
      frontRight.position.set(0.015, 0.002, -0.01);
      frontRight.rotation.z = -0.1;
      group.add(frontRight);

      // Rear pair (slightly smaller)
      const rearWingGeo = new THREE.PlaneGeometry(0.035, 0.008);
      const rearLeft = new THREE.Mesh(rearWingGeo, wingMat);
      rearLeft.position.set(-0.013, 0.002, 0.008);
      rearLeft.rotation.z = 0.1;
      group.add(rearLeft);

      const rearRight = new THREE.Mesh(rearWingGeo, wingMat);
      rearRight.position.set(0.013, 0.002, 0.008);
      rearRight.rotation.z = -0.1;
      group.add(rearRight);

      const wx = tile.x * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * 0.5;
      const wz = tile.z * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * 0.5;
      const wy = 0.25 + Math.random() * 0.2;
      group.position.set(wx, wy, wz);
      group.scale.setScalar(1.0 + Math.random() * 0.3);

      this.scene.add(group);
      this._meshes.push(group);

      this._dragonflies.push({
        mesh: group,
        wings: [frontLeft, frontRight, rearLeft, rearRight],
        state: 'hover', // hover | darting
        hoverCenter: new THREE.Vector3(wx, wy, wz),
        hoverPhase: Math.random() * Math.PI * 2,
        dartTimer: 2 + Math.random() * 5,
        dartTarget: null,
        dartProgress: 0,
        dartStart: new THREE.Vector3(),
        baseY: wy,
      });
    }
  }

  _updateDragonflies(delta) {
    for (const df of this._dragonflies) {
      const pos = df.mesh.position;

      // High-frequency wing buzz
      const buzzAngle = Math.sin(this._elapsed * 40 + df.hoverPhase) * 0.3;
      for (let w = 0; w < df.wings.length; w++) {
        const sign = (w % 2 === 0) ? 1 : -1;
        df.wings[w].rotation.z = sign * 0.1 + buzzAngle * sign;
      }

      if (df.state === 'hover') {
        // Gentle hover oscillation around center point
        df.hoverPhase += delta * 2;
        pos.x = df.hoverCenter.x + Math.sin(df.hoverPhase * 0.7) * 0.08;
        pos.z = df.hoverCenter.z + Math.cos(df.hoverPhase * 0.9) * 0.08;
        pos.y = df.baseY + Math.sin(df.hoverPhase * 1.3) * 0.03;

        // Occasional dart
        df.dartTimer -= delta;
        if (df.dartTimer <= 0) {
          df.state = 'darting';
          df.dartProgress = 0;
          df.dartStart.copy(pos);

          // Pick a new nearby position to dart to
          const angle = Math.random() * Math.PI * 2;
          const dist = 0.5 + Math.random() * 1.5;
          df.dartTarget = new THREE.Vector3(
            pos.x + Math.cos(angle) * dist,
            df.baseY + (Math.random() - 0.5) * 0.1,
            pos.z + Math.sin(angle) * dist
          );
          df.dartTarget.x = Math.max(1, Math.min(63, df.dartTarget.x));
          df.dartTarget.z = Math.max(1, Math.min(63, df.dartTarget.z));
        }
      } else if (df.state === 'darting') {
        // Fast dart to new position
        df.dartProgress += delta * 4; // fast

        if (df.dartProgress >= 1) {
          pos.copy(df.dartTarget);
          df.hoverCenter.copy(df.dartTarget);
          df.baseY = df.dartTarget.y;
          df.state = 'hover';
          df.dartTimer = 2 + Math.random() * 5;
        } else {
          const t = df.dartProgress;
          pos.lerpVectors(df.dartStart, df.dartTarget, t);
        }

        // Face direction of travel
        if (df.dartTarget) {
          df.mesh.lookAt(df.dartTarget.x, pos.y, df.dartTarget.z);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════
  //  FROGS
  // ═══════════════════════════════════════════════

  _spawnFrogs() {
    // Spawn on sand tiles (near water), or water tiles if no sand
    const sourceTiles = this._sandTiles.length > 0 ? this._sandTiles : this._waterTiles;
    const count = Math.min(FROG_COUNT, sourceTiles.length);
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const tile = sourceTiles[Math.floor(Math.random() * sourceTiles.length)];
      const color = FROG_COLORS[i % FROG_COLORS.length];
      const darkerColor = new THREE.Color(color).multiplyScalar(0.7).getHex();

      const group = new THREE.Group();

      // Body: squished sphere
      const bodyMat = new THREE.MeshPhongMaterial({ color });
      const bodyGeo = new THREE.SphereGeometry(0.035, 6, 5);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.scale.set(1, 0.6, 1.1);
      group.add(body);

      // Two back legs (darker green cylinders bent back)
      const legMat = new THREE.MeshPhongMaterial({ color: darkerColor });
      const legGeo = new THREE.CylinderGeometry(0.008, 0.006, 0.04, 4);

      const leftLeg = new THREE.Mesh(legGeo, legMat);
      leftLeg.position.set(-0.025, -0.01, 0.02);
      leftLeg.rotation.z = 0.6;
      leftLeg.rotation.x = -0.3;
      group.add(leftLeg);

      const rightLeg = new THREE.Mesh(legGeo, legMat);
      rightLeg.position.set(0.025, -0.01, 0.02);
      rightLeg.rotation.z = -0.6;
      rightLeg.rotation.x = -0.3;
      group.add(rightLeg);

      // Two bulging eyes on top
      const eyeWhite = new THREE.MeshPhongMaterial({ color: 0xeeeedd });
      const eyePupil = new THREE.MeshPhongMaterial({ color: 0x111111 });

      for (const side of [-1, 1]) {
        const eyeSocket = new THREE.Mesh(
          new THREE.SphereGeometry(0.01, 5, 4),
          eyeWhite
        );
        eyeSocket.position.set(side * 0.015, 0.025, -0.015);
        group.add(eyeSocket);

        const pupil = new THREE.Mesh(
          new THREE.SphereGeometry(0.005, 4, 3),
          eyePupil
        );
        pupil.position.set(side * 0.015, 0.03, -0.02);
        group.add(pupil);
      }

      const wx = tile.x * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * 0.4;
      const wz = tile.z * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * 0.4;
      group.position.set(wx, 0.01, wz);
      group.scale.setScalar(0.9 + Math.random() * 0.3);

      this.scene.add(group);
      this._meshes.push(group);

      this._frogs.push({
        mesh: group,
        body,
        leftLeg,
        rightLeg,
        state: 'idle', // idle | hopping | croaking
        idleTimer: 2 + Math.random() * 5,
        hopProgress: 0,
        hopStart: new THREE.Vector3(wx, 0.01, wz),
        hopTarget: null,
        croakTimer: 0,
        croakPhase: 0,
        baseScale: group.scale.x,
      });
    }
  }

  _updateFrogs(delta, playerPos) {
    for (const frog of this._frogs) {
      const pos = frog.mesh.position;

      if (frog.state === 'idle') {
        frog.idleTimer -= delta;

        if (frog.idleTimer <= 0) {
          // Decide: hop or croak
          if (Math.random() < 0.4) {
            // Start croak
            frog.state = 'croaking';
            frog.croakPhase = 0;
            frog.croakTimer = 0.6;
          } else {
            // Start hop
            this._frogStartHop(frog, null);
          }
        }

        // Check flee from player
        if (playerPos) {
          const dx = pos.x - playerPos.x;
          const dz = pos.z - playerPos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < FROG_FLEE_DIST) {
            this._frogStartHop(frog, playerPos);
          }
        }
      } else if (frog.state === 'hopping') {
        frog.hopProgress += delta * 2.5;

        if (frog.hopProgress >= 1) {
          // Land
          pos.copy(frog.hopTarget);
          pos.y = 0.01;
          frog.state = 'idle';
          frog.idleTimer = 1.5 + Math.random() * 4;
          frog.mesh.scale.setScalar(frog.baseScale);
          // Reset leg rotation
          frog.leftLeg.rotation.z = 0.6;
          frog.rightLeg.rotation.z = -0.6;
        } else {
          const t = frog.hopProgress;
          pos.lerpVectors(frog.hopStart, frog.hopTarget, t);
          pos.y = 0.01 + Math.sin(t * Math.PI) * 0.12; // short arc

          // Legs extend during hop
          const legExtend = Math.sin(t * Math.PI) * 0.5;
          frog.leftLeg.rotation.z = 0.6 - legExtend;
          frog.rightLeg.rotation.z = -0.6 + legExtend;

          // Face direction of travel
          if (frog.hopTarget) {
            frog.mesh.lookAt(frog.hopTarget.x, pos.y, frog.hopTarget.z);
          }
        }
      } else if (frog.state === 'croaking') {
        frog.croakPhase += delta * 10;
        frog.croakTimer -= delta;

        // Body inflates then deflates
        const puff = 1 + Math.sin(frog.croakPhase) * 0.15;
        frog.body.scale.set(puff, 0.6 * puff, 1.1);

        if (frog.croakTimer <= 0) {
          frog.body.scale.set(1, 0.6, 1.1);
          frog.state = 'idle';
          frog.idleTimer = 3 + Math.random() * 5;
        }
      }
    }
  }

  _frogStartHop(frog, playerPos) {
    frog.state = 'hopping';
    frog.hopProgress = 0;
    frog.hopStart.copy(frog.mesh.position);

    if (playerPos) {
      // Hop away from player
      const dx = frog.mesh.position.x - playerPos.x;
      const dz = frog.mesh.position.z - playerPos.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const dist = 1 + Math.random() * 1.5;
      frog.hopTarget = new THREE.Vector3(
        frog.mesh.position.x + (dx / len) * dist + (Math.random() - 0.5) * 0.3,
        0.01,
        frog.mesh.position.z + (dz / len) * dist + (Math.random() - 0.5) * 0.3
      );
    } else {
      // Random nearby hop
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.3 + Math.random() * 0.5;
      frog.hopTarget = new THREE.Vector3(
        frog.mesh.position.x + Math.cos(angle) * dist,
        0.01,
        frog.mesh.position.z + Math.sin(angle) * dist
      );
    }

    frog.hopTarget.x = Math.max(1, Math.min(63, frog.hopTarget.x));
    frog.hopTarget.z = Math.max(1, Math.min(63, frog.hopTarget.z));
  }

  // ═══════════════════════════════════════════════
  //  FIREFLIES
  // ═══════════════════════════════════════════════

  _spawnFireflies() {
    const count = Math.min(FIREFLY_COUNT, this._grassTiles.length);
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const tile = this._grassTiles[Math.floor(Math.random() * this._grassTiles.length)];

      // Tiny emissive sphere
      const mat = new THREE.MeshBasicMaterial({
        color: 0xccff66,
        transparent: true,
        opacity: 0.7,
      });
      const geo = new THREE.SphereGeometry(0.008, 4, 3);
      const mesh = new THREE.Mesh(geo, mat);

      const wx = tile.x * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5);
      const wz = tile.z * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5);
      const wy = 0.2 + Math.random() * 0.3;
      mesh.position.set(wx, wy, wz);

      this.scene.add(mesh);
      this._meshes.push(mesh);

      this._fireflies.push({
        mesh,
        mat,
        phase: Math.random() * Math.PI * 2, // unique glow phase
        glowSpeed: 0.8 + Math.random() * 0.6,
        driftAngle: Math.random() * Math.PI * 2,
        driftSpeed: 0.05 + Math.random() * 0.1,
        baseY: wy,
        bobPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  _updateFireflies(delta) {
    for (const ff of this._fireflies) {
      const pos = ff.mesh.position;

      // Glow pulse: sine-wave opacity/emissive intensity
      ff.phase += delta * ff.glowSpeed;
      const glow = 0.3 + Math.sin(ff.phase) * 0.5; // oscillates 0.0 to 0.8
      ff.mat.opacity = Math.max(0.05, glow);

      // Lazy random drift
      ff.driftAngle += (Math.random() - 0.5) * delta * 2;
      pos.x += Math.cos(ff.driftAngle) * delta * ff.driftSpeed;
      pos.z += Math.sin(ff.driftAngle) * delta * ff.driftSpeed;

      // Gentle vertical bob
      ff.bobPhase += delta * 0.8;
      pos.y = ff.baseY + Math.sin(ff.bobPhase) * 0.04;

      // Keep in bounds
      pos.x = Math.max(1, Math.min(63, pos.x));
      pos.z = Math.max(1, Math.min(63, pos.z));
    }
  }

  // ═══════════════════════════════════════════════
  //  RABBITS
  // ═══════════════════════════════════════════════

  _spawnRabbits() {
    const count = Math.min(RABBIT_COUNT, this._grassTiles.length);
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const tile = this._grassTiles[Math.floor(Math.random() * this._grassTiles.length)];
      const color = RABBIT_COLORS[i % RABBIT_COLORS.length];

      const group = new THREE.Group();
      const bodyMat = new THREE.MeshPhongMaterial({ color });

      // Body: slightly elongated sphere
      const bodyGeo = new THREE.SphereGeometry(0.04, 6, 5);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.scale.set(0.8, 0.9, 1.1);
      body.position.set(0, 0.03, 0);
      group.add(body);

      // Head: smaller sphere in front and up
      const headGeo = new THREE.SphereGeometry(0.025, 6, 5);
      const head = new THREE.Mesh(headGeo, bodyMat);
      head.position.set(0, 0.055, -0.035);
      group.add(head);

      // Two elongated cone ears
      const earGeo = new THREE.ConeGeometry(0.006, 0.04, 4);
      const earInnerMat = new THREE.MeshPhongMaterial({ color: 0xeeccbb });

      const leftEar = new THREE.Mesh(earGeo, bodyMat);
      leftEar.position.set(-0.01, 0.085, -0.03);
      leftEar.rotation.z = 0.15;
      group.add(leftEar);

      const rightEar = new THREE.Mesh(earGeo, bodyMat);
      rightEar.position.set(0.01, 0.085, -0.03);
      rightEar.rotation.z = -0.15;
      group.add(rightEar);

      // Tiny eyes
      const eyeMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(
          new THREE.SphereGeometry(0.004, 4, 3),
          eyeMat
        );
        eye.position.set(side * 0.013, 0.06, -0.05);
        group.add(eye);
      }

      // Short fluffy tail (tiny sphere on back)
      const tailGeo = new THREE.SphereGeometry(0.012, 5, 4);
      const tailMat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5).getHex()
      });
      const tail = new THREE.Mesh(tailGeo, tailMat);
      tail.position.set(0, 0.03, 0.05);
      group.add(tail);

      const wx = tile.x * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * 0.5;
      const wz = tile.z * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * 0.5;
      group.position.set(wx, 0, wz);
      group.scale.setScalar(0.8 + Math.random() * 0.3);

      this.scene.add(group);
      this._meshes.push(group);

      this._rabbits.push({
        mesh: group,
        head,
        leftEar,
        rightEar,
        body,
        state: 'idle', // idle | nibbling | hopping | fleeing
        idleTimer: 2 + Math.random() * 4,
        nibblePhase: 0,
        nibbleTimer: 0,
        hopProgress: 0,
        hopStart: new THREE.Vector3(wx, 0, wz),
        hopTarget: null,
        hopCount: 0, // how many hops remain in flee sequence
      });
    }
  }

  _updateRabbits(delta, playerPos) {
    for (const rb of this._rabbits) {
      const pos = rb.mesh.position;

      if (rb.state === 'idle') {
        rb.idleTimer -= delta;

        if (rb.idleTimer <= 0) {
          // Start nibbling
          rb.state = 'nibbling';
          rb.nibblePhase = 0;
          rb.nibbleTimer = 1.5 + Math.random() * 2;
        }

        // Check flee from player
        if (playerPos) {
          const dx = pos.x - playerPos.x;
          const dz = pos.z - playerPos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < RABBIT_FLEE_DIST) {
            this._rabbitStartFlee(rb, playerPos);
          }
        }
      } else if (rb.state === 'nibbling') {
        rb.nibblePhase += delta * 8;
        rb.nibbleTimer -= delta;

        // Head bobbing for nibble
        rb.head.position.y = 0.055 + Math.sin(rb.nibblePhase) * 0.005;
        rb.head.rotation.x = Math.sin(rb.nibblePhase) * 0.1;

        if (rb.nibbleTimer <= 0) {
          rb.head.position.y = 0.055;
          rb.head.rotation.x = 0;
          rb.state = 'idle';
          rb.idleTimer = 2 + Math.random() * 4;
        }

        // Can still flee while nibbling
        if (playerPos) {
          const dx = pos.x - playerPos.x;
          const dz = pos.z - playerPos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < RABBIT_FLEE_DIST) {
            rb.head.position.y = 0.055;
            rb.head.rotation.x = 0;
            this._rabbitStartFlee(rb, playerPos);
          }
        }
      } else if (rb.state === 'hopping' || rb.state === 'fleeing') {
        rb.hopProgress += delta * (rb.state === 'fleeing' ? 3.5 : 2);

        if (rb.hopProgress >= 1) {
          // Land this hop
          pos.copy(rb.hopTarget);
          pos.y = 0;

          if (rb.state === 'fleeing' && rb.hopCount > 0) {
            // Continue flee: chain another hop
            rb.hopCount--;
            rb.hopProgress = 0;
            rb.hopStart.copy(pos);

            // Continue in roughly same flee direction with some variation
            const dx = rb.hopTarget.x - rb.hopStart.x;
            const dz = rb.hopTarget.z - rb.hopStart.z;
            const angle = Math.atan2(dz, dx) + (Math.random() - 0.5) * 0.6;
            const dist = 0.6 + Math.random() * 0.5;
            rb.hopTarget = new THREE.Vector3(
              pos.x + Math.cos(angle) * dist,
              0,
              pos.z + Math.sin(angle) * dist
            );
            rb.hopTarget.x = Math.max(1, Math.min(63, rb.hopTarget.x));
            rb.hopTarget.z = Math.max(1, Math.min(63, rb.hopTarget.z));
          } else {
            rb.state = 'idle';
            rb.idleTimer = 3 + Math.random() * 5;
          }
        } else {
          const t = rb.hopProgress;
          pos.lerpVectors(rb.hopStart, rb.hopTarget, t);
          pos.y = Math.sin(t * Math.PI) * 0.08; // short arc

          // Ear bounce during hop
          const earBounce = Math.sin(t * Math.PI) * 0.2;
          rb.leftEar.rotation.x = earBounce;
          rb.rightEar.rotation.x = earBounce;

          // Face direction of travel
          if (rb.hopTarget) {
            rb.mesh.lookAt(rb.hopTarget.x, pos.y, rb.hopTarget.z);
          }
        }
      }
    }
  }

  _rabbitStartFlee(rb, playerPos) {
    rb.state = 'fleeing';
    rb.hopProgress = 0;
    rb.hopCount = 3 + Math.floor(Math.random() * 3); // 3-5 rapid hops
    rb.hopStart.copy(rb.mesh.position);

    // Flee away from player
    const dx = rb.mesh.position.x - playerPos.x;
    const dz = rb.mesh.position.z - playerPos.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const dist = 0.8 + Math.random() * 0.6;

    rb.hopTarget = new THREE.Vector3(
      rb.mesh.position.x + (dx / len) * dist + (Math.random() - 0.5) * 0.3,
      0,
      rb.mesh.position.z + (dz / len) * dist + (Math.random() - 0.5) * 0.3
    );
    rb.hopTarget.x = Math.max(1, Math.min(63, rb.hopTarget.x));
    rb.hopTarget.z = Math.max(1, Math.min(63, rb.hopTarget.z));
  }

  // ═══════════════════════════════════════════════
  //  UPDATE / DISPOSE
  // ═══════════════════════════════════════════════

  update(delta, playerPos) {
    this._elapsed += delta;
    this._updateBirds(delta, playerPos);
    this._updateButterflies(delta, playerPos);
    this._updateFish(delta);
    this._updateDragonflies(delta);
    this._updateFrogs(delta, playerPos);
    this._updateFireflies(delta);
    this._updateRabbits(delta, playerPos);
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
    this._dragonflies = [];
    this._frogs = [];
    this._fireflies = [];
    this._rabbits = [];
  }
}
