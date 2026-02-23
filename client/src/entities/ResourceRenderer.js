// client/src/entities/ResourceRenderer.js
// Renders farm trees and rocks as individual Three.js meshes (not batched),
// enabling per-resource interaction: shake on hit, removal, stump conversion.

import * as THREE from 'three';
import { TILE_SIZE } from '@shared/constants.js';

export class ResourceRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this._entries = new Map(); // resourceId -> { mesh, data, shakeTime }
    this._elapsed = 0;
  }

  /** Build all resource meshes from initial server data */
  build(resources) {
    for (const res of resources) this.addResource(res);
  }

  /** Add a single resource mesh to the scene */
  addResource(res) {
    let mesh;
    if (res.type === 'tree') {
      if (res.isStump) {
        mesh = this.assetGen.createStump
          ? this.assetGen.createStump(res.variant)
          : this._createFallbackStump();
      } else {
        mesh = this.assetGen.createTree(res.variant, res.tileX * 1000 + res.tileZ);
      }
    } else if (res.type === 'rock') {
      mesh = this.assetGen.createRock(null, res.tileX * 1000 + res.tileZ);
    }
    if (!mesh) return;

    mesh.position.set(
      res.tileX * TILE_SIZE + TILE_SIZE / 2, 0,
      res.tileZ * TILE_SIZE + TILE_SIZE / 2
    );
    mesh.userData.resourceId = res.id;
    mesh.userData.resourceType = res.type;
    this.scene.add(mesh);
    this._entries.set(res.id, { mesh, data: res, shakeTime: 0 });
  }

  /** Called when server says resource was hit (not destroyed) */
  onResourceHit(resourceId) {
    const entry = this._entries.get(resourceId);
    if (entry) entry.shakeTime = 0.3;
  }

  /** Called when a resource changes state (e.g. tree becomes stump) */
  onResourceUpdate(res) {
    this.removeResource(res.id);
    this.addResource(res);
  }

  /** Called when a resource is fully removed */
  removeResource(resourceId) {
    const entry = this._entries.get(resourceId);
    if (!entry) return;
    this.scene.remove(entry.mesh);
    entry.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); });
    this._entries.delete(resourceId);
  }

  /** Per-frame update: shake animation and gentle tree sway */
  update(delta) {
    this._elapsed += delta;
    for (const entry of this._entries.values()) {
      if (entry.shakeTime > 0) {
        entry.shakeTime -= delta;
        const intensity = entry.shakeTime * 10;
        entry.mesh.rotation.z = Math.sin(this._elapsed * 40) * 0.05 * intensity;
      } else {
        entry.mesh.rotation.z = 0;
      }
      // Gentle tree sway
      if (entry.data.type === 'tree' && !entry.data.isStump) {
        const sway = Math.sin(this._elapsed * 1.5 + entry.mesh.position.x * 0.5) * 0.01;
        entry.mesh.rotation.x = sway;
      }
    }
  }

  /** Find a resource at a given tile position */
  getResourceAtTile(tileX, tileZ) {
    for (const entry of this._entries.values()) {
      if (entry.data.tileX === tileX && entry.data.tileZ === tileZ) return entry.data;
    }
    return null;
  }

  /** Clean up all meshes and geometries */
  dispose() {
    for (const entry of this._entries.values()) {
      this.scene.remove(entry.mesh);
      entry.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); });
    }
    this._entries.clear();
  }

  /** Temporary stump mesh until AssetGenerator.createStump is added (Task 7) */
  _createFallbackStump() {
    const group = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.15, 0.18, 0.15, 8);
    const mat = new THREE.MeshPhongMaterial({ color: 0x8b6914 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.075;
    mesh.castShadow = true;
    group.add(mesh);
    return group;
  }
}
