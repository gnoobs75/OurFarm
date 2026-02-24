// client/src/ui/GroomingUI3D.js
// Full 3D grooming mini-game orchestrator with 5 phases:
//   wash -> soap -> rinse -> dry -> brush
// Replaces the old 2D GroomingUI.js with raycasted zone interaction,
// a particle system, and 3D dog expressions/animations.
//
// API (matches old GroomingUI):
//   start(petData)  -> Promise<{ stars, equipped }>
//   get visible      -> boolean
//   dispose()        -> cleanup

import * as THREE from 'three';
import { MOUSE } from 'three';
import { GroomingScene3D } from './GroomingScene3D.js';
import { GroomingDogAnimator } from './GroomingDogAnimator.js';
import { buildCosmeticMesh } from './GroomingDogBuilder.js';

// ─── Zone names produced by GroomingDogBuilder ───────────────────
const ZONE_NAMES = ['head', 'body-left', 'body-right', 'back', 'belly', 'legs'];

// ─── Particle pool size ─────────────────────────────────────────
const PARTICLE_POOL_SIZE = 50;

// ─── Progress-per-pointer-move when dragging over a zone ─────────
const ZONE_INCREMENT = 0.018;

// ─── Phase timing thresholds (seconds) for time-based scoring ────
const FAST_TIME  = 8;
const MED_TIME   = 16;
const SLOW_TIME  = 28;

// ─── Brush phase constants ──────────────────────────────────────
const BRUSH_STROKES_NEEDED = 14;
const BRUSH_MIN_DX = 20; // minimum pixel delta to count as a stroke

// ─── Cosmetic slot mapping ──────────────────────────────────────
const SLOT_MAP = {
  straw_hat: 'hat', party_hat: 'hat', flower_wreath: 'hat', cowboy_hat: 'hat', crown: 'hat',
  red_bandana: 'neck', bow_tie: 'neck', bell_collar: 'neck', flower_lei: 'neck', scarf: 'neck',
  cape: 'back', backpack: 'back', angel_wings: 'back', butterfly_wings: 'back', saddle: 'back',
};

// ─── Cosmetic emoji mapping (for 2D button display) ─────────────
const COSMETIC_EMOJI = {
  straw_hat: '\uD83D\uDC52', party_hat: '\uD83C\uDF89', flower_wreath: '\uD83C\uDF3B',
  cowboy_hat: '\uD83E\uDD20', crown: '\uD83D\uDC51',
  red_bandana: '\uD83E\uDDE3', bow_tie: '\uD83C\uDF80', bell_collar: '\uD83D\uDD14',
  flower_lei: '\uD83C\uDF3A', scarf: '\uD83E\uDDE3',
  cape: '\uD83E\uDDE5', backpack: '\uD83C\uDF92', angel_wings: '\uD83D\uDC7C',
  butterfly_wings: '\uD83E\uDD8B', saddle: '\uD83E\uDE79',
};

// ─── Attach-point name per slot ─────────────────────────────────
const SLOT_ATTACH = { hat: 'hatAttach', neck: 'neckAttach', back: 'backAttach' };

// ─── Particle type colours & behaviours ─────────────────────────
const PARTICLE_DEFS = {
  splash:  { color: 0x4488ff, radius: 0.015, gravity: -1.2, lifetime: 0.7 },
  foam:    { color: 0xffffff, radius: 0.012, gravity: -0.08, lifetime: 1.4 },
  drip:    { color: 0x3399ee, radius: 0.010, gravity: -1.8, lifetime: 0.5 },
  steam:   { color: 0xeeeeff, radius: 0.018, gravity:  0.6, lifetime: 1.0 },
  sparkle: { color: 0xffd700, radius: 0.010, gravity:  0.4, lifetime: 0.8 },
  heart:   { color: 0xff6699, radius: 0.014, gravity:  0.5, lifetime: 1.0 },
};

// ─────────────────────────────────────────────────────────────────
// GroomingUI3D
// ─────────────────────────────────────────────────────────────────

export class GroomingUI3D {
  constructor() {
    this._container = null;
    this._resolve = null;
    this._running = false;
    this._petData = null;

    // 3D subsystems (created in start())
    this._scene3D = null;
    this._animator = null;
    this._dogParts = null;
    this._equippedMeshes = { hat: null, neck: null, back: null };

    // Overlay meshes (dirty/phase indicators)
    this._overlayMeshes = [];

    // Glow ring meshes (hover highlight indicators)
    this._glowMeshes = [];

    // Particle pool
    this._particles = [];
    this._particleGroup = null;

    // Phase state
    this._zoneProgress = null;
    this._totalScore = 0;
    this._phaseStartTime = 0;

    // Brush-specific state
    this._brushCount = 0;
    this._brushStreak = 0;
    this._brushBestStreak = 0;
    this._brushDir = 'right';
    this._lastDragX = null;

    // Pointer state
    this._isDragging = false;
    this._lastClock = 0;

    // Bound handlers (stored for removal)
    this._boundPointerDown = null;
    this._boundPointerMove = null;
    this._boundPointerUp = null;
    this._boundContextMenu = null;
    this._boundResize = null;
  }

  // ─── Public API ──────────────────────────────────────────────

  /**
   * Start the grooming mini-game.
   * @param {object} petData — pet data from server
   * @returns {Promise<{ stars: number, equipped: object }>}
   */
  start(petData) {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._petData = petData;
      this._running = true;
      this._totalScore = 0;

      this._buildOverlay();
      this._init3D();
      this._runAllPhases();
    });
  }

  /** @returns {boolean} */
  get visible() {
    return this._running;
  }

  /** Full teardown. */
  dispose() {
    this._running = false;
    this._removePointerListeners();

    if (this._scene3D) {
      this._scene3D.dispose();
      this._scene3D = null;
    }
    this._animator = null;
    this._particles = [];
    this._particleGroup = null;

    if (this._boundResize) {
      window.removeEventListener('resize', this._boundResize);
      this._boundResize = null;
    }

    if (this._resolve) {
      this._resolve(null);
      this._resolve = null;
    }
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._container = null;
  }

  // ─── Overlay DOM ─────────────────────────────────────────────

  _buildOverlay() {
    this._container = document.createElement('div');
    this._container.className = 'groom-overlay';

    this._container.innerHTML = `
      <div class="groom-backdrop"></div>
      <div class="groom-scene groom-scene-3d">
        <div class="groom-header">
          <div class="groom-title">Grooming ${this._petData.name || 'Pet'}</div>
          <div class="groom-phase-label"></div>
        </div>
        <div class="groom-3d-viewport">
          <canvas class="groom-3d-canvas"></canvas>
          <div class="groom-tool-cursor-3d"></div>
          <div class="groom-orbit-hint">Drag empty space to rotate &middot; Drag dog to groom</div>
        </div>
        <div class="groom-progress-area">
          <div class="groom-progress-track">
            <div class="groom-progress-fill"></div>
          </div>
          <div class="groom-progress-label">0%</div>
        </div>
        <div class="groom-stars-area">
          <span class="groom-star" data-i="0">\u2606</span>
          <span class="groom-star" data-i="1">\u2606</span>
          <span class="groom-star" data-i="2">\u2606</span>
        </div>
        <div class="groom-hint"></div>
        <div class="groom-dressup-area hidden"></div>
        <div class="groom-result-text"></div>
      </div>
    `;

    document.getElementById('ui-overlay').appendChild(this._container);
    requestAnimationFrame(() => this._container.classList.add('groom-overlay-visible'));

    // Cache element references
    this._phaseLabel = this._container.querySelector('.groom-phase-label');
    this._viewport = this._container.querySelector('.groom-3d-viewport');
    this._canvas = this._container.querySelector('.groom-3d-canvas');
    this._toolCursor = this._container.querySelector('.groom-tool-cursor-3d');
    this._progressFill = this._container.querySelector('.groom-progress-fill');
    this._progressLabel = this._container.querySelector('.groom-progress-label');
    this._starsEl = this._container.querySelectorAll('.groom-star');
    this._hintEl = this._container.querySelector('.groom-hint');
    this._dressupArea = this._container.querySelector('.groom-dressup-area');
    this._resultText = this._container.querySelector('.groom-result-text');
  }

  // ─── 3D Initialisation ──────────────────────────────────────

  _init3D() {
    // Size the canvas to fill the viewport container
    const rect = this._viewport.getBoundingClientRect();
    const w = Math.max(rect.width, 300);
    const h = Math.max(rect.height, 300);
    this._canvas.width = w;
    this._canvas.height = h;

    // Create scene
    this._scene3D = new GroomingScene3D(this._canvas);
    this._scene3D.resize(w, h);

    // Load the dog model
    const { parts, overlays, glowMeshes } = this._scene3D.loadDog(this._petData);
    this._dogParts = parts;
    this._overlayMeshes = overlays || [];
    this._glowMeshes = glowMeshes || [];

    // Create animator
    this._animator = new GroomingDogAnimator(parts);
    this._lastClock = performance.now();

    // Configure orbit controls: left-drag orbits on empty space, right-drag always orbits
    this._scene3D._controls.mouseButtons = {
      LEFT: MOUSE.ROTATE,
      MIDDLE: null,
      RIGHT: MOUSE.ROTATE,
    };
    this._scene3D._controls.touches = {};

    // Build particle pool
    this._initParticles();

    // Hook into the render loop to update animator + particles
    this._hookRenderLoop();

    // Start rendering
    this._scene3D.start();

    // Handle resize
    this._boundResize = () => this._onResize();
    window.addEventListener('resize', this._boundResize);

    // Prevent context menu on right-click in viewport
    this._boundContextMenu = (e) => e.preventDefault();
    this._canvas.addEventListener('contextmenu', this._boundContextMenu);
  }

  _onResize() {
    if (!this._viewport || !this._scene3D) return;
    const rect = this._viewport.getBoundingClientRect();
    const w = Math.max(rect.width, 300);
    const h = Math.max(rect.height, 300);
    this._canvas.width = w;
    this._canvas.height = h;
    this._scene3D.resize(w, h);
  }

  /**
   * Replace the GroomingScene3D _tick method so we can inject animator
   * and particle updates into the existing RAF loop.
   */
  _hookRenderLoop() {
    const scene3D = this._scene3D;
    scene3D._tick = () => {
      if (!scene3D._running) return;
      scene3D._rafId = requestAnimationFrame(() => scene3D._tick());

      const now = performance.now();
      const dt = Math.min((now - this._lastClock) / 1000, 0.1); // cap dt
      this._lastClock = now;

      // Update animator
      if (this._animator) {
        this._animator.update(dt);
      }

      // Update particles
      this._updateParticles(dt);

      // Pulse glow meshes
      const time = now / 1000;
      if (this._glowMeshes) {
        for (const glow of this._glowMeshes) {
          if (glow.material.opacity > 0.01) {
            glow.material.opacity *= 0.9 + Math.sin(time * 4) * 0.1;
          }
        }
      }

      // Controls + render
      scene3D._controls.update();
      scene3D._renderer.render(scene3D._scene, scene3D._camera);
    };
  }

  // ─── Particle System ────────────────────────────────────────

  _initParticles() {
    this._particleGroup = new THREE.Group();
    this._scene3D._scene.add(this._particleGroup);

    this._particles = [];
    const geo = new THREE.SphereGeometry(1, 5, 4);

    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true })
      );
      mesh.visible = false;
      this._particleGroup.add(mesh);

      this._particles.push({
        mesh,
        vx: 0, vy: 0, vz: 0,
        life: 0,
        maxLife: 1,
        gravity: 0,
        active: false,
      });
    }
  }

  /**
   * Spawn a particle at a world-space position.
   * @param {THREE.Vector3} pos
   * @param {string} type — one of PARTICLE_DEFS keys
   */
  _spawnParticle(pos, type) {
    const def = PARTICLE_DEFS[type];
    if (!def) return;

    // Find an inactive particle
    const p = this._particles.find((p) => !p.active);
    if (!p) return;

    p.active = true;
    p.life = 0;
    p.maxLife = def.lifetime * (0.8 + Math.random() * 0.4);
    p.gravity = def.gravity;

    // Random velocity spread
    p.vx = (Math.random() - 0.5) * 0.3;
    p.vy = (Math.random() - 0.5) * 0.3 + (def.gravity > 0 ? 0.15 : -0.05);
    p.vz = (Math.random() - 0.5) * 0.3;

    p.mesh.material.color.setHex(def.color);
    p.mesh.material.opacity = 1;
    p.mesh.scale.setScalar(def.radius);
    p.mesh.position.set(
      pos.x + (Math.random() - 0.5) * 0.05,
      pos.y + (Math.random() - 0.5) * 0.05,
      pos.z + (Math.random() - 0.5) * 0.05
    );
    p.mesh.visible = true;
  }

  /**
   * Spawn a burst of particles.
   * @param {THREE.Vector3} pos
   * @param {string} type
   * @param {number} count
   */
  _spawnBurst(pos, type, count = 3) {
    for (let i = 0; i < count; i++) {
      this._spawnParticle(pos, type);
    }
  }

  _updateParticles(dt) {
    for (const p of this._particles) {
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      // Apply gravity (positive = rises, negative = falls)
      p.vy += p.gravity * dt;

      // Move
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;

      // Fade out in the last 40% of life
      const lifeRatio = p.life / p.maxLife;
      if (lifeRatio > 0.6) {
        p.mesh.material.opacity = 1 - (lifeRatio - 0.6) / 0.4;
      }
    }
  }

  // ─── Pointer Handling ───────────────────────────────────────

  _setupPointerListeners(onMove, onDown, onUp) {
    this._removePointerListeners();

    this._boundPointerMove = (e) => {
      // Update tool cursor position
      const rect = this._canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      this._toolCursor.style.left = cx + 'px';
      this._toolCursor.style.top = cy + 'px';

      if (onMove) onMove(e, cx, cy);

      // Zone glow highlight when not dragging
      if (!this._isDragging && this._glowMeshes.length > 0) {
        const hit = this._scene3D.raycastFromPointer(cx, cy);
        for (const glow of this._glowMeshes) {
          const isTarget = hit && hit.zone === glow.userData.glowZone;
          const targetOpacity = isTarget ? 0.5 : 0;
          glow.material.opacity += (targetOpacity - glow.material.opacity) * 0.15;
        }
      }
    };

    this._boundPointerDown = (e) => {
      if (e.button !== 0) return; // Only left button
      const rect = this._canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const hit = this._scene3D.raycastFromPointer(cx, cy);
      if (hit && hit.zone) {
        // Grooming: disable orbit, start drag
        this._scene3D._controls.enabled = false;
        this._isDragging = true;
        if (onDown) onDown(e);
      } else {
        // Orbiting: leave controls enabled, don't groom
        this._isDragging = false;
      }
    };

    this._boundPointerUp = (e) => {
      if (e.button !== 0) return;
      this._scene3D._controls.enabled = true;
      const wasGrooming = this._isDragging;
      this._isDragging = false;
      if (wasGrooming && onUp) onUp(e);
    };

    this._canvas.addEventListener('pointermove', this._boundPointerMove);
    this._canvas.addEventListener('pointerdown', this._boundPointerDown);
    window.addEventListener('pointerup', this._boundPointerUp);
  }

  _removePointerListeners() {
    if (this._boundPointerMove && this._canvas) {
      this._canvas.removeEventListener('pointermove', this._boundPointerMove);
    }
    if (this._boundPointerDown && this._canvas) {
      this._canvas.removeEventListener('pointerdown', this._boundPointerDown);
    }
    if (this._boundPointerUp) {
      window.removeEventListener('pointerup', this._boundPointerUp);
    }
    this._boundPointerMove = null;
    this._boundPointerDown = null;
    this._boundPointerUp = null;
    this._isDragging = false;

    // Re-enable orbit controls in case we were mid-groom-drag when listeners were removed
    if (this._scene3D && this._scene3D._controls) {
      this._scene3D._controls.enabled = true;
    }
  }

  // ─── Zone Helpers ───────────────────────────────────────────

  /** Create a fresh zone-progress map, all zones at 0. */
  _freshZoneProgress() {
    const map = new Map();
    for (const name of ZONE_NAMES) {
      map.set(name, 0);
    }
    return map;
  }

  /** @returns {number} overall progress 0..1 (average of all zones). */
  _overallProgress() {
    if (!this._zoneProgress) return 0;
    let sum = 0;
    for (const v of this._zoneProgress.values()) sum += v;
    return sum / this._zoneProgress.size;
  }

  /** @returns {boolean} true if every zone has reached 1.0. */
  _allZonesComplete() {
    if (!this._zoneProgress) return false;
    for (const v of this._zoneProgress.values()) {
      if (v < 1) return false;
    }
    return true;
  }

  /**
   * Increment a zone's progress when the pointer drags over it.
   * Clamps to [0, 1].
   * @param {string} zone
   * @param {number} amount
   */
  _incrementZone(zone, amount = ZONE_INCREMENT) {
    if (!this._zoneProgress || !this._zoneProgress.has(zone)) return;
    const cur = this._zoneProgress.get(zone);
    this._zoneProgress.set(zone, Math.min(1, cur + amount));
  }

  // ─── Overlay Helpers ──────────────────────────────────────────

  /**
   * Set overlay color and reset opacity for a new phase.
   * @param {number} color — hex color for the phase overlay
   */
  _setOverlayPhase(color) {
    for (const overlay of this._overlayMeshes) {
      overlay.material.color.setHex(color);
      overlay.material.opacity = 0.4;
      overlay.visible = true;
      // Also update splotch children
      overlay.traverse((child) => {
        if (child !== overlay && child.isMesh) {
          child.material.color.setHex(color);
          child.material.opacity = 0.4;
        }
      });
    }
  }

  /**
   * Fade an overlay mesh based on its zone's progress.
   * @param {string} zoneName
   */
  _updateOverlayForZone(zoneName) {
    const zoneProgress = this._zoneProgress.get(zoneName);
    const overlay = this._overlayMeshes.find(m => m.userData.overlayZone === zoneName);
    if (overlay) {
      const newOpacity = 0.4 * (1 - zoneProgress);
      overlay.material.opacity = newOpacity;
      // Also fade splotch children
      overlay.traverse((child) => {
        if (child !== overlay && child.isMesh) {
          child.material.opacity = newOpacity;
        }
      });
    }
  }

  /**
   * Set the glow ring color for all glow meshes.
   * @param {number} hexColor — hex color value
   */
  _setGlowColor(hexColor) {
    for (const glow of this._glowMeshes) {
      glow.material.color.setHex(hexColor);
    }
  }

  /**
   * Measure coverage evenness: standard deviation of zone progress values.
   * Lower = more even. Returns 0..1 where 0 is perfectly even.
   */
  _coverageUnevenness() {
    if (!this._zoneProgress) return 0;
    const vals = [...this._zoneProgress.values()];
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
    return Math.sqrt(variance);
  }

  // ─── Progress / Stars Display ───────────────────────────────

  _updateProgress(pct) {
    const p = Math.max(0, Math.min(1, pct));
    this._progressFill.style.width = (p * 100) + '%';
    this._progressLabel.textContent = Math.round(p * 100) + '%';
  }

  _showStars(count) {
    this._starsEl.forEach((el, i) => {
      el.textContent = i < count ? '\u2605' : '\u2606';
      el.classList.toggle('star-filled', i < count);
    });
  }

  // ─── Phase Orchestration ────────────────────────────────────

  async _runAllPhases() {
    const s1 = await this._washPhase();
    const s2 = await this._soapPhase();
    const s3 = await this._rinsePhase();
    const s4 = await this._dryPhase();
    const s5 = await this._brushPhase();

    this._totalScore = s1 + s2 + s3 + s4 + s5; // 0-15
    const stars = this._totalScore >= 12 ? 3 : this._totalScore >= 7 ? 2 : 1;
    this._showStars(stars);

    const equipped = await this._dressupPhase();
    await this._showResult(stars);
    this._endGameWithEquipped(stars, equipped);
  }

  // ─── Phase: Wash ────────────────────────────────────────────

  _washPhase() {
    return new Promise((resolve) => {
      this._phaseLabel.textContent = '\uD83D\uDCA7 Wash';
      this._hintEl.textContent = 'Left-drag over the dog to wash!';
      this._toolCursor.textContent = '\uD83D\uDCA7';
      this._toolCursor.style.display = 'block';

      this._zoneProgress = this._freshZoneProgress();
      this._phaseStartTime = Date.now();
      this._updateProgress(0);
      this._setOverlayPhase(0x8B6914); // brown dirt
      this._setGlowColor(0x4488ff); // water blue

      if (this._animator) this._animator.setExpression('neutral');

      this._setupPointerListeners(
        // onMove
        (e, cx, cy) => {
          if (!this._isDragging) return;
          const hit = this._scene3D.raycastFromPointer(cx, cy);
          if (hit && hit.zone) {
            this._incrementZone(hit.zone);
            this._updateOverlayForZone(hit.zone);
            this._spawnBurst(hit.point, 'splash', 2);
            this._updateProgress(this._overallProgress());

            if (this._allZonesComplete()) {
              this._removePointerListeners();
              this._toolCursor.style.display = 'none';
              const elapsed = (Date.now() - this._phaseStartTime) / 1000;
              const score = elapsed < FAST_TIME ? 3
                : elapsed < MED_TIME ? 2
                : elapsed < SLOW_TIME ? 1 : 0;
              setTimeout(() => resolve(score), 400);
            }
          }
        },
        null,
        null
      );
    });
  }

  // ─── Phase: Soap ────────────────────────────────────────────

  _soapPhase() {
    return new Promise((resolve) => {
      this._phaseLabel.textContent = '\uD83E\uDDFD Soap';
      this._hintEl.textContent = 'Lather evenly across all zones!';
      this._toolCursor.textContent = '\uD83E\uDDFD';
      this._toolCursor.style.display = 'block';

      this._zoneProgress = this._freshZoneProgress();
      this._updateProgress(0);
      this._setOverlayPhase(0xffffff); // white foam remaining
      this._setGlowColor(0xffffff); // white

      // Track peak unevenness throughout the phase for scoring.
      // Measured before zones clamp to 1.0 so it reflects real spread.
      let peakUnevenness = 0;

      if (this._animator) this._animator.setExpression('neutral');

      this._setupPointerListeners(
        // onMove
        (e, cx, cy) => {
          if (!this._isDragging) return;
          const hit = this._scene3D.raycastFromPointer(cx, cy);
          if (hit && hit.zone) {
            this._incrementZone(hit.zone);
            this._updateOverlayForZone(hit.zone);
            this._spawnBurst(hit.point, 'foam', 2);
            this._updateProgress(this._overallProgress());

            // Sample unevenness while zones are still filling
            const u = this._coverageUnevenness();
            if (u > peakUnevenness) peakUnevenness = u;

            // Happy expression as zones fill
            if (this._animator && this._overallProgress() > 0.3) {
              this._animator.setExpression('happy');
            }

            if (this._allZonesComplete()) {
              this._removePointerListeners();
              this._toolCursor.style.display = 'none';
              // Score: low peak unevenness = even coverage = better score
              // Std dev ranges ~0 (perfect) to ~0.4 (very lopsided)
              const score = peakUnevenness < 0.12 ? 3
                : peakUnevenness < 0.25 ? 2
                : peakUnevenness < 0.38 ? 1 : 0;
              setTimeout(() => resolve(score), 400);
            }
          }
        },
        null,
        null
      );
    });
  }

  // ─── Phase: Rinse ───────────────────────────────────────────

  _rinsePhase() {
    return new Promise((resolve) => {
      this._phaseLabel.textContent = '\uD83D\uDEBF Rinse';
      this._hintEl.textContent = 'Rinse off all the soap!';
      this._toolCursor.textContent = '\uD83D\uDEBF';
      this._toolCursor.style.display = 'block';

      this._zoneProgress = this._freshZoneProgress();
      this._phaseStartTime = Date.now();
      this._updateProgress(0);
      this._setOverlayPhase(0xaaddff); // soapy blue residue
      this._setGlowColor(0x33aaff); // clear blue

      if (this._animator) this._animator.setExpression('neutral');

      this._setupPointerListeners(
        // onMove
        (e, cx, cy) => {
          if (!this._isDragging) return;
          const hit = this._scene3D.raycastFromPointer(cx, cy);
          if (hit && hit.zone) {
            this._incrementZone(hit.zone);
            this._updateOverlayForZone(hit.zone);
            this._spawnBurst(hit.point, 'drip', 2);
            this._updateProgress(this._overallProgress());

            if (this._allZonesComplete()) {
              this._removePointerListeners();
              this._toolCursor.style.display = 'none';
              const elapsed = (Date.now() - this._phaseStartTime) / 1000;
              const score = elapsed < FAST_TIME ? 3
                : elapsed < MED_TIME ? 2
                : elapsed < SLOW_TIME ? 1 : 0;
              setTimeout(() => resolve(score), 400);
            }
          }
        },
        null,
        null
      );
    });
  }

  // ─── Phase: Dry ─────────────────────────────────────────────

  _dryPhase() {
    return new Promise((resolve) => {
      this._phaseLabel.textContent = '\uD83D\uDCA8 Dry';
      this._hintEl.textContent = 'Blow-dry across all zones!';
      this._toolCursor.textContent = '\uD83D\uDCA8';
      this._toolCursor.style.display = 'block';

      this._zoneProgress = this._freshZoneProgress();
      this._phaseStartTime = Date.now();
      this._updateProgress(0);
      this._setOverlayPhase(0x88bbdd); // water sheen
      this._setGlowColor(0xffcc44); // warm

      if (this._animator) this._animator.setExpression('happy');

      this._setupPointerListeners(
        // onMove
        (e, cx, cy) => {
          if (!this._isDragging) return;
          const hit = this._scene3D.raycastFromPointer(cx, cy);
          if (hit && hit.zone) {
            this._incrementZone(hit.zone);
            this._updateOverlayForZone(hit.zone);

            // Mix of steam and sparkle particles
            this._spawnParticle(hit.point, 'steam');
            if (Math.random() < 0.3) {
              this._spawnParticle(hit.point, 'sparkle');
            }

            this._updateProgress(this._overallProgress());

            // Fluff effect: body parts scale up slightly as drying progresses
            if (this._animator && this._animator._parts) {
              const progress = this._overallProgress();
              const fluff = 1 + progress * 0.05; // +5% at full dry
              this._animator._parts.body.scale.x = fluff;
              this._animator._parts.body.scale.z = fluff;
            }

            if (this._allZonesComplete()) {
              this._removePointerListeners();
              this._toolCursor.style.display = 'none';
              const elapsed = (Date.now() - this._phaseStartTime) / 1000;
              const score = elapsed < FAST_TIME ? 3
                : elapsed < MED_TIME ? 2
                : elapsed < SLOW_TIME ? 1 : 0;
              setTimeout(() => resolve(score), 400);
            }
          }
        },
        null,
        null
      );
    });
  }

  // ─── Phase: Brush ───────────────────────────────────────────

  _brushPhase() {
    return new Promise((resolve) => {
      this._phaseLabel.textContent = '\uD83D\uDC87 Brush';
      this._hintEl.textContent = 'Drag left and right to brush! Follow the direction.';
      this._toolCursor.textContent = '\uD83D\uDC87';
      this._toolCursor.style.display = 'block';

      this._brushCount = 0;
      this._brushStreak = 0;
      this._brushBestStreak = 0;
      this._brushDir = 'right';
      this._lastDragX = null;
      this._updateProgress(0);

      // Hide overlays during brush phase (no zone-based cleaning)
      for (const overlay of this._overlayMeshes) {
        overlay.visible = false;
      }
      this._setGlowColor(0xffd700); // gold

      if (this._animator) this._animator.setExpression('neutral');

      // Show direction hint in the hint area
      this._updateBrushHint();

      this._setupPointerListeners(
        // onMove
        (e, cx, cy) => {
          if (!this._isDragging) return;
          if (this._lastDragX === null) {
            this._lastDragX = e.clientX;
            return;
          }

          const dx = e.clientX - this._lastDragX;
          if (Math.abs(dx) < BRUSH_MIN_DX) return;

          const dir = dx > 0 ? 'right' : 'left';

          if (dir === this._brushDir) {
            this._brushCount++;
            this._brushStreak++;
            this._brushBestStreak = Math.max(this._brushBestStreak, this._brushStreak);

            // Spawn sparkle trail at raycast point or cursor position
            const hit = this._scene3D.raycastFromPointer(cx, cy);
            if (hit && hit.point) {
              this._spawnBurst(hit.point, 'sparkle', 2);
            }

            // Happy expression + hearts at 3+ streak
            if (this._animator) {
              if (this._brushStreak >= 3) {
                this._animator.setExpression('happy');
                if (hit && hit.point) {
                  this._spawnParticle(hit.point, 'heart');
                }
              }
            }
          } else {
            this._brushStreak = 0;
            if (this._animator) {
              this._animator.setExpression('unhappy');
            }
          }

          // Alternate direction every 3 strokes
          if (this._brushCount > 0 && this._brushCount % 3 === 0) {
            this._brushDir = this._brushDir === 'right' ? 'left' : 'right';
            this._updateBrushHint();
          }

          this._lastDragX = e.clientX;
          this._updateProgress(this._brushCount / BRUSH_STROKES_NEEDED);

          if (this._brushCount >= BRUSH_STROKES_NEEDED) {
            this._removePointerListeners();
            this._toolCursor.style.display = 'none';

            // Bounce at phase end
            if (this._animator) {
              this._animator.setExpression('happy');
              this._animator.setExpression('bounce');
            }

            const score = this._brushBestStreak >= 6 ? 3
              : this._brushBestStreak >= 4 ? 2
              : this._brushBestStreak >= 2 ? 1 : 0;
            setTimeout(() => resolve(score), 400);
          }
        },
        // onDown
        (e) => {
          this._lastDragX = e.clientX;
        },
        // onUp
        () => {
          this._lastDragX = null;
        }
      );
    });
  }

  _updateBrushHint() {
    const arrow = this._brushDir === 'right' ? '\u27A1\uFE0F' : '\u2B05\uFE0F';
    this._hintEl.textContent = `Brush ${this._brushDir}! ${arrow}`;
  }

  // ─── Phase: Dress-Up ──────────────────────────────────────────

  _dressupPhase() {
    return new Promise((resolve) => {
      // Keep orbit controls enabled for admiring
      this._phaseLabel.textContent = '\uD83C\uDFA8 Dress Up';
      this._hintEl.textContent = 'Pick accessories for your pet!';
      this._toolCursor.style.display = 'none';

      // Hide progress bar, show dress-up area
      const progressArea = this._container.querySelector('.groom-progress-area');
      if (progressArea) progressArea.style.display = 'none';

      this._dressupArea.classList.remove('hidden');

      // Track currently equipped cosmetics
      const equipped = { hat: null, neck: null, back: null };

      // Pre-equip from petData if available
      const preEquipped = this._petData.cosmetics?.equipped;
      if (preEquipped) {
        for (const slot of ['hat', 'neck', 'back']) {
          if (preEquipped[slot]) {
            equipped[slot] = preEquipped[slot];
            this._attachCosmeticMesh(preEquipped[slot], slot);
          }
        }
      }

      // Get unlocked cosmetics
      const unlocked = this._petData.cosmetics?.unlocked || [];

      // Build the dress-up HTML
      this._dressupArea.innerHTML = `
        <div class="groom-dressup-slots"></div>
        <div class="groom-dressup-tray"></div>
        <button class="groom-dressup-done">Done \u2714\uFE0F</button>
      `;

      const slotsContainer = this._dressupArea.querySelector('.groom-dressup-slots');
      const trayContainer = this._dressupArea.querySelector('.groom-dressup-tray');
      const doneBtn = this._dressupArea.querySelector('.groom-dressup-done');

      // Render slot buttons
      const renderSlots = () => {
        slotsContainer.innerHTML = '';
        for (const slot of ['hat', 'neck', 'back']) {
          const btn = document.createElement('button');
          btn.className = 'groom-slot-btn';
          btn.dataset.slot = slot;
          const id = equipped[slot];
          btn.textContent = id ? (COSMETIC_EMOJI[id] || id) : '\u2795';
          btn.title = slot.charAt(0).toUpperCase() + slot.slice(1);

          // Click equipped slot to unequip
          btn.addEventListener('click', () => {
            if (equipped[slot]) {
              this._removeCosmeticMesh(slot);
              equipped[slot] = null;
              renderSlots();
            }
          });

          slotsContainer.appendChild(btn);
          // Label below
          const label = document.createElement('span');
          label.className = 'groom-slot-label';
          label.textContent = slot;
          slotsContainer.appendChild(label);
        }
      };

      // Render item tray
      const renderTray = () => {
        trayContainer.innerHTML = '';
        for (const cosmeticId of unlocked) {
          const slot = SLOT_MAP[cosmeticId];
          if (!slot) continue;

          const btn = document.createElement('button');
          btn.className = 'groom-tray-item';
          if (equipped[slot] === cosmeticId) btn.classList.add('equipped');
          btn.textContent = COSMETIC_EMOJI[cosmeticId] || cosmeticId;
          btn.title = cosmeticId.replace(/_/g, ' ');

          btn.addEventListener('click', () => {
            if (equipped[slot] === cosmeticId) {
              // Toggle off
              this._removeCosmeticMesh(slot);
              equipped[slot] = null;
            } else {
              // Remove previous in this slot
              if (equipped[slot]) {
                this._removeCosmeticMesh(slot);
              }
              // Attach new
              equipped[slot] = cosmeticId;
              this._attachCosmeticMesh(cosmeticId, slot);
            }
            renderSlots();
            renderTray();
          });

          trayContainer.appendChild(btn);
        }
      };

      renderSlots();
      renderTray();

      // Done button resolves
      doneBtn.addEventListener('click', () => {
        this._dressupArea.classList.add('hidden');
        this._dressupArea.innerHTML = '';
        if (progressArea) progressArea.style.display = '';
        resolve(equipped);
      });
    });
  }

  /**
   * Attach a cosmetic 3D mesh to the correct attach point on the dog.
   * @param {string} cosmeticId
   * @param {string} slot — 'hat', 'neck', or 'back'
   */
  _attachCosmeticMesh(cosmeticId, slot) {
    if (!this._dogParts) return;
    // Remove existing mesh in this slot
    this._removeCosmeticMesh(slot);

    const mesh = buildCosmeticMesh(cosmeticId);
    if (!mesh) return;

    const attachName = SLOT_ATTACH[slot];
    const attachPoint = this._dogParts[attachName];
    if (!attachPoint) return;

    attachPoint.add(mesh);
    this._equippedMeshes[slot] = mesh;
  }

  /**
   * Remove the cosmetic 3D mesh from a slot.
   * @param {string} slot — 'hat', 'neck', or 'back'
   */
  _removeCosmeticMesh(slot) {
    const mesh = this._equippedMeshes[slot];
    if (mesh && mesh.parent) {
      mesh.parent.remove(mesh);
    }
    this._equippedMeshes[slot] = null;
  }

  // ─── Result & End ───────────────────────────────────────────

  _showResult(stars) {
    return new Promise((resolve) => {
      const msg = stars >= 3 ? 'Perfect!'
        : stars >= 2 ? 'Great job!'
        : 'Good enough!';

      this._resultText.textContent = msg;
      this._resultText.className = 'groom-result-text result-show';

      if (this._animator) {
        this._animator.setExpression('happy');
        this._animator.setExpression('bounce');
      }

      setTimeout(resolve, 1500);
    });
  }

  _endGame(stars) {
    this._running = false;

    const equipped = this._petData.cosmetics?.equipped
      || { hat: null, neck: null, back: null };

    if (this._resolve) {
      this._resolve({ stars, equipped: { ...equipped } });
      this._resolve = null;
    }

    // Animate out
    setTimeout(() => {
      if (this._container) {
        this._container.classList.remove('groom-overlay-visible');
        this._container.classList.add('groom-overlay-exit');
      }
      setTimeout(() => {
        // Dispose 3D resources
        if (this._scene3D) {
          this._scene3D.dispose();
          this._scene3D = null;
        }
        this._animator = null;

        if (this._boundResize) {
          window.removeEventListener('resize', this._boundResize);
          this._boundResize = null;
        }

        if (this._container && this._container.parentNode) {
          this._container.parentNode.removeChild(this._container);
        }
        this._container = null;
      }, 400);
    }, 500);
  }

  /**
   * End the game with equipped cosmetics from the dress-up phase.
   * Used by the main phase flow (as opposed to dispose() fallback via _endGame).
   */
  _endGameWithEquipped(stars, equipped) {
    this._running = false;

    if (this._resolve) {
      this._resolve({ stars, equipped: { ...equipped } });
      this._resolve = null;
    }

    // Animate out
    setTimeout(() => {
      if (this._container) {
        this._container.classList.remove('groom-overlay-visible');
        this._container.classList.add('groom-overlay-exit');
      }
      setTimeout(() => {
        // Dispose 3D resources
        if (this._scene3D) {
          this._scene3D.dispose();
          this._scene3D = null;
        }
        this._animator = null;
        this._dogParts = null;
        this._equippedMeshes = { hat: null, neck: null, back: null };

        if (this._boundResize) {
          window.removeEventListener('resize', this._boundResize);
          this._boundResize = null;
        }

        if (this._container && this._container.parentNode) {
          this._container.parentNode.removeChild(this._container);
        }
        this._container = null;
      }, 400);
    }, 500);
  }
}
