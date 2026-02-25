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
import { MachineRenderer } from './world/MachineRenderer.js';
import { ForageRenderer } from './world/ForageRenderer.js';
import { WeatherRenderer } from './world/WeatherRenderer.js';
import { SeasonalEffects } from './world/SeasonalEffects.js';
import { BuildingRenderer } from './world/BuildingRenderer.js';
import { DecorationRenderer } from './world/DecorationRenderer.js';
import { GrassRenderer } from './world/GrassRenderer.js';
import { AmbientCreatureRenderer } from './world/AmbientCreatureRenderer.js';
import { PlayerRenderer } from './entities/PlayerRenderer.js';
import { NPCRenderer } from './entities/NPCRenderer.js';
import { PetRenderer } from './entities/PetRenderer.js';
import { AnimalRenderer } from './entities/AnimalRenderer.js';
import { ResourceRenderer } from './entities/ResourceRenderer.js';
import { HUD } from './ui/HUD.js';
import { InventoryUI } from './ui/Inventory.js';
import { DialogueUI } from './ui/DialogueUI.js';
import { CraftingUI } from './ui/CraftingUI.js';
import { ProfessionUI } from './ui/ProfessionUI.js';
import { DebugWindow } from './ui/DebugWindow.js';
import { SplashScreen } from './ui/SplashScreen.js';
import { SelectionManager } from './ui/SelectionManager.js';
import { getToolAction, isSeed } from './ui/ItemIcons.js';
import { tileToWorld } from '@shared/TileMap.js';
import { TILE_TYPES } from '@shared/constants.js';
import { debugClient } from './utils/DebugClient.js';
import { FishingEffects } from './effects/FishingEffects.js';
import { ActionEffects } from './world/ActionEffects.js';
import { FishingUI } from './ui/FishingUI.js';
import { GroomingUI3D as GroomingUI } from './ui/GroomingUI3D.js';
import { LootToast } from './ui/LootToast.js';

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
  const seasonalEffects = new SeasonalEffects(sceneManager.scene);
  const buildings = new BuildingRenderer(sceneManager.scene, assets);
  const decorations = new DecorationRenderer(sceneManager.scene, assets);
  const grass = new GrassRenderer(sceneManager.scene);
  const resources = new ResourceRenderer(sceneManager.scene, assets);
  const players = new PlayerRenderer(sceneManager.scene, assets);
  const npcs = new NPCRenderer(sceneManager.scene, assets);
  const pets = new PetRenderer(sceneManager.scene, assets);
  const animals = new AnimalRenderer(sceneManager.scene, assets);
  const sprinklers = new SprinklerRenderer(sceneManager.scene);
  const machines = new MachineRenderer(sceneManager.scene);
  let forage = new ForageRenderer(sceneManager.scene);

  // --- Action particle effects ---
  const actionEffects = new ActionEffects(sceneManager.scene);

  // --- Fishing ---
  const fishingEffects = new FishingEffects(sceneManager.scene);
  const fishingUI = new FishingUI();
  let fishingState = null; // null = not fishing

  // --- Grooming ---
  const groomingUI = new GroomingUI();

  // --- UI ---
  const hud = new HUD(document.getElementById('hud'));
  const inventoryUI = new InventoryUI(document.getElementById('inventory-panel'));
  const dialogueUI = new DialogueUI(document.getElementById('dialogue-panel'));
  const debugWindow = new DebugWindow();
  debugWindow.setRenderer(sceneManager.renderer);
  const craftingUI = new CraftingUI();
  const professionUI = new ProfessionUI();

  // Wire backpack right-click → action bar quick-add
  inventoryUI.onQuickAdd = (itemId) => {
    hud.addToFirstEmptySlot(itemId);
  };

  // Wire backpack icon → toggle inventory
  hud.onBackpackClick = () => inventoryUI.toggle();

  // Loot toast system
  const lootToast = new LootToast();
  lootToast.setBackpackCallbacks(
    () => hud.getBackpackRect(),
    () => hud.pulseBackpack(),
  );

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

  // Character customization splash screen
  const splash = new SplashScreen();
  const { name: playerName, appearance: playerAppearance } = await splash.show();

  try {
    const state = await network.connect(playerName, playerAppearance);

    // Store static crop definitions for tooltips
    const cropsData = state.cropsData || {};

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

    // --- Toast notification helper ---
    function showToast(message, type = '', icon = '') {
      const container = document.getElementById('toast-container');
      if (!container) return;
      const toast = document.createElement('div');
      toast.className = 'toast' + (type ? ` toast-${type}` : '');
      toast.textContent = (icon ? icon + ' ' : '') + message;
      container.appendChild(toast);
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 3000);
    }

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
        showToast(`Caught a ${biteData.fishName}!`, 'success', '\uD83C\uDF1F');
      } else {
        fishingEffects.playMiss();
        showToast('The fish got away...', 'fail', '\uD83D\uDCA8');
      }
    }

    // --- Build world from server state ---
    terrain.build(state.tiles, state.time.season);
    water.build(state.tiles);
    crops.build(state.crops);
    npcs.build(state.npcs);
    pets.build(state.pets);
    animals.build(state.animals);
    buildings.build(state.buildings);
    decorations.build(state.decorations || []);
    grass.build(state.tiles);
    if (state.resources) resources.build(state.resources);
    sprinklers.build(state.sprinklers || []);
    machines.build(state.machines || []);
    forage.build(state.forageItems || []);

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

    // Wire profession choice callback
    professionUI.onChoice = (skill, professionId) => {
      network.sendProfessionChoice(skill, professionId);
    };

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
    if (state.time) sceneManager.setTimeOfDay(state.time.hour);
    if (state.time) buildings.setTimeOfDay(state.time.hour);
    if (state.time) seasonalEffects.setSeason(state.time.season);
    hud.updateWeather(state.weather.weather);
    hud.updateMap(state.mapId || 'farm');

    // Center camera on player and set follow target
    if (localPlayer) {
      sceneManager.panTo(localPlayer.x, localPlayer.z);
      const localMesh = players.getLocalPlayerMesh(state.playerId);
      if (localMesh) sceneManager.setFollowTarget(localMesh);
    }

    // --- Selection / Hover / Context Menu ---
    const selectionManager = new SelectionManager(sceneManager.scene, {
      npcs, animals, pets, machines, crops, forage, resources, buildings,
    }, network, { cropsData, getTime: () => hud._lastTime });

    input.on('tileHover', (hoverData) => {
      selectionManager.updateHover(hoverData);
    });

    // --- Pet grooming callback ---
    selectionManager.onGroom = async (petId) => {
      const petEntry = pets.petMeshes.get(petId);
      if (!petEntry) return;
      const petData = petEntry.data;

      const result = await groomingUI.start(petData);
      if (!result) return; // cancelled

      network.sendPetGroom(petId, result.stars, result.equipped);
    };

    selectionManager.onOpenCrafting = (buildingData) => {
      const b = buildingsMap[buildingData.id] || buildingData;
      craftingUI.show(b.id, b.type, recipes, localPlayer?.inventory || [], b.processing);
    };

    // --- Right-click: Move player ---
    input.on('tileMove', ({ tile, worldPos }) => {
      if (dialogueUI.visible) return;

      // Cancel fishing on right-click
      if (fishingState) {
        fishingState = null;
        fishingEffects.cancel();
        fishingUI.dispose();
        network.sendFishCancel();
        return;
      }

      // Check for machine interaction
      const machineId = machines.getMachineAtPosition(worldPos.x, worldPos.z);
      if (machineId) {
        const machineEntry = machines.machineMeshes.get(machineId);
        if (machineEntry && machineEntry.data.processing && machineEntry.data.processing.ready) {
          network.sendMachineCollect(machineId);
        } else if (machineEntry && !machineEntry.data.processing) {
          // Send the active item as input
          const activeItem = hud.getActiveItem();
          if (activeItem && activeItem.itemId) {
            network.sendMachineInput(machineId, activeItem.itemId);
          }
        }
        return;
      }

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
      network.sendForageCollect(tile.x, tile.z);
    });

    // --- Left-click: Perform tool/item action ---
    input.on('tileAction', ({ tile, worldPos, button }) => {
      if (dialogueUI.visible || selectionManager.hasContextMenu()) {
        selectionManager.hideContextMenu();
        return;
      }

      // Check for entity — show context menu instead of tool action
      const entity = selectionManager.getEntityAt(worldPos);
      if (entity) {
        selectionManager.showContextMenu(entity, input.hoveredScreenPos || { x: 0, y: 0 });
        return;
      }

      // Proximity check — must be within 2 tiles
      const playerPos = players.getLocalPlayerPosition(network.playerId);
      if (playerPos) {
        const playerTileX = Math.floor(playerPos.x);
        const playerTileZ = Math.floor(playerPos.z);
        const dist = Math.abs(playerTileX - tile.x) + Math.abs(playerTileZ - tile.z);
        if (dist > 2) {
          showToast('Too far away!', 'fail', '\uD83D\uDEB6');
          return;
        }
      }

      const activeItem = hud.getActiveItem();
      if (!activeItem) return;

      const action = getToolAction(activeItem.itemId);
      if (!action) return;

      if (fishingState) return;

      switch (action) {
        case 'hoe':
          network.sendTill(tile.x, tile.z);
          actionEffects.spawnToolHit(tile.x + 0.5, tile.z + 0.5);
          break;
        case 'watering_can':
          network.sendWater(tile.x, tile.z);
          actionEffects.spawnWatering(tile.x + 0.5, tile.z + 0.5);
          break;
        case 'seeds': {
          const seedType = activeItem.itemId.replace('_seed', '');
          network.sendPlant(tile.x, tile.z, seedType);
          actionEffects.spawnPlanting(tile.x + 0.5, tile.z + 0.5);
          break;
        }
        case 'sapling': {
          network.sendPlant(tile.x, tile.z, activeItem.itemId);
          actionEffects.spawnPlanting(tile.x + 0.5, tile.z + 0.5);
          break;
        }
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
        case 'axe': {
          const res = resources.getResourceAtTile(tile.x, tile.z);
          if (res && (res.type === 'tree' || res.isStump)) {
            network.sendResourceHit(tile.x, tile.z);
            actionEffects.spawnToolHit(tile.x + 0.5, tile.z + 0.5);
          }
          break;
        }
        case 'pickaxe': {
          const res = resources.getResourceAtTile(tile.x, tile.z);
          if (res && res.type === 'rock') {
            network.sendResourceHit(tile.x, tile.z);
            actionEffects.spawnToolHit(tile.x + 0.5, tile.z + 0.5);
          } else {
            network.sendHarvest(tile.x, tile.z);
          }
          break;
        }
        case 'sprinkler':
          network.sendPlaceSprinkler(activeItem.itemId, tile.x, tile.z);
          break;
        case 'fertilizer':
          network.sendApplyFertilizer(activeItem.itemId, tile.x, tile.z);
          break;
        case 'machine':
          network.sendPlaceMachine(activeItem.itemId, tile.x, tile.z);
          break;
      }

      // Queue the tool animation on the local player
      players.queueAction(network.playerId, action);
    });

    // --- Hold-to-expand: 1x3 row action ---
    input.on('tileActionExpanded', ({ tile, worldPos }) => {
      if (dialogueUI.visible || selectionManager.hasContextMenu()) return;

      const activeItem = hud.getActiveItem();
      if (!activeItem) return;
      const action = getToolAction(activeItem.itemId);
      if (!action) return;

      // Get player facing direction to determine the 1x3 row
      const playerPos = players.getLocalPlayerPosition(network.playerId);
      if (!playerPos) return;
      const dx = worldPos.x - playerPos.x;
      const dz = worldPos.z - playerPos.z;

      // Determine primary axis
      let rowDir;
      if (Math.abs(dx) > Math.abs(dz)) {
        rowDir = { x: Math.sign(dx), z: 0 };
      } else {
        rowDir = { x: 0, z: Math.sign(dz) };
      }

      const tiles = [
        { x: tile.x, z: tile.z },
        { x: tile.x + rowDir.x, z: tile.z + rowDir.z },
        { x: tile.x + rowDir.x * 2, z: tile.z + rowDir.z * 2 },
      ];

      switch (action) {
        case 'hoe':
          network.sendMultiTill(tiles);
          break;
        case 'watering_can':
          network.sendMultiWater(tiles);
          break;
        case 'seeds': {
          const seedType = activeItem.itemId.replace('_seed', '');
          network.sendMultiPlant(tiles, seedType);
          break;
        }
      }
      players.queueAction(network.playerId, action);
    });

    // --- Keyboard shortcuts ---
    input.on('keyDown', ({ key }) => {
      // Cancel fishing on Escape
      if (key === 'Escape' && fishingState) {
        fishingState = null;
        fishingEffects.cancel();
        fishingUI.dispose();
        network.sendFishCancel();
        return;
      }

      if (key === 'r' || key === 'R') {
        network.sendRestAtHouse();
      }
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
          if (data.x !== undefined) {
            actionEffects.spawnHarvest(data.x + 0.5, data.z + 0.5);
          }
          break;
        case 'fishingBite':
          // Server rolled a fish — start the cinematic bite + mini-game sequence
          if (data.playerId === network.playerId) {
            startFishingSequence(data);
          }
          break;
        case 'fishCaught':
          if (data.playerId !== network.playerId) {
            console.log(`${data.playerId} caught: ${data.fish.name}`);
          }
          break;
        case 'fishMiss':
          if (data.playerId !== network.playerId) {
            console.log(`${data.playerId} missed a fish`);
          }
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
        case 'petGroomResult':
          if (data.success) {
            const entry = pets.petMeshes.get(data.pet.id);
            if (entry) entry.data = data.pet;
            if (data.newCosmetic) {
              showToast(`New cosmetic: ${data.newCosmetic.name}!`, 'success', '\u2728');
            }
            showToast(`${data.pet.name} loved the grooming! (+${data.happinessGain} happiness)`, 'success', '\u2764\uFE0F');
          } else {
            showToast(data.message || 'Already groomed today', 'fail', '\u23F3');
          }
          break;
        case 'resourceHit':
          resources.onResourceHit(data.resourceId);
          break;
        case 'treeShake':
          resources.onResourceHit(data.resourceId); // reuse shake animation
          // Spawn harvest sparkles at tree position
          {
            const pos = resources.getResourcePosition(data.resourceId);
            if (pos) {
              actionEffects.spawnHarvest(pos.tileX + 0.5, pos.tileZ + 0.5);
            }
          }
          break;
        case 'resourceUpdate':
          resources.onResourceUpdate(data.resource);
          break;
        case 'resourceRemoved':
          resources.removeResource(data.resourceId);
          break;
        case 'resourceAdded':
          resources.addResource(data.resource);
          break;
        case 'tileChangeBatch':
          for (const t of data.tiles) {
            terrain.updateTile(t.x, t.z, t.tileType);
          }
          break;
        case 'restComplete':
          // Screen fade could be added later
          break;
        case 'forageCollected':
          forage.removeForageItem(data.spawnId);
          break;
        case 'lootDrop':
          lootToast.show(data.drops);
          break;
        case 'sprinklerPlaced':
          sprinklers.addSprinkler(data.sprinkler);
          break;
        case 'machinePlaced':
          machines.addMachine(data.machine);
          break;
        case 'machineUpdate':
          machines.updateMachine(data.machine);
          break;
        case 'fullSync':
          crops.dispose();
          crops.build(data.crops);
          sprinklers.dispose();
          sprinklers.build(data.sprinklers || []);
          machines.dispose();
          machines.build(data.machines || []);
          forage.dispose();
          forage.build(data.forageItems || []);
          resources.dispose();
          resources.build(data.resources || []);
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
        case 'professionChoice':
          professionUI.show(data.skill, data.level, data.options);
          break;
        case 'professionChosen':
          console.log(`Chose ${data.professionId} for ${data.skill}!`);
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
          grass.dispose();
          grass.build(ms.tiles);
          resources.dispose();
          resources.build(ms.resources || []);
          creatures.dispose();
          creatures = new AmbientCreatureRenderer(sceneManager.scene, ms.tiles);
          buildings.dispose();
          buildings.build(ms.buildings || []);
          if (data.hour !== undefined) buildings.setTimeOfDay(data.hour);
          crops.dispose();
          crops.build(ms.crops || []);
          sprinklers.dispose();
          sprinklers.build(ms.sprinklers || []);
          machines.dispose();
          machines.build(ms.machines || []);
          forage.dispose();
          forage.build(data.forageItems || []);
          npcs.dispose();
          npcs.build(ms.npcs || []);
          pets.dispose();
          pets.build(ms.pets || []);
          animals.dispose();
          animals.build(ms.animals || []);

          // Rebuild seasonal effects for new map
          seasonalEffects.dispose();
          if (data.season !== undefined) seasonalEffects.setSeason(data.season);

          // Rebuild buildings map for new map
          for (const key of Object.keys(buildingsMap)) delete buildingsMap[key];
          for (const b of ms.buildings || []) {
            buildingsMap[b.id] = b;
          }

          // Reposition player and snap camera
          if (data.spawnX !== undefined) {
            players.updatePosition(network.playerId, data.spawnX, data.spawnZ);
            sceneManager.panTo(data.spawnX, data.spawnZ);
          }
          hud.updateMap(data.mapId);
          break;
        }
      }
    });

    network.on('timeUpdate', (data) => {
      hud.updateTime(data);
      sceneManager.setTimeOfDay(data.hour);
      buildings.setTimeOfDay(data.hour);
      seasonalEffects.setSeason(data.season);
    });
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
      grass.update(delta);
      resources.update(delta);
      creatures.update(delta, sceneManager.cameraTarget);
      weather.update(delta, sceneManager.cameraTarget);
      seasonalEffects.update(delta, sceneManager.cameraTarget);
      players.update(delta);
      fishingEffects.update(delta);
      actionEffects.update(delta);
      const localPos = players.getLocalPlayerPosition(state.playerId);
      if (localPos) {
        npcs.setPlayerPosition(localPos.x, localPos.z);
      }
      npcs.update(delta);
      pets.update(delta);
      animals.update(delta);
      sprinklers.update(delta);

      // Smooth camera follow
      sceneManager.updateCamera(delta);

      // Debug window
      debugWindow.update(delta);
      debugWindow.setEntityCounts({
        Players: players.playerMeshes.size,
        NPCs: npcs.npcMeshes ? npcs.npcMeshes.size : 0,
        Crops: crops.cropMeshes ? crops.cropMeshes.size : 0,
        Pets: pets.petMeshes ? pets.petMeshes.size : 0,
        Animals: animals.animalMeshes ? animals.animalMeshes.size : 0,
        Resources: resources._entries ? resources._entries.size : 0,
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
