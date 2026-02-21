// server/entities/Pet.js
import { v4 as uuid } from 'uuid';

export class Pet {
  constructor(data = {}) {
    this.id = data.id || uuid();
    this.ownerId = data.ownerId;
    this.type = data.type;
    this.name = data.name || data.type;
    this.energy = data.energy ?? 100;
    this.happiness = data.happiness ?? 50;
    this.loyalty = data.loyalty ?? 0;
    this.skill = data.skill ?? 0;
    this.bodySize = data.bodySize ?? 0.2 + Math.random() * 0.1;
    this.earSize = data.earSize ?? 0.08 + Math.random() * 0.05;
    this.tailLength = data.tailLength ?? 0.15 + Math.random() * 0.1;
    this.color = data.color ?? Math.floor(Math.random() * 0xffffff);
    this.x = data.x ?? 32;
    this.z = data.z ?? 33;
  }

  feed() { this.energy = Math.min(100, this.energy + 30); this.happiness = Math.min(100, this.happiness + 10); }
  train() {
    if (this.energy < 20) return false;
    this.energy -= 20;
    this.skill = Math.min(100, this.skill + 2 + Math.random() * 3);
    this.loyalty = Math.min(100, this.loyalty + 1);
    return true;
  }
  pet() { this.happiness = Math.min(100, this.happiness + 15); this.loyalty = Math.min(100, this.loyalty + 0.5); }
  tickDaily() { this.energy = Math.max(0, this.energy - 10); this.happiness = Math.max(0, this.happiness - 5); }

  getState() {
    return {
      id: this.id, ownerId: this.ownerId, type: this.type, name: this.name,
      energy: this.energy, happiness: this.happiness, loyalty: this.loyalty, skill: this.skill,
      bodySize: this.bodySize, earSize: this.earSize, tailLength: this.tailLength, color: this.color,
      x: this.x, z: this.z,
    };
  }
}
