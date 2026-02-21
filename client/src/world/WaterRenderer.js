// client/src/world/WaterRenderer.js
// Animated water surface using custom shaders.

import * as THREE from 'three';
import { WORLD_SIZE, TILE_SIZE, TILE_TYPES } from '@shared/constants.js';

const waterVertexShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;

  void main() {
    vUv = uv;
    vec3 pos = position;
    // Gentle wave animation
    float wave = sin(pos.x * 3.0 + uTime * 2.0) * 0.03
               + sin(pos.z * 2.5 + uTime * 1.5) * 0.02;
    pos.y += wave;
    vWave = wave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const waterFragmentShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;

  void main() {
    // Base water color with subtle animation
    vec3 shallow = vec3(0.29, 0.56, 0.85);
    vec3 deep = vec3(0.15, 0.35, 0.65);
    float blend = sin(vUv.x * 10.0 + uTime) * 0.5 + 0.5;
    vec3 color = mix(shallow, deep, blend * 0.3 + 0.35);

    // Foam/sparkle at wave peaks
    float sparkle = smoothstep(0.02, 0.03, vWave);
    color += sparkle * 0.3;

    gl_FragColor = vec4(color, 0.8);
  }
`;

export class WaterRenderer {
  constructor(scene) {
    this.scene = scene;
    this.meshes = [];
    this.uniforms = {
      uTime: { value: 0 },
    };
  }

  /** Build water overlays for all water tiles */
  build(tiles) {
    // Collect water tile positions
    const waterTiles = tiles.filter(t => t.type === TILE_TYPES.WATER);
    if (waterTiles.length === 0) return;

    // Create a merged geometry for all water tiles
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i < waterTiles.length; i++) {
      const t = waterTiles[i];
      const x = t.x * TILE_SIZE;
      const z = t.z * TILE_SIZE;
      const y = 0.01; // Slightly above terrain

      const vi = i * 4;
      vertices.push(
        x, y, z,
        x + TILE_SIZE, y, z,
        x + TILE_SIZE, y, z + TILE_SIZE,
        x, y, z + TILE_SIZE
      );
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    const material = new THREE.ShaderMaterial({
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);
    this.meshes.push(mesh);
  }

  /** Call every frame with delta time */
  update(delta) {
    this.uniforms.uTime.value += delta;
  }

  dispose() {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
