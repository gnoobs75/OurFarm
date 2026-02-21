import { v4 as uuid } from 'uuid';
import { SPRINKLER_DATA } from '../../shared/constants.js';

export class Sprinkler {
  constructor({ id, type, tileX, tileZ }) {
    this.id = id || uuid();
    this.type = type;
    this.tileX = tileX;
    this.tileZ = tileZ;
  }

  getWateredTiles() {
    const data = SPRINKLER_DATA[this.type];
    if (!data) return [];
    return data.tiles.map(([dx, dz]) => ({ x: this.tileX + dx, z: this.tileZ + dz }));
  }

  getState() {
    return { id: this.id, type: this.type, tileX: this.tileX, tileZ: this.tileZ };
  }
}
