// client/src/world/CropRenderer.js
import * as THREE from 'three';
import { tileToWorld } from '@shared/TileMap.js';

export class CropRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.cropMeshes = new Map(); // cropId -> THREE.Group
  }

  build(crops) {
    for (const crop of crops) {
      this.addCrop(crop);
    }
  }

  addCrop(crop) {
    if (this.cropMeshes.has(crop.id)) this.removeCrop(crop.id);
    const mesh = this.assetGen.createCrop(crop.cropType, crop.stage);
    const pos = tileToWorld(crop.tileX, crop.tileZ);
    mesh.position.set(pos.x, 0, pos.z);
    this.scene.add(mesh);
    this.cropMeshes.set(crop.id, { mesh, data: crop });
  }

  updateCrop(cropId, newStage) {
    const entry = this.cropMeshes.get(cropId);
    if (!entry) return;
    this.scene.remove(entry.mesh);
    entry.data.stage = newStage;
    const newMesh = this.assetGen.createCrop(entry.data.cropType, newStage);
    newMesh.position.copy(entry.mesh.position);
    this.scene.add(newMesh);
    entry.mesh = newMesh;
  }

  removeCrop(cropId) {
    const entry = this.cropMeshes.get(cropId);
    if (entry) {
      this.scene.remove(entry.mesh);
      this.cropMeshes.delete(cropId);
    }
  }

  update(delta) {
    // Gentle swaying animation
    for (const { mesh } of this.cropMeshes.values()) {
      mesh.rotation.z = Math.sin(Date.now() * 0.001 + mesh.position.x) * 0.05;
    }
  }

  dispose() {
    for (const { mesh } of this.cropMeshes.values()) {
      this.scene.remove(mesh);
    }
    this.cropMeshes.clear();
  }
}
