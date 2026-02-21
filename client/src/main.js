// client/src/main.js
// OurFarm client entry point.
// Connects to server, sets up Three.js scene, wires all systems together.

import { SceneManager } from './engine/SceneManager.js';
import { InputManager } from './engine/InputManager.js';
import { AssetGenerator } from './engine/AssetGenerator.js';
import { NetworkClient } from './network/NetworkClient.js';
import { TerrainRenderer } from './world/TerrainRenderer.js';
import { WaterRenderer } from './world/WaterRenderer.js';
import { CropRenderer } from './world/CropRenderer.js';
import { SprinklerRenderer } from './world/SprinklerRenderer.js';
import { WeatherRenderer } from './world/WeatherRenderer.js';
import { BuildingRenderer } from './world/BuildingRenderer.js';
import { DecorationRenderer } from './world/DecorationRenderer.js';
import { AmbientCreatureRenderer } from './world/AmbientCreatureRenderer.js';
import { PlayerRenderer } from './entities/PlayerRenderer.js';
import { NPCRenderer } from './entities/NPCRenderer.js';
import { PetRenderer } from './entities/PetRenderer.js';
import { AnimalRenderer } from './entities/AnimalRenderer.js';
import { HUD } from './ui/HUD.js';
import { InventoryUI } from './ui/Inventory.js';
import { DialogueUI } from './ui/DialogueUI.js';
import { CraftingUI } from './ui/CraftingUI.js';
import { DebugWindow } from './ui/DebugWindow.js';
import { getToolAction, isSeed } from './ui/ItemIcons.js';
import { tileToWorld } from '@shared/TileMap.js';
import { TILE_TYPES } from '@shared/constants.js';
import { debugClient } from './utils/DebugClient.js';

async function main() {
  // --- Engine Setup ---
  const canvas = document.getElementById('game-canvas');
  const sceneManager = new SceneManager(canvas);
  const input = new InputManager(sceneManager);
  const assets = new AssetGenerator();

  // --- Renderers ---
  const terrain = new TerrainRenderer(sceneManager.scene);
  const water = new WaterRenderer(sceneManager.scene);
  const crops = new CropRenderer(sceneManager.scene, assets);
  const weather = new WeatherRenderer(sceneManager.scene);
  const buildings = new BuildingRenderer(sceneManager.scene, assets);
  const decorations = new DecorationRenderer(sceneManager.scene, assets);
  const players = new PlayerRenderer(sceneManager.scene, assets);
  const npcs = new NPCRenderer(sceneManager.scene, assets);
  const pets = new PetRenderer(sceneManager.scene, assets);
  const animals = new AnimalRenderer(sceneManager.scene, assets);
  const sprinklers = new SprinklerRenderer(sceneManager.scene);

  // --- UI ---
  const hud = new HUD(document.getElementById('hud'));
  const inventoryUI = new InventoryUI(document.getElementById('inventory-panel'));
  const dialogueUI = new DialogueUI(document.getElementById('dialogue-panel'));
  const debugWindow = new DebugWindow();
  debugWindow.setRenderer(sceneManager.renderer);
  const craftingUI = new CraftingUI();

  // Wire backpack right-click → action bar quick-add
  inventoryUI.onQuickAdd = (itemId) => {
    hud.addToFirstEmptySlot(itemId);
  };

  // Wire gift-giving flow
  dialogueUI.onGiftRequest = (npcId) => {
    const activeItem = hud.getActiveItem();
    if (activeItem && activeItem.itemId) {
      network.sendNPCGift(npcId, activeItem.itemId);
      dialogueUI.hide();
    }
  };

  // Wire tool upgrade flow
  dialogueUI.onToolUpgrade = (tool) => {
    network.sendToolUpgrade(tool);
  };

  // --- Network ---
  const network = new NetworkClient();

  // Prompt for player name
  const playerName = prompt('Enter your farmer name:', 'Farmer') || 'Farmer';

  try {
    const state = await network.connect(playerName);

    // Activate debug instrumentation
    debugClient.init(state.playerId);
    debugClient.log('INIT', 'Connected to server', {
      playerId: state.playerId,
      tiles: state.tiles.length,
      crops: state.crops.length,
      npcs: state.npcs.length,
      players: state.players.length,
      time: state.time,
    });

    // --- Build world from server state ---
    terrain.build(state.tiles, state.time.season);
    water.build(state.tiles);
    crops.build(state.crops);
    npcs.build(state.npcs);
    pets.build(state.pets);
    animals.build(state.animals);
    buildings.build(state.buildings);
    decorations.build(state.decorations || []);
    sprinklers.build(state.sprinklers || []);

    // Ambient creatures (client-side only)
    let creatures = new AmbientCreatureRenderer(sceneManager.scene, state.tiles);

    // Store recipes and buildings for crafting UI
    const recipes = state.recipes || {};
    const buildingsMap = {};
    for (const b of state.buildings || []) {
      buildingsMap[b.id] = b;
    }

    // Wire crafting callbacks
    craftingUI.onCraftStart = (buildingId, recipeId) => network.sendCraftStart(buildingId, recipeId);
    craftingUI.onCraftCollect = (buildingId) => network.sendCraftCollect(buildingId);

    // Add players
    for (const p of state.players) {
      players.addPlayer(p, p.id === state.playerId);
    }

    // Update HUD
    let localPlayer = state.players.find(p => p.id === state.playerId);
    if (localPlayer) {
      hud.updateStats(localPlayer);
      hud.initActionBar(localPlayer.inventory);
      inventoryUI.update(localPlayer.inventory);
    }
    hud.updateTime(state.time);
    hud.updateWeather(state.weather.weather);
    hud.updateMap(state.mapId || 'farm');

    // Center camera on player
    if (localPlayer) {
      sceneManager.panTo(localPlayer.x, localPlayer.z);
    }

    // --- Right-click: Move player ---
    input.on('tileMove', ({ tile, worldPos }) => {
      if (dialogueUI.visible) return;

      // Check for animal interaction
      const animalId = animals.getAnimalAtPosition(worldPos.x, worldPos.z);
      if (animalId) {
        network.sendAnimalCollect(animalId);
        network.sendAnimalFeed(animalId);
        return;
      }

      // Check for pet interaction
      const petId = pets.getPetAtPosition(worldPos.x, worldPos.z);
      if (petId) {
        network.sendPetInteract(petId, 'pet');
        return;
      }

      // Check for NPC first
      const npcId = npcs.getNPCAtPosition(worldPos.x, worldPos.z);
      if (npcId) {
        network.sendNPCTalk(npcId);
        return;
      }

      network.sendMove(worldPos.x, worldPos.z);
    });

    // --- Left-click: Perform tool/item action ---
    input.on('tileAction', ({ tile, worldPos }) => {
      if (dialogueUI.visible) return;

      const activeItem = hud.getActiveItem();
      if (!activeItem) return;

      const action = getToolAction(activeItem.itemId);
      if (!action) return;

      switch (action) {
        case 'hoe':
          network.sendTill(tile.x, tile.z);
          break;
        case 'watering_can':
          network.sendWater(tile.x, tile.z);
          break;
        case 'seeds': {
          const seedType = activeItem.itemId.replace('_seed', '');
          network.sendPlant(tile.x, tile.z, seedType);
          break;
        }
        case 'fishing_rod':
          network.sendFishCast(worldPos.x, worldPos.z);
          break;
        case 'pickaxe':
          network.sendHarvest(tile.x, tile.z);
          break;
        case 'sprinkler':
          network.sendPlaceSprinkler(activeItem.itemId, tile.x, tile.z);
          break;
        case 'fertilizer':
          network.sendApplyFertilizer(activeItem.itemId, tile.x, tile.z);
          break;
      }

      // Queue the tool animation on the local player
      players.queueAction(network.playerId, action);
    });

    // --- Keyboard shortcuts ---
    input.on('keyDown', ({ key }) => {
      if (key === 'i' || key === 'I') inventoryUI.toggle();
      if (key === 'F3') debugWindow.toggle();
      if (key === 'c' || key === 'C') {
        if (craftingUI.visible) {
          craftingUI.hide();
        } else {
          // Find nearest crafting building
          const craftBuildings = [];
          for (const [id, b] of Object.entries(buildingsMap)) {
            if (b.type === 'mill' || b.type === 'forge') {
              craftBuildings.push(b);
            }
          }
          if (craftBuildings.length > 0) {
            const b = craftBuildings[0];
            craftingUI.show(b.id, b.type, recipes, localPlayer?.inventory || [], b.processing);
          }
        }
      }
      // Keys 1-9 select action bar slots 0-8, 0 selects slot 9
      if (key >= '1' && key <= '9') hud.selectSlot(parseInt(key) - 1);
      if (key === '0') hud.selectSlot(9);
    });

    // --- Network event handlers ---
    network.on('worldUpdate', (data) => {
      switch (data.type) {
        case 'playerMove':
          players.updatePosition(data.playerId, data.x, data.z);
          if (data.playerId === network.playerId) {
            sceneManager.panTo(data.x, data.z);
          }
          break;
        case 'tileChange':
          terrain.updateTile(data.x, data.z, data.tileType);
          break;
        case 'cropPlanted':
          crops.addCrop(data.crop);
          break;
        case 'cropWatered':
          break;
        case 'cropUpdate':
          crops.updateCrop(data.crop);
          break;
        case 'cropHarvested':
          crops.removeCrop(data.cropId);
          break;
        case 'fishCaught':
          console.log('Caught:', data.fish.name);
          break;
        case 'fishMiss':
          console.log('The fish got away...');
          break;
        case 'npcDialogue':
          dialogueUI._npcId = data.npcId;
          dialogueUI.show(data.npcName, data.text, [], data.upgradeOptions || null);
          break;
        case 'animalUpdate':
          // Update the animal data stored in renderer
          if (data.animal) {
            const entry = animals.animalMeshes.get(data.animal.id);
            if (entry) entry.data = data.animal;
          }
          break;
        case 'petUpdate':
          console.log(data.message);
          break;
        case 'sprinklerPlaced':
          sprinklers.addSprinkler(data.sprinkler);
          break;
        case 'fullSync':
          crops.dispose();
          crops.build(data.crops);
          sprinklers.dispose();
          sprinklers.build(data.sprinklers || []);
          break;
        case 'craftStarted':
          if (buildingsMap[data.buildingId]) {
            buildingsMap[data.buildingId].processing = { recipeId: data.recipeId, endTime: data.endTime };
          }
          console.log('Crafting started!');
          break;
        case 'craftCollected':
          if (buildingsMap[data.buildingId]) {
            buildingsMap[data.buildingId].processing = null;
          }
          console.log(`Collected: ${data.itemId} x${data.quantity}`);
          break;
        case 'craftError':
          console.log(data.message);
          break;
        case 'toolUpgraded':
          console.log(`Tool upgraded: ${data.tool} to tier ${data.newTier}`);
          break;
        case 'playerCollapse':
          console.log(`You collapsed! Lost ${data.penalty} coins.`);
          break;
        case 'mapTransition': {
          // Rebuild world from new map state
          const ms = data.mapState;
          terrain.dispose();
          terrain.build(ms.tiles, data.season || 0);
          water.dispose();
          water.build(ms.tiles);
          decorations.dispose();
          decorations.build(ms.decorations || []);
          creatures.dispose();
          creatures = new AmbientCreatureRenderer(sceneManager.scene, ms.tiles);
          buildings.dispose();
          buildings.build(ms.buildings || []);
          crops.dispose();
          crops.build(ms.crops || []);
          sprinklers.dispose();
          sprinklers.build(ms.sprinklers || []);
          npcs.dispose();
          npcs.build(ms.npcs || []);
          pets.dispose();
          pets.build(ms.pets || []);
          animals.dispose();
          animals.build(ms.animals || []);

          // Rebuild buildings map for new map
          for (const key of Object.keys(buildingsMap)) delete buildingsMap[key];
          for (const b of ms.buildings || []) {
            buildingsMap[b.id] = b;
          }

          // Reposition player
          if (data.spawnX !== undefined) {
            sceneManager.panTo(data.spawnX, data.spawnZ);
          }
          hud.updateMap(data.mapId);
          break;
        }
      }
    });

    network.on('timeUpdate', (data) => hud.updateTime(data));
    network.on('weatherUpdate', (data) => {
      hud.updateWeather(data.weather);
      weather.setWeather(data.weather);
    });
    network.on('inventoryUpdate', (data) => {
      hud.updateStats(data);
      hud.syncQuantities(data.inventory);
      inventoryUI.update(data.inventory);
      if (localPlayer) localPlayer.inventory = data.inventory;
    });
    network.on('playerJoin', (data) => {
      players.addPlayer(data.player, false);
    });
    network.on('playerLeave', (data) => {
      players.removePlayer(data.playerId);
    });

    // --- Render loop ---
    sceneManager.onUpdate((delta) => {
      water.update(delta);
      crops.update(delta);
      decorations.update(delta);
      creatures.update(delta, sceneManager.cameraTarget);
      weather.update(delta, sceneManager.cameraTarget);
      players.update(delta);
      npcs.update(delta);
      pets.update(delta);
      animals.update(delta);

      // Debug window
      debugWindow.update(delta);
      debugWindow.setEntityCounts({
        Players: players.playerMeshes.size,
        NPCs: npcs.npcMeshes ? npcs.npcMeshes.size : 0,
        Crops: crops.cropMeshes ? crops.cropMeshes.size : 0,
        Pets: pets.petMeshes ? pets.petMeshes.size : 0,
        Animals: animals.animalMeshes ? animals.animalMeshes.size : 0,
      });
    });

    sceneManager.start();
    console.log('OurFarm started!');
    debugClient.log('INIT', 'Render loop started');

  } catch (err) {
    console.error('Failed to connect:', err);
    debugClient.log('FATAL', 'Connection failed', { error: err.message, stack: err.stack });
    document.body.innerHTML = '<div style="color:white;padding:20px;font-family:sans-serif"><h2>Connection Failed</h2><p>Make sure the server is running on port 3000.</p><p>Run: <code>npm run dev:server</code></p></div>';
  }
}

main();
