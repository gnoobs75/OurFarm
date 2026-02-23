// client/src/world/GrassRenderer.js
// Renders procedural grass blade clusters across grass tiles.
// Uses merged geometry for performance and GPU-driven wind sway via shader injection.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE_SIZE, TILE_TYPES } from '@shared/constants.js';

export class GrassRenderer {
  constructor(scene) {
    this.scene = scene;
    this._meshes = [];
    this._swayUniforms = [];
    this._elapsed = 0;
  }

  /**
   * Build grass tufts from tile data.
   * Scatters procedural blade clusters on ~40% of grass tiles.
   */
  build(tiles) {
    this.dispose();

    // Collect grass tile positions
    const grassTiles = tiles.filter(t => t.type === TILE_TYPES.GRASS);

    // Generate grass tuft positions (~40% coverage for a natural look)
    const tufts = [];
    for (const tile of grassTiles) {
      const r = this._rand(tile.x, tile.z);
      if (r > 0.4) continue;

      // 1-3 tufts per tile at randomized positions within the tile
      const count = 1 + Math.floor(this._rand(tile.x + 100, tile.z) * 3);
      for (let i = 0; i < count; i++) {
        const rx = this._rand(tile.x + i * 7, tile.z + i * 13);
        const rz = this._rand(tile.x + i * 11, tile.z + i * 3);
        tufts.push({
          x: tile.x * TILE_SIZE + rx * TILE_SIZE,
          z: tile.z * TILE_SIZE + rz * TILE_SIZE,
          scale: 0.6 + this._rand(tile.x + i, tile.z + i * 5) * 0.6,
          colorVariant: this._rand(tile.x * 3 + i, tile.z * 5),
        });
      }
    }

    this._buildMergedGrass(tufts);
  }

  /**
   * Build merged grass geometry bucketed by color variant.
   * Each blade is a thin triangle; clusters of 3-5 blades per tuft.
   */
  _buildMergedGrass(tufts) {
    const buckets = new Map();

    const greenShades = [0x5da832, 0x4a9428, 0x6bb83a, 0x3d8a20, 0x7ec850];

    for (const tuft of tufts) {
      const bladeCount = 3 + Math.floor(tuft.colorVariant * 3);
      const colorIdx = Math.floor(tuft.colorVariant * greenShades.length);
      const color = greenShades[Math.min(colorIdx, greenShades.length - 1)];

      for (let b = 0; b < bladeCount; b++) {
        const br = this._rand(tuft.x * 100 + b, tuft.z * 100 + b);
        const height = (0.08 + br * 0.12) * tuft.scale;
        const width = 0.015 + br * 0.01;

        // Blade placement — offset from tuft center by a small random angle
        const angle = br * Math.PI * 2;
        const offsetX = Math.cos(angle) * 0.03 * tuft.scale;
        const offsetZ = Math.sin(angle) * 0.03 * tuft.scale;
        const tilt = (br - 0.5) * 0.3;

        // Each blade is a single triangle: bottom-left, bottom-right, top-center
        const geo = new THREE.BufferGeometry();
        const verts = new Float32Array([
          tuft.x + offsetX - width / 2, 0.01, tuft.z + offsetZ,
          tuft.x + offsetX + width / 2, 0.01, tuft.z + offsetZ,
          tuft.x + offsetX + tilt * 0.05, height, tuft.z + offsetZ + tilt * 0.05,
        ]);
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geo.computeVertexNormals();

        if (!buckets.has(color)) buckets.set(color, []);
        buckets.get(color).push(geo);
      }
    }

    // Merge each color bucket into a single mesh with sway material
    for (const [color, geometries] of buckets) {
      if (geometries.length === 0) continue;
      const merged = mergeGeometries(geometries, false);
      if (!merged) continue;

      const uTime = { value: 0 };
      const mat = new THREE.MeshPhongMaterial({
        color,
        side: THREE.DoubleSide,
      });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uTime;
        shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           // Wind sway — stronger at blade tip (higher Y), none at base
           float windStrength = position.y * 1.5;
           float wind = sin(uTime * 2.0 + position.x * 3.0 + position.z * 2.5) * 0.03 * windStrength;
           float wind2 = sin(uTime * 1.3 + position.x * 1.7 + position.z * 4.1) * 0.02 * windStrength;
           transformed.x += wind + wind2;
           transformed.z += wind * 0.6 + wind2 * 0.4;`
        );
      };

      this._swayUniforms.push(uTime);

      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.scene.add(mesh);
      this._meshes.push(mesh);

      // Dispose cloned source geometries (now merged into single buffer)
      for (const g of geometries) g.dispose();
    }
  }

  /**
   * Deterministic pseudo-random based on tile coordinates.
   * Returns a value in [0, 1).
   */
  _rand(x, z) {
    const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  /** Advance GPU sway time each frame */
  update(delta) {
    this._elapsed += delta;
    for (const u of this._swayUniforms) {
      u.value = this._elapsed;
    }
  }

  /** Clean up all GPU resources */
  dispose() {
    for (const mesh of this._meshes) {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    }
    this._meshes = [];
    this._swayUniforms = [];
  }
}
