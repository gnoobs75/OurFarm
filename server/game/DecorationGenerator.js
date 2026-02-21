// server/game/DecorationGenerator.js
// Deterministically places world decorations (trees, rocks, flowers, bushes,
// fences, reeds) based on tile types and world seed.
// All clients receive the same decoration array for consistent visuals.

import { WORLD_SIZE, TILE_TYPES } from '../../shared/constants.js';

export class DecorationGenerator {
  constructor(seed) {
    this.seed = seed;
  }

  /** Seeded pseudo-random — deterministic for same (x, z, salt) */
  _rand(x, z, salt = 0) {
    const n = Math.sin((x + salt) * 127.1 + (z + salt) * 311.7 + this.seed * 0.001) * 43758.5453;
    return n - Math.floor(n);
  }

  /**
   * Generate decoration list from tile data.
   * Returns array of { type, x, z, variant, rotation }
   */
  generate(tiles) {
    const decorations = [];
    const S = WORLD_SIZE;
    const cx = S / 2, cz = S / 2;

    // Farm zone — skip decorations here (buildings/crops live here)
    const farmLeft = cx - 7, farmRight = cx + 7;
    const farmTop = cz - 6, farmBottom = cz + 6;

    for (let i = 0; i < tiles.length; i++) {
      const { x, z, type } = tiles[i];

      // Skip farm zone entirely
      if (x >= farmLeft && x <= farmRight && z >= farmTop && z <= farmBottom) continue;

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
          continue; // one decoration per tile
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

    // ── Fence around crop plot area ──
    const fenceMinX = cx + 1, fenceMaxX = cx + 7;
    const fenceMinZ = cz - 3, fenceMaxZ = cz + 3;

    // Top and bottom edges (east-west runs)
    for (let fx = fenceMinX; fx <= fenceMaxX; fx++) {
      decorations.push({ type: 'fence', x: fx, z: fenceMinZ, variant: 0, rotation: 0 });
      decorations.push({ type: 'fence', x: fx, z: fenceMaxZ, variant: 0, rotation: 0 });
    }
    // Left and right edges (north-south runs)
    for (let fz = fenceMinZ + 1; fz < fenceMaxZ; fz++) {
      decorations.push({ type: 'fence', x: fenceMinX, z: fz, variant: 0, rotation: Math.PI / 2 });
      decorations.push({ type: 'fence', x: fenceMaxX, z: fz, variant: 0, rotation: Math.PI / 2 });
    }

    return decorations;
  }
}
