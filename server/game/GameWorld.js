// server/game/GameWorld.js
// The master game world — owns all state, runs the tick loop,
// processes player actions, and broadcasts updates.

import { v4 as uuid } from 'uuid';
import { TICK_RATE, TILE_TYPES, ACTIONS, TIME_SCALE, SKILLS, QUALITY_MULTIPLIER, CROP_STAGES } from '../../shared/constants.js';
import { isValidTile, tileIndex } from '../../shared/TileMap.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { DecorationGenerator } from './DecorationGenerator.js';
import { TimeManager } from './TimeManager.js';
import { WeatherManager } from './WeatherManager.js';
import { Player } from '../entities/Player.js';
import { Crop } from '../entities/Crop.js';
import { NPC } from '../entities/NPC.js';
import { Pet } from '../entities/Pet.js';
import { Animal } from '../entities/Animal.js';
import { FishCalculator } from '../entities/Fish.js';
import { getDB } from '../db/database.js';
import { logger } from '../utils/Logger.js';

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
    this.decorationGen = new DecorationGenerator(seed);
    this.decorations = this.decorationGen.generate(this.tiles);
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

    // Set up starter farm (buildings + crops) on first run
    this._initStarterFarm();

    // Start tick loop
    this._tickInterval = null;
    this._lastTick = Date.now();
  }

  _initStarterFarm() {
    // Only populate if buildings map is empty (first boot)
    if (this.buildings.size > 0) return;

    const cx = 32, cz = 32;

    // Place house and barn
    this.buildings.set('house_main', {
      id: 'house_main', type: 'house', tileX: cx - 3, tileZ: cz - 1,
    });
    this.buildings.set('barn_main', {
      id: 'barn_main', type: 'barn', tileX: cx - 4, tileZ: cz + 3,
    });

    // Pre-till a crop plot
    for (let px = cx + 2; px <= cx + 6; px++) {
      for (let pz = cz - 2; pz <= cz + 2; pz++) {
        const idx = tileIndex(px, pz);
        if (idx >= 0 && idx < this.tiles.length) {
          this.tiles[idx].type = TILE_TYPES.TILLED;
        }
      }
    }

    // Plant starter parsnip at various growth stages
    for (let px = cx + 2; px <= cx + 5; px++) {
      for (let pz = cz - 1; pz <= cz + 1; pz++) {
        const crop = new Crop({ tileX: px, tileZ: pz, cropType: 'parsnip' });
        crop.stage = 1 + ((px + pz) % 3); // stages 1, 2, 3
        this.crops.set(crop.id, crop);
      }
    }

    logger.info('WORLD', 'Starter farm initialized', {
      buildings: this.buildings.size,
      crops: this.crops.size,
      decorations: this.decorations.length,
    });
  }

  _getOrCreateSeed() {
    const db = getDB();
    let row = db.prepare('SELECT * FROM worlds WHERE id = ?').get(this.worldId);
    if (!row) {
      const seed = Math.floor(Math.random() * 2147483647);
      db.prepare('INSERT INTO worlds (id, seed) VALUES (?, ?)').run(this.worldId, seed);
      logger.info('WORLD', `New world created with seed ${seed}`);
      return seed;
    }
    // Restore time state
    this.time = new TimeManager({ season: row.season, day: row.day, hour: row.hour });
    logger.info('WORLD', `Loaded existing world`, { seed: row.seed, season: row.season, day: row.day, hour: row.hour });
    return row.seed;
  }

  start() {
    logger.info('WORLD', `GameWorld started. Tick rate: ${TICK_RATE}`);
    this._tickInterval = setInterval(() => this._tick(), 1000 / TICK_RATE);
  }

  stop() {
    clearInterval(this._tickInterval);
    this._saveWorldState();
    logger.info('WORLD', 'GameWorld stopped and state saved');
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
    logger.info('WORLD', `New day: Season ${this.time.season}, Day ${this.time.day}`, {
      crops: this.crops.size, animals: this.animals.size, players: this.players.size,
    });

    // Weather change
    const newWeather = this.weather.onNewDay(this.time.season);
    logger.debug('WORLD', `Weather changed to ${newWeather}`);
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

    // Save skills for all online players
    for (const player of this.players.values()) {
      this._savePlayerSkills(player);
    }

    // Save state
    this._saveWorldState();

    // Broadcast full update
    this._broadcastWorldUpdate();
  }

  _onNewSeason(season) {
    logger.info('WORLD', `New season: ${season}`);
  }

  // --- Player Actions ---

  handlePlayerJoin(socket, data) {
    // Load or create persistent player in database
    const db = getDB();
    const playerId = data.playerId || uuid();
    let row = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    if (!row) {
      db.prepare('INSERT INTO players (id, world_id, name) VALUES (?, ?, ?)')
        .run(playerId, this.worldId, data.name || 'Farmer');
      row = { id: playerId, name: data.name || 'Farmer' };
    }

    // Load saved skills from database
    const skills = this._loadPlayerSkills(playerId);

    const player = new Player({ id: playerId, name: data.name || row.name, skills });
    player.socketId = socket.id;
    this.players.set(socket.id, player);

    // Send full world state to joining player
    const fullState = this._getFullState(player.id);
    socket.emit(ACTIONS.WORLD_STATE, fullState);

    // Notify others
    socket.broadcast.emit(ACTIONS.PLAYER_JOIN, { player: player.getState() });

    logger.info('GAME', `${player.name} joined`, {
      socketId: socket.id, playerId: player.id, online: this.players.size,
      stateSent: { tiles: fullState.tiles.length, crops: fullState.crops.length, npcs: fullState.npcs.length },
    });
  }

  handlePlayerLeave(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;

    // Save skills before removing
    this._savePlayerSkills(player);

    logger.info('GAME', `${player.name} left`, { playerId: player.id, online: this.players.size - 1 });
    this.players.delete(socketId);
    this.io.emit(ACTIONS.PLAYER_LEAVE, { playerId: player.id });
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
    if (!player || !player.useEnergy(2)) {
      logger.debug('FARM', `Till rejected: no player or no energy`, { socketId, data });
      return;
    }
    if (!isValidTile(data.x, data.z)) {
      logger.debug('FARM', `Till rejected: invalid tile`, data);
      return;
    }

    const idx = tileIndex(data.x, data.z);
    const tile = this.tiles[idx];
    if (tile.type !== TILE_TYPES.DIRT && tile.type !== TILE_TYPES.GRASS) {
      logger.debug('FARM', `Till rejected: tile type ${tile.type} not tillable`, data);
      return;
    }

    tile.type = TILE_TYPES.TILLED;
    logger.debug('FARM', `Tilled (${data.x},${data.z}) by ${player.name}`);
    this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'tileChange', x: data.x, z: data.z, tileType: TILE_TYPES.TILLED });
  }

  handlePlant(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    const seedId = data.cropType + '_seed';
    if (!player.hasItem(seedId)) {
      logger.debug('FARM', `Plant rejected: ${player.name} missing ${seedId}`, { inventory: player.inventory });
      return;
    }
    if (!isValidTile(data.x, data.z)) {
      logger.debug('FARM', `Plant rejected: invalid tile`, data);
      return;
    }

    const idx = tileIndex(data.x, data.z);
    if (this.tiles[idx].type !== TILE_TYPES.TILLED) {
      logger.debug('FARM', `Plant rejected: tile not tilled (type=${this.tiles[idx].type})`, data);
      return;
    }

    // Check no crop already there
    for (const crop of this.crops.values()) {
      if (crop.tileX === data.x && crop.tileZ === data.z) {
        logger.debug('FARM', `Plant rejected: crop already at (${data.x},${data.z})`);
        return;
      }
    }

    player.removeItem(seedId, 1);
    const crop = new Crop({ tileX: data.x, tileZ: data.z, cropType: data.cropType });
    this.crops.set(crop.id, crop);

    logger.debug('FARM', `${player.name} planted ${data.cropType} at (${data.x},${data.z})`, { cropId: crop.id });
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

        const yield_ = 1 + Math.floor(Math.random() * 2);
        const quality = this._rollCropQuality(player.getSkillLevel(SKILLS.FARMING));
        player.addItem(crop.cropType, yield_, quality);
        player.addSkillXP(SKILLS.FARMING, cropData.xp);

        logger.debug('FARM', `${player.name} harvested ${crop.cropType} x${yield_} at (${data.x},${data.z})`, {
          xp: cropData.xp, totalXP: player.xp, level: player.level, regrows: !!cropData.regrows,
        });

        if (cropData.regrows) {
          // Regrowable: reset to mature stage, will grow back to harvestable
          crop.stage = CROP_STAGES.MATURE;
          crop.growth = 0;
          crop.watered = false;
          this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'cropUpdate', crop: crop.getState() });
        } else {
          // Non-regrowable: remove crop, reset tile
          this.crops.delete(id);
          const idx = tileIndex(data.x, data.z);
          this.tiles[idx].type = TILE_TYPES.TILLED;
          this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'cropHarvested', cropId: id, x: data.x, z: data.z });
        }

        this._sendInventoryUpdate(socketId, player);
        break;
      }
    }
  }

  handleFishCast(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || !player.useEnergy(5)) {
      logger.debug('FISH', `Cast rejected: no player or no energy`, { socketId });
      return;
    }

    // Determine location by tile type
    const idx = tileIndex(Math.floor(data.x), Math.floor(data.z));
    if (idx < 0 || idx >= this.tiles.length) return;
    if (this.tiles[idx].type !== TILE_TYPES.WATER) {
      logger.debug('FISH', `Cast rejected: not water tile at (${data.x},${data.z}), type=${this.tiles[idx]?.type}`);
      return;
    }

    const location = 'pond'; // Simplified — could check coordinates for river/ocean
    const fish = this.fishCalc.rollCatch(location, player.level);

    if (fish) {
      player.addItem(fish.id, 1);
      player.addSkillXP(SKILLS.FISHING, 5 + fish.rarity * 10);
      logger.debug('FISH', `${player.name} caught ${fish.id} (rarity ${fish.rarity})`);
      this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'fishCaught', playerId: player.id, fish });
      this._sendInventoryUpdate(socketId, player);
    } else {
      logger.debug('FISH', `${player.name} missed (no fish available at ${location})`);
      this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'fishMiss', playerId: player.id });
    }
  }

  handleNPCTalk(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    const npc = this.npcs.find(n => n.id === data.npcId);
    if (!npc) {
      logger.warn('NPC', `NPC not found: ${data.npcId}`);
      return;
    }

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
    logger.debug('NPC', `${player.name} talked to ${npc.name}`, { hearts: rel.hearts });
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

    const cropData = cropsData[data.itemId];
    let basePrice = cropData?.sellPrice || 10;

    // Find the item slot to get quality
    const slot = player.inventory.find(i => i.itemId === data.itemId);
    const quality = slot?.quality || 0;
    const price = Math.floor(basePrice * QUALITY_MULTIPLIER[quality]) * quantity;

    player.removeItem(data.itemId, quantity);
    player.coins += price;
    player.addSkillXP(SKILLS.FARMING, 2 * quantity);
    this._sendInventoryUpdate(socketId, player);
  }

  // --- Helpers ---

  _rollCropQuality(farmingLevel) {
    const roll = Math.random();
    const goldChance = farmingLevel * 0.015;     // 1.5% per level
    const silverChance = farmingLevel * 0.03;     // 3% per level

    if (roll < goldChance) return 2;              // Gold
    if (roll < goldChance + silverChance) return 1; // Silver
    return 0;                                      // Normal
  }

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
      decorations: this.decorations,
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

  // --- Skill Persistence ---

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

  _saveWorldState() {
    const db = getDB();
    const state = this.time.getState();
    db.prepare('UPDATE worlds SET season = ?, day = ?, hour = ?, weather = ? WHERE id = ?')
      .run(state.season, state.day, state.hour, this.weather.currentWeather, this.worldId);
  }
}
