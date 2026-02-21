// client/src/entities/PlayerRenderer.js
import { tileToWorld } from '@shared/TileMap.js';

export class PlayerRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.playerMeshes = new Map();
  }

  addPlayer(playerState, isLocal = false) {
    const mesh = this.assetGen.createPlayer(isLocal ? 0x4488ff : 0x44cc44);
    mesh.position.set(playerState.x, 0, playerState.z);
    this.scene.add(mesh);
    this.playerMeshes.set(playerState.id, { mesh, target: { x: playerState.x, z: playerState.z } });
  }

  updatePosition(playerId, x, z) {
    const entry = this.playerMeshes.get(playerId);
    if (entry) {
      entry.target = { x, z };
    }
  }

  removePlayer(playerId) {
    const entry = this.playerMeshes.get(playerId);
    if (entry) {
      this.scene.remove(entry.mesh);
      this.playerMeshes.delete(playerId);
    }
  }

  update(delta) {
    // Smooth interpolation toward target position
    for (const { mesh, target } of this.playerMeshes.values()) {
      mesh.position.x += (target.x - mesh.position.x) * 5 * delta;
      mesh.position.z += (target.z - mesh.position.z) * 5 * delta;
    }
  }

  getLocalPlayerPosition(playerId) {
    const entry = this.playerMeshes.get(playerId);
    return entry ? entry.mesh.position : null;
  }

  dispose() {
    for (const { mesh } of this.playerMeshes.values()) this.scene.remove(mesh);
    this.playerMeshes.clear();
  }
}
