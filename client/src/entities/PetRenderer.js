// client/src/entities/PetRenderer.js
export class PetRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.petMeshes = new Map();
  }

  build(pets) {
    for (const pet of pets) this.addPet(pet);
  }

  addPet(pet) {
    const mesh = this.assetGen.createPet(pet.type, {
      bodySize: pet.bodySize,
      earSize: pet.earSize,
      tailLength: pet.tailLength,
      color: pet.color,
    });
    mesh.position.set(pet.x, 0, pet.z);
    mesh.userData = { petId: pet.id, name: pet.name };
    this.scene.add(mesh);
    this.petMeshes.set(pet.id, { mesh, data: pet });
  }

  update(delta) {
    // Pets idle — slight bobbing
    for (const { mesh } of this.petMeshes.values()) {
      mesh.position.y = Math.sin(Date.now() * 0.003 + mesh.position.x) * 0.02;
    }
  }

  dispose() {
    for (const { mesh } of this.petMeshes.values()) this.scene.remove(mesh);
    this.petMeshes.clear();
  }
}
