# Crop Tooltips & General Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add rich hover tooltips showing complete crop details (growth, maturity projection, status), then apply comprehensive polish across UI, visuals, and interactions.

**Architecture:** All tooltip logic extends the existing SelectionManager tooltip system. Static crop data (crops.json) is sent from server to client in the initial state. CropRenderer gets a position-based lookup. The tooltip renders multi-line HTML with a progress bar. Polish tasks are independent and modify specific subsystems.

**Tech Stack:** Three.js (client rendering), Socket.io (state sync), vanilla JS/CSS (UI), existing SelectionManager/CropRenderer/HUD/InputManager.

---

## Context

The client has a tooltip system in `SelectionManager` that detects NPCs, animals, pets, and machines on hover — but NOT crops. `CropRenderer` stores all crop data in `cropMeshes` (Map of id -> {mesh, data}) but has no position lookup. The server has static crop definitions (`crops.json`) with growthTime, sellPrice, seasons, etc. — but this data isn't sent to the client. Game time (day, season, hour) is available via `timeUpdate` events.

---

## Task 1: Send Static Crop Data from Server to Client

**Files:**
- Modify: `server/game/GameWorld.js` (line 1702-1723, `_getFullState` method)
- Modify: `client/src/main.js` (line 115, state handling)

**What:** Include the `cropsData` object (from `crops.json`) in the initial `WORLD_STATE` payload so the client has access to growthTime, sellPrice, season, regrows, xp for each crop type.

**Changes in GameWorld.js:**

In `_getFullState()` at line 1702, add `cropsData` to the returned object:

```js
return {
  playerId: player.id,
  mapId: player.currentMap,
  tiles: mapState.tiles,
  decorations: mapState.decorations,
  crops: mapState.crops,
  cropsData,               // <-- ADD THIS LINE
  animals: mapState.animals,
  // ... rest unchanged
};
```

`cropsData` is already imported at line 35: `const cropsData = JSON.parse(readFileSync(join(dataDir, 'crops.json'), 'utf-8'));`

**Changes in main.js:**

After `const state = await network.connect(...)` (line 115), store cropsData as a module-level variable:

```js
// Store static crop definitions for tooltips
const cropsData = state.cropsData || {};
```

Pass it to the SelectionManager constructor (line 270):
```js
const selectionManager = new SelectionManager(sceneManager.scene, {
  npcs, animals, pets, machines, crops, forage,
}, network, { cropsData, getTime: () => hud._lastTime });
```

Also store the time data in HUD for retrieval. In HUD.updateTime (line 201), add:
```js
updateTime(data) {
  this._lastTime = data; // store for tooltip access
  // ... existing code
}
```

**Commit:** `feat: send static crop data from server to client for tooltips`

---

## Task 2: Add getCropAtPosition to CropRenderer

**Files:**
- Modify: `client/src/world/CropRenderer.js` (add method after line 87)

**What:** Add a method that finds a crop at a given world position by checking tile coordinates.

```js
getCropAtPosition(worldX, worldZ) {
  // Convert world position to tile coordinates
  const tileX = Math.floor(worldX);
  const tileZ = Math.floor(worldZ);
  for (const [id, entry] of this.cropMeshes) {
    if (entry.data.tileX === tileX && entry.data.tileZ === tileZ) {
      return { id, ...entry.data };
    }
  }
  return null;
}
```

This matches the pattern used by other renderers (getNPCAtPosition, getAnimalAtPosition, etc.) which check position proximity. Crops occupy exactly one tile, so tile-coordinate matching is exact.

**Commit:** `feat: add getCropAtPosition to CropRenderer`

---

## Task 3: Rich Crop Tooltip in SelectionManager

**Files:**
- Modify: `client/src/ui/SelectionManager.js` (constructor, getEntityAt, _showTooltip)
- Modify: `shared/constants.js` (add STAGE_NAMES)

**What:** Add crop detection to `getEntityAt()`, accept `cropsData` + `getTime` in the constructor, and render rich multi-line HTML for crop tooltips.

**Step 1: Add STAGE_NAMES to shared/constants.js**

After the CROP_STAGES export (line 36):
```js
export const STAGE_NAMES = ['Seed', 'Sprout', 'Mature', 'Harvestable'];
```

**Step 2: Update SelectionManager constructor**

Accept a 4th `options` parameter:
```js
constructor(scene, renderers, network, options = {}) {
  this.scene = scene;
  this.renderers = renderers;
  this.network = network;
  this._cropsData = options.cropsData || {};
  this._getTime = options.getTime || (() => null);
  // ... rest unchanged
}
```

**Step 3: Add crop detection in getEntityAt**

After the machines check (line 114), before `return null`:
```js
// Crops
const cropData = this.renderers.crops.getCropAtPosition(x, z);
if (cropData) {
  const staticData = this._cropsData[cropData.cropType] || {};
  return {
    type: 'crop',
    id: cropData.id,
    name: staticData.name || cropData.cropType,
    cropData,
    staticData,
  };
}
```

**Step 4: Replace _showTooltip with rich rendering**

The current `_showTooltip` renders simple name + detail. Replace it to handle crop entities specially:

```js
_showTooltip(entity, screenPos) {
  if (!this._tooltip) return;

  let html;
  if (entity.type === 'crop') {
    html = this._buildCropTooltipHTML(entity);
  } else {
    html = `
      <div class="tooltip-name">${entity.name}</div>
      ${entity.detail ? `<div class="tooltip-detail">${entity.detail}</div>` : ''}
    `;
  }

  this._tooltip.innerHTML = html;
  this._tooltip.style.left = (screenPos.x + 16) + 'px';
  this._tooltip.style.top = (screenPos.y - 10) + 'px';
  this._tooltip.classList.remove('hidden');
}
```

**Step 5: Add _buildCropTooltipHTML method**

```js
_buildCropTooltipHTML(entity) {
  const { cropData, staticData } = entity;
  const stage = cropData.stage;
  const stageNames = ['Seed', 'Sprout', 'Mature', 'Harvestable'];
  const stageName = stageNames[stage] || 'Unknown';

  // Overall progress: stage contributes 0-3, growth within stage 0-1
  const overallProgress = Math.min(1, (stage + cropData.growth) / 3);
  const pctText = Math.round(overallProgress * 100);

  // Progress bar (10 segments)
  const filled = Math.round(overallProgress * 10);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);

  // Status indicators
  const watered = cropData.watered ? '\uD83D\uDCA7 Watered' : '\uD83C\uDF35 Needs water';
  let fertLine = '';
  if (cropData.fertilizer) {
    const fertNames = {
      fertilizer_basic: 'Basic Fertilizer',
      fertilizer_quality: 'Quality Fertilizer',
      speed_gro: 'Speed-Gro (+10%)',
      deluxe_speed_gro: 'Deluxe Speed-Gro (+25%)',
    };
    fertLine = `<div class="tooltip-detail">\uD83E\uDDEA ${fertNames[cropData.fertilizer] || cropData.fertilizer}</div>`;
  }

  // Projected maturity
  let maturityLine = '';
  if (stage < 3 && staticData.growthTime) {
    const time = this._getTime();
    if (time) {
      const remaining = this._estimateRemainingHours(cropData, staticData);
      const daysLeft = Math.ceil(remaining / 24);
      const projDay = (time.day || 1) + daysLeft;
      const seasonNames = ['Spring', 'Summer', 'Fall', 'Winter'];
      const season = seasonNames[time.season] || '';
      maturityLine = `<div class="tooltip-detail">\uD83D\uDCC5 Matures: ~Day ${projDay} ${season}</div>`;
    }
  } else if (stage >= 3) {
    maturityLine = `<div class="tooltip-detail" style="color:#7fda4f;">\u2705 Ready to harvest!</div>`;
  }

  // Season info
  const seasonNames = ['Spring', 'Summer', 'Fall', 'Winter'];
  const seasons = (staticData.season || []).map(s => seasonNames[s]).join(', ');

  // Sell price and regrow info
  const sellLine = staticData.sellPrice ? `Sells: ${staticData.sellPrice}g` : '';
  const regrowLine = staticData.regrows ? ' \u00B7 Regrows' : '';

  return `
    <div class="tooltip-name">${entity.name}</div>
    <div class="tooltip-detail">${stageName} (${stage + 1}/4)</div>
    <div class="tooltip-progress">
      <div class="tooltip-progress-bar" style="width:${pctText}%"></div>
    </div>
    <div class="tooltip-detail tooltip-pct">${pctText}% grown</div>
    <div class="tooltip-divider"></div>
    <div class="tooltip-detail">${watered}</div>
    ${fertLine}
    <div class="tooltip-divider"></div>
    ${maturityLine}
    <div class="tooltip-detail">\uD83C\uDF3F ${seasons}</div>
    <div class="tooltip-detail">${sellLine}${regrowLine}</div>
  `;
}
```

**Step 6: Add _estimateRemainingHours helper**

```js
_estimateRemainingHours(cropData, staticData) {
  const totalGrowthHours = staticData.growthTime * 24;
  const progressPerHour = 3 / totalGrowthHours;
  const rate = cropData.watered ? 1.5 : 1.0;
  let speedMult = 1;
  if (cropData.fertilizer) {
    const FERT_SPEED = { speed_gro: 0.10, deluxe_speed_gro: 0.25 };
    speedMult += FERT_SPEED[cropData.fertilizer] || 0;
  }
  // Remaining: stages left + fractional stage progress
  const stagesLeft = (3 - cropData.stage) - cropData.growth;
  const hoursLeft = stagesLeft / (progressPerHour * rate * speedMult);
  return Math.max(0, hoursLeft);
}
```

**Commit:** `feat: rich crop tooltips with growth, maturity projection, and status`

---

## Task 4: Crop Tooltip CSS Styles

**Files:**
- Modify: `client/styles/game.css` (after entity-tooltip section, line 685)

**What:** Add styles for the progress bar, dividers, fade animation, and allow multi-line content.

```css
/* Crop tooltip: allow wrapping for multi-line content */
.entity-tooltip.tooltip-rich {
  white-space: normal;
  max-width: 240px;
}

/* Tooltip progress bar track */
.tooltip-progress {
  height: 6px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  margin: 4px 0;
  overflow: hidden;
}

/* Tooltip progress bar fill */
.tooltip-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #7fda4f, #f5d142);
  border-radius: 3px;
  transition: width 0.3s ease-out;
}

/* Percentage text */
.tooltip-pct {
  text-align: center;
  font-size: 10px;
}

/* Thin divider line */
.tooltip-divider {
  height: 1px;
  background: rgba(139, 105, 20, 0.3);
  margin: 3px 0;
}

/* Tooltip fade animation */
.entity-tooltip {
  transition: opacity 0.15s ease-out;
}
.entity-tooltip.hidden {
  opacity: 0;
  pointer-events: none;
}
```

Also update `_showTooltip` to add a `tooltip-rich` class for crop entities (so `white-space: normal` applies), and remove it for simple tooltips.

In SelectionManager._showTooltip:
```js
this._tooltip.classList.toggle('tooltip-rich', entity.type === 'crop');
```

**Commit:** `feat: crop tooltip CSS — progress bar, dividers, fade animation`

---

## Task 5: Enrich Entity Tooltips (NPCs, Animals, Machines, Pets)

**Files:**
- Modify: `client/src/ui/SelectionManager.js` (getEntityAt detail lines)

**What:** Make existing entity tooltips richer with more useful information.

**Animals** (line 90-96): Show product readiness + type
```js
const detail = [];
if (data.type) detail.push(data.type.charAt(0).toUpperCase() + data.type.slice(1));
if (data.happiness !== undefined) detail.push(`Happiness: ${data.happiness}/10`);
if (data.productReady) detail.push('Product ready!');
return { type: 'animal', id: animalId, name, detail: detail.join(' \u00B7 ') };
```

**Machines** (line 107-113): Show remaining processing time or ready status
```js
let detail;
if (data.processing?.ready) {
  detail = '\u2705 Ready to collect';
} else if (data.processing) {
  detail = '\u2699\uFE0F Processing...';
} else {
  detail = 'Empty';
}
const typeName = (data.type || 'Machine').replace(/_/g, ' ');
return { type: 'machine', id: machineId, name: typeName, detail };
```

**Pets** (line 99-104): Show affection level
```js
const data = entry?.data || {};
const name = data.name || 'Pet';
const type = data.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1) : 'Pet';
const affection = data.affection !== undefined ? ` \u00B7 \u2764\uFE0F ${data.affection}/10` : '';
return { type: 'pet', id: petId, name, detail: type + affection };
```

**NPCs** (line 82-87): Show relationship points if available
```js
const data = entry?.mesh?.userData || {};
const name = data.name || 'Villager';
const role = data.role || 'Villager';
return { type: 'npc', id: npcId, name, detail: role };
```

**Commit:** `feat: enriched entity tooltips — animals, machines, pets, NPCs`

---

## Task 6: Harvestable Crop Golden Glow

**Files:**
- Modify: `client/src/world/CropRenderer.js` (addCrop, update methods)

**What:** Stage-3 (harvestable) crops get a subtle pulsing golden emissive glow to draw player attention.

In `addCrop()`, after positioning the mesh (line 56):
```js
// Harvestable glow
if (crop.stage >= 3) {
  this._applyHarvestGlow(mesh);
}
```

Add method:
```js
_applyHarvestGlow(group) {
  group.traverse((child) => {
    if (!child.isMesh) return;
    const mat = child.material.clone();
    mat.emissive = new THREE.Color(0xffd700);
    mat.emissiveIntensity = 0;
    child.material = mat;
    child.userData.harvestGlow = true;
  });
}
```

In `update(delta)`, after advancing time uniform:
```js
// Pulse harvestable crop glow
const glowIntensity = 0.08 + Math.sin(this._timeUniform.value * 2.5) * 0.06;
for (const { mesh } of this.cropMeshes.values()) {
  mesh.traverse((child) => {
    if (child.userData.harvestGlow) {
      child.material.emissiveIntensity = glowIntensity;
    }
  });
}
```

**Commit:** `feat: golden pulsing glow on harvestable crops`

---

## Task 7: Click Feedback Particles

**Files:**
- Modify: `client/src/main.js` (tool action handlers ~line 345-480)
- Modify or reference: `client/src/engine/ActionEffects.js` (if exists, otherwise add to existing particle system)

**What:** Spawn small particle bursts when the player uses tools. Check if `ActionEffects` already has methods for this.

First check: does `actionEffects` have a method for tool feedback? It already has `spawnHarvest`. Add:
```js
// In the tool action handlers in main.js:
// After sendTill:
actionEffects.spawnTill(tile.x + 0.5, tile.z + 0.5);
// After sendWater:
actionEffects.spawnWater(tile.x + 0.5, tile.z + 0.5);
```

If these methods don't exist in ActionEffects, add them following the existing `spawnHarvest` pattern — small brown particles for till, blue droplets for water.

**Commit:** `feat: click feedback particles for tool actions`

---

## Task 8: Action Bar Hover Tooltips

**Files:**
- Modify: `client/src/ui/HUD.js` (action bar slot creation, ~line 40-73)
- Modify: `client/styles/game.css` (add actionbar tooltip style)

**What:** Show a small tooltip with item name when hovering action bar slots.

In the slot creation loop (line 40-72), add mouseenter/mouseleave handlers:
```js
slot.addEventListener('mouseenter', () => {
  const item = this.actionBarSlots[i];
  if (!item) return;
  const name = (item.itemId || '').replace(/_/g, ' ');
  this._showActionBarTooltip(slot, name);
});
slot.addEventListener('mouseleave', () => {
  this._hideActionBarTooltip();
});
```

Add helper methods:
```js
_showActionBarTooltip(slot, text) {
  if (!this._abTooltip) {
    this._abTooltip = document.createElement('div');
    this._abTooltip.className = 'actionbar-tooltip';
    document.getElementById('ui-overlay').appendChild(this._abTooltip);
  }
  this._abTooltip.textContent = text;
  const rect = slot.getBoundingClientRect();
  this._abTooltip.style.left = (rect.left + rect.width / 2) + 'px';
  this._abTooltip.style.top = (rect.top - 8) + 'px';
  this._abTooltip.classList.remove('hidden');
}

_hideActionBarTooltip() {
  if (this._abTooltip) this._abTooltip.classList.add('hidden');
}
```

CSS:
```css
.actionbar-tooltip {
  position: fixed;
  background: rgba(20, 15, 10, 0.9);
  border: 1px solid rgba(139, 105, 20, 0.5);
  color: #f5d142;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  transform: translateX(-50%) translateY(-100%);
  pointer-events: none;
  z-index: 110;
  white-space: nowrap;
  transition: opacity 0.15s;
}
.actionbar-tooltip.hidden { opacity: 0; }
```

**Commit:** `feat: action bar hover tooltips showing item names`

---

## Task 9: Context Menu Crop Harvest Wiring

**Files:**
- Modify: `client/src/ui/SelectionManager.js` (lines 207-209, _dispatchAction)

**What:** Wire up the stubbed crop harvest action. The crop entity now has tileX/tileZ in cropData.

```js
case 'crop':
  if (action === 'Harvest') {
    net.sendHarvest(entity.cropData?.tileX, entity.cropData?.tileZ);
  }
  break;
```

Also need to pass the full entity to `_dispatchAction` or store it. Update `showContextMenu` to store the current entity:
```js
showContextMenu(entity, screenPos) {
  this._contextEntity = entity; // store for dispatch
  // ... rest unchanged
}
```

And update the button click handler:
```js
btn.addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  this._dispatchAction(this._contextEntity, action);
  this.hideContextMenu();
});
```

Update `_dispatchAction` signature to take entity directly:
```js
_dispatchAction(entity, action) {
  const net = this.network;
  switch (entity.type) {
    // ... existing cases, but using entity.id instead of entityId
    case 'crop':
      if (action === 'Harvest') {
        net.sendHarvest(entity.cropData?.tileX, entity.cropData?.tileZ);
      }
      break;
  }
}
```

Check if `sendHarvest` exists on the network client — it likely does since harvest is a supported action.

**Commit:** `feat: wire crop harvest in context menu`

---

## Task 10: Toast Notification Polish

**Files:**
- Modify: `client/styles/game.css` (toast section)
- Modify: `client/src/main.js` (showToast function ~line 128)

**What:** Add categorized icons and slide-in animation to toast notifications.

Update `showToast` to accept an icon parameter:
```js
function showToast(message, type = '', icon = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ` toast-${type}` : '');
  toast.textContent = (icon ? icon + ' ' : '') + message;
  container.appendChild(toast);
  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }, 3000);
}
```

CSS for slide-in/out:
```css
.toast {
  transform: translateX(100%);
  opacity: 0;
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}
.toast.toast-visible {
  transform: translateX(0);
  opacity: 1;
}
.toast.toast-exit {
  transform: translateX(100%);
  opacity: 0;
}
```

Update existing showToast call sites with icons:
- Harvest: `showToast('Caught a ${name}!', 'success', '\uD83C\uDF1F')`
- Level up: add star icon
- etc.

**Commit:** `feat: toast notification slide-in animation and icons`

---

## Task 11: Smooth Camera Follow

**Files:**
- Modify: `client/src/engine/SceneManager.js` (camera follow logic)

**What:** Lerp the camera position when following the player instead of snapping.

Find the camera follow update in SceneManager (likely in the render/update loop). Change from:
```js
camera.position.x = target.position.x;
camera.position.z = target.position.z;
```
To:
```js
const lerpFactor = 0.08;
camera.position.x += (target.position.x - camera.position.x + offsetX) * lerpFactor;
camera.position.z += (target.position.z - camera.position.z + offsetZ) * lerpFactor;
```

If the camera is already smoothed via some other mechanism, just verify and skip.

**Commit:** `feat: smooth camera follow with lerp`

---

## File Summary

| File | Tasks |
|------|-------|
| `server/game/GameWorld.js` | 1 (send cropsData) |
| `client/src/main.js` | 1, 7, 10 (store cropsData, click particles, toast polish) |
| `client/src/world/CropRenderer.js` | 2, 6 (getCropAtPosition, harvest glow) |
| `client/src/ui/SelectionManager.js` | 3, 5, 9 (crop detection, rich tooltips, context menu) |
| `shared/constants.js` | 3 (STAGE_NAMES) |
| `client/styles/game.css` | 4, 8, 10 (tooltip CSS, actionbar tooltip, toast animation) |
| `client/src/ui/HUD.js` | 1, 8 (store time, actionbar tooltips) |
| `client/src/engine/SceneManager.js` | 11 (smooth camera) |

## Dependency Graph

```
Task 1 (server sends cropsData) ─── prerequisite for 3
Task 2 (getCropAtPosition) ──────── prerequisite for 3
Task 3 (rich crop tooltip) ──────── depends on 1, 2
Task 4 (CSS styles) ─────────────── depends on 3
Task 5 (enrich all entity tips) ─── standalone
Task 6 (harvestable glow) ───────── standalone
Task 7 (click particles) ────────── standalone
Task 8 (action bar tooltips) ────── standalone
Task 9 (context menu harvest) ──── depends on 3
Task 10 (toast polish) ──────────── standalone
Task 11 (smooth camera) ─────────── standalone
```

Execution order: 1 → 2 → 3 → 4 → 9, then 5, 6, 7, 8, 10, 11 in any order.

## Verification

1. **Build:** `npx vite build` — no errors
2. **Start:** `node server/index.js` — start game
3. **Test checklist:**
   - [ ] Hover over a crop shows rich tooltip with name, stage, progress bar, watered status
   - [ ] Tooltip shows projected maturity date
   - [ ] Tooltip shows season, sell price, regrows info
   - [ ] Fertilized crop shows fertilizer type in tooltip
   - [ ] Harvestable crops shows "Ready to harvest!" in green
   - [ ] Harvestable crops have golden pulsing glow
   - [ ] Hover over animal shows happiness + product ready
   - [ ] Hover over machine shows processing status
   - [ ] Hover over pet shows affection level
   - [ ] Tooltip fades in/out smoothly
   - [ ] Action bar slots show item name on hover
   - [ ] Context menu "Harvest" works on crops
   - [ ] Toast notifications slide in/out
   - [ ] Camera follows player smoothly (no snap)
