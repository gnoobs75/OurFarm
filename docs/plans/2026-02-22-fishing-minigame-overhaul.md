# Fishing Mini-Game UI Overhaul

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the small side-panel fishing mini-game with a full-screen cutesy underwater scene that takes over the screen, with goofy spectator fish, animated bubbles, seaweed, and retuned difficulty.

**Architecture:** Replace `FishingUI.js` and its CSS with a full-screen overlay. The catch bar mechanic stays (vertical bar, momentum-based net vs bouncing fish) but is bigger (400px tall) and centered in a large underwater scene panel. All visuals are pure CSS/HTML with CSS animations for bubbles, seaweed, spectator fish, and reactions. No new dependencies.

**Tech Stack:** HTML/CSS/JS, CSS animations, existing FishingUI class interface

---

### Task 1: Retune Difficulty Constants

**Files:**
- Modify: `client/src/ui/FishingUI.js:1-19`

**Step 1: Update difficulty constants**

Change the constants at the top of FishingUI.js:

```javascript
const TRACK_HEIGHT = 400;       // was 280 — taller bar
const TRACK_WIDTH = 48;         // was 36 — wider bar
const FILL_RATE = 0.008;        // was 0.015 — slower fill = harder
const STARTING_PROGRESS = 0.25; // was 0.3 — start lower

const RARITY_CONFIG = {
  0: { netSize: 0.30, fishSpeed: 70,  drainRate: 0.010,  label: 'Common',    color: '#88cc88' },
  1: { netSize: 0.24, fishSpeed: 110, drainRate: 0.014,  label: 'Uncommon',  color: '#44cc44' },
  2: { netSize: 0.18, fishSpeed: 170, drainRate: 0.020,  label: 'Rare',      color: '#4488ff' },
  3: { netSize: 0.12, fishSpeed: 240, drainRate: 0.028,  label: 'Legendary', color: '#ff8844' },
};
```

Key changes: smaller nets (30% down from 40% for common), slower fill rate, faster drain, slightly faster fish.

**Step 2: Commit**

```bash
git add client/src/ui/FishingUI.js
git commit -m "feat: retune fishing difficulty — smaller nets, slower fill"
```

---

### Task 2: Build Full-Screen Underwater Scene HTML

**Files:**
- Modify: `client/src/ui/FishingUI.js` — replace `_buildUI` method

**Step 1: Replace the `_buildUI` method**

Replace the existing `_buildUI` method with a full-screen underwater scene layout:

```javascript
_buildUI(fishData, config, netHeight) {
  this._container = document.createElement('div');
  this._container.className = 'fishing-overlay';

  // Generate 8-12 random bubbles
  let bubblesHTML = '';
  for (let i = 0; i < 10; i++) {
    const left = 5 + Math.random() * 90;
    const delay = Math.random() * 4;
    const size = 4 + Math.random() * 10;
    const dur = 3 + Math.random() * 3;
    bubblesHTML += `<div class="fishing-bubble" style="left:${left}%;animation-delay:${delay}s;width:${size}px;height:${size}px;animation-duration:${dur}s;"></div>`;
  }

  // Generate 3 spectator fish at different positions
  const spectators = [
    { cls: 'spec-fish-1', emoji: '\u{1F420}', style: 'left:8%;top:55%' },
    { cls: 'spec-fish-2', emoji: '\u{1F421}', style: 'right:8%;top:40%' },
    { cls: 'spec-fish-3', emoji: '\u{1F41F}', style: 'left:15%;top:75%' },
  ];
  const specHTML = spectators.map(s =>
    `<div class="fishing-spectator ${s.cls}" style="${s.style}"><span class="spec-emoji">${s.emoji}</span><span class="spec-eyes">O O</span></div>`
  ).join('');

  this._container.innerHTML = `
    <div class="fishing-backdrop"></div>
    <div class="fishing-scene">
      <div class="fishing-surface">
        <div class="fishing-lilypad lp-1"></div>
        <div class="fishing-lilypad lp-2"></div>
        <div class="fishing-lilypad lp-3"></div>
      </div>
      <div class="fishing-underwater">
        ${bubblesHTML}
        <div class="fishing-seaweed sw-1"></div>
        <div class="fishing-seaweed sw-2"></div>
        <div class="fishing-seaweed sw-3"></div>
        ${specHTML}
        <div class="fishing-hooked-fish">
          <div class="hooked-body">\u{1F41F}</div>
          <div class="hooked-eyes"></div>
        </div>
        <div class="fishing-bar-area">
          <div class="fishing-header">
            <div class="fishing-fish-name" style="color: ${config.color}">${fishData.fishName}</div>
            <div class="fishing-rarity">${config.label}</div>
          </div>
          <div class="fishing-track" style="width:${TRACK_WIDTH}px;height:${TRACK_HEIGHT}px;">
            <div class="fishing-net" style="height:${netHeight}px;"></div>
            <div class="fishing-fish-icon"></div>
          </div>
          <div class="fishing-progress-wrapper">
            <div class="fishing-progress-bar"></div>
          </div>
          <div class="fishing-hint">Hold SPACE or CLICK to reel</div>
        </div>
      </div>
      <div class="fishing-result-text"></div>
    </div>
  `;

  document.getElementById('ui-overlay').appendChild(this._container);

  this._netEl = this._container.querySelector('.fishing-net');
  this._fishEl = this._container.querySelector('.fishing-fish-icon');
  this._progressEl = this._container.querySelector('.fishing-progress-bar');
  this._hookedFish = this._container.querySelector('.fishing-hooked-fish');
  this._spectators = this._container.querySelectorAll('.fishing-spectator');
  this._resultText = this._container.querySelector('.fishing-result-text');

  requestAnimationFrame(() => {
    this._container.classList.add('fishing-overlay-visible');
  });
}
```

**Step 2: Update `_render` to sync the hooked fish + spectator reactions**

Add to the bottom of the existing `_render` method, after the net-active toggle:

```javascript
// Sync hooked fish position with fish icon (map bar position to scene)
if (this._hookedFish) {
  const pct = (this._fishPos / TRACK_HEIGHT) * 100;
  this._hookedFish.style.bottom = pct + '%';

  // Flip fish based on movement direction
  const dir = this._fishVelocity || (this._fishPos - (this._prevFishPos || this._fishPos));
  this._hookedFish.style.transform = dir < 0 ? 'scaleX(-1)' : 'scaleX(1)';
  this._prevFishPos = this._fishPos;
}

// Spectator reactions based on progress
if (this._spectators) {
  const reaction = this._progress < 0.2 ? 'spec-gasp' :
                   this._progress > 0.7 ? 'spec-cheer' : '';
  this._spectators.forEach(s => {
    s.classList.toggle('spec-gasp', reaction === 'spec-gasp');
    s.classList.toggle('spec-cheer', reaction === 'spec-cheer');
  });
}
```

**Step 3: Update `_endGame` for full-screen exit + result animation**

Replace the container cleanup in `_endGame`:

```javascript
if (this._container) {
  // Show result text
  if (this._resultText) {
    this._resultText.textContent = success ? 'CAUGHT!' : 'Got away...';
    this._resultText.className = 'fishing-result-text ' + (success ? 'result-win' : 'result-lose');
  }
  if (success && this._hookedFish) {
    this._hookedFish.classList.add('hooked-caught');
  }
  if (!success && this._hookedFish) {
    this._hookedFish.classList.add('hooked-escaped');
  }

  // Delay removal for result animation
  setTimeout(() => {
    if (this._container) {
      this._container.classList.remove('fishing-overlay-visible');
      this._container.classList.add('fishing-overlay-exit');
    }
    setTimeout(() => {
      if (this._container && this._container.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }
      this._container = null;
    }, 400);
  }, success ? 800 : 600);
}
```

**Step 4: Commit**

```bash
git add client/src/ui/FishingUI.js
git commit -m "feat: full-screen underwater fishing scene with spectators"
```

---

### Task 3: CSS — Full-Screen Overlay, Underwater Scene, Surface

**Files:**
- Modify: `client/styles/game.css` — replace all `.fishing-*` rules (lines 724-847)

**Step 1: Replace all fishing CSS**

Remove lines 724-847 (the old `.fishing-panel` through `.fishing-hint` rules) and replace with:

```css
/* ═══════════════════════════════════════════
   FISHING MINI-GAME — FULL-SCREEN UNDERWATER
   ═══════════════════════════════════════════ */

/* --- Overlay & Backdrop --- */
.fishing-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  opacity: 0;
  transition: opacity 0.4s ease-out;
}
.fishing-overlay-visible { opacity: 1; }
.fishing-overlay-exit { opacity: 0; transition: opacity 0.4s ease-in; }

.fishing-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
}

/* --- Main Scene Panel --- */
.fishing-scene {
  position: relative;
  width: min(560px, 90vw);
  height: min(520px, 85vh);
  border-radius: 24px;
  overflow: hidden;
  border: 3px solid rgba(100, 200, 255, 0.4);
  box-shadow:
    0 0 60px rgba(0, 100, 200, 0.3),
    0 0 120px rgba(0, 50, 100, 0.2),
    inset 0 0 80px rgba(0, 80, 160, 0.15);
}

/* --- Water Surface (top strip) --- */
.fishing-surface {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: linear-gradient(180deg,
    rgba(135, 206, 235, 0.6) 0%,
    rgba(70, 160, 210, 0.8) 50%,
    rgba(30, 100, 170, 0.9) 100%
  );
  z-index: 2;
  border-bottom: 2px solid rgba(255, 255, 255, 0.15);
}

/* Lily pads */
.fishing-lilypad {
  position: absolute;
  width: 32px;
  height: 20px;
  background: radial-gradient(ellipse, #5a9e3e 40%, #3d7a2a 100%);
  border-radius: 50%;
  top: 12px;
  animation: lilyBob 3s ease-in-out infinite;
}
.fishing-lilypad::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 12px;
  width: 8px;
  height: 4px;
  background: #e88baa;
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
}
.lp-1 { left: 10%; animation-delay: 0s; }
.lp-2 { left: 55%; animation-delay: 1.2s; width: 26px; height: 16px; }
.lp-3 { left: 82%; animation-delay: 0.6s; width: 28px; height: 18px; }

@keyframes lilyBob {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-3px) rotate(2deg); }
}

/* --- Underwater Area --- */
.fishing-underwater {
  position: absolute;
  top: 60px;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg,
    #1a6b9a 0%,
    #0e4a6e 40%,
    #082d45 75%,
    #051c2e 100%
  );
  display: flex;
  align-items: center;
  justify-content: center;
}

/* --- Bubbles --- */
.fishing-bubble {
  position: absolute;
  bottom: -20px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, rgba(200, 230, 255, 0.5), rgba(100, 180, 255, 0.15));
  border: 1px solid rgba(180, 220, 255, 0.25);
  animation: bubbleRise 4s ease-in infinite;
}
@keyframes bubbleRise {
  0% { bottom: -20px; opacity: 0.6; transform: translateX(0) scale(1); }
  50% { opacity: 0.8; transform: translateX(8px) scale(1.05); }
  100% { bottom: 100%; opacity: 0; transform: translateX(-4px) scale(0.8); }
}

/* --- Seaweed --- */
.fishing-seaweed {
  position: absolute;
  bottom: 0;
  width: 18px;
  height: 70px;
  background: linear-gradient(180deg, #2d8a4e, #1a5e32);
  border-radius: 50% 50% 4px 4px;
  transform-origin: bottom center;
  animation: seaweedSway 3s ease-in-out infinite;
}
.sw-1 { left: 12%; height: 65px; animation-delay: 0s; }
.sw-2 { left: 25%; height: 80px; animation-delay: 0.8s; }
.sw-3 { right: 15%; height: 55px; animation-delay: 1.6s; }

@keyframes seaweedSway {
  0%, 100% { transform: rotate(-8deg); }
  50% { transform: rotate(8deg); }
}

/* --- Spectator Fish --- */
.fishing-spectator {
  position: absolute;
  font-size: 32px;
  transition: transform 0.3s;
  animation: specIdle 4s ease-in-out infinite;
  z-index: 1;
}
.spec-emoji { display: block; }
.spec-eyes {
  position: absolute;
  top: 2px;
  left: 6px;
  font-size: 8px;
  font-weight: 900;
  color: #fff;
  opacity: 0;
  letter-spacing: 3px;
}

.spec-fish-1 { animation-delay: 0s; }
.spec-fish-2 { animation-delay: 1.5s; transform: scaleX(-1); }
.spec-fish-3 { animation-delay: 0.7s; }

@keyframes specIdle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

/* Spectator reactions */
.spec-gasp {
  animation: specGasp 0.6s ease-in-out infinite !important;
}
.spec-gasp .spec-eyes { opacity: 1; font-size: 10px; }
.spec-cheer {
  animation: specCheer 0.4s ease-in-out infinite !important;
}

@keyframes specGasp {
  0%, 100% { transform: scale(1.15); }
  50% { transform: scale(1.25); }
}
@keyframes specCheer {
  0%, 100% { transform: translateY(0) rotate(-5deg); }
  50% { transform: translateY(-10px) rotate(5deg); }
}

/* --- Hooked Fish (big, goofy, synced to bar) --- */
.fishing-hooked-fish {
  position: absolute;
  left: 15%;
  font-size: 48px;
  transition: bottom 0.08s linear, transform 0.15s ease;
  z-index: 3;
  filter: drop-shadow(0 0 8px rgba(255, 200, 50, 0.5));
}
.hooked-body {
  animation: hookedWiggle 0.4s ease-in-out infinite;
}
.hooked-eyes {
  position: absolute;
  top: 4px;
  left: 14px;
  width: 20px;
  height: 20px;
  background:
    radial-gradient(circle at 35% 40%, #111 30%, transparent 31%),
    radial-gradient(circle at 65% 40%, #111 30%, transparent 31%);
  background-size: 10px 10px, 10px 10px;
  background-position: 0 0, 12px 0;
  background-repeat: no-repeat;
  animation: googlyEyes 0.8s ease-in-out infinite;
}

@keyframes hookedWiggle {
  0%, 100% { transform: rotate(-5deg); }
  50% { transform: rotate(5deg); }
}
@keyframes googlyEyes {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(2px, -1px); }
  75% { transform: translate(-2px, 1px); }
}

/* Win/Lose animations for hooked fish */
.hooked-caught {
  animation: caughtSpin 0.8s ease-out forwards !important;
}
.hooked-caught .hooked-body {
  animation: none !important;
}
@keyframes caughtSpin {
  0% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(360deg) scale(1.3); }
  100% { transform: rotate(720deg) scale(0.5); opacity: 0.3; }
}

.hooked-escaped .hooked-body {
  animation: none !important;
}
.hooked-escaped {
  animation: escapedZoom 0.6s ease-in forwards !important;
}
@keyframes escapedZoom {
  0% { transform: scaleX(1); opacity: 1; }
  30% { transform: scaleX(-1.2) translateX(20px); }
  100% { transform: scaleX(-1.5) translateX(300px); opacity: 0; }
}

/* --- Catch Bar Area (right side of scene) --- */
.fishing-bar-area {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-left: auto;
  margin-right: 40px;
  z-index: 4;
}

.fishing-header {
  text-align: center;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(100, 200, 255, 0.2);
}
.fishing-fish-name {
  font-size: 18px;
  font-weight: 700;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}
.fishing-rarity {
  font-size: 11px;
  color: rgba(180, 220, 255, 0.7);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-top: 2px;
}

/* --- Catch Bar Track --- */
.fishing-track {
  position: relative;
  background: rgba(0, 20, 40, 0.6);
  border: 2px solid rgba(100, 200, 255, 0.25);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.4);
}

.fishing-net {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  background: rgba(60, 200, 100, 0.2);
  border: 1px solid rgba(60, 200, 100, 0.4);
  border-radius: 6px;
  transition: background 0.1s;
}
.fishing-net-active {
  background: rgba(60, 255, 120, 0.35);
  border-color: rgba(100, 255, 140, 0.7);
  box-shadow: 0 0 12px rgba(60, 255, 120, 0.3);
}

.fishing-fish-icon {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 24px;
  height: 14px;
  background: #f5d142;
  border-radius: 50% 50% 40% 40%;
  box-shadow: 0 0 8px rgba(245, 209, 66, 0.7);
}
.fishing-fish-icon::after {
  content: '';
  position: absolute;
  right: -7px;
  top: 2px;
  width: 0;
  height: 0;
  border-left: 9px solid #f5d142;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
}

/* --- Progress Bar --- */
.fishing-progress-wrapper {
  width: 100%;
  height: 10px;
  background: rgba(0, 20, 40, 0.6);
  border-radius: 5px;
  overflow: hidden;
  margin-top: 10px;
  border: 1px solid rgba(100, 200, 255, 0.2);
}
.fishing-progress-bar {
  height: 100%;
  width: 25%;
  background: #4c4;
  border-radius: 4px;
  transition: width 0.05s linear;
}

.fishing-hint {
  text-align: center;
  font-size: 11px;
  color: rgba(180, 220, 255, 0.5);
  margin-top: 8px;
  letter-spacing: 1px;
}

/* --- Result Text --- */
.fishing-result-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0);
  font-size: 42px;
  font-weight: 900;
  z-index: 10;
  text-shadow: 0 3px 12px rgba(0, 0, 0, 0.6);
  opacity: 0;
  pointer-events: none;
}
.result-win {
  color: #ffd700;
  animation: resultPop 0.8s ease-out forwards;
}
.result-lose {
  color: #ff6b6b;
  animation: resultPop 0.6s ease-out forwards;
}
@keyframes resultPop {
  0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
  50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
}
```

**Step 2: Commit**

```bash
git add client/styles/game.css
git commit -m "feat: full-screen underwater CSS for fishing mini-game"
```

---

### Task 4: Verification

**Step 1: Start dev server and client**

```bash
cd worktree && npm run dev
```

**Step 2: Manual test checklist**

- [ ] Select fishing rod, left-click water tile
- [ ] Bobber casts out, nibbles play, bite happens
- [ ] Full-screen underwater scene appears with fade-in
- [ ] Bubbles float up, seaweed sways, lily pads bob
- [ ] 3 spectator fish visible, gently bobbing
- [ ] Vertical catch bar on right side, 400px tall
- [ ] Big goofy fish on left, synced to fish icon position
- [ ] Hold SPACE — net moves up with momentum
- [ ] Release — net falls with gravity
- [ ] Progress bar fills when fish in net, drains when out
- [ ] When progress < 20%: spectators gasp
- [ ] When progress > 70%: spectators cheer
- [ ] Win: "CAUGHT!" pops, fish spins dizzy, overlay fades
- [ ] Lose: "Got away..." pops, fish zooms off, overlay fades
- [ ] Escape key cancels correctly
- [ ] Game world visible (dimmed) behind overlay
- [ ] Difficulty feels balanced — not too easy for common fish

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: fishing mini-game overhaul — full-screen underwater scene"
```
