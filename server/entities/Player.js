// server/entities/Player.js
import { v4 as uuid } from 'uuid';

export class Player {
  constructor(data = {}) {
    this.id = data.id || uuid();
    this.name = data.name || 'Farmer';
    this.x = data.x ?? 32;
    this.z = data.z ?? 32;
    this.coins = data.coins ?? 500;
    this.xp = data.xp ?? 0;
    this.level = data.level ?? 1;
    this.energy = data.energy ?? 100;
    this.maxEnergy = data.maxEnergy ?? 100;
    this.inventory = data.inventory || this._defaultInventory();
    this.activeToolSlot = 0;
    this.socketId = null;
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

  addItem(itemId, quantity = 1) {
    const existing = this.inventory.find(s => s.itemId === itemId);
    if (existing) { existing.quantity += quantity; }
    else { this.inventory.push({ itemId, quantity }); }
  }

  removeItem(itemId, quantity = 1) {
    const slot = this.inventory.find(s => s.itemId === itemId);
    if (!slot || slot.quantity < quantity) return false;
    slot.quantity -= quantity;
    if (slot.quantity <= 0) this.inventory = this.inventory.filter(s => s.quantity > 0);
    return true;
  }

  hasItem(itemId, quantity = 1) {
    const slot = this.inventory.find(s => s.itemId === itemId);
    return slot && slot.quantity >= quantity;
  }

  addXP(amount) {
    this.xp += amount;
    const needed = this.level * 100;
    if (this.xp >= needed) {
      this.xp -= needed;
      this.level++;
      this.maxEnergy += 5;
      this.energy = this.maxEnergy;
      return true;
    }
    return false;
  }

  useEnergy(amount) {
    if (this.energy < amount) return false;
    this.energy -= amount;
    return true;
  }

  getState() {
    return {
      id: this.id, name: this.name, x: this.x, z: this.z,
      coins: this.coins, xp: this.xp, level: this.level,
      energy: this.energy, maxEnergy: this.maxEnergy, inventory: this.inventory,
    };
  }
}
