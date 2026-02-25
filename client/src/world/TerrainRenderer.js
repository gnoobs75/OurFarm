// client/src/world/TerrainRenderer.js
// Renders the tile grid as a colorful low-poly terrain mesh.
// Uses per-vertex color noise and subtle height variation for a natural look.

import * as THREE from 'three';
import { WORLD_SIZE, TILE_SIZE, TILE_TYPES, COLORS, SEASONS } from '@shared/constants.js';

export class TerrainRenderer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.tileColors = null; // Float32Array for per-face coloring
  }

  /**
   * Multi-frequency pseudo-noise for natural variation.
   * Returns roughly -1 to 1 for any (x, z) world coordinate.
   * Deterministic: same input always produces same output.
   */
  _noise(x, z) {
    const n1 = Math.sin(x * 13.37 + z * 7.31) * 0.5;
    const n2 = Math.sin(x * 5.43 + z * 11.17) * 0.3;
    const n3 = Math.sin(x * 23.71 + z * 3.53) * 0.2;
    return n1 + n2 + n3; // roughly -1 to 1
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

    // Vertex corner offsets: [0,0], [1,0], [1,1], [0,1]
    // Tiny outward shift per corner to prevent sub-pixel seam gaps
    const SEAM_FIX = 0.005;
    const cornerDx = [0, 1, 1, 0];
    const cornerDz = [0, 0, 1, 1];
    const cornerShiftX = [-SEAM_FIX, SEAM_FIX, SEAM_FIX, -SEAM_FIX];
    const cornerShiftZ = [-SEAM_FIX, -SEAM_FIX, SEAM_FIX, SEAM_FIX];

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const baseX = tile.x * TILE_SIZE;
      const baseZ = tile.z * TILE_SIZE;
      const baseY = tile.height || 0;

      // Choose base color by tile type
      let baseColor;
      switch (tile.type) {
        case TILE_TYPES.WATER: baseColor = new THREE.Color(COLORS.WATER); break;
        case TILE_TYPES.SAND: baseColor = new THREE.Color(COLORS.SAND); break;
        case TILE_TYPES.DIRT: baseColor = new THREE.Color(COLORS.DIRT); break;
        case TILE_TYPES.TILLED: baseColor = new THREE.Color(COLORS.TILLED); break;
        case TILE_TYPES.STONE: baseColor = new THREE.Color(COLORS.STONE); break;
        case TILE_TYPES.PATH: baseColor = new THREE.Color(COLORS.PATH); break;
        default: baseColor = grassColor.clone(); break;
      }

      const isGrass = tile.type === TILE_TYPES.GRASS;
      const isDirt = tile.type === TILE_TYPES.DIRT;
      const isSand = tile.type === TILE_TYPES.SAND;
      const isWater = tile.type === TILE_TYPES.WATER;
      const isStone = tile.type === TILE_TYPES.STONE;
      const isPath = tile.type === TILE_TYPES.PATH;

      const vi = vertices.length / 3;

      // Per-vertex: each of the 4 corners gets its own position and color
      for (let j = 0; j < 4; j++) {
        // World-space vertex coordinates (consistent across adjacent tiles)
        const vx = tile.x + cornerDx[j];
        const vz = tile.z + cornerDz[j];

        // Noise at this vertex position (deterministic per world vertex)
        const noise = this._noise(vx, vz);

        // --- Height ---
        let y = isWater ? -0.1 : baseY;
        if (isGrass || isDirt || isSand) {
          // Subtle undulation using a slower noise frequency
          y += this._noise(vx * 0.7, vz * 0.7) * 0.04;
        }
        vertices.push(baseX + cornerDx[j] * TILE_SIZE + cornerShiftX[j], y, baseZ + cornerDz[j] * TILE_SIZE + cornerShiftZ[j]);

        // --- Color ---
        const vc = baseColor.clone();

        if (isGrass) {
          // Grass: vary hue, not just brightness, for natural patches
          // Green channel shifts more for grass variety
          vc.g = Math.max(0, Math.min(1, vc.g + noise * 0.08));
          // Slight red shift creates warm yellow-green patches
          vc.r = Math.max(0, Math.min(1, vc.r + noise * 0.03));
          // Blue stays mostly stable for richness
          vc.b = Math.max(0, Math.min(1, vc.b + noise * 0.02));
        } else if (isDirt || isSand) {
          // Dirt/sand: subtle earth-tone variation
          vc.r = Math.max(0, Math.min(1, vc.r + noise * 0.05));
          vc.g = Math.max(0, Math.min(1, vc.g + noise * 0.04));
          vc.b = Math.max(0, Math.min(1, vc.b + noise * 0.02));
        } else if (isStone || isPath) {
          // Stone/path: edge softening via per-vertex noise
          // Use a slightly stronger variation at edges to blend with neighbors
          const edgeNoise = noise * 0.04;
          vc.r = Math.max(0, Math.min(1, vc.r + edgeNoise));
          vc.g = Math.max(0, Math.min(1, vc.g + edgeNoise));
          vc.b = Math.max(0, Math.min(1, vc.b + edgeNoise));
        } else {
          // Water, tilled, etc.: uniform subtle variation
          vc.r = Math.max(0, Math.min(1, vc.r + noise * 0.02));
          vc.g = Math.max(0, Math.min(1, vc.g + noise * 0.02));
          vc.b = Math.max(0, Math.min(1, vc.b + noise * 0.02));
        }

        colors.push(vc.r, vc.g, vc.b);
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
    this.posAttr = geometry.getAttribute('position');
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

    let baseColor;
    switch (newType) {
      case TILE_TYPES.WATER: baseColor = new THREE.Color(COLORS.WATER); break;
      case TILE_TYPES.SAND: baseColor = new THREE.Color(COLORS.SAND); break;
      case TILE_TYPES.DIRT: baseColor = new THREE.Color(COLORS.DIRT); break;
      case TILE_TYPES.TILLED: baseColor = new THREE.Color(COLORS.TILLED); break;
      case TILE_TYPES.STONE: baseColor = new THREE.Color(COLORS.STONE); break;
      case TILE_TYPES.PATH: baseColor = new THREE.Color(COLORS.PATH); break;
      default: baseColor = grassColor.clone(); break;
    }

    const isGrass = newType === TILE_TYPES.GRASS;
    const isDirt = newType === TILE_TYPES.DIRT;
    const isSand = newType === TILE_TYPES.SAND;
    const isWater = newType === TILE_TYPES.WATER;
    const isStone = newType === TILE_TYPES.STONE;
    const isPath = newType === TILE_TYPES.PATH;

    const cornerDx = [0, 1, 1, 0];
    const cornerDz = [0, 0, 1, 1];

    const vi = idx * 4;
    for (let j = 0; j < 4; j++) {
      const vx = x + cornerDx[j];
      const vz = z + cornerDz[j];
      const noise = this._noise(vx, vz);

      // Update height
      let y = isWater ? -0.1 : (this.tiles[idx].height || 0);
      if (isGrass || isDirt || isSand) {
        y += this._noise(vx * 0.7, vz * 0.7) * 0.04;
      }
      this.posAttr.setY(vi + j, y);

      // Update color with per-vertex noise
      const vc = baseColor.clone();

      if (isGrass) {
        vc.g = Math.max(0, Math.min(1, vc.g + noise * 0.08));
        vc.r = Math.max(0, Math.min(1, vc.r + noise * 0.03));
        vc.b = Math.max(0, Math.min(1, vc.b + noise * 0.02));
      } else if (isDirt || isSand) {
        vc.r = Math.max(0, Math.min(1, vc.r + noise * 0.05));
        vc.g = Math.max(0, Math.min(1, vc.g + noise * 0.04));
        vc.b = Math.max(0, Math.min(1, vc.b + noise * 0.02));
      } else if (isStone || isPath) {
        const edgeNoise = noise * 0.04;
        vc.r = Math.max(0, Math.min(1, vc.r + edgeNoise));
        vc.g = Math.max(0, Math.min(1, vc.g + edgeNoise));
        vc.b = Math.max(0, Math.min(1, vc.b + edgeNoise));
      } else {
        vc.r = Math.max(0, Math.min(1, vc.r + noise * 0.02));
        vc.g = Math.max(0, Math.min(1, vc.g + noise * 0.02));
        vc.b = Math.max(0, Math.min(1, vc.b + noise * 0.02));
      }

      this.colorAttr.setXYZ(vi + j, vc.r, vc.g, vc.b);
    }

    this.posAttr.needsUpdate = true;
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
