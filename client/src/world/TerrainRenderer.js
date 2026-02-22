// client/src/world/TerrainRenderer.js
// Renders the tile grid as a colorful low-poly terrain mesh.

import * as THREE from 'three';
import { WORLD_SIZE, TILE_SIZE, TILE_TYPES, COLORS, SEASONS } from '@shared/constants.js';

export class TerrainRenderer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.tileColors = null; // Float32Array for per-face coloring
  }

  /** Build terrain mesh from tile data received from server */
  build(tiles, season = SEASONS.SPRING) {
    // Remove old mesh
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];
    const indices = [];

    const grassColor = new THREE.Color(
      season === SEASONS.SPRING ? COLORS.GRASS_SPRING
      : season === SEASONS.SUMMER ? COLORS.GRASS_SUMMER
      : season === SEASONS.FALL ? COLORS.GRASS_FALL
      : COLORS.GRASS_WINTER
    );

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const x = tile.x * TILE_SIZE;
      const z = tile.z * TILE_SIZE;
      const y = tile.height || 0;

      // Choose color based on tile type
      let color;
      switch (tile.type) {
        case TILE_TYPES.WATER: color = new THREE.Color(COLORS.WATER); break;
        case TILE_TYPES.SAND: color = new THREE.Color(COLORS.SAND); break;
        case TILE_TYPES.DIRT: color = new THREE.Color(COLORS.DIRT); break;
        case TILE_TYPES.TILLED: color = new THREE.Color(COLORS.TILLED); break;
        case TILE_TYPES.STONE: color = new THREE.Color(COLORS.STONE); break;
        case TILE_TYPES.PATH: color = new THREE.Color(COLORS.PATH); break;
        default: color = grassColor.clone(); break;
      }

      // Add slight color variation for natural look
      const variation = (Math.sin(tile.x * 13.37 + tile.z * 7.31) * 0.03);
      color.r = Math.max(0, Math.min(1, color.r + variation));
      color.g = Math.max(0, Math.min(1, color.g + variation));
      color.b = Math.max(0, Math.min(1, color.b + variation));

      // 4 vertices per tile (quad)
      const vi = vertices.length / 3;
      const waterY = tile.type === TILE_TYPES.WATER ? -0.1 : y;
      vertices.push(
        x, waterY, z,
        x + TILE_SIZE, waterY, z,
        x + TILE_SIZE, waterY, z + TILE_SIZE,
        x, waterY, z + TILE_SIZE
      );

      // Color per vertex
      for (let j = 0; j < 4; j++) {
        colors.push(color.r, color.g, color.b);
      }

      // Two triangles per quad (CCW winding so normals face up)
      indices.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    // Store tile data for updates
    this.tiles = tiles;
    this.colorAttr = geometry.getAttribute('color');
  }

  /** Update a single tile's appearance (e.g., after tilling) */
  updateTile(x, z, newType, season = SEASONS.SPRING) {
    const idx = z * WORLD_SIZE + x;
    if (idx < 0 || idx >= this.tiles.length) return;

    this.tiles[idx].type = newType;

    const grassColor = new THREE.Color(
      season === SEASONS.SPRING ? COLORS.GRASS_SPRING
      : season === SEASONS.SUMMER ? COLORS.GRASS_SUMMER
      : season === SEASONS.FALL ? COLORS.GRASS_FALL
      : COLORS.GRASS_WINTER
    );

    let color;
    switch (newType) {
      case TILE_TYPES.WATER: color = new THREE.Color(COLORS.WATER); break;
      case TILE_TYPES.TILLED: color = new THREE.Color(COLORS.TILLED); break;
      case TILE_TYPES.DIRT: color = new THREE.Color(COLORS.DIRT); break;
      default: color = grassColor; break;
    }

    const vi = idx * 4;
    for (let j = 0; j < 4; j++) {
      this.colorAttr.setXYZ(vi + j, color.r, color.g, color.b);
    }
    this.colorAttr.needsUpdate = true;
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
  }
}
