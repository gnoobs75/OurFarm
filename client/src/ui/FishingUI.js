// client/src/ui/FishingUI.js
// Stardew-style vertical catch bar mini-game.
// Runs its own animation loop. Returns a promise that resolves true/false.

const TRACK_HEIGHT = 280;
const TRACK_WIDTH = 36;
const FILL_RATE = 0.015;
const STARTING_PROGRESS = 0.3;

const RARITY_CONFIG = {
  0: { netSize: 0.40, fishSpeed: 60,  drainRate: 0.008,  label: 'Common',    color: '#888' },
  1: { netSize: 0.30, fishSpeed: 100, drainRate: 0.012,  label: 'Uncommon',  color: '#4a4' },
  2: { netSize: 0.22, fishSpeed: 160, drainRate: 0.016,  label: 'Rare',      color: '#48f' },
  3: { netSize: 0.15, fishSpeed: 220, drainRate: 0.024,  label: 'Legendary', color: '#f84' },
};

const LIFT_ACCEL = 800;
const GRAVITY = 600;
const DAMPING = 0.92;

export class FishingUI {
  constructor() {
    this._container = null;
    this._resolve = null;
    this._running = false;
    this._rafId = null;
    this._lastTime = 0;
  }

  start(fishData) {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._fishData = fishData;

      const config = RARITY_CONFIG[fishData.rarity] || RARITY_CONFIG[0];

      const rodBonus = [0, 0.15, 0.30][fishData.rodTier] || 0;
      const levelBonus = Math.min(fishData.fishingLevel * 0.01, 0.30);
      const baitBonus = fishData.baitNetBonus || 0;
      const totalNetFraction = Math.min(config.netSize + rodBonus + levelBonus + baitBonus, 0.70);
      const netHeight = TRACK_HEIGHT * totalNetFraction;

      this._netPos = TRACK_HEIGHT / 2 - netHeight / 2;
      this._netVelocity = 0;
      this._netHeight = netHeight;
      this._fishPos = TRACK_HEIGHT * 0.3;
      this._fishVelocity = 0;
      this._progress = STARTING_PROGRESS;
      this._config = config;
      this._holding = false;
      this._fishTimer = 0;
      this._behaviorState = {};

      this._buildUI(fishData, config, netHeight);

      this._onMouseDown = () => { this._holding = true; };
      this._onMouseUp = () => { this._holding = false; };
      this._onKeyDown = (e) => {
        if (e.code === 'Space') { e.preventDefault(); this._holding = true; }
        if (e.code === 'Escape') this._endGame(false);
      };
      this._onKeyUp = (e) => {
        if (e.code === 'Space') this._holding = false;
      };

      window.addEventListener('mousedown', this._onMouseDown);
      window.addEventListener('mouseup', this._onMouseUp);
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);

      this._running = true;
      this._lastTime = performance.now();
      this._rafId = requestAnimationFrame((t) => this._loop(t));
    });
  }

  _buildUI(fishData, config, netHeight) {
    this._container = document.createElement('div');
    this._container.className = 'fishing-panel';
    this._container.innerHTML = `
      <div class="fishing-header">
        <div class="fishing-fish-name" style="color: ${config.color}">${fishData.fishName}</div>
        <div class="fishing-rarity">${config.label}</div>
      </div>
      <div class="fishing-track-wrapper">
        <div class="fishing-track" style="width: ${TRACK_WIDTH}px; height: ${TRACK_HEIGHT}px;">
          <div class="fishing-net" style="height: ${netHeight}px;"></div>
          <div class="fishing-fish-icon"></div>
        </div>
      </div>
      <div class="fishing-progress-wrapper">
        <div class="fishing-progress-bar"></div>
      </div>
      <div class="fishing-hint">Hold SPACE or CLICK to reel</div>
    `;

    document.getElementById('ui-overlay').appendChild(this._container);

    this._netEl = this._container.querySelector('.fishing-net');
    this._fishEl = this._container.querySelector('.fishing-fish-icon');
    this._progressEl = this._container.querySelector('.fishing-progress-bar');

    requestAnimationFrame(() => {
      this._container.classList.add('fishing-panel-visible');
    });
  }

  _loop(now) {
    if (!this._running) return;

    const delta = Math.min((now - this._lastTime) / 1000, 0.05);
    this._lastTime = now;

    this._updateNet(delta);
    this._updateFish(delta);
    this._updateProgress(delta);
    this._render();

    if (this._progress >= 1) { this._endGame(true); return; }
    if (this._progress <= 0) { this._endGame(false); return; }

    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  _updateNet(delta) {
    if (this._holding) {
      this._netVelocity += LIFT_ACCEL * delta;
    } else {
      this._netVelocity -= GRAVITY * delta;
    }
    this._netVelocity *= DAMPING;
    this._netPos += this._netVelocity * delta;
    this._netPos = Math.max(0, Math.min(TRACK_HEIGHT - this._netHeight, this._netPos));
  }

  _updateFish(delta) {
    this._fishTimer += delta;
    const config = this._config;
    const speed = config.fishSpeed;
    const behavior = this._fishData.behavior;

    let target;
    switch (behavior) {
      case 'sine':
        target = TRACK_HEIGHT * 0.5 + Math.sin(this._fishTimer * 1.5) * TRACK_HEIGHT * 0.3;
        break;

      case 'dart': {
        const base = TRACK_HEIGHT * 0.5 + Math.sin(this._fishTimer * 2) * TRACK_HEIGHT * 0.25;
        if (Math.sin(this._fishTimer * 5.7) > 0.9) {
          target = Math.random() * TRACK_HEIGHT;
        } else {
          target = base;
        }
        break;
      }

      case 'erratic':
        if (!this._behaviorState.nextChange || this._fishTimer > this._behaviorState.nextChange) {
          this._behaviorState.erraticTarget = Math.random() * TRACK_HEIGHT;
          this._behaviorState.nextChange = this._fishTimer + 0.3 + Math.random() * 0.5;
        }
        target = this._behaviorState.erraticTarget;
        break;

      case 'dash':
        if (!this._behaviorState.dashPhase) {
          this._behaviorState.dashPhase = 'hold';
          this._behaviorState.dashTimer = 0;
          this._behaviorState.dashTarget = this._fishPos;
        }
        this._behaviorState.dashTimer += delta;
        if (this._behaviorState.dashPhase === 'hold') {
          target = this._behaviorState.dashTarget;
          if (this._behaviorState.dashTimer > 1 + Math.random()) {
            this._behaviorState.dashPhase = 'rocket';
            this._behaviorState.dashTimer = 0;
            this._behaviorState.dashTarget = this._fishPos > TRACK_HEIGHT / 2 ? TRACK_HEIGHT * 0.1 : TRACK_HEIGHT * 0.9;
          }
        } else {
          target = this._behaviorState.dashTarget;
          if (Math.abs(this._fishPos - target) < 10 || this._behaviorState.dashTimer > 0.5) {
            this._behaviorState.dashPhase = 'hold';
            this._behaviorState.dashTimer = 0;
            this._behaviorState.dashTarget = this._fishPos;
          }
        }
        break;

      case 'lure':
        if (!this._behaviorState.lurePhase) {
          this._behaviorState.lurePhase = 'drift';
          this._behaviorState.lureTimer = 0;
        }
        this._behaviorState.lureTimer += delta;
        if (this._behaviorState.lurePhase === 'drift') {
          target = this._netPos + this._netHeight / 2;
          if (this._behaviorState.lureTimer > 2) {
            this._behaviorState.lurePhase = 'snap';
            this._behaviorState.lureTimer = 0;
            this._behaviorState.snapTarget = this._fishPos > TRACK_HEIGHT / 2 ? 0 : TRACK_HEIGHT;
          }
        } else {
          target = this._behaviorState.snapTarget;
          if (this._behaviorState.lureTimer > 0.5) {
            this._behaviorState.lurePhase = 'drift';
            this._behaviorState.lureTimer = 0;
          }
        }
        break;

      case 'sword':
        if (!this._behaviorState.swordTarget) {
          this._behaviorState.swordTarget = Math.random() * TRACK_HEIGHT;
          this._behaviorState.swordPause = 0;
        }
        if (Math.abs(this._fishPos - this._behaviorState.swordTarget) < 5) {
          this._behaviorState.swordPause += delta;
          if (this._behaviorState.swordPause > 0.3) {
            this._behaviorState.swordTarget = Math.random() * TRACK_HEIGHT;
            this._behaviorState.swordPause = 0;
          }
        }
        target = this._behaviorState.swordTarget;
        break;

      case 'wiggle':
        if (Math.sin(this._fishTimer * 3) > 0.85) {
          target = this._fishPos;
        } else {
          target = this._fishPos + Math.sin(this._fishTimer * 20) * 30;
        }
        break;

      case 'stall':
        if (!this._behaviorState.stallPhase) {
          this._behaviorState.stallPhase = 'move';
          this._behaviorState.stallTimer = 0;
        }
        this._behaviorState.stallTimer += delta;
        if (this._behaviorState.stallPhase === 'move') {
          target = TRACK_HEIGHT * 0.5 + Math.sin(this._fishTimer * 2) * TRACK_HEIGHT * 0.3;
          if (this._behaviorState.stallTimer > 1.5 + Math.random()) {
            this._behaviorState.stallPhase = 'stop';
            this._behaviorState.stallTimer = 0;
          }
        } else if (this._behaviorState.stallPhase === 'stop') {
          target = this._fishPos;
          if (this._behaviorState.stallTimer > 0.5) {
            this._behaviorState.stallPhase = 'dart';
            this._behaviorState.stallTimer = 0;
            this._behaviorState.dartTarget = Math.random() * TRACK_HEIGHT;
          }
        } else {
          target = this._behaviorState.dartTarget;
          if (this._behaviorState.stallTimer > 0.4) {
            this._behaviorState.stallPhase = 'move';
            this._behaviorState.stallTimer = 0;
          }
        }
        break;

      case 'king':
        target = TRACK_HEIGHT * 0.5 + Math.sin(this._fishTimer * (1.5 + this._fishTimer * 0.1)) * TRACK_HEIGHT * 0.4;
        break;

      case 'phase':
        if (!this._behaviorState.phaseTimer) this._behaviorState.phaseTimer = 0;
        this._behaviorState.phaseTimer += delta;
        if (this._behaviorState.phaseTimer > 2 + Math.random()) {
          this._fishPos = Math.random() * TRACK_HEIGHT;
          this._behaviorState.phaseTimer = 0;
        }
        target = this._fishPos;
        break;

      case 'beast':
        if (!this._behaviorState.beastPattern || this._behaviorState.beastTimer > 2) {
          const patterns = ['dash', 'erratic', 'stall', 'phase'];
          this._behaviorState.beastPattern = patterns[Math.floor(Math.random() * patterns.length)];
          this._behaviorState.beastTimer = 0;
        }
        this._behaviorState.beastTimer = (this._behaviorState.beastTimer || 0) + delta;
        if (!this._behaviorState.nextChange || this._fishTimer > this._behaviorState.nextChange) {
          this._behaviorState.erraticTarget = Math.random() * TRACK_HEIGHT;
          this._behaviorState.nextChange = this._fishTimer + 0.2 + Math.random() * 0.3;
        }
        target = this._behaviorState.erraticTarget;
        break;

      default:
        target = TRACK_HEIGHT * 0.5 + Math.sin(this._fishTimer * 1.5) * TRACK_HEIGHT * 0.3;
    }

    const diff = target - this._fishPos;
    const moveSpeed = behavior === 'dash' && this._behaviorState?.dashPhase === 'rocket' ? speed * 3 :
                      behavior === 'lure' && this._behaviorState?.lurePhase === 'snap' ? speed * 2.5 :
                      speed;
    this._fishPos += Math.sign(diff) * Math.min(Math.abs(diff), moveSpeed * delta);
    this._fishPos = Math.max(0, Math.min(TRACK_HEIGHT - 12, this._fishPos));
  }

  _updateProgress(delta) {
    const fishCenter = this._fishPos + 6;
    const inNet = fishCenter >= this._netPos && fishCenter <= this._netPos + this._netHeight;

    if (inNet) {
      this._progress += FILL_RATE;
    } else {
      this._progress -= this._config.drainRate;
    }
    this._progress = Math.max(0, Math.min(1, this._progress));
  }

  _render() {
    if (!this._container) return;

    this._netEl.style.bottom = this._netPos + 'px';
    this._fishEl.style.bottom = this._fishPos + 'px';
    this._progressEl.style.width = (this._progress * 100) + '%';

    if (this._progress < 0.2) {
      this._progressEl.style.background = '#f44';
    } else if (this._progress < 0.5) {
      this._progressEl.style.background = '#fa4';
    } else {
      this._progressEl.style.background = '#4c4';
    }

    const fishCenter = this._fishPos + 6;
    const inNet = fishCenter >= this._netPos && fishCenter <= this._netPos + this._netHeight;
    this._netEl.classList.toggle('fishing-net-active', inNet);
  }

  _endGame(success) {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);

    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);

    if (this._container) {
      this._container.classList.remove('fishing-panel-visible');
      this._container.classList.add('fishing-panel-exit');
      setTimeout(() => {
        if (this._container && this._container.parentNode) {
          this._container.parentNode.removeChild(this._container);
        }
        this._container = null;
      }, 300);
    }

    if (this._resolve) {
      this._resolve(success);
      this._resolve = null;
    }
  }

  get visible() {
    return this._running;
  }

  dispose() {
    this._endGame(false);
  }
}
