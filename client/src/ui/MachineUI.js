// client/src/ui/MachineUI.js
// Lightweight item picker shown when inserting items into a processing machine.

export class MachineUI {
  constructor() {
    this._el = document.createElement('div');
    this._el.id = 'machine-ui';
    this._el.className = 'machine-ui hidden';
    document.getElementById('ui-overlay').appendChild(this._el);

    this.onItemSelected = null; // (machineId, itemId) => void
    this._currentMachineId = null;

    // Close on outside click
    this._onDocClick = (e) => {
      if (!this._el.classList.contains('hidden') && !this._el.contains(e.target)) {
        this.hide();
      }
    };
    document.addEventListener('pointerdown', this._onDocClick, true);
  }

  /**
   * Show the item picker for a machine.
   * @param {string} machineId
   * @param {string} machineType - e.g. 'keg', 'preserves_jar'
   * @param {object} machinesData - full machines.json data
   * @param {Array} inventory - player inventory [{itemId, quantity, quality}]
   * @param {object} cropsData - crops.json data (for category matching)
   * @param {{x: number, y: number}} screenPos - position to show near
   */
  show(machineId, machineType, machinesData, inventory, cropsData, screenPos) {
    this._currentMachineId = machineId;
    const machineInfo = machinesData[machineType];
    if (!machineInfo) { this.hide(); return; }

    // Build list of valid input items from inventory
    const validItems = [];
    const seen = new Set();
    for (const slot of inventory) {
      if (!slot || !slot.itemId || slot.quantity <= 0) continue;
      if (seen.has(slot.itemId)) continue;
      // Check each recipe for this machine
      for (const recipe of Object.values(machineInfo.recipes)) {
        if (recipe.input && recipe.input === slot.itemId) {
          validItems.push(slot);
          seen.add(slot.itemId);
          break;
        }
        if (recipe.inputCategory === 'crop' && cropsData[slot.itemId]) {
          validItems.push(slot);
          seen.add(slot.itemId);
          break;
        }
      }
    }

    if (validItems.length === 0) {
      this._el.innerHTML = `
        <div class="machine-ui-header">${machineInfo.name}</div>
        <div class="machine-ui-empty">No valid items in inventory</div>
      `;
    } else {
      const itemBtns = validItems.map(item => {
        const name = (item.itemId || '').replace(/_/g, ' ');
        const capName = name.charAt(0).toUpperCase() + name.slice(1);
        return `<button class="machine-ui-item" data-item="${item.itemId}">${capName} x${item.quantity}</button>`;
      }).join('');

      this._el.innerHTML = `
        <div class="machine-ui-header">${machineInfo.name}</div>
        <div class="machine-ui-list">${itemBtns}</div>
      `;
    }

    // Position near click
    this._el.style.left = (screenPos?.x || 200) + 'px';
    this._el.style.top = (screenPos?.y || 200) + 'px';
    this._el.classList.remove('hidden');

    // Clamp to viewport
    requestAnimationFrame(() => {
      const rect = this._el.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        this._el.style.left = (window.innerWidth - rect.width - 8) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        this._el.style.top = (window.innerHeight - rect.height - 8) + 'px';
      }
    });

    // Wire item clicks
    this._el.querySelectorAll('.machine-ui-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemId = btn.dataset.item;
        if (this.onItemSelected) {
          this.onItemSelected(this._currentMachineId, itemId);
        }
        this.hide();
      });
    });
  }

  hide() {
    this._el.classList.add('hidden');
    this._el.innerHTML = '';
    this._currentMachineId = null;
  }

  dispose() {
    document.removeEventListener('pointerdown', this._onDocClick, true);
    this._el.remove();
  }
}
