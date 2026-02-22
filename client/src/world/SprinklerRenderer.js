import * as THREE from 'three';
import { TILE_SIZE } from '@shared/constants.js';

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

    // Base cylinder
    const baseGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.12, 6);
    const baseMat = new THREE.MeshPhongMaterial({
      color: data.type === 'sprinkler_iridium' ? 0x8844aa :
             data.type === 'sprinkler_quality' ? 0xccaa44 : 0x888888,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.06;
    group.add(base);

    // Top nozzle
    const nozzleGeo = new THREE.CylinderGeometry(0.02, 0.04, 0.06, 6);
    const nozzle = new THREE.Mesh(nozzleGeo, baseMat);
    nozzle.position.y = 0.15;
    group.add(nozzle);

    const wx = data.tileX * TILE_SIZE + TILE_SIZE / 2;
    const wz = data.tileZ * TILE_SIZE + TILE_SIZE / 2;
    group.position.set(wx, 0, wz);

    this.scene.add(group);
    this.sprinklerMeshes.set(data.id, { mesh: group, data });
  }

  removeSprinkler(id) {
    const entry = this.sprinklerMeshes.get(id);
    if (entry) {
      this.scene.remove(entry.mesh);
      entry.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
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
