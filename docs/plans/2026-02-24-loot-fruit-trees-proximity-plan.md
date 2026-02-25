# Loot Toasts, Fruit Trees & Proximity Check — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add loot collection feedback (toast + fly-to-backpack animation), fruit trees (natural + plantable with shake mechanic), and proximity range checking for all tool actions.

**Architecture:** Server events are extended with `drops` arrays. A new `LootToast` UI system handles fly animations. Fruit trees extend the existing `Resource` entity with `fruitType`/`fruitReady` fields. Proximity is a simple Manhattan distance check on both client and server.

**Tech Stack:** Three.js (client rendering), Socket.io (state sync), vanilla JS/CSS (UI), existing Resource/GameWorld/HUD systems.

---

## Task 1: Proximity Range Check — Client Side

**Files:**
- Modify: `client/src/main.js` (~line 349, tileAction handler)

**What:** Add a range check before any tool action. If the player is more than 2 tiles away, show "Too far away!" toast and block the action.

**Changes:**

At the top of the `tileAction` handler (after checking for dialogue/context menu, before getting activeItem), add:

```js
// Proximity check — must be within 2 tiles
const playerPos = players.getLocalPlayerPosition(network.playerId);
if (playerPos) {
  const playerTileX = Math.floor(playerPos.x);
  const playerTileZ = Math.floor(playerPos.z);
  const dist = Math.abs(playerTileX - tile.x) + Math.abs(playerTileZ - tile.z);
  if (dist > 2) {
    showToast('Too far away!', 'fail', '\uD83D\uDEB6');
    return;
  }
}
```

This goes right after the entity/context-menu check (line 360) and before `const activeItem = hud.getActiveItem()` (line 362).

**Commit:** `feat: client-side proximity check — block tool actions beyond 2 tiles`

---

## Task 2: Proximity Range Check — Server Side

**Files:**
- Modify: `server/game/GameWorld.js` (add helper, use in handlers)

**What:** Add server-side range validation as a security measure.

**Step 1:** Add a helper method to GameWorld:

```js
_isPlayerInRange(player, tileX, tileZ, range = 3) {
  const px = Math.floor(player.x);
  const pz = Math.floor(player.z);
  return Math.abs(px - tileX) + Math.abs(pz - tileZ) <= range;
}
```

Note: server range is 3 (slightly more lenient than client's 2) to account for network latency.

**Step 2:** Add the check at the start of these handlers:
- `handleTill` (after player/map check)
- `handleWater` (after player/map check)
- `handlePlant` (after player/map check)
- `handleHarvest` (after player/map check)
- `handleResourceHit` (after player/map check)

Pattern for each:
```js
if (!this._isPlayerInRange(player, data.x, data.z)) return;
```

**Commit:** `feat: server-side proximity validation for tool actions`

---

## Task 3: Backpack HUD Icon

**Files:**
- Modify: `client/src/ui/HUD.js` (constructor, add backpack icon)
- Modify: `client/styles/game.css` (add backpack icon styles)

**What:** Add a clickable backpack icon to the HUD that toggles the inventory panel.

**Changes in HUD.js:**

In the constructor, after building the action bar (line 74), add:

```js
// Backpack icon
this._backpackIcon = document.createElement('div');
this._backpackIcon.className = 'hud-backpack';
this._backpackIcon.textContent = '\uD83C\uDF92';
this._backpackIcon.title = 'Backpack (I)';
this._backpackIcon.addEventListener('click', () => {
  if (this.onBackpackClick) this.onBackpackClick();
});
document.getElementById('ui-overlay').appendChild(this._backpackIcon);
```

Add a public method to trigger the pulse animation:
```js
pulseBackpack() {
  this._backpackIcon.classList.add('backpack-pulse');
  setTimeout(() => this._backpackIcon.classList.remove('backpack-pulse'), 600);
}
```

And a getter for the backpack icon's position (needed for fly animation):
```js
getBackpackRect() {
  return this._backpackIcon.getBoundingClientRect();
}
```

**CSS in game.css:**

```css
.hud-backpack {
  position: fixed;
  bottom: 80px;
  right: 16px;
  font-size: 28px;
  cursor: pointer;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
  transition: transform 0.15s;
  z-index: 100;
}
.hud-backpack:hover {
  transform: scale(1.15);
}
.backpack-pulse {
  animation: bpPulse 0.6s ease-out;
}
@keyframes bpPulse {
  0% { transform: scale(1); }
  30% { transform: scale(1.3); }
  100% { transform: scale(1); }
}
```

**Wire in main.js:** After creating HUD and inventoryUI, connect the callback:
```js
hud.onBackpackClick = () => inventoryUI.toggle();
```

**Commit:** `feat: clickable backpack icon in HUD`

---

## Task 4: Loot Toast System

**Files:**
- Create: `client/src/ui/LootToast.js`
- Modify: `client/styles/game.css` (loot toast styles)

**What:** A reusable loot toast that shows item icon + name + quantity, then flies toward the backpack icon.

**LootToast.js:**

```js
import { getItemIcon } from './ItemIcons.js';

export class LootToast {
  constructor() {
    this._container = document.createElement('div');
    this._container.className = 'loot-toast-container';
    document.getElementById('ui-overlay').appendChild(this._container);
    this._getBackpackRect = null;
    this._onPulse = null;
  }

  /** Set callback to get backpack icon position and pulse it */
  setBackpackCallbacks(getRect, onPulse) {
    this._getBackpackRect = getRect;
    this._onPulse = onPulse;
  }

  /** Show a loot notification for collected items */
  show(drops) {
    for (const drop of drops) {
      this._spawnToast(drop.itemId, drop.quantity);
    }
  }

  _spawnToast(itemId, quantity) {
    const icon = getItemIcon(itemId);
    const el = document.createElement('div');
    el.className = 'loot-toast';
    el.innerHTML = `<span class="loot-icon">${icon.emoji}</span> <span class="loot-text">${icon.name} x${quantity}</span>`;
    this._container.appendChild(el);

    // Phase 1: Show (slide in)
    requestAnimationFrame(() => el.classList.add('loot-visible'));

    // Phase 2: Fly to backpack after 1s
    setTimeout(() => {
      const bpRect = this._getBackpackRect ? this._getBackpackRect() : null;
      if (bpRect) {
        const elRect = el.getBoundingClientRect();
        const dx = bpRect.left + bpRect.width / 2 - (elRect.left + elRect.width / 2);
        const dy = bpRect.top + bpRect.height / 2 - (elRect.top + elRect.height / 2);
        el.style.transition = 'transform 0.4s ease-in, opacity 0.4s ease-in, font-size 0.4s ease-in';
        el.style.transform = `translate(${dx}px, ${dy}px) scale(0.3)`;
        el.style.opacity = '0';

        setTimeout(() => {
          if (this._onPulse) this._onPulse();
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 400);
      } else {
        el.classList.add('loot-exit');
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
      }
    }, 1200);
  }
}
```

**CSS:**

```css
.loot-toast-container {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.loot-toast {
  background: rgba(30, 22, 14, 0.95);
  border: 1px solid #8b6914;
  border-radius: 8px;
  padding: 8px 16px;
  color: #f5e6d0;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(-10px);
  transition: opacity 0.25s ease-out, transform 0.25s ease-out;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

.loot-toast.loot-visible {
  opacity: 1;
  transform: translateY(0);
}

.loot-toast .loot-icon {
  font-size: 18px;
}

.loot-toast .loot-text {
  color: #f5d142;
}

.loot-toast.loot-exit {
  opacity: 0;
  transform: translateY(-10px);
}
```

**Commit:** `feat: loot toast UI with fly-to-backpack animation`

---

## Task 5: Server — Include Drops in Collection Events

**Files:**
- Modify: `server/game/GameWorld.js` (handleResourceHit, handleHarvest, handleForageCollect)

**What:** Add a `drops` array to collection event broadcasts so the client knows what items were awarded.

**handleResourceHit (line 1393-1433):**

When tree is destroyed (line 1394-1403), include drops in the broadcast:
```js
// Tree destroyed -> drop items, convert to stump
const drops = resData.drops.map(d => ({ itemId: d.itemId, quantity: d.quantity }));
for (const drop of resData.drops) {
  player.addItem(drop.itemId, drop.quantity);
}
// ... existing stump conversion ...
this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
  type: 'resourceUpdate', resource: resource.getState(), drops,
}, socketId);  // drops only sent to the acting player
```

Wait — broadcasts go to all players but drops should only go to the one who hit it. Better approach: send drops as a separate player-specific event, OR include drops only in the `_sendInventoryUpdate` call. Simplest: emit a separate `lootDrop` event to just the acting player:

```js
// After adding items to player inventory, before _sendInventoryUpdate:
this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
  type: 'lootDrop', drops: resData.drops.map(d => ({ itemId: d.itemId, quantity: d.quantity })),
});
```

Apply the same pattern to:

**handleHarvest (line 561-596):** After `player.addItem(crop.cropType, yield_, quality)`:
```js
this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
  type: 'lootDrop', drops: [{ itemId: crop.cropType, quantity: yield_ }],
});
```

**handleForageCollect (line 1322-1346):** After `player.addItem(spawn.itemId, qty, quality)`:
```js
this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
  type: 'lootDrop', drops: [{ itemId: spawn.itemId, quantity: qty }],
});
```

**handleResourceHit — stump/rock destruction (line 1404-1424):**
```js
this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
  type: 'lootDrop', drops: drops.map(d => ({ itemId: d.itemId, quantity: d.quantity })),
});
```

**handleAnimalCollect** — find this handler and add lootDrop similarly.

**Commit:** `feat: server emits lootDrop events for all collection actions`

---

## Task 6: Client — Wire Loot Toasts to Collection Events

**Files:**
- Modify: `client/src/main.js` (create LootToast, handle lootDrop event)

**What:** Instantiate LootToast, connect it to backpack icon, and handle the new `lootDrop` event.

**In main.js setup (near actionEffects creation ~line 69):**
```js
import { LootToast } from './ui/LootToast.js';
// ...
const lootToast = new LootToast();
```

**After HUD + inventoryUI creation, wire backpack callbacks:**
```js
hud.onBackpackClick = () => inventoryUI.toggle();
lootToast.setBackpackCallbacks(
  () => hud.getBackpackRect(),
  () => hud.pulseBackpack(),
);
```

**In the WORLD_UPDATE event handler switch, add a case for `lootDrop`:**
```js
case 'lootDrop':
  lootToast.show(data.drops);
  break;
```

**Also update the existing fishing toast** to use lootToast instead (or keep both — the fishing catch toast already works well, so maybe keep the existing toast for the "Caught a X!" message and let `lootDrop` handle the item notification separately).

**Commit:** `feat: wire loot toast to server collection events`

---

## Task 7: Fruit Tree Data Model — Server

**Files:**
- Modify: `server/entities/Resource.js` (add fruitType, fruitReady, fruitTimer)
- Modify: `shared/constants.js` (add FRUIT_TYPES, fruit tree resource data)

**What:** Extend the Resource entity to support fruit trees.

**constants.js additions:**

```js
export const FRUIT_TYPES = ['apple', 'cherry', 'orange', 'peach'];

export const FRUIT_DATA = {
  apple:  { name: 'Apple',  sellPrice: 50,  color: 0xcc3333 },
  cherry: { name: 'Cherry', sellPrice: 40,  color: 0xdd2255 },
  orange: { name: 'Orange', sellPrice: 60,  color: 0xff8800 },
  peach:  { name: 'Peach',  sellPrice: 70,  color: 0xffaa88 },
};

export const FRUIT_REGROW_HOURS = 24; // in-game hours until fruit regrows
```

**Resource.js changes:**

```js
constructor(data) {
  this.id = data.id || uuid();
  this.type = data.type;
  this.tileX = data.tileX;
  this.tileZ = data.tileZ;
  this.variant = data.variant || 0;
  this.health = data.health;
  this.isStump = data.isStump || false;
  // Fruit tree fields
  this.fruitType = data.fruitType || null;   // 'apple', 'cherry', etc. or null
  this.fruitReady = data.fruitReady ?? true; // fruit available to shake
  this.fruitTimer = data.fruitTimer || 0;    // hours until fruit regrows
}

getState() {
  return {
    id: this.id, type: this.type, tileX: this.tileX, tileZ: this.tileZ,
    variant: this.variant, health: this.health, isStump: this.isStump,
    fruitType: this.fruitType, fruitReady: this.fruitReady,
  };
}
```

**Commit:** `feat: fruit tree data model — Resource entity + constants`

---

## Task 8: Fruit Tree Generation + Shake Handler — Server

**Files:**
- Modify: `server/game/GameWorld.js` (farm generation, new shake handler, tick fruit timer)
- Modify: `server/index.js` (add TREE_SHAKE socket action)

**What:** Make some natural trees fruit trees, handle the shake action, and tick fruit regrowth.

**Step 1: Farm generation**

In the farm map initialization (where trees are created as Resources), after creating a tree Resource, randomly assign fruit:

```js
// ~25% chance a tree becomes a fruit tree
if (Math.random() < 0.25) {
  resource.fruitType = FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
  resource.fruitReady = true;
}
```

**Step 2: Shake handler**

Add `handleTreeShake(socketId, data)`:

```js
handleTreeShake(socketId, data) {
  const player = this.players.get(socketId);
  if (!player || player.currentMap !== MAP_IDS.FARM) return;
  if (!this._isPlayerInRange(player, data.x, data.z)) return;

  const farmMap = this.maps.get(MAP_IDS.FARM);
  let resource = null;
  for (const r of farmMap.resources.values()) {
    if (r.tileX === data.x && r.tileZ === data.z) { resource = r; break; }
  }
  if (!resource || !resource.fruitType || !resource.fruitReady || resource.isStump) return;

  // Award fruit
  const qty = 1 + Math.floor(Math.random() * 3); // 1-3
  player.addItem(resource.fruitType, qty);
  player.addSkillXP(SKILLS.FORAGING, 5);
  this._checkPendingProfession(socketId, player);

  // Mark fruit as harvested
  resource.fruitReady = false;
  resource.fruitTimer = FRUIT_REGROW_HOURS;

  // Notify client
  this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
    type: 'lootDrop', drops: [{ itemId: resource.fruitType, quantity: qty }],
  });
  this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
    type: 'treeShake', resourceId: resource.id,
  });
  this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
    type: 'resourceUpdate', resource: resource.getState(),
  });
  this._sendInventoryUpdate(socketId, player);
}
```

**Step 3: Fruit regrowth in tick**

In the game tick (where crops grow, time advances), add:

```js
// Fruit tree regrowth
for (const resource of farmMap.resources.values()) {
  if (resource.fruitType && !resource.fruitReady && resource.fruitTimer > 0) {
    resource.fruitTimer -= tickHours;
    if (resource.fruitTimer <= 0) {
      resource.fruitReady = true;
      resource.fruitTimer = 0;
    }
  }
}
```

**Step 4: Socket action in index.js**

Add alongside other action handlers:
```js
socket.on('farm:treeShake', (data) => gameWorld.handleTreeShake(socket.id, data));
```

And in NetworkClient.js:
```js
sendTreeShake(tileX, tileZ) { this.socket.emit('farm:treeShake', { x: tileX, z: tileZ }); }
```

**Commit:** `feat: fruit tree generation, shake handler, and fruit regrowth`

---

## Task 9: Fruit Tree Visuals — Client

**Files:**
- Modify: `client/src/entities/ResourceRenderer.js` (fruit dots on tree canopy)
- Modify: `client/src/engine/AssetGenerator.js` (fruit dot geometry helper)

**What:** Fruit trees get colored dots on their canopy. When fruit isn't ready, dots disappear.

**AssetGenerator.js — add `addFruitDots(group, fruitType, fruitReady)` method:**

```js
addFruitDots(treeGroup, fruitType, count = 6) {
  const color = FRUIT_DATA[fruitType]?.color || 0xff0000;
  const dotGeo = new THREE.SphereGeometry(0.06, 6, 6);
  const dotMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });

  // Find the canopy mesh (tallest child or tagged)
  let canopy = null;
  treeGroup.traverse(c => {
    if (c.isMesh && c.position.y > 0.5) canopy = c;
  });
  if (!canopy) return;

  const fruitGroup = new THREE.Group();
  fruitGroup.userData.isFruitDots = true;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const r = 0.3 + Math.random() * 0.2;
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(
      Math.cos(angle) * r,
      canopy.position.y + (Math.random() - 0.5) * 0.3,
      Math.sin(angle) * r,
    );
    fruitGroup.add(dot);
  }
  treeGroup.add(fruitGroup);
}
```

**ResourceRenderer.js — when building tree meshes:**

After creating the tree mesh, if `res.fruitType` exists and `res.fruitReady`:
```js
if (res.fruitType && res.fruitReady) {
  this.assetGen.addFruitDots(mesh, res.fruitType);
}
```

Also store `fruitType` in the mesh data so updates can toggle dots.

On `resourceUpdate` event: rebuild the tree mesh to reflect fruitReady changes.

**Commit:** `feat: fruit tree visuals — colored dots on canopy`

---

## Task 10: Fruit Tree Interaction — Client

**Files:**
- Modify: `client/src/ui/SelectionManager.js` (add fruit tree context menu)
- Modify: `client/src/main.js` (handle treeShake event for wobble animation)
- Modify: `client/src/entities/ResourceRenderer.js` (shake animation)

**What:** Right-click a fruit tree shows "Shake" + "Chop" options. Shake triggers wobble animation + fruit particle fall.

**SelectionManager changes:**

Add `'fruit_tree'` to ENTITY_ACTIONS:
```js
fruit_tree: ['Shake', 'Chop'],
```

In `getEntityAt`, before the existing forage check, detect fruit trees from the resource renderer. Or — simpler — enhance the existing entity context menu to detect when a clicked entity is a resource with fruitType.

Actually, the current `tileAction` handler checks for resources directly (lines 396-412). The context menu doesn't handle resources at all. The approach should be:

1. Add a `getResourceAtTile` check in `getEntityAt` for resources with `fruitType`
2. Return entity type `'fruit_tree'` when it's a fruit tree with fruit ready
3. In `_dispatchAction`, handle `fruit_tree` + `Shake` by calling `network.sendTreeShake(tileX, tileZ)`
4. Handle `fruit_tree` + `Chop` by calling `network.sendResourceHit(tileX, tileZ)`

**ResourceRenderer shake animation:**

On `treeShake` event, apply a quick oscillating rotation to the tree mesh:
```js
onTreeShake(resourceId) {
  const entry = this.resourceMeshes.get(resourceId);
  if (!entry) return;
  const mesh = entry.mesh;
  // Quick wobble: oscillate rotation.z for ~0.5s
  let t = 0;
  const wobble = () => {
    t += 0.03;
    mesh.rotation.z = Math.sin(t * 15) * 0.1 * (1 - t);
    if (t < 1) requestAnimationFrame(wobble);
    else mesh.rotation.z = 0;
  };
  wobble();
}
```

Also spawn fruit-colored particles falling from the tree:
```js
// In main.js treeShake handler:
actionEffects.spawnHarvest(data.x + 0.5, data.z + 0.5); // reuse harvest sparkles
```

**Commit:** `feat: fruit tree shake interaction — context menu, wobble, particles`

---

## Task 11: Plantable Fruit Tree Saplings

**Files:**
- Modify: `shared/constants.js` (add sapling items)
- Modify: `server/game/GameWorld.js` (handlePlant to support saplings)
- Modify: `client/src/ui/ItemIcons.js` (add sapling icons)

**What:** Player can plant fruit tree saplings that grow into fruit trees.

**constants.js — sapling items:**

Add to item data or create entries:
```js
export const SAPLING_DATA = {
  apple_sapling:  { fruitType: 'apple',  growthDays: 7, price: 200 },
  cherry_sapling: { fruitType: 'cherry', growthDays: 7, price: 150 },
  orange_sapling: { fruitType: 'orange', growthDays: 7, price: 250 },
  peach_sapling:  { fruitType: 'peach',  growthDays: 7, price: 300 },
};
```

**GameWorld handlePlant changes:**

When the planted item is a sapling (check `SAPLING_DATA[cropType]`), instead of creating a crop, create a Resource with `type: 'tree'`, `fruitType`, and a growth stage system. The tree starts as a small sapling mesh and grows over `growthDays`.

Simplest approach: treat saplings as a special crop type that, when mature (stage 3), converts itself into a Resource (fruit tree). Add the sapling types to `crops.json`:

```json
"apple_sapling": { "name": "Apple Sapling", "growthTime": 7, "season": [0,1,2], "sellPrice": 0, "xp": 20 },
```

When a sapling crop reaches stage 3 in the crop growth tick, convert it:
- Remove the crop entry
- Create a new Resource at the same tile with `type: 'tree'`, `fruitType: 'apple'`, `fruitReady: true`
- Broadcast `resourceAdded` + `cropRemoved`

**ItemIcons.js — add sapling icons:**
```js
apple_sapling: { emoji: '\uD83C\uDF3B', name: 'Apple Sapling' },
cherry_sapling: { emoji: '\uD83C\uDF3B', name: 'Cherry Sapling' },
orange_sapling: { emoji: '\uD83C\uDF3B', name: 'Orange Sapling' },
peach_sapling: { emoji: '\uD83C\uDF3B', name: 'Peach Sapling' },
```

Also add fruit items:
```js
apple: { emoji: '\uD83C\uDF4E', name: 'Apple' },
cherry: { emoji: '\uD83C\uDF52', name: 'Cherry' },
orange: { emoji: '\uD83C\uDF4A', name: 'Orange' },
peach: { emoji: '\uD83C\uDF51', name: 'Peach' },
```

**Commit:** `feat: plantable fruit tree saplings — grow into fruit trees`

---

## File Summary

| File | Tasks |
|------|-------|
| `client/src/main.js` | 1, 6 (proximity check, loot toast wiring) |
| `server/game/GameWorld.js` | 2, 5, 8 (server proximity, lootDrop events, fruit tree handlers) |
| `server/index.js` | 8 (treeShake socket action) |
| `server/entities/Resource.js` | 7 (fruitType/fruitReady fields) |
| `shared/constants.js` | 7, 11 (fruit data, sapling data) |
| `client/src/ui/HUD.js` | 3 (backpack icon) |
| `client/src/ui/LootToast.js` | 4 (new file — loot toast UI) |
| `client/styles/game.css` | 3, 4 (backpack CSS, loot toast CSS) |
| `client/src/ui/SelectionManager.js` | 10 (fruit tree context menu) |
| `client/src/entities/ResourceRenderer.js` | 9, 10 (fruit dots, shake animation) |
| `client/src/engine/AssetGenerator.js` | 9 (fruit dot geometry) |
| `client/src/network/NetworkClient.js` | 8 (sendTreeShake) |
| `client/src/ui/ItemIcons.js` | 11 (fruit + sapling icons) |

## Dependency Graph

```
Task 1 (client proximity) ─────── standalone, do first
Task 2 (server proximity) ─────── standalone
Task 3 (backpack icon) ──────────── standalone
Task 4 (loot toast UI) ──────────── depends on 3 (backpack position)
Task 5 (server lootDrop) ────────── standalone
Task 6 (wire loot toasts) ────────── depends on 4, 5
Task 7 (fruit data model) ────────── standalone
Task 8 (fruit generation/shake) ──── depends on 2, 7
Task 9 (fruit visuals) ─────────── depends on 7
Task 10 (fruit interaction) ──────── depends on 8, 9
Task 11 (plantable saplings) ──────── depends on 7, 8
```

Execution order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11

## Verification

1. **Build:** `npx vite build` — no errors
2. **Start:** `node server/index.js` — start game
3. **Test checklist:**
   - [ ] Click tile 3+ tiles away → "Too far away!" toast
   - [ ] Click tile within 2 tiles → action works normally
   - [ ] Chop tree → loot toast "Wood x8" appears, flies to backpack
   - [ ] Mine rock → loot toast "Stone x5" appears, flies to backpack
   - [ ] Harvest crop → loot toast with crop name + quantity
   - [ ] Forage → loot toast with forage item
   - [ ] Backpack icon visible, clickable, opens inventory
   - [ ] Backpack icon pulses when loot arrives
   - [ ] Some trees on farm have colored fruit dots
   - [ ] Right-click fruit tree → "Shake" option
   - [ ] Shake → tree wobbles, fruit particles, loot toast
   - [ ] Shake again same tree → no fruit (needs timer)
   - [ ] After in-game day passes → fruit regrows
   - [ ] Plant apple sapling → grows as crop → becomes fruit tree at maturity
   - [ ] Fishing still shows existing toast + loot toast for fish item
