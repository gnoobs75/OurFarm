// client/src/entities/NPCRenderer.js
// NPC rendering with walking animation, idle breathing, head tracking, and personality gestures.
import * as THREE from 'three';

// ─── Shared blob shadow geometry / material (reused across all NPCs) ───
let _shadowGeo = null;
let _shadowMat = null;

function _createShadow(radius) {
  if (!_shadowGeo) {
    _shadowGeo = new THREE.CircleGeometry(1, 16); // unit circle, scaled per-instance
    _shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
  }
  const shadow = new THREE.Mesh(_shadowGeo, _shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(radius, radius, 1);
  shadow.position.y = 0.02;
  shadow.renderOrder = -1;
  return shadow;
}

const NPC_WALK_SPEED = 6;
const NPC_MOVE_LERP = 2;
const ARRIVE_THRESHOLD = 0.1;

const GESTURE_MAP = {
  cheerful: ['wave', 'bounce'],
  grumpy: ['crossArms', 'headShake'],
  shy: ['lookAway', 'fidget'],
  'laid-back': ['stretch', 'lean'],
  formal: ['handsBehind', 'nod'],
  caring: ['headTilt', 'gentleWave'],
};

export class NPCRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.npcMeshes = new Map();
    this.playerX = undefined;
    this.playerZ = undefined;
  }

  build(npcs) {
    for (const npc of npcs) {
      const mesh = this.assetGen.createNPC({
        skinColor: parseInt(npc.skinColor),
        shirtColor: parseInt(npc.shirtColor),
        hairColor: parseInt(npc.hairColor),
        hairStyle: npc.hairStyle || 'round',
        accessory: npc.accessory || null,
      });
      mesh.position.set(npc.x, 0, npc.z);
      mesh.userData.npcId = npc.id;
      mesh.userData.name = npc.name;
      mesh.userData.role = npc.role;

      // Blob shadow — child of group so it follows XZ automatically
      const shadow = _createShadow(0.25);
      mesh.add(shadow);

      this.scene.add(mesh);
      this.npcMeshes.set(npc.id, {
        mesh,
        target: { x: npc.x, z: npc.z },
        personality: npc.personality,
        state: 'idle',
        walkPhase: 0,
        idleTime: 0,
        hairBaseY: mesh.userData.parts?.hair?.position?.y ?? 1.28,
        gestureTimer: 5 + Math.random() * 7,
        currentGesture: null,
        gestureProgress: 0,
      });
    }
  }

  setPlayerPosition(x, z) {
    this.playerX = x;
    this.playerZ = z;
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
      if (!parts) continue;

      const dx = target.x - mesh.position.x;
      const dz = target.z - mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > ARRIVE_THRESHOLD) {
        // --- Walking state ---
        if (entry.state !== 'walking') {
          entry.state = 'walking';
          entry.currentGesture = null;
          entry.gestureProgress = 0;
        }

        // Face direction
        mesh.rotation.y = Math.atan2(dx, dz);

        // Move toward target
        mesh.position.x += dx * NPC_MOVE_LERP * delta;
        mesh.position.z += dz * NPC_MOVE_LERP * delta;

        // Walk animation
        entry.walkPhase += delta * NPC_WALK_SPEED;
        const s = Math.sin(entry.walkPhase);
        const c = Math.cos(entry.walkPhase);
        parts.leftLegPivot.rotation.x = s * 0.6;
        parts.rightLegPivot.rotation.x = -s * 0.6;
        parts.leftArmPivot.rotation.x = -s * 0.5;
        parts.rightArmPivot.rotation.x = s * 0.5;
        parts.body.position.y = 0.75 + Math.abs(c) * 0.03;
        parts.head.position.y = 1.2 + Math.abs(c) * 0.02;
        if (parts.hair) parts.hair.position.y = entry.hairBaseY + Math.abs(c) * 0.02;
        parts.body.rotation.z = s * 0.03;
      } else {
        // --- Idle state ---
        if (entry.state === 'walking') {
          entry.state = 'idle';
          entry.walkPhase = 0;
          this._resetPose(parts, entry);
        }

        // Idle breathing animation
        entry.idleTime += delta;
        const t = entry.idleTime;
        const breath = Math.sin(t * 1.5) * 0.01;
        parts.body.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath);
        parts.body.rotation.z = Math.sin(t * 0.4) * 0.015;
        parts.leftArmPivot.rotation.x = Math.sin(t * 0.7) * 0.03;
        parts.rightArmPivot.rotation.x = Math.sin(t * 0.7 + 0.5) * 0.03;

        // Gesture trigger
        entry.gestureTimer -= delta;
        if (entry.gestureTimer <= 0 && !entry.currentGesture) {
          const gestures = GESTURE_MAP[entry.personality];
          if (gestures) {
            entry.currentGesture = gestures[Math.floor(Math.random() * gestures.length)];
            entry.gestureProgress = 0;
          }
          entry.gestureTimer = 5 + Math.random() * 7;
        }
        if (entry.currentGesture) {
          entry.gestureProgress += delta;
          this._animateGesture(entry, parts);
        }
      }

      // --- Head tracking ---
      if (this.playerX !== undefined) {
        // Skip head tracking during head-related gestures
        if (entry.currentGesture !== 'headShake' && entry.currentGesture !== 'lookAway') {
          const pdx = this.playerX - mesh.position.x;
          const pdz = this.playerZ - mesh.position.z;
          const playerDist = Math.sqrt(pdx * pdx + pdz * pdz);
          if (playerDist < 4 && parts.head) {
            const angle = Math.atan2(pdx, pdz) - mesh.rotation.y;
            const clamped = Math.max(-0.7, Math.min(0.7, angle));
            parts.head.rotation.y += (clamped - parts.head.rotation.y) * 0.05;
          }
        }
      }
    }
  }

  _resetPose(parts, entry) {
    parts.leftLegPivot.rotation.set(0, 0, 0);
    parts.rightLegPivot.rotation.set(0, 0, 0);
    parts.leftArmPivot.rotation.set(0, 0, 0);
    parts.rightArmPivot.rotation.set(0, 0, 0);
    parts.body.position.y = 0.75;
    parts.body.rotation.set(0, 0, 0);
    parts.body.scale.set(1, 1, 1);
    parts.head.position.y = 1.2;
    parts.head.rotation.set(0, 0, 0);
    if (parts.hair) parts.hair.position.y = entry.hairBaseY;
  }

  _animateGesture(entry, parts) {
    const t = entry.gestureProgress;

    switch (entry.currentGesture) {
      case 'wave': {
        const dur = 0.6;
        if (t < dur) {
          parts.rightArmPivot.rotation.x = -1.2 * Math.sin((t / dur) * Math.PI);
        } else {
          entry.currentGesture = null;
          this._resetPose(parts, entry);
        }
        break;
      }
      case 'bounce': {
        const dur = 0.3;
        if (t < dur) {
          parts.body.position.y = 0.75 + 0.05 * Math.sin((t / dur) * Math.PI);
        } else {
          entry.currentGesture = null;
          this._resetPose(parts, entry);
        }
        break;
      }
      case 'crossArms': {
        const dur = 1.5;
        if (t < dur) {
          let intensity;
          if (t < 0.2) {
            intensity = t / 0.2;
          } else if (t > dur - 0.2) {
            intensity = (dur - t) / 0.2;
          } else {
            intensity = 1;
          }
          parts.leftArmPivot.rotation.z = 0.5 * intensity;
          parts.rightArmPivot.rotation.z = -0.5 * intensity;
        } else {
          entry.currentGesture = null;
          this._resetPose(parts, entry);
        }
        break;
      }
      case 'headShake': {
        const dur = 0.5;
        if (t < dur) {
          parts.head.rotation.y = Math.sin(t * 16) * 0.2;
        } else {
          entry.currentGesture = null;
          this._resetPose(parts, entry);
        }
        break;
      }
      case 'lookAway': {
        const dur = 1.2;
        if (t < dur) {
          if (t < 0.2) {
            parts.head.rotation.y = (t / 0.2) * 0.5;
          } else if (t < 0.8) {
            parts.head.rotation.y = 0.5;
          } else {
            parts.head.rotation.y = 0.5 * (1 - (t - 0.8) / 0.4);
          }
        } else {
          entry.currentGesture = null;
          this._resetPose(parts, entry);
        }
        break;
      }
      case 'fidget': {
        const dur = 0.6;
        if (t < dur) {
          parts.body.rotation.z = Math.sin(t * 20) * 0.03;
        } else {
          entry.currentGesture = null;
          this._resetPose(parts, entry);
        }
        break;
      }
      case 'stretch': {
        const dur = 0.8;
        if (t < dur) {
          const arm = Math.sin((t / dur) * Math.PI);
          parts.leftArmPivot.rotation.z = 1.0 * arm;
          parts.rightArmPivot.rotation.z = -1.0 * arm;
        } else {
          entry.currentGesture = null;
          this._resetPose(parts, entry);
        }
        break;
      }
      case 'lean': {
        const dur = 1.3;
        if (t < dur) {
          if (t < 0.2) {
            parts.body.rotation.z = (t / 0.2) * 0.1;
          } else if (t < 1.0) {
            parts.body.rotation.z = 0.1;
          } else {
            parts.body.rotation.z = 0.1 * (1 - (t - 1.0) / 0.3);
          }
        } else {
          entry.currentGesture = null;
          this._resetPose(parts, entry);
        }
        break;
      }
      case 'handsBehind': {
        const dur = 1.5;
        if (t < dur) {
          let intensity;
          if (t < 0.2) {
            intensity = t / 0.2;
          } else if (t > dur - 0.2) {
            intensity = (dur - t) / 0.2;
          } else {
            intensity = 1;
          }
          parts.leftArmPivot.rotation.x = 0.8 * intensity;
          parts.rightArmPivot.rotation.x = 0.8 * intensity;
        } else {
          entry.currentGesture = null;
          this._resetPose(parts, entry);
        }
        break;
      }
      case 'nod': {
        const dur = 0.4;
        if (t < dur) {
          parts.head.rotation.x = 0.2 * Math.sin((t / dur) * Math.PI);
        } else {
          entry.currentGesture = null;
          this._resetPose(parts, entry);
        }
        break;
      }
      case 'headTilt': {
        const dur = 0.9;
        if (t < dur) {
          if (t < 0.2) {
            parts.head.rotation.z = (t / 0.2) * 0.2;
          } else if (t < 0.6) {
            parts.head.rotation.z = 0.2;
          } else {
            parts.head.rotation.z = 0.2 * (1 - (t - 0.6) / 0.3);
          }
        } else {
          entry.currentGesture = null;
          this._resetPose(parts, entry);
        }
        break;
      }
      case 'gentleWave': {
        const dur = 0.8;
        if (t < dur) {
          parts.rightArmPivot.rotation.x = -0.6 * Math.sin((t / dur) * Math.PI);
        } else {
          entry.currentGesture = null;
          this._resetPose(parts, entry);
        }
        break;
      }
      default:
        entry.currentGesture = null;
        break;
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
