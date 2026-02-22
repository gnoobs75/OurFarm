# Fishing System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the full fishing mini-game with cinematic cast sequence, Stardew-style catch bar, 35 fish species, and integration with existing skill/economy systems.

**Architecture:** Two-phase server flow (cast → bite data → client mini-game → reel result → XP/items). Client owns all visuals: Three.js effects (bobber, ripples, splash) and HTML/CSS catch bar overlay. Server owns fish selection, validation, XP, and inventory.

**Tech Stack:** Three.js (effects), HTML/CSS (catch bar UI), Socket.io (network), Node.js (server)

**Design Doc:** `docs/plans/2026-02-22-fishing-system-design.md`

---

## Existing Code Reference

**Already exists:**
- `ACTIONS.FISH_CAST` / `ACTIONS.FISH_REEL` in `shared/constants.js:82-83`
- `FISH_RARITY` constants in `shared/constants.js:46-51`
- `FishCalculator` in `server/entities/Fish.js` — has `rollCatch(location, playerLevel, rodQuality, baitBonus)`
- `handleFishCast` in `server/game/GameWorld.js:570-595` — currently instant (gives fish immediately)
- `sendFishCast(x, z)` and `sendFishReel()` in `client/src/network/NetworkClient.js:70-71`
- `case 'fishing_rod':` in `client/src/main.js:250` — calls `network.sendFishCast()`
- `case 'fishCaught':` and `case 'fishMiss':` in `client/src/main.js:316-320` — just console.log
- Fishing rod in player's default inventory (`server/entities/Player.js:50`)
- Fishing rod in HUD action bar (`client/src/ui/HUD.js:8`)
- `FISH_REEL` wired in `server/index.js:145` (but `handleFishReel` doesn't exist yet)
- `fishing_rod` tier in `player.toolTiers` (`server/entities/Player.js:22`)
- Fishing professions in `shared/constants.js:212-226`

**New files to create:**
- `client/src/effects/FishingEffects.js` — Three.js bobber, ripple, splash
- `client/src/ui/FishingUI.js` — catch bar mini-game overlay

**Files to modify:**
- `server/data/fish.json` — expand 15 → 35 species with behavior/season/time
- `server/entities/Fish.js` — add season/time/behavior filtering, bait rarity boost
- `server/game/GameWorld.js` — rewrite `handleFishCast` (2-phase), add `handleFishReel`
- `server/index.js` — wire `FISH_REEL` handler
- `client/src/network/NetworkClient.js` — update `sendFishReel` to send `{ success }`
- `client/src/main.js` — fishing state machine, wire effects + UI
- `client/styles/game.css` — fishing UI styles
- `client/index.html` — add fishing UI container

---

## Task 1: Expand Fish Data

**Files:**
- Modify: `server/data/fish.json`

**Step 1: Replace fish.json with all 35 species**

Replace the entire contents of `server/data/fish.json` with:

```json
{
  "carp":          { "name": "Carp",          "rarity": 0, "value": 18,   "location": "pond",  "minLevel": 1,  "season": [],             "time": "any",       "behavior": "sine" },
  "perch":         { "name": "Perch",         "rarity": 0, "value": 22,   "location": "pond",  "minLevel": 1,  "season": [],             "time": "any",       "behavior": "sine" },
  "bass":          { "name": "Bass",          "rarity": 0, "value": 20,   "location": "pond",  "minLevel": 1,  "season": [],             "time": "any",       "behavior": "sine" },
  "bluegill":      { "name": "Bluegill",      "rarity": 0, "value": 15,   "location": "pond",  "minLevel": 1,  "season": [0, 1],         "time": "day",       "behavior": "sine" },
  "catfish":       { "name": "Catfish",       "rarity": 0, "value": 30,   "location": "pond",  "minLevel": 2,  "season": [],             "time": "night",     "behavior": "sine" },
  "sunfish":       { "name": "Sunfish",       "rarity": 0, "value": 24,   "location": "pond",  "minLevel": 2,  "season": [1],            "time": "day",       "behavior": "sine" },
  "bullhead":      { "name": "Bullhead",      "rarity": 1, "value": 45,   "location": "pond",  "minLevel": 3,  "season": [],             "time": "any",       "behavior": "dart" },
  "koi":           { "name": "Koi",           "rarity": 1, "value": 65,   "location": "pond",  "minLevel": 5,  "season": [0],            "time": "any",       "behavior": "dart" },
  "goldfish":      { "name": "Goldfish",      "rarity": 2, "value": 200,  "location": "pond",  "minLevel": 9,  "season": [],             "time": "any",       "behavior": "erratic" },
  "ghost_fish":    { "name": "Ghost Fish",    "rarity": 2, "value": 180,  "location": "pond",  "minLevel": 8,  "season": [],             "time": "night",     "behavior": "erratic" },
  "axolotl":       { "name": "Axolotl",       "rarity": 3, "value": 800,  "location": "pond",  "minLevel": 15, "season": [1],            "time": "night",     "behavior": "wiggle" },
  "legend_carp":   { "name": "Legend Carp",   "rarity": 3, "value": 1000, "location": "pond",  "minLevel": 20, "season": [0],            "time": "rain",      "behavior": "dash" },

  "chub":          { "name": "Chub",          "rarity": 0, "value": 18,   "location": "river", "minLevel": 1,  "season": [],             "time": "any",       "behavior": "sine" },
  "trout":         { "name": "Trout",         "rarity": 0, "value": 25,   "location": "river", "minLevel": 1,  "season": [],             "time": "any",       "behavior": "sine" },
  "shiner":        { "name": "Shiner",        "rarity": 0, "value": 16,   "location": "river", "minLevel": 1,  "season": [0, 1],         "time": "day",       "behavior": "sine" },
  "salmon":        { "name": "Salmon",        "rarity": 1, "value": 50,   "location": "river", "minLevel": 3,  "season": [2],            "time": "any",       "behavior": "dart" },
  "pike":          { "name": "Pike",          "rarity": 1, "value": 55,   "location": "river", "minLevel": 4,  "season": [3],            "time": "any",       "behavior": "dart" },
  "walleye":       { "name": "Walleye",       "rarity": 1, "value": 60,   "location": "river", "minLevel": 5,  "season": [2],            "time": "night",     "behavior": "dart" },
  "rainbow_trout": { "name": "Rainbow Trout", "rarity": 1, "value": 65,   "location": "river", "minLevel": 5,  "season": [1],            "time": "rain",      "behavior": "dart" },
  "sturgeon":      { "name": "Sturgeon",      "rarity": 2, "value": 120,  "location": "river", "minLevel": 7,  "season": [1, 3],         "time": "any",       "behavior": "erratic" },
  "tiger_trout":   { "name": "Tiger Trout",   "rarity": 2, "value": 150,  "location": "river", "minLevel": 8,  "season": [2, 3],         "time": "any",       "behavior": "erratic" },
  "electric_eel":  { "name": "Electric Eel",  "rarity": 2, "value": 180,  "location": "river", "minLevel": 10, "season": [],             "time": "night+rain","behavior": "erratic" },
  "glacier_pike":  { "name": "Glacier Pike",  "rarity": 3, "value": 900,  "location": "river", "minLevel": 18, "season": [3],            "time": "any",       "behavior": "stall" },
  "river_king":    { "name": "River King",    "rarity": 3, "value": 1200, "location": "river", "minLevel": 25, "season": [],             "time": "rain",      "behavior": "king" },

  "sardine":       { "name": "Sardine",       "rarity": 0, "value": 12,   "location": "ocean", "minLevel": 1,  "season": [],             "time": "any",       "behavior": "sine" },
  "anchovy":       { "name": "Anchovy",       "rarity": 0, "value": 14,   "location": "ocean", "minLevel": 1,  "season": [],             "time": "any",       "behavior": "sine" },
  "sea_bass":      { "name": "Sea Bass",      "rarity": 0, "value": 28,   "location": "ocean", "minLevel": 2,  "season": [],             "time": "any",       "behavior": "sine" },
  "red_snapper":   { "name": "Red Snapper",   "rarity": 1, "value": 55,   "location": "ocean", "minLevel": 4,  "season": [1, 2],         "time": "any",       "behavior": "dart" },
  "tuna":          { "name": "Tuna",          "rarity": 1, "value": 70,   "location": "ocean", "minLevel": 6,  "season": [],             "time": "any",       "behavior": "dart" },
  "lobster":       { "name": "Lobster",       "rarity": 1, "value": 80,   "location": "ocean", "minLevel": 6,  "season": [],             "time": "any",       "behavior": "dart" },
  "octopus":       { "name": "Octopus",       "rarity": 2, "value": 140,  "location": "ocean", "minLevel": 9,  "season": [1],            "time": "day",       "behavior": "erratic" },
  "swordfish":     { "name": "Swordfish",     "rarity": 2, "value": 150,  "location": "ocean", "minLevel": 10, "season": [],             "time": "any",       "behavior": "sword" },
  "anglerfish":    { "name": "Anglerfish",    "rarity": 2, "value": 500,  "location": "ocean", "minLevel": 15, "season": [],             "time": "night",     "behavior": "lure" },
  "moonfish":      { "name": "Moonfish",      "rarity": 3, "value": 1500, "location": "ocean", "minLevel": 22, "season": [],             "time": "night",     "behavior": "phase" },
  "leviathan":     { "name": "Leviathan",     "rarity": 3, "value": 2000, "location": "ocean", "minLevel": 30, "season": [3],            "time": "night+rain","behavior": "beast" }
}
```

**Data conventions:**
- `season`: empty array `[]` = any season. Values: `0`=Spring, `1`=Summer, `2`=Fall, `3`=Winter (matches `SEASONS` constants)
- `time`: `"any"` | `"day"` | `"night"` | `"rain"` | `"night+rain"`
- `behavior`: `"sine"` (Common gentle), `"dart"` (Uncommon), `"erratic"` (Rare), or legendary unique: `"dash"`, `"lure"`, `"sword"`, `"wiggle"`, `"stall"`, `"king"`, `"phase"`, `"beast"`

**Step 2: Commit**

```bash
git add server/data/fish.json
git commit -m "data: expand fish.json to 35 species with season/time/behavior"
```

---

## Task 2: Enhanced FishCalculator

**Files:**
- Modify: `server/entities/Fish.js`

**Step 1: Rewrite FishCalculator with season/time/bait/behavior support**

Replace the entire contents of `server/entities/Fish.js` with:

```javascript
// server/entities/Fish.js
export class FishCalculator {
  constructor(fishData) {
    this.fishData = fishData;
    this.allFish = Object.entries(fishData);
  }

  /**
   * Roll a fish catch with full filtering.
   * @param {string} location - 'pond', 'river', or 'ocean'
   * @param {number} playerLevel - sum of all skill levels
   * @param {number} fishingLevel - fishing skill level specifically
   * @param {number} rodTier - 0=basic, 1=fiberglass, 2=iridium (maps to toolTiers.fishing_rod)
   * @param {object} baitInfo - { rarityBoost, ignoreRestrictions } or null
   * @param {number} season - current season (0-3) or -1 for any
   * @param {number} hour - current game hour (0-24)
   * @param {boolean} isRaining - whether it's currently raining
   * @returns {{ id, name, rarity, value, behavior, ... } | null}
   */
  rollCatch(location, playerLevel, fishingLevel = 0, rodTier = 0, baitInfo = null, season = -1, hour = 12, isRaining = false) {
    const ignoreRestrictions = baitInfo?.ignoreRestrictions || false;

    const available = this.allFish.filter(([, f]) => {
      if (f.location !== location) return false;
      if (f.minLevel > fishingLevel) return false;

      // Season filter (empty array = any season)
      if (!ignoreRestrictions && f.season.length > 0 && !f.season.includes(season)) {
        return false;
      }

      // Time filter
      if (!ignoreRestrictions && f.time !== 'any') {
        const isDay = hour >= 6 && hour < 20;
        const isNight = !isDay;

        if (f.time === 'day' && !isDay) return false;
        if (f.time === 'night' && !isNight) return false;
        if (f.time === 'rain' && !isRaining) return false;
        if (f.time === 'night+rain' && (!isNight || !isRaining)) return false;
      }

      return true;
    });

    if (available.length === 0) return null;

    // Calculate weights with bait rarity boost
    const rarityBoost = baitInfo?.rarityBoost || 0;
    const weights = available.map(([id, f]) => {
      // Base weight by rarity (higher = more common)
      let weight = [1.0, 0.3, 0.1, 0.02][f.rarity] || 0.5;

      // Bait boosts uncommon+ chances
      if (f.rarity >= 1 && rarityBoost > 0) {
        weight *= (1 + rarityBoost);
      }

      return { id, fish: f, weight };
    });

    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const w of weights) {
      roll -= w.weight;
      if (roll <= 0) return { id: w.id, ...w.fish };
    }
    return { id: weights[0].id, ...weights[0].fish };
  }

  /**
   * Calculate the wait time and nibble count for a bite.
   * @param {number} rarity - fish rarity (0-3)
   * @returns {{ waitTime: number, nibbles: number }}
   */
  rollBiteParams(rarity) {
    // Rarer fish take longer to bite, more fake nibbles
    const baseWait = 2 + rarity * 0.5;
    const waitVariance = 1 + Math.random() * 2;
    const waitTime = baseWait + waitVariance;
    const nibbles = 1 + Math.floor(Math.random() * (1 + rarity));
    return { waitTime, nibbles };
  }
}
```

**Step 2: Commit**

```bash
git add server/entities/Fish.js
git commit -m "feat: enhance FishCalculator with season/time/bait filtering"
```

---

## Task 3: Server Fishing Flow (Two-Phase)

**Files:**
- Modify: `server/game/GameWorld.js:570-595` (replace `handleFishCast`)
- Modify: `server/game/GameWorld.js` (add `handleFishReel`)
- Modify: `server/index.js:145` (wire `FISH_REEL`)

**Step 1: Rewrite handleFishCast to send bite data instead of instant catch**

In `server/game/GameWorld.js`, replace the entire `handleFishCast` method (lines 570-595) with:

```javascript
  handleFishCast(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || !player.useEnergy(5)) return;

    // Prevent casting while already fishing
    if (player._fishingState) return;

    const map = this._getPlayerMap(player);
    const tileX = Math.floor(data.x);
    const tileZ = Math.floor(data.z);
    const idx = tileIndex(tileX, tileZ);
    if (idx < 0 || idx >= map.tiles.length) return;
    if (map.tiles[idx].type !== TILE_TYPES.WATER) return;

    // Determine water location type
    const location = this._getWaterLocation(player.currentMap, tileX, tileZ);

    // Get fishing parameters
    const fishingLevel = player.getSkillLevel(SKILLS.FISHING);
    const rodTier = player.toolTiers?.fishing_rod || 0;
    const baitInfo = null; // Future: read from equipped bait slot
    const season = this.time.season;
    const hour = this.time.hour;
    const isRaining = this.weather.isRaining();

    // Roll which fish bites
    const fish = this.fishCalc.rollCatch(
      location, player.level, fishingLevel, rodTier, baitInfo, season, hour, isRaining
    );

    if (!fish) {
      // No fish available — immediate miss
      this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
        type: 'fishMiss', playerId: player.id,
      });
      return;
    }

    // Roll bite timing
    const { waitTime, nibbles } = this.fishCalc.rollBiteParams(fish.rarity);

    // Store fishing state on player (server tracks what fish was rolled)
    player._fishingState = {
      fishId: fish.id,
      fish,
      location,
      castTime: Date.now(),
    };

    // Send bite data to client — client plays wait/nibble/bite sequence, then mini-game
    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'fishingBite',
      playerId: player.id,
      fishId: fish.id,
      fishName: fish.name,
      rarity: fish.rarity,
      behavior: fish.behavior,
      waitTime,
      nibbles,
      // Net size modifiers for the catch bar
      rodTier,
      fishingLevel,
      baitNetBonus: 0, // Future: from bait
    });

    // Broadcast cast animation to other players
    this._broadcastToMap(player.currentMap, ACTIONS.WORLD_UPDATE, {
      type: 'playerCast', playerId: player.id, x: data.x, z: data.z,
    }, socketId);
  }

  handleFishReel(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    const state = player._fishingState;
    if (!state) return;

    // Clear fishing state
    player._fishingState = null;

    if (data.success) {
      // Award the fish
      player.addItem(state.fishId, 1);

      // XP scales with rarity
      const xp = 5 + state.fish.rarity * 10;
      player.addSkillXP(SKILLS.FISHING, xp);
      this._checkPendingProfession(socketId, player);

      this._broadcastToMap(player.currentMap, ACTIONS.WORLD_UPDATE, {
        type: 'fishCaught', playerId: player.id, fish: state.fish,
      });
      this._sendInventoryUpdate(socketId, player);
    } else {
      this._broadcastToMap(player.currentMap, ACTIONS.WORLD_UPDATE, {
        type: 'fishMiss', playerId: player.id,
      });
    }
  }

  /** Determine water location type based on map */
  _getWaterLocation(mapId, tileX, tileZ) {
    if (mapId === MAP_IDS.FARM) return 'pond';
    if (mapId === MAP_IDS.TOWN) return 'river';
    return 'pond'; // default
  }
```

**Step 2: Wire FISH_REEL in server/index.js**

In `server/index.js`, after the `FISH_CAST` line (line 145), add:

```javascript
  wrap(ACTIONS.FISH_REEL, (data) => world.handleFishReel(socket.id, data));
```

**Step 3: Commit**

```bash
git add server/game/GameWorld.js server/index.js
git commit -m "feat: two-phase fishing flow with bite data and reel handler"
```

---

## Task 4: Update NetworkClient

**Files:**
- Modify: `client/src/network/NetworkClient.js:71`

**Step 1: Update sendFishReel to accept success parameter**

In `client/src/network/NetworkClient.js`, replace line 71:

```javascript
  sendFishReel() { this.socket.emit(ACTIONS.FISH_REEL); }
```

With:

```javascript
  sendFishReel(success) { this.socket.emit(ACTIONS.FISH_REEL, { success }); }
```

**Step 2: Add sendFishCancel method** (same line area)

After the sendFishReel line, add:

```javascript
  sendFishCancel() { this.socket.emit(ACTIONS.FISH_REEL, { success: false }); }
```

**Step 3: Commit**

```bash
git add client/src/network/NetworkClient.js
git commit -m "feat: update sendFishReel to send success/failure"
```

---

## Task 5: FishingEffects — Three.js Bobber, Ripples, Splash

**Files:**
- Create: `client/src/effects/FishingEffects.js`

**Step 1: Create FishingEffects.js**

This class manages all in-world 3D effects for the fishing sequence: bobber mesh, ripple rings, splash particles, and the catch/miss outcome animations.

```javascript
// client/src/effects/FishingEffects.js
// Manages in-world 3D fishing effects: bobber, ripples, splash, catch arc.

import * as THREE from 'three';

export class FishingEffects {
  constructor(scene) {
    this.scene = scene;
    this._bobber = null;
    this._line = null;
    this._ripples = [];
    this._splashParticles = [];
    this._exclamation = null;
    this._catchArc = null;
    this._elapsed = 0;
    this._state = 'idle'; // 'idle' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'result'
    this._castStart = 0;
    this._castDuration = 0.5;
    this._playerPos = null;
    this._targetPos = null;
  }

  /**
   * Start the cast sequence: bobber arcs from player to water tile.
   * @param {THREE.Vector3} playerPos - player world position
   * @param {{ x: number, z: number }} target - water tile world position
   */
  startCast(playerPos, target) {
    this.cleanup();
    this._playerPos = playerPos.clone();
    this._targetPos = new THREE.Vector3(target.x, -0.05, target.z);
    this._state = 'casting';
    this._castStart = this._elapsed;

    // Create bobber (small red/white sphere)
    const bobberGeo = new THREE.SphereGeometry(0.04, 8, 6);
    const bobberMat = new THREE.MeshPhongMaterial({ color: 0xff3333 });
    this._bobber = new THREE.Mesh(bobberGeo, bobberMat);
    this._bobber.position.copy(this._playerPos);
    this._bobber.position.y = 1.0; // starts at player hand height
    this.scene.add(this._bobber);

    // Create fishing line (thin line from player to bobber)
    const lineMat = new THREE.LineBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.6 });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      this._playerPos.clone().setY(1.0),
      this._bobber.position.clone(),
    ]);
    this._line = new THREE.Line(lineGeo, lineMat);
    this.scene.add(this._line);
  }

  /** Transition to waiting state (bobber bobs on water) */
  _enterWaiting() {
    this._state = 'waiting';
    if (this._bobber) {
      this._bobber.position.copy(this._targetPos);
      this._bobber.position.y = 0.02;
    }
    // Landing ripple
    this._spawnRipple(this._targetPos.x, this._targetPos.z);
  }

  /** Play a nibble animation (bobber dips briefly) */
  playNibble() {
    if (!this._bobber) return;
    // Small dip — handled in update via transient flag
    this._nibbleTimer = 0.3;
    this._spawnRipple(this._targetPos.x, this._targetPos.z, 0.06);
  }

  /** Play the bite animation (bobber plunges, splash, exclamation) */
  playBite() {
    this._state = 'bite';
    if (this._bobber) {
      this._bobber.position.y = -0.08;
    }
    // Splash burst
    this._spawnSplash(this._targetPos.x, this._targetPos.z);

    // Exclamation mark above bobber
    this._spawnExclamation(this._targetPos.x, this._targetPos.z);
  }

  /** Play catch success animation (fish arcs from water to player) */
  playCatch(fishColor = 0x4488ff) {
    this._state = 'result';

    // Small fish mesh arcs from water to player
    const fishGeo = new THREE.ConeGeometry(0.03, 0.1, 4);
    fishGeo.rotateZ(Math.PI / 2);
    const fishMat = new THREE.MeshPhongMaterial({ color: fishColor });
    this._catchArc = new THREE.Mesh(fishGeo, fishMat);
    this._catchArc.position.copy(this._targetPos);
    this._catchArc.position.y = 0;
    this.scene.add(this._catchArc);

    this._catchArcTimer = 0;
    this._catchArcDuration = 0.6;

    // Spawn sparkle particles at catch point
    this._spawnSparkles(this._targetPos.x, this._targetPos.z);

    // Remove bobber and line
    this._removeBobber();
  }

  /** Play miss animation (splash, retract line) */
  playMiss() {
    this._state = 'result';
    this._spawnSplash(this._targetPos.x, this._targetPos.z);
    this._removeBobber();
    // Auto-cleanup after splash fades
    setTimeout(() => this.cleanup(), 1000);
  }

  /** Cancel the cast (right-click or escape) */
  cancel() {
    this.cleanup();
  }

  /** Per-frame update */
  update(delta) {
    this._elapsed += delta;

    // Cast arc animation
    if (this._state === 'casting') {
      const t = Math.min((this._elapsed - this._castStart) / this._castDuration, 1);
      if (this._bobber) {
        // Parabolic arc from player to target
        const startY = 1.0;
        const endY = 0.02;
        const arcHeight = 1.5;
        const y = startY + (endY - startY) * t + arcHeight * Math.sin(t * Math.PI);

        this._bobber.position.lerpVectors(
          new THREE.Vector3(this._playerPos.x, 0, this._playerPos.z),
          new THREE.Vector3(this._targetPos.x, 0, this._targetPos.z),
          t
        );
        this._bobber.position.y = y;
      }
      this._updateLine();

      if (t >= 1) {
        this._enterWaiting();
      }
    }

    // Waiting: gentle bob
    if (this._state === 'waiting' && this._bobber) {
      const bob = Math.sin(this._elapsed * 2) * 0.01;
      this._bobber.position.y = 0.02 + bob;

      // Nibble dip
      if (this._nibbleTimer > 0) {
        this._nibbleTimer -= delta;
        this._bobber.position.y -= 0.03 * Math.max(0, this._nibbleTimer / 0.3);
      }

      this._updateLine();
    }

    // Catch arc animation
    if (this._catchArc && this._playerPos) {
      this._catchArcTimer += delta;
      const t = Math.min(this._catchArcTimer / this._catchArcDuration, 1);
      const arcHeight = 1.2;
      const y = arcHeight * Math.sin(t * Math.PI);

      this._catchArc.position.lerpVectors(
        this._targetPos,
        this._playerPos,
        t
      );
      this._catchArc.position.y = y;
      this._catchArc.rotation.z += delta * 8;

      if (t >= 1) {
        this.scene.remove(this._catchArc);
        this._catchArc.geometry.dispose();
        this._catchArc.material.dispose();
        this._catchArc = null;
        this.cleanup();
      }
    }

    // Update ripples
    for (let i = this._ripples.length - 1; i >= 0; i--) {
      const r = this._ripples[i];
      r.timer += delta;
      const t = r.timer / r.duration;
      if (t >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this._ripples.splice(i, 1);
      } else {
        const scale = 1 + t * 3;
        r.mesh.scale.set(scale, scale, 1);
        r.mesh.material.opacity = (1 - t) * 0.4;
      }
    }

    // Update splash particles
    for (let i = this._splashParticles.length - 1; i >= 0; i--) {
      const p = this._splashParticles[i];
      p.timer += delta;
      const t = p.timer / p.duration;
      if (t >= 1) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this._splashParticles.splice(i, 1);
      } else {
        p.mesh.position.x += p.vx * delta;
        p.mesh.position.y += p.vy * delta;
        p.mesh.position.z += p.vz * delta;
        p.vy -= 3 * delta; // gravity
        p.mesh.material.opacity = 1 - t;
        const s = 1 - t * 0.5;
        p.mesh.scale.set(s, s, s);
      }
    }

    // Update exclamation
    if (this._exclamation) {
      this._exclamation.timer += delta;
      if (this._exclamation.timer > 0.8) {
        this.scene.remove(this._exclamation.mesh);
        this._exclamation.mesh.geometry.dispose();
        this._exclamation.mesh.material.dispose();
        this._exclamation = null;
      } else {
        // Pulse scale
        const pulse = 1 + Math.sin(this._exclamation.timer * 12) * 0.15;
        this._exclamation.mesh.scale.set(pulse, pulse, pulse);
      }
    }
  }

  // --- Internal helpers ---

  _updateLine() {
    if (this._line && this._bobber && this._playerPos) {
      const positions = this._line.geometry.attributes.position;
      positions.setXYZ(0, this._playerPos.x, 1.0, this._playerPos.z);
      positions.setXYZ(1, this._bobber.position.x, this._bobber.position.y, this._bobber.position.z);
      positions.needsUpdate = true;
    }
  }

  _spawnRipple(x, z, size = 0.1) {
    const geo = new THREE.RingGeometry(size * 0.3, size, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xaaddff, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.01, z);
    this.scene.add(mesh);
    this._ripples.push({ mesh, timer: 0, duration: 1.0 });
  }

  _spawnSplash(x, z) {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.015, 4, 3);
      const mat = new THREE.MeshPhongMaterial({ color: 0xeeffff, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (i / count) * Math.PI * 2;
      const speed = 0.5 + Math.random() * 0.5;
      mesh.position.set(x, 0.05, z);
      this.scene.add(mesh);
      this._splashParticles.push({
        mesh,
        timer: 0,
        duration: 0.6,
        vx: Math.cos(angle) * speed,
        vy: 1.5 + Math.random(),
        vz: Math.sin(angle) * speed,
      });
    }
  }

  _spawnSparkles(x, z) {
    const count = 4;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.01, 4, 3);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (i / count) * Math.PI * 2;
      mesh.position.set(x, 0.1, z);
      this.scene.add(mesh);
      this._splashParticles.push({
        mesh,
        timer: 0,
        duration: 0.8,
        vx: Math.cos(angle) * 0.3,
        vy: 0.8 + Math.random() * 0.5,
        vz: Math.sin(angle) * 0.3,
      });
    }
  }

  _spawnExclamation(x, z) {
    // Simple "!" made from a stretched box + small sphere
    const group = new THREE.Group();
    const barGeo = new THREE.BoxGeometry(0.04, 0.12, 0.04);
    const barMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.y = 0.06;
    group.add(bar);

    const dotGeo = new THREE.SphereGeometry(0.025, 4, 3);
    const dot = new THREE.Mesh(dotGeo, barMat);
    dot.position.y = -0.04;
    group.add(dot);

    group.position.set(x, 0.6, z);
    this.scene.add(group);

    this._exclamation = { mesh: group, timer: 0 };
  }

  _removeBobber() {
    if (this._bobber) {
      this.scene.remove(this._bobber);
      this._bobber.geometry.dispose();
      this._bobber.material.dispose();
      this._bobber = null;
    }
    if (this._line) {
      this.scene.remove(this._line);
      this._line.geometry.dispose();
      this._line.material.dispose();
      this._line = null;
    }
  }

  /** Full cleanup — removes all effects */
  cleanup() {
    this._removeBobber();
    this._state = 'idle';
    this._nibbleTimer = 0;

    for (const r of this._ripples) {
      this.scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
    }
    this._ripples = [];

    for (const p of this._splashParticles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    this._splashParticles = [];

    if (this._exclamation) {
      this.scene.remove(this._exclamation.mesh);
      this._exclamation.mesh.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
      this._exclamation = null;
    }

    if (this._catchArc) {
      this.scene.remove(this._catchArc);
      this._catchArc.geometry.dispose();
      this._catchArc.material.dispose();
      this._catchArc = null;
    }
  }

  get isFishing() {
    return this._state !== 'idle';
  }

  dispose() {
    this.cleanup();
  }
}
```

**Step 2: Commit**

```bash
git add client/src/effects/FishingEffects.js
git commit -m "feat: add FishingEffects with bobber, ripples, splash particles"
```

---

## Task 6: FishingUI — Catch Bar Mini-Game

**Files:**
- Create: `client/src/ui/FishingUI.js`

**Step 1: Create FishingUI.js**

This is the Stardew-style vertical catch bar mini-game. It creates its own DOM elements, runs its own `requestAnimationFrame` game loop, and resolves a promise with `true` (caught) or `false` (missed).

```javascript
// client/src/ui/FishingUI.js
// Stardew-style vertical catch bar mini-game.
// Runs its own animation loop. Returns a promise that resolves true/false.

const TRACK_HEIGHT = 280;
const TRACK_WIDTH = 36;
const FILL_RATE = 0.015;        // progress per frame when fish in net
const STARTING_PROGRESS = 0.3;

// Rarity configs: [netSizeFraction, fishSpeed, drainRate]
const RARITY_CONFIG = {
  0: { netSize: 0.40, fishSpeed: 60,  drainRate: 0.008,  label: 'Common',    color: '#888' },
  1: { netSize: 0.30, fishSpeed: 100, drainRate: 0.012,  label: 'Uncommon',  color: '#4a4' },
  2: { netSize: 0.22, fishSpeed: 160, drainRate: 0.016,  label: 'Rare',      color: '#48f' },
  3: { netSize: 0.15, fishSpeed: 220, drainRate: 0.024,  label: 'Legendary', color: '#f84' },
};

// Physics
const LIFT_ACCEL = 800;
const GRAVITY = 600;
const DAMPING = 0.92;

export class FishingUI {
  constructor() {
    this._container = null;
    this._resolve = null;
    this._running = false;
    this._rafId = null;
    this._lastTime = 0;
  }

  /**
   * Start the mini-game.
   * @param {object} fishData - { fishName, rarity, behavior, rodTier, fishingLevel, baitNetBonus }
   * @returns {Promise<boolean>} true if caught, false if missed
   */
  start(fishData) {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._fishData = fishData;

      const config = RARITY_CONFIG[fishData.rarity] || RARITY_CONFIG[0];

      // Net size with bonuses
      const rodBonus = [0, 0.15, 0.30][fishData.rodTier] || 0;
      const levelBonus = Math.min(fishData.fishingLevel * 0.01, 0.30);
      const baitBonus = fishData.baitNetBonus || 0;
      const totalNetFraction = Math.min(config.netSize + rodBonus + levelBonus + baitBonus, 0.70);
      const netHeight = TRACK_HEIGHT * totalNetFraction;

      // State
      this._netPos = TRACK_HEIGHT / 2 - netHeight / 2; // start centered
      this._netVelocity = 0;
      this._netHeight = netHeight;
      this._fishPos = TRACK_HEIGHT * 0.3; // fish starts lower
      this._fishVelocity = 0;
      this._progress = STARTING_PROGRESS;
      this._config = config;
      this._holding = false;
      this._fishTimer = 0;
      this._behaviorState = {};

      // Build DOM
      this._buildUI(fishData, config, netHeight);

      // Input handlers
      this._onMouseDown = () => { this._holding = true; };
      this._onMouseUp = () => { this._holding = false; };
      this._onKeyDown = (e) => {
        if (e.code === 'Space') { e.preventDefault(); this._holding = true; }
        if (e.code === 'Escape') this._endGame(false);
      };
      this._onKeyUp = (e) => {
        if (e.code === 'Space') this._holding = false;
      };

      window.addEventListener('mousedown', this._onMouseDown);
      window.addEventListener('mouseup', this._onMouseUp);
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);

      // Start loop
      this._running = true;
      this._lastTime = performance.now();
      this._rafId = requestAnimationFrame((t) => this._loop(t));
    });
  }

  _buildUI(fishData, config, netHeight) {
    // Container
    this._container = document.createElement('div');
    this._container.className = 'fishing-panel';
    this._container.innerHTML = `
      <div class="fishing-header">
        <div class="fishing-fish-name" style="color: ${config.color}">${fishData.fishName}</div>
        <div class="fishing-rarity">${config.label}</div>
      </div>
      <div class="fishing-track-wrapper">
        <div class="fishing-track" style="width: ${TRACK_WIDTH}px; height: ${TRACK_HEIGHT}px;">
          <div class="fishing-net" style="height: ${netHeight}px;"></div>
          <div class="fishing-fish-icon"></div>
        </div>
      </div>
      <div class="fishing-progress-wrapper">
        <div class="fishing-progress-bar"></div>
      </div>
      <div class="fishing-hint">Hold SPACE or CLICK to reel</div>
    `;

    document.getElementById('ui-overlay').appendChild(this._container);

    // Cache DOM refs
    this._netEl = this._container.querySelector('.fishing-net');
    this._fishEl = this._container.querySelector('.fishing-fish-icon');
    this._progressEl = this._container.querySelector('.fishing-progress-bar');

    // Slide in animation
    requestAnimationFrame(() => {
      this._container.classList.add('fishing-panel-visible');
    });
  }

  _loop(now) {
    if (!this._running) return;

    const delta = Math.min((now - this._lastTime) / 1000, 0.05); // cap at 50ms
    this._lastTime = now;

    this._updateNet(delta);
    this._updateFish(delta);
    this._updateProgress(delta);
    this._render();

    // Check win/lose
    if (this._progress >= 1) {
      this._endGame(true);
      return;
    }
    if (this._progress <= 0) {
      this._endGame(false);
      return;
    }

    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  _updateNet(delta) {
    if (this._holding) {
      this._netVelocity += LIFT_ACCEL * delta;
    } else {
      this._netVelocity -= GRAVITY * delta;
    }
    this._netVelocity *= DAMPING;
    // Note: position 0 = bottom, TRACK_HEIGHT = top
    this._netPos += this._netVelocity * delta;
    this._netPos = Math.max(0, Math.min(TRACK_HEIGHT - this._netHeight, this._netPos));
  }

  _updateFish(delta) {
    this._fishTimer += delta;
    const config = this._config;
    const speed = config.fishSpeed;
    const behavior = this._fishData.behavior;

    // Fish position target based on behavior pattern
    let target;
    switch (behavior) {
      case 'sine':
        target = TRACK_HEIGHT * 0.5 + Math.sin(this._fishTimer * 1.5) * TRACK_HEIGHT * 0.3;
        break;

      case 'dart': {
        // Sine with occasional darts
        const base = TRACK_HEIGHT * 0.5 + Math.sin(this._fishTimer * 2) * TRACK_HEIGHT * 0.25;
        if (Math.sin(this._fishTimer * 5.7) > 0.9) {
          target = Math.random() * TRACK_HEIGHT;
        } else {
          target = base;
        }
        break;
      }

      case 'erratic':
        // Changes direction frequently
        if (!this._behaviorState.nextChange || this._fishTimer > this._behaviorState.nextChange) {
          this._behaviorState.erraticTarget = Math.random() * TRACK_HEIGHT;
          this._behaviorState.nextChange = this._fishTimer + 0.3 + Math.random() * 0.5;
        }
        target = this._behaviorState.erraticTarget;
        break;

      // Legendary behaviors
      case 'dash': // Legend Carp — holds still then rockets
        if (!this._behaviorState.dashPhase) {
          this._behaviorState.dashPhase = 'hold';
          this._behaviorState.dashTimer = 0;
          this._behaviorState.dashTarget = this._fishPos;
        }
        this._behaviorState.dashTimer += delta;
        if (this._behaviorState.dashPhase === 'hold') {
          target = this._behaviorState.dashTarget;
          if (this._behaviorState.dashTimer > 1 + Math.random()) {
            this._behaviorState.dashPhase = 'rocket';
            this._behaviorState.dashTimer = 0;
            this._behaviorState.dashTarget = this._fishPos > TRACK_HEIGHT / 2 ? TRACK_HEIGHT * 0.1 : TRACK_HEIGHT * 0.9;
          }
        } else {
          target = this._behaviorState.dashTarget;
          if (Math.abs(this._fishPos - target) < 10 || this._behaviorState.dashTimer > 0.5) {
            this._behaviorState.dashPhase = 'hold';
            this._behaviorState.dashTimer = 0;
            this._behaviorState.dashTarget = this._fishPos;
          }
        }
        break;

      case 'lure': // Anglerfish — drifts toward net then snaps away
        if (!this._behaviorState.lurePhase) {
          this._behaviorState.lurePhase = 'drift';
          this._behaviorState.lureTimer = 0;
        }
        this._behaviorState.lureTimer += delta;
        if (this._behaviorState.lurePhase === 'drift') {
          target = this._netPos + this._netHeight / 2; // drift toward net center
          if (this._behaviorState.lureTimer > 2) {
            this._behaviorState.lurePhase = 'snap';
            this._behaviorState.lureTimer = 0;
            this._behaviorState.snapTarget = this._fishPos > TRACK_HEIGHT / 2 ? 0 : TRACK_HEIGHT;
          }
        } else {
          target = this._behaviorState.snapTarget;
          if (this._behaviorState.lureTimer > 0.5) {
            this._behaviorState.lurePhase = 'drift';
            this._behaviorState.lureTimer = 0;
          }
        }
        break;

      case 'sword': // Swordfish — sharp linear cuts with pauses
        if (!this._behaviorState.swordTarget) {
          this._behaviorState.swordTarget = Math.random() * TRACK_HEIGHT;
          this._behaviorState.swordPause = 0;
        }
        if (Math.abs(this._fishPos - this._behaviorState.swordTarget) < 5) {
          this._behaviorState.swordPause += delta;
          if (this._behaviorState.swordPause > 0.3) {
            this._behaviorState.swordTarget = Math.random() * TRACK_HEIGHT;
            this._behaviorState.swordPause = 0;
          }
        }
        target = this._behaviorState.swordTarget;
        break;

      case 'wiggle': // Axolotl — rapid small oscillations, occasional freeze
        if (Math.sin(this._fishTimer * 3) > 0.85) {
          target = this._fishPos; // freeze
        } else {
          target = this._fishPos + Math.sin(this._fishTimer * 20) * 30;
        }
        break;

      case 'stall': // Glacier Pike — normal then sudden stop then dart
        if (!this._behaviorState.stallPhase) {
          this._behaviorState.stallPhase = 'move';
          this._behaviorState.stallTimer = 0;
        }
        this._behaviorState.stallTimer += delta;
        if (this._behaviorState.stallPhase === 'move') {
          target = TRACK_HEIGHT * 0.5 + Math.sin(this._fishTimer * 2) * TRACK_HEIGHT * 0.3;
          if (this._behaviorState.stallTimer > 1.5 + Math.random()) {
            this._behaviorState.stallPhase = 'stop';
            this._behaviorState.stallTimer = 0;
          }
        } else if (this._behaviorState.stallPhase === 'stop') {
          target = this._fishPos; // freeze in place
          if (this._behaviorState.stallTimer > 0.5) {
            this._behaviorState.stallPhase = 'dart';
            this._behaviorState.stallTimer = 0;
            this._behaviorState.dartTarget = Math.random() * TRACK_HEIGHT;
          }
        } else {
          target = this._behaviorState.dartTarget;
          if (this._behaviorState.stallTimer > 0.4) {
            this._behaviorState.stallPhase = 'move';
            this._behaviorState.stallTimer = 0;
          }
        }
        break;

      case 'king': // River King — smooth, relentless, gradually faster
        target = TRACK_HEIGHT * 0.5 + Math.sin(this._fishTimer * (1.5 + this._fishTimer * 0.1)) * TRACK_HEIGHT * 0.4;
        break;

      case 'phase': // Moonfish — teleports every 2-3s
        if (!this._behaviorState.phaseTimer) this._behaviorState.phaseTimer = 0;
        this._behaviorState.phaseTimer += delta;
        if (this._behaviorState.phaseTimer > 2 + Math.random()) {
          this._fishPos = Math.random() * TRACK_HEIGHT;
          this._behaviorState.phaseTimer = 0;
        }
        target = this._fishPos; // stays where it teleported
        break;

      case 'beast': // Leviathan — combines patterns randomly
        if (!this._behaviorState.beastPattern || this._behaviorState.beastTimer > 2) {
          const patterns = ['dash', 'erratic', 'stall', 'phase'];
          this._behaviorState.beastPattern = patterns[Math.floor(Math.random() * patterns.length)];
          this._behaviorState.beastTimer = 0;
        }
        this._behaviorState.beastTimer = (this._behaviorState.beastTimer || 0) + delta;
        // Fall through to erratic as default
        if (!this._behaviorState.nextChange || this._fishTimer > this._behaviorState.nextChange) {
          this._behaviorState.erraticTarget = Math.random() * TRACK_HEIGHT;
          this._behaviorState.nextChange = this._fishTimer + 0.2 + Math.random() * 0.3;
        }
        target = this._behaviorState.erraticTarget;
        break;

      default:
        target = TRACK_HEIGHT * 0.5 + Math.sin(this._fishTimer * 1.5) * TRACK_HEIGHT * 0.3;
    }

    // Move fish toward target
    const diff = target - this._fishPos;
    const moveSpeed = behavior === 'dash' && this._behaviorState?.dashPhase === 'rocket' ? speed * 3 :
                      behavior === 'lure' && this._behaviorState?.lurePhase === 'snap' ? speed * 2.5 :
                      speed;
    this._fishPos += Math.sign(diff) * Math.min(Math.abs(diff), moveSpeed * delta);
    this._fishPos = Math.max(0, Math.min(TRACK_HEIGHT - 12, this._fishPos));
  }

  _updateProgress(delta) {
    const fishCenter = this._fishPos + 6; // fish icon is ~12px tall
    const inNet = fishCenter >= this._netPos && fishCenter <= this._netPos + this._netHeight;

    if (inNet) {
      this._progress += FILL_RATE;
    } else {
      this._progress -= this._config.drainRate;
    }
    this._progress = Math.max(0, Math.min(1, this._progress));
  }

  _render() {
    if (!this._container) return;

    // Net position (CSS bottom = 0 is bottom of track)
    this._netEl.style.bottom = this._netPos + 'px';

    // Fish position
    this._fishEl.style.bottom = this._fishPos + 'px';

    // Progress bar width
    this._progressEl.style.width = (this._progress * 100) + '%';

    // Progress bar color
    if (this._progress < 0.2) {
      this._progressEl.style.background = '#f44';
    } else if (this._progress < 0.5) {
      this._progressEl.style.background = '#fa4';
    } else {
      this._progressEl.style.background = '#4c4';
    }

    // Fish in net indicator
    const fishCenter = this._fishPos + 6;
    const inNet = fishCenter >= this._netPos && fishCenter <= this._netPos + this._netHeight;
    this._netEl.classList.toggle('fishing-net-active', inNet);
  }

  _endGame(success) {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);

    // Remove input handlers
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);

    // Slide out animation
    if (this._container) {
      this._container.classList.remove('fishing-panel-visible');
      this._container.classList.add('fishing-panel-exit');
      setTimeout(() => {
        if (this._container && this._container.parentNode) {
          this._container.parentNode.removeChild(this._container);
        }
        this._container = null;
      }, 300);
    }

    if (this._resolve) {
      this._resolve(success);
      this._resolve = null;
    }
  }

  get visible() {
    return this._running;
  }

  dispose() {
    this._endGame(false);
  }
}
```

**Step 2: Commit**

```bash
git add client/src/ui/FishingUI.js
git commit -m "feat: add FishingUI catch bar mini-game"
```

---

## Task 7: Fishing UI CSS Styles

**Files:**
- Modify: `client/styles/game.css` (append fishing styles)
- Modify: `client/index.html` (add toast container)

**Step 1: Add fishing CSS to game.css**

Append the following to the end of `client/styles/game.css`:

```css
/* ═══════════════════════════════════════════
   FISHING MINI-GAME PANEL
   ═══════════════════════════════════════════ */

.fishing-panel {
  position: fixed;
  right: -160px;
  top: 50%;
  transform: translateY(-50%);
  width: 140px;
  background: rgba(30, 22, 14, 0.95);
  border: 2px solid #8b6914;
  border-radius: 12px;
  padding: 12px;
  z-index: 150;
  pointer-events: auto;
  transition: right 0.3s ease-out;
  box-shadow:
    0 0 40px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.fishing-panel-visible {
  right: 20px;
}

.fishing-panel-exit {
  right: -160px;
  transition: right 0.3s ease-in;
}

.fishing-header {
  text-align: center;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(139, 105, 20, 0.3);
}

.fishing-fish-name {
  font-size: 14px;
  font-weight: 700;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}

.fishing-rarity {
  font-size: 10px;
  color: #c4956a;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.fishing-track-wrapper {
  display: flex;
  justify-content: center;
  margin: 8px 0;
}

.fishing-track {
  position: relative;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(139, 105, 20, 0.4);
  border-radius: 6px;
  overflow: hidden;
}

.fishing-net {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  background: rgba(60, 180, 80, 0.25);
  border: 1px solid rgba(60, 180, 80, 0.5);
  border-radius: 4px;
  transition: background 0.1s;
}

.fishing-net-active {
  background: rgba(60, 180, 80, 0.45);
  border-color: rgba(100, 255, 120, 0.7);
}

.fishing-fish-icon {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 12px;
  background: #f5d142;
  border-radius: 50% 50% 40% 40%;
  box-shadow: 0 0 6px rgba(245, 209, 66, 0.6);
}

.fishing-fish-icon::after {
  content: '';
  position: absolute;
  right: -6px;
  top: 2px;
  width: 0;
  height: 0;
  border-left: 8px solid #f5d142;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
}

.fishing-progress-wrapper {
  height: 8px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 8px;
  border: 1px solid rgba(139, 105, 20, 0.3);
}

.fishing-progress-bar {
  height: 100%;
  width: 30%;
  background: #4c4;
  border-radius: 3px;
  transition: width 0.05s linear;
}

.fishing-hint {
  text-align: center;
  font-size: 9px;
  color: rgba(196, 149, 106, 0.6);
  margin-top: 6px;
  letter-spacing: 0.5px;
}

/* ═══════════════════════════════════════════
   TOAST NOTIFICATIONS
   ═══════════════════════════════════════════ */

.toast-container {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 300;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.toast {
  background: rgba(30, 22, 14, 0.95);
  border: 1px solid #8b6914;
  border-radius: 8px;
  padding: 10px 20px;
  color: #f5e6d0;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(-10px);
  animation: toast-in 0.3s ease-out forwards, toast-out 0.3s ease-in 2.5s forwards;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

.toast-success {
  border-color: #4c4;
  color: #8f8;
}

.toast-fail {
  border-color: #c44;
  color: #faa;
}

@keyframes toast-in {
  to { opacity: 1; transform: translateY(0); }
}

@keyframes toast-out {
  to { opacity: 0; transform: translateY(-10px); }
}
```

**Step 2: Add toast container to index.html**

In `client/index.html`, inside the `#ui-overlay` div, add after the context-menu div:

```html
    <div id="toast-container" class="toast-container"></div>
```

**Step 3: Commit**

```bash
git add client/styles/game.css client/index.html
git commit -m "feat: add fishing UI and toast notification styles"
```

---

## Task 8: Wire Everything in main.js

**Files:**
- Modify: `client/src/main.js`

This is the integration task. We need to:
1. Import FishingEffects and FishingUI
2. Create a fishing state machine that coordinates: cast → wait → nibble → bite → mini-game → result
3. Handle the `fishingBite` event from server
4. Replace the bare `fishCaught`/`fishMiss` console.logs with toast notifications
5. Add toast notification helper
6. Handle fishing cancellation (Escape/right-click during cast)
7. Block other actions while fishing

**Step 1: Add imports**

After the existing imports at the top of `client/src/main.js`, add:

```javascript
import { FishingEffects } from './effects/FishingEffects.js';
import { FishingUI } from './ui/FishingUI.js';
```

**Step 2: Create fishing instances after renderer setup**

After the forage renderer line (`let forage = new ForageRenderer(sceneManager.scene);`, line 56), add:

```javascript
  // --- Fishing ---
  const fishingEffects = new FishingEffects(sceneManager.scene);
  const fishingUI = new FishingUI();
  let fishingState = null; // null = not fishing
```

**Step 3: Add toast notification helper**

After the `debugClient.log('INIT', ...)` block (around line 105), add:

```javascript
    // --- Toast notification helper ---
    function showToast(message, type = '') {
      const container = document.getElementById('toast-container');
      if (!container) return;
      const toast = document.createElement('div');
      toast.className = 'toast' + (type ? ` toast-${type}` : '');
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 3000);
    }
```

**Step 4: Add fishing state machine function**

After the toast helper, add:

```javascript
    // --- Fishing state machine ---
    async function startFishingSequence(biteData) {
      const playerPos = players.getLocalPlayerPosition(network.playerId);
      if (!playerPos) return;

      fishingState = 'waiting';

      // Schedule nibbles during wait
      const { waitTime, nibbles } = biteData;
      const nibbleInterval = waitTime / (nibbles + 1);
      let nibbleCount = 0;

      // Wait phase with nibbles
      await new Promise((resolve) => {
        let elapsed = 0;
        const interval = setInterval(() => {
          elapsed += 0.1;
          if (!fishingState) { clearInterval(interval); resolve(); return; }

          // Nibble timing
          if (nibbleCount < nibbles && elapsed > nibbleInterval * (nibbleCount + 1)) {
            fishingEffects.playNibble();
            nibbleCount++;
          }

          if (elapsed >= waitTime) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });

      if (!fishingState) return; // cancelled during wait

      // Bite!
      fishingEffects.playBite();
      fishingState = 'minigame';

      // Small delay for bite visual, then show mini-game
      await new Promise(r => setTimeout(r, 400));

      if (!fishingState) return; // cancelled during bite

      // Start mini-game
      const caught = await fishingUI.start({
        fishName: biteData.fishName,
        rarity: biteData.rarity,
        behavior: biteData.behavior,
        rodTier: biteData.rodTier,
        fishingLevel: biteData.fishingLevel,
        baitNetBonus: biteData.baitNetBonus || 0,
      });

      fishingState = null;

      // Send result to server
      network.sendFishReel(caught);

      // Play outcome effects
      if (caught) {
        fishingEffects.playCatch();
        showToast(`Caught a ${biteData.fishName}!`, 'success');
      } else {
        fishingEffects.playMiss();
        showToast('The fish got away...', 'fail');
      }
    }
```

**Step 5: Modify the fishing_rod case in tileAction handler**

In the `tileAction` handler, replace the `case 'fishing_rod':` block (around line 249-251):

```javascript
        case 'fishing_rod': {
          // Don't cast if already fishing
          if (fishingState) break;
          network.sendFishCast(worldPos.x, worldPos.z);
          // Start bobber cast effect immediately
          const playerPos = players.getLocalPlayerPosition(network.playerId);
          if (playerPos) {
            fishingEffects.startCast(playerPos, { x: worldPos.x, z: worldPos.z });
          }
          break;
        }
```

**Step 6: Add fishing cancellation to right-click/escape**

In the `tileMove` handler (around line 172), add at the very top of the callback:

```javascript
      // Cancel fishing on right-click
      if (fishingState) {
        fishingState = null;
        fishingEffects.cancel();
        fishingUI.dispose();
        network.sendFishCancel();
        return;
      }
```

In the `keyDown` handler (around line 271), add before the existing key checks:

```javascript
      // Cancel fishing on Escape
      if (key === 'Escape' && fishingState) {
        fishingState = null;
        fishingEffects.cancel();
        fishingUI.dispose();
        network.sendFishCancel();
        return;
      }
```

**Step 7: Block tool actions while fishing**

In the `tileAction` handler, add a guard at the top (after the dialogue/context menu check):

```javascript
      // Don't perform actions while fishing (except fishing_rod which has its own guard)
      if (fishingState && action !== 'fishing_rod') return;
```

**Step 8: Handle the fishingBite event**

In the `network.on('worldUpdate', ...)` handler, add a new case after `'fishMiss'`:

```javascript
        case 'fishingBite':
          // Server rolled a fish — start the cinematic bite + mini-game sequence
          if (data.playerId === network.playerId) {
            startFishingSequence(data);
          }
          break;
```

**Step 9: Replace fishCaught/fishMiss console.logs with toasts**

Replace the existing `case 'fishCaught':` (line 316-318):

```javascript
        case 'fishCaught':
          if (data.playerId !== network.playerId) {
            // Other player caught a fish — just a console note
            console.log(`${data.playerId} caught: ${data.fish.name}`);
          }
          break;
```

Replace the existing `case 'fishMiss':` (line 319-320):

```javascript
        case 'fishMiss':
          if (data.playerId !== network.playerId) {
            console.log(`${data.playerId} missed a fish`);
          }
          break;
```

**Step 10: Add fishingEffects.update to render loop**

In the `sceneManager.onUpdate` callback, add after `players.update(delta)`:

```javascript
      fishingEffects.update(delta);
```

**Step 11: Commit**

```bash
git add client/src/main.js
git commit -m "feat: wire fishing state machine, effects, and UI in main.js"
```

---

## Task 9: Manual Verification

**Step 1: Start the dev server**

Run: `npm run dev`

Expected: Server starts on port 3000, client connects.

**Step 2: Test the fishing flow**

1. Select the fishing rod (slot 5 on action bar, or press `5`)
2. Left-click on a water tile on the farm
3. Verify: bobber arcs from player to water tile with a fishing line trailing
4. Verify: bobber lands with a ripple ring animation
5. Verify: after 2-5 seconds, 1-3 nibbles play (bobber dips briefly)
6. Verify: bite plays — bobber plunges, splash particles, yellow "!" appears
7. Verify: fishing panel slides in from the right side with fish name and rarity
8. Verify: catch bar appears — holding spacebar/mouse makes the green zone rise, releasing makes it fall
9. Verify: fish icon bounces within the bar according to behavior pattern
10. Verify: progress bar fills when fish is in the green zone, drains when outside
11. Verify: winning (progress 100%) shows toast "Caught a [Fish Name]!" with sparkle particles
12. Verify: losing (progress 0%) shows toast "The fish got away..." with splash
13. Verify: caught fish appears in inventory
14. Verify: fishing XP is awarded (check HUD skill display)
15. Verify: right-clicking or pressing Escape during any phase cancels the cast

**Step 3: Test edge cases**

1. Click non-water tile with rod — nothing happens (existing behavior)
2. Try to fish while already fishing — blocked
3. Cancel mid-cast — bobber and line cleanup
4. Cancel during mini-game — mini-game closes, server gets `success: false`

**Step 4: Commit final verification**

```bash
git add -A
git commit -m "feat: complete fishing system - cast, catch bar, 35 species"
```

---

## Implementation Order Summary

| Task | Description | Dependencies |
|------|-------------|--------------|
| 1 | Expand fish.json (35 species) | None |
| 2 | Enhanced FishCalculator | Task 1 |
| 3 | Server fishing flow (2-phase) | Task 2 |
| 4 | Update NetworkClient | None |
| 5 | FishingEffects (Three.js) | None |
| 6 | FishingUI (catch bar) | None |
| 7 | Fishing CSS + toast styles | None |
| 8 | Wire everything in main.js | Tasks 3-7 |
| 9 | Manual verification | Task 8 |

Tasks 1-2-3 are sequential (server data flow).
Tasks 4, 5, 6, 7 are independent and can be done in parallel.
Task 8 integrates everything.
Task 9 is verification.
