// client/src/world/SeasonalEffects.js
// Ambient seasonal particles — flower petals in spring, dandelion seeds in
// summer, tumbling leaves in fall. Winter is handled by WeatherRenderer snow.

import * as THREE from 'three';
import { SEASONS } from '@shared/constants.js';

// ---------------------------------------------------------------------------
// Vertex shader — shared across all seasonal particle types.
// Per-particle attributes drive size, alpha, and a rotation angle that the
// fragment shader uses to draw a rotated soft ellipse.
// ---------------------------------------------------------------------------
const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aRotation;

  varying float vAlpha;
  varying float vRotation;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = -mvPosition.z;
    float basePx = aSize * (300.0 / max(dist, 1.0));
    gl_PointSize = clamp(basePx, 1.0, 14.0);

    vAlpha = aAlpha;
    vRotation = aRotation;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

// ---------------------------------------------------------------------------
// Fragment shader — draws a rotated soft ellipse (petal/leaf shape).
// ---------------------------------------------------------------------------
const FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;
  varying float vRotation;
  uniform vec3 uTint;      // not used for colour (per-vertex), just a fallback

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;

    // Rotate UV by per-particle rotation angle
    float c = cos(vRotation);
    float s = sin(vRotation);
    vec2 ruv = vec2(
      uv.x * c - uv.y * s,
      uv.x * s + uv.y * c
    );

    // Soft ellipse — wider than tall for a petal/leaf silhouette
    float ex = ruv.x * 1.0;
    float ey = ruv.y * 1.6;
    float dist = length(vec2(ex, ey));
    float alpha = smoothstep(1.0, 0.4, dist) * vAlpha;

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uTint, alpha);
  }
`;

// ---------------------------------------------------------------------------
// Per-vertex colour fragment shader — reads from vertex colour attribute.
// ---------------------------------------------------------------------------
const FRAGMENT_SHADER_COLORED = /* glsl */ `
  varying float vAlpha;
  varying float vRotation;
  varying vec3 vColor;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;

    float c = cos(vRotation);
    float s = sin(vRotation);
    vec2 ruv = vec2(
      uv.x * c - uv.y * s,
      uv.x * s + uv.y * c
    );

    float ex = ruv.x * 1.0;
    float ey = ruv.y * 1.6;
    float dist = length(vec2(ex, ey));
    float alpha = smoothstep(1.0, 0.4, dist) * vAlpha;

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

const VERTEX_SHADER_COLORED = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aRotation;
  attribute vec3 aColor;

  varying float vAlpha;
  varying float vRotation;
  varying vec3 vColor;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = -mvPosition.z;
    float basePx = aSize * (300.0 / max(dist, 1.0));
    gl_PointSize = clamp(basePx, 1.0, 14.0);

    vAlpha = aAlpha;
    vRotation = aRotation;
    vColor = aColor;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

// ---------------------------------------------------------------------------
// Dandelion seed fragment — softer, rounder, with a subtle glow halo
// ---------------------------------------------------------------------------
const DANDELION_FRAGMENT = /* glsl */ `
  varying float vAlpha;
  varying float vRotation;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float dist = length(uv);

    // Soft round core
    float core = smoothstep(1.0, 0.2, dist);
    // Faint glow halo
    float halo = smoothstep(1.4, 0.6, dist) * 0.3;
    float alpha = (core + halo) * vAlpha;

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
  }
`;

// ---------------------------------------------------------------------------
// Season colour palettes
// ---------------------------------------------------------------------------
const SPRING_COLORS = [
  new THREE.Color(0xffb6c1), // pink
  new THREE.Color(0xfff0f5), // lavender blush
  new THREE.Color(0xff69b4), // hot pink
  new THREE.Color(0xffe4e1), // misty rose
];

const FALL_COLORS = [
  new THREE.Color(0xff8c00), // dark orange
  new THREE.Color(0xcc3300), // red-orange
  new THREE.Color(0xdaa520), // goldenrod
  new THREE.Color(0x8b4513), // saddle brown
  new THREE.Color(0x8b0000), // dark red
];

// ---------------------------------------------------------------------------
// SeasonalEffects
// ---------------------------------------------------------------------------
export class SeasonalEffects {
  constructor(scene) {
    this.scene = scene;
    this._particles = null;       // THREE.Points mesh
    this._particleData = [];      // CPU-side per-particle state
    this._currentSeason = -1;
    this._elapsed = 0;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Set the current season — creates/destroys particles as needed. */
  setSeason(season) {
    if (season === this._currentSeason) return;
    this._currentSeason = season;
    this._dispose();

    switch (season) {
      case SEASONS.SPRING:
        this._createSpringPetals();
        break;
      case SEASONS.SUMMER:
        this._createDandelionSeeds();
        break;
      case SEASONS.FALL:
        this._createFallLeaves();
        break;
      // WINTER — nothing; snow is provided by WeatherRenderer
    }
  }

  /** Call every frame with delta (seconds) and camera target position. */
  update(delta, cameraTarget) {
    if (!this._particles) return;
    this._elapsed += delta;

    switch (this._currentSeason) {
      case SEASONS.SPRING:
        this._updateSpring(delta, cameraTarget);
        break;
      case SEASONS.SUMMER:
        this._updateSummer(delta, cameraTarget);
        break;
      case SEASONS.FALL:
        this._updateFall(delta, cameraTarget);
        break;
    }
  }

  dispose() {
    this._dispose();
    this._currentSeason = -1;
  }

  // -----------------------------------------------------------------------
  // Spring — flower petals
  // -----------------------------------------------------------------------
  _createSpringPetals() {
    const count = 60;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const rotations = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    this._particleData = [];

    for (let i = 0; i < count; i++) {
      // Spread across 50x50 area (local to camera)
      positions[i * 3]     = (Math.random() - 0.5) * 50;
      positions[i * 3 + 1] = Math.random() * 18;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;

      sizes[i] = 0.06 + Math.random() * 0.06;   // 0.06..0.12
      alphas[i] = 0.6 + Math.random() * 0.4;
      rotations[i] = Math.random() * Math.PI * 2;

      const col = SPRING_COLORS[Math.floor(Math.random() * SPRING_COLORS.length)];
      colors[i * 3]     = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      this._particleData.push({
        vx: (Math.random() - 0.5) * 0.3,       // mild horizontal drift
        vy: -(0.2 + Math.random() * 0.2),       // fall speed ~0.2-0.4
        phase: Math.random() * Math.PI * 2,      // sine-wave phase offset
        freq: 0.8 + Math.random() * 0.6,         // sine frequency
        amp: 0.3 + Math.random() * 0.4,          // sine amplitude
        rotSpeed: (Math.random() - 0.5) * 1.5,   // spin speed
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('aRotation', new THREE.BufferAttribute(rotations, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER_COLORED,
      fragmentShader: FRAGMENT_SHADER_COLORED,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this._particles = new THREE.Points(geometry, material);
    this._particles.frustumCulled = false;
    this.scene.add(this._particles);
  }

  _updateSpring(delta, cameraTarget) {
    const posAttr = this._particles.geometry.getAttribute('position');
    const rotAttr = this._particles.geometry.getAttribute('aRotation');
    const t = this._elapsed;

    for (let i = 0; i < posAttr.count; i++) {
      const d = this._particleData[i];
      let x = posAttr.getX(i);
      let y = posAttr.getY(i);
      let z = posAttr.getZ(i);

      // Fall + sine-wave side-to-side drift
      y += d.vy * delta;
      x += d.vx * delta + Math.sin(t * d.freq + d.phase) * d.amp * delta;
      z += Math.cos(t * d.freq * 0.7 + d.phase) * d.amp * 0.5 * delta;

      // Spin
      const rot = rotAttr.getX(i) + d.rotSpeed * delta;
      rotAttr.setX(i, rot);

      // Respawn if below ground or too far from center
      if (y < 0 || Math.abs(x) > 25 || Math.abs(z) > 25) {
        x = (Math.random() - 0.5) * 50;
        y = 12 + Math.random() * 6;
        z = (Math.random() - 0.5) * 50;
      }

      posAttr.setXYZ(i, x, y, z);
    }

    posAttr.needsUpdate = true;
    rotAttr.needsUpdate = true;

    // Center on camera
    if (cameraTarget) {
      this._particles.position.x = cameraTarget.x;
      this._particles.position.z = cameraTarget.z;
    }
  }

  // -----------------------------------------------------------------------
  // Summer — dandelion seeds
  // -----------------------------------------------------------------------
  _createDandelionSeeds() {
    const count = 30;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const rotations = new Float32Array(count);

    this._particleData = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 50;
      positions[i * 3 + 1] = 2 + Math.random() * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;

      sizes[i] = 0.02 + Math.random() * 0.01;   // tiny: 0.02-0.03
      alphas[i] = 0.5 + Math.random() * 0.3;
      rotations[i] = 0; // not really visible at this size

      this._particleData.push({
        vx: (Math.random() - 0.5) * 0.6,         // lots of horizontal drift
        vy: -(0.05 + Math.random() * 0.1),        // very slow fall: 0.05-0.15
        vz: (Math.random() - 0.5) * 0.6,
        phase: Math.random() * Math.PI * 2,
        freq: 0.4 + Math.random() * 0.4,
        amp: 0.5 + Math.random() * 0.5,
        risePhase: Math.random() * Math.PI * 2,   // for occasional upward bobbing
        riseFreq: 0.15 + Math.random() * 0.15,
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('aRotation', new THREE.BufferAttribute(rotations, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: DANDELION_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTint: { value: new THREE.Color(0xffffff) },
      },
    });

    this._particles = new THREE.Points(geometry, material);
    this._particles.frustumCulled = false;
    this.scene.add(this._particles);
  }

  _updateSummer(delta, cameraTarget) {
    const posAttr = this._particles.geometry.getAttribute('position');
    const t = this._elapsed;

    for (let i = 0; i < posAttr.count; i++) {
      const d = this._particleData[i];
      let x = posAttr.getX(i);
      let y = posAttr.getY(i);
      let z = posAttr.getZ(i);

      // Gentle horizontal drift with sine-wave wandering
      x += d.vx * delta + Math.sin(t * d.freq + d.phase) * d.amp * delta;
      z += d.vz * delta + Math.cos(t * d.freq * 0.8 + d.phase) * d.amp * 0.7 * delta;

      // Very slow fall with occasional slight rise (bobbing)
      const riseFactor = Math.sin(t * d.riseFreq + d.risePhase);
      const verticalSpeed = d.vy + (riseFactor > 0.7 ? 0.08 : 0);
      y += verticalSpeed * delta;

      // Respawn
      if (y < 0.5 || Math.abs(x) > 25 || Math.abs(z) > 25) {
        x = (Math.random() - 0.5) * 50;
        y = 12 + Math.random() * 6;
        z = (Math.random() - 0.5) * 50;
      }

      posAttr.setXYZ(i, x, y, z);
    }

    posAttr.needsUpdate = true;

    if (cameraTarget) {
      this._particles.position.x = cameraTarget.x;
      this._particles.position.z = cameraTarget.z;
    }
  }

  // -----------------------------------------------------------------------
  // Fall — tumbling leaves
  // -----------------------------------------------------------------------
  _createFallLeaves() {
    const count = 80;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    const rotations = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    this._particleData = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 50;
      positions[i * 3 + 1] = Math.random() * 18;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;

      sizes[i] = 0.08 + Math.random() * 0.10;   // 0.08..0.18 — bigger than petals
      alphas[i] = 0.7 + Math.random() * 0.3;
      rotations[i] = Math.random() * Math.PI * 2;

      const col = FALL_COLORS[Math.floor(Math.random() * FALL_COLORS.length)];
      colors[i * 3]     = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      // Determine if this leaf spirals (30% chance)
      const spirals = Math.random() < 0.3;

      this._particleData.push({
        vx: (Math.random() - 0.5) * 1.0,           // wide side-to-side
        vy: -(0.5 + Math.random() * 0.5),           // fall speed 0.5-1.0
        phase: Math.random() * Math.PI * 2,
        freq: 1.0 + Math.random() * 1.0,            // faster oscillation
        amp: 0.8 + Math.random() * 1.0,             // wider amplitude
        rotSpeed: (Math.random() - 0.5) * 4.0,      // fast spin
        spirals,
        spiralRadius: spirals ? (0.5 + Math.random() * 0.8) : 0,
        spiralFreq: spirals ? (1.5 + Math.random() * 1.5) : 0,
        flutter: Math.random() * 2.0,               // flutter intensity
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('aRotation', new THREE.BufferAttribute(rotations, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER_COLORED,
      fragmentShader: FRAGMENT_SHADER_COLORED,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this._particles = new THREE.Points(geometry, material);
    this._particles.frustumCulled = false;
    this.scene.add(this._particles);
  }

  _updateFall(delta, cameraTarget) {
    const posAttr = this._particles.geometry.getAttribute('position');
    const rotAttr = this._particles.geometry.getAttribute('aRotation');
    const t = this._elapsed;

    for (let i = 0; i < posAttr.count; i++) {
      const d = this._particleData[i];
      let x = posAttr.getX(i);
      let y = posAttr.getY(i);
      let z = posAttr.getZ(i);

      // Fall
      y += d.vy * delta;

      if (d.spirals) {
        // Spiral motion — circular path while falling
        x += Math.sin(t * d.spiralFreq + d.phase) * d.spiralRadius * delta;
        z += Math.cos(t * d.spiralFreq + d.phase) * d.spiralRadius * delta;
      } else {
        // Standard tumble — sine-wave with flutter
        x += d.vx * delta + Math.sin(t * d.freq + d.phase) * d.amp * delta;
        z += Math.cos(t * d.freq * 0.6 + d.phase) * d.amp * 0.6 * delta;
      }

      // Flutter: occasional small vertical hiccups making leaves feel heavier
      y += Math.sin(t * d.flutter * 3.0 + d.phase) * 0.1 * delta;

      // Spin — leaves rotate faster than petals
      const rot = rotAttr.getX(i) + d.rotSpeed * delta;
      rotAttr.setX(i, rot);

      // Respawn if below ground or out of area
      if (y < 0 || Math.abs(x) > 25 || Math.abs(z) > 25) {
        x = (Math.random() - 0.5) * 50;
        y = 12 + Math.random() * 6;
        z = (Math.random() - 0.5) * 50;
      }

      posAttr.setXYZ(i, x, y, z);
    }

    posAttr.needsUpdate = true;
    rotAttr.needsUpdate = true;

    if (cameraTarget) {
      this._particles.position.x = cameraTarget.x;
      this._particles.position.z = cameraTarget.z;
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------
  _dispose() {
    if (this._particles) {
      this.scene.remove(this._particles);
      this._particles.geometry.dispose();
      this._particles.material.dispose();
      this._particles = null;
    }
    this._particleData = [];
    this._elapsed = 0;
  }
}
