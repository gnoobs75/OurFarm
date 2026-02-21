// client/src/world/DecorationRenderer.js
// Renders world decorations: trees, rocks, flowers, bushes, fences, reeds.
// Uses geometry merging to batch thousands of meshes into a few draw calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE_SIZE } from '@shared/constants.js';

const STATIC_TYPES = new Set(['rock', 'flower', 'bush', 'fence', 'reeds', 'statue', 'fountain', 'lamppost', 'bench', 'signpost']);

export class DecorationRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this._mergedMeshes = [];  // batched static + tree meshes
    this._swayMaterials = []; // tree materials with uTime uniform
    this._elapsed = 0;
  }

  /** Build all decoration meshes from server data */
  build(decorations, season = 0) {
    this._season = season;
    // Partition into statics vs trees
    const statics = [];
    const trees = [];
    for (const dec of decorations) {
      if (dec.type === 'tree') trees.push(dec);
      else if (STATIC_TYPES.has(dec.type)) statics.push(dec);
    }

    this._buildMergedStatics(statics);
    this._buildMergedTrees(trees);
  }

  /** Merge all static decorations into a few draw calls, bucketed by material color */
  _buildMergedStatics(statics) {
    // Bucket: material color hex → array of { geometry, castShadow }
    const buckets = new Map();

    for (const dec of statics) {
      const worldX = dec.x * TILE_SIZE + TILE_SIZE / 2;
      const worldZ = dec.z * TILE_SIZE + TILE_SIZE / 2;
      const seed = dec.x * 1000 + dec.z;
      const noCastShadow = dec.type === 'flower' || dec.type === 'reeds';

      let group;
      switch (dec.type) {
        case 'rock':     group = this.assetGen.createRock(null, seed); break;
        case 'flower':   group = this.assetGen.createFlowerCluster(seed); break;
        case 'bush':     group = this.assetGen.createBush(seed); break;
        case 'fence':    group = this.assetGen.createFenceSegment(); break;
        case 'reeds':    group = this.assetGen.createReeds(seed); break;
        case 'statue':   group = this.assetGen.createStatue(); break;
        case 'fountain': group = this.assetGen.createFountain(); break;
        case 'lamppost': group = this.assetGen.createLamppost(); break;
        case 'bench':    group = this.assetGen.createBench(); break;
        case 'signpost': group = this.assetGen.createSignpost(seed); break;
        default: continue;
      }

      // Position the group in world space
      group.position.set(worldX, 0, worldZ);
      group.rotation.y = dec.rotation || 0;
      group.updateMatrixWorld(true);

      // Extract meshes from group, transform geometry to world space
      group.traverse(child => {
        if (!child.isMesh) return;
        const colorHex = child.material.color.getHex();
        const key = `${colorHex}-${noCastShadow ? 0 : 1}`;
        if (!buckets.has(key)) {
          buckets.set(key, { color: colorHex, geometries: [], castShadow: !noCastShadow });
        }
        const cloned = child.geometry.clone();
        cloned.applyMatrix4(child.matrixWorld);
        buckets.get(key).geometries.push(cloned);
      });

      // Dispose temporary group geometries
      group.traverse(child => {
        if (child.geometry) child.geometry.dispose();
      });
    }

    // Merge each bucket into a single mesh
    for (const [, bucket] of buckets) {
      if (bucket.geometries.length === 0) continue;
      const merged = mergeGeometries(bucket.geometries, false);
      if (!merged) continue;

      const mat = this.assetGen.getMaterial(bucket.color);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = false;

      this.scene.add(mesh);
      this._mergedMeshes.push(mesh);

      // Dispose cloned source geometries (merged into new buffer)
      for (const g of bucket.geometries) g.dispose();
    }
  }

  /** Merge trees into batched meshes with GPU-driven sway via onBeforeCompile */
  _buildMergedTrees(trees) {
    // Bucket by material color hex
    const buckets = new Map();

    for (const dec of trees) {
      const worldX = dec.x * TILE_SIZE + TILE_SIZE / 2;
      const worldZ = dec.z * TILE_SIZE + TILE_SIZE / 2;
      const seed = dec.x * 1000 + dec.z;

      const group = this.assetGen.createTree(dec.variant, seed, this._season);
      group.position.set(worldX, 0, worldZ);
      group.rotation.y = dec.rotation || 0;
      group.updateMatrixWorld(true);

      group.traverse(child => {
        if (!child.isMesh) return;
        const colorHex = child.material.color.getHex();
        if (!buckets.has(colorHex)) {
          buckets.set(colorHex, []);
        }
        const cloned = child.geometry.clone();
        cloned.applyMatrix4(child.matrixWorld);
        buckets.get(colorHex).push(cloned);
      });

      group.traverse(child => {
        if (child.geometry) child.geometry.dispose();
      });
    }

    // Merge each color bucket with sway material
    for (const [colorHex, geometries] of buckets) {
      if (geometries.length === 0) continue;
      const merged = mergeGeometries(geometries, false);
      if (!merged) continue;

      // Create sway-enabled material via onBeforeCompile
      const uTime = { value: 0 };
      const mat = new THREE.MeshLambertMaterial({
        color: colorHex,
        flatShading: true,
      });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uTime;
        // Inject sway: gentle sine rotation based on world X position
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float swayAngle = sin(uTime.x + position.x * 0.5) * 0.012;
           float cs = cos(swayAngle);
           float sn = sin(swayAngle);
           transformed.x = position.x * cs - position.z * sn;
           transformed.z = position.x * sn + position.z * cs;`
        );
        shader.uniforms.uTime = uTime;
      };

      this._swayMaterials.push(uTime);

      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = false;

      this.scene.add(mesh);
      this._mergedMeshes.push(mesh);

      for (const g of geometries) g.dispose();
    }
  }

  /** Rebuild all decorations for a new season */
  rebuild(decorations, season) {
    this.dispose();
    this.build(decorations, season);
  }

  /** Per-frame update — advance GPU sway time */
  update(delta) {
    this._elapsed += delta;
    for (const uTime of this._swayMaterials) {
      uTime.value = this._elapsed;
    }
  }

  dispose() {
    for (const mesh of this._mergedMeshes) {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      // Sway materials are custom-created, dispose them
      if (mesh.material && !this.assetGen._matCache.has(mesh.material)) {
        mesh.material.dispose();
      }
    }
    this._mergedMeshes = [];
    this._swayMaterials = [];
  }
}
