// client/src/ui/DialogueUI.js

const TIER_NAMES = ['Basic', 'Copper', 'Iron', 'Gold', 'Iridium'];

export class DialogueUI {
  constructor(container) {
    this.container = container;
    this.visible = false;
    this.onChoice = null;
    this.onGiftRequest = null;
    this.onToolUpgrade = null;
    this._npcId = null;
  }

  show(npcName, text, choices = [], upgradeOptions = null) {
    this.visible = true;
    this.container.className = 'panel';

    let upgradeHTML = '';
    if (upgradeOptions && Object.keys(upgradeOptions).length > 0) {
      upgradeHTML = '<div class="dialogue-upgrades"><div class="dialogue-text" style="color:#ffcc00;font-size:13px;margin-top:8px">Tool Upgrades:</div>';
      for (const [tool, info] of Object.entries(upgradeOptions)) {
        const displayName = tool.replace(/_/g, ' ');
        const currentName = TIER_NAMES[info.currentTier];
        const nextName = TIER_NAMES[info.nextTier];
        upgradeHTML += `<div class="dialogue-choice dialogue-upgrade-btn" data-tool="${tool}" style="font-size:12px">` +
          `${displayName}: ${currentName} -> ${nextName} (${info.barQty}x ${info.bars.replace(/_/g, ' ')} + ${info.coins}g)</div>`;
      }
      upgradeHTML += '</div>';
    }

    this.container.innerHTML = `
      <div class="dialogue-name">${npcName}</div>
      <div class="dialogue-text">${text}</div>
      ${choices.length ? '<div class="dialogue-choices">' + choices.map((c, i) =>
        `<div class="dialogue-choice" data-idx="${i}">${c}</div>`
      ).join('') + '</div>' : ''}
      ${upgradeHTML}
      <div class="dialogue-choices">
        <div class="dialogue-choice dialogue-gift-btn">\uD83C\uDF81 Give Gift</div>
      </div>
      <div class="dialogue-text" style="color:#888;font-size:12px">Click anywhere to close</div>
    `;

    // Choice handlers
    this.container.querySelectorAll('.dialogue-choice:not(.dialogue-gift-btn):not(.dialogue-upgrade-btn)').forEach(el => {
      el.addEventListener('click', () => {
        if (this.onChoice) this.onChoice(parseInt(el.dataset.idx));
        this.hide();
      });
    });

    // Gift button handler
    const giftBtn = this.container.querySelector('.dialogue-gift-btn');
    if (giftBtn) {
      giftBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onGiftRequest) this.onGiftRequest(this._npcId);
      });
    }

    // Tool upgrade button handlers
    this.container.querySelectorAll('.dialogue-upgrade-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const tool = el.dataset.tool;
        if (this.onToolUpgrade) this.onToolUpgrade(tool);
        this.hide();
      });
    });

    // Click to close (on background, not on buttons)
    setTimeout(() => {
      const closeHandler = (e) => {
        if (e.target.closest('.dialogue-choice')) return;
        if (e.target.closest('.dialogue-upgrade-btn')) return;
        this.hide();
        document.removeEventListener('click', closeHandler);
      };
      document.addEventListener('click', closeHandler);
    }, 100);
  }

  hide() {
    this.visible = false;
    this.container.className = 'panel hidden';
  }
}
