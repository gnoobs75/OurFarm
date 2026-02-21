// server/game/TerrainGenerator.js
// Generates the world tile grid from a seed using simplex noise.

import { createNoise2D } from 'simplex-noise';
import { WORLD_SIZE, TILE_TYPES } from '../../shared/constants.js';

export class TerrainGenerator {
  constructor(seed) {
    this.seed = seed;
    this.noise = createNoise2D(() => {
      let s = seed;
      return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
      };
    });
  }

  generate() {
    const tiles = [];
    const centerX = WORLD_SIZE / 2;
    const centerZ = WORLD_SIZE / 2;

    for (let z = 0; z < WORLD_SIZE; z++) {
      for (let x = 0; x < WORLD_SIZE; x++) {
        const nx = x / WORLD_SIZE;
        const nz = z / WORLD_SIZE;
        let height = 0;
        height += 1.0 * this.noise(1 * nx * 8, 1 * nz * 8);
        height += 0.5 * this.noise(2 * nx * 8, 2 * nz * 8);
        height += 0.25 * this.noise(4 * nx * 8, 4 * nz * 8);
        height = height / 1.75;

        const dx = (x - centerX) / centerX;
        const dz = (z - centerZ) / centerZ;
        const distFromCenter = Math.sqrt(dx * dx + dz * dz);

        let type;
        if (height < -0.3) {
          type = TILE_TYPES.WATER;
        } else if (height < -0.15) {
          type = TILE_TYPES.SAND;
        } else if (distFromCenter < 0.25) {
          type = height < 0.1 ? TILE_TYPES.DIRT : TILE_TYPES.GRASS;
        } else if (z < WORLD_SIZE * 0.25) {
          type = TILE_TYPES.PATH;
        } else if (x > WORLD_SIZE * 0.7) {
          type = height < 0.2 ? TILE_TYPES.WATER : TILE_TYPES.GRASS;
        } else if (x < WORLD_SIZE * 0.2) {
          type = height > 0.2 ? TILE_TYPES.STONE : TILE_TYPES.GRASS;
        } else {
          type = TILE_TYPES.GRASS;
        }

        tiles.push({
          x, z, type,
          height: Math.max(type === TILE_TYPES.WATER ? -0.3 : 0, height * 0.5),
        });
      }
    }
    return tiles;
  }
}
