// server/game/GameWorld.js
// The master game world — owns all state, runs the tick loop,
// processes player actions, and broadcasts updates.
// Supports multiple maps (farm, town) with portal transitions.

import { v4 as uuid } from 'uuid';
import { TICK_RATE, TILE_TYPES, ACTIONS, TIME_SCALE, SKILLS, QUALITY_MULTIPLIER, CROP_STAGES, MAP_IDS, GIFT_POINTS, TOOL_TIERS, TOOL_UPGRADE_COST, TOOL_ENERGY_COST, SPRINKLER_DATA, FERTILIZER_DATA, FORAGE_ITEMS, PROFESSIONS, RESOURCE_DATA, HOLD_EXPAND_ENERGY_MULT, DAYS_PER_SEASON } from '../../shared/constants.js';
import { isValidTile, tileIndex, tileToWorld } from '../../shared/TileMap.js';
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
import { Sprinkler } from '../entities/Sprinkler.js';
import { Machine } from '../entities/Machine.js';
import { Resource } from '../entities/Resource.js';
import { FishCalculator } from '../entities/Fish.js';
import { ForagingSystem } from './ForagingSystem.js';
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
const machinesData = JSON.parse(readFileSync(join(dataDir, 'machines.json'), 'utf-8'));
const cosmeticsData = JSON.parse(readFileSync(join(dataDir, 'cosmetics.json'), 'utf-8'));

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

    // Foraging systems (one per map)
    this.farmForaging = new ForagingSystem();
    this.townForaging = new ForagingSystem();

    // Start tick loop
    this._tickInterval = null;
    this._lastTick = Date.now();
  }

  _initMaps() {
    // Farm map
    const farmTiles = this.terrainGen.generate();
    const farmDecorations = this.decorationGen.generate(farmTiles);

    // Separate trees/rocks into Resource entities (interactive), keep rest as decorations
    const farmResources = [];
    const nonResourceDecorations = [];
    for (const dec of farmDecorations) {
      if (dec.type === 'tree' || dec.type === 'rock') {
        farmResources.push(dec);
      } else {
        nonResourceDecorations.push(dec);
      }
    }

    const farmMap = new MapInstance(MAP_IDS.FARM, {
      tiles: farmTiles,
      decorations: nonResourceDecorations,
      portals: [
        // South edge portal → town (north edge)
        { x: 29, z: 61, width: 6, height: 3, targetMap: MAP_IDS.TOWN, spawnX: 31, spawnZ: 3 },
      ],
    });

    // Populate resource entities from extracted trees/rocks
    for (const dec of farmResources) {
      const resData = RESOURCE_DATA[dec.type];
      const resource = new Resource({
        tileX: dec.x, tileZ: dec.z, type: dec.type,
        variant: dec.variant || 0,
        health: resData.health,
      });
      farmMap.resources.set(resource.id, resource);
    }

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
    farmMap.buildings.set('farm_mill', {
      id: 'farm_mill', type: 'mill', tileX: 38, tileZ: 31,
      processing: null,
    });
    farmMap.buildings.set('farm_forge', {
      id: 'farm_forge', type: 'forge', tileX: 38, tileZ: 34,
      processing: null,
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

    // Spawn starter pets
    const stitch = new Pet({ ownerId: null, type: 'chihuahua', name: 'Stitch',
      bodySize: 0.15, earSize: 0.12, tailLength: 0.12, color: 0x444444, x: 30, z: 31 });
    const scout = new Pet({ ownerId: null, type: 'labrador', name: 'Scout',
      bodySize: 0.35, earSize: 0.10, tailLength: 0.22, color: 0x1a1a1a, x: 31, z: 32 });
    farmMap.pets.set(stitch.id, stitch);
    farmMap.pets.set(scout.id, scout);

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
    // Spawn initial forage items
    const farmMap = this.maps.get(MAP_IDS.FARM);
    const townMap = this.maps.get(MAP_IDS.TOWN);
    this.farmForaging.spawnDaily(farmMap.tiles, this.time.season, 6);
    this.townForaging.spawnDaily(townMap.tiles, this.time.season, 4);

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

    // Spawn daily forage items
    const farmMap = this.maps.get(MAP_IDS.FARM);
    const townMap = this.maps.get(MAP_IDS.TOWN);
    this.farmForaging.spawnDaily(farmMap.tiles, this.time.season, 6);
    this.townForaging.spawnDaily(townMap.tiles, this.time.season, 4);

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

    // Rain waters all crops on farm
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
    const professions = row.professions ? JSON.parse(row.professions) : {};
    const player = new Player({ id: playerId, name: data.name || row.name, skills, professions, appearance: data.appearance });
    player.socketId = socket.id;
    this.players.set(socket.id, player);

    // Assign unowned pet to this player
    const farmMap = this.maps.get(MAP_IDS.FARM);
    for (const pet of farmMap.pets.values()) {
      if (!pet.ownerId) {
        pet.ownerId = player.id;
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

    // Convert tile-based spawn to world coords (consistent with movement coords)
    const spawnWorld = tileToWorld(portal.spawnX, portal.spawnZ);
    player.currentMap = newMap;
    player.x = spawnWorld.x;
    player.z = spawnWorld.z;

    // Notify players on old map that this player left
    this._broadcastToMap(oldMap, ACTIONS.PLAYER_LEAVE, { playerId: player.id }, socketId);

    // Send the new map state to this player
    const targetMap = this.maps.get(newMap);
    const mapState = targetMap.getFullState();

    const forageItems = newMap === MAP_IDS.FARM
      ? this.farmForaging.getState()
      : this.townForaging.getState();

    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'mapTransition',
      mapId: newMap,
      mapState,
      spawnX: spawnWorld.x,
      spawnZ: spawnWorld.z,
      season: this.time.season,
      forageItems,
    });

    // Notify players on new map that this player joined
    this._broadcastToMap(newMap, ACTIONS.PLAYER_JOIN, { player: player.getState() }, socketId);

    logger.info('GAME', `${player.name} transitioned ${oldMap} → ${newMap}`);
  }

  _isPlayerInRange(player, tileX, tileZ, range = 3) {
    const px = Math.floor(player.x);
    const pz = Math.floor(player.z);
    return Math.abs(px - tileX) + Math.abs(pz - tileZ) <= range;
  }

  handleTill(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;
    const energyCost = TOOL_ENERGY_COST.hoe[player.toolTiers?.hoe || 0] || 2;
    if (!player.useEnergy(energyCost)) return;
    if (player.currentMap !== MAP_IDS.FARM) return; // only on farm
    if (!isValidTile(data.x, data.z)) return;
    if (!this._isPlayerInRange(player, data.x, data.z)) return;

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
    if (!this._isPlayerInRange(player, data.x, data.z)) return;

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
    if (!player || player.currentMap !== MAP_IDS.FARM) return;
    if (!this._isPlayerInRange(player, data.x, data.z)) return;
    const energyCost = TOOL_ENERGY_COST.watering_can[player.toolTiers?.watering_can || 0] || 1;
    if (!player.useEnergy(energyCost)) return;

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
    if (!this._isPlayerInRange(player, data.x, data.z)) return;
    const energyCost = TOOL_ENERGY_COST.pickaxe[player.toolTiers?.pickaxe || 0] || 3;
    if (!player.useEnergy(energyCost)) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);
    for (const [id, crop] of farmMap.crops.entries()) {
      if (crop.tileX === data.x && crop.tileZ === data.z && crop.stage >= 3) {
        const cropData = cropsData[crop.cropType];
        if (!cropData) continue;

        const yield_ = 1 + Math.floor(Math.random() * 2);
        const quality = this._rollCropQuality(player.getSkillLevel(SKILLS.FARMING), crop.fertilizer);
        player.addItem(crop.cropType, yield_, quality);
        player.addSkillXP(SKILLS.FARMING, cropData.xp);
        this._checkPendingProfession(socketId, player);

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
    if (!player) { logger.warn('FISH', 'No player found', { socketId }); return; }
    if (!player.useEnergy(5)) { logger.warn('FISH', 'Not enough energy', { energy: player.energy }); return; }

    // Prevent casting while already fishing
    if (player._fishingState) { logger.warn('FISH', 'Already fishing'); return; }

    const map = this._getPlayerMap(player);
    const tileX = Math.floor(data.x);
    const tileZ = Math.floor(data.z);
    const idx = tileIndex(tileX, tileZ);
    if (idx < 0 || idx >= map.tiles.length) { logger.warn('FISH', 'Tile out of bounds', { tileX, tileZ, idx }); return; }
    if (map.tiles[idx].type !== TILE_TYPES.WATER) { logger.warn('FISH', 'Not water tile', { tileX, tileZ, type: map.tiles[idx].type }); return; }

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

    logger.info('FISH', 'Cast processed', { location, fishingLevel, season, hour, isRaining, fishFound: !!fish, fishName: fish?.name });

    if (!fish) {
      // No fish available — immediate miss
      logger.warn('FISH', 'No fish available for conditions');
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
    const emitData = {
      type: 'npcDialogue', npcId: npc.id, npcName: npc.name, text: dialogue, hearts: rel.hearts,
    };

    // Include upgrade options for Blacksmith
    if (npc.role === 'Blacksmith') {
      const upgradeOptions = {};
      for (const [tool, tier] of Object.entries(player.toolTiers)) {
        if (tier < TOOL_TIERS.IRIDIUM) {
          const cost = TOOL_UPGRADE_COST[tier + 1];
          upgradeOptions[tool] = { currentTier: tier, nextTier: tier + 1, ...cost };
        }
      }
      emitData.upgradeOptions = upgradeOptions;
    }

    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, emitData);
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
    this._checkPendingProfession(socketId, player);

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

  handlePetGroom(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || player.currentMap !== MAP_IDS.FARM) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);
    const pet = farmMap.pets.get(data.petId);
    if (!pet || pet.ownerId !== player.id) return;

    const stars = Math.max(1, Math.min(3, data.stars || 1));
    const result = pet.groom(stars, this.time.day);

    if (!result.success) {
      this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
        type: 'petGroomResult', success: false, message: result.message,
      });
      return;
    }

    // Roll cosmetic drop
    let newCosmetic = null;
    const roll = Math.random();
    const dropChances = { 0: 0.30, 1: 0.10, 2: 0.02 };

    for (const rarity of [2, 1, 0]) {
      if (roll < dropChances[rarity]) {
        const available = Object.entries(cosmeticsData).filter(
          ([id, c]) => c.rarity === rarity && !pet.cosmetics.unlocked.includes(id)
        );
        if (available.length > 0) {
          const pick = available[Math.floor(Math.random() * available.length)];
          newCosmetic = pick[0];
          pet.cosmetics.unlocked.push(newCosmetic);
        }
        break;
      }
    }

    if (data.equipped) {
      pet.equipCosmetics(data.equipped);
    }

    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'petGroomResult',
      success: true,
      pet: pet.getState(),
      stars,
      happinessGain: result.happinessGain,
      loyaltyGain: result.loyaltyGain,
      newCosmetic: newCosmetic ? { id: newCosmetic, ...cosmeticsData[newCosmetic] } : null,
    });

    this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
      type: 'petUpdate', pet: pet.getState(),
    }, socketId);
  }

  handleCraftStart(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || player.currentMap !== MAP_IDS.FARM) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);
    const building = farmMap.buildings.get(data.buildingId);
    if (!building) return;
    if (building.processing) {
      this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
        type: 'craftError', message: 'This machine is already processing.',
      });
      return;
    }

    const recipe = recipesData[data.recipeId];
    if (!recipe || recipe.building !== building.type) return;

    // Check player has all inputs
    for (const [itemId, qty] of Object.entries(recipe.inputs)) {
      if (!player.hasItem(itemId, qty)) {
        this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
          type: 'craftError', message: `Need more ${itemId}.`,
        });
        return;
      }
    }

    // Consume inputs
    for (const [itemId, qty] of Object.entries(recipe.inputs)) {
      player.removeItem(itemId, qty);
    }

    // Start processing (time in hours -> milliseconds)
    const now = Date.now();
    building.processing = {
      recipeId: data.recipeId,
      startTime: now,
      endTime: now + recipe.time * 3600 * 1000,
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
        type: 'craftError', message: `Still processing. ${remaining} min left.`,
      });
      return;
    }

    const recipe = recipesData[building.processing.recipeId];
    if (!recipe) return;

    player.addItem(recipe.output, recipe.count || 1);
    player.addSkillXP(SKILLS.FARMING, recipe.xp || 5);
    this._checkPendingProfession(socketId, player);
    building.processing = null;

    this._sendInventoryUpdate(socketId, player);
    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'craftCollected', buildingId: building.id,
      itemId: recipe.output, quantity: recipe.count || 1,
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
    const fishItem = fishData[data.itemId];
    let basePrice = cropData?.sellPrice || fishItem?.value || 10;

    const slot = player.inventory.find(i => i.itemId === data.itemId);
    const quality = slot?.quality || 0;
    let price = Math.floor(basePrice * QUALITY_MULTIPLIER[quality]) * quantity;

    // Tiller profession: +10% crop sell value
    if (cropData && player.hasProfession('tiller')) {
      price = Math.floor(price * 1.1);
    }

    // Fisher/Angler profession: fish sell value bonus
    if (fishItem) {
      const fishBonus = player.getProfessionBonus('fishSellValue');
      if (fishBonus > 0) {
        price = Math.floor(price * (1 + fishBonus));
      }
    }

    player.removeItem(data.itemId, quantity, quality);
    player.coins += price;
    player.addSkillXP(SKILLS.FARMING, 2 * quantity);
    this._checkPendingProfession(socketId, player);
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
        let price = Math.floor(basePrice * multiplier) * item.quantity;

        // Tiller profession: +10% crop sell value
        if (cropData && player.hasProfession('tiller')) {
          price = Math.floor(price * 1.1);
        }

        // Fisher/Angler profession: fish sell value bonus
        if (fishItem) {
          const fishBonus = player.getProfessionBonus('fishSellValue');
          if (fishBonus > 0) {
            price = Math.floor(price * (1 + fishBonus));
          }
        }

        totalCoins += price;
      }

      if (totalCoins > 0) {
        player.coins += totalCoins;
        this._sendInventoryUpdate(player.socketId, player);
        logger.info('SHIPPING', `Player ${player.name} earned ${totalCoins} coins from shipping bin`);
      }
    }
    this.shippingBins.clear();
  }

  handleToolUpgrade(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || player.currentMap !== MAP_IDS.TOWN) return;

    const tool = data.tool;
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

  handlePlaceSprinkler(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || player.currentMap !== MAP_IDS.FARM) return;
    if (!player.hasItem(data.sprinklerType, 1)) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);

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

  handleApplyFertilizer(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || player.currentMap !== MAP_IDS.FARM) return;
    if (!player.hasItem(data.fertilizerType, 1)) return;
    if (!FERTILIZER_DATA[data.fertilizerType]) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);
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

  // --- Processing Machines ---

  handlePlaceMachine(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || player.currentMap !== MAP_IDS.FARM) return;
    if (!player.hasItem(data.machineType, 1)) return;
    if (!machinesData[data.machineType]) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);

    // Don't place on existing machine
    for (const m of farmMap.machines.values()) {
      if (m.tileX === data.x && m.tileZ === data.z) return;
    }

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

    const machineInfo = machinesData[machine.type];
    if (!machineInfo) return;

    let outputItem, outputValue, timeHours;

    for (const recipe of Object.values(machineInfo.recipes)) {
      if (recipe.input && recipe.input === data.itemId) {
        outputItem = recipe.output;
        outputValue = recipe.outputValue;
        timeHours = recipe.timeHours;
        break;
      }
      if (recipe.inputCategory === 'crop') {
        // Check if the item is a known crop
        const cropInfo = cropsData[data.itemId];
        if (cropInfo) {
          outputItem = recipe.output;
          if (recipe.valueMultiplier) {
            outputValue = Math.floor(cropInfo.sellPrice * recipe.valueMultiplier);
          }
          if (recipe.valueBonus) {
            outputValue = (outputValue || Math.floor(cropInfo.sellPrice * 2)) + recipe.valueBonus;
          }
          timeHours = recipe.timeHours;
          break;
        }
      }
    }

    if (!outputItem || !timeHours) return;

    player.removeItem(data.itemId, 1);
    machine.startProcessing(data.itemId, outputItem, outputValue || 0, timeHours * 3600 * 1000);

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
    this._checkPendingProfession(socketId, player);

    this._sendInventoryUpdate(socketId, player);
    this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
      type: 'machineUpdate', machine: machine.getState(),
    });
  }

  // --- Foraging ---

  handleForageCollect(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    const foraging = player.currentMap === MAP_IDS.FARM ? this.farmForaging : this.townForaging;
    const spawn = foraging.collectAt(data.x, data.z);
    if (!spawn) return;

    const quality = this._rollForageQuality(player.getSkillLevel(SKILLS.FORAGING), player);

    // Gatherer profession: 20% chance double forage
    let qty = 1;
    if (player.hasProfession('gatherer') && Math.random() < 0.2) {
      qty = 2;
    }

    player.addItem(spawn.itemId, qty, quality);
    player.addSkillXP(SKILLS.FORAGING, 7);
    this._checkPendingProfession(socketId, player);

    this._sendInventoryUpdate(socketId, player);
    this._broadcastToMap(player.currentMap, ACTIONS.WORLD_UPDATE, {
      type: 'forageCollected', spawnId: spawn.id,
    });
  }

  _rollForageQuality(foragingLevel, player = null) {
    // Botanist profession: forage always gold quality
    if (player && player.hasProfession('botanist')) return 2;

    const roll = Math.random();
    if (roll < foragingLevel * 0.01) return 2;
    if (roll < foragingLevel * 0.03) return 1;
    return 0;
  }

  // --- Resources (trees/rocks) ---

  handleResourceHit(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || player.currentMap !== MAP_IDS.FARM) return;
    if (!this._isPlayerInRange(player, data.x, data.z)) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);

    // Find resource at the given tile
    let resource = null;
    for (const r of farmMap.resources.values()) {
      if (r.tileX === data.x && r.tileZ === data.z) {
        resource = r;
        break;
      }
    }
    if (!resource) return;

    const resData = RESOURCE_DATA[resource.type];
    if (!resData) return;

    // Check energy for the required tool
    const tool = resData.tool;
    const tierIndex = player.toolTiers?.[tool] || 0;
    const energyCost = TOOL_ENERGY_COST[tool]?.[tierIndex] || 2;
    if (!player.useEnergy(energyCost)) return;

    // Determine skill for XP
    const skill = resource.type === 'tree' ? SKILLS.FORAGING : SKILLS.MINING;
    player.addSkillXP(skill, resData.xpPerHit || 2);
    this._checkPendingProfession(socketId, player);

    // Apply hit
    const destroyed = resource.hit(1);

    if (destroyed) {
      if (resource.type === 'tree' && !resource.isStump) {
        // Tree destroyed -> drop items, convert to stump
        for (const drop of resData.drops) {
          player.addItem(drop.itemId, drop.quantity);
        }
        resource.isStump = true;
        resource.health = resData.stumpHealth;
        this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
          type: 'resourceUpdate', resource: resource.getState(),
        });
      } else {
        // Stump or rock destroyed -> drop items, remove from map
        const drops = resource.isStump ? resData.stumpDrops : resData.drops;
        if (drops) {
          for (const drop of drops) {
            player.addItem(drop.itemId, drop.quantity);
          }
        }

        // If rock was on STONE tile, revert to GRASS
        if (resource.type === 'rock') {
          const idx = tileIndex(resource.tileX, resource.tileZ);
          if (idx >= 0 && idx < farmMap.tiles.length && farmMap.tiles[idx].type === TILE_TYPES.STONE) {
            farmMap.tiles[idx].type = TILE_TYPES.GRASS;
          }
        }

        farmMap.resources.delete(resource.id);
        this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
          type: 'resourceRemoved', resourceId: resource.id, x: resource.tileX, z: resource.tileZ,
        });
      }
      this._sendInventoryUpdate(socketId, player);
    } else {
      // Not destroyed — broadcast shake
      this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
        type: 'resourceHit', resourceId: resource.id, health: resource.health,
      });
      this._sendInventoryUpdate(socketId, player);
    }
  }

  // --- Multi-tile handlers ---

  handleMultiTill(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || player.currentMap !== MAP_IDS.FARM) return;
    if (!data.tiles || !Array.isArray(data.tiles)) return;

    const tiles = data.tiles.slice(0, 3); // max 3 tiles
    const baseCost = TOOL_ENERGY_COST.hoe[player.toolTiers?.hoe || 0] || 2;
    const energyCost = Math.ceil(HOLD_EXPAND_ENERGY_MULT * baseCost);
    if (!player.useEnergy(energyCost)) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);
    const changedTiles = [];

    for (const t of tiles) {
      if (!isValidTile(t.x, t.z)) continue;
      const idx = tileIndex(t.x, t.z);
      const tile = farmMap.tiles[idx];
      if (tile.type !== TILE_TYPES.DIRT && tile.type !== TILE_TYPES.GRASS) continue;
      tile.type = TILE_TYPES.TILLED;
      changedTiles.push({ x: t.x, z: t.z, tileType: TILE_TYPES.TILLED });
    }

    if (changedTiles.length > 0) {
      this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
        type: 'tileChangeBatch', tiles: changedTiles,
      });
    }
  }

  handleMultiWater(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || player.currentMap !== MAP_IDS.FARM) return;
    if (!data.tiles || !Array.isArray(data.tiles)) return;

    const tiles = data.tiles.slice(0, 3);
    const baseCost = TOOL_ENERGY_COST.watering_can[player.toolTiers?.watering_can || 0] || 1;
    const energyCost = Math.ceil(HOLD_EXPAND_ENERGY_MULT * baseCost);
    if (!player.useEnergy(energyCost)) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);
    const wateredCrops = [];

    for (const t of tiles) {
      for (const crop of farmMap.crops.values()) {
        if (crop.tileX === t.x && crop.tileZ === t.z) {
          crop.watered = true;
          wateredCrops.push(crop.id);
          break;
        }
      }
    }

    if (wateredCrops.length > 0) {
      this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
        type: 'cropWateredBatch', cropIds: wateredCrops,
      });
    }
  }

  handleMultiPlant(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || player.currentMap !== MAP_IDS.FARM) return;
    if (!data.tiles || !Array.isArray(data.tiles) || !data.cropType) return;

    const farmMap = this.maps.get(MAP_IDS.FARM);
    const seedId = data.cropType + '_seed';
    const plantedCrops = [];

    for (const t of data.tiles) {
      if (!player.hasItem(seedId)) break;
      if (!isValidTile(t.x, t.z)) continue;

      const idx = tileIndex(t.x, t.z);
      if (farmMap.tiles[idx].type !== TILE_TYPES.TILLED) continue;

      // Check no existing crop at this tile
      let occupied = false;
      for (const crop of farmMap.crops.values()) {
        if (crop.tileX === t.x && crop.tileZ === t.z) { occupied = true; break; }
      }
      if (occupied) continue;

      player.removeItem(seedId, 1);
      const crop = new Crop({ tileX: t.x, tileZ: t.z, cropType: data.cropType });
      farmMap.crops.set(crop.id, crop);
      plantedCrops.push(crop.getState());
    }

    if (plantedCrops.length > 0) {
      this._broadcastToMap(MAP_IDS.FARM, ACTIONS.WORLD_UPDATE, {
        type: 'cropPlantedBatch', crops: plantedCrops,
      });
      this._sendInventoryUpdate(socketId, player);
    }
  }

  // --- Rest at House ---

  handleRestAtHouse(socketId) {
    const player = this.players.get(socketId);
    if (!player || player.currentMap !== MAP_IDS.FARM) return;

    // Must be near house (within ~4 tiles)
    const house = this.maps.get(MAP_IDS.FARM).buildings.get('house_main');
    if (!house) return;
    const hx = house.tileX + 2, hz = house.tileZ + 1;
    const px = Math.floor(player.x), pz = Math.floor(player.z);
    if (Math.abs(px - hx) > 4 || Math.abs(pz - hz) > 4) return;

    // Advance to 6 AM next day
    this.time.hour = 6.0;
    this.time.day++;
    if (this.time.day > DAYS_PER_SEASON) {
      this.time.day = 1;
      this.time.season = (this.time.season + 1) % 4;
      this._onNewSeason(this.time.season);
    }

    this._onNewDay();
    this.io.emit(ACTIONS.TIME_UPDATE, this.time.getState());
    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, { type: 'restComplete' });
    this._broadcastWorldUpdate();
  }

  // --- Professions ---

  _getProfessionOptions(player, skill, level) {
    const skillProfs = PROFESSIONS[skill];
    if (!skillProfs) return [];

    if (level === 5) {
      return skillProfs[5] || [];
    }

    if (level === 10) {
      // Find which level-5 profession was chosen
      const chosen5 = (player.professions[skill] || [])[0];
      if (!chosen5 || !skillProfs[10][chosen5]) return [];
      return skillProfs[10][chosen5];
    }

    return [];
  }

  _checkPendingProfession(socketId, player) {
    if (player._pendingProfession) {
      const { skill, level } = player._pendingProfession;
      const options = this._getProfessionOptions(player, skill, level);
      if (options.length > 0) {
        this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
          type: 'professionChoice', skill, level, options,
        });
      }
      player._pendingProfession = null;
    }
  }

  handleProfessionChoice(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    const { skill, professionId } = data;

    // Validate the skill exists in PROFESSIONS
    const skillProfs = PROFESSIONS[skill];
    if (!skillProfs) return;

    if (!player.professions[skill]) player.professions[skill] = [];

    // Don't allow picking same level twice
    const existingCount = player.professions[skill].length;
    const skillLevel = player.getSkillLevel(skill);
    if (existingCount >= 1 && skillLevel < 10) return;
    if (existingCount >= 2) return;

    // Validate that the professionId is actually a valid option
    const level = existingCount === 0 ? 5 : 10;
    const options = this._getProfessionOptions(player, skill, level);
    if (!options.find(o => o.id === professionId)) return;

    player.professions[skill].push(professionId);

    // Save to database
    const db = getDB();
    db.prepare('UPDATE players SET professions = ? WHERE id = ?')
      .run(JSON.stringify(player.professions), player.id);

    this._sendInventoryUpdate(socketId, player);
    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'professionChosen', skill, professionId,
    });
  }

  // --- Helpers ---

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

  _sendInventoryUpdate(socketId, player) {
    this.io.to(socketId).emit(ACTIONS.INVENTORY_UPDATE, {
      inventory: player.inventory,
      coins: player.coins,
      level: player.level,
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      skills: player.skills,
      professions: player.professions,
      toolTiers: player.toolTiers,
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
      const sprinklers = Array.from(map.sprinklers.values()).map(s => s.getState());
      const machines = Array.from(map.machines.values()).map(m => m.getState());
      const resources = Array.from(map.resources.values()).map(r => r.getState());
      const forageItems = player.currentMap === MAP_IDS.FARM
        ? this.farmForaging.getState()
        : this.townForaging.getState();
      this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, { type: 'fullSync', crops, animals, pets, sprinklers, machines, resources, forageItems });
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
      cropsData,
      animals: mapState.animals,
      pets: mapState.pets,
      npcs: mapState.npcs,
      sprinklers: mapState.sprinklers,
      machines: mapState.machines,
      resources: mapState.resources,
      players: samePlayers,
      buildings: mapState.buildings,
      time: this.time.getState(),
      weather: this.weather.getState(),
      recipes: recipesData,
      forageItems: player.currentMap === MAP_IDS.FARM
        ? this.farmForaging.getState()
        : this.townForaging.getState(),
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
      // Also persist professions
      db.prepare('UPDATE players SET professions = ? WHERE id = ?')
        .run(JSON.stringify(player.professions), player.id);
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
