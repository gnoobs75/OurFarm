// client/src/engine/AssetGenerator.js
// Factory for procedurally generated low-poly meshes and materials.
// All game visuals are created here — no external texture files needed.

import * as THREE from 'three';

export class AssetGenerator {
  constructor() {
    this._geoCache = new Map();
    this._matCache = new Map();
  }

  /** Get or create a cached material */
  getMaterial(color, options = {}) {
    const key = `${color}-${JSON.stringify(options)}`;
    if (!this._matCache.has(key)) {
      this._matCache.set(key, new THREE.MeshLambertMaterial({
        color,
        flatShading: true,
        ...options,
      }));
    }
    return this._matCache.get(key);
  }

  // ─── Crops ───

  createCrop(cropType, stage) {
    const group = new THREE.Group();
    const scale = 0.2 + stage * 0.27;

    const stemGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.5 * scale, 4);
    const stemMat = this.getMaterial(0x2d5a1e);
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.25 * scale;
    group.add(stem);

    if (stage >= 1) {
      const colors = {
        wheat: 0xdaa520, corn: 0xf5d142, tomato: 0xe74c3c, carrot: 0xff8c00,
        potato: 0x8b7355, strawberry: 0xff3366, pumpkin: 0xff7518, blueberry: 0x4169e1,
      };
      const topColor = colors[cropType] || 0x44aa22;

      if (stage === 1) {
        const leafGeo = new THREE.SphereGeometry(0.08, 4, 3);
        const leaf = new THREE.Mesh(leafGeo, this.getMaterial(0x44aa22));
        leaf.position.y = 0.5 * scale;
        group.add(leaf);
      } else if (stage === 2) {
        const leafGeo = new THREE.SphereGeometry(0.15, 5, 3);
        const leaf = new THREE.Mesh(leafGeo, this.getMaterial(0x3d9930));
        leaf.position.y = 0.5 * scale;
        leaf.scale.y = 0.6;
        group.add(leaf);
      } else if (stage === 3) {
        const leafGeo = new THREE.SphereGeometry(0.12, 5, 3);
        const leaf = new THREE.Mesh(leafGeo, this.getMaterial(0x3d9930));
        leaf.position.y = 0.45 * scale;
        leaf.scale.y = 0.6;
        group.add(leaf);

        const fruitGeo = new THREE.SphereGeometry(0.1, 5, 4);
        const fruit = new THREE.Mesh(fruitGeo, this.getMaterial(topColor));
        fruit.position.set(0.05, 0.55 * scale, 0.05);
        group.add(fruit);
      }
    }

    group.castShadow = true;
    return group;
  }

  // ─── Trees ───

  createTree(variant = 0) {
    const group = new THREE.Group();

    const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, 0.8, 5);
    const trunk = new THREE.Mesh(trunkGeo, this.getMaterial(0x5c3a1e));
    trunk.position.y = 0.4;
    trunk.castShadow = true;
    group.add(trunk);

    const leafColor = [0x2d8a4e, 0x3da85a, 0x228b22][variant % 3];
    const leafMat = this.getMaterial(leafColor);
    for (let i = 0; i < 3; i++) {
      const coneGeo = new THREE.ConeGeometry(0.5 - i * 0.1, 0.5, 6);
      const cone = new THREE.Mesh(coneGeo, leafMat);
      cone.position.y = 0.9 + i * 0.3;
      cone.castShadow = true;
      group.add(cone);
    }

    return group;
  }

  // ─── Buildings ───

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

    const walls = new THREE.Mesh(new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d), this.getMaterial(cfg.color));
    walls.position.y = cfg.h / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(cfg.w * 0.8, cfg.h * 0.5, 4), this.getMaterial(cfg.roofColor));
    roof.position.y = cfg.h + cfg.h * 0.25;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.6), this.getMaterial(0x5c2a0e));
    door.position.set(0, 0.3, cfg.d / 2 + 0.01);
    group.add(door);

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

    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, tailLength, 4), bodyMat);
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

  // ─── Player ───

  createPlayer(color = 0x4488ff) {
    return this.createNPC({ shirtColor: color });
  }

  // ─── Rocks / Ore ───

  createRock(oreType = null) {
    const color = oreType === 'copper' ? 0xb87333
      : oreType === 'iron' ? 0x888899
      : oreType === 'gold' ? 0xffd700 : 0x777777;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25, 0), this.getMaterial(color));
    rock.position.y = 0.15;
    rock.castShadow = true;
    return rock;
  }

  dispose() {
    for (const geo of this._geoCache.values()) geo.dispose();
    for (const mat of this._matCache.values()) mat.dispose();
    this._geoCache.clear();
    this._matCache.clear();
  }
}
