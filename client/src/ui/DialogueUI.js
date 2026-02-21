// client/src/ui/DialogueUI.js
export class DialogueUI {
  constructor(container) {
    this.container = container;
    this.visible = false;
    this.onChoice = null;
  }

  show(npcName, text, choices = []) {
    this.visible = true;
    this.container.className = 'panel';
    this.container.innerHTML = `
      <div class="dialogue-name">${npcName}</div>
      <div class="dialogue-text">${text}</div>
      ${choices.length ? '<div class="dialogue-choices">' + choices.map((c, i) =>
        `<div class="dialogue-choice" data-idx="${i}">${c}</div>`
      ).join('') + '</div>' : '<div class="dialogue-text" style="color:#888;font-size:12px">Click anywhere to close</div>'}
    `;

    // Choice handlers
    this.container.querySelectorAll('.dialogue-choice').forEach(el => {
      el.addEventListener('click', () => {
        if (this.onChoice) this.onChoice(parseInt(el.dataset.idx));
        this.hide();
      });
    });

    // Click to close (if no choices)
    if (choices.length === 0) {
      setTimeout(() => {
        const closeHandler = () => { this.hide(); document.removeEventListener('click', closeHandler); };
        document.addEventListener('click', closeHandler);
      }, 100);
    }
  }

  hide() {
    this.visible = false;
    this.container.className = 'panel hidden';
  }
}
