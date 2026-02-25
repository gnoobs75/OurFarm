# Farmer Animation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add walking, idle, and tool-action animations to the farmer character so they feel alive as they move around and interact with the world.

**Architecture:** Modify `createNPC` to store named references to body parts (arms, legs, head, body) on `group.userData.parts`. Rewrite `PlayerRenderer` with an animation state machine (`idle`/`walking`/`action`) that procedurally swings limbs, bobs the body, rotates to face movement direction, and plays short tool-specific action clips after reaching the target tile. Wire main.js to pass the active tool to PlayerRenderer so it knows which action to play.

**Tech Stack:** Three.js (r183), procedural keyframe-less animation via `Math.sin` + delta accumulation.

---

### Task 1: Store Named Body Part References in AssetGenerator

**Files:**
- Modify: `client/src/engine/AssetGenerator.js:582-620`

**Step 1: Rewrite createNPC to store part references**

Replace the `createNPC` and `createPlayer` methods. The geometry and positioning stay identical — the only change is assigning each mesh to a named variable and storing them in `group.userData.parts`, plus setting pivot points on arms/legs for rotation-based animation.

```javascript
  createNPC(params = {}) {
    const group = new THREE.Group();
    const { skinColor = 0xffcc99, shirtColor = 0x4488cc, hairColor = 0x332211 } = params;

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), this.getMaterial(shirtColor));
    body.position.y = 0.75;
    group.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), this.getMaterial(skinColor));
    head.position.y = 1.2;
    group.add(head);

    // Hair
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), this.getMaterial(hairColor));
    hair.position.y = 1.28;
    hair.scale.set(1, 0.6, 1);
    group.add(hair);

    // Legs — wrap each in a pivot so rotation swings from the hip
    const legGeo = new THREE.BoxGeometry(0.12, 0.4, 0.15);
    const legMat = this.getMaterial(0x334455);

    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.1, 0.4, 0); // hip height
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.y = -0.2; // hang down from pivot
    leftLegPivot.add(leftLeg);
    group.add(leftLegPivot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.1, 0.4, 0);
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.y = -0.2;
    rightLegPivot.add(rightLeg);
    group.add(rightLegPivot);

    // Arms — wrap each in a pivot so rotation swings from the shoulder
    const armGeo = new THREE.BoxGeometry(0.1, 0.4, 0.12);
    const armMat = this.getMaterial(skinColor);

    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.28, 0.95, 0); // shoulder height
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.y = -0.2; // hang down from pivot
    leftArmPivot.add(leftArm);
    group.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.28, 0.95, 0);
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.y = -0.2;
    rightArmPivot.add(rightArm);
    group.add(rightArmPivot);

    // Store references for animation
    group.userData.parts = {
      body, head, hair,
      leftLegPivot, rightLegPivot,
      leftArmPivot, rightArmPivot,
    };

    group.castShadow = true;
    return group;
  }

  createPlayer(color = 0x4488ff) {
    return this.createNPC({ shirtColor: color });
  }
```

**Step 2: Verify — restart client, farmer should look identical (same proportions, pivots just reorganize the hierarchy)**

Run: `npm run dev` — farmer renders, no console errors.

**Step 3: Commit**
```bash
git add client/src/engine/AssetGenerator.js
git commit -m "refactor: add pivot groups and named body part refs to NPC/player mesh"
```

---

### Task 2: Rewrite PlayerRenderer with Animation State Machine

**Files:**
- Modify: `client/src/entities/PlayerRenderer.js`

**Step 1: Replace entire PlayerRenderer with animated version**

```javascript
// client/src/entities/PlayerRenderer.js
import { tileToWorld } from '@shared/TileMap.js';

// Animation durations (seconds)
const ACTION_DURATION = 0.5;
const MOVE_LERP = 5;
const WALK_SPEED = 8; // limb swing frequency
const ARRIVE_THRESHOLD = 0.05; // distance to consider "arrived"

export class PlayerRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.playerMeshes = new Map(); // id -> PlayerEntry
  }

  addPlayer(playerState, isLocal = false) {
    const mesh = this.assetGen.createPlayer(isLocal ? 0x4488ff : 0x44cc44);
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
        mesh.position.x += (target.x - mesh.position.x) * MOVE_LERP * delta;
        mesh.position.z += (target.z - mesh.position.z) * MOVE_LERP * delta;
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

      // --- Position interpolation (always, unless mid-action) ---
      if (entry.state !== 'action') {
        mesh.position.x += dx * MOVE_LERP * delta;
        mesh.position.z += dz * MOVE_LERP * delta;
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
    entry.walkPhase += delta * WALK_SPEED;
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

  dispose() {
    for (const { mesh } of this.playerMeshes.values()) this.scene.remove(mesh);
    this.playerMeshes.clear();
  }
}
```

**Step 2: Verify — restart client, farmer should idle-breathe and walk with limb swing when you click a tile**

Run: `npm run dev` — click around, farmer walks with arms/legs swinging, stops and breathes.

**Step 3: Commit**
```bash
git add client/src/entities/PlayerRenderer.js
git commit -m "feat: add walking, idle, and tool-action animations to PlayerRenderer"
```

---

### Task 3: Wire Tool Actions from main.js to PlayerRenderer

**Files:**
- Modify: `client/src/main.js:108-142`

**Step 1: Update the tile-click handler to queue animations**

Replace the `input.on('tileClick', ...)` handler (lines 109-142). The change: after `network.sendMove(...)`, call `players.queueAction(network.playerId, tool)` so the animation plays after arrival.

```javascript
    // --- Handle tile clicks ---
    input.on('tileClick', ({ tile, worldPos, button }) => {
      if (dialogueUI.visible) return;

      // Right-click or check for NPC
      const npcId = npcs.getNPCAtPosition(worldPos.x, worldPos.z);
      if (npcId) {
        network.sendNPCTalk(npcId);
        return;
      }

      // Move player to clicked position
      network.sendMove(worldPos.x, worldPos.z);

      // Perform tool action
      const tool = toolActions[activeTool];
      switch (tool) {
        case 'hoe':
          network.sendTill(tile.x, tile.z);
          break;
        case 'watering_can':
          network.sendWater(tile.x, tile.z);
          break;
        case 'seeds':
          network.sendPlant(tile.x, tile.z, selectedSeed);
          break;
        case 'fishing_rod':
          network.sendFishCast(worldPos.x, worldPos.z);
          break;
        case 'pickaxe':
          // Harvest if there's a crop, else mine
          network.sendHarvest(tile.x, tile.z);
          break;
      }

      // Queue the tool animation on the local player
      players.queueAction(network.playerId, tool);
    });
```

**Step 2: Verify — click with different tools selected, farmer walks to tile then plays tool animation**

Run: `npm run dev` — select Water, click tile: farmer walks, then does pouring motion. Select Axe, click: farmer walks, then does chopping swing. Etc.

**Step 3: Commit**
```bash
git add client/src/main.js
git commit -m "feat: wire tool actions to player animation queue"
```

---

### Task 4: Final Verification

**Step 1: Full test pass**

Run: `npm run dev`

**Visual verification checklist:**
- [ ] Farmer breathes gently when idle (subtle body scale pulse + weight shift)
- [ ] Farmer faces movement direction when walking
- [ ] Arms and legs swing alternately while walking
- [ ] Body and head bob during walk cycle
- [ ] Walking animation stops cleanly when arriving at destination
- [ ] **Hoe**: both arms swing down (digging arc), body bends forward
- [ ] **Water**: arms extend forward with side tilt (pouring motion)
- [ ] **Pick**: overhead wind-up then downward strike
- [ ] **Axe**: side swing with body twist (chopping)
- [ ] **Rod**: wind-up behind then cast forward arc
- [ ] **Seeds**: arm sweeps side-to-side (scattering)
- [ ] Tool animation plays AFTER farmer arrives at tile (walk-then-act)
- [ ] Farmer returns to idle pose after action completes
- [ ] No console errors
- [ ] Other players (if connected in 2nd tab) also animate

**Step 2: Final commit**
```bash
git add -A
git commit -m "feat: complete farmer animations — walk cycle, tool actions, idle breathing"
```
