// server/game/GameWorld.js
// The master game world — owns all state, runs the tick loop,
// processes player actions, and broadcasts updates.

import { v4 as uuid } from 'uuid';
import { TICK_RATE, TILE_TYPES, ACTIONS, TIME_SCALE } from '../../shared/constants.js';
import { isValidTile, tileIndex } from '../../shared/TileMap.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { TimeManager } from './TimeManager.js';
import { WeatherManager } from './WeatherManager.js';
import { Player } from '../entities/Player.js';
import { Crop } from '../entities/Crop.js';
import { NPC } from '../entities/NPC.js';
import { Pet } from '../entities/Pet.js';
import { Animal } from '../entities/Animal.js';
import { FishCalculator } from '../entities/Fish.js';
import { getDB } from '../db/database.js';

// Load data files
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../data');

const cropsData = JSON.parse(readFileSync(join(dataDir, 'crops.json'), 'utf-8'));
const animalsData = JSON.parse(readFileSync(join(dataDir, 'animals.json'), 'utf-8'));
const npcsData = JSON.parse(readFileSync(join(dataDir, 'npcs.json'), 'utf-8'));
const fishData = JSON.parse(readFileSync(join(dataDir, 'fish.json'), 'utf-8'));
const recipesData = JSON.parse(readFileSync(join(dataDir, 'recipes.json'), 'utf-8'));

export class GameWorld {
  constructor(io) {
    this.io = io;
    this.worldId = 'world_main';

    // Generate or load world
    const seed = this._getOrCreateSeed();
    this.terrainGen = new TerrainGenerator(seed);
    this.tiles = this.terrainGen.generate();
    this.time = new TimeManager();
    this.weather = new WeatherManager(seed);
    this.fishCalc = new FishCalculator(fishData);

    // Entity collections
    this.players = new Map();    // socketId -> Player
    this.crops = new Map();      // id -> Crop
    this.animals = new Map();    // id -> Animal
    this.pets = new Map();       // id -> Pet
    this.npcs = npcsData.map(d => new NPC(d));
    this.buildings = new Map();

    // Start tick loop
    this._tickInterval = null;
    this._lastTick = Date.now();
  }

  _getOrCreateSeed() {
    const db = getDB();
    let row = db.prepare('SELECT * FROM worlds WHERE id = ?').get(this.worldId);
    if (!row) {
      const seed = Math.floor(Math.random() * 2147483647);
      db.prepare('INSERT INTO worlds (id, seed) VALUES (?, ?)').run(this.worldId, seed);
      return seed;
    }
    // Restore time state
    this.time = new TimeManager({ season: row.season, day: row.day, hour: row.hour });
    return row.seed;
  }

  start() {
    console.log('GameWorld started. Tick rate:', TICK_RATE);
    this._tickInterval = setInterval(() => this._tick(), 1000 / TICK_RATE);
  }

  stop() {
    clearInterval(this._tickInterval);
    this._saveWorldState();
  }

  _tick() {
    const now = Date.now();
    const deltaSec = (now - this._lastTick) / 1000;
    this._lastTick = now;

    // Pause if no players
    if (this.players.size === 0) return;

    // Advance time
    const timeEvents = this.time.tick(deltaSec);

    // Calculate game hours elapsed this tick
    const gameHoursElapsed = (deltaSec * TIME_SCALE) / 3600;

    // Process time events
    for (const event of timeEvents) {
      if (event.type === 'newDay') {
        this._onNewDay();
      }
      if (event.type === 'newSeason') {
        this._onNewSeason(event.season);
      }
    }

    // Update crops
    for (const crop of this.crops.values()) {
      const data = cropsData[crop.cropType];
      if (data) {
        crop.tick(gameHoursElapsed, data);
      }
    }

    // Update NPC schedules
    for (const npc of this.npcs) {
      npc.updateSchedule(this.time.hour);
    }

    // Broadcast time update (every ~1 second real-time)
    if (Math.floor(now / 1000) !== Math.floor((now - deltaSec * 1000) / 1000)) {
      this.io.emit(ACTIONS.TIME_UPDATE, this.time.getState());
    }
  }

  _onNewDay() {
    // Weather change
    const newWeather = this.weather.onNewDay(this.time.season);
    this.io.emit(ACTIONS.WEATHER_UPDATE, { weather: newWeather });

    // Rain waters all crops
    if (this.weather.isRaining()) {
      for (const crop of this.crops.values()) {
        crop.watered = true;
      }
    }

    // Animal daily tick
    for (const animal of this.animals.values()) {
      animal.tickDaily();
    }

    // Pet daily tick
    for (const pet of this.pets.values()) {
      pet.tickDaily();
    }

    // Restore player energy
    for (const player of this.players.values()) {
      player.energy = player.maxEnergy;
    }

    // Save state
    this._saveWorldState();

    // Broadcast full update
    this._broadcastWorldUpdate();
  }

  _onNewSeason(season) {
    console.log('New season:', season);
    // Could remove out-of-season crops, trigger festivals, etc.
  }

  // --- Player Actions ---

  handlePlayerJoin(socket, data) {
    const player = new Player({ name: data.name });
    player.socketId = socket.id;
    this.players.set(socket.id, player);

    // Send full world state to joining player
    socket.emit(ACTIONS.WORLD_STATE, this._getFullState(player.id));

    // Notify others
    socket.broadcast.emit(ACTIONS.PLAYER_JOIN, { player: player.getState() });

    console.log(`${player.name} joined (${this.players.size} players online)`);
  }

  handlePlayerLeave(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;
    this.players.delete(socketId);
    this.io.emit(ACTIONS.PLAYER_LEAVE, { playerId: player.id });
    console.log(`${player.name} left (${this.players.size} players online)`);
  }

  handlePlayerMove(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;
    player.x = data.x;
    player.z = data.z;
    this.io.emit(ACTIONS.WORLD_UPDATE, {
      type: 'playerMove',
      playerId: player.id,
      x: player.x, z: player.z,
    });
  }

  handleTill(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || !player.useEnergy(2)) return;
    if (!isValidTile(data.x, data.z)) return;

    const idx = tileIndex(data.x, data.z);
    const tile = this.tiles[idx];
    if (tile.type !== TILE_TYPES.DIRT && tile.type !== TILE_TYPES.GRASS) return;

    tile.type = TILE_TYPES.TILLED;
    this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'tileChange', x: data.x, z: data.z, tileType: TILE_TYPES.TILLED });
  }

  handlePlant(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    const seedId = data.cropType + '_seed';
    if (!player.hasItem(seedId)) return;
    if (!isValidTile(data.x, data.z)) return;

    const idx = tileIndex(data.x, data.z);
    if (this.tiles[idx].type !== TILE_TYPES.TILLED) return;

    // Check no crop already there
    for (const crop of this.crops.values()) {
      if (crop.tileX === data.x && crop.tileZ === data.z) return;
    }

    player.removeItem(seedId, 1);
    const crop = new Crop({ tileX: data.x, tileZ: data.z, cropType: data.cropType });
    this.crops.set(crop.id, crop);

    this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'cropPlanted', crop: crop.getState() });
    this._sendInventoryUpdate(socketId, player);
  }

  handleWater(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || !player.useEnergy(1)) return;

    for (const crop of this.crops.values()) {
      if (crop.tileX === data.x && crop.tileZ === data.z) {
        crop.watered = true;
        this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'cropWatered', cropId: crop.id });
        break;
      }
    }
  }

  handleHarvest(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    for (const [id, crop] of this.crops.entries()) {
      if (crop.tileX === data.x && crop.tileZ === data.z && crop.stage >= 3) {
        const cropData = cropsData[crop.cropType];
        if (!cropData) continue;

        player.addItem(crop.cropType, 1 + Math.floor(Math.random() * 2));
        player.addXP(cropData.xp);
        this.crops.delete(id);

        // Reset tile to tilled
        const idx = tileIndex(data.x, data.z);
        this.tiles[idx].type = TILE_TYPES.TILLED;

        this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'cropHarvested', cropId: id, x: data.x, z: data.z });
        this._sendInventoryUpdate(socketId, player);
        break;
      }
    }
  }

  handleFishCast(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || !player.useEnergy(5)) return;

    // Determine location by tile type
    const idx = tileIndex(Math.floor(data.x), Math.floor(data.z));
    if (idx < 0 || idx >= this.tiles.length) return;
    if (this.tiles[idx].type !== TILE_TYPES.WATER) return;

    const location = 'pond'; // Simplified — could check coordinates for river/ocean
    const fish = this.fishCalc.rollCatch(location, player.level);

    if (fish) {
      player.addItem(fish.id, 1);
      player.addXP(5 + fish.rarity * 10);
      this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'fishCaught', playerId: player.id, fish });
      this._sendInventoryUpdate(socketId, player);
    } else {
      this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'fishMiss', playerId: player.id });
    }
  }

  handleNPCTalk(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    const npc = this.npcs.find(n => n.id === data.npcId);
    if (!npc) return;

    // Get or create relationship
    const db = getDB();
    let rel = db.prepare('SELECT * FROM npc_relationships WHERE player_id = ? AND npc_id = ?')
      .get(player.id, npc.id);

    if (!rel) {
      db.prepare('INSERT INTO npc_relationships (player_id, npc_id) VALUES (?, ?)')
        .run(player.id, npc.id);
      rel = { hearts: 0, talked_today: 0 };
    }

    // Talking gives +0.2 hearts per day (once)
    if (!rel.talked_today) {
      db.prepare('UPDATE npc_relationships SET hearts = MIN(hearts + 0.2, 10), talked_today = 1 WHERE player_id = ? AND npc_id = ?')
        .run(player.id, npc.id);
      rel.hearts = Math.min(rel.hearts + 0.2, 10);
    }

    const dialogue = npc.getDialogue(rel.hearts);
    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'npcDialogue',
      npcId: npc.id,
      npcName: npc.name,
      text: dialogue,
      hearts: rel.hearts,
    });
  }

  handleShopBuy(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    // Check if it's a crop seed
    const cropType = data.itemId.replace('_seed', '');
    const cropData = cropsData[cropType];
    if (cropData) {
      const cost = cropData.buyPrice * (data.quantity || 1);
      if (player.coins < cost) return;
      player.coins -= cost;
      player.addItem(data.itemId, data.quantity || 1);
      this._sendInventoryUpdate(socketId, player);
    }
  }

  handleShopSell(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    const quantity = data.quantity || 1;
    if (!player.hasItem(data.itemId, quantity)) return;

    // Look up sell price
    const cropData = cropsData[data.itemId];
    const price = cropData ? cropData.sellPrice : 10; // Default fallback

    player.removeItem(data.itemId, quantity);
    player.coins += price * quantity;
    player.addXP(2 * quantity);
    this._sendInventoryUpdate(socketId, player);
  }

  // --- Helpers ---

  _sendInventoryUpdate(socketId, player) {
    this.io.to(socketId).emit(ACTIONS.INVENTORY_UPDATE, {
      inventory: player.inventory,
      coins: player.coins,
      xp: player.xp,
      level: player.level,
      energy: player.energy,
    });
  }

  _broadcastWorldUpdate() {
    const crops = Array.from(this.crops.values()).map(c => c.getState());
    const animals = Array.from(this.animals.values()).map(a => a.getState());
    const pets = Array.from(this.pets.values()).map(p => p.getState());
    this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'fullSync', crops, animals, pets });
  }

  _getFullState(playerId) {
    return {
      playerId,
      tiles: this.tiles,
      crops: Array.from(this.crops.values()).map(c => c.getState()),
      animals: Array.from(this.animals.values()).map(a => a.getState()),
      pets: Array.from(this.pets.values()).map(p => p.getState()),
      npcs: this.npcs.map(n => n.getState()),
      players: Array.from(this.players.values()).map(p => p.getState()),
      buildings: Array.from(this.buildings.values()),
      time: this.time.getState(),
      weather: this.weather.getState(),
    };
  }

  _saveWorldState() {
    const db = getDB();
    const state = this.time.getState();
    db.prepare('UPDATE worlds SET season = ?, day = ?, hour = ?, weather = ? WHERE id = ?')
      .run(state.season, state.day, state.hour, this.weather.currentWeather, this.worldId);
  }
}
