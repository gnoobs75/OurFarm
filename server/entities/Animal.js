// server/entities/Animal.js
import { v4 as uuid } from 'uuid';

export class Animal {
  constructor(data = {}) {
    this.id = data.id || uuid();
    this.type = data.type;
    this.x = data.x ?? 30;
    this.z = data.z ?? 30;
    this.happiness = data.happiness ?? 50;
    this.fedToday = data.fedToday ?? false;
    this.productReady = data.productReady ?? false;
    this._hoursSinceProduct = 0;
  }

  feed() { this.fedToday = true; this.happiness = Math.min(100, this.happiness + 20); }

  tickHour(animalData, hoursElapsed = 1) {
    if (!this.fedToday) return;
    this._hoursSinceProduct += hoursElapsed;
    if (this._hoursSinceProduct >= animalData.productInterval) {
      this.productReady = true;
    }
  }

  tickDaily() {
    if (!this.fedToday) this.happiness = Math.max(0, this.happiness - 15);
    this.fedToday = false;
  }

  collectProduct() {
    if (!this.productReady) return null;
    this.productReady = false;
    return { qualityBonus: this.happiness > 80 ? 1.5 : 1.0 };
  }

  getState() {
    return {
      id: this.id, type: this.type, x: this.x, z: this.z,
      happiness: this.happiness, fedToday: this.fedToday, productReady: this.productReady,
    };
  }
}
