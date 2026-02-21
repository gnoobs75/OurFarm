// client/src/entities/NPCRenderer.js
// Renders NPCs with walking/idle animations and floating name labels.

import * as THREE from 'three';

const MOVE_LERP = 2;
const WALK_SPEED = 6;
const ARRIVE_THRESHOLD = 0.1;

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
      mesh.userData.npcId = npc.id;
      mesh.userData.name = npc.name;

      // Floating name label
      const label = this._createNameLabel(npc.name, npc.role || '');
      mesh.add(label);

      this.scene.add(mesh);
      this.npcMeshes.set(npc.id, {
        mesh,
        target: { x: npc.x, z: npc.z },
        state: 'idle',
        walkPhase: 0,
        idleTime: Math.random() * 10, // offset so NPCs don't breathe in sync
      });
    }
  }

  _createNameLabel(name, role) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 24);

    // Role
    if (role) {
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '16px sans-serif';
      ctx.fillText(role, 128, 46);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.2, 0.3, 1);
    sprite.position.y = 1.7;
    return sprite;
  }

  updatePositions(npcs) {
    for (const npc of npcs) {
      const entry = this.npcMeshes.get(npc.id);
      if (entry) entry.target = { x: npc.x, z: npc.z };
    }
  }

  update(delta) {
    for (const entry of this.npcMeshes.values()) {
      const { mesh, target } = entry;
      const parts = mesh.userData.parts;
      if (!parts) {
        // Fallback for meshes without pivot groups
        mesh.position.x += (target.x - mesh.position.x) * MOVE_LERP * delta;
        mesh.position.z += (target.z - mesh.position.z) * MOVE_LERP * delta;
        continue;
      }

      const dx = target.x - mesh.position.x;
      const dz = target.z - mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > ARRIVE_THRESHOLD) {
        entry.state = 'walking';
        mesh.rotation.y = Math.atan2(dx, dz);
        mesh.position.x += dx * MOVE_LERP * delta;
        mesh.position.z += dz * MOVE_LERP * delta;
      } else if (entry.state === 'walking') {
        entry.state = 'idle';
        entry.walkPhase = 0;
        this._resetPose(parts);
      }

      if (entry.state === 'walking') {
        this._animateWalk(entry, parts, delta);
      } else {
        this._animateIdle(entry, parts, delta);
      }
    }
  }

  _animateWalk(entry, parts, delta) {
    entry.walkPhase += delta * WALK_SPEED;
    const s = Math.sin(entry.walkPhase);
    const c = Math.cos(entry.walkPhase);

    // Legs swing opposite
    parts.leftLegPivot.rotation.x = s * 0.5;
    parts.rightLegPivot.rotation.x = -s * 0.5;

    // Arms swing opposite to legs
    parts.leftArmPivot.rotation.x = -s * 0.4;
    parts.rightArmPivot.rotation.x = s * 0.4;

    // Body bob
    parts.body.position.y = 0.75 + Math.abs(c) * 0.02;
    parts.head.position.y = 1.2 + Math.abs(c) * 0.015;
    parts.hair.position.y = 1.28 + Math.abs(c) * 0.015;
  }

  _animateIdle(entry, parts, delta) {
    entry.idleTime += delta;
    const t = entry.idleTime;

    // Gentle breathing
    const breath = Math.sin(t * 1.2) * 0.008;
    parts.body.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath);

    // Subtle weight shift
    parts.body.rotation.z = Math.sin(t * 0.3) * 0.01;

    // Arms hang with slight sway
    parts.leftArmPivot.rotation.x = Math.sin(t * 0.5) * 0.02;
    parts.rightArmPivot.rotation.x = Math.sin(t * 0.5 + 0.5) * 0.02;
  }

  _resetPose(parts) {
    parts.leftLegPivot.rotation.set(0, 0, 0);
    parts.rightLegPivot.rotation.set(0, 0, 0);
    parts.leftArmPivot.rotation.set(0, 0, 0);
    parts.rightArmPivot.rotation.set(0, 0, 0);
    parts.body.position.y = 0.75;
    parts.body.rotation.set(0, 0, 0);
    parts.body.scale.set(1, 1, 1);
    parts.head.position.y = 1.2;
    parts.head.rotation.set(0, 0, 0);
    parts.hair.position.y = 1.28;
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
