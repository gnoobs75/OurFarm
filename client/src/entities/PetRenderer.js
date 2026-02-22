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
    mesh.userData.petId = pet.id;
    mesh.userData.name = pet.name;
    this.scene.add(mesh);
    this.petMeshes.set(pet.id, { mesh, data: pet });
  }

  update(delta) {
    // Pets idle — slight bobbing
    for (const { mesh } of this.petMeshes.values()) {
      mesh.position.y = Math.sin(Date.now() * 0.003 + mesh.position.x) * 0.02;
      const parts = mesh.userData.parts;
      if (parts?.tail) {
        const tailSeg = Array.isArray(parts.tail) ? parts.tail[0] : parts.tail;
        if (tailSeg) tailSeg.rotation.y = Math.sin(Date.now() * 0.005) * 0.3;
      }
    }
  }

  getPetAtPosition(worldX, worldZ) {
    const threshold = 0.6;
    for (const [id, entry] of this.petMeshes) {
      const dx = entry.mesh.position.x - worldX;
      const dz = entry.mesh.position.z - worldZ;
      if (Math.sqrt(dx * dx + dz * dz) < threshold) return id;
    }
    return null;
  }

  dispose() {
    for (const { mesh } of this.petMeshes.values()) this.scene.remove(mesh);
    this.petMeshes.clear();
  }
}
