// client/src/entities/AnimalRenderer.js
export class AnimalRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.animalMeshes = new Map();
  }

  build(animals) {
    for (const animal of animals) {
      const mesh = this.assetGen.createAnimal(animal.type);
      mesh.position.set(animal.x, 0, animal.z);
      this.scene.add(mesh);
      this.animalMeshes.set(animal.id, { mesh, data: animal });
    }
  }

  update(delta) {
    // Animals wander slightly
    for (const { mesh, data } of this.animalMeshes.values()) {
      mesh.position.y = Math.sin(Date.now() * 0.002) * 0.01;
      mesh.rotation.y += Math.sin(Date.now() * 0.0005 + mesh.position.x) * 0.001;
    }
  }

  getAnimalAtPosition(worldX, worldZ) {
    const threshold = 0.8;
    for (const [id, entry] of this.animalMeshes) {
      const dx = entry.mesh.position.x - worldX;
      const dz = entry.mesh.position.z - worldZ;
      if (Math.sqrt(dx * dx + dz * dz) < threshold) return id;
    }
    return null;
  }

  dispose() {
    for (const { mesh } of this.animalMeshes.values()) this.scene.remove(mesh);
    this.animalMeshes.clear();
  }
}
