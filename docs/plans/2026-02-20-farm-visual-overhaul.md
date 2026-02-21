# Farm Visual Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the flat checkerboard terrain into a cozy low-poly farm world with natural zones, detailed procedural 3D objects, decorations, and warm atmospheric lighting.

**Architecture:** Fix server-side terrain generation (noise RNG + zoned layout), upgrade client-side AssetGenerator with richer 3D objects, add server-side DecorationGenerator + client-side DecorationRenderer for trees/rocks/flowers/bushes/fences, place starter farm structures, and tune lighting for warm golden-hour feel.

**Tech Stack:** Three.js (r183), simplex-noise v4, Node.js, Socket.io

---

### Task 1: Fix TerrainGenerator — RNG + Zoned World Layout

**Files:**
- Modify: `server/game/TerrainGenerator.js`

**Step 1: Rewrite TerrainGenerator.js**

Replace the entire file. Key changes:
- Fix RNG: IIFE the seeded random function so `createNoise2D` receives `() => number` instead of `() => () => number`
- Zone-based tile assignment instead of arbitrary noise thresholds
- Proper pond in SE quadrant using noise-shaped circle
- Path from farm to north edge
- Sand borders around water
- Farm clearing in center

```javascript
// server/game/TerrainGenerator.js
import { createNoise2D } from 'simplex-noise';
import { WORLD_SIZE, TILE_TYPES } from '../../shared/constants.js';

export class TerrainGenerator {
  constructor(seed) {
    this.seed = seed;
    // Fix: IIFE so createNoise2D gets the RNG function directly
    this.noise = createNoise2D((() => {
      let s = seed;
      return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
      };
    })());
  }

  generate() {
    const tiles = [];
    const S = WORLD_SIZE;
    const cx = S / 2, cz = S / 2;

    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const nx = x / S, nz = z / S;

        // Multi-octave height noise
        let height = 0;
        height += 1.0 * this.noise(nx * 6, nz * 6);
        height += 0.5 * this.noise(nx * 12, nz * 12);
        height += 0.25 * this.noise(nx * 24, nz * 24);
        height /= 1.75;

        // Distance from world center (normalized 0-1)
        const dx = (x - cx) / cx;
        const dz = (z - cz) / cz;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Pond: circle in SE quadrant, noise-shaped edge
        const pondCx = S * 0.72, pondCz = S * 0.7;
        const pondDx = (x - pondCx) / 8, pondDz = (z - pondCz) / 7;
        const pondDist = Math.sqrt(pondDx * pondDx + pondDz * pondDz);
        const pondEdge = 1.0 + this.noise(x * 0.3, z * 0.3) * 0.3;
        const isPond = pondDist < pondEdge;
        const isPondBeach = !isPond && pondDist < pondEdge + 0.3;

        // Path: 2-tile wide strip from farm (center) north to edge
        const pathX = cx + Math.sin(z * 0.15) * 2; // slight curve
        const isPath = Math.abs(x - pathX) < 1.5 && z < cz - 3;

        // Farm clearing: rectangular area near center
        const farmLeft = cx - 6, farmRight = cx + 6;
        const farmTop = cz - 5, farmBottom = cz + 5;
        const isFarmArea = x >= farmLeft && x <= farmRight && z >= farmTop && z <= farmBottom;

        // Assign tile type
        let type;
        if (isPond) {
          type = TILE_TYPES.WATER;
        } else if (isPondBeach) {
          type = TILE_TYPES.SAND;
        } else if (isPath) {
          type = TILE_TYPES.PATH;
        } else if (isFarmArea) {
          // Farm area: mostly dirt with some grass
          type = (Math.abs(height) < 0.15) ? TILE_TYPES.DIRT : TILE_TYPES.GRASS;
        } else if (dist > 0.85) {
          // World edges: stone outcrops where height is high
          type = height > 0.2 ? TILE_TYPES.STONE : TILE_TYPES.GRASS;
        } else {
          // Everything else: grass, with occasional stone at high elevations
          type = height > 0.45 ? TILE_TYPES.STONE : TILE_TYPES.GRASS;
        }

        // Height value: gentle rolling for grass, flat for farm, low for water
        let tileHeight;
        if (type === TILE_TYPES.WATER) {
          tileHeight = -0.15;
        } else if (type === TILE_TYPES.SAND) {
          tileHeight = 0.02;
        } else if (isFarmArea || isPath) {
          tileHeight = 0;
        } else {
          tileHeight = Math.max(0, height * 0.12);
        }

        tiles.push({ x, z, type, height: tileHeight });
      }
    }
    return tiles;
  }
}
```

**Step 2: Delete old database to regenerate world**

The world seed is stored in SQLite. To see the new terrain, delete the DB files so a fresh world is generated:
```bash
rm -f ourfarm.db ourfarm.db-shm ourfarm.db-wal
```

**Step 3: Verify — restart server, check console shows 4096 tiles, load client and see zoned terrain**

Run: `npm run dev`
Expected: Natural-looking terrain with green grassland, central farm clearing (dirt), a pond in SE, a curving path northward, stone at edges.

**Step 4: Commit**
```bash
git add server/game/TerrainGenerator.js
git commit -m "feat: fix terrain noise RNG and add zoned world layout"
```

---

### Task 2: Upgrade AssetGenerator — Trees, Rocks, Flowers, Bushes, Fences, Buildings, Corn

**Files:**
- Modify: `client/src/engine/AssetGenerator.js`

**Step 1: Replace AssetGenerator with upgraded version**

Key upgrades:
- **Trees**: 3 variants (oak with sphere canopy clusters, pine with cone layers, fruit tree with colored dots)
- **Rocks**: cluster of 2-3 dodecahedrons at varying scales
- **New createFlowerCluster()**: 3-5 thin stems with tiny colored sphere tops
- **New createBush()**: flattened dark green sphere
- **New createFenceSegment()**: post + two horizontal rails
- **Upgraded createBuilding()**: house gets windows, chimney, porch; barn gets double doors, hay bales
- **Upgraded corn crop**: tall stalk with leaf planes and ear at stage 3

Full replacement code for AssetGenerator.js:

```javascript
// client/src/engine/AssetGenerator.js
import * as THREE from 'three';

export class AssetGenerator {
  constructor() {
    this._matCache = new Map();
  }

  getMaterial(color, options = {}) {
    const key = `${color}-${JSON.stringify(options)}`;
    if (!this._matCache.has(key)) {
      this._matCache.set(key, new THREE.MeshLambertMaterial({
        color, flatShading: true, ...options,
      }));
    }
    return this._matCache.get(key);
  }

  // ─── Seeded random helper for deterministic variation ───
  _seededRand(x, z) {
    const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  // ─── Trees (3 variants) ───

  createTree(variant = 0, seed = 0) {
    const group = new THREE.Group();
    const r = this._seededRand(seed, variant);
    const trunkH = 0.6 + r * 0.5;
    const trunkR = 0.08 + r * 0.06;

    // Trunk
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkR * 0.7, trunkR, trunkH, 5),
      this.getMaterial(0x6b3a2a)
    );
    trunk.position.y = trunkH / 2;
    trunk.castShadow = true;
    group.add(trunk);

    if (variant % 3 === 1) {
      // Pine: 3 stacked cones
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
      // Oak / Fruit tree: sphere clusters
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

      // Fruit tree: add small colored fruit spheres
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

    return group;
  }

  // ─── Rocks (cluster) ───

  createRock(oreType = null, seed = 0) {
    const group = new THREE.Group();
    const baseColor = oreType === 'copper' ? 0xb87333
      : oreType === 'iron' ? 0x888899
      : oreType === 'gold' ? 0xffd700 : 0x8a8a8a;

    const count = 2 + Math.floor(this._seededRand(seed, 7) * 2);
    for (let i = 0; i < count; i++) {
      const r = this._seededRand(seed + i, 13);
      const scale = 0.12 + r * 0.2;
      const colorVar = Math.floor((r - 0.5) * 30);
      const c = new THREE.Color(baseColor);
      c.r = Math.max(0, Math.min(1, c.r + colorVar / 255));
      c.g = Math.max(0, Math.min(1, c.g + colorVar / 255));
      c.b = Math.max(0, Math.min(1, c.b + colorVar / 255));

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

  // ─── Flowers (cluster) ───

  createFlowerCluster(seed = 0) {
    const group = new THREE.Group();
    const petalColors = [0xff4466, 0xffdd44, 0xff88cc, 0xaa66ff, 0xffffff, 0xff6633];
    const count = 3 + Math.floor(this._seededRand(seed, 3) * 3);

    for (let i = 0; i < count; i++) {
      const r = this._seededRand(seed + i, 19);
      const stemH = 0.08 + r * 0.14;
      const flowerGroup = new THREE.Group();

      // Stem
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.01, stemH, 3),
        this.getMaterial(0x2d7a1e)
      );
      stem.position.y = stemH / 2;
      flowerGroup.add(stem);

      // Flower head
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

  // ─── Bushes ───

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

  // ─── Fence segment ───

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

  // ─── Reeds (near water) ───

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

  // ─── Crops ───

  createCrop(cropType, stage) {
    const group = new THREE.Group();
    const scale = 0.2 + stage * 0.27;

    const colors = {
      wheat: 0xdaa520, corn: 0xf5d142, tomato: 0xe74c3c, carrot: 0xff8c00,
      potato: 0x8b7355, strawberry: 0xff3366, pumpkin: 0xff7518, blueberry: 0x4169e1,
    };
    const topColor = colors[cropType] || 0x44aa22;

    // Corn gets special tall treatment
    if (cropType === 'corn') {
      return this._createCorn(stage, scale);
    }

    // Standard crop
    const stemGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.5 * scale, 4);
    const stem = new THREE.Mesh(stemGeo, this.getMaterial(0x2d5a1e));
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

  _createCorn(stage, scale) {
    const group = new THREE.Group();
    const stalkH = 0.15 + stage * 0.2;

    // Stalk
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

    // Ear at stage 3
    if (stage >= 3) {
      const ear = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.025, 0.1, 5),
        this.getMaterial(0xf5d142)
      );
      ear.position.set(0.04, stalkH * 0.7, 0);
      ear.rotation.z = 0.3;
      group.add(ear);

      // Silk
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

  // ─── Buildings (upgraded) ───

  createBuilding(type) {
    const group = new THREE.Group();
    const configs = {
      house: { w: 2, h: 1.5, d: 2, color: 0xc4956a, roofColor: 0x8b4513 },
      barn: { w: 3, h: 2, d: 2.5, color: 0xcc3333, roofColor: 0x5c2a0e },
      coop: { w: 1.5, h: 1, d: 1.5, color: 0xdeb887, roofColor: 0x8b6914 },
      mill: { w: 1.5, h: 2.5, d: 1.5, color: 0xf5f5dc, roofColor: 0x666666 },
      shop: { w: 2, h: 1.5, d: 2, color: 0x6495ed, roofColor: 0x4169e1 },
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

    // Roof
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

    // Windows (both sides)
    const windowMat = this.getMaterial(0xaaddff, { emissive: 0x334455, emissiveIntensity: 0.3 });
    for (const side of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.25), windowMat);
      win.position.set(side * cfg.w * 0.3, cfg.h * 0.6, cfg.d / 2 + 0.01);
      group.add(win);

      // Side windows
      const sideWin = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.25), windowMat);
      sideWin.position.set(side * (cfg.w / 2 + 0.01), cfg.h * 0.6, 0);
      sideWin.rotation.y = Math.PI / 2;
      group.add(sideWin);
    }

    // House-specific: chimney + porch
    if (type === 'house') {
      const chimney = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.5, 0.25), this.getMaterial(0x884433)
      );
      chimney.position.set(cfg.w * 0.25, cfg.h + cfg.h * 0.35, -cfg.d * 0.2);
      chimney.castShadow = true;
      group.add(chimney);

      // Porch overhang
      const porch = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.w * 0.6, 0.04, 0.5), this.getMaterial(cfg.roofColor)
      );
      porch.position.set(0, cfg.h * 0.75, cfg.d / 2 + 0.25);
      group.add(porch);
    }

    // Barn-specific: double doors + hay bales
    if (type === 'barn') {
      // Override single door with double doors
      door.visible = false;
      for (const side of [-0.3, 0.3]) {
        const barnDoor = new THREE.Mesh(
          new THREE.PlaneGeometry(0.45, 1.0), this.getMaterial(0x5c2a0e)
        );
        barnDoor.position.set(side, 0.5, cfg.d / 2 + 0.01);
        group.add(barnDoor);
      }

      // Hay bales
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

  // ─── Animals ───

  createAnimal(type) {
    const group = new THREE.Group();
    const configs = {
      chicken: { bodyColor: 0xffffff, size: 0.2, legHeight: 0.1 },
      cow: { bodyColor: 0xf5f5f5, size: 0.5, legHeight: 0.3 },
      sheep: { bodyColor: 0xeeeeee, size: 0.4, legHeight: 0.25 },
      goat: { bodyColor: 0xccbbaa, size: 0.35, legHeight: 0.25 },
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

  // ─── Pets ───

  createPet(type, params = {}) {
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

    group.castShadow = true;
    return group;
  }

  // ─── NPC ───

  createNPC(params = {}) {
    const group = new THREE.Group();
    const { skinColor = 0xffcc99, shirtColor = 0x4488cc, hairColor = 0x332211 } = params;

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), this.getMaterial(shirtColor));
    body.position.y = 0.75;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), this.getMaterial(skinColor));
    head.position.y = 1.2;
    group.add(head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), this.getMaterial(hairColor));
    hair.position.y = 1.28;
    hair.scale.set(1, 0.6, 1);
    group.add(hair);

    const legGeo = new THREE.BoxGeometry(0.12, 0.4, 0.15);
    const legMat = this.getMaterial(0x334455);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(side * 0.1, 0.2, 0);
      group.add(leg);
    }

    const armGeo = new THREE.BoxGeometry(0.1, 0.4, 0.12);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, this.getMaterial(skinColor));
      arm.position.set(side * 0.28, 0.75, 0);
      group.add(arm);
    }

    group.castShadow = true;
    return group;
  }

  createPlayer(color = 0x4488ff) {
    return this.createNPC({ shirtColor: color });
  }

  dispose() {
    for (const mat of this._matCache.values()) mat.dispose();
    this._matCache.clear();
  }
}
```

**Step 2: Verify — restart client, check trees/rocks/buildings render without errors in console**

**Step 3: Commit**
```bash
git add client/src/engine/AssetGenerator.js
git commit -m "feat: upgrade AssetGenerator with detailed trees, rocks, flowers, bushes, fences, buildings"
```

---

### Task 3: Create DecorationGenerator (Server)

**Files:**
- Create: `server/game/DecorationGenerator.js`

**Step 1: Write DecorationGenerator**

Deterministically places decorations using the world seed and tile data. Returns an array of decoration objects sent to clients.

```javascript
// server/game/DecorationGenerator.js
import { WORLD_SIZE, TILE_TYPES } from '../../shared/constants.js';

export class DecorationGenerator {
  constructor(seed) {
    this.seed = seed;
  }

  _rand(x, z, salt = 0) {
    const n = Math.sin((x + salt) * 127.1 + (z + salt) * 311.7 + this.seed * 0.001) * 43758.5453;
    return n - Math.floor(n);
  }

  generate(tiles) {
    const decorations = [];
    const S = WORLD_SIZE;
    const cx = S / 2, cz = S / 2;

    // Farm zone: skip decorations here (buildings/crops go here)
    const farmLeft = cx - 7, farmRight = cx + 7;
    const farmTop = cz - 6, farmBottom = cz + 6;

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const { x, z, type } = tile;

      // Skip farm zone
      if (x >= farmLeft && x <= farmRight && z >= farmTop && z <= farmBottom) continue;

      const r = this._rand(x, z);
      const dx = (x - cx) / cx;
      const dz = (z - cz) / cz;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (type === TILE_TYPES.GRASS) {
        // Trees: more dense at edges, sparse near center
        const treeDensity = dist > 0.6 ? 0.25 : 0.08;
        if (r < treeDensity) {
          const variant = Math.floor(this._rand(x, z, 1) * 3);
          decorations.push({ type: 'tree', x, z, variant, rotation: r * Math.PI * 2 });
          continue;
        }

        // Flowers
        if (r < treeDensity + 0.08) {
          decorations.push({ type: 'flower', x, z, variant: 0, rotation: r * Math.PI });
          continue;
        }

        // Bushes
        if (r < treeDensity + 0.12) {
          decorations.push({ type: 'bush', x, z, variant: 0, rotation: r * Math.PI * 2 });
          continue;
        }
      }

      if (type === TILE_TYPES.STONE) {
        if (r < 0.4) {
          decorations.push({ type: 'rock', x, z, variant: 0, rotation: r * Math.PI * 2 });
        }
      }

      // Reeds near water
      if (type === TILE_TYPES.SAND) {
        if (r < 0.15) {
          decorations.push({ type: 'reeds', x, z, variant: 0, rotation: r * Math.PI * 2 });
        }
      }
    }

    // Fence around farm crop plot area (cx-1..cx+5, cz-2..cz+2)
    const fenceMinX = cx + 1, fenceMaxX = cx + 7;
    const fenceMinZ = cz - 3, fenceMaxZ = cz + 3;
    // Top and bottom edges
    for (let fx = fenceMinX; fx <= fenceMaxX; fx++) {
      decorations.push({ type: 'fence', x: fx, z: fenceMinZ, variant: 0, rotation: 0 });
      decorations.push({ type: 'fence', x: fx, z: fenceMaxZ, variant: 0, rotation: 0 });
    }
    // Left and right edges
    for (let fz = fenceMinZ; fz <= fenceMaxZ; fz++) {
      decorations.push({ type: 'fence', x: fenceMinX, z: fz, variant: 0, rotation: Math.PI / 2 });
      decorations.push({ type: 'fence', x: fenceMaxX, z: fz, variant: 0, rotation: Math.PI / 2 });
    }

    return decorations;
  }
}
```

**Step 2: Commit**
```bash
git add server/game/DecorationGenerator.js
git commit -m "feat: add DecorationGenerator for deterministic tree/rock/flower/fence placement"
```

---

### Task 4: Create DecorationRenderer (Client)

**Files:**
- Create: `client/src/world/DecorationRenderer.js`

**Step 1: Write DecorationRenderer**

```javascript
// client/src/world/DecorationRenderer.js
import * as THREE from 'three';
import { TILE_SIZE } from '@shared/constants.js';

export class DecorationRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.meshes = [];
  }

  build(decorations) {
    for (const dec of decorations) {
      let mesh;
      const worldX = dec.x * TILE_SIZE + TILE_SIZE / 2;
      const worldZ = dec.z * TILE_SIZE + TILE_SIZE / 2;
      const seed = dec.x * 1000 + dec.z;

      switch (dec.type) {
        case 'tree':
          mesh = this.assetGen.createTree(dec.variant, seed);
          break;
        case 'rock':
          mesh = this.assetGen.createRock(null, seed);
          break;
        case 'flower':
          mesh = this.assetGen.createFlowerCluster(seed);
          break;
        case 'bush':
          mesh = this.assetGen.createBush(seed);
          break;
        case 'fence':
          mesh = this.assetGen.createFenceSegment();
          break;
        case 'reeds':
          mesh = this.assetGen.createReeds(seed);
          break;
        default:
          continue;
      }

      mesh.position.set(worldX, 0, worldZ);
      mesh.rotation.y = dec.rotation || 0;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  update(delta) {
    // Subtle tree sway
    const time = Date.now() * 0.001;
    for (const mesh of this.meshes) {
      if (mesh.userData.type === 'tree') {
        mesh.rotation.z = Math.sin(time + mesh.position.x * 0.5) * 0.015;
      }
    }
  }

  dispose() {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
      });
    }
    this.meshes = [];
  }
}
```

**Step 2: Commit**
```bash
git add client/src/world/DecorationRenderer.js
git commit -m "feat: add DecorationRenderer for trees, rocks, flowers, bushes, fences"
```

---

### Task 5: Wire Everything Together — GameWorld + main.js

**Files:**
- Modify: `server/game/GameWorld.js`
- Modify: `client/src/main.js`

**Step 1: Update GameWorld to generate decorations + starter buildings**

Add DecorationGenerator import and usage, add starter buildings and crops to `_getFullState`. Key changes:
- Import and instantiate DecorationGenerator
- Generate decorations from tiles
- Add starter buildings (house, barn) to buildings Map
- Add starter crops (corn) to crops Map
- Include `decorations` in `_getFullState()` response

In `GameWorld` constructor, after `this.tiles = this.terrainGen.generate()`:
```javascript
import { DecorationGenerator } from './DecorationGenerator.js';
```

In constructor:
```javascript
this.decorationGen = new DecorationGenerator(seed);
this.decorations = this.decorationGen.generate(this.tiles);
this._initStarterFarm();
```

Add method:
```javascript
_initStarterFarm() {
  const cx = 32, cz = 32;

  // Only add starter buildings if buildings map is empty
  if (this.buildings.size > 0) return;

  this.buildings.set('house_main', {
    id: 'house_main', type: 'house', tileX: cx - 3, tileZ: cz - 1,
  });
  this.buildings.set('barn_main', {
    id: 'barn_main', type: 'barn', tileX: cx - 4, tileZ: cz + 3,
  });

  // Pre-till some crop plots and plant corn
  const tileIndex = (x, z) => z * 64 + x;
  for (let px = cx + 2; px <= cx + 6; px++) {
    for (let pz = cz - 2; pz <= cz + 2; pz++) {
      const idx = tileIndex(px, pz);
      if (idx >= 0 && idx < this.tiles.length) {
        this.tiles[idx].type = 6; // TILLED
      }
    }
  }

  // Plant some starter corn
  const Crop = (await import('../entities/Crop.js')).Crop;  // already imported at top
  for (let px = cx + 2; px <= cx + 5; px++) {
    for (let pz = cz - 1; pz <= cz + 1; pz++) {
      const crop = new Crop({ tileX: px, tileZ: pz, cropType: 'corn' });
      crop.stage = Math.floor(Math.random() * 3) + 1;
      this.crops.set(crop.id, crop);
    }
  }
}
```

Note: The Crop import is already at the top of GameWorld.js, so use it directly (no dynamic import needed). Use `new Crop(...)` directly.

In `_getFullState()`, add decorations:
```javascript
_getFullState(playerId) {
  return {
    playerId,
    tiles: this.tiles,
    decorations: this.decorations,  // ADD THIS
    crops: Array.from(this.crops.values()).map(c => c.getState()),
    // ... rest unchanged
  };
}
```

**Step 2: Update main.js to wire DecorationRenderer**

Add import and usage:
```javascript
import { DecorationRenderer } from './world/DecorationRenderer.js';
```

After creating other renderers:
```javascript
const decorations = new DecorationRenderer(sceneManager.scene, assets);
```

After `buildings.build(state.buildings)`:
```javascript
decorations.build(state.decorations || []);
```

In the render loop, add:
```javascript
decorations.update(delta);
```

**Step 3: Commit**
```bash
git add server/game/GameWorld.js client/src/main.js
git commit -m "feat: wire decoration system and starter farm with house, barn, corn"
```

---

### Task 6: Warm Golden-Hour Lighting

**Files:**
- Modify: `client/src/engine/SceneManager.js`

**Step 1: Update _setupLighting()**

```javascript
_setupLighting() {
  // Ambient — warm soft fill
  const ambient = new THREE.AmbientLight(0xfff8ee, 0.55);
  this.scene.add(ambient);

  // Sun — warm golden-hour, lower angle for longer shadows
  this.sunLight = new THREE.DirectionalLight(0xffe0a0, 1.1);
  this.sunLight.position.set(20, 30, 15);
  this.sunLight.castShadow = true;
  this.sunLight.shadow.mapSize.set(2048, 2048);
  this.sunLight.shadow.camera.left = -50;
  this.sunLight.shadow.camera.right = 50;
  this.sunLight.shadow.camera.top = 50;
  this.sunLight.shadow.camera.bottom = -50;
  this.sunLight.shadow.camera.near = 1;
  this.sunLight.shadow.camera.far = 120;
  this.scene.add(this.sunLight);

  // Hemisphere — warm sky to earthy ground
  const hemi = new THREE.HemisphereLight(0x88ccee, 0x4a7a2a, 0.35);
  this.scene.add(hemi);
}
```

**Step 2: Commit**
```bash
git add client/src/engine/SceneManager.js
git commit -m "feat: warm golden-hour lighting with longer shadows"
```

---

### Task 7: Final Verification

**Step 1: Delete old database**
```bash
rm -f ourfarm.db ourfarm.db-shm ourfarm.db-wal
```

**Step 2: Start fresh**
```bash
npm run dev
```

**Step 3: Visual verification checklist**
- [ ] Terrain has natural zones: green grassland, dirt farm area, pond with sandy beach, stone edges
- [ ] Trees scattered across grassland, denser at edges (oak, pine, fruit tree variants)
- [ ] Flower clusters dotting grass areas
- [ ] Bushes along paths and scattered
- [ ] Rock clusters on stone tiles
- [ ] Reeds near water's edge
- [ ] Fence around crop plot area
- [ ] House with windows, chimney, porch near farm center
- [ ] Barn with double doors and hay bales
- [ ] Corn at various growth stages in tilled plot
- [ ] Warm golden lighting with visible shadows
- [ ] Path curving from farm northward
- [ ] No console errors

**Step 4: Final commit**
```bash
git add -A
git commit -m "feat: complete farm visual overhaul — zoned terrain, decorations, warm lighting"
```
