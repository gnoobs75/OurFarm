// server/game/DecorationGenerator.js
// Deterministically places world decorations (trees, rocks, flowers, bushes,
// fences, reeds) based on tile types and world seed.
// All clients receive the same decoration array for consistent visuals.

import { WORLD_SIZE, TILE_TYPES } from '../../shared/constants.js';

export class DecorationGenerator {
  constructor(seed) {
    this.seed = seed;
  }

  /** Seeded pseudo-random -- deterministic for same (x, z, salt) */
  _rand(x, z, salt = 0) {
    const n = Math.sin((x + salt) * 127.1 + (z + salt) * 311.7 + this.seed * 0.001) * 43758.5453;
    return n - Math.floor(n);
  }

  /**
   * Generate farm map decoration list from tile data.
   * Returns array of { type, x, z, variant, rotation }
   */
  generate(tiles) {
    const decorations = [];
    const S = WORLD_SIZE;
    const cx = S / 2, cz = S / 2;

    // Farm zone -- skip decorations here (buildings/crops live here)
    const farmLeft = cx - 7, farmRight = cx + 7;
    const farmTop = cz - 6, farmBottom = cz + 6;

    // Town zone — skip decorations here (NPC buildings/streets live here)
    const townLeft = 24, townRight = 50;
    const townTop = 2, townBottom = 16;

    // Portal zone -- skip decorations near south edge portal
    const portalLeft = 29, portalRight = 34;
    const portalTop = 57, portalBottom = 63;

    for (let i = 0; i < tiles.length; i++) {
      const { x, z, type } = tiles[i];

      // Skip farm zone
      if (x >= farmLeft && x <= farmRight && z >= farmTop && z <= farmBottom) continue;

      // Skip town zone entirely
      if (x >= townLeft && x <= townRight && z >= townTop && z <= townBottom) continue;

      // Skip portal zone
      if (x >= portalLeft && x <= portalRight && z >= portalTop && z <= portalBottom) continue;

      const r = this._rand(x, z);
      const dx = (x - cx) / cx;
      const dz = (z - cz) / cz;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (type === TILE_TYPES.GRASS) {
        // Trees: denser at world edges, sparse near center
        const treeDensity = dist > 0.6 ? 0.25 : 0.08;
        if (r < treeDensity) {
          const variant = Math.floor(this._rand(x, z, 1) * 3);
          decorations.push({ type: 'tree', x, z, variant, rotation: r * Math.PI * 2 });
          continue;
        }

        // Flowers
        if (r < treeDensity + 0.08) {
          decorations.push({ type: 'flower', x, z, variant: 0, rotation: r * Math.PI });
          continue;
        }

        // Bushes
        if (r < treeDensity + 0.12) {
          decorations.push({ type: 'bush', x, z, variant: 0, rotation: r * Math.PI * 2 });
          continue;
        }
      }

      // Rocks on stone tiles
      if (type === TILE_TYPES.STONE) {
        if (r < 0.4) {
          decorations.push({ type: 'rock', x, z, variant: 0, rotation: r * Math.PI * 2 });
        }
      }

      // Reeds near water (on sand tiles)
      if (type === TILE_TYPES.SAND) {
        if (r < 0.15) {
          decorations.push({ type: 'reeds', x, z, variant: 0, rotation: r * Math.PI * 2 });
        }
      }
    }

    // Fence around crop plot area
    const fenceMinX = cx + 1, fenceMaxX = cx + 7;
    const fenceMinZ = cz - 3, fenceMaxZ = cz + 3;

    for (let fx = fenceMinX; fx <= fenceMaxX; fx++) {
      decorations.push({ type: 'fence', x: fx, z: fenceMinZ, variant: 0, rotation: 0 });
      decorations.push({ type: 'fence', x: fx, z: fenceMaxZ, variant: 0, rotation: 0 });
    }
    for (let fz = fenceMinZ + 1; fz < fenceMaxZ; fz++) {
      decorations.push({ type: 'fence', x: fenceMinX, z: fz, variant: 0, rotation: Math.PI / 2 });
      decorations.push({ type: 'fence', x: fenceMaxX, z: fz, variant: 0, rotation: Math.PI / 2 });
    }

    // Signpost near the portal path
    decorations.push({ type: 'signpost', x: portalLeft - 1, z: portalTop, variant: 0, rotation: 0 });

    return decorations;
  }

  /** Generate town-specific decorations */
  generateTown(tiles) {
    const decorations = [];
    const S = WORLD_SIZE;

    const hRoadZs = [10, 19, 28, 43];
    const vRoadXs = [16, 25, 40, 49];

    const plazaLeft = 26, plazaRight = 37, plazaTop = 12, plazaBottom = 18;

    // Fountain at center of plaza
    decorations.push({ type: 'fountain', x: 31, z: 15, variant: 0, rotation: 0 });

    // Statues at 4 plaza corners
    decorations.push({ type: 'statue', x: plazaLeft + 1, z: plazaTop + 1, variant: 0, rotation: 0 });
    decorations.push({ type: 'statue', x: plazaRight - 1, z: plazaTop + 1, variant: 0, rotation: Math.PI });
    decorations.push({ type: 'statue', x: plazaLeft + 1, z: plazaBottom - 1, variant: 0, rotation: 0 });
    decorations.push({ type: 'statue', x: plazaRight - 1, z: plazaBottom - 1, variant: 0, rotation: Math.PI });

    // Benches along plaza edges
    for (let bx = plazaLeft + 2; bx <= plazaRight - 2; bx += 3) {
      decorations.push({ type: 'bench', x: bx, z: plazaTop, variant: 0, rotation: 0 });
      decorations.push({ type: 'bench', x: bx, z: plazaBottom, variant: 0, rotation: Math.PI });
    }

    // Lampposts along roads every 4 tiles
    for (const rz of hRoadZs) {
      for (let x = 4; x < S - 4; x += 4) {
        if (x >= plazaLeft - 1 && x <= plazaRight + 1 && rz >= plazaTop - 1 && rz <= plazaBottom + 1) continue;
        if (x < 12 || (x > 52 && x < 60)) continue;
        decorations.push({ type: 'lamppost', x, z: rz, variant: 0, rotation: 0 });
      }
    }
    for (const rx of vRoadXs) {
      for (let z = 4; z < S - 4; z += 4) {
        if (rx >= plazaLeft - 1 && rx <= plazaRight + 1 && z >= plazaTop - 1 && z <= plazaBottom + 1) continue;
        decorations.push({ type: 'lamppost', x: rx, z, variant: 0, rotation: 0 });
      }
    }

    // Park area: trees (x:20-44, z:20-28) -- sparser, deliberate
    for (let x = 20; x <= 44; x++) {
      for (let z = 20; z <= 27; z++) {
        const r = this._rand(x, z, 100);
        if (r < 0.12) {
          const variant = Math.floor(this._rand(x, z, 101) * 3);
          decorations.push({ type: 'tree', x, z, variant, rotation: r * Math.PI * 2 });
        }
      }
    }

    // Flower beds at road intersections
    for (const rx of [16, 25, 40, 49]) {
      for (const rz of [10, 19, 28, 43]) {
        for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
          const fx = rx + dx, fz = rz + dz;
          if (fx > 0 && fx < S && fz > 0 && fz < S) {
            decorations.push({ type: 'flower', x: fx, z: fz, variant: 0, rotation: this._rand(fx, fz, 200) * Math.PI });
          }
        }
      }
    }

    // Tile-based: reeds along streams, rocks near fishing pools
    for (const tile of tiles) {
      const { x, z, type } = tile;
      const r = this._rand(x, z, 300);

      if (type === TILE_TYPES.SAND && r < 0.18) {
        decorations.push({ type: 'reeds', x, z, variant: 0, rotation: r * Math.PI * 2 });
      }

      if (type === TILE_TYPES.GRASS && z >= 32 && z <= 40) {
        const westDist = Math.abs(x - 7);
        const eastDist = Math.abs(x - 56);
        if ((westDist < 5 || eastDist < 5) && r < 0.08) {
          decorations.push({ type: 'rock', x, z, variant: 0, rotation: r * Math.PI * 2 });
        }
      }
    }

    return decorations;
  }
}
