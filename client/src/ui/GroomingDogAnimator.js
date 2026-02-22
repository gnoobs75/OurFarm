// client/src/ui/GroomingDogAnimator.js
// Controls idle animations and expression reactions for the grooming dog model.
// Manipulates existing mesh properties (position, rotation, scale, visible)
// so no THREE import is needed.

const LERP_DURATION = 0.3; // seconds to transition between expressions

// Expression presets: keyed by name, values are targets for lerped properties.
// Each preset defines the deltas/absolutes the animator drives toward.
const EXPRESSIONS = {
  neutral: {
    tailSpeed: 1.0,
    tongueVisible: false,
    pupilScaleY: 1.0,
    pupilScale: 1.0,    // uniform XZ scale for pupil size
    earOffsetX: 0,       // additive rotation.x offset from default
    earOffsetZ: 0,       // additive rotation.z offset from default
    browOffsetY: 0,      // additive position.y offset from default
  },
  happy: {
    tailSpeed: 2.5,
    tongueVisible: true,
    pupilScaleY: 0.6,   // squint
    pupilScale: 1.0,
    earOffsetX: -0.15,   // perked: slight upward tilt
    earOffsetZ: 0,
    browOffsetY: 0,
  },
  unhappy: {
    tailSpeed: 0.3,
    tongueVisible: false,
    pupilScaleY: 1.0,
    pupilScale: 0.7,     // small pupils
    earOffsetX: 0.2,     // flatten: droop outward/down
    earOffsetZ: 0.15,
    browOffsetY: -0.005, // furrowed brows
  },
  surprised: {
    tailSpeed: 0,
    tongueVisible: false,
    pupilScaleY: 1.0,
    pupilScale: 0.5,     // wide eyes, tiny pupils
    earOffsetX: -0.25,   // ears pulled back/up
    earOffsetZ: 0,
    browOffsetY: 0.008,  // raised brows
  },
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class GroomingDogAnimator {
  /**
   * @param {object} parts — from GroomingDogBuilder: body, head, snout, nose,
   *   leftEye/rightEye (each { sclera, pupil, brow }), leftEar, rightEar,
   *   jaw, tongue, tail (array of segments), legs
   */
  constructor(parts) {
    this._parts = parts;
    this._time = 0;

    // --- Capture default transforms so expressions apply as offsets ---
    this._defaults = {
      leftEarRotX: parts.leftEar.rotation.x,
      leftEarRotZ: parts.leftEar.rotation.z,
      rightEarRotX: parts.rightEar.rotation.x,
      rightEarRotZ: parts.rightEar.rotation.z,
      leftBrowY: parts.leftEye.brow.position.y,
      rightBrowY: parts.rightEye.brow.position.y,
      jawRotX: parts.jaw.rotation.x,
      bodyY: parts.body.position.y,
    };

    // --- Current lerped state (start at neutral) ---
    const n = EXPRESSIONS.neutral;
    this._current = {
      tailSpeed: n.tailSpeed,
      tongueVisible: n.tongueVisible,
      pupilScaleY: n.pupilScaleY,
      pupilScale: n.pupilScale,
      earOffsetX: n.earOffsetX,
      earOffsetZ: n.earOffsetZ,
      browOffsetY: n.browOffsetY,
    };

    // --- Lerp transition tracking ---
    this._target = { ...this._current };
    this._from = { ...this._current };
    this._lerpT = 1; // 1 = transition complete

    // --- One-shot animation timers ---
    this._shakeTimer = -1;  // negative = inactive
    this._bounceTimer = -1;
    this._jawDropTimer = -1;

    // --- Expression name ---
    this._expression = 'neutral';
  }

  /**
   * Switch to a named expression. Lerps smoothly over LERP_DURATION.
   * Also handles one-shot animations ('shake', 'bounce', jaw drop for 'surprised').
   * @param {string} name
   */
  setExpression(name) {
    // One-shot reactions that don't change the persistent expression state
    if (name === 'shake') {
      this._shakeTimer = 0;
      return;
    }
    if (name === 'bounce') {
      this._bounceTimer = 0;
      return;
    }

    const preset = EXPRESSIONS[name];
    if (!preset) return;

    this._expression = name;

    // Snapshot current state as the lerp origin
    this._from = { ...this._current };
    this._target = { ...preset };
    this._lerpT = 0;

    // Surprised triggers a brief jaw drop
    if (name === 'surprised') {
      this._jawDropTimer = 0;
    }
  }

  /**
   * Per-frame update. Call with dt in seconds.
   * @param {number} dt — delta time in seconds
   */
  update(dt) {
    this._time += dt;

    // --- Lerp transition ---
    if (this._lerpT < 1) {
      this._lerpT = Math.min(1, this._lerpT + dt / LERP_DURATION);
      const t = this._lerpT;

      this._current.tailSpeed = lerp(this._from.tailSpeed, this._target.tailSpeed, t);
      this._current.pupilScaleY = lerp(this._from.pupilScaleY, this._target.pupilScaleY, t);
      this._current.pupilScale = lerp(this._from.pupilScale, this._target.pupilScale, t);
      this._current.earOffsetX = lerp(this._from.earOffsetX, this._target.earOffsetX, t);
      this._current.earOffsetZ = lerp(this._from.earOffsetZ, this._target.earOffsetZ, t);
      this._current.browOffsetY = lerp(this._from.browOffsetY, this._target.browOffsetY, t);

      // Tongue visibility snaps at halfway through the transition
      if (t >= 0.5) {
        this._current.tongueVisible = this._target.tongueVisible;
      }
    }

    const parts = this._parts;
    const time = this._time;

    // ─── Idle: Tail wag ───────────────────────────────────────
    // Only the root segment oscillates; children inherit via parent chain
    if (parts.tail.length > 0) {
      parts.tail[0].rotation.y = Math.sin(time * this._current.tailSpeed * 3) * 0.3;
    }

    // ─── Idle: Breathing ──────────────────────────────────────
    parts.body.scale.y = 1 + Math.sin(time) * 0.02;

    // ─── Idle: Head subtle bob ────────────────────────────────
    parts.head.rotation.x = Math.sin(time * 0.5) * 0.02;

    // ─── Expression: Eyes (pupil scale) ───────────────────────
    const ps = this._current.pupilScale;
    const psy = this._current.pupilScaleY;
    parts.leftEye.pupil.scale.set(ps, psy, ps);
    parts.rightEye.pupil.scale.set(ps, psy, ps);

    // ─── Expression: Tongue visibility ────────────────────────
    parts.tongue.visible = this._current.tongueVisible;

    // ─── Expression: Ears ─────────────────────────────────────
    const eox = this._current.earOffsetX;
    const eoz = this._current.earOffsetZ;
    parts.leftEar.rotation.x = this._defaults.leftEarRotX + eox;
    parts.leftEar.rotation.z = this._defaults.leftEarRotZ - eoz; // left ear: inward = negative Z
    parts.rightEar.rotation.x = this._defaults.rightEarRotX + eox;
    parts.rightEar.rotation.z = this._defaults.rightEarRotZ + eoz; // right ear: outward = positive Z

    // ─── Expression: Brows ────────────────────────────────────
    parts.leftEye.brow.position.y = this._defaults.leftBrowY + this._current.browOffsetY;
    parts.rightEye.brow.position.y = this._defaults.rightBrowY + this._current.browOffsetY;

    // ─── One-shot: Shake ──────────────────────────────────────
    if (this._shakeTimer >= 0) {
      this._shakeTimer += dt;
      if (this._shakeTimer < 0.5) {
        // Rapid oscillation on body rotation.y
        parts.body.rotation.y = Math.sin(this._shakeTimer * 40) * 0.15;
      } else {
        parts.body.rotation.y = 0;
        this._shakeTimer = -1;
      }
    }

    // ─── One-shot: Bounce ─────────────────────────────────────
    if (this._bounceTimer >= 0) {
      this._bounceTimer += dt;
      const bounceDuration = 0.3;
      if (this._bounceTimer < bounceDuration) {
        // Ease-out parabola: jump up then come back down
        const t = this._bounceTimer / bounceDuration;
        const height = 0.15; // max jump height
        // Parabola: 4t(1-t) peaks at t=0.5 with value 1
        parts.body.position.y = this._defaults.bodyY + height * 4 * t * (1 - t);
      } else {
        parts.body.position.y = this._defaults.bodyY;
        this._bounceTimer = -1;
      }
    }

    // ─── One-shot: Jaw drop (surprised) ───────────────────────
    if (this._jawDropTimer >= 0) {
      this._jawDropTimer += dt;
      const jawDuration = 0.6;
      if (this._jawDropTimer < jawDuration) {
        const t = this._jawDropTimer / jawDuration;
        // Open quickly, close slowly: sin curve with bias toward open
        const openAmount = 0.25;
        if (t < 0.2) {
          // Quick open
          parts.jaw.rotation.x = this._defaults.jawRotX + openAmount * (t / 0.2);
        } else {
          // Slow close
          const closeT = (t - 0.2) / 0.8;
          parts.jaw.rotation.x = this._defaults.jawRotX + openAmount * (1 - closeT);
        }
      } else {
        parts.jaw.rotation.x = this._defaults.jawRotX;
        this._jawDropTimer = -1;
      }
    }
  }
}
