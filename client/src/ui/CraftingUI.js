// client/src/ui/CraftingUI.js
// Crafting panel for building interaction — shows available recipes
// and current processing status.

import { getItemIcon } from './ItemIcons.js';

export class CraftingUI {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'crafting-panel';
    this.container.className = 'panel hidden';
    document.getElementById('ui-overlay').appendChild(this.container);
    this.visible = false;
    this.onCraftStart = null;
    this.onCraftCollect = null;
  }

  show(buildingId, buildingType, recipes, inventory, processing) {
    this.visible = true;
    this.container.classList.remove('hidden');
    this.container.innerHTML = '';

    // Header with close button
    const header = document.createElement('div');
    header.className = 'craft-header';
    const title = document.createElement('span');
    title.className = 'craft-title';
    title.textContent = buildingType.charAt(0).toUpperCase() + buildingType.slice(1);
    header.appendChild(title);
    const closeBtn = document.createElement('span');
    closeBtn.className = 'craft-close';
    closeBtn.textContent = '\u2715';
    closeBtn.onclick = () => this.hide();
    header.appendChild(closeBtn);
    this.container.appendChild(header);

    // If currently processing, show status
    if (processing) {
      const remaining = Math.max(0, Math.ceil((processing.endTime - Date.now()) / 60000));
      const statusDiv = document.createElement('div');
      statusDiv.className = 'craft-status';
      if (remaining <= 0) {
        statusDiv.textContent = 'Ready to collect!';
        const collectBtn = document.createElement('div');
        collectBtn.className = 'dialogue-choice';
        collectBtn.textContent = 'Collect';
        collectBtn.onclick = () => {
          if (this.onCraftCollect) this.onCraftCollect(buildingId);
          this.hide();
        };
        statusDiv.appendChild(collectBtn);
      } else {
        statusDiv.textContent = `Processing... ${remaining} min remaining`;
      }
      this.container.appendChild(statusDiv);
      return;
    }

    // Recipe list
    const available = Object.entries(recipes).filter(([, r]) => r.building === buildingType);
    if (available.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'craft-empty';
      empty.textContent = 'No recipes available.';
      this.container.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'craft-items';
    for (const [recipeId, recipe] of available) {
      const item = document.createElement('div');
      item.className = 'craft-item';

      const info = document.createElement('div');
      info.style.flex = '1';
      const outputIcon = getItemIcon(recipe.output);
      const nameDiv = document.createElement('div');
      nameDiv.textContent = `${outputIcon?.emoji || ''} ${recipe.name || recipe.output} x${recipe.count || 1}`;
      info.appendChild(nameDiv);

      const inputsDiv = document.createElement('div');
      inputsDiv.style.fontSize = '11px';
      inputsDiv.style.color = '#aaa';
      const inputParts = Object.entries(recipe.inputs).map(([id, qty]) => {
        const icon = getItemIcon(id);
        const has = inventory.find(i => i.itemId === id)?.quantity || 0;
        const color = has >= qty ? '#aaffaa' : '#ffaaaa';
        return `<span style="color:${color}">${icon?.emoji || ''} ${id} x${qty}</span>`;
      });
      inputsDiv.innerHTML = inputParts.join(' + ');
      info.appendChild(inputsDiv);

      const timeDiv = document.createElement('div');
      timeDiv.style.fontSize = '11px';
      timeDiv.style.color = '#888';
      timeDiv.textContent = `${recipe.time}h`;
      info.appendChild(timeDiv);

      item.appendChild(info);

      const craftBtn = document.createElement('button');
      craftBtn.className = 'craft-btn';
      craftBtn.textContent = 'Craft';
      craftBtn.onclick = () => {
        if (this.onCraftStart) this.onCraftStart(buildingId, recipeId);
        this.hide();
      };
      item.appendChild(craftBtn);
      list.appendChild(item);
    }
    this.container.appendChild(list);
  }

  hide() {
    this.visible = false;
    this.container.classList.add('hidden');
  }
}
