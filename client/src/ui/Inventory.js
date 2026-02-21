// client/src/ui/Inventory.js
// 30-slot backpack (6 columns x 5 rows) with drag-and-drop, quality stars.

import { getItemIcon } from './ItemIcons.js';

const COLS = 6;
const ROWS = 5;
const TOTAL_SLOTS = COLS * ROWS;
const QUALITY_STARS = { 1: '\u2605', 2: '\u2605\u2605', 3: '\u2605\u2605\u2605' };
const QUALITY_COLORS = { 1: '#c0c0c0', 2: '#ffd700', 3: '#b366ff' };

export class InventoryUI {
  constructor(container) {
    this.container = container;
    this.items = [];
    this.visible = false;
    this.onItemSelect = null;
    this.onQuickAdd = null; // callback for right-click → action bar
    this._overlayEl = null;
  }

  toggle() {
    this.visible = !this.visible;
    if (this.visible) {
      this.render();
    } else {
      this._removeOverlay();
    }
  }

  show() {
    this.visible = true;
    this.render();
  }

  hide() {
    this.visible = false;
    this._removeOverlay();
  }

  update(inventory) {
    this.items = inventory;
    if (this.visible) this.render();
  }

  render() {
    this._removeOverlay();

    // Create overlay
    this._overlayEl = document.createElement('div');
    this._overlayEl.className = 'backpack-overlay';
    this._overlayEl.addEventListener('click', (e) => {
      if (e.target === this._overlayEl) this.toggle();
    });

    const panel = document.createElement('div');
    panel.className = 'backpack-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'backpack-header';
    header.innerHTML = '<h3>Backpack</h3>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'backpack-close';
    closeBtn.textContent = 'X';
    closeBtn.addEventListener('click', () => this.toggle());
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Grid
    const grid = document.createElement('div');
    grid.className = 'backpack-grid';

    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const item = this.items[i] || null;
      const slot = document.createElement('div');
      let className = 'backpack-slot';
      if (item) {
        if (item.quality === 1) className += ' quality-silver';
        else if (item.quality === 2) className += ' quality-gold';
        else if (item.quality === 3) className += ' quality-iridium';
      }
      slot.className = className;

      if (item) {
        const icon = getItemIcon(item.itemId);
        slot.innerHTML = `<span>${icon.emoji}</span>`;

        if (item.quantity > 1) {
          slot.innerHTML += `<span class="slot-qty">${item.quantity}</span>`;
        }
        if (item.quality > 0 && QUALITY_STARS[item.quality]) {
          slot.innerHTML += `<span class="quality-star" style="color:${QUALITY_COLORS[item.quality]}">${QUALITY_STARS[item.quality]}</span>`;
        }

        // Make draggable for action bar DnD
        slot.draggable = true;
        slot.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', item.itemId);
          slot.classList.add('dragging');
        });
        slot.addEventListener('dragend', () => {
          slot.classList.remove('dragging');
        });

        // Left-click selects
        slot.addEventListener('click', () => {
          if (this.onItemSelect) this.onItemSelect(item);
        });

        // Right-click quick-adds to action bar
        slot.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (this.onQuickAdd) this.onQuickAdd(item.itemId);
        });

        // Tooltip
        slot.title = `${icon.name}${item.quantity > 1 ? ' x' + item.quantity : ''}`;
      }

      grid.appendChild(slot);
    }

    panel.appendChild(grid);
    this._overlayEl.appendChild(panel);
    document.getElementById('ui-overlay').appendChild(this._overlayEl);
  }

  _removeOverlay() {
    if (this._overlayEl) {
      this._overlayEl.remove();
      this._overlayEl = null;
    }
  }
}
