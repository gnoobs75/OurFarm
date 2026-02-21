// client/src/entities/NPCRenderer.js
export class NPCRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.npcMeshes = new Map();
  }

  build(npcs) {
    for (const npc of npcs) {
      const mesh = this.assetGen.createNPC({
        skinColor: parseInt(npc.skinColor),
        shirtColor: parseInt(npc.shirtColor),
        hairColor: parseInt(npc.hairColor),
      });
      mesh.position.set(npc.x, 0, npc.z);
      mesh.userData = { npcId: npc.id, name: npc.name };
      this.scene.add(mesh);
      this.npcMeshes.set(npc.id, { mesh, target: { x: npc.x, z: npc.z } });
    }
  }

  updatePositions(npcs) {
    for (const npc of npcs) {
      const entry = this.npcMeshes.get(npc.id);
      if (entry) entry.target = { x: npc.x, z: npc.z };
    }
  }

  update(delta) {
    for (const { mesh, target } of this.npcMeshes.values()) {
      mesh.position.x += (target.x - mesh.position.x) * 2 * delta;
      mesh.position.z += (target.z - mesh.position.z) * 2 * delta;
    }
  }

  getNPCAtPosition(x, z, radius = 1.5) {
    for (const [id, { mesh }] of this.npcMeshes) {
      const dx = mesh.position.x - x;
      const dz = mesh.position.z - z;
      if (Math.sqrt(dx * dx + dz * dz) < radius) {
        return mesh.userData.npcId;
      }
    }
    return null;
  }

  dispose() {
    for (const { mesh } of this.npcMeshes.values()) this.scene.remove(mesh);
    this.npcMeshes.clear();
  }
}
