# Graphics Polish, NPC Town & Shops, Fishing Robustness — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a proper NPC town with shops and interaction UI, polish game visuals with particle effects and seasonal changes, and make fishing feel satisfying with visual feedback.

**Architecture:** All rendering is procedural Three.js (no textures). The server is authoritative — client sends actions, server validates and broadcasts. Town layout is generated server-side in TerrainGenerator/DecorationGenerator. Shop UI is a client-side modal that sends buy/sell actions over the existing NetworkClient. Fishing gets a client-side bobber visual with server-side bite timing.

**Tech Stack:** Three.js r183, Socket.io, Express, better-sqlite3, Vite (client bundler with `@shared` alias → `shared/`). Server imports use relative paths (`../../shared/constants.js`).

---

## Task 1: Town Terrain Zone

**Goal:** Carve out a proper town area in the NE quadrant with paths connecting buildings and the farm.

**Files:**
- Modify: `server/game/TerrainGenerator.js`
- Modify: `server/game/DecorationGenerator.js`

**Context:** Currently, NPCs have positions in the 26-48 X range (NE area), but the terrain there is random grass/stone/trees. We need a cleared town zone with paths between buildings. The farm center is at (32,32). The town should be north of the farm, roughly x:24-50, z:2-16.

**Step 1: Add town zone to TerrainGenerator**

In `server/game/TerrainGenerator.js`, add a town zone check after the farm area check. The town zone should create PATH tiles for streets and GRASS tiles for building plots.

```javascript
// Town zone — NE quadrant, north of farm
const townLeft = 24, townRight = 50;
const townTop = 2, townBottom = 16;
const isTownArea = x >= townLeft && x <= townRight && z >= townTop && z <= townBottom;

// Town main street (east-west through middle of town)
const townMainStreetZ = 9;
const isTownMainStreet = isTownArea && Math.abs(z - townMainStreetZ) < 1;

// Town cross streets (north-south every ~6 tiles)
const isTownCrossStreet = isTownArea && (
  Math.abs(x - 28) < 1 ||  // West cross street
  Math.abs(x - 34) < 1 ||  // Center cross street
  Math.abs(x - 40) < 1 ||  // East cross street
  Math.abs(x - 46) < 1     // Far east cross street
);

// Town plaza — central gathering area
const plazaCx = 34, plazaCz = 9;
const isTownPlaza = Math.abs(x - plazaCx) <= 2 && Math.abs(z - plazaCz) <= 2;
```

Add these zone checks into the tile type assignment, between the path and farm area checks:

```javascript
if (isPond) {
  type = TILE_TYPES.WATER;
} else if (isPondBeach) {
  type = TILE_TYPES.SAND;
} else if (isTownPlaza) {
  type = TILE_TYPES.STONE;    // cobblestone plaza
} else if (isTownMainStreet || isTownCrossStreet) {
  type = TILE_TYPES.PATH;
} else if (isTownArea) {
  type = TILE_TYPES.GRASS;    // clear building plots
} else if (isPath) {
  type = TILE_TYPES.PATH;
} else if (isFarmArea) {
  // ... existing code
}
```

Also extend the existing path to connect to the town — the current path runs from `cz - 3` northward. Extend it to connect with the town's main street:

```javascript
// Path from farm to town
const isPath = Math.abs(x - pathX) < 1.5 && z < cz - 3 && z > townBottom;
// Path continuation into town
const isFarmToTownPath = Math.abs(x - cx) < 1.5 && z >= townBottom && z <= townBottom + 2;
```

Set tile height to 0 for town area (flat ground).

**Step 2: Skip town zone in DecorationGenerator**

In `server/game/DecorationGenerator.js`, add a town exclusion zone similar to the farm zone skip:

```javascript
// Town zone — skip decorations (buildings live here)
const townLeft = 24, townRight = 50;
const townTop = 2, townBottom = 16;
if (x >= townLeft && x <= townRight && z >= townTop && z <= townBottom) continue;
```

**Step 3: Test visually**

Run: `npm run dev`
Expected: Town area in the NE should be a clear grassy area with stone paths and a cobblestone plaza. No random trees/rocks in the town zone. Path connects farm to town.

**Step 4: Commit**

```bash
git add server/game/TerrainGenerator.js server/game/DecorationGenerator.js
git commit -m "feat: add town terrain zone with streets, plaza, and farm-to-town path"
```

---

## Task 2: Town Buildings

**Goal:** Place 6 NPC buildings in the town (bakery, blacksmith, library, fishing shack, town hall, vet clinic) and add a shipping bin.

**Files:**
- Modify: `server/game/GameWorld.js` (add town buildings in _initStarterFarm)
- Modify: `client/src/engine/AssetGenerator.js` (add new building types)
- Modify: `server/data/npcs.json` (update NPC positions to match building locations)

**Context:** AssetGenerator.createBuilding() currently supports: house, barn, coop, mill, shop. We need distinct building types for each NPC's shop. Buildings are placed in GameWorld._initStarterFarm() and stored in `this.buildings`.

**Step 1: Add new building types to AssetGenerator**

In `client/src/engine/AssetGenerator.js`, expand the `configs` object in `createBuilding()` and add building-specific extras:

```javascript
const configs = {
  house:      { w: 2, h: 1.5, d: 2, color: 0xc4956a, roofColor: 0x8b4513 },
  barn:       { w: 3, h: 2, d: 2.5, color: 0xcc3333, roofColor: 0x5c2a0e },
  coop:       { w: 1.5, h: 1, d: 1.5, color: 0xdeb887, roofColor: 0x8b6914 },
  mill:       { w: 1.5, h: 2.5, d: 1.5, color: 0xf5f5dc, roofColor: 0x666666 },
  shop:       { w: 2, h: 1.5, d: 2, color: 0x6495ed, roofColor: 0x4169e1 },
  bakery:     { w: 2.2, h: 1.6, d: 2, color: 0xf5c07a, roofColor: 0xcc6633 },
  blacksmith: { w: 2.5, h: 1.8, d: 2.2, color: 0x555555, roofColor: 0x333333 },
  library:    { w: 2, h: 1.8, d: 2.5, color: 0x8866aa, roofColor: 0x554477 },
  fishing_hut:{ w: 1.5, h: 1.2, d: 1.5, color: 0x88aacc, roofColor: 0x336699 },
  town_hall:  { w: 3, h: 2.2, d: 2.5, color: 0xddd8c4, roofColor: 0x445566 },
  vet_clinic: { w: 2, h: 1.5, d: 2, color: 0xaaddaa, roofColor: 0x558855 },
  shipping_bin:{ w: 0.8, h: 0.5, d: 0.8, color: 0x8b6b4a, roofColor: 0x6b4a2a },
};
```

Add building-type-specific details after the common building code:

For **bakery**: add a chimney with warm orange emissive glow (baking oven feel)
```javascript
if (type === 'bakery') {
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.6, 0.3), this.getMaterial(0x884433)
  );
  chimney.position.set(cfg.w * 0.3, cfg.h + cfg.h * 0.4, -cfg.d * 0.2);
  chimney.castShadow = true;
  group.add(chimney);
  // Warm glow from doorway
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.6),
    this.getMaterial(0xffaa44, { emissive: 0xff8822, emissiveIntensity: 0.5 })
  );
  glow.position.set(0, 0.3, cfg.d / 2 + 0.02);
  group.add(glow);
}
```

For **blacksmith**: add an anvil outside and darker aesthetic
```javascript
if (type === 'blacksmith') {
  // Anvil outside the door
  const anvil = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.2, 0.15), this.getMaterial(0x333333)
  );
  anvil.position.set(0.6, 0.1, cfg.d / 2 + 0.4);
  anvil.castShadow = true;
  group.add(anvil);
  // Anvil top
  const anvilTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.05, 0.2), this.getMaterial(0x444444)
  );
  anvilTop.position.set(0.6, 0.22, cfg.d / 2 + 0.4);
  group.add(anvilTop);
  // Chimney with embers
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.8, 0.35), this.getMaterial(0x444444)
  );
  chimney.position.set(-cfg.w * 0.25, cfg.h + cfg.h * 0.3, -cfg.d * 0.15);
  chimney.castShadow = true;
  group.add(chimney);
}
```

For **town_hall**: add a clock face and flag pole
```javascript
if (type === 'town_hall') {
  // Clock circle on front
  const clock = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 8), this.getMaterial(0xffffff)
  );
  clock.position.set(0, cfg.h * 0.85, cfg.d / 2 + 0.02);
  group.add(clock);
  // Flag pole on roof
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4), this.getMaterial(0x888888)
  );
  pole.position.set(0, cfg.h + cfg.h * 0.45 + 0.4, 0);
  group.add(pole);
  // Flag
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.15), this.getMaterial(0xcc2222, { side: THREE.DoubleSide })
  );
  flag.position.set(0.15, cfg.h + cfg.h * 0.45 + 0.7, 0);
  group.add(flag);
}
```

For **shipping_bin**: an open-top wooden box (no roof)
```javascript
if (type === 'shipping_bin') {
  // Override — no roof for shipping bin, just an open box
  roof.visible = false;
  door.visible = false;
  knob.visible = false;
  // Remove windows for this type
  // Add dark interior
  const interior = new THREE.Mesh(
    new THREE.PlaneGeometry(cfg.w * 0.9, cfg.d * 0.9),
    this.getMaterial(0x2a1a0a)
  );
  interior.rotation.x = -Math.PI / 2;
  interior.position.y = cfg.h - 0.02;
  group.add(interior);
}
```

**Step 2: Place town buildings in GameWorld**

In `server/game/GameWorld.js`, in `_initStarterFarm()`, add town buildings after the existing house/barn:

```javascript
// ── Town buildings ──
const townBuildings = [
  { id: 'bakery',      type: 'bakery',      tileX: 26, tileZ: 7 },
  { id: 'blacksmith',  type: 'blacksmith',  tileX: 36, tileZ: 7 },
  { id: 'library',     type: 'library',     tileX: 31, tileZ: 5 },
  { id: 'town_hall',   type: 'town_hall',   tileX: 34, tileZ: 4 },
  { id: 'vet_clinic',  type: 'vet_clinic',  tileX: 26, tileZ: 11 },
  { id: 'fishing_hut', type: 'fishing_hut', tileX: 44, tileZ: 10 },
  { id: 'general_store', type: 'shop',      tileX: 40, tileZ: 7 },
  { id: 'shipping_bin', type: 'shipping_bin', tileX: 30, tileZ: 32 },
];
for (const b of townBuildings) {
  this.buildings.set(b.id, b);
}
```

**Step 3: Update NPC positions to match buildings**

In `server/data/npcs.json`, update homeX/Z and shopX/Z to align with the new building positions:

```json
{
  "id": "npc_baker", "homeX": 26, "homeZ": 8, "shopX": 27, "shopZ": 8,
  "id": "npc_smith", "homeX": 36, "homeZ": 8, "shopX": 37, "shopZ": 8,
  "id": "npc_librarian", "homeX": 31, "homeZ": 6, "shopX": 32, "shopZ": 6,
  "id": "npc_fisher", "homeX": 44, "homeZ": 11, "shopX": 45, "shopZ": 11,
  "id": "npc_mayor", "homeX": 34, "homeZ": 5, "shopX": 35, "shopZ": 5,
  "id": "npc_vet", "homeX": 26, "homeZ": 12, "shopX": 27, "shopZ": 12
}
```

Positions are 1 tile south and 1 tile east of their building origin (standing at the door).

**Step 4: Test visually**

Run: `npm run dev`
Expected: Town area has distinct buildings — warm bakery with chimney, dark blacksmith with anvil, purple library, grand town hall with flag, green vet clinic, blue fishing hut. Shipping bin appears near the farm.

**Step 5: Commit**

```bash
git add client/src/engine/AssetGenerator.js server/game/GameWorld.js server/data/npcs.json
git commit -m "feat: add town buildings (bakery, blacksmith, library, town hall, vet, fishing hut, shipping bin)"
```

---

## Task 3: NPC Walking Animations & Idle

**Goal:** Give NPCs the same walking and idle animations that players have, plus face their movement direction.

**Files:**
- Modify: `client/src/entities/NPCRenderer.js`

**Context:** NPCRenderer currently just lerps position — meshes don't animate. PlayerRenderer has a sophisticated animation system with walk/idle states and limb pivot groups. NPCs use the same `createNPC()` mesh with `userData.parts` pivot groups. We should reuse the same animation approach.

**Step 1: Rewrite NPCRenderer with animation states**

Replace the entire `NPCRenderer` with animation support:

```javascript
// client/src/entities/NPCRenderer.js
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
    parts.leftLegPivot.rotation.x = s * 0.5;
    parts.rightLegPivot.rotation.x = -s * 0.5;
    parts.leftArmPivot.rotation.x = -s * 0.4;
    parts.rightArmPivot.rotation.x = s * 0.4;
    parts.body.position.y = 0.75 + Math.abs(c) * 0.02;
    parts.head.position.y = 1.2 + Math.abs(c) * 0.015;
    parts.hair.position.y = 1.28 + Math.abs(c) * 0.015;
  }

  _animateIdle(entry, parts, delta) {
    entry.idleTime += delta;
    const t = entry.idleTime;
    const breath = Math.sin(t * 1.2) * 0.008;
    parts.body.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath);
    parts.body.rotation.z = Math.sin(t * 0.3) * 0.01;
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
```

**Step 2: Test visually**

Run: `npm run dev`
Expected: NPCs breathe gently when idle, walk with natural limb swings when transitioning between home/shop positions, face their movement direction.

**Step 3: Commit**

```bash
git add client/src/entities/NPCRenderer.js
git commit -m "feat: add NPC walking and idle animations with limb swing and breathing"
```

---

## Task 4: NPC Name Labels

**Goal:** Show floating name + role labels above each NPC's head.

**Files:**
- Modify: `client/src/entities/NPCRenderer.js`

**Context:** We need to create sprite-based text labels that float above NPC heads and always face the camera (billboard behavior). Three.js has `Sprite` and `SpriteMaterial` with `canvas` textures for text rendering.

**Step 1: Add name label creation**

Add a `_createNameLabel(name, role)` method to NPCRenderer that creates a canvas-based sprite:

```javascript
import * as THREE from 'three';

// At class level, add this method:
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
  ctx.fillStyle = '#aaaaaa';
  ctx.font = '16px sans-serif';
  ctx.fillText(role, 128, 46);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.2, 0.3, 1);
  sprite.position.y = 1.7; // above head
  return sprite;
}
```

In `build()`, after creating the mesh, add the label as a child:

```javascript
// In build(), after mesh creation:
const label = this._createNameLabel(npc.name, npc.role || '');
mesh.add(label);
```

The NPC state needs role data. Check that `NPC.getState()` in `server/entities/NPC.js` includes `role` — it already does.

**Step 2: Test visually**

Run: `npm run dev`
Expected: Each NPC has a floating name and role label above their head that always faces the camera.

**Step 3: Commit**

```bash
git add client/src/entities/NPCRenderer.js
git commit -m "feat: add floating name/role labels above NPCs"
```

---

## Task 5: Shop UI

**Goal:** Create a shop modal that appears when talking to merchant NPCs, with buy/sell tabs and item listings.

**Files:**
- Create: `client/src/ui/ShopUI.js`
- Modify: `client/styles/game.css` (shop styles)
- Modify: `client/src/main.js` (wire shop UI)
- Modify: `server/game/GameWorld.js` (send shop inventory with dialogue)

**Context:** The server already has `handleShopBuy()` and `handleShopSell()`. The client has `sendBuy()` and `sendSell()`. What's missing is a shop UI and a trigger to open it. Currently, clicking an NPC calls `sendNPCTalk` which returns `npcDialogue` event with text. We need to also send available shop items.

**Step 1: Enhance server NPC dialogue to include shop data**

In `server/game/GameWorld.js`, modify `handleNPCTalk()` to include shop items based on NPC role:

```javascript
// After the dialogue line in handleNPCTalk, add shop data:
const shopItems = this._getShopItems(npc);

this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
  type: 'npcDialogue',
  npcId: npc.id,
  npcName: npc.name,
  npcRole: npc.role,
  text: dialogue,
  hearts: rel.hearts,
  shopItems, // array of { itemId, name, price } or null
});
```

Add the `_getShopItems(npc)` helper:

```javascript
_getShopItems(npc) {
  switch (npc.role) {
    case 'Baker':
      // Sells seeds for spring/summer crops
      return Object.entries(cropsData)
        .filter(([_, c]) => c.buyPrice > 0)
        .map(([id, c]) => ({
          itemId: id + '_seed',
          name: id.replace(/_/g, ' ') + ' seeds',
          price: c.buyPrice,
          season: c.season,
        }));
    case 'Fisherman':
      return [
        { itemId: 'bait', name: 'Bait', price: 5 },
        { itemId: 'crab_pot', name: 'Crab Pot', price: 200 },
      ];
    case 'Veterinarian':
      return [
        { itemId: 'hay', name: 'Hay', price: 50 },
        { itemId: 'animal_medicine', name: 'Animal Medicine', price: 150 },
      ];
    case 'Blacksmith':
      return [
        { itemId: 'copper_bar', name: 'Copper Bar', price: 120 },
        { itemId: 'iron_bar', name: 'Iron Bar', price: 250 },
      ];
    default:
      return null; // Not a merchant
  }
}
```

**Step 2: Create ShopUI component**

Create `client/src/ui/ShopUI.js`:

```javascript
// client/src/ui/ShopUI.js
// Shop modal with buy/sell tabs for NPC merchants.

export class ShopUI {
  constructor() {
    this.visible = false;
    this.onBuy = null;  // (itemId, quantity) => void
    this.onSell = null; // (itemId, quantity) => void
    this.currentTab = 'buy';
    this.shopItems = [];
    this.playerInventory = [];

    this.el = document.createElement('div');
    this.el.id = 'shop-panel';
    this.el.className = 'panel hidden';
    document.getElementById('ui-overlay').appendChild(this.el);
  }

  show(npcName, shopItems, playerInventory) {
    this.visible = true;
    this.shopItems = shopItems || [];
    this.playerInventory = playerInventory || [];
    this.currentTab = 'buy';
    this.el.className = 'panel';
    this._render(npcName);
  }

  hide() {
    this.visible = false;
    this.el.className = 'panel hidden';
  }

  updateInventory(inventory) {
    this.playerInventory = inventory;
    if (this.visible && this.currentTab === 'sell') {
      this._renderSellList();
    }
  }

  _render(npcName) {
    this.el.innerHTML = `
      <div class="shop-header">
        <span class="shop-title">${npcName}'s Shop</span>
        <span class="shop-close">&times;</span>
      </div>
      <div class="shop-tabs">
        <div class="shop-tab active" data-tab="buy">Buy</div>
        <div class="shop-tab" data-tab="sell">Sell</div>
      </div>
      <div class="shop-items" id="shop-item-list"></div>
    `;

    // Close button
    this.el.querySelector('.shop-close').addEventListener('click', () => this.hide());

    // Tab switching
    this.el.querySelectorAll('.shop-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.currentTab = tab.dataset.tab;
        this.el.querySelectorAll('.shop-tab').forEach(t => t.classList.toggle('active', t === tab));
        if (this.currentTab === 'buy') this._renderBuyList();
        else this._renderSellList();
      });
    });

    this._renderBuyList();
  }

  _renderBuyList() {
    const list = this.el.querySelector('#shop-item-list');
    if (this.shopItems.length === 0) {
      list.innerHTML = '<div class="shop-empty">Nothing for sale</div>';
      return;
    }
    list.innerHTML = this.shopItems.map(item => `
      <div class="shop-item" data-item="${item.itemId}">
        <span class="shop-item-name">${item.name}</span>
        <span class="shop-item-price">${item.price}g</span>
        <button class="shop-buy-btn" data-item="${item.itemId}" data-price="${item.price}">Buy</button>
      </div>
    `).join('');

    list.querySelectorAll('.shop-buy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.onBuy) this.onBuy(btn.dataset.item, 1);
      });
    });
  }

  _renderSellList() {
    const list = this.el.querySelector('#shop-item-list');
    const sellable = this.playerInventory.filter(i => !i.itemId.endsWith('_seed'));
    if (sellable.length === 0) {
      list.innerHTML = '<div class="shop-empty">Nothing to sell</div>';
      return;
    }
    list.innerHTML = sellable.map(item => `
      <div class="shop-item" data-item="${item.itemId}">
        <span class="shop-item-name">${item.itemId.replace(/_/g, ' ')} x${item.quantity}</span>
        <button class="shop-sell-btn" data-item="${item.itemId}">Sell</button>
      </div>
    `).join('');

    list.querySelectorAll('.shop-sell-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.onSell) this.onSell(btn.dataset.item, 1);
      });
    });
  }
}
```

**Step 3: Add shop CSS styles**

In `client/styles/game.css`, add before the `@media` block:

```css
/* Shop UI */
#shop-panel {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(420px, 90vw);
  max-height: 70vh;
}

.shop-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.shop-title {
  font-size: 18px;
  font-weight: bold;
  color: #ffcc00;
}

.shop-close {
  cursor: pointer;
  font-size: 22px;
  color: #888;
  padding: 0 4px;
}

.shop-close:hover {
  color: #fff;
}

.shop-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.shop-tab {
  flex: 1;
  text-align: center;
  padding: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  cursor: pointer;
  color: #aaa;
}

.shop-tab.active {
  background: rgba(255, 204, 0, 0.15);
  color: #ffcc00;
  font-weight: bold;
}

.shop-items {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shop-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.shop-item-name {
  flex: 1;
  text-transform: capitalize;
}

.shop-item-price {
  color: #ffcc00;
  margin-right: 12px;
}

.shop-buy-btn, .shop-sell-btn {
  background: rgba(255, 204, 0, 0.2);
  border: 1px solid #ffcc00;
  color: #ffcc00;
  border-radius: 4px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 12px;
}

.shop-buy-btn:hover, .shop-sell-btn:hover {
  background: rgba(255, 204, 0, 0.35);
}

.shop-empty {
  text-align: center;
  color: #666;
  padding: 20px;
}
```

**Step 4: Wire shop UI in main.js**

In `client/src/main.js`, import ShopUI and wire it up:

```javascript
import { ShopUI } from './ui/ShopUI.js';

// After creating dialogueUI:
const shopUI = new ShopUI();

// Wire buy/sell handlers:
shopUI.onBuy = (itemId, qty) => network.sendBuy(itemId, qty);
shopUI.onSell = (itemId, qty) => network.sendSell(itemId, qty);
```

Modify the `npcDialogue` handler in the worldUpdate switch to open shop when merchant NPC:

```javascript
case 'npcDialogue':
  if (data.shopItems && data.shopItems.length > 0) {
    dialogueUI.show(data.npcName, data.text);
    // Open shop after a brief dialogue display
    setTimeout(() => {
      dialogueUI.hide();
      const localPlayer = { inventory: [] };
      // Use latest inventory from inventoryUpdate
      shopUI.show(data.npcName, data.shopItems, currentInventory);
    }, 1500);
  } else {
    dialogueUI.show(data.npcName, data.text);
  }
  break;
```

Also add a `currentInventory` variable tracked from inventory updates:

```javascript
// Near the top of the main function, after network handlers setup:
let currentInventory = localPlayer?.inventory || [];

// In the inventoryUpdate handler:
network.on('inventoryUpdate', (data) => {
  hud.updateStats(data);
  inventoryUI.update(data.inventory);
  currentInventory = data.inventory;
  shopUI.updateInventory(data.inventory);
});
```

Add keyboard escape to close shop:

```javascript
// In keyDown handler:
if (key === 'Escape') {
  if (shopUI.visible) shopUI.hide();
  else if (inventoryUI.visible) inventoryUI.toggle();
}
```

**Step 5: Test**

Run: `npm run dev`
Expected: Click an NPC → dialogue shows briefly → shop opens with buy/sell tabs. Can buy seeds, sell crops. Pressing Escape closes shop.

**Step 6: Commit**

```bash
git add client/src/ui/ShopUI.js client/styles/game.css client/src/main.js server/game/GameWorld.js
git commit -m "feat: add shop UI with buy/sell tabs for NPC merchants"
```

---

## Task 6: Fishing Visual Polish

**Goal:** Add a bobber visual when casting, ripple effect on water, and timed bite notification before catch result.

**Files:**
- Create: `client/src/effects/FishingEffects.js`
- Modify: `client/src/main.js` (wire fishing effects)
- Modify: `server/game/GameWorld.js` (add bite timing)

**Context:** Currently fishing is instant: click water → server rolls → fishCaught/fishMiss. We need: (1) casting animation plays, (2) bobber appears at cast location, (3) server waits 1-4s then sends bite event, (4) player sees bobber splash, (5) client auto-reels, (6) result shown.

**Step 1: Add server-side bite timing**

In `server/game/GameWorld.js`, change `handleFishCast` to use a two-phase approach:

```javascript
handleFishCast(socketId, data) {
  const player = this.players.get(socketId);
  if (!player || !player.useEnergy(5)) return;

  const idx = tileIndex(Math.floor(data.x), Math.floor(data.z));
  if (idx < 0 || idx >= this.tiles.length) return;
  if (this.tiles[idx].type !== TILE_TYPES.WATER) return;

  // Phase 1: Send cast confirmation with bobber position
  this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
    type: 'fishCast',
    playerId: player.id,
    x: data.x,
    z: data.z,
  });

  // Phase 2: After random delay (1.5-4s), resolve the catch
  const biteDelay = 1500 + Math.random() * 2500;
  setTimeout(() => {
    // Player may have disconnected
    if (!this.players.has(socketId)) return;

    const location = 'pond';
    const fish = this.fishCalc.rollCatch(location, player.level);

    // Send bite event
    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'fishBite',
      playerId: player.id,
      x: data.x,
      z: data.z,
    });

    // Auto-resolve after bite (for now — minigame comes later)
    setTimeout(() => {
      if (!this.players.has(socketId)) return;

      if (fish) {
        player.addItem(fish.id, 1);
        player.addSkillXP(SKILLS.FISHING, 5 + fish.rarity * 10);
        this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
          type: 'fishCaught',
          playerId: player.id,
          fish,
          x: data.x,
          z: data.z,
        });
        this._sendInventoryUpdate(socketId, player);
      } else {
        this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
          type: 'fishMiss',
          playerId: player.id,
        });
      }
    }, 500);
  }, biteDelay);
}
```

**Step 2: Create FishingEffects**

Create `client/src/effects/FishingEffects.js`:

```javascript
// client/src/effects/FishingEffects.js
// Visual effects for fishing: bobber, line, ripples, splash.

import * as THREE from 'three';

export class FishingEffects {
  constructor(scene) {
    this.scene = scene;
    this.bobber = null;
    this.line = null;
    this.ripple = null;
    this._rippleTime = 0;
    this._bobbing = false;
    this._biting = false;
  }

  /** Show bobber at water position */
  cast(x, z) {
    this.clear();
    this._bobbing = true;
    this._biting = false;

    // Bobber — red/white ball
    const bobberGroup = new THREE.Group();
    const redPart = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 4),
      new THREE.MeshLambertMaterial({ color: 0xff2222, flatShading: true })
    );
    redPart.position.y = 0.06;
    bobberGroup.add(redPart);

    const whitePart = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 6, 4),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })
    );
    whitePart.position.y = 0.12;
    bobberGroup.add(whitePart);

    // Stick
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.12, 3),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    stick.position.y = 0.18;
    bobberGroup.add(stick);

    bobberGroup.position.set(x, 0.02, z);
    this.scene.add(bobberGroup);
    this.bobber = bobberGroup;

    // Ripple ring
    const rippleGeo = new THREE.RingGeometry(0.05, 0.08, 16);
    const rippleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.3, side: THREE.DoubleSide
    });
    this.ripple = new THREE.Mesh(rippleGeo, rippleMat);
    this.ripple.rotation.x = -Math.PI / 2;
    this.ripple.position.set(x, 0.03, z);
    this.scene.add(this.ripple);
    this._rippleTime = 0;
  }

  /** Fish is biting — bobber dunks */
  bite() {
    this._biting = true;
  }

  /** Show catch splash and clear */
  catchResult(success) {
    if (this.bobber) {
      // Quick splash particles
      this._createSplash(this.bobber.position.x, this.bobber.position.z, success);
    }
    // Clear after brief delay
    setTimeout(() => this.clear(), 800);
  }

  _createSplash(x, z, success) {
    const count = success ? 12 : 6;
    const color = success ? 0x44ccff : 0x6688aa;
    const particles = [];

    for (let i = 0; i < count; i++) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 4, 3),
        new THREE.MeshLambertMaterial({ color, transparent: true })
      );
      const angle = (i / count) * Math.PI * 2;
      dot.position.set(x, 0.1, z);
      dot.userData.vel = {
        x: Math.cos(angle) * (0.5 + Math.random() * 0.5),
        y: 1.5 + Math.random(),
        z: Math.sin(angle) * (0.5 + Math.random() * 0.5),
      };
      this.scene.add(dot);
      particles.push(dot);
    }

    // Animate splash particles
    let elapsed = 0;
    const animate = () => {
      elapsed += 0.016;
      for (const p of particles) {
        p.position.x += p.userData.vel.x * 0.016;
        p.position.y += p.userData.vel.y * 0.016;
        p.position.z += p.userData.vel.z * 0.016;
        p.userData.vel.y -= 4 * 0.016; // gravity
        p.material.opacity = Math.max(0, 1 - elapsed * 2);
      }
      if (elapsed < 0.8) requestAnimationFrame(animate);
      else {
        for (const p of particles) {
          this.scene.remove(p);
          p.geometry.dispose();
          p.material.dispose();
        }
      }
    };
    requestAnimationFrame(animate);
  }

  /** Per-frame update */
  update(delta) {
    if (!this.bobber || !this._bobbing) return;

    // Bobber gentle float
    const time = Date.now() * 0.001;
    if (this._biting) {
      // Dunk down repeatedly
      this.bobber.position.y = 0.02 + Math.sin(time * 12) * 0.04 - 0.03;
    } else {
      this.bobber.position.y = 0.02 + Math.sin(time * 2) * 0.01;
    }

    // Ripple expand and fade
    if (this.ripple) {
      this._rippleTime += delta;
      const cycle = this._rippleTime % 2; // repeat every 2s
      const scale = 1 + cycle * 1.5;
      this.ripple.scale.set(scale, scale, 1);
      this.ripple.material.opacity = 0.3 * (1 - cycle / 2);
    }
  }

  clear() {
    this._bobbing = false;
    this._biting = false;
    if (this.bobber) {
      this.scene.remove(this.bobber);
      this.bobber.traverse(c => { if (c.geometry) c.geometry.dispose(); });
      this.bobber = null;
    }
    if (this.ripple) {
      this.scene.remove(this.ripple);
      this.ripple.geometry.dispose();
      this.ripple.material.dispose();
      this.ripple = null;
    }
  }

  dispose() { this.clear(); }
}
```

**Step 3: Wire fishing effects in main.js**

In `client/src/main.js`:

```javascript
import { FishingEffects } from './effects/FishingEffects.js';

// After renderer creation:
const fishingFx = new FishingEffects(sceneManager.scene);

// In the worldUpdate switch, add/modify cases:
case 'fishCast':
  if (data.playerId === network.playerId) {
    fishingFx.cast(data.x, data.z);
  }
  break;
case 'fishBite':
  if (data.playerId === network.playerId) {
    fishingFx.bite();
  }
  break;
case 'fishCaught':
  if (data.playerId === network.playerId) {
    fishingFx.catchResult(true);
    console.log('Caught:', data.fish.name || data.fish.id);
  }
  break;
case 'fishMiss':
  if (data.playerId === network.playerId) {
    fishingFx.catchResult(false);
    console.log('The fish got away...');
  }
  break;

// In the render loop update:
fishingFx.update(delta);
```

**Step 4: Test**

Run: `npm run dev`
Expected: Select fishing rod → click water → bobber appears floating → 2-4s wait → bobber dunks (bite) → splash effect → catch result logged.

**Step 5: Commit**

```bash
git add client/src/effects/FishingEffects.js client/src/main.js server/game/GameWorld.js
git commit -m "feat: add fishing bobber, ripples, bite timing, and splash effects"
```

---

## Task 7: Particle Effects (Harvest, Water, Tool Impacts)

**Goal:** Add satisfying particle bursts for farming actions: harvest sparkles, watering drops, tilling dirt puffs.

**Files:**
- Create: `client/src/effects/ParticleEffects.js`
- Modify: `client/src/main.js` (wire effects to game events)

**Context:** Currently farming actions have no visual feedback beyond crop removal/addition. Adding particles makes actions feel rewarding. Particles should be fire-and-forget (spawn, animate, self-clean).

**Step 1: Create ParticleEffects system**

Create `client/src/effects/ParticleEffects.js`:

```javascript
// client/src/effects/ParticleEffects.js
// Fire-and-forget particle bursts for farming and tool actions.

import * as THREE from 'three';

export class ParticleEffects {
  constructor(scene) {
    this.scene = scene;
    this._active = [];
  }

  /** Golden sparkles when harvesting crops */
  harvestBurst(x, z) {
    this._burst(x, 0.3, z, {
      count: 15,
      colors: [0xffdd44, 0xffaa22, 0x44ff44, 0xffffff],
      speed: 1.5,
      gravity: -2,
      lifetime: 0.8,
      size: 0.04,
    });
  }

  /** Blue water drops when watering */
  waterDrops(x, z) {
    this._burst(x, 0.5, z, {
      count: 8,
      colors: [0x44aaff, 0x6699cc, 0xaaddff],
      speed: 0.8,
      gravity: -3,
      lifetime: 0.6,
      size: 0.03,
    });
  }

  /** Brown dirt puffs when tilling */
  tillDust(x, z) {
    this._burst(x, 0.1, z, {
      count: 10,
      colors: [0x8b6914, 0x6b4a0e, 0xaa8833],
      speed: 0.6,
      gravity: -1,
      lifetime: 0.5,
      size: 0.05,
    });
  }

  /** Green leaves when planting */
  plantLeaves(x, z) {
    this._burst(x, 0.2, z, {
      count: 6,
      colors: [0x44aa22, 0x2d7a1e, 0x66cc44],
      speed: 0.5,
      gravity: -1.5,
      lifetime: 0.7,
      size: 0.035,
    });
  }

  _burst(x, y, z, opts) {
    const particles = [];
    for (let i = 0; i < opts.count; i++) {
      const color = opts.colors[Math.floor(Math.random() * opts.colors.length)];
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(opts.size, 4, 3),
        new THREE.MeshLambertMaterial({ color, transparent: true })
      );
      mesh.position.set(x, y, z);

      const angle = Math.random() * Math.PI * 2;
      const speed = opts.speed * (0.5 + Math.random() * 0.5);
      mesh.userData.vel = {
        x: Math.cos(angle) * speed * 0.5,
        y: speed,
        z: Math.sin(angle) * speed * 0.5,
      };
      mesh.userData.lifetime = opts.lifetime;
      mesh.userData.elapsed = 0;
      mesh.userData.gravity = opts.gravity;

      this.scene.add(mesh);
      particles.push(mesh);
    }
    this._active.push(particles);
  }

  update(delta) {
    for (let g = this._active.length - 1; g >= 0; g--) {
      const group = this._active[g];
      let allDone = true;

      for (let i = group.length - 1; i >= 0; i--) {
        const p = group[i];
        p.userData.elapsed += delta;
        const t = p.userData.elapsed;
        const lt = p.userData.lifetime;

        if (t >= lt) {
          this.scene.remove(p);
          p.geometry.dispose();
          p.material.dispose();
          group.splice(i, 1);
          continue;
        }

        allDone = false;
        p.position.x += p.userData.vel.x * delta;
        p.position.y += p.userData.vel.y * delta;
        p.position.z += p.userData.vel.z * delta;
        p.userData.vel.y += p.userData.gravity * delta;
        p.material.opacity = 1 - (t / lt);
      }

      if (allDone) {
        this._active.splice(g, 1);
      }
    }
  }

  dispose() {
    for (const group of this._active) {
      for (const p of group) {
        this.scene.remove(p);
        p.geometry.dispose();
        p.material.dispose();
      }
    }
    this._active = [];
  }
}
```

**Step 2: Wire particle effects in main.js**

In `client/src/main.js`:

```javascript
import { ParticleEffects } from './effects/ParticleEffects.js';

// After renderer creation:
const particleFx = new ParticleEffects(sceneManager.scene);

// In worldUpdate switch — add particle triggers:
case 'tileChange':
  terrain.updateTile(data.x, data.z, data.tileType);
  if (data.tileType === 6) { // TILLED
    const { x: wx, z: wz } = tileToWorld(data.x, data.z);
    particleFx.tillDust(wx, wz);
  }
  break;
case 'cropPlanted':
  crops.addCrop(data.crop);
  particleFx.plantLeaves(
    data.crop.tileX + 0.5,
    data.crop.tileZ + 0.5
  );
  break;
case 'cropWatered':
  // Find crop position for water drops
  // Use tile coords from data if available, otherwise skip
  break;
case 'cropHarvested':
  const { x: hx, z: hz } = tileToWorld(data.x, data.z);
  particleFx.harvestBurst(hx, hz);
  crops.removeCrop(data.cropId);
  break;

// In render loop:
particleFx.update(delta);
```

**Step 3: Test**

Run: `npm run dev`
Expected: Tilling shows brown dust puffs, planting shows green leaf particles, harvesting shows golden sparkles. All particles fade out naturally.

**Step 4: Commit**

```bash
git add client/src/effects/ParticleEffects.js client/src/main.js
git commit -m "feat: add particle effects for tilling, planting, harvesting"
```

---

## Task 8: Enhanced Crop Visuals

**Goal:** Add distinct visual models for all 24 crop types in AssetGenerator so each crop looks unique at each growth stage.

**Files:**
- Modify: `client/src/engine/AssetGenerator.js`

**Context:** Currently `createCrop()` only has explicit colors for 8 crops (wheat, corn, tomato, carrot, potato, strawberry, pumpkin, blueberry). The other 16 crops all fall through to the default green. Each crop needs a distinct color, and signature crops (pumpkin, cauliflower, melon) should get unique shapes.

**Step 1: Expand crop color map**

Update the `colors` object in `createCrop()` to include all 24 crops from crops.json:

```javascript
const colors = {
  // Spring
  parsnip: 0xf5e6c8, cauliflower: 0xf0f0f0, potato: 0x8b7355,
  garlic: 0xf5f5dc, kale: 0x2d6b4a, rhubarb: 0xcc3355,
  strawberry: 0xff3366, coffee_bean: 0x6b3a2a,
  // Summer
  melon: 0x66cc66, tomato: 0xe74c3c, hot_pepper: 0xff4422,
  blueberry: 0x4169e1, corn: 0xf5d142, wheat: 0xdaa520,
  radish: 0xee4466, starfruit: 0xffdd00,
  // Fall
  pumpkin: 0xff7518, yam: 0xcc6633, eggplant: 0x6633aa,
  cranberry: 0xcc2244, grape: 0x6644aa, artichoke: 0x558844,
  bok_choy: 0x44aa44, sunflower: 0xffcc00,
  // Multi-season
  ancient_fruit: 0x8844cc,
};
```

**Step 2: Add pumpkin-specific model**

After the corn special case, add pumpkin:

```javascript
if (cropType === 'pumpkin') return this._createPumpkin(stage);
if (cropType === 'melon') return this._createMelon(stage);
if (cropType === 'sunflower') return this._createSunflower(stage);
if (cropType === 'cauliflower') return this._createCauliflower(stage);
```

Add the special crop methods:

```javascript
_createPumpkin(stage) {
  const group = new THREE.Group();
  const scale = 0.15 + stage * 0.2;

  // Vine stem
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.02, scale * 0.5, 4),
    this.getMaterial(0x2d5a1e)
  );
  stem.position.y = scale * 0.25;
  group.add(stem);

  if (stage >= 2) {
    // Leaves
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 5, 3),
        this.getMaterial(0x3d8a30)
      );
      leaf.position.set(Math.cos(i * 2.1) * 0.15, 0.1, Math.sin(i * 2.1) * 0.15);
      leaf.scale.y = 0.4;
      group.add(leaf);
    }
  }

  if (stage >= 3) {
    // Big round pumpkin
    const pumpkin = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 7, 5),
      this.getMaterial(0xff7518)
    );
    pumpkin.position.y = 0.12;
    pumpkin.scale.y = 0.75;
    group.add(pumpkin);
    // Stem nub on top
    const nub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.03, 0.06, 4),
      this.getMaterial(0x3d5a1e)
    );
    nub.position.y = 0.22;
    group.add(nub);
  }

  group.castShadow = true;
  return group;
}

_createMelon(stage) {
  const group = new THREE.Group();
  const scale = 0.15 + stage * 0.2;

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.02, scale * 0.5, 4),
    this.getMaterial(0x2d5a1e)
  );
  stem.position.y = scale * 0.25;
  group.add(stem);

  if (stage >= 2) {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 5, 3), this.getMaterial(0x3d9930)
    );
    leaf.position.y = scale * 0.4;
    leaf.scale.y = 0.5;
    group.add(leaf);
  }

  if (stage >= 3) {
    // Oval melon shape
    const melon = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 7, 5), this.getMaterial(0x66cc66)
    );
    melon.position.y = 0.1;
    melon.scale.set(1.2, 0.8, 1);
    group.add(melon);
    // Dark stripes (subtle darker sphere overlay)
    const stripe = new THREE.Mesh(
      new THREE.SphereGeometry(0.165, 7, 5), this.getMaterial(0x449944, { transparent: true, opacity: 0.3 })
    );
    stripe.position.y = 0.1;
    stripe.scale.set(0.4, 0.82, 1.02);
    group.add(stripe);
  }

  group.castShadow = true;
  return group;
}

_createSunflower(stage) {
  const group = new THREE.Group();
  const stalkH = 0.15 + stage * 0.25;

  const stalk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.025, stalkH, 4),
    this.getMaterial(0x2d6a1e)
  );
  stalk.position.y = stalkH / 2;
  group.add(stalk);

  if (stage >= 2) {
    // Big leaves
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(
        new THREE.PlaneGeometry(0.18, 0.06),
        this.getMaterial(0x3d8a30, { side: THREE.DoubleSide })
      );
      leaf.position.set(0, stalkH * 0.3 + i * stalkH * 0.15, 0);
      leaf.rotation.set(0.3, i * 1.57, (i % 2 ? 0.4 : -0.4));
      group.add(leaf);
    }
  }

  if (stage >= 3) {
    // Flower head — brown center + yellow petals ring
    const center = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.04, 8),
      this.getMaterial(0x553311)
    );
    center.position.y = stalkH;
    center.rotation.x = 0.3; // tilt toward viewer
    group.add(center);

    for (let i = 0; i < 10; i++) {
      const petal = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 3),
        this.getMaterial(0xffcc00)
      );
      const a = (i / 10) * Math.PI * 2;
      petal.position.set(
        Math.cos(a) * 0.12,
        stalkH + Math.sin(a) * 0.03,
        Math.sin(a) * 0.12
      );
      group.add(petal);
    }
  }

  group.castShadow = true;
  return group;
}

_createCauliflower(stage) {
  const group = new THREE.Group();
  const scale = 0.2 + stage * 0.2;

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.03, scale * 0.4, 4),
    this.getMaterial(0x2d5a1e)
  );
  stem.position.y = scale * 0.2;
  group.add(stem);

  if (stage >= 1) {
    // Broad leaves
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 5, 3),
        this.getMaterial(0x3d9930)
      );
      const a = (i / 4) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.08, scale * 0.2, Math.sin(a) * 0.08);
      leaf.scale.y = 0.4;
      group.add(leaf);
    }
  }

  if (stage >= 3) {
    // White cauliflower head — bumpy cluster
    for (let i = 0; i < 5; i++) {
      const bump = new THREE.Mesh(
        new THREE.SphereGeometry(0.05 + Math.random() * 0.03, 5, 4),
        this.getMaterial(0xf0f0f0)
      );
      const a = (i / 5) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.04;
      bump.position.set(Math.cos(a) * r, scale * 0.35 + 0.02, Math.sin(a) * r);
      group.add(bump);
    }
  }

  group.castShadow = true;
  return group;
}
```

**Step 3: Test**

Run: `npm run dev`
Expected: Each crop type shows its distinctive color. Pumpkins are round and orange, sunflowers are tall with yellow heads, melons are green ovals, cauliflower has white bumpy heads.

**Step 4: Commit**

```bash
git add client/src/engine/AssetGenerator.js
git commit -m "feat: add distinct visual models for all 24 crop types"
```

---

## Task 9: Day/Night Lighting Cycle

**Goal:** Ambient and directional light intensity/color changes with game time to create day/night atmosphere.

**Files:**
- Modify: `client/src/engine/SceneManager.js` (add time-based lighting method)
- Modify: `client/src/main.js` (update lighting from time updates)

**Context:** SceneManager has an ambient light (0xfff8ee, intensity 0.55), directional sun (0xffe0a0, intensity 1.1), and hemisphere light (0.35). Currently these never change. We should smoothly transition based on game hour.

**Step 1: Add lighting update method to SceneManager**

In `client/src/engine/SceneManager.js`, add a `updateTimeOfDay(hour)` method and store light references:

```javascript
// In constructor, after creating lights, store refs:
this.ambientLight = ambient;
this.sunLight = sun;
this.hemiLight = hemi;

// New method:
updateTimeOfDay(hour) {
  // hour is 0-24 floating point
  // Define color/intensity for key times
  // 6am=dawn, 8am=morning, 12pm=noon, 18pm=sunset, 20pm=night, 2am=deep night
  let ambientIntensity, sunIntensity, ambientColor, sunColor, fogColor;

  if (hour >= 6 && hour < 8) {
    // Dawn
    const t = (hour - 6) / 2;
    ambientIntensity = 0.25 + t * 0.30;
    sunIntensity = 0.3 + t * 0.8;
    ambientColor = this._lerpColor(0x334466, 0xfff8ee, t);
    sunColor = this._lerpColor(0xff8844, 0xffe0a0, t);
    fogColor = this._lerpColor(0x445566, 0x87ceeb, t);
  } else if (hour >= 8 && hour < 17) {
    // Daytime
    ambientIntensity = 0.55;
    sunIntensity = 1.1;
    ambientColor = 0xfff8ee;
    sunColor = 0xffe0a0;
    fogColor = 0x87ceeb;
  } else if (hour >= 17 && hour < 20) {
    // Sunset
    const t = (hour - 17) / 3;
    ambientIntensity = 0.55 - t * 0.35;
    sunIntensity = 1.1 - t * 0.85;
    ambientColor = this._lerpColor(0xfff8ee, 0x334466, t);
    sunColor = this._lerpColor(0xffe0a0, 0xff6633, t);
    fogColor = this._lerpColor(0x87ceeb, 0x223344, t);
  } else {
    // Night (20-6)
    ambientIntensity = 0.2;
    sunIntensity = 0.25;
    ambientColor = 0x334466;
    sunColor = 0x6677aa;
    fogColor = 0x223344;
  }

  this.ambientLight.intensity = ambientIntensity;
  this.ambientLight.color.setHex(ambientColor);
  this.sunLight.intensity = sunIntensity;
  this.sunLight.color.setHex(sunColor);
  this.scene.fog.color.setHex(fogColor);
  this.renderer.setClearColor(fogColor);
}

_lerpColor(c1, c2, t) {
  const a = new THREE.Color(c1);
  const b = new THREE.Color(c2);
  a.lerp(b, t);
  return a.getHex();
}
```

Make sure THREE is imported at the top of SceneManager.js (it should already be).

**Step 2: Wire time updates to lighting**

In `client/src/main.js`, update the timeUpdate handler:

```javascript
network.on('timeUpdate', (data) => {
  hud.updateTime(data);
  sceneManager.updateTimeOfDay(data.hour);
});
```

Also call it once after initial load:

```javascript
// After hud.updateTime(state.time):
sceneManager.updateTimeOfDay(state.time.hour);
```

**Step 3: Test**

Run: `npm run dev`
Expected: As game time advances (1 real second = 1 game minute), lighting gradually shifts — warm dawn colors around 6am, bright daytime, orange sunset around 17-20, dark blue night.

**Step 4: Commit**

```bash
git add client/src/engine/SceneManager.js client/src/main.js
git commit -m "feat: add day/night lighting cycle with dawn, sunset, and night transitions"
```

---

## Task 10: Seasonal Tree Colors

**Goal:** Trees change foliage color based on the current season — green spring, deep green summer, orange/red fall, bare branches winter.

**Files:**
- Modify: `client/src/world/DecorationRenderer.js`
- Modify: `client/src/engine/AssetGenerator.js` (add season param to createTree)

**Context:** Currently trees are always green. DecorationRenderer gets rebuilt on fullSync. We need to pass season to createTree and vary foliage colors. The client tracks season from timeUpdate events.

**Step 1: Add season parameter to createTree**

In `client/src/engine/AssetGenerator.js`, modify `createTree(variant, seed, season)`:

```javascript
createTree(variant = 0, seed = 0, season = 0) {
  // ... existing trunk code stays the same ...

  if (variant % 3 === 1) {
    // ── Pine: evergreen, only slightly changes ──
    const pineColors = season === 3  // winter
      ? [0x2a5533, 0x2e5e38, 0x326840]
      : [0x1a5c2a, 0x1e6b30, 0x227a38];
    // ... rest of pine code same
  } else {
    // ── Oak / Fruit tree: season-dependent foliage ──
    const isOak = variant % 3 === 0;
    let leafColor;

    if (season === 0) {       // Spring — bright fresh green
      leafColor = isOak ? 0x3da85a : 0x4dbb6a;
    } else if (season === 1) { // Summer — deeper green
      leafColor = isOak ? 0x2d8a4e : 0x3da85a;
    } else if (season === 2) { // Fall — orange/red/gold
      const fallColors = [0xdd6622, 0xcc4411, 0xddaa22, 0xbb3300, 0xeeaa44];
      leafColor = fallColors[Math.floor(this._seededRand(seed, 99) * fallColors.length)];
    } else {                   // Winter — no leaves (skip foliage)
      // Add a few bare branch stubs instead
      for (let i = 0; i < 3; i++) {
        const cr = this._seededRand(seed + i, variant + i);
        const branch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.01, 0.3, 3),
          this.getMaterial(0x5a3a2a)
        );
        branch.position.set(
          (cr - 0.5) * 0.3,
          trunkH + 0.1 + i * 0.15,
          (this._seededRand(seed + i + 5, variant) - 0.5) * 0.3
        );
        branch.rotation.set(cr * 0.5, cr * 2, (cr - 0.5) * 0.8);
        group.add(branch);
      }
      group.userData.type = 'tree';
      return group;
    }

    // ... rest of foliage sphere code uses leafColor ...
  }
}
```

**Step 2: Pass season through DecorationRenderer**

Modify `DecorationRenderer.build()` to accept and pass season:

```javascript
build(decorations, season = 0) {
  for (const dec of decorations) {
    // ... existing switch ...
    case 'tree':
      mesh = this.assetGen.createTree(dec.variant, seed, season);
      mesh.userData.type = 'tree';
      break;
    // ... rest same
  }
}
```

Add a rebuild method for season changes:

```javascript
/** Rebuild all decorations for a new season */
rebuild(decorations, season) {
  this.dispose();
  this.build(decorations, season);
}
```

**Step 3: Wire season changes in main.js**

Store decorations data and rebuild on season change:

```javascript
// After initial build:
let currentDecorations = state.decorations || [];
let currentSeason = state.time.season;
decorations.build(currentDecorations, currentSeason);

// In timeUpdate handler, check for season change:
network.on('timeUpdate', (data) => {
  hud.updateTime(data);
  sceneManager.updateTimeOfDay(data.hour);
  if (data.season !== undefined && data.season !== currentSeason) {
    currentSeason = data.season;
    decorations.rebuild(currentDecorations, currentSeason);
    terrain.build(state.tiles, currentSeason); // terrain also has season colors
  }
});
```

**Step 4: Test**

Run: `npm run dev`
Expected: Trees have fresh green foliage in spring, deep green summer, vibrant orange/red/gold fall, and bare branches in winter. Season transitions cause smooth terrain/tree color updates.

**Step 5: Commit**

```bash
git add client/src/engine/AssetGenerator.js client/src/world/DecorationRenderer.js client/src/main.js
git commit -m "feat: add seasonal tree colors — spring green, fall orange, winter bare branches"
```

---

## Summary

| Task | What It Adds | Key Files |
|------|-------------|-----------|
| 1 | Town terrain zone with paths and plaza | TerrainGenerator, DecorationGenerator |
| 2 | 8 town buildings with unique details | AssetGenerator, GameWorld, npcs.json |
| 3 | NPC walking/idle animations | NPCRenderer |
| 4 | Floating NPC name labels | NPCRenderer |
| 5 | Shop UI with buy/sell tabs | ShopUI (new), main.js, GameWorld, game.css |
| 6 | Fishing bobber, bite timing, splash FX | FishingEffects (new), main.js, GameWorld |
| 7 | Harvest/till/plant particle effects | ParticleEffects (new), main.js |
| 8 | 24 distinct crop models | AssetGenerator |
| 9 | Day/night lighting cycle | SceneManager, main.js |
| 10 | Seasonal tree colors | AssetGenerator, DecorationRenderer, main.js |

**Total new files:** 3 (ShopUI.js, FishingEffects.js, ParticleEffects.js)
**Total modified files:** 9
**Estimated commits:** 10
