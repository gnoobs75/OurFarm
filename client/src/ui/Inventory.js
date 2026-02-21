// client/src/ui/Inventory.js
export class InventoryUI {
  constructor(container) {
    this.container = container;
    this.items = [];
    this.visible = false;
    this.onItemSelect = null;
  }

  toggle() {
    this.visible = !this.visible;
    this.container.classList.toggle('hidden', !this.visible);
    if (this.visible) this.render();
  }

  update(inventory) {
    this.items = inventory;
    if (this.visible) this.render();
  }

  render() {
    this.container.className = 'panel' + (this.visible ? '' : ' hidden');
    this.container.innerHTML = '<h3 style="margin-bottom:8px">Inventory</h3><div class="inventory-grid"></div>';
    const grid = this.container.querySelector('.inventory-grid');

    for (const item of this.items) {
      const slot = document.createElement('div');
      slot.className = 'inventory-slot';
      slot.innerHTML = `<span style="font-size:11px">${item.itemId}</span><span class="count">${item.quantity}</span>`;
      slot.addEventListener('click', () => {
        if (this.onItemSelect) this.onItemSelect(item);
      });
      grid.appendChild(slot);
    }
  }
}
