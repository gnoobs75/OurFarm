// client/src/ui/GroomingUI.js
// Full-screen pet grooming mini-game with wash/brush/dry phases + dress-up.
// Returns a promise that resolves with { stars, equipped }.

const PHASE_WASH = 0;
const PHASE_BRUSH = 1;
const PHASE_DRY = 2;
const PHASE_DRESSUP = 3;

const SPOT_COUNT = 6;
const BRUSH_STROKES_NEEDED = 12;
const DRY_SPOTS = 5;

const COSMETIC_SLOTS = ['hat', 'neck', 'back'];

const PET_EMOJI = {
  dog: '\u{1F436}', cat: '\u{1F431}', rabbit: '\u{1F430}',
  parrot: '\u{1F99C}', fox: '\u{1F98A}', owl: '\u{1F989}',
};

const COSMETIC_EMOJI = {
  straw_hat: '\u{1F452}', party_hat: '\u{1F389}', flower_wreath: '\u{1F33B}',
  cowboy_hat: '\u{1F920}', crown: '\u{1F451}',
  red_bandana: '\u{1F9E3}', bow_tie: '\u{1F380}', bell_collar: '\u{1F514}',
  flower_lei: '\u{1F33A}', scarf: '\u{1F9E3}',
  cape: '\u{1F9E5}', backpack: '\u{1F392}', angel_wings: '\u{1F47C}',
  butterfly_wings: '\u{1F98B}', saddle: '\u{1FA79}',
};

const RARITY_COLORS = ['#aaa', '#4a4', '#48f'];
const RARITY_LABELS = ['Common', 'Uncommon', 'Rare'];

export class GroomingUI {
  constructor() {
    this._container = null;
    this._resolve = null;
    this._running = false;
    this._phase = PHASE_WASH;
    this._score = 0;
    this._equipped = { hat: null, neck: null, back: null };
  }

  start(petData) {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._petData = petData;
      this._running = true;
      this._score = 0;
      this._equipped = { ...petData.cosmetics?.equipped || { hat: null, neck: null, back: null } };
      this._unlockedCosmetics = [...(petData.cosmetics?.unlocked || [])];
      this._phase = PHASE_WASH;

      this._buildScene();
      this._startWashPhase();
    });
  }

  _buildScene() {
    this._container = document.createElement('div');
    this._container.className = 'groom-overlay';

    const petEmoji = PET_EMOJI[this._petData.type] || '\u{1F436}';

    this._container.innerHTML = `
      <div class="groom-backdrop"></div>
      <div class="groom-scene">
        <div class="groom-salon-bg">
          <div class="groom-shelf"></div>
          <div class="groom-plant plant-1">\u{1FAB4}</div>
          <div class="groom-plant plant-2">\u{1F33F}</div>
        </div>
        <div class="groom-header">
          <div class="groom-title">Grooming ${this._petData.name || 'Pet'}</div>
          <div class="groom-phase-label"></div>
        </div>
        <div class="groom-pet-area">
          <div class="groom-pet">${petEmoji}</div>
          <div class="groom-pet-reaction"></div>
          <div class="groom-spots-layer"></div>
          <div class="groom-tool-cursor"></div>
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

    this._phaseLabel = this._container.querySelector('.groom-phase-label');
    this._petEl = this._container.querySelector('.groom-pet');
    this._reactionEl = this._container.querySelector('.groom-pet-reaction');
    this._spotsLayer = this._container.querySelector('.groom-spots-layer');
    this._toolCursor = this._container.querySelector('.groom-tool-cursor');
    this._progressFill = this._container.querySelector('.groom-progress-fill');
    this._progressLabel = this._container.querySelector('.groom-progress-label');
    this._starsEl = this._container.querySelectorAll('.groom-star');
    this._hintEl = this._container.querySelector('.groom-hint');
    this._dressupArea = this._container.querySelector('.groom-dressup-area');
    this._resultText = this._container.querySelector('.groom-result-text');
    this._petArea = this._container.querySelector('.groom-pet-area');
  }

  _startWashPhase() {
    this._phase = PHASE_WASH;
    this._phaseLabel.textContent = '\u{1F9FC} Wash';
    this._hintEl.textContent = 'Click and drag to scrub the dirty spots!';
    this._toolCursor.textContent = '\u{1F9FC}';
    this._toolCursor.classList.add('tool-active');

    this._spots = [];
    this._spotsLayer.innerHTML = '';
    for (let i = 0; i < SPOT_COUNT; i++) {
      const spot = document.createElement('div');
      spot.className = 'groom-dirty-spot';
      spot.style.left = (15 + Math.random() * 70) + '%';
      spot.style.top = (15 + Math.random() * 70) + '%';
      spot.dataset.scrubs = '0';
      this._spotsLayer.appendChild(spot);
      this._spots.push(spot);
    }

    this._washCleanedCount = 0;
    this._washStartTime = Date.now();
    this._updateProgress(0);

    this._onPointerMove = (e) => {
      const rect = this._petArea.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this._toolCursor.style.left = x + 'px';
      this._toolCursor.style.top = y + 'px';
      if (this._isDragging) {
        this._checkSpotScrub(e.clientX, e.clientY);
      }
    };
    this._onPointerDown = (e) => {
      this._isDragging = true;
      this._spawnBubble(e.clientX, e.clientY);
    };
    this._onPointerUp = () => { this._isDragging = false; };

    this._petArea.addEventListener('pointermove', this._onPointerMove);
    this._petArea.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointerup', this._onPointerUp);
  }

  _checkSpotScrub(clientX, clientY) {
    for (const spot of this._spots) {
      if (spot.classList.contains('spot-clean')) continue;
      const rect = spot.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.sqrt((clientX - cx) ** 2 + (clientY - cy) ** 2);
      if (dist < 30) {
        const scrubs = parseInt(spot.dataset.scrubs) + 1;
        spot.dataset.scrubs = scrubs;
        spot.style.opacity = Math.max(0, 1 - scrubs / 5);
        this._spawnBubble(clientX, clientY);
        if (scrubs >= 5) {
          spot.classList.add('spot-clean');
          this._washCleanedCount++;
          this._showReaction('\u2728');
          this._updateProgress(this._washCleanedCount / SPOT_COUNT);
          if (this._washCleanedCount >= SPOT_COUNT) {
            this._endWashPhase();
          }
        }
      }
    }
  }

  _spawnBubble(x, y) {
    const bubble = document.createElement('div');
    bubble.className = 'groom-bubble';
    const rect = this._petArea.getBoundingClientRect();
    bubble.style.left = (x - rect.left + (Math.random() - 0.5) * 20) + 'px';
    bubble.style.top = (y - rect.top + (Math.random() - 0.5) * 20) + 'px';
    this._spotsLayer.appendChild(bubble);
    setTimeout(() => bubble.remove(), 800);
  }

  _endWashPhase() {
    this._cleanupPhaseListeners();
    const elapsed = (Date.now() - this._washStartTime) / 1000;
    const phaseScore = elapsed < 5 ? 3 : elapsed < 10 ? 2 : elapsed < 20 ? 1 : 0;
    this._score += phaseScore;
    this._spotsLayer.innerHTML = '';
    this._toolCursor.classList.remove('tool-active');
    setTimeout(() => this._startBrushPhase(), 500);
  }

  _startBrushPhase() {
    this._phase = PHASE_BRUSH;
    this._phaseLabel.textContent = '\u{1FA92} Brush';
    this._hintEl.textContent = 'Drag in the direction of the arrows!';
    this._toolCursor.textContent = '\u{1FA92}';
    this._toolCursor.classList.add('tool-active');

    this._brushCount = 0;
    this._brushStreak = 0;
    this._brushBestStreak = 0;
    this._brushStartTime = Date.now();
    this._updateProgress(0);

    this._brushDir = 'right';
    this._showArrowHint();

    this._lastDragX = null;
    this._onPointerMove = (e) => {
      const rect = this._petArea.getBoundingClientRect();
      this._toolCursor.style.left = (e.clientX - rect.left) + 'px';
      this._toolCursor.style.top = (e.clientY - rect.top) + 'px';

      if (this._isDragging && this._lastDragX !== null) {
        const dx = e.clientX - this._lastDragX;
        if (Math.abs(dx) > 15) {
          const dir = dx > 0 ? 'right' : 'left';
          if (dir === this._brushDir) {
            this._brushCount++;
            this._brushStreak++;
            this._brushBestStreak = Math.max(this._brushBestStreak, this._brushStreak);
            this._showReaction(this._brushStreak >= 3 ? '\u2764\uFE0F' : '\u2728');
            if (this._brushStreak >= 3) {
              this._petEl.classList.add('pet-happy');
            }
          } else {
            this._brushStreak = 0;
            this._showReaction('\u{1F623}');
            this._petEl.classList.add('pet-squirm');
            setTimeout(() => this._petEl.classList.remove('pet-squirm'), 300);
            this._petEl.classList.remove('pet-happy');
          }
          if (this._brushCount % 3 === 0) {
            this._brushDir = this._brushDir === 'right' ? 'left' : 'right';
            this._showArrowHint();
          }
          this._updateProgress(this._brushCount / BRUSH_STROKES_NEEDED);
          this._lastDragX = e.clientX;
          if (this._brushCount >= BRUSH_STROKES_NEEDED) {
            this._endBrushPhase();
          }
        }
      }
    };
    this._onPointerDown = (e) => { this._isDragging = true; this._lastDragX = e.clientX; };
    this._onPointerUp = () => { this._isDragging = false; this._lastDragX = null; };

    this._petArea.addEventListener('pointermove', this._onPointerMove);
    this._petArea.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointerup', this._onPointerUp);
  }

  _showArrowHint() {
    this._spotsLayer.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const arrow = document.createElement('div');
      arrow.className = 'groom-arrow';
      arrow.textContent = this._brushDir === 'right' ? '\u27A1\uFE0F' : '\u2B05\uFE0F';
      arrow.style.top = (30 + i * 25) + '%';
      arrow.style.left = '50%';
      this._spotsLayer.appendChild(arrow);
    }
  }

  _endBrushPhase() {
    this._cleanupPhaseListeners();
    const phaseScore = this._brushBestStreak >= 6 ? 3 : this._brushBestStreak >= 4 ? 2 : this._brushBestStreak >= 2 ? 1 : 0;
    this._score += phaseScore;
    this._spotsLayer.innerHTML = '';
    this._toolCursor.classList.remove('tool-active');
    this._petEl.classList.remove('pet-happy');
    setTimeout(() => this._startDryPhase(), 500);
  }

  _startDryPhase() {
    this._phase = PHASE_DRY;
    this._phaseLabel.textContent = '\u{1F4A8} Dry';
    this._hintEl.textContent = 'Hold and move over wet spots to dry!';
    this._toolCursor.textContent = '\u{1F4A8}';
    this._toolCursor.classList.add('tool-active');

    this._drySpots = [];
    this._driedCount = 0;
    this._dryStartTime = Date.now();
    this._spotsLayer.innerHTML = '';
    this._updateProgress(0);

    for (let i = 0; i < DRY_SPOTS; i++) {
      const spot = document.createElement('div');
      spot.className = 'groom-wet-spot';
      spot.style.left = (15 + Math.random() * 70) + '%';
      spot.style.top = (15 + Math.random() * 70) + '%';
      spot.dataset.heat = '0';
      this._spotsLayer.appendChild(spot);
      this._drySpots.push(spot);
    }

    this._onPointerMove = (e) => {
      const rect = this._petArea.getBoundingClientRect();
      this._toolCursor.style.left = (e.clientX - rect.left) + 'px';
      this._toolCursor.style.top = (e.clientY - rect.top) + 'px';
      if (this._isDragging) {
        this._checkDrySpot(e.clientX, e.clientY);
      }
    };
    this._onPointerDown = () => { this._isDragging = true; };
    this._onPointerUp = () => { this._isDragging = false; };

    this._petArea.addEventListener('pointermove', this._onPointerMove);
    this._petArea.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointerup', this._onPointerUp);
  }

  _checkDrySpot(clientX, clientY) {
    for (const spot of this._drySpots) {
      if (spot.classList.contains('spot-dry')) continue;
      const rect = spot.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.sqrt((clientX - cx) ** 2 + (clientY - cy) ** 2);
      if (dist < 35) {
        const heat = parseInt(spot.dataset.heat) + 1;
        spot.dataset.heat = heat;
        spot.style.opacity = Math.max(0, 1 - heat / 8);
        if (heat % 2 === 0) this._spawnSparkle(clientX, clientY);
        if (heat >= 8) {
          spot.classList.add('spot-dry');
          this._driedCount++;
          this._showReaction('\u2728');
          this._updateProgress(this._driedCount / DRY_SPOTS);
          if (this._driedCount >= DRY_SPOTS) {
            this._endDryPhase();
          }
        }
      }
    }
  }

  _spawnSparkle(x, y) {
    const sparkle = document.createElement('div');
    sparkle.className = 'groom-sparkle';
    sparkle.textContent = '\u2728';
    const rect = this._petArea.getBoundingClientRect();
    sparkle.style.left = (x - rect.left + (Math.random() - 0.5) * 16) + 'px';
    sparkle.style.top = (y - rect.top + (Math.random() - 0.5) * 16) + 'px';
    this._spotsLayer.appendChild(sparkle);
    setTimeout(() => sparkle.remove(), 600);
  }

  _endDryPhase() {
    this._cleanupPhaseListeners();
    const elapsed = (Date.now() - this._dryStartTime) / 1000;
    const phaseScore = elapsed < 5 ? 3 : elapsed < 10 ? 2 : elapsed < 15 ? 1 : 0;
    this._score += phaseScore;
    this._spotsLayer.innerHTML = '';
    this._toolCursor.classList.remove('tool-active');

    const stars = this._score >= 7 ? 3 : this._score >= 4 ? 2 : 1;
    this._showStars(stars);

    setTimeout(() => this._startDressupPhase(stars), 800);
  }

  _startDressupPhase(stars) {
    this._phase = PHASE_DRESSUP;
    this._phaseLabel.textContent = '\u{1F3A8} Dress Up';
    this._hintEl.textContent = 'Pick accessories for your pet!';

    this._container.querySelector('.groom-progress-area').classList.add('hidden');
    this._dressupArea.classList.remove('hidden');

    let html = '<div class="dressup-slots">';
    for (const slot of COSMETIC_SLOTS) {
      const equipped = this._equipped[slot];
      const emoji = equipped ? (COSMETIC_EMOJI[equipped] || '\u2753') : '\u2795';
      html += `<div class="dressup-slot" data-slot="${slot}">
        <div class="dressup-slot-label">${slot}</div>
        <div class="dressup-slot-icon">${emoji}</div>
      </div>`;
    }
    html += '</div>';

    html += '<div class="dressup-items-tray">';
    if (this._unlockedCosmetics.length === 0) {
      html += '<div class="dressup-empty">No accessories yet - keep grooming!</div>';
    } else {
      for (const cosId of this._unlockedCosmetics) {
        const emoji = COSMETIC_EMOJI[cosId] || '\u2753';
        const name = cosId.replace(/_/g, ' ');
        const isEquipped = Object.values(this._equipped).includes(cosId);
        html += `<button class="dressup-item ${isEquipped ? 'item-equipped' : ''}" data-id="${cosId}" title="${name}">${emoji}</button>`;
      }
    }
    html += '</div>';
    html += '<button class="dressup-done-btn">Done \u2714\uFE0F</button>';

    this._dressupArea.innerHTML = html;

    this._dressupArea.querySelectorAll('.dressup-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this._toggleCosmetic(btn.dataset.id);
      });
    });

    this._dressupArea.querySelector('.dressup-done-btn').addEventListener('click', () => {
      this._endGame(stars);
    });
  }

  _toggleCosmetic(cosId) {
    const slotMap = {
      straw_hat: 'hat', party_hat: 'hat', flower_wreath: 'hat', cowboy_hat: 'hat', crown: 'hat',
      red_bandana: 'neck', bow_tie: 'neck', bell_collar: 'neck', flower_lei: 'neck', scarf: 'neck',
      cape: 'back', backpack: 'back', angel_wings: 'back', butterfly_wings: 'back', saddle: 'back',
    };
    const slot = slotMap[cosId];
    if (!slot) return;

    if (this._equipped[slot] === cosId) {
      this._equipped[slot] = null;
    } else {
      this._equipped[slot] = cosId;
    }

    this._refreshDressupDisplay();
  }

  _refreshDressupDisplay() {
    this._dressupArea.querySelectorAll('.dressup-slot').forEach(el => {
      const slot = el.dataset.slot;
      const equipped = this._equipped[slot];
      el.querySelector('.dressup-slot-icon').textContent = equipped ? (COSMETIC_EMOJI[equipped] || '\u2753') : '\u2795';
    });

    this._dressupArea.querySelectorAll('.dressup-item').forEach(btn => {
      const cosId = btn.dataset.id;
      const isEquipped = Object.values(this._equipped).includes(cosId);
      btn.classList.toggle('item-equipped', isEquipped);
    });

    this._updatePetPreview();
  }

  _updatePetPreview() {
    const petEmoji = PET_EMOJI[this._petData.type] || '\u{1F436}';
    const hat = this._equipped.hat ? (COSMETIC_EMOJI[this._equipped.hat] || '') : '';
    const neck = this._equipped.neck ? (COSMETIC_EMOJI[this._equipped.neck] || '') : '';
    const back = this._equipped.back ? (COSMETIC_EMOJI[this._equipped.back] || '') : '';
    this._petEl.innerHTML = `
      ${hat ? `<span class="pet-cosmetic pet-hat">${hat}</span>` : ''}
      ${petEmoji}
      ${neck ? `<span class="pet-cosmetic pet-neck">${neck}</span>` : ''}
      ${back ? `<span class="pet-cosmetic pet-back">${back}</span>` : ''}
    `;
  }

  _updateProgress(pct) {
    const p = Math.max(0, Math.min(1, pct));
    this._progressFill.style.width = (p * 100) + '%';
    this._progressLabel.textContent = Math.round(p * 100) + '%';
  }

  _showReaction(emoji) {
    this._reactionEl.textContent = emoji;
    this._reactionEl.classList.remove('reaction-pop');
    void this._reactionEl.offsetWidth;
    this._reactionEl.classList.add('reaction-pop');
  }

  _showStars(count) {
    this._starsEl.forEach((el, i) => {
      el.textContent = i < count ? '\u2605' : '\u2606';
      el.classList.toggle('star-filled', i < count);
    });
  }

  _cleanupPhaseListeners() {
    this._petArea.removeEventListener('pointermove', this._onPointerMove);
    this._petArea.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointerup', this._onPointerUp);
    this._isDragging = false;
  }

  _endGame(stars) {
    this._running = false;

    this._resultText.textContent = stars >= 3 ? 'Perfect!' : stars >= 2 ? 'Great job!' : 'Good enough!';
    this._resultText.className = 'groom-result-text result-show';

    if (this._resolve) {
      this._resolve({ stars, equipped: { ...this._equipped } });
      this._resolve = null;
    }

    setTimeout(() => {
      if (this._container) {
        this._container.classList.remove('groom-overlay-visible');
        this._container.classList.add('groom-overlay-exit');
      }
      setTimeout(() => {
        if (this._container && this._container.parentNode) {
          this._container.parentNode.removeChild(this._container);
        }
        this._container = null;
      }, 400);
    }, 1000);
  }

  get visible() {
    return this._running;
  }

  dispose() {
    this._cleanupPhaseListeners();
    this._running = false;
    if (this._resolve) {
      this._resolve(null);
      this._resolve = null;
    }
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._container = null;
  }
}
