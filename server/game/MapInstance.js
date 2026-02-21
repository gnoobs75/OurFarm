// server/game/MapInstance.js
// Lightweight container for per-map state: tiles, decorations, buildings, entities, portals.

export class MapInstance {
  constructor(id, { tiles, decorations, buildings = [], portals = [] }) {
    this.id = id;
    this.tiles = tiles;
    this.decorations = decorations;
    this.buildings = new Map();
    for (const b of buildings) {
      this.buildings.set(b.id, b);
    }
    // Portals: array of { x, z, width, height, targetMap, spawnX, spawnZ }
    this.portals = portals;

    // Entity collections — populated by GameWorld
    this.crops = new Map();
    this.animals = new Map();
    this.pets = new Map();
    this.npcs = [];
    this.sprinklers = new Map();
    this.machines = new Map();
  }

  /** Serialize full map state for client consumption */
  getFullState() {
    return {
      tiles: this.tiles,
      decorations: this.decorations,
      buildings: Array.from(this.buildings.values()),
      crops: Array.from(this.crops.values()).map(c => c.getState()),
      animals: Array.from(this.animals.values()).map(a => a.getState()),
      pets: Array.from(this.pets.values()).map(p => p.getState()),
      npcs: this.npcs.map(n => n.getState()),
      sprinklers: Array.from(this.sprinklers.values()).map(s => s.getState()),
      machines: Array.from(this.machines.values()).map(m => m.getState()),
    };
  }

  /** Check if position (tile coords) is inside a portal zone. Returns portal info or null. */
  isInPortalZone(x, z) {
    for (const portal of this.portals) {
      if (x >= portal.x && x < portal.x + portal.width &&
          z >= portal.z && z < portal.z + portal.height) {
        return portal;
      }
    }
    return null;
  }
}
