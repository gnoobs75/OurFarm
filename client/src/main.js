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
import { WeatherRenderer } from './world/WeatherRenderer.js';
import { BuildingRenderer } from './world/BuildingRenderer.js';
import { DecorationRenderer } from './world/DecorationRenderer.js';
import { PlayerRenderer } from './entities/PlayerRenderer.js';
import { NPCRenderer } from './entities/NPCRenderer.js';
import { PetRenderer } from './entities/PetRenderer.js';
import { AnimalRenderer } from './entities/AnimalRenderer.js';
import { HUD } from './ui/HUD.js';
import { InventoryUI } from './ui/Inventory.js';
import { DialogueUI } from './ui/DialogueUI.js';
import { DebugWindow } from './ui/DebugWindow.js';
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

  // --- UI ---
  const hud = new HUD(document.getElementById('hud'));
  const inventoryUI = new InventoryUI(document.getElementById('inventory-panel'));
  const dialogueUI = new DialogueUI(document.getElementById('dialogue-panel'));
  const debugWindow = new DebugWindow();
  debugWindow.setRenderer(sceneManager.renderer);

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

    // Add players
    for (const p of state.players) {
      players.addPlayer(p, p.id === state.playerId);
    }

    // Update HUD
    const localPlayer = state.players.find(p => p.id === state.playerId);
    if (localPlayer) {
      hud.updateStats(localPlayer);
      inventoryUI.update(localPlayer.inventory);
    }
    hud.updateTime(state.time);
    hud.updateWeather(state.weather.weather);

    // Center camera on player
    if (localPlayer) {
      sceneManager.panTo(localPlayer.x, localPlayer.z);
    }

    // --- Current tool state ---
    let activeTool = 0;
    const toolActions = ['hoe', 'watering_can', 'pickaxe', 'axe', 'fishing_rod', 'seeds'];
    let selectedSeed = 'wheat';

    hud.onSlotSelect = (slot) => {
      activeTool = slot;
    };

    // --- Handle tile clicks ---
    input.on('tileClick', ({ tile, worldPos, button }) => {
      if (dialogueUI.visible) return;

      // Right-click or check for NPC
      const npcId = npcs.getNPCAtPosition(worldPos.x, worldPos.z);
      if (npcId) {
        network.sendNPCTalk(npcId);
        return;
      }

      // Move player to clicked position
      network.sendMove(worldPos.x, worldPos.z);

      // Perform tool action
      const tool = toolActions[activeTool];
      switch (tool) {
        case 'hoe':
          network.sendTill(tile.x, tile.z);
          break;
        case 'watering_can':
          network.sendWater(tile.x, tile.z);
          break;
        case 'seeds':
          network.sendPlant(tile.x, tile.z, selectedSeed);
          break;
        case 'fishing_rod':
          network.sendFishCast(worldPos.x, worldPos.z);
          break;
        case 'pickaxe':
          // Harvest if there's a crop, else mine
          network.sendHarvest(tile.x, tile.z);
          break;
      }

      // Queue the tool animation on the local player
      players.queueAction(network.playerId, tool);
    });

    // --- Keyboard shortcuts ---
    input.on('keyDown', ({ key }) => {
      if (key === 'e' || key === 'E') inventoryUI.toggle();
      if (key === 'F3') debugWindow.toggle();
      if (key >= '1' && key <= '6') hud.selectSlot(parseInt(key) - 1);
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
          // Visual feedback could be added here
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
          dialogueUI.show(data.npcName, data.text);
          break;
        case 'fullSync':
          crops.dispose();
          crops.build(data.crops);
          break;
        case 'playerCollapse':
          console.log(`You collapsed! Lost ${data.penalty} coins.`);
          // Could show a UI notification in the future
          break;
      }
    });

    network.on('timeUpdate', (data) => hud.updateTime(data));
    network.on('weatherUpdate', (data) => {
      hud.updateWeather(data.weather);
      weather.setWeather(data.weather);
    });
    network.on('inventoryUpdate', (data) => {
      hud.updateStats(data);
      inventoryUI.update(data.inventory);
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
