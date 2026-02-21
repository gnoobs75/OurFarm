// server/game/GameWorld.js
// The master game world — owns all state, runs the tick loop,
// processes player actions, and broadcasts updates.
// Supports multiple maps (farm, town) with portal transitions.

import { v4 as uuid } from 'uuid';
import { TICK_RATE, TILE_TYPES, ACTIONS, TIME_SCALE, SKILLS, QUALITY_MULTIPLIER, CROP_STAGES, MAP_IDS, GIFT_POINTS } from '../../shared/constants.js';
import { isValidTile, tileIndex } from '../../shared/TileMap.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { DecorationGenerator } from './DecorationGenerator.js';
import { MapInstance } from './MapInstance.js';
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
    this.decorationGen = new DecorationGenerator(seed);
    this.time = new TimeManager();
    this.weather = new WeatherManager(seed);
    this.fishCalc = new FishCalculator(fishData);

    // Entity collections
    this.players = new Map();    // socketId -> Player
    this.shippingBins = new Map(); // playerId -> [{itemId, quantity, quality}]

    // Multi-map setup
    this.maps = new Map();
    this._initMaps();
    this._initStarterFarm();

    // Start tick loop
    this._tickInterval = null;
    this._lastTick = Date.now();
  }

  _initMaps() {
    // Farm map
    const farmTiles = this.terrainGen.generate();
    const farmDecorations = this.decorationGen.generate(farmTiles);
    const farmMap = new MapInstance(MAP_IDS.FARM, {
      tiles: farmTiles,
      decorations: farmDecorations,
      portals: [
        // South edge portal → town (north edge)
        { x: 29, z: 61, width: 6, height: 3, targetMap: MAP_IDS.TOWN, spawnX: 31, spawnZ: 3 },
      ],
    });
    this.maps.set(MAP_IDS.FARM, farmMap);

    // Town map
    const townTiles = this.terrainGen.generateTown();
    const townDecorations = this.decorationGen.generateTown(townTiles);
    const townMap = new MapInstance(MAP_IDS.TOWN, {
      tiles: townTiles,
      decorations: townDecorations,
      portals: [
        // North edge portal → farm (near portal path)
        { x: 30, z: 0, width: 4, height: 2, targetMap: MAP_IDS.FARM, spawnX: 31, spawnZ: 58 },
      ],
    });

    // NPCs live on the town map
    townMap.npcs = npcsData.map(d => new NPC(d));

    // Town buildings: spread across the layout
    const townBuildings = [
      { id: 'bakery', type: 'shop', tileX: 10, tileZ: 12 },
      { id: 'smithy', type: 'shop', tileX: 45, tileZ: 30 },
      { id: 'library', type: 'house', tileX: 27, tileZ: 14 },
      { id: 'fish_shop', type: 'shop', tileX: 53, tileZ: 22 },
      { id: 'town_hall', type: 'house', tileX: 31, tileZ: 32 },
      { id: 'vet_clinic', type: 'house', tileX: 11, tileZ: 22 },
    ];
    for (const b of townBuildings) {
      townMap.buildings.set(b.id, b);
    }

    this.maps.set(MAP_IDS.TOWN, townMap);
  }

  _initStarterFarm() {
    const farmMap = this.maps.get(MAP_IDS.FARM);
    if (farmMap.buildings.size > 0) return;

    const cx = 32, cz = 32;

    // Farm buildings
    farmMap.buildings.set('house_main', {
      id: 'house_main', type: 'house', tileX: cx - 3, tileZ: cz - 1,
    });
    farmMap.buildings.set('barn_main', {
      id: 'barn_main', type: 'barn', tileX: cx - 4, tileZ: cz + 3,
    });

    // Pre-till a crop plot
    for (let px = cx + 2; px <= cx + 6; px++) {
      for (let pz = cz - 2; pz <= cz + 2; pz++) {
        const idx = tileIndex(px, pz);
        if (idx >= 0 && idx < farmMap.tiles.length) {
          farmMap.tiles[idx].type = TILE_TYPES.TILLED;
        }
      }
    }

    // Plant starter parsnip at various growth stages
    for (let px = cx + 2; px <= cx + 5; px++) {
      for (let pz = cz - 1; pz <= cz + 1; pz++) {
        const crop = new Crop({ tileX: px, tileZ: pz, cropType: 'parsnip' });
        crop.stage = 1 + ((px + pz) % 3);
        farmMap.crops.set(crop.id, crop);
      }
    }

    // Spawn starter animals
    const starterAnimals = [
      { type: 'chicken', x: 27, z: 35 },
      { type: 'chicken', x: 28, z: 36 },
      { type: 'cow', x: 26, z: 38 },
    ];
    for (const a of starterAnimals) {
      const animal = new Animal(a);
      farmMap.animals.set(animal.id, animal);
    }

    // Spawn starter pet
    const starterPet = new Pet({ ownerId: null, type: 'dog', name: 'Buddy', x: 30, z: 31 });
    farmMap.pets.set(starterPet.id, starterPet);

    logger.info('WORLD', 'Starter farm initialized', {
      farmBuildings: farmMap.buildings.size,
      farmCrops: farmMap.crops.size,
      farmAnimals: farmMap.animals.size,
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
    this.time = new TimeManager({ season: row.season, day: row.day, hour: row.hour });
    logger.info('WORLD', `Loaded existing world`, { seed: row.seed, season: row.season, day: row.day, hour: row.hour });
    return row.seed;
  }

  /** Get the MapInstance for a player */
  _getPlayerMap(player) {
    return this.maps.get(player.currentMap) || this.maps.get(MAP_IDS.FARM);
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

    if (this.players.size === 0) return;

    const timeEvents = this.time.tick(deltaSec);
    this._checkCollapse();

    const gameHoursElapsed = (deltaSec * TIME_SCALE) / 3600;

    for (const event of timeEvents) {
      if (event.type === 'newDay') this._onNewDay();
      if (event.type === 'newSeason') this._onNewSeason(event.season);
    }

    // Update crops on farm map
    const farmMap = this.maps.get(MAP_IDS.FARM);
    for (const crop of farmMap.crops.values()) {
      const data = cropsData[crop.cropType];
      if (data) crop.tick(gameHoursElapsed, data);
    }

    // Animal product timers
    for (const animal of farmMap.animals.values()) {
      const animalData = animalsData[animal.type];
      if (animalData) animal.tickHour(animalData, gameHoursElapsed);
    }

    // Update NPC schedules on town map
    const townMap = this.maps.get(MAP_IDS.TOWN);
    for (const npc of townMap.npcs) {
      npc.updateSchedule(this.time.hour);
    }

    // Broadcast time update (~1 second real-time)
    if (Math.floor(now / 1000) !== Math.floor((now - deltaSec * 1000) / 1000)) {
      this.io.emit(ACTIONS.TIME_UPDATE, this.time.getState());
    }
  }

  _checkCollapse() {
    const hour = this.time.hour;
    if (hour >= 2 && hour < 6) {
      for (const player of this.players.values()) {
        if (!player._collapsed) {
          player._collapsed = true;
          const penalty = Math.min(Math.floor(player.coins * 0.1), 1000);
          player.coins -= penalty;
          player.energy = Math.floor(player.maxEnergy * 0.5);
          this._sendInventoryUpdate(player.socketId, player);
          if (this.io && player.socketId) {
            this.io.to(player.socketId).emit(ACTIONS.WORLD_UPDATE, {
              type: 'playerCollapse', penalty,
            });
          }
        }
      }
    }
  }

  _onNewDay() {
    for (const player of this.players.values()) {
      player._collapsed = false;
    }

    // Reset NPC daily flags
    const db = getDB();
    db.prepare('UPDATE npc_relationships SET talked_today = 0, gifted_today = 0').run();

    this._processShippingBins();

    logger.info('WORLD', `New day: Season ${this.time.season}, Day ${this.time.day}`, {
      crops: this.maps.get(MAP_IDS.FARM).crops.size,
      players: this.players.size,
    });

    const newWeather = this.weather.onNewDay(this.time.season);
    this.io.emit(ACTIONS.WEATHER_UPDATE, { weather: newWeather });

    // Rain waters all crops on farm
    const farmMap = this.maps.get(MAP_IDS.FARM);
    if (this.weather.isRaining()) {
      for (const crop of farmMap.crops.values()) {
        crop.watered = true;
      }
    }

    // Animal/pet daily ticks (on farm map)
    for (const animal of farmMap.animals.values()) animal.tickDaily();
    for (const pet of farmMap.pets.values()) pet.tickDaily();

    // Restore player energy
    for (const player of this.players.values()) {
      player.energy = player.maxEnergy;
    }

    // Save skills
    for (const player of this.players.values()) {
      this._savePlayerSkills(player);
    }

    this._saveWorldState();
    this._broadcastWorldUpdate();
  }

  _onNewSeason(season) {
    logger.info('WORLD', `New season: ${season}`);
    const farmMap = this.maps.get(MAP_IDS.FARM);
    const toRemove = [];
    for (const [id, crop] of farmMap.crops) {
      const cropData = cropsData[crop.cropType];
      if (cropData && !cropData.season.includes(season)) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      const crop = farmMap.crops.get(id);
      const idx = tileIndex(crop.tileX, crop.tileZ);
      if (idx >= 0 && idx < farmMap.tiles.length) {
        farmMap.tiles[idx].type = TILE_TYPES.TILLED;
      }
      farmMap.crops.delete(id);
    }
    if (toRemove.length > 0) {
      logger.info('WORLD', `Season change: ${toRemove.length} crops died`);
      this._broadcastWorldUpdate();
    }
  }

  // --- Player Actions ---

  handlePlayerJoin(socket, data) {
    const db = getDB();
    const playerId = data.playerId || uuid();
    let row = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
    if (!row) {
      db.prepare('INSERT INTO players (id, world_id, name) VALUES (?, ?, ?)')
        .run(playerId, this.worldId, data.name || 'Farmer');
      row = { id: playerId, name: data.name || 'Farmer' };
    }

    const skills = this._loadPlayerSkills(playerId);
    const player = new Player({ id: playerId, name: data.name || row.name, skills });
    player.socketId = socket.id;
    this.players.set(socket.id, player);

    // Assign unowned pet to this player
    const farmMap = this.maps.get(MAP_IDS.FARM);
    for (const pet of farmMap.pets.values()) {
      if (!pet.ownerId) {
        pet.ownerId = player.id;
        break;
      }
    }

    const fullState = this._getFullState(player);
    socket.emit(ACTIONS.WORLD_STATE, fullState);

    // Notify other players on same map
    this._broadcastToMap(player.currentMap, ACTIONS.PLAYER_JOIN, { player: player.getState() }, socket.id);

    logger.info('GAME', `${player.name} joined`, {
      socketId: socket.id, playerId: player.id, online: this.players.size,
    });
  }

  handlePlayerLeave(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;

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

    // Check for portal zone
    const map = this._getPlayerMap(player);
    const tileX = Math.floor(data.x);
    const tileZ = Math.floor(data.z);
    const portal = map.isInPortalZone(tileX, tileZ);
    if (portal) {
      this._handleMapTransition(socketId, portal);
      return;
    }

    this._broadcastToMap(player.currentMap, ACTIONS.WORLD_UPDATE, {
      type: 'playerMove', playerId: player.id, x: player.x, z: player.z,
    });
  }

  _handleMapTransition(socketId, portal) {
    const player = this.players.get(socketId);
    if (!player) return;

    const oldMap = player.currentMap;
    const newMap = portal.targetMap;

    player.currentMap = newMap;
    player.x = portal.spawnX;
    player.z = portal.spawnZ;

    // Notify players on old map that this player left
    this._broadcastToMap(oldMap, ACTIONS.PLAYER_LEAVE, { playerId: player.id }, socketId);

    // Send the new map state to this player
    const targetMap = this.maps.get(newMap);
    const mapState = targetMap.getFullState();

    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'mapTransition',
      mapId: newMap,
      mapState,
      spawnX: portal.spawnX,
      spawnZ: portal.spawnZ,
      season: this.time.season,
    });

    // Notify players on new map that this player joined
    this._broadcastToMap(newMap, ACTIONS.PLAYER_JOIN, { player: player.getState() }, socketId);

    logger.info('GAME', `${player.name} transitioned ${oldMap} → ${newMap}`);
  }

  handleTill(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || !player.useEnergy(2)) return;
    if (player.currentMap !== MAP_IDS.FARM) return; // only on farm
    if (!isValidTile(data.x, data.z)) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);
    const idx = tileIndex(data.x, data.z);
    const tile = farmMap.tiles[idx];
    if (tile.type !== TILE_TYPES.DIRT && tile.type !== TILE_TYPES.GRASS) return;

    tile.type = TILE_TYPES.TILLED;
    this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
      type: 'tileChange', x: data.x, z: data.z, tileType: TILE_TYPES.TILLED,
    });
  }

  handlePlant(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || player.currentMap !== MAP_IDS.FARM) return;

    const seedId = data.cropType + '_seed';
    if (!player.hasItem(seedId)) return;
    if (!isValidTile(data.x, data.z)) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);
    const idx = tileIndex(data.x, data.z);
    if (farmMap.tiles[idx].type !== TILE_TYPES.TILLED) return;

    for (const crop of farmMap.crops.values()) {
      if (crop.tileX === data.x && crop.tileZ === data.z) return;
    }

    player.removeItem(seedId, 1);
    const crop = new Crop({ tileX: data.x, tileZ: data.z, cropType: data.cropType });
    farmMap.crops.set(crop.id, crop);

    this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, { type: 'cropPlanted', crop: crop.getState() });
    this._sendInventoryUpdate(socketId, player);
  }

  handleWater(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || !player.useEnergy(1) || player.currentMap !== MAP_IDS.FARM) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);
    for (const crop of farmMap.crops.values()) {
      if (crop.tileX === data.x && crop.tileZ === data.z) {
        crop.watered = true;
        this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, { type: 'cropWatered', cropId: crop.id });
        break;
      }
    }
  }

  handleHarvest(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || player.currentMap !== MAP_IDS.FARM) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);
    for (const [id, crop] of farmMap.crops.entries()) {
      if (crop.tileX === data.x && crop.tileZ === data.z && crop.stage >= 3) {
        const cropData = cropsData[crop.cropType];
        if (!cropData) continue;

        const yield_ = 1 + Math.floor(Math.random() * 2);
        const quality = this._rollCropQuality(player.getSkillLevel(SKILLS.FARMING));
        player.addItem(crop.cropType, yield_, quality);
        player.addSkillXP(SKILLS.FARMING, cropData.xp);

        if (cropData.regrows) {
          crop.stage = CROP_STAGES.MATURE;
          crop.growth = 0;
          crop.watered = false;
          this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, { type: 'cropUpdate', crop: crop.getState() });
        } else {
          farmMap.crops.delete(id);
          const idx = tileIndex(data.x, data.z);
          farmMap.tiles[idx].type = TILE_TYPES.TILLED;
          this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
            type: 'cropHarvested', cropId: id, x: data.x, z: data.z,
          });
        }

        this._sendInventoryUpdate(socketId, player);
        break;
      }
    }
  }

  handleFishCast(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || !player.useEnergy(5)) return;

    const map = this._getPlayerMap(player);
    const idx = tileIndex(Math.floor(data.x), Math.floor(data.z));
    if (idx < 0 || idx >= map.tiles.length) return;
    if (map.tiles[idx].type !== TILE_TYPES.WATER) return;

    const location = 'pond';
    const fish = this.fishCalc.rollCatch(location, player.level);

    if (fish) {
      player.addItem(fish.id, 1);
      player.addSkillXP(SKILLS.FISHING, 5 + fish.rarity * 10);
      this._broadcastToMap(player.currentMap, ACTIONS.WORLD_UPDATE, {
        type: 'fishCaught', playerId: player.id, fish,
      });
      this._sendInventoryUpdate(socketId, player);
    } else {
      this._broadcastToMap(player.currentMap, ACTIONS.WORLD_UPDATE, {
        type: 'fishMiss', playerId: player.id,
      });
    }
  }

  handleNPCTalk(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    // NPCs only on town map
    if (player.currentMap !== MAP_IDS.TOWN) return;

    const townMap = this.maps.get(MAP_IDS.TOWN);
    const npc = townMap.npcs.find(n => n.id === data.npcId);
    if (!npc) return;

    const db = getDB();
    let rel = db.prepare('SELECT * FROM npc_relationships WHERE player_id = ? AND npc_id = ?')
      .get(player.id, npc.id);

    if (!rel) {
      db.prepare('INSERT INTO npc_relationships (player_id, npc_id) VALUES (?, ?)')
        .run(player.id, npc.id);
      rel = { hearts: 0, talked_today: 0 };
    }

    if (!rel.talked_today) {
      db.prepare('UPDATE npc_relationships SET hearts = MIN(hearts + 0.2, 10), talked_today = 1 WHERE player_id = ? AND npc_id = ?')
        .run(player.id, npc.id);
      rel.hearts = Math.min(rel.hearts + 0.2, 10);
    }

    const dialogue = npc.getDialogue(rel.hearts);
    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'npcDialogue', npcId: npc.id, npcName: npc.name, text: dialogue, hearts: rel.hearts,
    });
  }

  handleNPCGift(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    // NPCs only on town map
    if (player.currentMap !== MAP_IDS.TOWN) return;

    // Check player has the item
    if (!player.hasItem(data.itemId)) return;

    const townMap = this.maps.get(MAP_IDS.TOWN);
    const npc = townMap.npcs.find(n => n.id === data.npcId);
    if (!npc) return;

    const db = getDB();
    let rel = db.prepare('SELECT * FROM npc_relationships WHERE player_id = ? AND npc_id = ?')
      .get(player.id, npc.id);

    if (!rel) {
      db.prepare('INSERT INTO npc_relationships (player_id, npc_id) VALUES (?, ?)')
        .run(player.id, npc.id);
      rel = { hearts: 0, talked_today: 0, gifted_today: 0 };
    }

    // Check if already gifted today
    if (rel.gifted_today) {
      this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
        type: 'npcDialogue', npcId: npc.id, npcName: npc.name,
        text: `${npc.name} has already received a gift today.`, hearts: rel.hearts,
      });
      return;
    }

    // Determine preference tier
    const npcData = npcsData.find(n => n.id === npc.id);
    let points = GIFT_POINTS.NEUTRAL;
    let tier = 'NEUTRAL';

    if (npcData.lovedGifts && npcData.lovedGifts.includes(data.itemId)) {
      points = GIFT_POINTS.LOVED;
      tier = 'LOVED';
    } else if (npcData.likedGifts && npcData.likedGifts.includes(data.itemId)) {
      points = GIFT_POINTS.LIKED;
      tier = 'LIKED';
    } else if (npcData.hatedGifts && npcData.hatedGifts.includes(data.itemId)) {
      points = GIFT_POINTS.HATED;
      tier = 'HATED';
    }

    // Convert points to hearts (250 points = 1 heart, max 10)
    const heartGain = points / 250;
    const newHearts = Math.max(0, Math.min(10, rel.hearts + heartGain));

    // Remove item from player inventory
    player.removeItem(data.itemId, 1);

    // Update DB
    db.prepare('UPDATE npc_relationships SET hearts = ?, gifted_today = 1 WHERE player_id = ? AND npc_id = ?')
      .run(newHearts, player.id, npc.id);

    // Build response text based on tier
    let responseText;
    switch (tier) {
      case 'LOVED':
        responseText = `Oh my! I LOVE this! Thank you so much!`;
        break;
      case 'LIKED':
        responseText = `Oh, how nice! I really like this. Thank you!`;
        break;
      case 'HATED':
        responseText = `...Why would you give me this?`;
        break;
      default:
        responseText = `Oh, a gift? That's thoughtful, thank you.`;
        break;
    }

    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'npcDialogue', npcId: npc.id, npcName: npc.name, text: responseText, hearts: newHearts,
    });
    this._sendInventoryUpdate(socketId, player);
  }

  handleAnimalFeed(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || player.currentMap !== MAP_IDS.FARM) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);
    const animal = farmMap.animals.get(data.animalId);
    if (!animal) return;

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
    if (!result) return;

    const quality = result.qualityBonus > 1 ? 1 : 0;
    player.addItem(animalData.product, 1, quality);
    player.addSkillXP(SKILLS.FARMING, 5);

    this._sendInventoryUpdate(socketId, player);
    this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
      type: 'animalUpdate', animal: animal.getState(),
    });
  }

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
        message = `${pet.name || 'Pet'} wags happily!`;
        break;
      case 'feed':
        pet.feed();
        message = `${pet.name || 'Pet'} eats eagerly!`;
        break;
      case 'train':
        if (pet.energy < 20) {
          message = `${pet.name || 'Pet'} is too tired to train.`;
          break;
        }
        pet.train();
        message = `${pet.name || 'Pet'} learned something new!`;
        break;
      default:
        return;
    }

    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'petUpdate', pet: pet.getState(), message,
    });
  }

  handleShopBuy(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

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

    const slot = player.inventory.find(i => i.itemId === data.itemId);
    const quality = slot?.quality || 0;
    const price = Math.floor(basePrice * QUALITY_MULTIPLIER[quality]) * quantity;

    player.removeItem(data.itemId, quantity, quality);
    player.coins += price;
    player.addSkillXP(SKILLS.FARMING, 2 * quantity);
    this._sendInventoryUpdate(socketId, player);
  }

  // --- Shipping Bin ---

  handleShipItem(player, itemId, quantity) {
    const slot = player.inventory.find(i => i.itemId === itemId && i.quantity >= quantity);
    if (!slot) return null;

    const quality = slot.quality || 0;
    player.removeItem(itemId, quantity, quality);

    if (!this.shippingBins.has(player.id)) this.shippingBins.set(player.id, []);
    this.shippingBins.get(player.id).push({ itemId, quantity, quality });

    this._sendInventoryUpdate(player.socketId, player);
    return { itemId, quantity };
  }

  _processShippingBins() {
    for (const [playerId, items] of this.shippingBins) {
      let player = null;
      for (const p of this.players.values()) {
        if (p.id === playerId) { player = p; break; }
      }
      if (!player) continue;

      let totalCoins = 0;
      for (const item of items) {
        const cropData = cropsData[item.itemId];
        const fishItem = fishData[item.itemId];
        const basePrice = cropData?.sellPrice || fishItem?.value || 10;
        const multiplier = QUALITY_MULTIPLIER[item.quality] || 1;
        totalCoins += Math.floor(basePrice * multiplier) * item.quantity;
      }

      if (totalCoins > 0) {
        player.coins += totalCoins;
        this._sendInventoryUpdate(player.socketId, player);
        logger.info('SHIPPING', `Player ${player.name} earned ${totalCoins} coins from shipping bin`);
      }
    }
    this.shippingBins.clear();
  }

  // --- Helpers ---

  _rollCropQuality(farmingLevel) {
    const roll = Math.random();
    const goldChance = farmingLevel * 0.015;
    const silverChance = farmingLevel * 0.03;
    if (roll < goldChance) return 2;
    if (roll < goldChance + silverChance) return 1;
    return 0;
  }

  _sendInventoryUpdate(socketId, player) {
    this.io.to(socketId).emit(ACTIONS.INVENTORY_UPDATE, {
      inventory: player.inventory,
      coins: player.coins,
      level: player.level,
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      skills: player.skills,
    });
  }

  /** Broadcast to all players on a specific map, optionally excluding one socket */
  _broadcastToMap(mapId, event, data, excludeSocketId = null) {
    for (const [socketId, player] of this.players) {
      if (player.currentMap === mapId && socketId !== excludeSocketId) {
        this.io.to(socketId).emit(event, data);
      }
    }
  }

  _broadcastWorldUpdate() {
    // Send full sync to all players, scoped to their current map
    for (const [socketId, player] of this.players) {
      const map = this._getPlayerMap(player);
      const crops = Array.from(map.crops.values()).map(c => c.getState());
      const animals = Array.from(map.animals.values()).map(a => a.getState());
      const pets = Array.from(map.pets.values()).map(p => p.getState());
      this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, { type: 'fullSync', crops, animals, pets });
    }
  }

  _getFullState(player) {
    const map = this._getPlayerMap(player);
    const mapState = map.getFullState();

    // Only include players on the same map
    const samePlayers = [];
    for (const p of this.players.values()) {
      if (p.currentMap === player.currentMap) {
        samePlayers.push(p.getState());
      }
    }

    return {
      playerId: player.id,
      mapId: player.currentMap,
      tiles: mapState.tiles,
      decorations: mapState.decorations,
      crops: mapState.crops,
      animals: mapState.animals,
      pets: mapState.pets,
      npcs: mapState.npcs,
      players: samePlayers,
      buildings: mapState.buildings,
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
