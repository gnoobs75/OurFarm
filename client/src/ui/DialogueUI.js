// client/src/ui/DialogueUI.js
export class DialogueUI {
  constructor(container) {
    this.container = container;
    this.visible = false;
    this.onChoice = null;
    this.onGiftRequest = null;
    this._npcId = null;
  }

  show(npcName, text, choices = []) {
    this.visible = true;
    this.container.className = 'panel';
    this.container.innerHTML = `
      <div class="dialogue-name">${npcName}</div>
      <div class="dialogue-text">${text}</div>
      ${choices.length ? '<div class="dialogue-choices">' + choices.map((c, i) =>
        `<div class="dialogue-choice" data-idx="${i}">${c}</div>`
      ).join('') + '</div>' : ''}
      <div class="dialogue-choices">
        <div class="dialogue-choice dialogue-gift-btn">\uD83C\uDF81 Give Gift</div>
      </div>
      <div class="dialogue-text" style="color:#888;font-size:12px">Click anywhere to close</div>
    `;

    // Choice handlers
    this.container.querySelectorAll('.dialogue-choice:not(.dialogue-gift-btn)').forEach(el => {
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

    // Click to close (on background, not on buttons)
    setTimeout(() => {
      const closeHandler = (e) => {
        if (e.target.closest('.dialogue-choice')) return;
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
