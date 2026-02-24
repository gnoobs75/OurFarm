// client/src/ui/HUD.js
// Heads-up display: stats, time, weather, 10-slot action bar with emoji icons.

import { SEASON_NAMES } from '@shared/constants.js';
import { getItemIcon, isSeed } from './ItemIcons.js';

const WEATHER_ICONS = { 0: 'Sunny', 1: 'Cloudy', 2: 'Rainy', 3: 'Stormy', 4: 'Snowy' };
const DEFAULT_TOOLS = ['hoe', 'watering_can', 'pickaxe', 'axe', 'fishing_rod'];
const SLOT_COUNT = 10;
const KEYBIND_LABELS = ['1','2','3','4','5','6','7','8','9','0'];

export class HUD {
  constructor(container) {
    this.container = container;
    this.activeSlot = 0;
    this.onSlotSelect = null;

    // Action bar data: array of { itemId, quantity? } or null
    this.actionBarSlots = new Array(SLOT_COUNT).fill(null);

    this.container.innerHTML = `
      <div class="hud-group" id="hud-stats">
        <div class="hud-item" id="hud-coins">Coins: 500</div>
        <div class="hud-item" id="hud-level">Lv 1</div>
        <div class="hud-item" id="hud-energy">Energy: 100</div>
        <div class="hud-item" id="hud-skills"></div>
      </div>
      <div class="hud-group" id="hud-time">
        <div class="hud-item" id="hud-map"></div>
        <div class="hud-item" id="hud-season">Spring</div>
        <div class="hud-item" id="hud-day">Day 1</div>
        <div class="hud-item" id="hud-clock">6:00 AM</div>
        <div class="hud-item" id="hud-weather">Sunny</div>
      </div>
    `;

    // Build action bar
    this.actionbar = document.createElement('div');
    this.actionbar.className = 'actionbar';
    for (let i = 0; i < SLOT_COUNT; i++) {
      const slot = document.createElement('div');
      slot.className = 'actionbar-slot' + (i === 0 ? ' active' : '');
      slot.dataset.slot = i;
      slot.innerHTML = `<span class="keybind">${KEYBIND_LABELS[i]}</span>`;
      slot.addEventListener('click', () => this.selectSlot(i));

      // Right-click clears slot
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.actionBarSlots[i] = null;
        this._renderSlot(i);
      });

      // Drag-and-drop: accept items from backpack
      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        slot.classList.add('drag-over');
      });
      slot.addEventListener('dragleave', () => {
        slot.classList.remove('drag-over');
      });
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        const itemId = e.dataTransfer.getData('text/plain');
        if (itemId) {
          this.actionBarSlots[i] = { itemId };
          this._renderSlot(i);
        }
      });

      this.actionbar.appendChild(slot);
    }
    document.getElementById('ui-overlay').appendChild(this.actionbar);

    // Wheel scroll on action bar cycles slots
    this.actionbar.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      this.selectSlot((this.activeSlot + dir + SLOT_COUNT) % SLOT_COUNT);
    });
  }

  /** Pre-fill action bar: tools in slots 0-4, seeds starting slot 5 */
  initActionBar(inventory) {
    // Slots 0-4: default tools
    for (let i = 0; i < DEFAULT_TOOLS.length; i++) {
      this.actionBarSlots[i] = { itemId: DEFAULT_TOOLS[i] };
    }

    // Slots 5+: fill with seeds from inventory
    let slotIdx = 5;
    if (inventory) {
      for (const item of inventory) {
        if (slotIdx >= SLOT_COUNT) break;
        if (isSeed(item.itemId)) {
          this.actionBarSlots[slotIdx] = { itemId: item.itemId, quantity: item.quantity };
          slotIdx++;
        }
      }
    }

    this._renderAllSlots();
  }

  /** Returns the item in the currently selected slot, or null */
  getActiveItem() {
    return this.actionBarSlots[this.activeSlot];
  }

  selectSlot(index) {
    if (index < 0 || index >= SLOT_COUNT) return;
    this.activeSlot = index;
    const slots = this.actionbar.querySelectorAll('.actionbar-slot');
    slots.forEach((s, i) => s.classList.toggle('active', i === index));
    if (this.onSlotSelect) this.onSlotSelect(index);
  }

  /** Add item to the first empty slot (for right-click quick-add from backpack) */
  addToFirstEmptySlot(itemId) {
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (!this.actionBarSlots[i]) {
        this.actionBarSlots[i] = { itemId };
        this._renderSlot(i);
        return true;
      }
    }
    return false;
  }

  /** Sync seed quantities from server inventory */
  syncQuantities(inventory) {
    if (!inventory) return;
    const qtyMap = new Map();
    for (const item of inventory) {
      const existing = qtyMap.get(item.itemId) || 0;
      qtyMap.set(item.itemId, existing + item.quantity);
    }
    for (let i = 0; i < SLOT_COUNT; i++) {
      const slot = this.actionBarSlots[i];
      if (slot && isSeed(slot.itemId)) {
        slot.quantity = qtyMap.get(slot.itemId) || 0;
        this._renderSlot(i);
      }
    }
  }

  /** Update map name indicator */
  updateMap(mapId) {
    const el = document.getElementById('hud-map');
    if (el) {
      const names = { farm: 'Farm', town: 'Town Square' };
      el.textContent = names[mapId] || mapId;
    }
  }

  _renderSlot(index) {
    const slotEl = this.actionbar.children[index];
    if (!slotEl) return;
    const data = this.actionBarSlots[index];
    const keybind = `<span class="keybind">${KEYBIND_LABELS[index]}</span>`;

    if (!data) {
      slotEl.innerHTML = keybind;
      return;
    }

    const icon = getItemIcon(data.itemId);
    let html = keybind + `<span>${icon.emoji}</span>`;
    if (data.quantity !== undefined && data.quantity > 0) {
      html += `<span class="slot-qty">${data.quantity}</span>`;
    }
    slotEl.innerHTML = html;
  }

  _renderAllSlots() {
    for (let i = 0; i < SLOT_COUNT; i++) {
      this._renderSlot(i);
    }
  }

  updateStats(data) {
    if (data.coins !== undefined) document.getElementById('hud-coins').textContent = `Coins: ${data.coins}`;
    if (data.level !== undefined) document.getElementById('hud-level').textContent = `Lv ${data.level}`;
    if (data.energy !== undefined) {
      const max = data.maxEnergy || 100;
      document.getElementById('hud-energy').textContent = `Energy: ${Math.floor(data.energy)}/${max}`;
    }
    if (data.skills) {
      const el = document.getElementById('hud-skills');
      if (el) {
        const labels = { farming: 'Fa', fishing: 'Fi', mining: 'Mi', foraging: 'Fo', combat: 'Co' };
        const text = Object.entries(data.skills)
          .map(([name, s]) => `${labels[name] || name[0].toUpperCase()}:${s.level}`)
          .join(' ');
        el.textContent = text;
      }
    }
  }

  updateTime(data) {
    this._lastTime = data;
    if (data.season !== undefined) document.getElementById('hud-season').textContent = SEASON_NAMES[data.season];
    if (data.day !== undefined) document.getElementById('hud-day').textContent = `Day ${data.day}`;
    if (data.hour !== undefined) {
      const h = Math.floor(data.hour);
      const m = Math.floor((data.hour - h) * 60);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      document.getElementById('hud-clock').textContent = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
    }
  }

  updateWeather(weather) {
    document.getElementById('hud-weather').textContent = WEATHER_ICONS[weather] || 'Sunny';
  }
}
