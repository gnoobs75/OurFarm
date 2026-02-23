// server/entities/Resource.js
import { v4 as uuid } from 'uuid';

export class Resource {
  constructor(data) {
    this.id = data.id || uuid();
    this.type = data.type;        // 'tree' or 'rock'
    this.tileX = data.tileX;
    this.tileZ = data.tileZ;
    this.variant = data.variant || 0;
    this.health = data.health;
    this.isStump = data.isStump || false;
  }

  hit(damage = 1) {
    this.health -= damage;
    return this.health <= 0;
  }

  getState() {
    return {
      id: this.id, type: this.type, tileX: this.tileX, tileZ: this.tileZ,
      variant: this.variant, health: this.health, isStump: this.isStump,
    };
  }
}
