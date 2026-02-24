// client/src/world/WaterRenderer.js
// Enhanced animated water surface with multi-layered waves, shoreline foam,
// reflections, caustic patterns, and depth-based coloring.

import * as THREE from 'three';
import { WORLD_SIZE, TILE_SIZE, TILE_TYPES } from '@shared/constants.js';

// Subdivisions per water tile edge (4x4 grid = 16 quads per tile)
const SUBDIVISIONS = 4;

const waterVertexShader = `
  uniform float uTime;
  attribute float aEdge;

  varying vec2 vUv;
  varying float vWave;
  varying float vEdge;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vEdge = aEdge;
    vec3 pos = position;

    // --- Multi-layered wave animation (5 overlapping waves) ---
    // Wave 1: broad slow swell along X
    float w1 = sin(pos.x * 2.0 + uTime * 1.2) * 0.025;
    // Wave 2: medium wave along Z
    float w2 = sin(pos.z * 3.0 + uTime * 1.8) * 0.018;
    // Wave 3: faster diagonal ripple (X+Z)
    float w3 = sin((pos.x + pos.z) * 4.5 + uTime * 2.5) * 0.012;
    // Wave 4: cross-diagonal ripple (X-Z)
    float w4 = sin((pos.x - pos.z) * 3.8 + uTime * 2.0) * 0.010;
    // Wave 5: fine high-frequency shimmer
    float w5 = sin(pos.x * 8.0 + pos.z * 6.0 + uTime * 3.5) * 0.005;

    float wave = w1 + w2 + w3 + w4 + w5;

    // Reduce wave amplitude at edges for a calmer shoreline
    wave *= mix(0.3, 1.0, 1.0 - vEdge * 0.7);

    pos.y += wave;
    vWave = wave;
    vWorldPos = pos;

    // Approximate surface normal via partial derivatives of wave function
    float dx = 2.0 * cos(pos.x * 2.0 + uTime * 1.2) * 0.025
             + 4.5 * cos((pos.x + pos.z) * 4.5 + uTime * 2.5) * 0.012
             + 3.8 * cos((pos.x - pos.z) * 3.8 + uTime * 2.0) * 0.010
             + 8.0 * cos(pos.x * 8.0 + pos.z * 6.0 + uTime * 3.5) * 0.005;
    float dz = 3.0 * cos(pos.z * 3.0 + uTime * 1.8) * 0.018
             + 4.5 * cos((pos.x + pos.z) * 4.5 + uTime * 2.5) * 0.012
             - 3.8 * cos((pos.x - pos.z) * 3.8 + uTime * 2.0) * 0.010
             + 6.0 * cos(pos.x * 8.0 + pos.z * 6.0 + uTime * 3.5) * 0.005;

    vNormal = normalize(vec3(-dx, 1.0, -dz));

    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vViewDir = normalize(cameraPosition - worldPosition.xyz);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const waterFragmentShader = `
  uniform float uTime;

  varying vec2 vUv;
  varying float vWave;
  varying float vEdge;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;
  varying vec3 vNormal;

  // Cheap pseudo-random hash for caustics
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Smooth noise for caustic patterns
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Caustic pattern using overlapping sine approximation
  float caustic(vec2 uv, float time) {
    float c = 0.0;
    // Layer 1: large bright cells
    c += sin(uv.x * 6.0 + time * 0.8) * sin(uv.y * 7.0 - time * 0.6) * 0.5 + 0.5;
    // Layer 2: medium detail, offset angle
    vec2 uv2 = uv * 1.4 + vec2(time * 0.3, -time * 0.4);
    c += sin(uv2.x * 8.0 + uv2.y * 5.0) * sin(uv2.y * 9.0 - uv2.x * 3.0) * 0.5 + 0.5;
    // Layer 3: fine detail, rotated
    vec2 uv3 = vec2(uv.x * 0.7 - uv.y * 0.7, uv.x * 0.7 + uv.y * 0.7) * 1.8;
    c += sin(uv3.x * 10.0 + time * 1.1) * sin(uv3.y * 11.0 - time * 0.9) * 0.5 + 0.5;
    // Normalize and sharpen
    c /= 3.0;
    c = smoothstep(0.45, 0.75, c);
    return c;
  }

  void main() {
    // --- Color depth variation: darker toward center, lighter at edges ---
    vec3 shallowColor = vec3(0.35, 0.62, 0.90);  // light, edge
    vec3 midColor     = vec3(0.22, 0.48, 0.78);   // mid-depth
    vec3 deepColor    = vec3(0.10, 0.28, 0.55);   // deep, center

    // Edge factor: 1.0 = shoreline, 0.0 = open water
    float edgeFactor = vEdge;
    // Depth blend: edges are shallow, center is deep
    vec3 baseColor = mix(deepColor, shallowColor, edgeFactor);
    // Add mid-tone variation with subtle wave-driven animation
    float depthNoise = sin(vWorldPos.x * 5.0 + uTime * 0.5) * sin(vWorldPos.z * 4.0 - uTime * 0.4);
    baseColor = mix(baseColor, midColor, (depthNoise * 0.5 + 0.5) * 0.2);

    // --- Caustic patterns ---
    float caust = caustic(vWorldPos.xz, uTime);
    // Caustics are more visible in shallow water / near edges
    float causticStrength = mix(0.06, 0.14, edgeFactor);
    baseColor += vec3(0.7, 0.85, 1.0) * caust * causticStrength;

    // --- Sky reflection bands ---
    // Animated horizontal bands simulating sky reflection
    vec3 skyColor = vec3(0.55, 0.75, 0.95);
    float skyBand = sin(vWorldPos.z * 2.0 + vWorldPos.x * 0.5 + uTime * 0.6) * 0.5 + 0.5;
    skyBand *= sin(vWorldPos.x * 1.5 - uTime * 0.4) * 0.5 + 0.5;
    skyBand = smoothstep(0.6, 0.85, skyBand);

    // --- Fresnel-like effect ---
    float fresnel = 1.0 - max(dot(vViewDir, vNormal), 0.0);
    fresnel = pow(fresnel, 3.0);
    fresnel = clamp(fresnel, 0.0, 1.0);

    // Apply sky reflection modulated by fresnel
    baseColor = mix(baseColor, skyColor, skyBand * fresnel * 0.35);

    // --- Specular highlights ---
    // Approximate sun direction (slightly tilted)
    vec3 sunDir = normalize(vec3(0.4, 0.8, 0.3));
    vec3 halfVec = normalize(vViewDir + sunDir);
    float spec = pow(max(dot(vNormal, halfVec), 0.0), 64.0);
    // Add secondary softer specular
    float spec2 = pow(max(dot(vNormal, halfVec), 0.0), 16.0);
    vec3 specColor = vec3(1.0, 0.97, 0.9);
    baseColor += specColor * (spec * 0.4 + spec2 * 0.1);

    // Broad fresnel brightening of the surface
    baseColor += vec3(0.08, 0.10, 0.15) * fresnel;

    // --- Shoreline foam ---
    float foam = 0.0;
    if (edgeFactor > 0.01) {
      // Animated foam bands at shoreline
      float foamWave1 = sin(vWorldPos.x * 12.0 + uTime * 3.0) * 0.5 + 0.5;
      float foamWave2 = sin(vWorldPos.z * 10.0 - uTime * 2.5) * 0.5 + 0.5;
      float foamWave3 = sin((vWorldPos.x + vWorldPos.z) * 8.0 + uTime * 2.0) * 0.5 + 0.5;
      // Foam pattern: combine waves
      float foamPattern = foamWave1 * 0.4 + foamWave2 * 0.35 + foamWave3 * 0.25;
      // Foam appears more at higher edge values
      float foamMask = smoothstep(0.0, 0.6, edgeFactor);
      // Pulsating foam threshold
      float foamThreshold = 0.35 + sin(uTime * 1.5) * 0.1;
      foam = smoothstep(foamThreshold, foamThreshold + 0.2, foamPattern) * foamMask;
      // Add fine bubbles using noise-like pattern
      float bubbles = sin(vWorldPos.x * 25.0 + uTime * 4.0) * sin(vWorldPos.z * 22.0 - uTime * 3.0);
      bubbles = smoothstep(0.3, 0.7, bubbles * 0.5 + 0.5) * foamMask * 0.3;
      foam += bubbles;
      foam = clamp(foam, 0.0, 1.0);
    }
    // White foam color
    vec3 foamColor = vec3(0.9, 0.95, 1.0);
    baseColor = mix(baseColor, foamColor, foam * 0.7);

    // --- Wave peak sparkle ---
    float sparkle = smoothstep(0.03, 0.05, vWave);
    baseColor += vec3(0.25, 0.28, 0.30) * sparkle;

    // --- Alpha: slightly more opaque at edges (foam), transparent in deep ---
    float alpha = mix(0.82, 0.92, edgeFactor);
    alpha = mix(alpha, 0.95, foam * 0.5);

    gl_FragColor = vec4(baseColor, alpha);
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

    // Build a lookup set for fast neighbor checks
    const waterSet = new Set();
    for (const t of waterTiles) {
      waterSet.add(`${t.x},${t.z}`);
    }

    // Create a merged geometry for all water tiles with subdivision
    const vertices = [];
    const uvs = [];
    const edges = [];
    const indices = [];
    let vertexOffset = 0;

    const sub = SUBDIVISIONS;
    const step = TILE_SIZE / sub;

    for (let i = 0; i < waterTiles.length; i++) {
      const t = waterTiles[i];
      const baseX = t.x * TILE_SIZE;
      const baseZ = t.z * TILE_SIZE;
      const y = 0.01; // Slightly above terrain

      // Determine which edges of this tile border non-water
      const hasNonWaterNorth = !waterSet.has(`${t.x},${t.z - 1}`); // -Z neighbor
      const hasNonWaterSouth = !waterSet.has(`${t.x},${t.z + 1}`); // +Z neighbor
      const hasNonWaterWest  = !waterSet.has(`${t.x - 1},${t.z}`); // -X neighbor
      const hasNonWaterEast  = !waterSet.has(`${t.x + 1},${t.z}`); // +X neighbor
      // Diagonal neighbors for corner detection
      const hasNonWaterNW = !waterSet.has(`${t.x - 1},${t.z - 1}`);
      const hasNonWaterNE = !waterSet.has(`${t.x + 1},${t.z - 1}`);
      const hasNonWaterSW = !waterSet.has(`${t.x - 1},${t.z + 1}`);
      const hasNonWaterSE = !waterSet.has(`${t.x + 1},${t.z + 1}`);

      // Generate (sub+1) x (sub+1) grid of vertices for this tile
      const tileVertStart = vertexOffset;
      for (let gz = 0; gz <= sub; gz++) {
        for (let gx = 0; gx <= sub; gx++) {
          const vx = baseX + gx * step;
          const vz = baseZ + gz * step;
          vertices.push(vx, y, vz);

          // UV within this tile: 0..1
          uvs.push(gx / sub, gz / sub);

          // Edge detection: how close is this vertex to a non-water border?
          // Normalized position within tile [0, 1]
          const nx = gx / sub;
          const nz = gz / sub;

          // Calculate edge influence from each bordering direction
          let edgeVal = 0.0;

          // Cardinal edge distances (inverted: 1 at edge, 0 at center)
          if (hasNonWaterNorth) {
            // North border is at nz=0
            edgeVal = Math.max(edgeVal, 1.0 - nz);
          }
          if (hasNonWaterSouth) {
            // South border is at nz=1
            edgeVal = Math.max(edgeVal, nz);
          }
          if (hasNonWaterWest) {
            // West border is at nx=0
            edgeVal = Math.max(edgeVal, 1.0 - nx);
          }
          if (hasNonWaterEast) {
            // East border is at nx=1
            edgeVal = Math.max(edgeVal, nx);
          }

          // Diagonal corner influences (weaker, only if corner diagonal is non-water)
          if (hasNonWaterNW && hasNonWaterNorth && hasNonWaterWest) {
            const dist = Math.sqrt((1.0 - nx) * (1.0 - nx) + (1.0 - nz) * (1.0 - nz)) / Math.SQRT2;
            edgeVal = Math.max(edgeVal, dist * 0.5);
          }
          if (hasNonWaterNE && hasNonWaterNorth && hasNonWaterEast) {
            const dist = Math.sqrt(nx * nx + (1.0 - nz) * (1.0 - nz)) / Math.SQRT2;
            edgeVal = Math.max(edgeVal, dist * 0.5);
          }
          if (hasNonWaterSW && hasNonWaterSouth && hasNonWaterWest) {
            const dist = Math.sqrt((1.0 - nx) * (1.0 - nx) + nz * nz) / Math.SQRT2;
            edgeVal = Math.max(edgeVal, dist * 0.5);
          }
          if (hasNonWaterSE && hasNonWaterSouth && hasNonWaterEast) {
            const dist = Math.sqrt(nx * nx + nz * nz) / Math.SQRT2;
            edgeVal = Math.max(edgeVal, dist * 0.5);
          }

          // Smooth the edge value with a curve for more natural falloff
          edgeVal = Math.min(edgeVal, 1.0);
          edgeVal = edgeVal * edgeVal * (3.0 - 2.0 * edgeVal); // smoothstep

          edges.push(edgeVal);
          vertexOffset++;
        }
      }

      // Generate triangle indices for this tile's grid
      const rowVerts = sub + 1;
      for (let gz = 0; gz < sub; gz++) {
        for (let gx = 0; gx < sub; gx++) {
          const topLeft     = tileVertStart + gz * rowVerts + gx;
          const topRight    = topLeft + 1;
          const bottomLeft  = topLeft + rowVerts;
          const bottomRight = bottomLeft + 1;

          // Two triangles per quad
          indices.push(topLeft, topRight, bottomRight);
          indices.push(topLeft, bottomRight, bottomLeft);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('aEdge', new THREE.Float32BufferAttribute(edges, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.ShaderMaterial({
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
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
    this.meshes.length = 0;
  }
}
