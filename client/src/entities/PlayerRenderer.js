// client/src/entities/PlayerRenderer.js
import { tileToWorld } from '@shared/TileMap.js';

// Animation durations (seconds)
const ACTION_DURATION = 0.5;
const PLAYER_WALK_SPEED = 3.0; // tiles per second
const LIMB_SWING_SPEED = 8; // limb swing frequency
const ARRIVE_THRESHOLD = 0.05; // distance to consider "arrived"

export class PlayerRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.playerMeshes = new Map(); // id -> PlayerEntry
  }

  addPlayer(playerState, isLocal = false) {
    const appearance = playerState.appearance || {};
    if (!appearance.shirtColor) {
      appearance.shirtColor = isLocal ? 0x4488ff : 0x44cc44;
    }
    const mesh = this.assetGen.createPlayer(appearance);
    mesh.position.set(playerState.x, 0, playerState.z);
    this.scene.add(mesh);

    this.playerMeshes.set(playerState.id, {
      mesh,
      target: { x: playerState.x, z: playerState.z },
      // Animation state
      state: 'idle',        // 'idle' | 'walking' | 'action'
      walkPhase: 0,         // accumulates for sin-based limb swing
      actionTimer: 0,       // counts down during action animation
      actionType: null,     // 'hoe' | 'watering_can' | 'pickaxe' | 'axe' | 'fishing_rod' | 'seeds'
      pendingAction: null,  // queued action to play after arriving
      idleTime: 0,          // accumulates for idle breathing
    });
  }

  updatePosition(playerId, x, z) {
    const entry = this.playerMeshes.get(playerId);
    if (entry) {
      entry.target = { x, z };
    }
  }

  /** Queue a tool action — will play after the player reaches target */
  queueAction(playerId, toolName) {
    const entry = this.playerMeshes.get(playerId);
    if (entry) {
      entry.pendingAction = toolName;
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
    for (const entry of this.playerMeshes.values()) {
      const { mesh, target } = entry;
      const parts = mesh.userData.parts;
      if (!parts) { // fallback for meshes without parts (shouldn't happen)
        const fdx = target.x - mesh.position.x;
        const fdz = target.z - mesh.position.z;
        const fdist = Math.sqrt(fdx * fdx + fdz * fdz);
        if (fdist > ARRIVE_THRESHOLD) {
          const fstep = Math.min(PLAYER_WALK_SPEED * delta, fdist);
          mesh.position.x += (fdx / fdist) * fstep;
          mesh.position.z += (fdz / fdist) * fstep;
        }
        continue;
      }

      const dx = target.x - mesh.position.x;
      const dz = target.z - mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // --- State transitions ---
      if (entry.state === 'action') {
        entry.actionTimer -= delta;
        if (entry.actionTimer <= 0) {
          entry.state = 'idle';
          entry.actionType = null;
          this._resetPose(parts);
        }
      } else if (dist > ARRIVE_THRESHOLD) {
        entry.state = 'walking';
        // Face movement direction
        mesh.rotation.y = Math.atan2(dx, dz);
      } else if (entry.state === 'walking') {
        // Just arrived
        entry.state = 'idle';
        entry.walkPhase = 0;
        this._resetPose(parts);

        // Trigger pending action
        if (entry.pendingAction) {
          entry.state = 'action';
          entry.actionType = entry.pendingAction;
          entry.actionTimer = ACTION_DURATION;
          entry.pendingAction = null;
        }
      }

      // --- Position interpolation (constant speed, unless mid-action) ---
      if (entry.state !== 'action' && dist > ARRIVE_THRESHOLD) {
        const step = Math.min(PLAYER_WALK_SPEED * delta, dist);
        mesh.position.x += (dx / dist) * step;
        mesh.position.z += (dz / dist) * step;
      }

      // --- Animate based on state ---
      switch (entry.state) {
        case 'walking':
          this._animateWalk(entry, parts, delta);
          break;
        case 'action':
          this._animateAction(entry, parts);
          break;
        case 'idle':
          this._animateIdle(entry, parts, delta);
          break;
      }
    }
  }

  // ─── Walk Animation ───

  _animateWalk(entry, parts, delta) {
    entry.walkPhase += delta * LIMB_SWING_SPEED;
    const s = Math.sin(entry.walkPhase);
    const c = Math.cos(entry.walkPhase);

    // Legs swing opposite to each other
    parts.leftLegPivot.rotation.x = s * 0.6;
    parts.rightLegPivot.rotation.x = -s * 0.6;

    // Arms swing opposite to legs
    parts.leftArmPivot.rotation.x = -s * 0.5;
    parts.rightArmPivot.rotation.x = s * 0.5;

    // Body bob (up/down on stride)
    parts.body.position.y = 0.75 + Math.abs(c) * 0.03;

    // Head slight lag
    parts.head.position.y = 1.2 + Math.abs(c) * 0.02;
    parts.hair.position.y = 1.28 + Math.abs(c) * 0.02;

    // Subtle body tilt
    parts.body.rotation.z = s * 0.03;
  }

  // ─── Tool Action Animations ───

  _animateAction(entry, parts) {
    // t goes from 1.0 → 0.0 over ACTION_DURATION
    const t = entry.actionTimer / ACTION_DURATION;
    // p goes from 0 → PI over the action (for sin-based arc)
    const p = (1 - t) * Math.PI;

    switch (entry.actionType) {
      case 'hoe': {
        // Both arms swing down in an arc
        const swing = Math.sin(p) * 1.2;
        parts.leftArmPivot.rotation.x = -swing;
        parts.rightArmPivot.rotation.x = -swing;
        // Body bends forward
        parts.body.rotation.x = Math.sin(p) * 0.25;
        parts.head.rotation.x = Math.sin(p) * 0.15;
        break;
      }

      case 'watering_can': {
        // Arms extend forward, body tilts
        const pour = Math.sin(p);
        parts.rightArmPivot.rotation.x = -0.8 * pour;
        parts.leftArmPivot.rotation.x = -0.5 * pour;
        parts.body.rotation.x = 0.15 * pour;
        // Slight tilt to the side for pouring
        parts.rightArmPivot.rotation.z = -0.3 * pour;
        break;
      }

      case 'pickaxe': {
        // Overhead swing down — wind up then strike
        const wind = t > 0.5 ? (1 - t) * 2 : 1; // 0→1 first half
        const strike = t <= 0.5 ? t * 2 : 0;      // 1→0 second half
        const armAngle = -wind * 1.5 + strike * 0.5;
        parts.rightArmPivot.rotation.x = armAngle;
        parts.leftArmPivot.rotation.x = armAngle * 0.7;
        parts.body.rotation.x = (wind * 0.1 - strike * 0.2);
        break;
      }

      case 'axe': {
        // Side swing — arms go right then chop left
        const swing = Math.sin(p) * 1.3;
        parts.rightArmPivot.rotation.z = -swing;
        parts.leftArmPivot.rotation.z = -swing * 0.6;
        parts.rightArmPivot.rotation.x = -0.3 * Math.sin(p);
        // Body twists
        parts.body.rotation.y = Math.sin(p) * 0.2;
        break;
      }

      case 'fishing_rod': {
        // Wind-up behind then cast forward
        const castPhase = Math.sin(p);
        const windUp = t > 0.6 ? (1 - t) / 0.4 : 1;
        parts.rightArmPivot.rotation.x = windUp * 0.8 - castPhase * 1.5;
        parts.leftArmPivot.rotation.x = -castPhase * 0.3;
        parts.body.rotation.x = -windUp * 0.1 + castPhase * 0.15;
        break;
      }

      case 'seeds': {
        // Arm sweeps side-to-side (scattering)
        const sweep = Math.sin(p * 2) * 0.8;
        parts.rightArmPivot.rotation.z = sweep;
        parts.rightArmPivot.rotation.x = -0.5;
        parts.body.rotation.z = sweep * 0.1;
        break;
      }

      default:
        break;
    }
  }

  // ─── Idle Animation ───

  _animateIdle(entry, parts, delta) {
    entry.idleTime += delta;
    const t = entry.idleTime;

    // Gentle breathing — body scale pulse
    const breath = Math.sin(t * 1.5) * 0.01;
    parts.body.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath);

    // Subtle weight shift
    parts.body.rotation.z = Math.sin(t * 0.4) * 0.015;

    // Arms hang naturally with very slight sway
    parts.leftArmPivot.rotation.x = Math.sin(t * 0.7) * 0.03;
    parts.rightArmPivot.rotation.x = Math.sin(t * 0.7 + 0.5) * 0.03;
  }

  // ─── Reset all rotations/positions to default ───

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

  getLocalPlayerPosition(playerId) {
    const entry = this.playerMeshes.get(playerId);
    return entry ? entry.mesh.position : null;
  }

  getLocalPlayerMesh(playerId) {
    const entry = this.playerMeshes.get(playerId);
    return entry ? entry.mesh : null;
  }

  dispose() {
    for (const { mesh } of this.playerMeshes.values()) this.scene.remove(mesh);
    this.playerMeshes.clear();
  }
}
