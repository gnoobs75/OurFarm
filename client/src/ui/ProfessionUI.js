// client/src/ui/ProfessionUI.js
// Modal UI for choosing a profession at skill levels 5 and 10.

export class ProfessionUI {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'profession-panel';
    this.container.className = 'panel hidden';
    document.getElementById('ui-overlay').appendChild(this.container);
    this.visible = false;
    this.onChoice = null;
  }

  show(skill, level, options) {
    this.visible = true;
    this.container.classList.remove('hidden');
    this.container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'craft-header';
    header.innerHTML = `<span class="craft-title">Level ${level} ${skill.charAt(0).toUpperCase() + skill.slice(1)} — Choose Profession</span>`;
    this.container.appendChild(header);

    const grid = document.createElement('div');
    grid.style.cssText = 'display: flex; gap: 12px; padding: 12px; justify-content: center;';

    for (const option of options) {
      const card = document.createElement('div');
      card.style.cssText = 'background: rgba(0,0,0,0.6); border: 2px solid #666; border-radius: 8px; padding: 16px; width: 180px; cursor: pointer; text-align: center; transition: border-color 0.2s;';
      card.innerHTML = `
        <div style="font-size: 18px; font-weight: bold; color: #ffcc00; margin-bottom: 8px;">${option.name}</div>
        <div style="font-size: 13px; color: #ccc;">${option.description}</div>
      `;
      card.onmouseenter = () => card.style.borderColor = '#ffcc00';
      card.onmouseleave = () => card.style.borderColor = '#666';
      card.onclick = () => {
        if (this.onChoice) this.onChoice(skill, option.id);
        this.hide();
      };
      grid.appendChild(card);
    }

    this.container.appendChild(grid);
  }

  hide() {
    this.visible = false;
    this.container.classList.add('hidden');
  }
}
