// server/game/TerrainGenerator.js
// Generates the world tile grid from a seed using simplex noise.
// Produces natural terrain zones: farm center, town area, grassland, pond, path, stone edges.

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

    // ── Town zone bounds (NE quadrant) ──
    const townLeft = 24, townRight = 50;
    const townTop = 2, townBottom = 16;

    // Main east-west street at z ≈ 9
    const mainStreetZ = 9;
    const mainStreetHalfWidth = 1; // 3 tiles wide (8,9,10)

    // North-south cross streets at regular intervals
    const crossStreetXs = [28, 34, 40, 46];
    const crossStreetHalfWidth = 0.5; // 1 tile wide

    // Central cobblestone plaza
    const plazaLeft = 35, plazaRight = 39;
    const plazaTop = 7, plazaBottom = 11;

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

        // ── Town zone detection ──
        const isTown = x >= townLeft && x <= townRight && z >= townTop && z <= townBottom;

        // Town sub-zones
        const isPlaza = x >= plazaLeft && x <= plazaRight && z >= plazaTop && z <= plazaBottom;
        const isMainStreet = isTown && Math.abs(z - mainStreetZ) <= mainStreetHalfWidth;
        const isCrossStreet = isTown && crossStreetXs.some(sx => Math.abs(x - sx) <= crossStreetHalfWidth);

        // Path: curving strip from farm center northward through to town
        const pathX = cx + Math.sin(z * 0.15) * 2;
        const isPath = Math.abs(x - pathX) < 1.5 && z > townBottom && z < cz - 3;

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
        } else if (isPlaza) {
          // Central town plaza — cobblestone
          type = TILE_TYPES.STONE;
        } else if (isMainStreet || isCrossStreet) {
          // Town streets
          type = TILE_TYPES.PATH;
        } else if (isTown) {
          // Open grass plots within the town for buildings
          type = TILE_TYPES.GRASS;
        } else if (isPath) {
          // Path from farm northward (includes connector segment)
          type = TILE_TYPES.PATH;
        } else if (isFarmArea) {
          type = (Math.abs(height) < 0.15) ? TILE_TYPES.DIRT : TILE_TYPES.GRASS;
        } else if (dist > 0.85) {
          type = height > 0.2 ? TILE_TYPES.STONE : TILE_TYPES.GRASS;
        } else {
          type = height > 0.45 ? TILE_TYPES.STONE : TILE_TYPES.GRASS;
        }

        // Height: gentle rolling for grass, flat for farm/path/town, low for water
        let tileHeight;
        if (type === TILE_TYPES.WATER) {
          tileHeight = -0.15;
        } else if (type === TILE_TYPES.SAND) {
          tileHeight = 0.02;
        } else if (isFarmArea || isPath || isTown) {
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
