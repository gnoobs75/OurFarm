// client/src/engine/AssetGenerator.js
// Factory for procedurally generated low-poly meshes.
// All game visuals are created here — no external texture files needed.
// Cozy low-poly aesthetic: warm colors, geometric shapes, subtle variation.

import * as THREE from 'three';

export class AssetGenerator {
  constructor() {
    this._matCache = new Map();
    this._geoCache = new Map();
  }

  getMaterial(color, options = {}) {
    const key = `${color}-${JSON.stringify(options)}`;
    if (!this._matCache.has(key)) {
      this._matCache.set(key, new THREE.MeshPhongMaterial({
        color, ...options,
      }));
    }
    return this._matCache.get(key);
  }

  getGeometry(type, ...args) {
    const key = `${type}-${args.join(',')}`;
    if (!this._geoCache.has(key)) {
      let geo;
      switch (type) {
        case 'box': geo = new THREE.BoxGeometry(...args); break;
        case 'sphere': geo = new THREE.SphereGeometry(...args); break;
        case 'cylinder': geo = new THREE.CylinderGeometry(...args); break;
        case 'cone': geo = new THREE.ConeGeometry(...args); break;
        case 'dodecahedron': geo = new THREE.DodecahedronGeometry(...args); break;
        case 'plane': geo = new THREE.PlaneGeometry(...args); break;
        default: geo = new THREE.BoxGeometry(...args);
      }
      this._geoCache.set(key, geo);
    }
    return this._geoCache.get(key);
  }

  // Deterministic pseudo-random for consistent variation
  _seededRand(x, z) {
    const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  // ═══════════════════════════════════════════════
  //  TREES — 3 variants: oak, pine, fruit
  // ═══════════════════════════════════════════════

  createTree(variant = 0, seed = 0) {
    const group = new THREE.Group();
    const r = this._seededRand(seed, variant);
    const trunkH = 0.6 + r * 0.5;
    const trunkR = 0.08 + r * 0.06;

    // Trunk — tapered cylinder, warm brown
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.7, trunkR, trunkH, 5),
      this.getMaterial(0x6b3a2a)
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    group.add(trunk);

    if (variant % 3 === 1) {
      // ── Pine: 3 stacked dark cones ──
      const pineColors = [0x1a5c2a, 0x1e6b30, 0x227a38];
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.55 - i * 0.12, 0.5 + i * 0.05, 6),
          this.getMaterial(pineColors[i])
        );
        cone.position.y = trunkH + 0.1 + i * 0.3;
        cone.castShadow = true;
        group.add(cone);
      }
    } else {
      // ── Oak / Fruit tree: overlapping sphere clusters ──
      const isOak = variant % 3 === 0;
      const leafColor = isOak ? 0x2d8a4e : 0x3da85a;
      const clusterCount = 2 + Math.floor(r * 2);

      for (let i = 0; i < clusterCount; i++) {
        const cr = this._seededRand(seed + i, variant + i);
        const radius = 0.3 + cr * 0.2;
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 6, 5),
          this.getMaterial(leafColor)
        );
        sphere.position.set(
          (cr - 0.5) * 0.4,
          trunkH + 0.15 + i * 0.2,
          (this._seededRand(seed + i + 10, variant) - 0.5) * 0.4
        );
        sphere.castShadow = true;
        group.add(sphere);
      }

      // Fruit tree gets small colored dots
      if (!isOak) {
        const fruitColors = [0xe74c3c, 0xff6b35, 0xf5d142];
        for (let i = 0; i < 5; i++) {
          const fr = this._seededRand(seed + 20 + i, variant);
          const fruit = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 4, 3),
            this.getMaterial(fruitColors[i % 3])
          );
          fruit.position.set(
            (fr - 0.5) * 0.6,
            trunkH + 0.1 + fr * 0.4,
            (this._seededRand(seed + 30 + i, variant) - 0.5) * 0.6
          );
          group.add(fruit);
        }
      }
    }

    group.userData.type = 'tree';
    return group;
  }

  // ═══════════════════════════════════════════════
  //  ROCKS — cluster of 2-3 varied dodecahedrons
  // ═══════════════════════════════════════════════

  createRock(oreType = null, seed = 0) {
    const group = new THREE.Group();
    const baseColor = oreType === 'copper' ? 0xb87333
      : oreType === 'iron' ? 0x888899
      : oreType === 'gold' ? 0xffd700 : 0x8a8a8a;

    const count = 2 + Math.floor(this._seededRand(seed, 7) * 2);
    for (let i = 0; i < count; i++) {
      const r = this._seededRand(seed + i, 13);
      const scale = 0.12 + r * 0.2;

      // Slight color variation per rock
      const c = new THREE.Color(baseColor);
      const colorVar = (r - 0.5) * 0.1;
      c.r = Math.max(0, Math.min(1, c.r + colorVar));
      c.g = Math.max(0, Math.min(1, c.g + colorVar));
      c.b = Math.max(0, Math.min(1, c.b + colorVar));

      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(scale, 0),
        this.getMaterial(c.getHex())
      );
      rock.position.set(
        (r - 0.5) * 0.3,
        scale * 0.5,
        (this._seededRand(seed + i + 5, 17) - 0.5) * 0.3
      );
      rock.rotation.set(r * 2, r * 3, r);
      rock.castShadow = true;
      group.add(rock);
    }
    return group;
  }

  // ═══════════════════════════════════════════════
  //  FLOWERS — cluster of 3-5 tiny colorful blooms
  // ═══════════════════════════════════════════════

  createFlowerCluster(seed = 0) {
    const group = new THREE.Group();
    const petalColors = [0xff4466, 0xffdd44, 0xff88cc, 0xaa66ff, 0xffffff, 0xff6633];
    const count = 3 + Math.floor(this._seededRand(seed, 3) * 3);

    for (let i = 0; i < count; i++) {
      const r = this._seededRand(seed + i, 19);
      const stemH = 0.08 + r * 0.14;
      const flowerGroup = new THREE.Group();

      // Thin green stem
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.01, stemH, 3),
        this.getMaterial(0x2d7a1e)
      );
      stem.position.y = stemH / 2;
      flowerGroup.add(stem);

      // Colorful sphere head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.03 + r * 0.02, 5, 4),
        this.getMaterial(petalColors[Math.floor(r * petalColors.length)])
      );
      head.position.y = stemH;
      flowerGroup.add(head);

      flowerGroup.position.set(
        (r - 0.5) * 0.35,
        0,
        (this._seededRand(seed + i + 7, 23) - 0.5) * 0.35
      );
      group.add(flowerGroup);
    }
    return group;
  }

  // ═══════════════════════════════════════════════
  //  BUSHES — flattened dark green spheres
  // ═══════════════════════════════════════════════

  createBush(seed = 0) {
    const group = new THREE.Group();
    const r = this._seededRand(seed, 31);
    const colors = [0x1a6b2a, 0x1e7a30, 0x226b25];
    const radius = 0.18 + r * 0.1;

    const bush = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 6, 5),
      this.getMaterial(colors[Math.floor(r * 3)])
    );
    bush.position.y = radius * 0.55;
    bush.scale.y = 0.65;
    bush.castShadow = true;
    group.add(bush);

    // Second smaller sphere for natural shape
    const bush2 = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.7, 5, 4),
      this.getMaterial(colors[Math.floor(r * 3)])
    );
    bush2.position.set(radius * 0.3, radius * 0.4, radius * 0.2);
    bush2.scale.y = 0.6;
    group.add(bush2);

    return group;
  }

  // ═══════════════════════════════════════════════
  //  FENCE — post + rail segment
  // ═══════════════════════════════════════════════

  createFenceSegment() {
    const group = new THREE.Group();
    const woodColor = 0x8b6b4a;

    // Two posts
    for (const xOff of [-0.45, 0.45]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.03, 0.45, 4),
        this.getMaterial(woodColor)
      );
      post.position.set(xOff, 0.225, 0);
      post.castShadow = true;
      group.add(post);
    }

    // Two horizontal rails
    for (const yOff of [0.15, 0.32]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.03, 0.025),
        this.getMaterial(woodColor)
      );
      rail.position.set(0, yOff, 0);
      group.add(rail);
    }

    return group;
  }

  // ═══════════════════════════════════════════════
  //  REEDS — tall thin stalks near water
  // ═══════════════════════════════════════════════

  createReeds(seed = 0) {
    const group = new THREE.Group();
    const count = 3 + Math.floor(this._seededRand(seed, 41) * 4);

    for (let i = 0; i < count; i++) {
      const r = this._seededRand(seed + i, 43);
      const h = 0.25 + r * 0.25;

      const reed = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.015, h, 3),
        this.getMaterial(0x5a8a3a)
      );
      reed.position.set(
        (r - 0.5) * 0.4,
        h / 2,
        (this._seededRand(seed + i + 3, 47) - 0.5) * 0.4
      );
      reed.rotation.z = (r - 0.5) * 0.15;
      group.add(reed);

      // Cattail top on taller reeds
      if (h > 0.35) {
        const top = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 0.06, 4),
          this.getMaterial(0x5c3a1e)
        );
        top.position.set(reed.position.x, h, reed.position.z);
        group.add(top);
      }
    }
    return group;
  }

  // ═══════════════════════════════════════════════
  //  CROPS — standard + special corn
  // ═══════════════════════════════════════════════

  createCrop(cropType, stage) {
    const colors = {
      wheat: 0xdaa520, corn: 0xf5d142, tomato: 0xe74c3c, carrot: 0xff8c00,
      potato: 0x8b7355, strawberry: 0xff3366, pumpkin: 0xff7518, blueberry: 0x4169e1,
    };

    // Corn gets special tall treatment
    if (cropType === 'corn') {
      return this._createCorn(stage);
    }

    const group = new THREE.Group();
    const scale = 0.2 + stage * 0.27;
    const topColor = colors[cropType] || 0x44aa22;

    // Stem
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.03, 0.5 * scale, 4),
      this.getMaterial(0x2d5a1e)
    );
    stem.position.y = 0.25 * scale;
    group.add(stem);

    if (stage >= 1) {
      if (stage === 1) {
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 4, 3), this.getMaterial(0x44aa22)
        );
        leaf.position.y = 0.5 * scale;
        group.add(leaf);
      } else if (stage === 2) {
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 5, 3), this.getMaterial(0x3d9930)
        );
        leaf.position.y = 0.5 * scale;
        leaf.scale.y = 0.6;
        group.add(leaf);
      } else if (stage === 3) {
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 5, 3), this.getMaterial(0x3d9930)
        );
        leaf.position.y = 0.45 * scale;
        leaf.scale.y = 0.6;
        group.add(leaf);

        const fruit = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 5, 4), this.getMaterial(topColor)
        );
        fruit.position.set(0.05, 0.55 * scale, 0.05);
        group.add(fruit);
      }
    }

    group.castShadow = true;
    return group;
  }

  _createCorn(stage) {
    const group = new THREE.Group();
    const stalkH = 0.15 + stage * 0.2;

    // Tall stalk
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.025, stalkH, 4),
      this.getMaterial(0x2d6a1e)
    );
    stalk.position.y = stalkH / 2;
    group.add(stalk);

    // Leaves at stage 2+
    if (stage >= 2) {
      for (let i = 0; i < 3; i++) {
        const leaf = new THREE.Mesh(
          new THREE.PlaneGeometry(0.2, 0.04),
          this.getMaterial(0x3d8a30, { side: THREE.DoubleSide })
        );
        leaf.position.set(0, stalkH * 0.3 + i * stalkH * 0.2, 0);
        leaf.rotation.set(0, i * 2.1, (i % 2 === 0 ? 1 : -1) * 0.5);
        group.add(leaf);
      }
    }

    // Ear + silk at stage 3
    if (stage >= 3) {
      const ear = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.025, 0.1, 5),
        this.getMaterial(0xf5d142)
      );
      ear.position.set(0.04, stalkH * 0.7, 0);
      ear.rotation.z = 0.3;
      group.add(ear);

      const silk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.001, 0.05, 3),
        this.getMaterial(0xddcc88)
      );
      silk.position.set(0.04, stalkH * 0.7 + 0.06, 0);
      group.add(silk);
    }

    group.castShadow = true;
    return group;
  }

  // ═══════════════════════════════════════════════
  //  BUILDINGS — house, barn, coop, mill, shop
  // ═══════════════════════════════════════════════

  createBuilding(type) {
    const group = new THREE.Group();
    const configs = {
      house: { w: 2, h: 1.5, d: 2, color: 0xc4956a, roofColor: 0x8b4513 },
      barn:  { w: 3, h: 2, d: 2.5, color: 0xcc3333, roofColor: 0x5c2a0e },
      coop:  { w: 1.5, h: 1, d: 1.5, color: 0xdeb887, roofColor: 0x8b6914 },
      mill:  { w: 1.5, h: 2.5, d: 1.5, color: 0xf5f5dc, roofColor: 0x666666 },
      shop:  { w: 2, h: 1.5, d: 2, color: 0x6495ed, roofColor: 0x4169e1 },
    };
    const cfg = configs[type] || configs.house;

    // Walls
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d), this.getMaterial(cfg.color)
    );
    walls.position.y = cfg.h / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    // Roof — pyramid
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(cfg.w * 0.85, cfg.h * 0.45, 4), this.getMaterial(cfg.roofColor)
    );
    roof.position.y = cfg.h + cfg.h * 0.225;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    // Door
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.65), this.getMaterial(0x4a2a0e)
    );
    door.position.set(0, 0.325, cfg.d / 2 + 0.01);
    group.add(door);

    // Door knob
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 4, 3), this.getMaterial(0xdaa520)
    );
    knob.position.set(0.12, 0.35, cfg.d / 2 + 0.02);
    group.add(knob);

    // Windows — front + sides, soft glow
    const windowMat = this.getMaterial(0xaaddff, { emissive: 0x334455, emissiveIntensity: 0.3 });
    for (const side of [-1, 1]) {
      // Front windows flanking door
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.25), windowMat);
      win.position.set(side * cfg.w * 0.3, cfg.h * 0.6, cfg.d / 2 + 0.01);
      group.add(win);

      // Side windows
      const sideWin = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.25), windowMat);
      sideWin.position.set(side * (cfg.w / 2 + 0.01), cfg.h * 0.6, 0);
      sideWin.rotation.y = Math.PI / 2;
      group.add(sideWin);
    }

    // ── House extras: chimney + porch ──
    if (type === 'house') {
      const chimney = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.5, 0.25), this.getMaterial(0x884433)
      );
      chimney.position.set(cfg.w * 0.25, cfg.h + cfg.h * 0.35, -cfg.d * 0.2);
      chimney.castShadow = true;
      group.add(chimney);

      const porch = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.w * 0.6, 0.04, 0.5), this.getMaterial(cfg.roofColor)
      );
      porch.position.set(0, cfg.h * 0.75, cfg.d / 2 + 0.25);
      group.add(porch);
    }

    // ── Barn extras: double doors + hay bales ──
    if (type === 'barn') {
      door.visible = false;
      for (const side of [-0.3, 0.3]) {
        const barnDoor = new THREE.Mesh(
          new THREE.PlaneGeometry(0.45, 1.0), this.getMaterial(0x5c2a0e)
        );
        barnDoor.position.set(side, 0.5, cfg.d / 2 + 0.01);
        group.add(barnDoor);
      }

      for (let i = 0; i < 3; i++) {
        const hay = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.2, 0.2), this.getMaterial(0xdaaa40)
        );
        hay.position.set(cfg.w / 2 + 0.4, 0.1 + i * 0.2, -0.3 + i * 0.15);
        hay.rotation.y = i * 0.2;
        hay.castShadow = true;
        group.add(hay);
      }
    }

    return group;
  }

  // ═══════════════════════════════════════════════
  //  ANIMALS
  // ═══════════════════════════════════════════════

  createAnimal(type) {
    const group = new THREE.Group();
    const configs = {
      chicken: { bodyColor: 0xffffff, size: 0.2, legHeight: 0.1 },
      cow:     { bodyColor: 0xf5f5f5, size: 0.5, legHeight: 0.3 },
      sheep:   { bodyColor: 0xeeeeee, size: 0.4, legHeight: 0.25 },
      goat:    { bodyColor: 0xccbbaa, size: 0.35, legHeight: 0.25 },
    };
    const cfg = configs[type] || configs.chicken;
    const bodyMat = this.getMaterial(cfg.bodyColor);

    const body = new THREE.Mesh(new THREE.SphereGeometry(cfg.size, 6, 4), bodyMat);
    body.position.y = cfg.legHeight + cfg.size;
    body.scale.x = 1.3;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(cfg.size * 0.5, 5, 4), bodyMat);
    head.position.set(cfg.size * 1.1, cfg.legHeight + cfg.size * 1.3, 0);
    group.add(head);

    const legGeo = new THREE.CylinderGeometry(0.03, 0.03, cfg.legHeight, 4);
    const legMat = this.getMaterial(type === 'chicken' ? 0xffaa00 : 0x555555);
    const positions = type === 'chicken'
      ? [[-0.05, 0.05], [0.05, 0.05]]
      : [[-cfg.size * 0.5, cfg.size * 0.3], [cfg.size * 0.5, cfg.size * 0.3],
         [-cfg.size * 0.5, -cfg.size * 0.3], [cfg.size * 0.5, -cfg.size * 0.3]];
    for (const [lx, lz] of positions) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, cfg.legHeight / 2, lz);
      group.add(leg);
    }

    group.castShadow = true;
    return group;
  }

  // ═══════════════════════════════════════════════
  //  PETS
  // ═══════════════════════════════════════════════

  createPet(type, params = {}) {
    if (type === 'chihuahua') return this._createChihuahua(params);
    if (type === 'labrador') return this._createLabrador(params);

    // Generic fallback for unknown pet types
    const group = new THREE.Group();
    const { bodySize = 0.25, earSize = 0.1, tailLength = 0.2, color = 0xbb8844 } = params;
    const bodyMat = this.getMaterial(color);

    const body = new THREE.Mesh(new THREE.SphereGeometry(bodySize, 6, 4), bodyMat);
    body.position.y = bodySize + 0.1;
    body.scale.z = 1.3;
    group.add(body);

    const headSize = bodySize * 0.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headSize, 5, 4), bodyMat);
    head.position.set(0, bodySize + 0.1 + bodySize * 0.5, bodySize * 1.2);
    group.add(head);

    const earGeo = new THREE.ConeGeometry(earSize, earSize * 2, 4);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, bodyMat);
      ear.position.set(side * headSize * 0.5, bodySize + 0.1 + bodySize * 0.5 + headSize, bodySize * 1.2);
      group.add(ear);
    }

    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.04, tailLength, 4), bodyMat
    );
    tail.position.set(0, bodySize + 0.1, -bodySize * 1.2);
    tail.rotation.x = -0.5;
    group.add(tail);

    const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.1, 4);
    for (const [lx, lz] of [[-0.1, 0.1], [0.1, 0.1], [-0.1, -0.1], [0.1, -0.1]]) {
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(lx, 0.05, lz);
      group.add(leg);
    }

    group.userData.parts = { body, head, tail: [tail] };
    group.castShadow = true;
    return group;
  }

  // ── Chihuahua ──────────────────────────────────
  // Tiny apple-dome dog: oversized head, huge pointy ears, big eyes

  _createChihuahua(params = {}) {
    const group = new THREE.Group();
    const { bodySize = 0.15, color = 0x444444 } = params;
    const bodyMat = this.getMaterial(color);

    // Body — small elongated sphere
    const body = new THREE.Mesh(new THREE.SphereGeometry(bodySize, 6, 4), bodyMat);
    body.position.y = bodySize + 0.06;
    body.scale.z = 1.2;
    group.add(body);

    // Head — oversized apple dome (0.7x body ratio)
    const headSize = bodySize * 0.7;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headSize, 6, 5), bodyMat);
    head.position.set(0, bodySize + 0.06 + bodySize * 0.55, bodySize * 1.1);
    group.add(head);

    // Eyes — big round eyes with white sclera + dark pupil
    const scleraMat = this.getMaterial(0xffffff);
    const pupilMat = this.getMaterial(0x111111);
    const eyeRadius = headSize * 0.22;
    for (const side of [-1, 1]) {
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(eyeRadius, 5, 4), scleraMat);
      sclera.position.set(
        side * headSize * 0.45,
        head.position.y + headSize * 0.15,
        head.position.z + headSize * 0.75
      );
      group.add(sclera);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeRadius * 0.55, 4, 4), pupilMat);
      pupil.position.set(
        side * headSize * 0.45,
        head.position.y + headSize * 0.15,
        head.position.z + headSize * 0.75 + eyeRadius * 0.5
      );
      group.add(pupil);
    }

    // Ears — huge pointy cones
    const earHeight = bodySize * 0.9;
    const earGeo = new THREE.ConeGeometry(bodySize * 0.22, earHeight, 4);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, bodyMat);
      ear.position.set(
        side * headSize * 0.55,
        head.position.y + headSize * 0.7,
        head.position.z - headSize * 0.1
      );
      ear.rotation.z = side * -0.25;
      group.add(ear);
    }

    // Nose — tiny dark sphere
    const nose = new THREE.Mesh(new THREE.SphereGeometry(headSize * 0.1, 4, 4), pupilMat);
    nose.position.set(0, head.position.y - headSize * 0.1, head.position.z + headSize * 0.9);
    group.add(nose);

    // Legs — tiny thin legs
    const legHeight = 0.06;
    const legGeo = new THREE.CylinderGeometry(0.015, 0.015, legHeight, 4);
    const legSpreadX = bodySize * 0.55;
    const legSpreadZ = bodySize * 0.6;
    for (const [lx, lz] of [
      [-legSpreadX, legSpreadZ], [legSpreadX, legSpreadZ],
      [-legSpreadX, -legSpreadZ], [legSpreadX, -legSpreadZ],
    ]) {
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(lx, legHeight / 2, lz);
      group.add(leg);
    }

    // Tail — thin curled-up tail
    const tailSeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.02, bodySize * 0.6, 4), bodyMat
    );
    tailSeg.position.set(0, bodySize + 0.06 + bodySize * 0.2, -bodySize * 1.1);
    tailSeg.rotation.x = -0.9;
    group.add(tailSeg);

    group.userData.parts = { body, head, tail: [tailSeg] };
    group.castShadow = true;
    return group;
  }

  // ── Labrador ───────────────────────────────────
  // Large athletic dog: proportional head, floppy ears, strong build

  _createLabrador(params = {}) {
    const group = new THREE.Group();
    const { bodySize = 0.35, color = 0x1a1a1a } = params;
    const bodyMat = this.getMaterial(color);

    // Body — large elongated sphere
    const body = new THREE.Mesh(new THREE.SphereGeometry(bodySize, 6, 4), bodyMat);
    body.position.y = bodySize + 0.18;
    body.scale.z = 1.4;
    group.add(body);

    // Head — proportional (0.5x body ratio)
    const headSize = bodySize * 0.5;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headSize, 6, 5), bodyMat);
    head.position.set(0, bodySize + 0.18 + bodySize * 0.4, bodySize * 1.3);
    group.add(head);

    // Snout — elongated box for Labrador muzzle
    const snout = new THREE.Mesh(
      new THREE.BoxGeometry(headSize * 0.6, headSize * 0.4, headSize * 0.6, 1, 1, 1), bodyMat
    );
    snout.position.set(0, head.position.y - headSize * 0.2, head.position.z + headSize * 0.7);
    group.add(snout);

    // Nose — dark sphere at snout tip
    const noseMat = this.getMaterial(0x111111);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(headSize * 0.12, 4, 4), noseMat);
    nose.position.set(0, head.position.y - headSize * 0.15, head.position.z + headSize * 1.0);
    group.add(nose);

    // Eyes — friendly eyes with white sclera + dark pupil
    const scleraMat = this.getMaterial(0xffffff);
    const pupilMat = this.getMaterial(0x221100);
    const eyeRadius = headSize * 0.16;
    for (const side of [-1, 1]) {
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(eyeRadius, 5, 4), scleraMat);
      sclera.position.set(
        side * headSize * 0.4,
        head.position.y + headSize * 0.2,
        head.position.z + headSize * 0.7
      );
      group.add(sclera);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(eyeRadius * 0.6, 4, 4), pupilMat);
      pupil.position.set(
        side * headSize * 0.4,
        head.position.y + headSize * 0.2,
        head.position.z + headSize * 0.7 + eyeRadius * 0.45
      );
      group.add(pupil);
    }

    // Ears — floppy hanging half-spheres (not pointy cones)
    const earGeo = new THREE.SphereGeometry(headSize * 0.35, 5, 4, 0, Math.PI);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, bodyMat);
      ear.position.set(
        side * headSize * 0.7,
        head.position.y - headSize * 0.1,
        head.position.z - headSize * 0.15
      );
      ear.rotation.x = 0.5;
      ear.rotation.z = side * 0.3;
      group.add(ear);
    }

    // Legs — strong thick legs
    const legHeight = 0.18;
    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, legHeight, 4);
    const legSpreadX = bodySize * 0.55;
    const legSpreadZ = bodySize * 0.7;
    for (const [lx, lz] of [
      [-legSpreadX, legSpreadZ], [legSpreadX, legSpreadZ],
      [-legSpreadX, -legSpreadZ], [legSpreadX, -legSpreadZ],
    ]) {
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(lx, legHeight / 2, lz);
      group.add(leg);
    }

    // Tail — straight sturdy tail
    const tailSeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.04, bodySize * 0.8, 4), bodyMat
    );
    tailSeg.position.set(0, bodySize + 0.18, -bodySize * 1.3);
    tailSeg.rotation.x = -0.4;
    group.add(tailSeg);

    group.userData.parts = { body, head, tail: [tailSeg] };
    group.castShadow = true;
    return group;
  }

  // ═══════════════════════════════════════════════
  //  NPC + PLAYER
  // ═══════════════════════════════════════════════

  createNPC(params = {}) {
    const group = new THREE.Group();
    const {
      skinColor = 0xffcc99,
      shirtColor = 0x4488cc,
      hairColor = 0x332211,
      pantsColor = 0x334455,
      hairStyle = 'round',
      eyeStyle = 'dots',
      mouthStyle = 'smile',
    } = params;

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), this.getMaterial(shirtColor));
    body.position.y = 0.75;
    group.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), this.getMaterial(skinColor));
    head.position.y = 1.2;
    group.add(head);

    // Hair — style variants
    let hair;
    const hairMat = this.getMaterial(hairColor);
    if (hairStyle === 'spiked') {
      hair = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), hairMat);
        const angle = (i / 5) * Math.PI * 2;
        spike.position.set(Math.cos(angle) * 0.1, 0.08, Math.sin(angle) * 0.1);
        spike.rotation.set(Math.sin(angle) * 0.4, 0, Math.cos(angle) * 0.4);
        hair.add(spike);
      }
      // Center spike
      const center = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), hairMat);
      center.position.y = 0.1;
      hair.add(center);
      hair.position.y = 1.28;
    } else if (hairStyle === 'long') {
      hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), hairMat);
      hair.position.y = 1.25;
      hair.scale.set(1.05, 1.1, 1.15);
    } else {
      // 'round' — default
      hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), hairMat);
      hair.position.y = 1.28;
      hair.scale.set(1, 0.6, 1);
    }
    group.add(hair);

    // Eyes
    const eyeMat = this.getMaterial(0x222222);
    if (eyeStyle === 'ovals') {
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 3), eyeMat);
        eye.scale.set(1, 1.4, 0.5);
        eye.position.set(side * 0.06, 1.22, 0.16);
        group.add(eye);
      }
    } else if (eyeStyle === 'closed') {
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.01), eyeMat);
        eye.position.set(side * 0.06, 1.21, 0.16);
        group.add(eye);
      }
    } else {
      // 'dots' — default
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 3), eyeMat);
        eye.position.set(side * 0.06, 1.22, 0.16);
        group.add(eye);
      }
    }

    // Mouth
    const mouthMat = this.getMaterial(0x553333);
    if (mouthStyle === 'neutral') {
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.01), mouthMat);
      mouth.position.set(0, 1.13, 0.17);
      group.add(mouth);
    } else if (mouthStyle === 'open') {
      const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), mouthMat);
      mouth.position.set(0, 1.12, 0.17);
      group.add(mouth);
    } else {
      // 'smile' — curved line approximated by tilted thin box
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.01), mouthMat);
      mouth.position.set(0, 1.13, 0.17);
      mouth.rotation.z = 0.1;
      group.add(mouth);
    }

    // Legs — wrap each in a pivot so rotation swings from the hip
    const legGeo = new THREE.BoxGeometry(0.12, 0.4, 0.15);
    const legMat = this.getMaterial(pantsColor);

    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.1, 0.4, 0); // hip height
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.y = -0.2; // hang down from pivot
    leftLegPivot.add(leftLeg);
    group.add(leftLegPivot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.1, 0.4, 0);
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.y = -0.2;
    rightLegPivot.add(rightLeg);
    group.add(rightLegPivot);

    // Arms — wrap each in a pivot so rotation swings from the shoulder
    const armGeo = new THREE.BoxGeometry(0.1, 0.4, 0.12);
    const armMat = this.getMaterial(skinColor);

    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.28, 0.95, 0); // shoulder height
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.y = -0.2; // hang down from pivot
    leftArmPivot.add(leftArm);
    group.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.28, 0.95, 0);
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.y = -0.2;
    rightArmPivot.add(rightArm);
    group.add(rightArmPivot);

    // Store references for animation
    group.userData.parts = {
      body, head, hair,
      leftLegPivot, rightLegPivot,
      leftArmPivot, rightArmPivot,
    };

    // Enable shadow casting on each child mesh (Group.castShadow doesn't propagate)
    group.traverse(child => { if (child.isMesh) child.castShadow = true; });
    return group;
  }

  createPlayer(appearance = {}) {
    return this.createNPC({ shirtColor: 0x4488ff, ...appearance });
  }

  // ═══════════════════════════════════════════════
  //  TOWN DECORATIONS — statue, fountain, lamppost, bench
  // ═══════════════════════════════════════════════

  createStatue() {
    const group = new THREE.Group();

    // Stone pedestal
    const pedestal = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.4, 0.5),
      this.getMaterial(0x999999)
    );
    pedestal.position.y = 0.2;
    pedestal.castShadow = true;
    group.add(pedestal);

    // Body — simple figure
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 0.6, 6),
      this.getMaterial(0xaaaaaa)
    );
    body.position.y = 0.7;
    body.castShadow = true;
    group.add(body);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 5),
      this.getMaterial(0xaaaaaa)
    );
    head.position.y = 1.1;
    group.add(head);

    return group;
  }

  createFountain() {
    const group = new THREE.Group();

    // Base pool — wide short cylinder
    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.9, 0.2, 8),
      this.getMaterial(0x888888)
    );
    pool.position.y = 0.1;
    pool.castShadow = true;
    group.add(pool);

    // Water surface
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.05, 8),
      this.getMaterial(0x4a90d9, { transparent: true, opacity: 0.7 })
    );
    water.position.y = 0.15;
    group.add(water);

    // Central pillar
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6),
      this.getMaterial(0x999999)
    );
    pillar.position.y = 0.5;
    pillar.castShadow = true;
    group.add(pillar);

    // Top bowl
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.15, 0.1, 6),
      this.getMaterial(0x999999)
    );
    bowl.position.y = 0.8;
    group.add(bowl);

    return group;
  }

  createLamppost() {
    const group = new THREE.Group();

    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.04, 1.2, 4),
      this.getMaterial(0x333333)
    );
    pole.position.y = 0.6;
    pole.castShadow = true;
    group.add(pole);

    // Lamp housing
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.12, 0.15),
      this.getMaterial(0xffee88, { emissive: 0xffcc44, emissiveIntensity: 0.5 })
    );
    lamp.position.y = 1.25;
    group.add(lamp);

    // Top cap
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.08, 4),
      this.getMaterial(0x333333)
    );
    cap.position.y = 1.35;
    cap.rotation.y = Math.PI / 4;
    group.add(cap);

    return group;
  }

  createBench() {
    const group = new THREE.Group();
    const woodColor = 0x8b6b4a;

    // Seat
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.04, 0.3),
      this.getMaterial(woodColor)
    );
    seat.position.y = 0.25;
    seat.castShadow = true;
    group.add(seat);

    // Backrest
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.25, 0.03),
      this.getMaterial(woodColor)
    );
    back.position.set(0, 0.38, -0.13);
    group.add(back);

    // Legs (4)
    const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.25, 4);
    const legMat = this.getMaterial(0x555555);
    for (const [lx, lz] of [[-0.35, 0.1], [0.35, 0.1], [-0.35, -0.1], [0.35, -0.1]]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.125, lz);
      group.add(leg);
    }

    return group;
  }

  createSignpost(seed = 0) {
    const group = new THREE.Group();

    // Post
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.04, 0.8, 4),
      this.getMaterial(0x8b6b4a)
    );
    post.position.y = 0.4;
    post.castShadow = true;
    group.add(post);

    // Sign board
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.03),
      this.getMaterial(0xc4956a)
    );
    sign.position.y = 0.75;
    group.add(sign);

    return group;
  }

  // ═══════════════════════════════════════════════

  dispose() {
    for (const mat of this._matCache.values()) mat.dispose();
    this._matCache.clear();
    for (const geo of this._geoCache.values()) geo.dispose();
    this._geoCache.clear();
  }
}
