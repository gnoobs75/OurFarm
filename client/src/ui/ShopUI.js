// client/src/ui/ShopUI.js
// Shop modal with buy/sell tabs for NPC merchants.

export class ShopUI {
  constructor() {
    this.visible = false;
    this.onBuy = null;  // (itemId, quantity) => void
    this.onSell = null; // (itemId, quantity) => void
    this.currentTab = 'buy';
    this.shopItems = [];
    this.playerInventory = [];
    this._npcName = '';

    this.el = document.createElement('div');
    this.el.id = 'shop-panel';
    this.el.className = 'panel hidden';
    document.getElementById('ui-overlay').appendChild(this.el);
  }

  show(npcName, shopItems, playerInventory) {
    this.visible = true;
    this.shopItems = shopItems || [];
    this.playerInventory = playerInventory || [];
    this._npcName = npcName;
    this.currentTab = 'buy';
    this.el.className = 'panel';
    this._render();
  }

  hide() {
    this.visible = false;
    this.el.className = 'panel hidden';
  }

  updateInventory(inventory) {
    this.playerInventory = inventory;
    if (this.visible && this.currentTab === 'sell') {
      this._renderSellList();
    }
  }

  _render() {
    this.el.innerHTML = `
      <div class="shop-header">
        <span class="shop-title">${this._npcName}'s Shop</span>
        <span class="shop-close">&times;</span>
      </div>
      <div class="shop-tabs">
        <div class="shop-tab active" data-tab="buy">Buy</div>
        <div class="shop-tab" data-tab="sell">Sell</div>
      </div>
      <div class="shop-items" id="shop-item-list"></div>
    `;

    this.el.querySelector('.shop-close').addEventListener('click', () => this.hide());

    this.el.querySelectorAll('.shop-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.currentTab = tab.dataset.tab;
        this.el.querySelectorAll('.shop-tab').forEach(t =>
          t.classList.toggle('active', t === tab)
        );
        if (this.currentTab === 'buy') this._renderBuyList();
        else this._renderSellList();
      });
    });

    this._renderBuyList();
  }

  _renderBuyList() {
    const list = this.el.querySelector('#shop-item-list');
    if (!this.shopItems || this.shopItems.length === 0) {
      list.innerHTML = '<div class="shop-empty">Nothing for sale</div>';
      return;
    }
    list.innerHTML = this.shopItems.map(item => `
      <div class="shop-item">
        <span class="shop-item-name">${item.name}</span>
        <span class="shop-item-price">${item.price}g</span>
        <button class="shop-buy-btn" data-item="${item.itemId}" data-price="${item.price}">Buy</button>
      </div>
    `).join('');

    list.querySelectorAll('.shop-buy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.onBuy) this.onBuy(btn.dataset.item, 1);
      });
    });
  }

  _renderSellList() {
    const list = this.el.querySelector('#shop-item-list');
    const sellable = (this.playerInventory || []).filter(i => !i.itemId.endsWith('_seed'));
    if (sellable.length === 0) {
      list.innerHTML = '<div class="shop-empty">Nothing to sell</div>';
      return;
    }
    list.innerHTML = sellable.map(item => {
      const displayName = item.itemId.replace(/_/g, ' ');
      return `
        <div class="shop-item">
          <span class="shop-item-name">${displayName} x${item.quantity}</span>
          <button class="shop-sell-btn" data-item="${item.itemId}">Sell</button>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.shop-sell-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.onSell) this.onSell(btn.dataset.item, 1);
      });
    });
  }
}
