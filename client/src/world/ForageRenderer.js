// client/src/world/ForageRenderer.js
// Renders forage items as small colored plant/mushroom shapes on grass tiles.

import * as THREE from 'three';
import { TILE_SIZE } from '@shared/constants.js';
import { getItemIcon } from '../ui/ItemIcons.js';

export class ForageRenderer {
  constructor(scene) {
    this.scene = scene;
    this.forageMeshes = new Map();
  }

  build(forageItems) {
    for (const item of forageItems) {
      this.addForageItem(item);
    }
  }

  addForageItem(data) {
    const group = new THREE.Group();
    const icon = getItemIcon(data.itemId);
    const color = icon ? parseInt(icon.color.replace('#', '0x')) : 0x44AA44;

    // Small plant/mushroom shape
    const stemGeo = new THREE.CylinderGeometry(0.01, 0.015, 0.06, 4);
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x228B22, flatShading: true });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.03;
    group.add(stem);

    const topGeo = new THREE.SphereGeometry(0.04, 6, 4);
    const topMat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 0.07;
    group.add(top);

    // Add a subtle glow/highlight ring so players notice them
    const ringGeo = new THREE.RingGeometry(0.06, 0.08, 8);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xFFFF88, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    group.add(ring);

    const wx = data.tileX * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * 0.3;
    const wz = data.tileZ * TILE_SIZE + TILE_SIZE / 2 + (Math.random() - 0.5) * 0.3;
    group.position.set(wx, 0, wz);

    this.scene.add(group);
    this.forageMeshes.set(data.id, { mesh: group, data });
  }

  removeForageItem(id) {
    const entry = this.forageMeshes.get(id);
    if (entry) {
      this.scene.remove(entry.mesh);
      entry.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.forageMeshes.delete(id);
    }
  }

  dispose() {
    for (const [id] of this.forageMeshes) {
      this.removeForageItem(id);
    }
  }
}
