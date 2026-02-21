// client/src/ui/HUD.js
// Heads-up display showing coins, XP, time, energy, toolbar.

import { SEASON_NAMES, WEATHER } from '@shared/constants.js';

const WEATHER_ICONS = { 0: 'Sunny', 1: 'Cloudy', 2: 'Rainy', 3: 'Stormy', 4: 'Snowy' };
const TOOL_NAMES = ['Hoe', 'Water', 'Pick', 'Axe', 'Rod', 'Seeds'];

export class HUD {
  constructor(container) {
    this.container = container;
    this.activeSlot = 0;
    this.onSlotSelect = null;

    this.container.innerHTML = `
      <div class="hud-group" id="hud-stats">
        <div class="hud-item" id="hud-coins">Coins: 500</div>
        <div class="hud-item" id="hud-level">Lv 1</div>
        <div class="hud-item" id="hud-xp">XP: 0</div>
        <div class="hud-item" id="hud-energy">Energy: 100</div>
      </div>
      <div class="hud-group" id="hud-time">
        <div class="hud-item" id="hud-season">Spring</div>
        <div class="hud-item" id="hud-day">Day 1</div>
        <div class="hud-item" id="hud-clock">6:00 AM</div>
        <div class="hud-item" id="hud-weather">Sunny</div>
      </div>
    `;

    // Toolbar at bottom
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'toolbar';
    for (let i = 0; i < TOOL_NAMES.length; i++) {
      const slot = document.createElement('div');
      slot.className = 'toolbar-slot' + (i === 0 ? ' active' : '');
      slot.textContent = TOOL_NAMES[i];
      slot.dataset.slot = i;
      slot.addEventListener('click', () => this.selectSlot(i));
      this.toolbar.appendChild(slot);
    }
    document.getElementById('ui-overlay').appendChild(this.toolbar);
  }

  selectSlot(index) {
    this.activeSlot = index;
    const slots = this.toolbar.querySelectorAll('.toolbar-slot');
    slots.forEach((s, i) => s.classList.toggle('active', i === index));
    if (this.onSlotSelect) this.onSlotSelect(index);
  }

  updateStats(data) {
    if (data.coins !== undefined) document.getElementById('hud-coins').textContent = `Coins: ${data.coins}`;
    if (data.level !== undefined) document.getElementById('hud-level').textContent = `Lv ${data.level}`;
    if (data.xp !== undefined) document.getElementById('hud-xp').textContent = `XP: ${data.xp}`;
    if (data.energy !== undefined) document.getElementById('hud-energy').textContent = `Energy: ${Math.floor(data.energy)}`;
  }

  updateTime(data) {
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
