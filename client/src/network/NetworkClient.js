// client/src/network/NetworkClient.js
// Handles Socket.io connection to the authoritative server.
// Sends player actions, receives world state updates.

import { io } from 'socket.io-client';
import { ACTIONS } from '@shared/constants.js';

export class NetworkClient {
  constructor() {
    this.socket = null;
    this.playerId = null;
    this.connected = false;
    this._handlers = {};
  }

  /** Connect to the game server */
  connect(playerName = 'Farmer') {
    return new Promise((resolve, reject) => {
      this.socket = io(window.location.origin, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
      });

      this.socket.on('connect', () => {
        this.connected = true;
        console.log('Connected to server:', this.socket.id);
        this.socket.emit(ACTIONS.PLAYER_JOIN, { name: playerName });
      });

      this.socket.on(ACTIONS.WORLD_STATE, (state) => {
        this.playerId = state.playerId;
        this._emit('worldState', state);
        resolve(state);
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        console.log('Disconnected from server');
        this._emit('disconnect');
      });

      this.socket.on('connect_error', (err) => {
        console.error('Connection error:', err.message);
        reject(err);
      });

      this._setupListeners();
    });
  }

  _setupListeners() {
    this.socket.on(ACTIONS.WORLD_UPDATE, (data) => this._emit('worldUpdate', data));
    this.socket.on(ACTIONS.TIME_UPDATE, (data) => this._emit('timeUpdate', data));
    this.socket.on(ACTIONS.WEATHER_UPDATE, (data) => this._emit('weatherUpdate', data));
    this.socket.on(ACTIONS.INVENTORY_UPDATE, (data) => this._emit('inventoryUpdate', data));
    this.socket.on(ACTIONS.CHAT_MESSAGE, (data) => this._emit('chatMessage', data));
    this.socket.on(ACTIONS.PLAYER_JOIN, (data) => this._emit('playerJoin', data));
    this.socket.on(ACTIONS.PLAYER_LEAVE, (data) => this._emit('playerLeave', data));
  }

  // ─── Send actions to server ───

  sendMove(x, z) { this.socket.emit(ACTIONS.PLAYER_MOVE, { x, z }); }
  sendTill(tileX, tileZ) { this.socket.emit(ACTIONS.FARM_TILL, { x: tileX, z: tileZ }); }
  sendPlant(tileX, tileZ, cropType) { this.socket.emit(ACTIONS.FARM_PLANT, { x: tileX, z: tileZ, cropType }); }
  sendWater(tileX, tileZ) { this.socket.emit(ACTIONS.FARM_WATER, { x: tileX, z: tileZ }); }
  sendHarvest(tileX, tileZ) { this.socket.emit(ACTIONS.FARM_HARVEST, { x: tileX, z: tileZ }); }
  sendFishCast(x, z) { this.socket.emit(ACTIONS.FISH_CAST, { x, z }); }
  sendFishReel() { this.socket.emit(ACTIONS.FISH_REEL); }
  sendNPCTalk(npcId) { this.socket.emit(ACTIONS.NPC_TALK, { npcId }); }
  sendNPCGift(npcId, itemId) { this.socket.emit(ACTIONS.NPC_GIFT, { npcId, itemId }); }
  sendPetInteract(petId, action) { this.socket.emit(ACTIONS.PET_INTERACT, { petId, action }); }
  sendCraftStart(buildingId, recipeId) { this.socket.emit(ACTIONS.CRAFT_START, { buildingId, recipeId }); }
  sendCraftCollect(buildingId) { this.socket.emit(ACTIONS.CRAFT_COLLECT, { buildingId }); }
  sendBuy(itemId, quantity) { this.socket.emit(ACTIONS.SHOP_BUY, { itemId, quantity }); }
  sendSell(itemId, quantity) { this.socket.emit(ACTIONS.SHOP_SELL, { itemId, quantity }); }
  sendAnimalFeed(animalId) { this.socket.emit(ACTIONS.ANIMAL_FEED, { animalId }); }
  sendAnimalCollect(animalId) { this.socket.emit(ACTIONS.ANIMAL_COLLECT, { animalId }); }
  sendToolUpgrade(tool) { this.socket.emit(ACTIONS.TOOL_UPGRADE, { tool }); }
  sendPlaceSprinkler(sprinklerType, x, z) { this.socket.emit(ACTIONS.PLACE_SPRINKLER, { sprinklerType, x, z }); }
  sendApplyFertilizer(fertilizerType, x, z) { this.socket.emit(ACTIONS.APPLY_FERTILIZER, { fertilizerType, x, z }); }
  sendPlaceMachine(machineType, x, z) { this.socket.emit(ACTIONS.PLACE_MACHINE, { machineType, x, z }); }
  sendMachineInput(machineId, itemId) { this.socket.emit(ACTIONS.MACHINE_INPUT, { machineId, itemId }); }
  sendMachineCollect(machineId) { this.socket.emit(ACTIONS.MACHINE_COLLECT, { machineId }); }
  sendForageCollect(x, z) { this.socket.emit(ACTIONS.FORAGE_COLLECT, { x, z }); }
  sendShipItem(itemId, quantity = 1) { this.socket.emit(ACTIONS.SHIP_ITEM, { itemId, quantity }); }
  sendProfessionChoice(skill, professionId) { this.socket.emit(ACTIONS.PROFESSION_CHOICE, { skill, professionId }); }
  sendChat(message) { this.socket.emit(ACTIONS.CHAT_MESSAGE, { message }); }

  // ─── Event system ───

  on(event, callback) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(callback);
  }

  _emit(event, data) {
    for (const cb of this._handlers[event] || []) {
      cb(data);
    }
  }

  disconnect() {
    if (this.socket) this.socket.disconnect();
  }
}
