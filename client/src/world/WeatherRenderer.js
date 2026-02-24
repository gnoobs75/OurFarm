// client/src/world/WeatherRenderer.js
import * as THREE from 'three';
import { WEATHER } from '@shared/constants.js';

// ---------------------------------------------------------------------------
// Custom shaders for rain streak particles
// ---------------------------------------------------------------------------
const RAIN_VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aSpeed;
  uniform float uWindAngle;    // radians offset from vertical
  uniform float uTime;
  varying float vAlpha;
  varying float vStretch;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Distance-based size attenuation
    float dist = -mvPosition.z;
    float basePx = aSize * (300.0 / max(dist, 1.0));
    gl_PointSize = clamp(basePx, 1.0, 8.0);

    // Pass stretch factor proportional to speed for fragment shader
    vStretch = aSpeed;
    // Fade particles near the top / bottom edges for softer entrance/exit
    float normY = position.y / 20.0;
    vAlpha = smoothstep(0.0, 0.05, normY) * smoothstep(1.0, 0.9, normY) * 0.7;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const RAIN_FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;
  varying float vStretch;
  uniform vec3 uColor;

  void main() {
    vec2 uv = gl_PointCoord;
    // Stretch the point vertically to form a rain streak
    float streakLength = mix(2.0, 5.0, vStretch);
    float yCenter = abs(uv.y - 0.5) * streakLength;
    float xCenter = abs(uv.x - 0.5) * 2.0;
    float alpha = smoothstep(1.0, 0.0, yCenter) * smoothstep(1.0, 0.0, xCenter);
    alpha *= vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

// ---------------------------------------------------------------------------
// Custom shaders for splash ring particles
// ---------------------------------------------------------------------------
const SPLASH_VERTEX_SHADER = /* glsl */ `
  attribute float aAge;       // 0..1 lifecycle
  attribute float aMaxRadius;
  varying float vAge;

  void main() {
    vAge = aAge;
    float radius = aMaxRadius * aAge;
    float scale = radius * (300.0 / max(-(modelViewMatrix * vec4(position, 1.0)).z, 1.0));
    gl_PointSize = clamp(scale, 0.0, 12.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SPLASH_FRAGMENT_SHADER = /* glsl */ `
  varying float vAge;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float dist = length(uv);
    // Expanding ring shape
    float ring = smoothstep(0.8, 0.9, dist) * smoothstep(1.0, 0.95, dist);
    // Also a small filled circle early in life that fades into ring
    float fill = smoothstep(1.0, 0.6, dist) * (1.0 - vAge);
    float shape = max(ring, fill * 0.5);
    float alpha = shape * (1.0 - vAge);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(0.7, 0.8, 1.0, alpha * 0.5);
  }
`;

// ---------------------------------------------------------------------------
// Custom shaders for snow particles with variable size
// ---------------------------------------------------------------------------
const SNOW_VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  varying float vAlpha;
  varying float vSize;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = -mvPosition.z;
    float basePx = aSize * (300.0 / max(dist, 1.0));
    gl_PointSize = clamp(basePx, 1.0, 10.0);
    vSize = aSize;
    float normY = position.y / 20.0;
    vAlpha = smoothstep(0.0, 0.05, normY) * smoothstep(1.0, 0.85, normY) * 0.85;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SNOW_FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;
  varying float vSize;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float dist = length(uv);
    // Soft circular snowflake
    float alpha = smoothstep(1.0, 0.3, dist) * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
  }
`;

// ---------------------------------------------------------------------------
// Cloud shadow shaders for CLOUDY weather
// ---------------------------------------------------------------------------
const CLOUD_SHADOW_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CLOUD_SHADOW_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;

  // Simple noise-like function using sine combinations
  float cloudNoise(vec2 p) {
    float n = sin(p.x * 1.2 + p.y * 0.8 + uTime * 0.06) * 0.5 + 0.5;
    n += sin(p.x * 2.5 - p.y * 1.5 + uTime * 0.1) * 0.25 + 0.25;
    n += sin(p.x * 0.7 + p.y * 2.3 - uTime * 0.08) * 0.15 + 0.15;
    return n / 1.4;
  }

  void main() {
    vec2 st = vUv * 4.0;
    float shadow = cloudNoise(st);
    shadow = smoothstep(0.35, 0.65, shadow);
    float alpha = shadow * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.05, alpha);
  }
`;

// ===========================================================================
// WeatherRenderer
// ===========================================================================
export class WeatherRenderer {
  constructor(scene) {
    this.scene = scene;
    this.particles = null;
    this.currentWeather = WEATHER.SUNNY;

    // Rain / storm state
    this._rainSpeeds = null;       // per-particle fall speed
    this._rainWindX = 0;           // horizontal wind component
    this._rainWindZ = 0;

    // Splash particle pool
    this._splashSystem = null;
    this._splashAges = null;
    this._splashLifetimes = null;
    this._splashMaxRadii = null;
    this._splashIndex = 0;          // round-robin index

    // Lightning state (storm only)
    this._lightningLight = null;
    this._lightningTimer = 0;
    this._lightningCooldown = this._randomLightningCooldown();
    this._lightningFlashing = false;
    this._lightningFadeTime = 0;

    // Snow state
    this._snowSizes = null;
    this._snowDriftSeeds = null;    // per-flake random seeds for multi-freq drift
    this._snowGroundFog = null;

    // Cloudy state
    this._cloudShadowMesh = null;
    this._cloudShadowMaterial = null;

    // Storm ambient overlay
    this._stormOverlay = null;

    // Elapsed time for shaders
    this._elapsed = 0;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  setWeather(weather) {
    this.currentWeather = weather;
    this._clearAll();

    if (weather === WEATHER.RAINY) {
      this._createRain(2000, Math.PI / 12);     // ~15 degrees
    } else if (weather === WEATHER.STORMY) {
      this._createRain(3000, Math.PI / 6);      // ~30 degrees
      this._createStormEffects();
    } else if (weather === WEATHER.SNOWY) {
      this._createSnow();
    } else if (weather === WEATHER.CLOUDY) {
      this._createCloudShadows();
    }
  }

  update(delta, cameraTarget) {
    this._elapsed += delta;

    if (this.currentWeather === WEATHER.RAINY || this.currentWeather === WEATHER.STORMY) {
      this._updateRain(delta, cameraTarget);
      this._updateSplashes(delta, cameraTarget);
    }

    if (this.currentWeather === WEATHER.STORMY) {
      this._updateLightning(delta, cameraTarget);
    }

    if (this.currentWeather === WEATHER.SNOWY) {
      this._updateSnow(delta, cameraTarget);
    }

    if (this.currentWeather === WEATHER.CLOUDY) {
      this._updateCloudShadows(delta, cameraTarget);
    }
  }

  dispose() {
    this._clearAll();
  }

  // -------------------------------------------------------------------------
  // Rain creation
  // -------------------------------------------------------------------------
  _createRain(count, windAngleRad) {
    // Wind direction — rain blows toward +X, slight +Z
    this._rainWindX = Math.sin(windAngleRad) * 15;
    this._rainWindZ = Math.sin(windAngleRad) * 3;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const speeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      sizes[i] = 0.03 + Math.random() * 0.04;            // varied size
      speeds[i] = 0.6 + Math.random() * 0.4;             // 0.6..1.0 speed factor
    }

    this._rainSpeeds = speeds;

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

    const isStormy = this.currentWeather === WEATHER.STORMY;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uWindAngle: { value: windAngleRad },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(isStormy ? 0x8899bb : 0xaaccff) },
      },
      vertexShader: RAIN_VERTEX_SHADER,
      fragmentShader: RAIN_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(geometry, material);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);

    // Create splash system
    this._createSplashSystem();
  }

  // -------------------------------------------------------------------------
  // Splash particle pool (rings on ground)
  // -------------------------------------------------------------------------
  _createSplashSystem() {
    const count = 200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const ages = new Float32Array(count);
    const maxRadii = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0.02;   // just above ground
      positions[i * 3 + 2] = 0;
      ages[i] = 1.0;                  // start fully "dead" so invisible
      maxRadii[i] = 0.08 + Math.random() * 0.06;
    }

    this._splashAges = ages;
    this._splashLifetimes = new Float32Array(count).fill(0.35);
    this._splashMaxRadii = maxRadii;
    this._splashIndex = 0;

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aAge', new THREE.BufferAttribute(ages, 1));
    geometry.setAttribute('aMaxRadius', new THREE.BufferAttribute(maxRadii, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: SPLASH_VERTEX_SHADER,
      fragmentShader: SPLASH_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this._splashSystem = new THREE.Points(geometry, material);
    this._splashSystem.frustumCulled = false;
    this.scene.add(this._splashSystem);
  }

  _spawnSplash(x, z) {
    if (!this._splashSystem) return;
    const i = this._splashIndex;
    const posAttr = this._splashSystem.geometry.getAttribute('position');
    posAttr.setXYZ(i, x, 0.02, z);
    posAttr.needsUpdate = true;

    this._splashAges[i] = 0;
    this._splashLifetimes[i] = 0.25 + Math.random() * 0.2;
    this._splashMaxRadii[i] = 0.06 + Math.random() * 0.08;

    const radiiAttr = this._splashSystem.geometry.getAttribute('aMaxRadius');
    radiiAttr.setX(i, this._splashMaxRadii[i]);
    radiiAttr.needsUpdate = true;

    this._splashIndex = (this._splashIndex + 1) % this._splashAges.length;
  }

  // -------------------------------------------------------------------------
  // Storm-specific effects
  // -------------------------------------------------------------------------
  _createStormEffects() {
    // Lightning point light (starts off)
    this._lightningLight = new THREE.PointLight(0xccccff, 0, 120);
    this._lightningLight.position.set(0, 30, 0);
    this.scene.add(this._lightningLight);
    this._lightningTimer = 0;
    this._lightningCooldown = this._randomLightningCooldown();
    this._lightningFlashing = false;

    // Dark overlay for storm ambiance
    const overlayGeo = new THREE.PlaneGeometry(200, 200);
    const overlayMat = new THREE.MeshBasicMaterial({
      color: 0x0a0a1a,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this._stormOverlay = new THREE.Mesh(overlayGeo, overlayMat);
    this._stormOverlay.rotation.x = -Math.PI / 2;
    this._stormOverlay.position.y = 19;
    this._stormOverlay.renderOrder = 999;
    this.scene.add(this._stormOverlay);
  }

  _randomLightningCooldown() {
    return 5 + Math.random() * 10;  // 5-15 seconds
  }

  // -------------------------------------------------------------------------
  // Snow creation
  // -------------------------------------------------------------------------
  _createSnow() {
    const count = 1200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const driftSeeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      // Variable snowflake sizes: some large fluffy, some tiny
      sizes[i] = 0.06 + Math.random() * 0.14;  // 0.06..0.20
      driftSeeds[i] = Math.random() * 1000;
    }

    this._snowSizes = sizes;
    this._snowDriftSeeds = driftSeeds;

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: SNOW_VERTEX_SHADER,
      fragmentShader: SNOW_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.particles = new THREE.Points(geometry, material);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);

    // Snow ground accumulation fog layer
    this._createSnowGroundFog();
  }

  _createSnowGroundFog() {
    const fogGeo = new THREE.PlaneGeometry(80, 80);
    const fogMat = new THREE.MeshBasicMaterial({
      color: 0xe8e8f0,
      transparent: true,
      opacity: 0.10,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this._snowGroundFog = new THREE.Mesh(fogGeo, fogMat);
    this._snowGroundFog.rotation.x = -Math.PI / 2;
    this._snowGroundFog.position.y = 0.05;
    this.scene.add(this._snowGroundFog);
  }

  // -------------------------------------------------------------------------
  // Cloud shadow creation (CLOUDY weather)
  // -------------------------------------------------------------------------
  _createCloudShadows() {
    const geo = new THREE.PlaneGeometry(120, 120);
    this._cloudShadowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.12 },
      },
      vertexShader: CLOUD_SHADOW_VERTEX_SHADER,
      fragmentShader: CLOUD_SHADOW_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this._cloudShadowMesh = new THREE.Mesh(geo, this._cloudShadowMaterial);
    this._cloudShadowMesh.rotation.x = -Math.PI / 2;
    this._cloudShadowMesh.position.y = 0.06;
    this._cloudShadowMesh.renderOrder = 998;
    this.scene.add(this._cloudShadowMesh);
  }

  // -------------------------------------------------------------------------
  // Update: Rain
  // -------------------------------------------------------------------------
  _updateRain(delta, cameraTarget) {
    if (!this.particles) return;
    const positions = this.particles.geometry.getAttribute('position');
    const speeds = this._rainSpeeds;
    const baseSpeed = 15;
    const windX = this._rainWindX;
    const windZ = this._rainWindZ;

    for (let i = 0; i < positions.count; i++) {
      const spd = speeds[i];
      let x = positions.getX(i) + windX * spd * delta;
      let y = positions.getY(i) - baseSpeed * spd * delta;
      let z = positions.getZ(i) + windZ * spd * delta;

      if (y < 0) {
        // Spawn a splash at the world position where the drop hit
        if (cameraTarget) {
          this._spawnSplash(
            x + cameraTarget.x,
            z + cameraTarget.z
          );
        }
        // Reset this raindrop to the top with randomised horizontal position
        x = (Math.random() - 0.5) * 60;
        y = 18 + Math.random() * 2;
        z = (Math.random() - 0.5) * 60;
      }

      positions.setXYZ(i, x, y, z);
    }
    positions.needsUpdate = true;

    // Update shader time uniform
    this.particles.material.uniforms.uTime.value = this._elapsed;

    // Center particles on camera
    if (cameraTarget) {
      this.particles.position.x = cameraTarget.x;
      this.particles.position.z = cameraTarget.z;
    }
  }

  // -------------------------------------------------------------------------
  // Update: Splashes
  // -------------------------------------------------------------------------
  _updateSplashes(delta, cameraTarget) {
    if (!this._splashSystem) return;
    const ageAttr = this._splashSystem.geometry.getAttribute('aAge');

    for (let i = 0; i < this._splashAges.length; i++) {
      if (this._splashAges[i] < 1.0) {
        this._splashAges[i] += delta / this._splashLifetimes[i];
        if (this._splashAges[i] > 1.0) this._splashAges[i] = 1.0;
      }
      ageAttr.setX(i, this._splashAges[i]);
    }
    ageAttr.needsUpdate = true;

    // Splashes are in world space, so no centering needed (positions set absolutely)
  }

  // -------------------------------------------------------------------------
  // Update: Lightning
  // -------------------------------------------------------------------------
  _updateLightning(delta, cameraTarget) {
    if (!this._lightningLight) return;

    // Keep storm overlay centered on camera
    if (cameraTarget && this._stormOverlay) {
      this._stormOverlay.position.x = cameraTarget.x;
      this._stormOverlay.position.z = cameraTarget.z;
    }

    if (this._lightningFlashing) {
      // Fade out the lightning flash
      this._lightningFadeTime -= delta;
      if (this._lightningFadeTime <= 0) {
        this._lightningLight.intensity = 0;
        this._lightningFlashing = false;
        this._lightningCooldown = this._randomLightningCooldown();
      } else {
        // Quick spike then fade: intensity peaks at start and decays
        const t = this._lightningFadeTime / 0.15;
        this._lightningLight.intensity = 3.0 * t * t;
      }
    } else {
      this._lightningTimer += delta;
      if (this._lightningTimer >= this._lightningCooldown) {
        // Trigger flash
        this._lightningFlashing = true;
        this._lightningFadeTime = 0.15;
        this._lightningTimer = 0;
        this._lightningLight.intensity = 3.0;

        // Randomize position slightly for each flash
        if (cameraTarget) {
          this._lightningLight.position.x = cameraTarget.x + (Math.random() - 0.5) * 40;
          this._lightningLight.position.z = cameraTarget.z + (Math.random() - 0.5) * 40;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Update: Snow
  // -------------------------------------------------------------------------
  _updateSnow(delta, cameraTarget) {
    if (!this.particles) return;
    const positions = this.particles.geometry.getAttribute('position');
    const seeds = this._snowDriftSeeds;
    const sizes = this._snowSizes;
    const t = this._elapsed;
    const fallSpeed = 2;

    for (let i = 0; i < positions.count; i++) {
      const seed = seeds[i];
      const size = sizes[i];
      // Larger flakes fall slightly slower (more air resistance)
      const sizeFactor = 1.0 - (size - 0.06) * 2.0;   // ~1.0 for small, ~0.72 for large

      let x = positions.getX(i);
      let y = positions.getY(i) - fallSpeed * sizeFactor * delta;
      let z = positions.getZ(i);

      // Multi-frequency sine drift on X and Z
      const driftX =
        Math.sin(t * 0.7 + seed) * 0.015 +
        Math.sin(t * 1.3 + seed * 2.7) * 0.008 +
        Math.sin(t * 0.3 + seed * 0.5) * 0.02;
      const driftZ =
        Math.cos(t * 0.5 + seed * 1.3) * 0.012 +
        Math.cos(t * 1.1 + seed * 3.1) * 0.006 +
        Math.sin(t * 0.2 + seed * 0.8) * 0.015;

      x += driftX;
      z += driftZ;

      if (y < 0) {
        x = (Math.random() - 0.5) * 60;
        y = 18 + Math.random() * 2;
        z = (Math.random() - 0.5) * 60;
      }

      positions.setXYZ(i, x, y, z);
    }
    positions.needsUpdate = true;

    // Slow rotation of the entire particle system for visual variety
    this.particles.rotation.y += delta * 0.02;

    // Center on camera
    if (cameraTarget) {
      this.particles.position.x = cameraTarget.x;
      this.particles.position.z = cameraTarget.z;

      if (this._snowGroundFog) {
        this._snowGroundFog.position.x = cameraTarget.x;
        this._snowGroundFog.position.z = cameraTarget.z;
        // Subtle pulsing opacity for ground fog
        this._snowGroundFog.material.opacity = 0.08 + Math.sin(this._elapsed * 0.3) * 0.03;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Update: Cloud shadows
  // -------------------------------------------------------------------------
  _updateCloudShadows(delta, cameraTarget) {
    if (!this._cloudShadowMesh) return;

    this._cloudShadowMaterial.uniforms.uTime.value = this._elapsed;

    if (cameraTarget) {
      this._cloudShadowMesh.position.x = cameraTarget.x;
      this._cloudShadowMesh.position.z = cameraTarget.z;
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup helpers
  // -------------------------------------------------------------------------
  _clearAll() {
    this._clearParticles();
    this._clearSplashes();
    this._clearLightning();
    this._clearStormOverlay();
    this._clearSnowGroundFog();
    this._clearCloudShadows();
    this._elapsed = 0;
  }

  _clearParticles() {
    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles.geometry.dispose();
      this.particles.material.dispose();
      this.particles = null;
    }
    this._rainSpeeds = null;
    this._snowSizes = null;
    this._snowDriftSeeds = null;
  }

  _clearSplashes() {
    if (this._splashSystem) {
      this.scene.remove(this._splashSystem);
      this._splashSystem.geometry.dispose();
      this._splashSystem.material.dispose();
      this._splashSystem = null;
    }
    this._splashAges = null;
    this._splashLifetimes = null;
    this._splashMaxRadii = null;
    this._splashIndex = 0;
  }

  _clearLightning() {
    if (this._lightningLight) {
      this.scene.remove(this._lightningLight);
      this._lightningLight.dispose();
      this._lightningLight = null;
    }
    this._lightningFlashing = false;
    this._lightningTimer = 0;
  }

  _clearStormOverlay() {
    if (this._stormOverlay) {
      this.scene.remove(this._stormOverlay);
      this._stormOverlay.geometry.dispose();
      this._stormOverlay.material.dispose();
      this._stormOverlay = null;
    }
  }

  _clearSnowGroundFog() {
    if (this._snowGroundFog) {
      this.scene.remove(this._snowGroundFog);
      this._snowGroundFog.geometry.dispose();
      this._snowGroundFog.material.dispose();
      this._snowGroundFog = null;
    }
  }

  _clearCloudShadows() {
    if (this._cloudShadowMesh) {
      this.scene.remove(this._cloudShadowMesh);
      this._cloudShadowMesh.geometry.dispose();
      this._cloudShadowMaterial.dispose();
      this._cloudShadowMesh = null;
      this._cloudShadowMaterial = null;
    }
  }
}
