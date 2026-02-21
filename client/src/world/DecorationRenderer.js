// client/src/world/DecorationRenderer.js
// Renders world decorations: trees, rocks, flowers, bushes, fences, reeds.
// Receives decoration data from server and creates 3D meshes using AssetGenerator.

import { TILE_SIZE } from '@shared/constants.js';

export class DecorationRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.meshes = [];
  }

  /** Build all decoration meshes from server data */
  build(decorations, season = 0) {
    for (const dec of decorations) {
      let mesh;
      const worldX = dec.x * TILE_SIZE + TILE_SIZE / 2;
      const worldZ = dec.z * TILE_SIZE + TILE_SIZE / 2;
      const seed = dec.x * 1000 + dec.z;

      switch (dec.type) {
        case 'tree':
          mesh = this.assetGen.createTree(dec.variant, seed, season);
          mesh.userData.type = 'tree';
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

  /** Rebuild all decorations for a new season */
  rebuild(decorations, season) {
    this.dispose();
    this.build(decorations, season);
  }

  /** Per-frame update — subtle tree sway */
  update(delta) {
    const time = Date.now() * 0.001;
    for (const mesh of this.meshes) {
      if (mesh.userData.type === 'tree') {
        mesh.rotation.z = Math.sin(time + mesh.position.x * 0.5) * 0.012;
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
