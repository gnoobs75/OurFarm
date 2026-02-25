// client/src/ui/LootToast.js
// Loot notification toasts that fly toward the backpack icon.

import { getItemIcon } from './ItemIcons.js';

export class LootToast {
  constructor() {
    this._container = document.createElement('div');
    this._container.className = 'loot-toast-container';
    document.getElementById('ui-overlay').appendChild(this._container);
    this._getBackpackRect = null;
    this._onPulse = null;
  }

  /** Set callbacks to get backpack icon position and pulse it */
  setBackpackCallbacks(getRect, onPulse) {
    this._getBackpackRect = getRect;
    this._onPulse = onPulse;
  }

  /** Show loot notifications for collected items */
  show(drops) {
    for (const drop of drops) {
      this._spawnToast(drop.itemId, drop.quantity);
    }
  }

  _spawnToast(itemId, quantity) {
    const icon = getItemIcon(itemId);
    const el = document.createElement('div');
    el.className = 'loot-toast';
    el.innerHTML = `<span class="loot-icon">${icon.emoji}</span> <span class="loot-text">${icon.name} x${quantity}</span>`;
    this._container.appendChild(el);

    // Phase 1: Slide in
    requestAnimationFrame(() => el.classList.add('loot-visible'));

    // Phase 2: Fly to backpack after 1.2s
    setTimeout(() => {
      const bpRect = this._getBackpackRect ? this._getBackpackRect() : null;
      if (bpRect) {
        const elRect = el.getBoundingClientRect();
        const dx = bpRect.left + bpRect.width / 2 - (elRect.left + elRect.width / 2);
        const dy = bpRect.top + bpRect.height / 2 - (elRect.top + elRect.height / 2);
        el.style.transition = 'transform 0.4s ease-in, opacity 0.4s ease-in';
        el.style.transform = `translate(${dx}px, ${dy}px) scale(0.3)`;
        el.style.opacity = '0';

        setTimeout(() => {
          if (this._onPulse) this._onPulse();
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 400);
      } else {
        el.classList.add('loot-exit');
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
      }
    }, 1200);
  }
}
