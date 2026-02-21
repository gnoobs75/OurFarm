// client/src/world/BuildingRenderer.js
export class BuildingRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.buildingMeshes = new Map();
  }

  build(buildings) {
    for (const b of buildings) {
      const mesh = this.assetGen.createBuilding(b.type);
      mesh.position.set(b.tile_x || b.tileX, 0, b.tile_z || b.tileZ);
      this.scene.add(mesh);
      this.buildingMeshes.set(b.id, mesh);
    }
  }

  dispose() {
    for (const mesh of this.buildingMeshes.values()) this.scene.remove(mesh);
    this.buildingMeshes.clear();
  }
}
