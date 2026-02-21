// shared/TileMap.js — Grid math and coordinate utilities

import { TILE_SIZE, WORLD_SIZE } from './constants.js';

/** Convert world position to tile coordinates */
export function worldToTile(worldX, worldZ) {
  return {
    x: Math.floor(worldX / TILE_SIZE),
    z: Math.floor(worldZ / TILE_SIZE),
  };
}

/** Convert tile coordinates to world center position */
export function tileToWorld(tileX, tileZ) {
  return {
    x: tileX * TILE_SIZE + TILE_SIZE / 2,
    z: tileZ * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** Check if tile coordinates are within world bounds */
export function isValidTile(tileX, tileZ) {
  return tileX >= 0 && tileX < WORLD_SIZE && tileZ >= 0 && tileZ < WORLD_SIZE;
}

/** Get flat array index from tile coordinates */
export function tileIndex(tileX, tileZ) {
  return tileZ * WORLD_SIZE + tileX;
}

/** Get tile coordinates from flat array index */
export function indexToTile(index) {
  return {
    x: index % WORLD_SIZE,
    z: Math.floor(index / WORLD_SIZE),
  };
}

/** Manhattan distance between two tiles */
export function tileDistance(x1, z1, x2, z2) {
  return Math.abs(x1 - x2) + Math.abs(z1 - z2);
}

/** Get neighboring tile coords (4-directional) */
export function getNeighbors(tileX, tileZ) {
  return [
    { x: tileX - 1, z: tileZ },
    { x: tileX + 1, z: tileZ },
    { x: tileX, z: tileZ - 1 },
    { x: tileX, z: tileZ + 1 },
  ].filter(t => isValidTile(t.x, t.z));
}
