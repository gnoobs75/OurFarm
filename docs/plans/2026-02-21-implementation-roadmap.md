# OurFarm Full Implementation Roadmap

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform OurFarm from a basic farming prototype into a full Stardew-style cozy grinder with deep interlocking systems, a slow-burn economy, and co-op multiplayer progression.

**Architecture:** Server-authoritative with Socket.io transport. All game logic validated server-side (GameWorld.js), client handles rendering and input. SQLite persistence via better-sqlite3. Shared constants and utilities between client/server. New systems layer onto existing action handler pattern in GameWorld.

**Tech Stack:** Three.js r183, Socket.io, better-sqlite3, Node.js, Vite, simplex-noise.

**Reference:** Full game design at `docs/plans/2026-02-21-full-game-design.md`

---

## Phase Dependency Graph

```
Phase 1: Skill System & Crop Quality
  ↓
Phase 2: Crafting & Processing ← (needs skills for recipe unlocks)
  ↓
Phase 3: Tool Upgrades & Sprinklers ← (needs bars from smelting)
  ↓
Phase 4: Mining System ← (needs combat skill, weapons, tools)
  ↓
Phase 5: Fishing Overhaul ← (needs fishing skill, can run parallel with Phase 4)
  ↓
Phase 6: Foraging & Trees ← (needs foraging skill)
  ↓
Phase 7: Building System ← (needs resources from mining/foraging)
  ↓
Phase 8: Animal Overhaul ← (needs buildings)
  ↓
Phase 9: Cooking System ← (needs kitchen from house upgrade, ingredients from all systems)
  ↓
Phase 10: NPC Enhancement ← (needs items from all systems for gifts)
  ↓
Phase 11: Community Barn & Milestones ← (needs items from ALL systems)
  ↓
Phase 12: Collections & Endgame ← (needs everything)
```

---

## Phase 1: Skill System & Crop Quality

**Why first:** The 5-skill system replaces the single XP/level model and is the foundation for crop quality, fishing difficulty, mining bonuses, and profession branching. Every subsequent system references skill levels.

### Task 1: Add Skill Constants and Database Schema

**Files:**
- Modify: `shared/constants.js:68-91`
- Modify: `server/db/schema.sql:13-25`

**Step 1: Add skill constants to shared/constants.js**

Add after the ACTIONS block (line 91):

```javascript
// Skills
export const SKILLS = {
  FARMING: 'farming',
  FISHING: 'fishing',
  MINING: 'mining',
  FORAGING: 'foraging',
  COMBAT: 'combat',
};

export const SKILL_MAX_LEVEL = 10;

// XP needed for each level: level * 100
export function xpForSkillLevel(level) {
  return level * 100;
}

// Crop quality tiers
export const QUALITY = {
  NORMAL: 0,
  SILVER: 1,
  GOLD: 2,
  IRIDIUM: 3,
};

export const QUALITY_MULTIPLIER = {
  0: 1.0,
  1: 1.25,
  2: 1.5,
  3: 2.0,
};
```

**Step 2: Add player_skills table to schema.sql**

Add after the `players` table (after line 25):

```sql
CREATE TABLE IF NOT EXISTS player_skills (
  player_id TEXT NOT NULL,
  skill TEXT NOT NULL CHECK(skill IN ('farming','fishing','mining','foraging','combat')),
  level INTEGER DEFAULT 0,
  xp INTEGER DEFAULT 0,
  PRIMARY KEY (player_id, skill),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
```

**Step 3: Modify inventory table to support quality**

Replace the inventory table (lines 27-34) — add a `quality` column:

```sql
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  quality INTEGER DEFAULT 0,
  slot INTEGER,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
```

**Step 4: Verify — restart server, check DB initializes without errors**

Run: `npm run dev` — server starts, no SQL errors in console.

**Step 5: Commit**
```bash
git add shared/constants.js server/db/schema.sql
git commit -m "feat: add skill system constants and database schema"
```

---

### Task 2: Implement Skill System in Player Entity

**Files:**
- Modify: `server/entities/Player.js:1-78`

**Step 1: Rewrite Player class with skill support**

Replace the entire Player class. Key changes: add `skills` map, `addSkillXP()` method, `getSkillLevel()`, keep backward-compatible `addXP()` that feeds into farming skill.

```javascript
// server/entities/Player.js
import { SKILLS, SKILL_MAX_LEVEL, xpForSkillLevel } from '@shared/constants.js';

export class Player {
  constructor(data) {
    this.id = data.id;
    this.name = data.name || 'Farmer';
    this.x = data.x ?? 32;
    this.z = data.z ?? 32;
    this.coins = data.coins ?? 500;
    this.energy = data.energy ?? 100;
    this.maxEnergy = data.maxEnergy ?? 100;
    this.inventory = data.inventory || this._defaultInventory();
    this.activeToolSlot = 0;
    this.socketId = data.socketId;

    // Skills — initialize all to 0/0
    this.skills = {};
    for (const skill of Object.values(SKILLS)) {
      this.skills[skill] = { level: 0, xp: 0 };
    }
    // Overlay saved skills if provided
    if (data.skills) {
      for (const [name, val] of Object.entries(data.skills)) {
        this.skills[name] = { level: val.level || 0, xp: val.xp || 0 };
      }
    }

    // Derived: overall player level = sum of all skill levels
    this.level = this._calcLevel();
  }

  _defaultInventory() {
    return [
      { itemId: 'hoe', quantity: 1 },
      { itemId: 'watering_can', quantity: 1 },
      { itemId: 'pickaxe', quantity: 1 },
      { itemId: 'axe', quantity: 1 },
      { itemId: 'fishing_rod', quantity: 1 },
      { itemId: 'wheat_seed', quantity: 15 },
      { itemId: 'carrot_seed', quantity: 10 },
    ];
  }

  _calcLevel() {
    let total = 0;
    for (const s of Object.values(this.skills)) total += s.level;
    return total;
  }

  addItem(itemId, quantity = 1, quality = 0) {
    const existing = this.inventory.find(i => i.itemId === itemId && (i.quality || 0) === quality);
    if (existing) existing.quantity += quantity;
    else this.inventory.push({ itemId, quantity, quality });
  }

  removeItem(itemId, quantity = 1) {
    const slot = this.inventory.find(i => i.itemId === itemId && i.quantity >= quantity);
    if (!slot) return false;
    slot.quantity -= quantity;
    if (slot.quantity <= 0) this.inventory = this.inventory.filter(i => i.quantity > 0);
    return true;
  }

  hasItem(itemId, quantity = 1) {
    const slot = this.inventory.find(i => i.itemId === itemId);
    return slot && slot.quantity >= quantity;
  }

  /** Add XP to a specific skill. Returns true if leveled up. */
  addSkillXP(skillName, amount) {
    const skill = this.skills[skillName];
    if (!skill || skill.level >= SKILL_MAX_LEVEL) return false;

    skill.xp += amount;
    let leveled = false;

    while (skill.level < SKILL_MAX_LEVEL && skill.xp >= xpForSkillLevel(skill.level + 1)) {
      skill.xp -= xpForSkillLevel(skill.level + 1);
      skill.level++;
      this.maxEnergy += 2; // +2 max energy per skill level (across all skills = +10 per 5 levels)
      leveled = true;
    }

    this.level = this._calcLevel();
    return leveled;
  }

  getSkillLevel(skillName) {
    return this.skills[skillName]?.level || 0;
  }

  /** Legacy addXP — routes to farming skill */
  addXP(amount) {
    return this.addSkillXP(SKILLS.FARMING, amount);
  }

  useEnergy(amount) {
    if (this.energy < amount) return false;
    this.energy -= amount;
    return true;
  }

  getState() {
    return {
      id: this.id, name: this.name,
      x: this.x, z: this.z,
      coins: this.coins,
      level: this.level,
      energy: Math.floor(this.energy),
      maxEnergy: this.maxEnergy,
      skills: this.skills,
      inventory: this.inventory,
    };
  }
}
```

**Step 2: Verify — restart server, connect client, check player state includes skills**

Run: `npm run dev` — connect, open console: `await __ourfarmDebug.getState()` should show skills in player data.

**Step 3: Commit**
```bash
git add server/entities/Player.js
git commit -m "feat: implement 5-skill system in Player entity"
```

---

### Task 3: Persist Skills to Database

**Files:**
- Modify: `server/game/GameWorld.js:214-256` (player save/load area)

**Step 1: Add skill save/load to GameWorld**

In the `handlePlayerJoin` handler (around line 214), after creating/loading the player, also load skills from DB. In `_saveWorldState` and wherever player state is persisted, save skills.

Add these methods to GameWorld:

```javascript
  _loadPlayerSkills(playerId) {
    const db = getDB();
    const rows = db.prepare('SELECT skill, level, xp FROM player_skills WHERE player_id = ?').all(playerId);
    const skills = {};
    for (const row of rows) {
      skills[row.skill] = { level: row.level, xp: row.xp };
    }
    return skills;
  }

  _savePlayerSkills(player) {
    const db = getDB();
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO player_skills (player_id, skill, level, xp) VALUES (?, ?, ?, ?)'
    );
    const saveAll = db.transaction(() => {
      for (const [name, data] of Object.entries(player.skills)) {
        stmt.run(player.id, name, data.level, data.xp);
      }
    });
    saveAll();
  }
```

Call `_loadPlayerSkills(playerId)` when creating the Player instance and pass the result as `data.skills`. Call `_savePlayerSkills(player)` in `_onNewDay()` and when a player disconnects.

**Step 2: Verify — restart, play, check skills persist across reconnect**

Run: `npm run dev` — harvest a crop, reconnect, skills should persist.

**Step 3: Commit**
```bash
git add server/game/GameWorld.js
git commit -m "feat: persist player skills to database"
```

---

### Task 4: Crop Quality Rolls on Harvest

**Files:**
- Modify: `server/game/GameWorld.js:331-357` (handleHarvest)

**Step 1: Add quality roll function**

Add this helper to GameWorld:

```javascript
  _rollCropQuality(farmingLevel) {
    const roll = Math.random();
    // Iridium only possible with specific conditions (fertilizer — future)
    const goldChance = farmingLevel * 0.015;     // 1.5% per level
    const silverChance = farmingLevel * 0.03;     // 3% per level

    if (roll < goldChance) return 2;        // Gold
    if (roll < goldChance + silverChance) return 1; // Silver
    return 0;                                        // Normal
  }
```

**Step 2: Modify handleHarvest to use quality**

In `handleHarvest` (line 331), after determining yield, roll quality and pass it to `addItem`:

```javascript
  handleHarvest(player, tileX, tileZ) {
    const crop = [...this.crops.values()].find(c => c.tileX === tileX && c.tileZ === tileZ);
    if (!crop || crop.stage < CROP_STAGES.HARVESTABLE) return null;

    const cropData = this.cropDefs[crop.cropType];
    if (!cropData) return null;

    const yield_ = 1 + Math.floor(Math.random() * 2);
    const quality = this._rollCropQuality(player.getSkillLevel(SKILLS.FARMING));

    player.addItem(crop.cropType, yield_, quality);
    player.addSkillXP(SKILLS.FARMING, cropData.xp);

    this.crops.delete(crop.id);
    // Reset tile to tilled
    const tileKey = `${tileX},${tileZ}`;
    const tile = this.tiles.get(tileKey);
    if (tile) tile.type = TILE_TYPES.TILLED;

    this._broadcastWorldUpdate('cropHarvested', { cropId: crop.id });
    this._sendInventoryUpdate(player);

    return { cropType: crop.cropType, yield: yield_, quality };
  }
```

Add `import { SKILLS } from '@shared/constants.js';` to the imports at top of GameWorld.

**Step 3: Modify handleShopSell to apply quality multiplier**

In `handleShopSell` (line 444), calculate price using QUALITY_MULTIPLIER:

```javascript
  handleShopSell(player, itemId, quantity) {
    if (!player.hasItem(itemId, quantity)) return null;

    const cropData = this.cropDefs[itemId];
    let basePrice = cropData?.sellPrice || 10;

    // Find the item slot to get quality
    const slot = player.inventory.find(i => i.itemId === itemId);
    const quality = slot?.quality || 0;
    const price = Math.floor(basePrice * QUALITY_MULTIPLIER[quality]) * quantity;

    player.removeItem(itemId, quantity);
    player.coins += price;
    player.addSkillXP(SKILLS.FARMING, 2 * quantity);

    this._sendInventoryUpdate(player);
    return { itemId, quantity, coins: price };
  }
```

Add `QUALITY_MULTIPLIER` to the imports from constants.

**Step 4: Verify — harvest crops, check inventory shows quality, sell at correct prices**

Run: `npm run dev` — harvest crops repeatedly. Higher farming skill = more silver/gold.

**Step 5: Commit**
```bash
git add server/game/GameWorld.js
git commit -m "feat: add crop quality rolls on harvest with sell price multipliers"
```

---

### Task 5: Expand Crop Data (24 crops)

**Files:**
- Modify: `server/data/crops.json`
- Modify: `shared/ItemRegistry.js`

**Step 1: Replace crops.json with expanded 24-crop list**

```json
{
  "parsnip":     { "name": "Parsnip",     "buyPrice": 10,  "sellPrice": 25,  "growthTime": 4,  "season": [0],    "xp": 8,  "regrows": false },
  "potato":      { "name": "Potato",      "buyPrice": 12,  "sellPrice": 30,  "growthTime": 6,  "season": [0],    "xp": 10, "regrows": false },
  "cauliflower": { "name": "Cauliflower", "buyPrice": 35,  "sellPrice": 85,  "growthTime": 12, "season": [0],    "xp": 18, "regrows": false },
  "garlic":      { "name": "Garlic",      "buyPrice": 15,  "sellPrice": 30,  "growthTime": 4,  "season": [0],    "xp": 8,  "regrows": false },
  "kale":        { "name": "Kale",        "buyPrice": 18,  "sellPrice": 40,  "growthTime": 6,  "season": [0],    "xp": 10, "regrows": false },
  "strawberry":  { "name": "Strawberry",  "buyPrice": 30,  "sellPrice": 60,  "growthTime": 8,  "season": [0],    "xp": 14, "regrows": true },
  "melon":       { "name": "Melon",       "buyPrice": 40,  "sellPrice": 125, "growthTime": 12, "season": [1],    "xp": 20, "regrows": false },
  "tomato":      { "name": "Tomato",      "buyPrice": 20,  "sellPrice": 40,  "growthTime": 11, "season": [1],    "xp": 10, "regrows": true },
  "blueberry":   { "name": "Blueberry",   "buyPrice": 25,  "sellPrice": 50,  "growthTime": 13, "season": [1],    "xp": 12, "regrows": true },
  "hot_pepper":  { "name": "Hot Pepper",  "buyPrice": 15,  "sellPrice": 35,  "growthTime": 5,  "season": [1],    "xp": 10, "regrows": true },
  "corn":        { "name": "Corn",        "buyPrice": 15,  "sellPrice": 35,  "growthTime": 14, "season": [1, 2], "xp": 12, "regrows": true },
  "red_cabbage": { "name": "Red Cabbage", "buyPrice": 50,  "sellPrice": 120, "growthTime": 9,  "season": [1],    "xp": 16, "regrows": false },
  "pumpkin":     { "name": "Pumpkin",     "buyPrice": 40,  "sellPrice": 100, "growthTime": 13, "season": [2],    "xp": 20, "regrows": false },
  "cranberry":   { "name": "Cranberry",   "buyPrice": 30,  "sellPrice": 55,  "growthTime": 7,  "season": [2],    "xp": 12, "regrows": true },
  "grape":       { "name": "Grape",       "buyPrice": 25,  "sellPrice": 45,  "growthTime": 10, "season": [2],    "xp": 12, "regrows": true },
  "artichoke":   { "name": "Artichoke",   "buyPrice": 15,  "sellPrice": 40,  "growthTime": 8,  "season": [2],    "xp": 12, "regrows": false },
  "beet":        { "name": "Beet",        "buyPrice": 10,  "sellPrice": 30,  "growthTime": 6,  "season": [2],    "xp": 10, "regrows": false },
  "yam":         { "name": "Yam",         "buyPrice": 25,  "sellPrice": 65,  "growthTime": 10, "season": [2],    "xp": 14, "regrows": false },
  "wheat":       { "name": "Wheat",       "buyPrice": 5,   "sellPrice": 15,  "growthTime": 4,  "season": [1, 2], "xp": 6,  "regrows": false },
  "ancient_fruit":{ "name": "Ancient Fruit","buyPrice": 500,"sellPrice": 550, "growthTime": 28, "season": [0,1,2],"xp": 30, "regrows": true },
  "starfruit":   { "name": "Starfruit",   "buyPrice": 200, "sellPrice": 750, "growthTime": 13, "season": [1],    "xp": 25, "regrows": false },
  "coffee_bean": { "name": "Coffee Bean", "buyPrice": 100, "sellPrice": 15,  "growthTime": 10, "season": [0, 1], "xp": 8,  "regrows": true },
  "sunflower":   { "name": "Sunflower",   "buyPrice": 20,  "sellPrice": 40,  "growthTime": 8,  "season": [1, 2], "xp": 10, "regrows": false },
  "carrot":      { "name": "Carrot",      "buyPrice": 8,   "sellPrice": 20,  "growthTime": 3,  "season": [0],    "xp": 6,  "regrows": false }
}
```

**Step 2: Add new items to ItemRegistry.js**

Add entries for all new crops and their seeds (parsnip, cauliflower, garlic, kale, melon, hot_pepper, red_cabbage, cranberry, grape, artichoke, beet, yam, ancient_fruit, starfruit, coffee_bean, sunflower — and corresponding `_seed` entries).

**Step 3: Update Crop.tick() to handle regrow**

In `server/entities/Crop.js`, when a crop reaches HARVESTABLE stage and has `regrows: true`, after harvest reset stage to MATURE (stage 2) instead of deleting the crop. Modify `handleHarvest` in GameWorld accordingly.

**Step 4: Verify — restart, check all seeds available in shop, plant/grow/harvest each season's crops**

**Step 5: Commit**
```bash
git add server/data/crops.json shared/ItemRegistry.js server/entities/Crop.js server/game/GameWorld.js
git commit -m "feat: expand to 24 crops with regrowable support and seasonal variety"
```

---

### Task 6: Season Crop Death

**Files:**
- Modify: `server/game/GameWorld.js` (in `_onNewDay` around line 175)

**Step 1: Kill off-season crops on season change**

In the `_onNewSeason()` or in `_onNewDay()` when a new season starts, iterate all crops. If the crop's `season` array doesn't include the new season, destroy it:

```javascript
  _onSeasonChange(newSeason) {
    const toRemove = [];
    for (const [id, crop] of this.crops) {
      const cropData = this.cropDefs[crop.cropType];
      if (cropData && !cropData.season.includes(newSeason)) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      const crop = this.crops.get(id);
      const tileKey = `${crop.tileX},${crop.tileZ}`;
      const tile = this.tiles.get(tileKey);
      if (tile) tile.type = TILE_TYPES.TILLED;
      this.crops.delete(id);
    }
    if (toRemove.length > 0) {
      logger.info('WORLD', `Season change: ${toRemove.length} crops died`);
      this._broadcastWorldUpdate('fullSync', { crops: [...this.crops.values()].map(c => c.getState()) });
    }
  }
```

**Step 2: Verify — plant a spring crop, advance time to summer, crop should die**

**Step 3: Commit**
```bash
git add server/game/GameWorld.js
git commit -m "feat: kill off-season crops on season change"
```

---

### Task 7: Day Pressure — Collapse & Energy Penalties

**Files:**
- Modify: `server/game/GameWorld.js`
- Modify: `server/game/TimeManager.js`

**Step 1: Add 2 AM collapse check**

In the time tick (inside `_tick()`), when the hour crosses 2:00 AM (hour >= 26, since hour wraps), trigger collapse for all online players:

```javascript
  _checkCollapse() {
    const hour = this.time.hour;
    // 2 AM = hour 26 in the 0-based 6am-start system, or simply hour >= 2 && hour < 6
    if (hour >= 2 && hour < 6) {
      for (const player of this.players.values()) {
        if (!player._collapsed) {
          player._collapsed = true;
          // Penalty: lose 10% coins (max 1000)
          const penalty = Math.min(Math.floor(player.coins * 0.1), 1000);
          player.coins -= penalty;
          // Wake with 50% energy
          player.energy = Math.floor(player.maxEnergy * 0.5);
          this._sendInventoryUpdate(player);
          // Broadcast collapse event
          const io = this._io;
          if (io && player.socketId) {
            io.to(player.socketId).emit(ACTIONS.WORLD_UPDATE, {
              type: 'playerCollapse',
              penalty,
            });
          }
        }
      }
    }
  }
```

Reset `player._collapsed = false` in `_onNewDay()`.

**Step 2: Verify — stay up past 2 AM in-game, lose coins and wake with reduced energy**

**Step 3: Commit**
```bash
git add server/game/GameWorld.js
git commit -m "feat: add 2 AM collapse with coin penalty and energy reduction"
```

---

### Task 8: Update Client HUD for Skills

**Files:**
- Modify: `client/src/ui/HUD.js`
- Modify: `client/src/main.js`

**Step 1: Add skill display to HUD stats**

Update `HUD.updateStats()` to show the player's highest/active skill level. Add a simple skill summary in the stats group:

```javascript
  updateStats(data) {
    if (data.coins !== undefined) document.getElementById('hud-coins').textContent = `Coins: ${data.coins}`;
    if (data.level !== undefined) document.getElementById('hud-level').textContent = `Lv ${data.level}`;
    if (data.energy !== undefined) document.getElementById('hud-energy').textContent = `Energy: ${Math.floor(data.energy)}/${data.maxEnergy || 100}`;

    // Update skills display if available
    if (data.skills) {
      const skillEl = document.getElementById('hud-skills');
      if (skillEl) {
        const skillText = Object.entries(data.skills)
          .map(([name, s]) => `${name[0].toUpperCase()}:${s.level}`)
          .join(' ');
        skillEl.textContent = skillText;
      }
    }
  }
```

Add `<div class="hud-item" id="hud-skills"></div>` to the stats HUD group in the constructor.

Remove the old XP display (`hud-xp`) since skills replace it.

**Step 2: Show quality stars in inventory**

In `client/src/ui/Inventory.js`, when rendering item slots, show quality indicators:
- Quality 1 (Silver): silver border glow
- Quality 2 (Gold): gold border glow
- Quality 3 (Iridium): purple border glow

**Step 3: Verify — open game, HUD shows skill levels, inventory shows quality stars**

**Step 4: Commit**
```bash
git add client/src/ui/HUD.js client/src/ui/Inventory.js client/src/main.js
git commit -m "feat: show skill levels and item quality in HUD and inventory"
```

---

### Task 9: Shipping Bin

**Files:**
- Modify: `server/game/GameWorld.js`
- Modify: `shared/constants.js`
- Create: `client/src/ui/ShippingBinUI.js` (or reuse shop panel)

**Step 1: Add shipping bin server logic**

Add a `shippingBin` map to GameWorld (per player). Items placed in the bin are stored. On `_onNewDay()`, sum up all bin items, calculate total value (with quality multipliers), add coins to player, clear bin.

```javascript
// In constructor:
this.shippingBins = new Map(); // playerId -> [{itemId, quantity, quality}]

// New handler:
handleShipItem(player, itemId, quantity) {
  if (!player.hasItem(itemId, quantity)) return null;
  player.removeItem(itemId, quantity);

  const slot = player.inventory.find(i => i.itemId === itemId);
  const quality = slot?.quality || 0;

  if (!this.shippingBins.has(player.id)) this.shippingBins.set(player.id, []);
  this.shippingBins.get(player.id).push({ itemId, quantity, quality });

  this._sendInventoryUpdate(player);
  return { itemId, quantity };
}

// In _onNewDay():
_processShippingBins() {
  for (const [playerId, items] of this.shippingBins) {
    const player = this.players.get(playerId);
    if (!player) continue;

    let totalCoins = 0;
    for (const item of items) {
      const cropData = this.cropDefs[item.itemId];
      const basePrice = cropData?.sellPrice || 10;
      const multiplier = QUALITY_MULTIPLIER[item.quality] || 1;
      totalCoins += Math.floor(basePrice * multiplier) * item.quantity;
    }

    player.coins += totalCoins;
    if (totalCoins > 0) {
      this._sendInventoryUpdate(player);
    }
  }
  this.shippingBins.clear();
}
```

Add `ACTIONS.SHIP_ITEM = 'ship:item'` to constants.

**Step 2: Add socket handler in server/index.js for SHIP_ITEM**

**Step 3: Verify — place items in shipping bin, next day get coins**

**Step 4: Commit**
```bash
git add server/game/GameWorld.js shared/constants.js server/index.js
git commit -m "feat: add shipping bin with next-morning payment"
```

---

## Phase 2: Crafting & Processing (Summary)

**Goal:** Wire up the existing recipe system and add artisan processing machines.

### Task 1: Wire Crafting System Server Handlers
- Implement `handleCraftStart(player, recipeId)` and `handleCraftCollect(player, buildingId)` in GameWorld
- Validate player has ingredients, deduct them, set building processing state
- Use existing `buildings` table fields: `processing_recipe`, `processing_start`, `processing_done`

### Task 2: Add Furnace for Smelting
- New building type: furnace (placeable, no construction time)
- Craft recipe: copper_ore × 20 + stone × 25
- Smelting recipes: copper_ore × 5 → copper_bar (30 min), iron × 5 → iron_bar (2h), gold × 5 → gold_bar (5h)
- Each smelt requires 1 coal (add coal to ItemRegistry)

### Task 3: Add Processing Machines
- Keg, Preserves Jar, Cheese Press, Mayonnaise Machine, Loom, Oil Maker
- Each is a building type that can be placed
- Crafting recipes for each machine
- Processing recipes (keg: fruit → wine in 7 days, vegetable → juice in 4 days, etc.)
- Value calculations: keg = 3× base, preserves = 2× base + 50

### Task 4: Machine Placement UI
- Client-side building placement mode
- Click to place machine on valid tile
- Visual feedback showing machine state (idle/processing/done)

### Task 5: Cask Aging (Cellar)
- Wine/cheese placed in cask ages through quality tiers
- 14 days per quality tier
- Requires cellar (house upgrade — Phase 7)

---

## Phase 3: Tool Upgrades & Sprinklers (Summary)

**Goal:** Add the tool upgrade path and sprinkler automation.

### Task 1: Tool Tier Data Model
- Add `tool_tier` column to player tools in inventory (or separate tools table)
- Tool tiers: basic(0), copper(1), iron(2), gold(3), iridium(4)
- Energy cost reduction: -1 per tier

### Task 2: Blacksmith Upgrade Flow
- Grim NPC acts as blacksmith
- New action: `tool:upgrade` — requires bars + coins + 2-day wait
- Tool unavailable during upgrade period
- Pickup after 2 days

### Task 3: Charged Tool Actions
- Hold-to-charge mechanic for hoe and watering can
- Copper: 3 tiles in a line
- Iron: 5 tiles
- Gold: 3×3 area
- Iridium: 5×5 area

### Task 4: Sprinkler Crafting & Placement
- Three sprinkler tiers (basic/quality/iridium)
- Place on farm tile, auto-waters adjacent tiles at start of each day
- Sprinkler rendering (small object on tile)

---

## Phase 4: Mining System (Summary)

**Goal:** 120-floor procedural mine with ores, monsters, and combat.

### Task 1: Mine Floor Generation
- Procedural floor layout from seed + floor number
- Rock nodes, ore veins, gem deposits, ladder
- Floor biome changes at 40/80

### Task 2: Mine Entry & Floor Navigation
- Mine entrance on map
- Elevator system (checkpoints every 5 floors)
- Player enters mine → loads floor → breaks rocks to find ladder

### Task 3: Ore Deposits & Collection
- Copper (floors 1-39), Iron (40-79), Gold (80-119), Iridium (80+)
- Breaking ore node: costs energy, awards mining XP, drops ore
- Coal drops from any rock

### Task 4: Monster System
- Simple monster entities: Slime, Bat, Shadow Brute
- HP, damage, movement AI
- Player melee combat (sword swing)
- Monster drops (slime, bat wing, void essence)
- Combat XP awards

### Task 5: Geodes & Minerals
- Geode drops from rocks (common/frozen/magma variants)
- Crack at blacksmith (25g)
- 40 unique minerals — random from geode type pool
- Museum donation tracking

### Task 6: Skull Cavern
- Unlocked after floor 120 (skull key)
- No elevator — starts from 1 each run
- Harder monsters, more iridium
- Depth tracking for milestones

---

## Phase 5: Fishing Overhaul (Summary)

**Goal:** Replace instant-catch with skill-based minigame.

### Task 1: Fishing Minigame Server Logic
- Fish difficulty rating per species
- Catch success based on player input + fishing skill
- Rod tier affects bar size, bait affects bite time

### Task 2: Fishing Minigame Client UI
- Vertical bar with catch zone
- Fish icon with behavior-based movement (dart/smooth/sinker/floater/mixed)
- Progress meter fill/drain
- Bite wait timer with visual indicator

### Task 3: Rod Upgrades
- Bamboo (starting), Fiberglass (fishing 2, 1800g), Iridium (fishing 6, 7500g)
- Bait slot (fiberglass+), Tackle slot (iridium only)

### Task 4: Bait & Tackle System
- Bait types: Basic, Wild, Magic
- Tackle types: Spinner, Trap Bobber, Cork Bobber, Lead Bobber, Curiosity Lure
- Durability tracking for tackle

### Task 5: Expanded Fish Data
- 30+ species with behavior type, difficulty, season/weather/time/location requirements
- Legendary fish (one per save, extreme difficulty)
- Crab pots (passive fishing, bait + daily harvest)

### Task 6: Fish Pond Building
- Stock with fish, reproduce over time
- Produce roe (processable via preserves jar)

---

## Phase 6: Foraging & Trees (Summary)

### Task 1: Seasonal Forageable Spawning
- 4 items per season spawn randomly on valid tiles each morning
- Foraging skill XP on pickup, quality based on skill level

### Task 2: Tree Types & Chopping
- Oak, Maple, Pine trees with tap products
- Chopping yields wood, skill XP
- Hardwood from large stumps

### Task 3: Tree Tapper
- Craftable item placed on tree
- Produces resin/syrup/tar on timer
- Essential for keg recipe and fertilizer

---

## Phase 7: Building System (Summary)

### Task 1: Carpenter NPC & Construction Flow
- New NPC or extend existing
- Building menu: select building, choose location, pay materials + coins
- Construction period (2-3 days)

### Task 2: Farm Building Placement
- Grid-based placement on farm tiles
- Collision detection (no overlap)
- Visual construction scaffolding during build

### Task 3: Building Interiors
- Coop/Barn: animal capacity, feed trough
- Shed: empty interior for machines
- House upgrades: kitchen → nursery → cellar

### Task 4: Building Upgrades
- Coop → Big Coop → Deluxe Coop
- Barn → Big Barn → Deluxe Barn
- Each tier adds capacity + new animal types + features

---

## Phase 8: Animal Overhaul (Summary)

### Task 1: Animal Happiness System
- 5-heart friendship per animal
- Daily petting, feeding, outdoor access affect happiness
- Happiness affects product quality (star rating)

### Task 2: Expanded Animal Types
- Duck, Rabbit (coop); Goat, Sheep, Pig (barn)
- Each with unique products and behaviors

### Task 3: Breeding & Incubator
- Incubator in Big Coop (egg → chick in 5 days)
- Pregnancy chance in Big Barn

---

## Phase 9: Cooking System (Summary)

### Task 1: Recipe Collection
- ~24 recipes unlocked via NPC friendship, TV, mine chests
- Recipe book UI in inventory

### Task 2: Cooking UI & Logic
- Kitchen required (house upgrade)
- Select recipe, use ingredients, wait for cook time
- Output: cooked item with buff data

### Task 3: Food Buffs
- Temporary stat boosts (one in-game day)
- Speed, luck, farming, mining, fishing, max energy buffs
- Only one buff active at a time

---

## Phase 10: NPC Enhancement (Summary)

### Task 1: Gift Preferences
- Loved/Liked/Neutral/Disliked/Hated per NPC
- Friendship point values: loved +80, liked +45, neutral +20, disliked -20, hated -40
- Birthday 8× multiplier

### Task 2: Heart Events
- Scripted cutscenes at 2/4/6/8/10 hearts
- Location + time triggers
- Branching choices with consequences

### Task 3: NPC Daily Schedules
- Pathfinding between home, shop, town square
- Time-based position changes
- Door lock at night

### Task 4: Festivals
- 4 per year (Egg Festival, Luau, Harvest Fair, Festival of Ice)
- Day pauses normal gameplay
- Minigames and unique rewards

---

## Phase 11: Community Barn & Milestones (Summary)

### Task 1: Community Barn Building
- 6 rooms with bundle slots
- Bundle UI: show required items, accept donations
- Track contributions per player (co-op credit)

### Task 2: Bundle Completion Rewards
- Crops Room → Greenhouse
- Fish Tank → Fish Pond + new area
- Forge Room → Mine cart fast travel
- Kitchen Room → Upgraded shop
- Animal Room → Auto-pet
- Workshop Room → Teleport totems

### Task 3: Milestone Achievement System
- Track lifetime stats (items shipped, fish caught, mine depth, etc.)
- Milestone thresholds award Permit Points

### Task 4: Permit Shop
- Spend Permit Points to unlock capabilities
- Fishing License II, Mining License II, Building Permit II, Land Expansion, etc.

---

## Phase 12: Collections & Endgame (Summary)

### Task 1: Museum Building
- Mineral display (40 slots), artifact display (20 slots), fish tank (30+ slots)
- Donation UI, milestone rewards
- Stardrop at 60 donations

### Task 2: Shipping Log & Crafting Log
- Track every unique item shipped
- Track every recipe crafted/cooked

### Task 3: Perfection Tracker
- 10 categories, weighted percentages
- Track completion across all systems
- 100% reward: Statue of Perfection + cosmetic

### Task 4: Stardrops
- 7 hidden across the game
- Each grants +34 max energy permanently
- Sources: Harvest Fair, Museum, Mine, Fishing, NPC, Community Barn, Skull Cavern

---

## Implementation Notes

### Database Migrations
Since we're modifying the schema, add a version check. In `database.js`, after `initSchema()`, run migration queries if tables need new columns. Use `ALTER TABLE ... ADD COLUMN` with `IF NOT EXISTS` pattern.

### Client-Server Protocol
All new actions follow the existing pattern:
1. Add action constant to `shared/constants.js:ACTIONS`
2. Add handler in `server/game/GameWorld.js`
3. Add socket listener in `server/index.js`
4. Add send method in `client/src/network/NetworkClient.js`
5. Add event handler in `client/src/main.js`

### Performance Considerations
- Mine floors should be generated on-demand and cached (not all 120 at once)
- Fishing minigame is client-side with server validation of the catch result
- Sprinkler watering happens in batch during `_onNewDay()`, not per-tick
- Entity counts shown in debug window (F3) will help track performance

### Co-op Considerations
- Skills are per-player (individual progression)
- Community Barn is shared (group progression)
- Shipping bin is per-player
- Buildings are shared (anyone can use machines)
- Milestones track both individual and group stats
