// server/game/TerrainGenerator.js
// Generates world tile grids from a seed using simplex noise.
// Farm: natural terrain zones with farm center, grassland, pond, stone edges.
// Town: roads, plaza, streams, fishing pools.

import { createNoise2D } from 'simplex-noise';
import { WORLD_SIZE, TILE_TYPES } from '../../shared/constants.js';

export class TerrainGenerator {
  constructor(seed) {
    this.seed = seed;
    this.noise = createNoise2D((() => {
      let s = seed;
      return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
      };
    })());
  }

  /** Generate the 64x64 farm map — natural terrain with central farm clearing */
  generate() {
    const tiles = [];
    const S = WORLD_SIZE;
    const cx = S / 2, cz = S / 2;

    // Portal path zone: south edge leading to town
    const portalLeft = 29, portalRight = 34;
    const portalTop = 58, portalBottom = 63;

    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const nx = x / S, nz = z / S;

        // Multi-octave height noise
        let height = 0;
        height += 1.0 * this.noise(nx * 6, nz * 6);
        height += 0.5 * this.noise(nx * 12, nz * 12);
        height += 0.25 * this.noise(nx * 24, nz * 24);
        height /= 1.75;

        // Distance from world center (normalized 0-1)
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

        // Farm clearing: rectangular area near center
        const farmLeft = cx - 6, farmRight = cx + 6;
        const farmTop = cz - 5, farmBottom = cz + 5;
        const isFarmArea = x >= farmLeft && x <= farmRight && z >= farmTop && z <= farmBottom;

        // Portal path to south edge
        const isPortalPath = x >= portalLeft && x <= portalRight && z >= portalTop && z <= portalBottom;

        // Connecting path from farm to portal
        const pathX = cx + Math.sin(z * 0.15) * 2;
        const isFarmPath = Math.abs(x - pathX) < 1.5 && z > cz + 5 && z < portalTop;

        // Assign tile type
        let type;
        if (isPond) {
          type = TILE_TYPES.WATER;
        } else if (isPondBeach) {
          type = TILE_TYPES.SAND;
        } else if (isPortalPath) {
          type = TILE_TYPES.PATH;
        } else if (isFarmPath) {
          type = TILE_TYPES.PATH;
        } else if (isFarmArea) {
          type = (Math.abs(height) < 0.15) ? TILE_TYPES.DIRT : TILE_TYPES.GRASS;
        } else if (dist > 0.85) {
          type = height > 0.2 ? TILE_TYPES.STONE : TILE_TYPES.GRASS;
        } else {
          type = height > 0.45 ? TILE_TYPES.STONE : TILE_TYPES.GRASS;
        }

        // Height
        let tileHeight;
        if (type === TILE_TYPES.WATER) {
          tileHeight = -0.15;
        } else if (type === TILE_TYPES.SAND) {
          tileHeight = 0.02;
        } else if (isFarmArea || isPortalPath || isFarmPath) {
          tileHeight = 0;
        } else {
          tileHeight = Math.max(0, height * 0.12);
        }

        tiles.push({ x, z, type, height: tileHeight });
      }
    }
    return tiles;
  }

  /** Generate a 64x64 town square map with roads, plaza, streams, and fishing pools */
  generateTown() {
    const tiles = [];
    const S = WORLD_SIZE;

    // Horizontal roads (2 tiles wide)
    const hRoads = [[10, 11], [18, 19], [28, 29], [42, 43]];
    // Vertical roads
    const vRoads = [[16, 17], [24, 25], [40, 41], [48, 49]];

    // Central plaza
    const plazaLeft = 26, plazaRight = 37, plazaTop = 12, plazaBottom = 18;

    // Arrival path from farm (north edge)
    const arrivalLeft = 30, arrivalRight = 33, arrivalTop = 0, arrivalBottom = 2;

    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        // Streams: west side (~x=7) and east side (~x=56), sine-perturbed N-S
        const westStreamX = 7 + Math.sin(z * 0.2) * 1.5;
        const eastStreamX = 56 + Math.sin(z * 0.25 + 1.5) * 1.5;
        const isWestStream = Math.abs(x - westStreamX) < 1.2;
        const isEastStream = Math.abs(x - eastStreamX) < 1.2;

        // Wider fishing pools at z:34-38
        const isFishingZone = z >= 34 && z <= 38;
        const isWestPool = isFishingZone && Math.abs(x - westStreamX) < 2.5;
        const isEastPool = isFishingZone && Math.abs(x - eastStreamX) < 2.5;

        // Sand beach buffers
        const isWestBeach = !isWestStream && !isWestPool && Math.abs(x - westStreamX) < 2.2;
        const isEastBeach = !isEastStream && !isEastPool && Math.abs(x - eastStreamX) < 2.2;

        // Plaza
        const isPlaza = x >= plazaLeft && x <= plazaRight && z >= plazaTop && z <= plazaBottom;

        // Roads
        const isHRoad = hRoads.some(([z1, z2]) => z >= z1 && z <= z2);
        const isVRoad = vRoads.some(([x1, x2]) => x >= x1 && x <= x2);

        // Arrival path (north edge)
        const isArrival = x >= arrivalLeft && x <= arrivalRight && z >= arrivalTop && z <= arrivalBottom;

        let type;
        if (isWestStream || isEastStream || isWestPool || isEastPool) {
          type = TILE_TYPES.WATER;
        } else if (isWestBeach || isEastBeach) {
          type = TILE_TYPES.SAND;
        } else if (isPlaza) {
          type = TILE_TYPES.STONE;
        } else if (isHRoad || isVRoad || isArrival) {
          type = TILE_TYPES.PATH;
        } else {
          type = TILE_TYPES.GRASS;
        }

        const tileHeight = type === TILE_TYPES.WATER ? -0.15
          : type === TILE_TYPES.SAND ? 0.02
          : 0;

        tiles.push({ x, z, type, height: tileHeight });
      }
    }
    return tiles;
  }
}
