// server/game/TerrainGenerator.js
// Generates the world tile grid from a seed using simplex noise.
// Produces natural terrain zones: farm center, grassland, pond, path, stone edges.

import { createNoise2D } from 'simplex-noise';
import { WORLD_SIZE, TILE_TYPES } from '../../shared/constants.js';

export class TerrainGenerator {
  constructor(seed) {
    this.seed = seed;
    // Fix: IIFE so createNoise2D receives the RNG function directly
    this.noise = createNoise2D((() => {
      let s = seed;
      return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
      };
    })());
  }

  generate() {
    const tiles = [];
    const S = WORLD_SIZE;
    const cx = S / 2, cz = S / 2;

    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const nx = x / S, nz = z / S;

        // Multi-octave height noise
        let height = 0;
        height += 1.0 * this.noise(nx * 6, nz * 6);
        height += 0.5 * this.noise(nx * 12, nz * 12);
        height += 0.25 * this.noise(nx * 24, nz * 24);
        height /= 1.75;

        // Distance from world center (normalized 0–1)
        const dx = (x - cx) / cx;
        const dz = (z - cz) / cz;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Pond: noise-shaped circle in SE quadrant
        const pondCx = S * 0.72, pondCz = S * 0.7;
        const pondDx = (x - pondCx) / 8, pondDz = (z - pondCz) / 7;
        const pondDist = Math.sqrt(pondDx * pondDx + pondDz * pondDz);
        const pondEdge = 1.0 + this.noise(x * 0.3, z * 0.3) * 0.3;
        const isPond = pondDist < pondEdge;
        const isPondBeach = !isPond && pondDist < pondEdge + 0.3;

        // Path: ~2 tile wide curving strip from farm center northward
        const pathX = cx + Math.sin(z * 0.15) * 2;
        const isPath = Math.abs(x - pathX) < 1.5 && z < cz - 3;

        // Farm clearing: rectangular area near center
        const farmLeft = cx - 6, farmRight = cx + 6;
        const farmTop = cz - 5, farmBottom = cz + 5;
        const isFarmArea = x >= farmLeft && x <= farmRight && z >= farmTop && z <= farmBottom;

        // Assign tile type by zone priority
        let type;
        if (isPond) {
          type = TILE_TYPES.WATER;
        } else if (isPondBeach) {
          type = TILE_TYPES.SAND;
        } else if (isPath) {
          type = TILE_TYPES.PATH;
        } else if (isFarmArea) {
          type = (Math.abs(height) < 0.15) ? TILE_TYPES.DIRT : TILE_TYPES.GRASS;
        } else if (dist > 0.85) {
          type = height > 0.2 ? TILE_TYPES.STONE : TILE_TYPES.GRASS;
        } else {
          type = height > 0.45 ? TILE_TYPES.STONE : TILE_TYPES.GRASS;
        }

        // Height: gentle rolling for grass, flat for farm/path, low for water
        let tileHeight;
        if (type === TILE_TYPES.WATER) {
          tileHeight = -0.15;
        } else if (type === TILE_TYPES.SAND) {
          tileHeight = 0.02;
        } else if (isFarmArea || isPath) {
          tileHeight = 0;
        } else {
          tileHeight = Math.max(0, height * 0.12);
        }

        tiles.push({ x, z, type, height: tileHeight });
      }
    }
    return tiles;
  }
}
