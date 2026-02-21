// server/game/ForagingSystem.js
// Manages daily spawning of seasonal wild forage items on grass tiles.
// Players collect by walking over them.

import { FORAGE_ITEMS, TILE_TYPES } from '../../shared/constants.js';
import { v4 as uuid } from 'uuid';

export class ForagingSystem {
  constructor() {
    this.spawns = new Map();
  }

  spawnDaily(tiles, season, count = 6) {
    this.spawns.clear();
    const grassTiles = tiles.filter(t => t.type === TILE_TYPES.GRASS);
    const items = FORAGE_ITEMS[season] || [];
    if (items.length === 0 || grassTiles.length === 0) return;

    for (let i = 0; i < count; i++) {
      const tile = grassTiles[Math.floor(Math.random() * grassTiles.length)];
      const itemId = items[Math.floor(Math.random() * items.length)];
      const id = uuid();
      this.spawns.set(id, { id, itemId, tileX: tile.x, tileZ: tile.z });
    }
  }

  collectAt(tileX, tileZ) {
    for (const [id, spawn] of this.spawns) {
      if (spawn.tileX === tileX && spawn.tileZ === tileZ) {
        this.spawns.delete(id);
        return spawn;
      }
    }
    return null;
  }

  getState() {
    return Array.from(this.spawns.values());
  }
}
