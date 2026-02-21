# Gameplay Systems Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Activate dormant game systems and add core economy progression to make OurFarm feel like a complete farming sim.

**Architecture:** Server-authoritative with Socket.io events. Each feature adds server handlers in GameWorld.js, wires client network methods (many already exist in NetworkClient.js), and adds UI/rendering. All data flows: client action → server handler → inventory/state update → broadcast → client render.

**Tech Stack:** Node.js server with better-sqlite3, Socket.io, Three.js client with Vite bundler. Shared constants in `shared/constants.js`.

**Design reference:** `docs/plans/2026-02-21-full-game-design.md`

---

## Phase A: Activate Existing Systems

These features have data structures, entities, and even network methods already defined — they just need server handlers and UI wiring.

---

### Task 1: NPC Gift System

The database has `npc_relationships.gifted_today`, NPCs have `likedGifts` arrays, and `NetworkClient.sendNPCGift(npcId, itemId)` already exists. Just needs the server handler and client UI.

**Files:**
- Modify: `server/game/GameWorld.js` — add `handleNPCGift()` method
- Modify: `server/index.js` — wire the handler to `ACTIONS.NPC_GIFT`
- Modify: `server/data/npcs.json` — add `lovedGifts` and `hatedGifts` arrays
- Modify: `client/src/ui/DialogueUI.js` — add "Give Gift" button
- Modify: `client/src/main.js` — wire gift button to network call
- Modify: `shared/constants.js` — add `GIFT_POINTS` object

**Step 1: Add gift constants to shared/constants.js**

After `QUALITY_MULTIPLIER`:
```javascript
export const GIFT_POINTS = {
  LOVED: 80,
  LIKED: 45,
  NEUTRAL: 20,
  DISLIKED: -20,
  HATED: -40,
};
```

**Step 2: Add lovedGifts and hatedGifts to npcs.json**

Each NPC gets:
```json
{
  "lovedGifts": ["cake", "strawberry"],
  "hatedGifts": ["copper_ore", "iron_ore"]
}
```

Full preferences:
- Rosie: loved=[cake, strawberry, honey], hated=[copper_ore, iron_ore, coal]
- Grim: loved=[gold_bar, diamond, ruby], hated=[parsnip, dandelion]
- Willow: loved=[pumpkin, ancient_fruit, melon], hated=[fish items]
- Old Pete: loved=[legendCarp, lobster, sturgeon], hated=[cauliflower, kale]
- Mayor Hart: loved=[starfruit, gold_bar, wine], hated=[wheat, clay]
- Dr. Fern: loved=[egg, milk, wool], hated=[copper_ore, slime]

**Step 3: Add handleNPCGift to GameWorld.js**

After `handleNPCTalk`:
```javascript
handleNPCGift(socketId, data) {
  const player = this.players.get(socketId);
  if (!player || player.currentMap !== MAP_IDS.TOWN) return;
  if (!player.hasItem(data.itemId, 1)) return;

  const townMap = this.maps.get(MAP_IDS.TOWN);
  const npc = townMap.npcs.find(n => n.id === data.npcId);
  if (!npc) return;

  const db = getDB();
  let rel = db.prepare('SELECT * FROM npc_relationships WHERE player_id = ? AND npc_id = ?')
    .get(player.id, npc.id);
  if (!rel) {
    db.prepare('INSERT INTO npc_relationships (player_id, npc_id) VALUES (?, ?)').run(player.id, npc.id);
    rel = { hearts: 0, gifted_today: 0 };
  }
  if (rel.gifted_today) {
    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'npcDialogue', npcId: npc.id, npcName: npc.name,
      text: "I already received a gift today, thank you!", hearts: rel.hearts,
    });
    return;
  }

  // Determine preference tier
  let points = GIFT_POINTS.NEUTRAL;
  let response = "Thanks.";
  if (npc.lovedGifts?.includes(data.itemId)) {
    points = GIFT_POINTS.LOVED;
    response = "This is amazing! I love it! Thank you so much!";
  } else if (npc.likedGifts?.includes(data.itemId)) {
    points = GIFT_POINTS.LIKED;
    response = "Oh, how thoughtful! I really like this!";
  } else if (npc.hatedGifts?.includes(data.itemId)) {
    points = GIFT_POINTS.HATED;
    response = "...Why would you give me this?";
  }

  // Convert points to hearts (250 pts per heart)
  const heartsGain = points / 250;
  const newHearts = Math.max(0, Math.min(10, (rel.hearts || 0) + heartsGain));

  player.removeItem(data.itemId, 1);
  db.prepare('UPDATE npc_relationships SET hearts = ?, gifted_today = 1 WHERE player_id = ? AND npc_id = ?')
    .run(newHearts, player.id, npc.id);

  this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
    type: 'npcDialogue', npcId: npc.id, npcName: npc.name,
    text: response, hearts: newHearts,
  });
  this._sendInventoryUpdate(socketId, player);
}
```

Import `GIFT_POINTS` from constants at the top of GameWorld.js.

**Step 4: Wire handler in server/index.js**

After the `NPC_TALK` handler:
```javascript
wrap(ACTIONS.NPC_GIFT, (data) => world.handleNPCGift(socket.id, data));
```

**Step 5: Add "Give Gift" button to DialogueUI.js**

In the `show()` method, after rendering dialogue text, add a gift button:
```javascript
const giftBtn = document.createElement('div');
giftBtn.className = 'dialogue-choice';
giftBtn.textContent = '🎁 Give Gift';
giftBtn.onclick = () => {
  if (this.onGiftRequest) this.onGiftRequest(npcId);
};
this._choicesEl.appendChild(giftBtn);
```

Store `npcId` on the instance when `show()` is called (add it as a parameter from the npcDialogue event).

**Step 6: Wire gift flow in main.js**

In the `npcDialogue` handler, pass `npcId` to dialogueUI. Add:
```javascript
dialogueUI.onGiftRequest = (npcId) => {
  // Show inventory picker — for now, use the active action bar item
  const activeItem = hud.getActiveItem();
  if (activeItem && activeItem.itemId) {
    network.sendNPCGift(npcId, activeItem.itemId);
    dialogueUI.hide();
  }
};
```

**Step 7: Reset gifted_today on new day**

In `_onNewDay()` in GameWorld.js, add:
```javascript
const db = getDB();
db.prepare('UPDATE npc_relationships SET talked_today = 0, gifted_today = 0').run();
```

**Verify:** Start server, go to town, talk to NPC, give gift via active item, see response dialogue and hearts change. Give second gift same day — should get "already received" message.

---

### Task 2: Animal Feeding & Product Collection

Animals have `feed()`, `collectProduct()`, and `tickDaily()` methods. Need server handlers and a way for players to interact.

**Files:**
- Modify: `server/game/GameWorld.js` — add `handleAnimalFeed()`, `handleAnimalCollect()`
- Modify: `server/index.js` — wire handlers
- Modify: `shared/constants.js` — add `ANIMAL_FEED` and `ANIMAL_COLLECT` actions
- Modify: `client/src/network/NetworkClient.js` — add send methods
- Modify: `client/src/main.js` — add click-on-animal interaction
- Modify: `client/src/entities/AnimalRenderer.js` — add click detection
- Modify: `client/src/ui/ItemIcons.js` — add `animal_feed` and `animal_collect` tool actions

**Step 1: Add action constants**

In `shared/constants.js` ACTIONS object:
```javascript
ANIMAL_FEED: 'animal:feed',
ANIMAL_COLLECT: 'animal:collect',
```

**Step 2: Add server handlers in GameWorld.js**

```javascript
handleAnimalFeed(socketId, data) {
  const player = this.players.get(socketId);
  if (!player || player.currentMap !== MAP_IDS.FARM) return;

  const farmMap = this.maps.get(MAP_IDS.FARM);
  const animal = farmMap.animals.get(data.animalId);
  if (!animal) return;

  // Check if player has hay/feed (for now, feeding is free — hay system comes later)
  animal.feed();
  this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
    type: 'animalUpdate', animal: animal.getState(),
  });
}

handleAnimalCollect(socketId, data) {
  const player = this.players.get(socketId);
  if (!player || player.currentMap !== MAP_IDS.FARM) return;

  const farmMap = this.maps.get(MAP_IDS.FARM);
  const animal = farmMap.animals.get(data.animalId);
  if (!animal || !animal.productReady) return;

  const animalData = animalsData[animal.type];
  if (!animalData) return;

  const result = animal.collectProduct();
  const quality = result.qualityBonus > 1 ? 1 : 0; // silver if happy
  player.addItem(animalData.product, 1, quality);
  player.addSkillXP(SKILLS.FARMING, 5);

  this._sendInventoryUpdate(socketId, player);
  this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
    type: 'animalUpdate', animal: animal.getState(),
  });
}
```

**Step 3: Wire in server/index.js**

```javascript
wrap(ACTIONS.ANIMAL_FEED, (data) => world.handleAnimalFeed(socket.id, data));
wrap(ACTIONS.ANIMAL_COLLECT, (data) => world.handleAnimalCollect(socket.id, data));
```

**Step 4: Add animal hourly tick to GameWorld._tick()**

After crop ticking:
```javascript
// Animal product timers (on farm map)
for (const animal of farmMap.animals.values()) {
  const animalData = animalsData[animal.type];
  if (animalData) animal.tickHour(animalData, gameHoursElapsed);
}
```

Note: `Animal.tickHour` currently takes `(animalData)` — update it to also accept `hoursElapsed` and accumulate properly. Modify `server/entities/Animal.js`:
```javascript
tickHour(animalData, hoursElapsed = 1) {
  if (!this.fedToday) return;
  this._hoursSinceProduct += hoursElapsed;
  if (this._hoursSinceProduct >= animalData.productInterval) {
    this.productReady = true;
  }
}
```

**Step 5: Add network methods in NetworkClient.js**

```javascript
sendAnimalFeed(animalId) {
  this.socket.emit(ACTIONS.ANIMAL_FEED, { animalId });
}
sendAnimalCollect(animalId) {
  this.socket.emit(ACTIONS.ANIMAL_COLLECT, { animalId });
}
```

**Step 6: Add click detection to AnimalRenderer.js**

Add a method:
```javascript
getAnimalAtPosition(worldX, worldZ) {
  const threshold = 0.8;
  for (const [id, entry] of this.animalMeshes) {
    const dx = entry.mesh.position.x - worldX;
    const dz = entry.mesh.position.z - worldZ;
    if (Math.sqrt(dx * dx + dz * dz) < threshold) return id;
  }
  return null;
}
```

**Step 7: Wire animal interaction in main.js**

In the `tileMove` handler (right-click), before NPC check:
```javascript
// Check for animal (farm map only)
const animalId = animals.getAnimalAtPosition(worldPos.x, worldPos.z);
if (animalId) {
  // If player has no tool active, feed; if product ready, collect
  network.sendAnimalCollect(animalId);
  network.sendAnimalFeed(animalId);
  return;
}
```

In the `worldUpdate` handler, add:
```javascript
case 'animalUpdate':
  animals.updateAnimal(data.animal);
  break;
```

Add `updateAnimal` to AnimalRenderer:
```javascript
updateAnimal(animalData) {
  // For now, just update stored data
  const entry = this.animalMeshes.get(animalData.id);
  if (entry) entry.data = animalData;
}
```

**Step 8: Spawn starter animals on farm**

In `_initStarterFarm()`:
```javascript
// Starter animals
const starterAnimals = [
  { type: 'chicken', x: 27, z: 35 },
  { type: 'chicken', x: 28, z: 36 },
  { type: 'cow', x: 26, z: 38 },
];
for (const a of starterAnimals) {
  const animal = new Animal(a);
  farmMap.animals.set(animal.id, animal);
}
```

**Verify:** Start server, see animals on farm. Right-click animal to feed (happiness increases). Wait for product timer, right-click to collect (item appears in inventory).

---

### Task 3: Pet Interaction System

Pets have `feed()`, `train()`, `pet()` methods. `NetworkClient.sendPetInteract(petId, action)` exists. Need server handler and click detection.

**Files:**
- Modify: `server/game/GameWorld.js` — add `handlePetInteract()`
- Modify: `server/index.js` — wire handler
- Modify: `client/src/entities/PetRenderer.js` — add click detection
- Modify: `client/src/main.js` — wire pet click

**Step 1: Add server handler in GameWorld.js**

```javascript
handlePetInteract(socketId, data) {
  const player = this.players.get(socketId);
  if (!player || player.currentMap !== MAP_IDS.FARM) return;

  const farmMap = this.maps.get(MAP_IDS.FARM);
  const pet = farmMap.pets.get(data.petId);
  if (!pet || pet.ownerId !== player.id) return;

  let message = '';
  switch (data.action) {
    case 'pet':
      pet.pet();
      message = `${pet.name || 'Pet'} wags happily! 💕`;
      break;
    case 'feed':
      pet.feed();
      message = `${pet.name || 'Pet'} eats eagerly! +Energy`;
      break;
    case 'train':
      if (pet.energy < 20) {
        message = `${pet.name || 'Pet'} is too tired to train.`;
        break;
      }
      pet.train();
      message = `${pet.name || 'Pet'} learned something! Skill +${2 + Math.floor(Math.random() * 3)}`;
      break;
    default:
      return;
  }

  this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
    type: 'petUpdate', pet: pet.getState(), message,
  });
}
```

**Step 2: Wire in server/index.js**

```javascript
wrap(ACTIONS.PET_INTERACT, (data) => world.handlePetInteract(socket.id, data));
```

**Step 3: Add click detection to PetRenderer.js**

```javascript
getPetAtPosition(worldX, worldZ) {
  const threshold = 0.6;
  for (const [id, entry] of this.petMeshes) {
    const dx = entry.mesh.position.x - worldX;
    const dz = entry.mesh.position.z - worldZ;
    if (Math.sqrt(dx * dx + dz * dz) < threshold) return id;
  }
  return null;
}
```

**Step 4: Wire pet click in main.js**

In `tileMove` handler, after animal check:
```javascript
const petId = pets.getPetAtPosition(worldPos.x, worldPos.z);
if (petId) {
  network.sendPetInteract(petId, 'pet'); // default action: pet
  return;
}
```

Add `petUpdate` handler:
```javascript
case 'petUpdate':
  // Show message as a brief notification
  console.log(data.message);
  break;
```

**Step 5: Spawn a starter pet**

In `_initStarterFarm()`:
```javascript
const starterPet = new Pet({ ownerId: null, type: 'dog', name: 'Buddy', x: 30, z: 31 });
farmMap.pets.set(starterPet.id, starterPet);
```

When a player joins, assign pet ownership if unowned:
In `handlePlayerJoin`, after creating player:
```javascript
const farmMap = this.maps.get(MAP_IDS.FARM);
for (const pet of farmMap.pets.values()) {
  if (!pet.ownerId) {
    pet.ownerId = player.id;
    break;
  }
}
```

**Verify:** Start server, see pet on farm. Right-click pet → see "wags happily" message.

---

### Task 4: Crafting System

Recipes exist in `server/data/recipes.json`. Action constants `CRAFT_START` and `CRAFT_COLLECT` exist. `NetworkClient.sendCraftStart/sendCraftCollect` exist. Need server handlers, crafting UI, and building interaction.

**Files:**
- Modify: `server/game/GameWorld.js` — add `handleCraftStart()`, `handleCraftCollect()`
- Modify: `server/index.js` — wire handlers
- Create: `client/src/ui/CraftingUI.js` — crafting panel
- Modify: `client/src/main.js` — add crafting UI, wire to buildings
- Modify: `client/styles/game.css` — crafting panel styles
- Modify: `client/src/ui/ItemIcons.js` — add processed item icons

**Step 1: Add crafting state to buildings**

In `_initStarterFarm()`, add crafting buildings to farm map:
```javascript
farmMap.buildings.set('farm_mill', {
  id: 'farm_mill', type: 'mill', tileX: 38, tileZ: 31,
  processing: null, // { recipeId, startTime, endTime }
});
farmMap.buildings.set('farm_forge', {
  id: 'farm_forge', type: 'forge', tileX: 38, tileZ: 34,
  processing: null,
});
```

The kitchen will come with house upgrade. For now, the existing town buildings (bakery=shop, smithy=shop) serve as shops, not crafting stations. Farm-side buildings do crafting.

**Step 2: Add server handlers**

```javascript
handleCraftStart(socketId, data) {
  const player = this.players.get(socketId);
  if (!player || player.currentMap !== MAP_IDS.FARM) return;

  const farmMap = this.maps.get(MAP_IDS.FARM);
  const building = farmMap.buildings.get(data.buildingId);
  if (!building) return;
  if (building.processing) {
    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'craftError', message: 'This machine is already processing something.',
    });
    return;
  }

  const recipe = recipesData[data.recipeId];
  if (!recipe || recipe.building !== building.type) return;

  // Check player has all inputs
  for (const [itemId, qty] of Object.entries(recipe.inputs)) {
    if (!player.hasItem(itemId, qty)) {
      this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
        type: 'craftError', message: `Missing ${itemId} (need ${qty}).`,
      });
      return;
    }
  }

  // Consume inputs
  for (const [itemId, qty] of Object.entries(recipe.inputs)) {
    player.removeItem(itemId, qty);
  }

  // Start processing
  const now = Date.now();
  building.processing = {
    recipeId: data.recipeId,
    startTime: now,
    endTime: now + recipe.time * 3600 * 1000, // recipe.time is in hours
  };

  this._sendInventoryUpdate(socketId, player);
  this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
    type: 'craftStarted', buildingId: building.id, recipeId: data.recipeId,
    endTime: building.processing.endTime,
  });
}

handleCraftCollect(socketId, data) {
  const player = this.players.get(socketId);
  if (!player || player.currentMap !== MAP_IDS.FARM) return;

  const farmMap = this.maps.get(MAP_IDS.FARM);
  const building = farmMap.buildings.get(data.buildingId);
  if (!building || !building.processing) return;

  if (Date.now() < building.processing.endTime) {
    const remaining = Math.ceil((building.processing.endTime - Date.now()) / 60000);
    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'craftError', message: `Still processing. ${remaining} minutes remaining.`,
    });
    return;
  }

  const recipe = recipesData[building.processing.recipeId];
  if (!recipe) return;

  player.addItem(recipe.output, recipe.count || 1);
  player.addSkillXP(SKILLS.FARMING, recipe.xp || 5);
  building.processing = null;

  this._sendInventoryUpdate(socketId, player);
  this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
    type: 'craftCollected', buildingId: building.id,
    itemId: recipe.output, quantity: recipe.count || 1,
  });
}
```

**Step 3: Wire in server/index.js**

```javascript
wrap(ACTIONS.CRAFT_START, (data) => world.handleCraftStart(socket.id, data));
wrap(ACTIONS.CRAFT_COLLECT, (data) => world.handleCraftCollect(socket.id, data));
```

**Step 4: Create CraftingUI.js**

```javascript
// client/src/ui/CraftingUI.js
import { getItemIcon } from './ItemIcons.js';

export class CraftingUI {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'crafting-panel';
    this.container.className = 'panel hidden';
    document.getElementById('ui-overlay').appendChild(this.container);
    this.visible = false;
    this.onCraftStart = null;
    this.onCraftCollect = null;
  }

  show(buildingId, buildingType, recipes, inventory, processing) {
    this.visible = true;
    this.container.classList.remove('hidden');
    this.container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'shop-header';
    header.innerHTML = `<span class="shop-title">${buildingType.toUpperCase()}</span>`;
    const closeBtn = document.createElement('span');
    closeBtn.className = 'shop-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => this.hide();
    header.appendChild(closeBtn);
    this.container.appendChild(header);

    // If currently processing, show status
    if (processing) {
      const recipe = recipes[processing.recipeId];
      const remaining = Math.max(0, Math.ceil((processing.endTime - Date.now()) / 60000));
      const statusDiv = document.createElement('div');
      statusDiv.className = 'craft-status';
      if (remaining <= 0) {
        statusDiv.innerHTML = `<div>✅ ${recipe?.name || processing.recipeId} is ready!</div>`;
        const collectBtn = document.createElement('div');
        collectBtn.className = 'dialogue-choice';
        collectBtn.textContent = '📦 Collect';
        collectBtn.onclick = () => {
          if (this.onCraftCollect) this.onCraftCollect(buildingId);
          this.hide();
        };
        statusDiv.appendChild(collectBtn);
      } else {
        statusDiv.innerHTML = `<div>⏳ Processing ${recipe?.name || processing.recipeId}... ${remaining} min remaining</div>`;
      }
      this.container.appendChild(statusDiv);
      return;
    }

    // Recipe list
    const available = Object.entries(recipes).filter(([, r]) => r.building === buildingType);
    if (available.length === 0) {
      this.container.innerHTML += '<div class="shop-empty">No recipes available for this station.</div>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'shop-items';
    for (const [recipeId, recipe] of available) {
      const item = document.createElement('div');
      item.className = 'shop-item';

      const inputsStr = Object.entries(recipe.inputs)
        .map(([id, qty]) => {
          const icon = getItemIcon(id);
          const has = inventory.find(i => i.itemId === id)?.quantity || 0;
          const color = has >= qty ? '#aaffaa' : '#ffaaaa';
          return `<span style="color:${color}">${icon?.emoji || ''} ${id} ×${qty}</span>`;
        })
        .join(' + ');

      const outputIcon = getItemIcon(recipe.output);
      item.innerHTML = `
        <div style="flex:1">
          <div>${outputIcon?.emoji || '📦'} ${recipe.name || recipe.output} ×${recipe.count || 1}</div>
          <div style="font-size:11px;color:#aaa">${inputsStr}</div>
          <div style="font-size:11px;color:#888">⏱ ${recipe.time}h</div>
        </div>
      `;

      const craftBtn = document.createElement('button');
      craftBtn.className = 'shop-buy-btn';
      craftBtn.textContent = 'Craft';
      craftBtn.onclick = () => {
        if (this.onCraftStart) this.onCraftStart(buildingId, recipeId);
        this.hide();
      };
      item.appendChild(craftBtn);
      list.appendChild(item);
    }
    this.container.appendChild(list);
  }

  hide() {
    this.visible = false;
    this.container.classList.add('hidden');
  }
}
```

**Step 5: Add crafting CSS**

In `game.css`:
```css
#crafting-panel {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(420px, 90vw);
  max-height: 70vh;
  overflow-y: auto;
  z-index: 15;
  pointer-events: auto;
}

.craft-status {
  padding: 12px;
  text-align: center;
  color: #ffcc00;
}
```

**Step 6: Wire crafting in main.js**

Import CraftingUI. Initialize after other UI:
```javascript
const craftingUI = new CraftingUI();
```

Wire callbacks:
```javascript
craftingUI.onCraftStart = (buildingId, recipeId) => network.sendCraftStart(buildingId, recipeId);
craftingUI.onCraftCollect = (buildingId) => network.sendCraftCollect(buildingId);
```

Add building click detection. In `tileAction` (left-click), after existing tool actions, add a building check:
```javascript
// Check if clicking on a crafting building
const farmMap = state.buildings || [];
// ... For now, use 'C' key to open crafting when near a building
```

Actually, simpler approach: add 'C' key shortcut to open crafting for the nearest building:
```javascript
if (key === 'c' || key === 'C') {
  // Find nearest crafting building from state
  // This requires storing buildings client-side — they're already in state.buildings
  // Open crafting UI for the nearest one
}
```

Better approach: In `tileAction`, when pickaxe is active and tile hits a building, open crafting UI:
The building interaction is complex — for simplicity, add the crafting buildings to the building list and handle click-on-building in main.js similarly to how NPCs work in `tileMove`.

In the `worldUpdate` handler, add cases:
```javascript
case 'craftStarted':
  console.log(`Crafting started: ${data.recipeId}`);
  break;
case 'craftCollected':
  console.log(`Collected: ${data.itemId} ×${data.quantity}`);
  break;
case 'craftError':
  console.log(data.message);
  break;
```

**Step 7: Add new item icons to ItemIcons.js**

Add entries for processed items: flour, bread, cake, cheese_wheel, cloth, mayonnaise, wine, juice, pickles, jelly, oil.

**Verify:** Build succeeds. Start server, see mill/forge on farm. Press 'C' near building → crafting UI opens. Craft flour from wheat → wait → collect. Check inventory for flour.

---

## Phase B: Core Economy Progression

---

### Task 5: Tool Upgrade System

Allow players to upgrade tools at the Blacksmith NPC. Higher tiers reduce energy cost and increase efficiency.

**Files:**
- Modify: `server/entities/Player.js` — add `toolTiers` field
- Modify: `server/game/GameWorld.js` — add `handleToolUpgrade()`, modify energy costs per tier
- Modify: `shared/constants.js` — add `TOOL_TIERS` data
- Modify: `server/index.js` — wire handler
- Modify: `client/src/network/NetworkClient.js` — add `sendToolUpgrade()`
- Modify: `client/src/ui/DialogueUI.js` — show upgrade options for Blacksmith

**Step 1: Add tool tier constants**

In `shared/constants.js`:
```javascript
export const TOOL_TIERS = {
  BASIC: 0,
  COPPER: 1,
  IRON: 2,
  GOLD: 3,
  IRIDIUM: 4,
};

export const TOOL_UPGRADE_COST = {
  1: { bars: 'copper_bar', barQty: 5, coins: 2000 },
  2: { bars: 'iron_bar', barQty: 5, coins: 5000 },
  3: { bars: 'gold_bar', barQty: 5, coins: 10000 },
  4: { bars: 'iridium_bar', barQty: 5, coins: 25000 },
};

export const TOOL_ENERGY_COST = {
  hoe:          [2, 2, 1, 1, 0],
  watering_can: [1, 1, 1, 0, 0],
  pickaxe:      [3, 3, 2, 2, 1],
  axe:          [2, 2, 1, 1, 0],
};
```

**Step 2: Add toolTiers to Player.js**

In constructor:
```javascript
this.toolTiers = data.toolTiers || {
  hoe: 0, watering_can: 0, pickaxe: 0, axe: 0, fishing_rod: 0,
};
```

In `getState()`:
```javascript
toolTiers: this.toolTiers,
```

**Step 3: Add handleToolUpgrade in GameWorld.js**

```javascript
handleToolUpgrade(socketId, data) {
  const player = this.players.get(socketId);
  if (!player || player.currentMap !== MAP_IDS.TOWN) return;

  const tool = data.tool; // 'hoe', 'watering_can', etc.
  if (!player.toolTiers || player.toolTiers[tool] === undefined) return;

  const currentTier = player.toolTiers[tool];
  const nextTier = currentTier + 1;
  if (nextTier > TOOL_TIERS.IRIDIUM) return;

  const cost = TOOL_UPGRADE_COST[nextTier];
  if (!cost) return;
  if (player.coins < cost.coins) return;
  if (!player.hasItem(cost.bars, cost.barQty)) return;

  player.coins -= cost.coins;
  player.removeItem(cost.bars, cost.barQty);
  player.toolTiers[tool] = nextTier;

  this._sendInventoryUpdate(socketId, player);
  this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
    type: 'toolUpgraded', tool, newTier: nextTier,
  });
}
```

Import `TOOL_TIERS`, `TOOL_UPGRADE_COST`, `TOOL_ENERGY_COST` from constants.

**Step 4: Use tier-based energy costs**

Modify `handleTill`:
```javascript
const energyCost = TOOL_ENERGY_COST.hoe[player.toolTiers?.hoe || 0] || 2;
if (!player.useEnergy(energyCost)) return;
```

Similarly for `handleWater` (watering_can costs), `handleHarvest` (pickaxe costs).

**Step 5: Add action and wire**

Add to `ACTIONS`:
```javascript
TOOL_UPGRADE: 'tool:upgrade',
```

Wire in `server/index.js`:
```javascript
wrap(ACTIONS.TOOL_UPGRADE, (data) => world.handleToolUpgrade(socket.id, data));
```

Add to NetworkClient:
```javascript
sendToolUpgrade(tool) {
  this.socket.emit(ACTIONS.TOOL_UPGRADE, { tool });
}
```

**Step 6: Blacksmith upgrade UI**

When talking to Grim (Blacksmith), include upgrade options in the NPC dialogue. Modify `handleNPCTalk` to include upgrade data for Blacksmith:
```javascript
if (npc.role === 'Blacksmith') {
  const upgradeOptions = {};
  for (const [tool, tier] of Object.entries(player.toolTiers)) {
    if (tier < 4) {
      const cost = TOOL_UPGRADE_COST[tier + 1];
      upgradeOptions[tool] = { currentTier: tier, nextTier: tier + 1, ...cost };
    }
  }
  // Include in the dialogue event
  data.upgradeOptions = upgradeOptions;
}
```

In client main.js, when npcDialogue has upgradeOptions, show upgrade buttons in the dialogue.

**Verify:** Start server, go to town, talk to Grim. See upgrade options with costs. Buy copper hoe upgrade (need 5 copper bars + 2000g). Tool tier updates, energy cost for tilling decreases.

---

### Task 6: Sprinkler System

Craftable sprinklers that auto-water adjacent tiles at dawn.

**Files:**
- Modify: `shared/constants.js` — sprinkler data
- Modify: `shared/ItemRegistry.js` — add sprinkler items
- Create: `server/entities/Sprinkler.js` — sprinkler entity
- Modify: `server/game/GameWorld.js` — add placement handler, dawn watering
- Modify: `server/game/MapInstance.js` — add sprinklers collection
- Modify: `client/src/network/NetworkClient.js` — add `sendPlaceSprinkler()`
- Create: `client/src/world/SprinklerRenderer.js` — render sprinklers
- Modify: `client/src/main.js` — wire sprinkler placement and rendering
- Modify: `client/src/ui/ItemIcons.js` — add sprinkler icons

**Step 1: Add sprinkler items and constants**

In `shared/constants.js`:
```javascript
export const SPRINKLER_DATA = {
  sprinkler_basic: { tier: 1, range: 'adjacent', tiles: [[0,-1],[0,1],[-1,0],[1,0]] },
  sprinkler_quality: { tier: 2, range: '3x3', tiles: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] },
  sprinkler_iridium: { tier: 3, range: '5x5', tiles: [] }, // filled programmatically
};
// Fill iridium 5x5 minus corners
for (let dx = -2; dx <= 2; dx++) {
  for (let dz = -2; dz <= 2; dz++) {
    if (dx === 0 && dz === 0) continue;
    if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue; // skip corners
    SPRINKLER_DATA.sprinkler_iridium.tiles.push([dx, dz]);
  }
}
```

In `shared/ItemRegistry.js` ITEMS:
```javascript
sprinkler_basic: { name: 'Sprinkler', category: 'crafted' },
sprinkler_quality: { name: 'Quality Sprinkler', category: 'crafted' },
sprinkler_iridium: { name: 'Iridium Sprinkler', category: 'crafted' },
```

**Step 2: Add sprinkler crafting recipes**

In `server/data/recipes.json`, add:
```json
{
  "sprinkler_basic": {
    "name": "Basic Sprinkler",
    "building": "forge",
    "inputs": {"copper_bar": 1, "iron_bar": 1},
    "output": "sprinkler_basic",
    "count": 1,
    "time": 0.5,
    "xp": 5
  },
  "sprinkler_quality": {
    "name": "Quality Sprinkler",
    "building": "forge",
    "inputs": {"iron_bar": 1, "gold_bar": 1},
    "output": "sprinkler_quality",
    "count": 1,
    "time": 1,
    "xp": 10
  }
}
```

**Step 3: Create Sprinkler entity**

`server/entities/Sprinkler.js`:
```javascript
import { v4 as uuid } from 'uuid';
import { SPRINKLER_DATA } from '../../shared/constants.js';

export class Sprinkler {
  constructor({ id, type, tileX, tileZ }) {
    this.id = id || uuid();
    this.type = type;
    this.tileX = tileX;
    this.tileZ = tileZ;
  }

  getWateredTiles() {
    const data = SPRINKLER_DATA[this.type];
    if (!data) return [];
    return data.tiles.map(([dx, dz]) => ({ x: this.tileX + dx, z: this.tileZ + dz }));
  }

  getState() {
    return { id: this.id, type: this.type, tileX: this.tileX, tileZ: this.tileZ };
  }
}
```

**Step 4: Add sprinklers to MapInstance**

In `MapInstance` constructor:
```javascript
this.sprinklers = options.sprinklers || new Map();
```

In `getFullState()`, add:
```javascript
sprinklers: Array.from(this.sprinklers.values()).map(s => s.getState()),
```

**Step 5: Add placement handler and dawn watering**

In GameWorld.js:
```javascript
handlePlaceSprinkler(socketId, data) {
  const player = this.players.get(socketId);
  if (!player || player.currentMap !== MAP_IDS.FARM) return;
  if (!player.hasItem(data.sprinklerType, 1)) return;

  const farmMap = this.maps.get(MAP_IDS.FARM);
  // Check tile is tilled or dirt
  const idx = tileIndex(data.x, data.z);
  if (idx < 0) return;

  // Don't place on existing sprinkler
  for (const s of farmMap.sprinklers.values()) {
    if (s.tileX === data.x && s.tileZ === data.z) return;
  }

  player.removeItem(data.sprinklerType, 1);
  const sprinkler = new Sprinkler({ type: data.sprinklerType, tileX: data.x, tileZ: data.z });
  farmMap.sprinklers.set(sprinkler.id, sprinkler);

  this._sendInventoryUpdate(socketId, player);
  this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
    type: 'sprinklerPlaced', sprinkler: sprinkler.getState(),
  });
}
```

In `_onNewDay()`, add sprinkler watering:
```javascript
// Sprinklers auto-water crops at dawn
for (const sprinkler of farmMap.sprinklers.values()) {
  const wateredTiles = sprinkler.getWateredTiles();
  for (const t of wateredTiles) {
    for (const crop of farmMap.crops.values()) {
      if (crop.tileX === t.x && crop.tileZ === t.z) {
        crop.watered = true;
      }
    }
  }
}
```

**Step 6: Add action constant and wire**

```javascript
PLACE_SPRINKLER: 'farm:placeSprinkler',
```

Wire in index.js and add `sendPlaceSprinkler(type, x, z)` to NetworkClient.

**Step 7: Create SprinklerRenderer**

Simple renderer following CropRenderer pattern — small metallic cylinder at tile center. Follow the same Map<id, {mesh, data}> pattern.

**Step 8: Wire in main.js**

Add `sprinkler_basic`, `sprinkler_quality` to ItemIcons with tool action `sprinkler`. In tileAction handler, when active item is a sprinkler, call `sendPlaceSprinkler`.

**Verify:** Craft sprinkler at forge, select it in action bar, left-click to place on tilled soil. Next morning, crops in range are auto-watered.

---

### Task 7: Fertilizer System

Items that improve crop quality when applied to tilled soil.

**Files:**
- Modify: `shared/constants.js` — fertilizer data
- Modify: `shared/ItemRegistry.js` — add fertilizer items
- Modify: `server/entities/Crop.js` — add `fertilizer` field
- Modify: `server/game/GameWorld.js` — add `handleApplyFertilizer()`, modify quality roll
- Modify: `client/src/ui/ItemIcons.js` — add fertilizer icons

**Step 1: Add fertilizer constants**

In `shared/constants.js`:
```javascript
export const FERTILIZER_DATA = {
  fertilizer_basic: { qualityBonus: 0.10, speedBonus: 0 },
  fertilizer_quality: { qualityBonus: 0.25, speedBonus: 0 },
  speed_gro: { qualityBonus: 0, speedBonus: 0.10 },
  deluxe_speed_gro: { qualityBonus: 0, speedBonus: 0.25 },
};
```

**Step 2: Add to ItemRegistry**

```javascript
fertilizer_basic: { name: 'Basic Fertilizer', category: 'fertilizer' },
fertilizer_quality: { name: 'Quality Fertilizer', category: 'fertilizer' },
speed_gro: { name: 'Speed-Gro', category: 'fertilizer' },
deluxe_speed_gro: { name: 'Deluxe Speed-Gro', category: 'fertilizer' },
```

**Step 3: Add fertilizer field to Crop entity**

In `Crop` constructor:
```javascript
this.fertilizer = data.fertilizer || null;
```

In `getState()`:
```javascript
fertilizer: this.fertilizer,
```

Modify `tick()` to apply speed bonus:
```javascript
let speedMult = 1;
if (this.fertilizer) {
  const fData = FERTILIZER_DATA[this.fertilizer];
  if (fData) speedMult += fData.speedBonus;
}
rate *= speedMult;
```

Import FERTILIZER_DATA from constants.

**Step 4: Add handler and modify quality roll**

```javascript
handleApplyFertilizer(socketId, data) {
  const player = this.players.get(socketId);
  if (!player || player.currentMap !== MAP_IDS.FARM) return;
  if (!player.hasItem(data.fertilizerType, 1)) return;

  const farmMap = this.maps.get(MAP_IDS.FARM);
  // Find crop at tile, or allow pre-planting fertilizer
  for (const crop of farmMap.crops.values()) {
    if (crop.tileX === data.x && crop.tileZ === data.z) {
      if (crop.fertilizer) return; // already fertilized
      crop.fertilizer = data.fertilizerType;
      player.removeItem(data.fertilizerType, 1);
      this._sendInventoryUpdate(socketId, player);
      this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
        type: 'cropUpdate', crop: crop.getState(),
      });
      return;
    }
  }
}
```

Modify `_rollCropQuality` to accept fertilizer:
```javascript
_rollCropQuality(farmingLevel, fertilizer = null) {
  const roll = Math.random();
  let goldChance = farmingLevel * 0.015;
  let silverChance = farmingLevel * 0.03;

  if (fertilizer) {
    const fData = FERTILIZER_DATA[fertilizer];
    if (fData) {
      goldChance += fData.qualityBonus * 0.5;
      silverChance += fData.qualityBonus;
    }
  }

  if (roll < goldChance) return 2;
  if (roll < goldChance + silverChance) return 1;
  return 0;
}
```

Update the `handleHarvest` call to pass fertilizer:
```javascript
const quality = this._rollCropQuality(player.getSkillLevel(SKILLS.FARMING), crop.fertilizer);
```

**Step 5: Add action constant, wire handler, add network method**

Add `APPLY_FERTILIZER: 'farm:fertilize'` to ACTIONS. Wire in index.js. Add `sendApplyFertilizer(type, x, z)` to NetworkClient.

**Step 6: Wire in main.js**

Add fertilizer items to ItemIcons with tool action `fertilizer`. In tileAction handler, when active item is fertilizer, call `sendApplyFertilizer`.

**Step 7: Add fertilizer crafting recipes**

In recipes.json:
```json
{
  "fertilizer_basic": {
    "name": "Basic Fertilizer",
    "building": "mill",
    "inputs": {"wheat": 2},
    "output": "fertilizer_basic",
    "count": 2,
    "time": 0.5,
    "xp": 3
  }
}
```

**Verify:** Craft fertilizer, apply to crop, harvest — quality should be noticeably better than unfertilized.

---

### Task 8: Processing Machines (Keg, Preserves Jar, Cheese Press)

Placeable machines on the farm that convert raw goods into artisan products over time. These are the primary late-game economy driver.

**Files:**
- Create: `server/entities/Machine.js` — generic processing machine entity
- Modify: `server/game/GameWorld.js` — add machine placement, processing, collection
- Modify: `server/game/MapInstance.js` — add machines collection
- Modify: `shared/constants.js` — machine data
- Modify: `shared/ItemRegistry.js` — add artisan goods and machine items
- Create: `server/data/machines.json` — machine definitions
- Create: `client/src/world/MachineRenderer.js` — render machines
- Modify: `client/src/main.js` — wire machine interaction

**Step 1: Create machines.json**

```json
{
  "keg": {
    "name": "Keg",
    "recipes": {
      "fruit_wine": { "inputCategory": "crop", "inputSeasons": [0,1,2], "output": "wine", "timeHours": 168, "valueMultiplier": 3.0 },
      "vegetable_juice": { "inputCategory": "crop", "output": "juice", "timeHours": 96, "valueMultiplier": 2.25 }
    }
  },
  "preserves_jar": {
    "name": "Preserves Jar",
    "recipes": {
      "any_crop": { "inputCategory": "crop", "output": "preserves", "timeHours": 72, "valueFormula": "2x+50" }
    }
  },
  "cheese_press": {
    "name": "Cheese Press",
    "recipes": {
      "milk_cheese": { "input": "milk", "output": "cheese", "timeHours": 3.3, "outputValue": 200 }
    }
  },
  "mayonnaise_machine": {
    "name": "Mayonnaise Machine",
    "recipes": {
      "egg_mayo": { "input": "egg", "output": "mayonnaise", "timeHours": 3, "outputValue": 190 }
    }
  }
}
```

**Step 2: Create Machine entity**

```javascript
// server/entities/Machine.js
import { v4 as uuid } from 'uuid';

export class Machine {
  constructor({ id, type, tileX, tileZ, processing }) {
    this.id = id || uuid();
    this.type = type; // 'keg', 'preserves_jar', etc.
    this.tileX = tileX;
    this.tileZ = tileZ;
    this.processing = processing || null; // { inputItem, outputItem, outputValue, startTime, endTime }
  }

  startProcessing(inputItem, outputItem, outputValue, durationMs) {
    const now = Date.now();
    this.processing = {
      inputItem,
      outputItem,
      outputValue,
      startTime: now,
      endTime: now + durationMs,
    };
  }

  isReady() {
    return this.processing && Date.now() >= this.processing.endTime;
  }

  collect() {
    if (!this.isReady()) return null;
    const result = { itemId: this.processing.outputItem, value: this.processing.outputValue };
    this.processing = null;
    return result;
  }

  getState() {
    return {
      id: this.id, type: this.type, tileX: this.tileX, tileZ: this.tileZ,
      processing: this.processing ? {
        outputItem: this.processing.outputItem,
        endTime: this.processing.endTime,
        ready: this.isReady(),
      } : null,
    };
  }
}
```

**Step 3: Add machines to MapInstance**

In constructor: `this.machines = options.machines || new Map();`
In getFullState: `machines: Array.from(this.machines.values()).map(m => m.getState()),`

**Step 4: Add server handlers**

```javascript
handlePlaceMachine(socketId, data) {
  const player = this.players.get(socketId);
  if (!player || player.currentMap !== MAP_IDS.FARM) return;
  if (!player.hasItem(data.machineType, 1)) return;

  const farmMap = this.maps.get(MAP_IDS.FARM);
  player.removeItem(data.machineType, 1);
  const machine = new Machine({ type: data.machineType, tileX: data.x, tileZ: data.z });
  farmMap.machines.set(machine.id, machine);

  this._sendInventoryUpdate(socketId, player);
  this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
    type: 'machinePlaced', machine: machine.getState(),
  });
}

handleMachineInput(socketId, data) {
  const player = this.players.get(socketId);
  if (!player || player.currentMap !== MAP_IDS.FARM) return;

  const farmMap = this.maps.get(MAP_IDS.FARM);
  const machine = farmMap.machines.get(data.machineId);
  if (!machine || machine.processing) return;
  if (!player.hasItem(data.itemId, 1)) return;

  // Determine output based on machine type and input
  const machineData = machinesData[machine.type];
  if (!machineData) return;

  let outputItem, outputValue, timeHours;

  // Simple input matching
  for (const recipe of Object.values(machineData.recipes)) {
    if (recipe.input && recipe.input === data.itemId) {
      outputItem = recipe.output;
      outputValue = recipe.outputValue;
      timeHours = recipe.timeHours;
      break;
    }
    if (recipe.inputCategory === 'crop') {
      const cropData = cropsData[data.itemId];
      if (cropData) {
        outputItem = recipe.output;
        outputValue = Math.floor(cropData.sellPrice * (recipe.valueMultiplier || 2));
        timeHours = recipe.timeHours;
        break;
      }
    }
  }

  if (!outputItem) return;

  player.removeItem(data.itemId, 1);
  machine.startProcessing(data.itemId, outputItem, outputValue, timeHours * 3600 * 1000);

  this._sendInventoryUpdate(socketId, player);
  this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
    type: 'machineUpdate', machine: machine.getState(),
  });
}

handleMachineCollect(socketId, data) {
  const player = this.players.get(socketId);
  if (!player || player.currentMap !== MAP_IDS.FARM) return;

  const farmMap = this.maps.get(MAP_IDS.FARM);
  const machine = farmMap.machines.get(data.machineId);
  if (!machine) return;

  const result = machine.collect();
  if (!result) return;

  player.addItem(result.itemId, 1);
  player.addSkillXP(SKILLS.FARMING, 10);

  this._sendInventoryUpdate(socketId, player);
  this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
    type: 'machineUpdate', machine: machine.getState(),
  });
}
```

**Step 5: Add action constants, wire everything**

```javascript
PLACE_MACHINE: 'machine:place',
MACHINE_INPUT: 'machine:input',
MACHINE_COLLECT: 'machine:collect',
```

Wire in index.js. Add send methods to NetworkClient.

**Step 6: Add artisan goods to ItemRegistry**

```javascript
wine: { name: 'Wine', category: 'artisan' },
juice: { name: 'Juice', category: 'artisan' },
preserves: { name: 'Preserves', category: 'artisan' },
mayonnaise: { name: 'Mayonnaise', category: 'artisan' },
keg: { name: 'Keg', category: 'machine' },
preserves_jar: { name: 'Preserves Jar', category: 'machine' },
cheese_press: { name: 'Cheese Press', category: 'machine' },
mayonnaise_machine: { name: 'Mayonnaise Machine', category: 'machine' },
```

**Step 7: Add machine crafting recipes to recipes.json**

```json
{
  "keg": { "name": "Keg", "building": "forge", "inputs": {"copper_bar": 1, "iron_bar": 1, "wheat": 5}, "output": "keg", "count": 1, "time": 2, "xp": 15 },
  "preserves_jar": { "name": "Preserves Jar", "building": "forge", "inputs": {"copper_bar": 1, "iron_bar": 1}, "output": "preserves_jar", "count": 1, "time": 1, "xp": 10 },
  "cheese_press": { "name": "Cheese Press", "building": "forge", "inputs": {"copper_bar": 2, "iron_bar": 1}, "output": "cheese_press", "count": 1, "time": 1.5, "xp": 12 },
  "mayonnaise_machine": { "name": "Mayonnaise Machine", "building": "forge", "inputs": {"copper_bar": 1, "iron_bar": 1}, "output": "mayonnaise_machine", "count": 1, "time": 1, "xp": 10 }
}
```

**Step 8: Create MachineRenderer**

Follow CropRenderer/SprinklerRenderer pattern. Machines are simple geometric shapes:
- Keg: brown cylinder (barrel)
- Preserves Jar: glass-colored cylinder (shorter, wider)
- Cheese Press: box with handle
- Mayonnaise Machine: box with cone on top

Use AssetGenerator for mesh creation. Show visual indicator (glow/particle) when processing is complete.

**Step 9: Wire machine interaction in main.js**

Click on machine → if empty, show input dialog (inventory picker). If processing, show status. If ready, collect.

**Verify:** Craft a keg at the forge. Place it on farm. Put in a crop. Wait (or adjust time for testing). Collect artisan good. Sell for 3x value.

---

## Phase C: New Game Systems

---

### Task 9: Foraging System

Spawn seasonal wild items on grass tiles each day. Players walk over them to collect.

**Files:**
- Create: `server/game/ForagingSystem.js` — daily spawner
- Modify: `server/game/GameWorld.js` — integrate foraging
- Modify: `shared/constants.js` — foraging item data
- Modify: `shared/ItemRegistry.js` — add foraged items
- Modify: `client/src/world/DecorationRenderer.js` or create `ForageRenderer.js` — render forage items
- Modify: `client/src/main.js` — wire forage collection

**Step 1: Define seasonal forageables**

In `shared/constants.js`:
```javascript
export const FORAGE_ITEMS = {
  0: ['daffodil', 'leek', 'dandelion', 'spring_onion'],  // Spring
  1: ['grape', 'spice_berry', 'sweet_pea', 'fiddlehead_fern'],  // Summer
  2: ['wild_plum', 'hazelnut', 'blackberry', 'chanterelle'],  // Fall
  3: ['crystal_fruit', 'crocus', 'snow_yam', 'winter_root'],  // Winter
};
```

**Step 2: Add forage items to ItemRegistry**

```javascript
daffodil: { name: 'Daffodil', category: 'forage', value: 30 },
leek: { name: 'Leek', category: 'forage', value: 60 },
dandelion: { name: 'Dandelion', category: 'forage', value: 40 },
spring_onion: { name: 'Spring Onion', category: 'forage', value: 8 },
// ... (all 16 items)
```

**Step 3: Create ForagingSystem**

```javascript
// server/game/ForagingSystem.js
import { FORAGE_ITEMS } from '../../shared/constants.js';
import { v4 as uuid } from 'uuid';

export class ForagingSystem {
  constructor() {
    this.spawns = new Map(); // id -> { id, itemId, tileX, tileZ }
  }

  spawnDaily(tiles, season, count = 6) {
    this.spawns.clear();
    const grassTiles = tiles.filter(t => t.type === 0); // GRASS
    const items = FORAGE_ITEMS[season] || [];
    if (items.length === 0 || grassTiles.length === 0) return;

    for (let i = 0; i < count; i++) {
      const tile = grassTiles[Math.floor(Math.random() * grassTiles.length)];
      const itemId = items[Math.floor(Math.random() * items.length)];
      const id = uuid();
      this.spawns.set(id, { id, itemId, tileX: tile.x, tileZ: tile.z });
    }
  }

  collectAt(tileX, tileZ) {
    for (const [id, spawn] of this.spawns) {
      if (spawn.tileX === tileX && spawn.tileZ === tileZ) {
        this.spawns.delete(id);
        return spawn;
      }
    }
    return null;
  }

  getState() {
    return Array.from(this.spawns.values());
  }
}
```

**Step 4: Integrate in GameWorld**

Add `this.foragingSystem = new ForagingSystem()` in constructor.

In `_onNewDay()`:
```javascript
this.foragingSystem.spawnDaily(farmMap.tiles, this.time.season);
// Also spawn on town map
const townForaging = new ForagingSystem();
townForaging.spawnDaily(townMap.tiles, this.time.season, 4);
```

In `_getFullState()`, include forage spawns:
```javascript
forageItems: this.foragingSystem.getState(),
```

Add collection handler:
```javascript
handleForageCollect(socketId, data) {
  const player = this.players.get(socketId);
  if (!player) return;

  const spawn = this.foragingSystem.collectAt(data.x, data.z);
  if (!spawn) return;

  const quality = this._rollForageQuality(player.getSkillLevel(SKILLS.FORAGING));
  player.addItem(spawn.itemId, 1, quality);
  player.addSkillXP(SKILLS.FORAGING, 7);

  this._sendInventoryUpdate(socketId, player);
  this._broadcastToMap(player.currentMap, ACTIONS.WORLD_UPDATE, {
    type: 'forageCollected', spawnId: spawn.id,
  });
}

_rollForageQuality(foragingLevel) {
  const roll = Math.random();
  if (roll < foragingLevel * 0.01) return 2; // gold
  if (roll < foragingLevel * 0.03) return 1; // silver
  return 0;
}
```

**Step 5: Add action constant, wire**

`FORAGE_COLLECT: 'forage:collect'`. Wire in index.js.

**Step 6: Render forage items on client**

Create `ForageRenderer.js` — small colored sphere (mushroom/plant) at each spawn tile. When player moves near (or clicks), send collect action. On `forageCollected`, remove mesh.

**Step 7: Wire in main.js**

In `tileMove` handler, auto-collect when player walks over a forage tile:
```javascript
// After move, check for forage at destination
network.sendForageCollect(tile.x, tile.z); // server will ignore if nothing there
```

**Verify:** New day spawns 6 forage items on grass. Walk to them, items collected automatically. Check inventory for seasonal wild items. Foraging skill gains XP.

---

### Task 10: Skill Professions

At skill levels 5 and 10, players choose between two specializations that provide passive bonuses.

**Files:**
- Modify: `shared/constants.js` — profession definitions
- Modify: `server/entities/Player.js` — add `professions` field, apply bonuses
- Modify: `server/game/GameWorld.js` — add `handleProfessionChoice()`, emit choice events
- Modify: `client/src/network/NetworkClient.js` — add `sendProfessionChoice()`
- Create: `client/src/ui/ProfessionUI.js` — choice modal
- Modify: `client/src/main.js` — wire profession choice

**Step 1: Define professions in constants.js**

```javascript
export const PROFESSIONS = {
  farming: {
    5: [
      { id: 'rancher', name: 'Rancher', description: '+20% animal product value', bonus: { animalProductValue: 0.20 } },
      { id: 'tiller', name: 'Tiller', description: '+10% crop sell value', bonus: { cropSellValue: 0.10 } },
    ],
    10: {
      rancher: [
        { id: 'coopmaster', name: 'Coopmaster', description: 'Incubation time halved', bonus: { incubationSpeed: 0.5 } },
        { id: 'shepherd', name: 'Shepherd', description: 'Animals befriend faster', bonus: { animalFriendship: 0.5 } },
      ],
      tiller: [
        { id: 'artisan', name: 'Artisan', description: '+40% artisan goods value', bonus: { artisanValue: 0.40 } },
        { id: 'agriculturist', name: 'Agriculturist', description: '+10% crop growth speed', bonus: { cropGrowth: 0.10 } },
      ],
    },
  },
  fishing: {
    5: [
      { id: 'fisher', name: 'Fisher', description: '+25% fish sell value', bonus: { fishSellValue: 0.25 } },
      { id: 'trapper', name: 'Trapper', description: 'Crab pots no bait needed', bonus: { noBait: true } },
    ],
    10: {
      fisher: [
        { id: 'angler', name: 'Angler', description: '+50% fish sell value', bonus: { fishSellValue: 0.50 } },
        { id: 'pirate', name: 'Pirate', description: 'Double treasure chance', bonus: { treasureChance: 2 } },
      ],
      trapper: [
        { id: 'mariner', name: 'Mariner', description: 'No junk in crab pots', bonus: { noJunk: true } },
        { id: 'luremaster', name: 'Luremaster', description: 'No bait needed for fishing', bonus: { noBaitFishing: true } },
      ],
    },
  },
  mining: {
    5: [
      { id: 'miner', name: 'Miner', description: '+1 ore per node', bonus: { oreBonus: 1 } },
      { id: 'geologist', name: 'Geologist', description: '+50% gem chance', bonus: { gemChance: 0.5 } },
    ],
    10: {
      miner: [
        { id: 'blacksmith_prof', name: 'Blacksmith', description: '+50% bar sell value', bonus: { barSellValue: 0.5 } },
        { id: 'prospector', name: 'Prospector', description: 'Double coal finds', bonus: { coalDouble: true } },
      ],
      geologist: [
        { id: 'excavator', name: 'Excavator', description: 'Double geode finds', bonus: { geodeDouble: true } },
        { id: 'gemologist', name: 'Gemologist', description: '+30% gem sell value', bonus: { gemSellValue: 0.3 } },
      ],
    },
  },
  foraging: {
    5: [
      { id: 'forester', name: 'Forester', description: '+25% wood from trees', bonus: { woodBonus: 0.25 } },
      { id: 'gatherer', name: 'Gatherer', description: '20% chance double forage', bonus: { doubleForage: 0.2 } },
    ],
    10: {
      forester: [
        { id: 'lumberjack', name: 'Lumberjack', description: 'Hardwood from any tree', bonus: { hardwoodAll: true } },
        { id: 'tapper_prof', name: 'Tapper', description: 'Tree syrup 2x faster', bonus: { tapperSpeed: 2 } },
      ],
      gatherer: [
        { id: 'botanist', name: 'Botanist', description: 'Forage always best quality', bonus: { forageQuality: 'gold' } },
        { id: 'tracker', name: 'Tracker', description: 'Forage locations shown on map', bonus: { forageTracker: true } },
      ],
    },
  },
  combat: {
    5: [
      { id: 'fighter', name: 'Fighter', description: '+15% attack damage', bonus: { attackDamage: 0.15 } },
      { id: 'scout', name: 'Scout', description: '+50% crit chance', bonus: { critChance: 0.5 } },
    ],
    10: {
      fighter: [
        { id: 'brute', name: 'Brute', description: '+15% more attack damage', bonus: { attackDamage: 0.15 } },
        { id: 'defender', name: 'Defender', description: '+25 max HP', bonus: { maxHP: 25 } },
      ],
      scout: [
        { id: 'acrobat', name: 'Acrobat', description: 'Cooldown halved', bonus: { cooldownReduction: 0.5 } },
        { id: 'desperado', name: 'Desperado', description: 'Crit damage doubled', bonus: { critDamage: 2 } },
      ],
    },
  },
};
```

**Step 2: Add professions to Player.js**

```javascript
this.professions = data.professions || {}; // { farming: ['tiller', 'artisan'], fishing: ['fisher'] }
```

Add method:
```javascript
hasProfession(profId) {
  for (const profs of Object.values(this.professions)) {
    if (profs.includes(profId)) return true;
  }
  return false;
}

getProfessionBonus(bonusKey) {
  let total = 0;
  for (const profs of Object.values(this.professions)) {
    for (const profId of profs) {
      // Look up bonus from PROFESSIONS data
      // ... (iterate to find matching bonus)
    }
  }
  return total;
}
```

Include professions in `getState()`.

**Step 3: Emit profession choice on level up**

In `Player.addSkillXP()`, after leveling up, check if level is 5 or 10:
```javascript
if (newLevel === 5 || newLevel === 10) {
  this._pendingProfession = { skill: skillName, level: newLevel };
}
```

In GameWorld, after `addSkillXP` calls, check for pending:
```javascript
if (player._pendingProfession) {
  const { skill, level } = player._pendingProfession;
  this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
    type: 'professionChoice', skill, level,
    options: this._getProfessionOptions(player, skill, level),
  });
  player._pendingProfession = null;
}
```

**Step 4: Add handler for choice**

```javascript
handleProfessionChoice(socketId, data) {
  const player = this.players.get(socketId);
  if (!player) return;

  const { skill, professionId } = data;
  if (!player.professions[skill]) player.professions[skill] = [];
  player.professions[skill].push(professionId);

  this._sendInventoryUpdate(socketId, player);
  this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
    type: 'professionChosen', skill, professionId,
  });
}
```

**Step 5: Apply bonuses**

In `handleShopSell` and `_processShippingBins`, check for `tiller` profession:
```javascript
if (player.hasProfession('tiller')) {
  price = Math.floor(price * 1.1);
}
```

Similarly apply other profession bonuses to relevant systems.

**Step 6: Create ProfessionUI**

Simple modal with two cards showing profession name, description, and icon. Click to choose.

**Step 7: Wire in main.js**

On `professionChoice` event, show ProfessionUI. On selection, send choice to server.

**Step 8: Persist professions to database**

Add `professions` TEXT column to players table (JSON string). Load/save alongside skills.

**Verify:** Level farming to 5 (farm lots of crops). Modal appears with Rancher/Tiller choice. Choose Tiller. Sell crops — verify 10% bonus applied. Level to 10 — choose Artisan. Artisan goods sell for 40% more.

---

## Verification Checklist

After all 10 tasks:

1. **NPC Gifts:** Talk to NPC → Gift button → give item → see reaction + hearts change
2. **Animals:** Feed chicken → collect egg next day → egg in inventory
3. **Pets:** Click pet → "wags happily" → pet stats visible
4. **Crafting:** Open crafting at mill/forge → craft flour → collect → inventory shows flour
5. **Tool Upgrades:** Talk to Blacksmith → upgrade hoe → tilling costs less energy
6. **Sprinklers:** Craft sprinkler → place on farm → crops auto-water at dawn
7. **Fertilizer:** Apply to crop → harvest → higher quality
8. **Processing Machines:** Place keg → insert crop → wait → collect wine (3x value)
9. **Foraging:** New day → see wild items on grass → walk over → collect → foraging XP
10. **Skill Professions:** Level 5 → profession choice modal → choose → bonus applies

Run `npm run build` — should compile without errors.
Run `npm run dev:server` — server starts, no crashes.
Connect client — all systems functional.
