// client/src/ui/SelectionManager.js
// Hover indicator, entity tooltips, and context menus.

import * as THREE from 'three';

const ENTITY_ACTIONS = {
  animal:  ['Feed', 'Collect', 'Pet'],
  pet:     ['Pet', 'Groom'],
  npc:     ['Talk', 'Gift'],
  machine: ['Insert Item', 'Collect Output'],
  crop:    ['Harvest'],
  forage:  ['Collect'],
};

export class SelectionManager {
  constructor(scene, renderers, network) {
    this.scene = scene;
    this.renderers = renderers; // { npcs, animals, pets, machines, crops, forage }
    this.network = network;

    // Hover ring
    this._hoverRing = this._createHoverRing();
    this.scene.add(this._hoverRing);

    // HTML elements
    this._tooltip = document.getElementById('entity-tooltip');
    this._contextMenu = document.getElementById('context-menu');
    this._contextMenuVisible = false;
    this._hoverTime = 0;

    this.onGroom = null;

    // Close context menu on click outside
    this._onDocClick = (e) => {
      if (this._contextMenuVisible && !this._contextMenu.contains(e.target)) {
        this.hideContextMenu();
      }
    };
    document.addEventListener('pointerdown', this._onDocClick, true);
  }

  _createHoverRing() {
    const geo = new THREE.RingGeometry(0.42, 0.5, 16);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf5d142,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.y = 0.02;
    ring.visible = false;
    return ring;
  }

  updateHover({ tile, worldPos, screenPos }) {
    // Position hover ring at tile center
    this._hoverRing.visible = true;
    this._hoverRing.position.x = tile.x + 0.5;
    this._hoverRing.position.z = tile.z + 0.5;

    // Pulse opacity
    this._hoverTime += 0.05;
    this._hoverRing.material.opacity = 0.35 + Math.sin(this._hoverTime) * 0.15;

    // Entity detection for tooltip
    const entity = this.getEntityAt(worldPos);
    if (entity && screenPos) {
      this._showTooltip(entity, screenPos);
    } else {
      this._hideTooltip();
    }
  }

  getEntityAt(worldPos) {
    const x = worldPos.x;
    const z = worldPos.z;

    // NPCs
    const npcId = this.renderers.npcs.getNPCAtPosition(x, z);
    if (npcId) {
      const entry = this.renderers.npcs.npcMeshes.get(npcId);
      const name = entry?.mesh?.userData?.name || 'Villager';
      return { type: 'npc', id: npcId, name, detail: 'Villager' };
    }

    // Animals
    const animalId = this.renderers.animals.getAnimalAtPosition(x, z);
    if (animalId) {
      const entry = this.renderers.animals.animalMeshes.get(animalId);
      const data = entry?.data || {};
      const name = data.name || data.type || 'Animal';
      const detail = data.happiness !== undefined ? `Happiness: ${data.happiness}/10` : data.type;
      return { type: 'animal', id: animalId, name, detail };
    }

    // Pets
    const petId = this.renderers.pets.getPetAtPosition(x, z);
    if (petId) {
      const entry = this.renderers.pets.petMeshes.get(petId);
      const name = entry?.mesh?.userData?.name || entry?.data?.name || 'Pet';
      return { type: 'pet', id: petId, name, detail: entry?.data?.type || 'Pet' };
    }

    // Machines
    const machineId = this.renderers.machines.getMachineAtPosition(x, z);
    if (machineId) {
      const entry = this.renderers.machines.machineMeshes.get(machineId);
      const data = entry?.data || {};
      const detail = data.processing?.ready ? 'Ready to collect' : data.processing ? 'Processing...' : 'Empty';
      return { type: 'machine', id: machineId, name: data.type || 'Machine', detail };
    }

    return null;
  }

  _showTooltip(entity, screenPos) {
    if (!this._tooltip) return;
    this._tooltip.innerHTML = `
      <div class="tooltip-name">${entity.name}</div>
      ${entity.detail ? `<div class="tooltip-detail">${entity.detail}</div>` : ''}
    `;
    this._tooltip.style.left = (screenPos.x + 16) + 'px';
    this._tooltip.style.top = (screenPos.y - 10) + 'px';
    this._tooltip.classList.remove('hidden');
  }

  _hideTooltip() {
    if (this._tooltip) this._tooltip.classList.add('hidden');
  }

  hasContextMenu() {
    return this._contextMenuVisible;
  }

  showContextMenu(entity, screenPos) {
    if (!this._contextMenu) return;

    const actions = ENTITY_ACTIONS[entity.type] || [];
    if (actions.length === 0) return;

    this._contextMenu.innerHTML = actions.map(action =>
      `<button class="context-menu-btn" data-action="${action}" data-type="${entity.type}" data-id="${entity.id}">${action}</button>`
    ).join('');

    // Position near click
    this._contextMenu.style.left = screenPos.x + 'px';
    this._contextMenu.style.top = screenPos.y + 'px';
    this._contextMenu.classList.remove('hidden');
    this._contextMenuVisible = true;

    // Clamp to viewport
    requestAnimationFrame(() => {
      const rect = this._contextMenu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        this._contextMenu.style.left = (window.innerWidth - rect.width - 8) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        this._contextMenu.style.top = (window.innerHeight - rect.height - 8) + 'px';
      }
    });

    // Wire button clicks
    this._contextMenu.querySelectorAll('.context-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const type = e.target.dataset.type;
        const id = e.target.dataset.id;
        this._dispatchAction(type, id, action);
        this.hideContextMenu();
      });
    });
  }

  hideContextMenu() {
    if (this._contextMenu) {
      this._contextMenu.classList.add('hidden');
      this._contextMenu.innerHTML = '';
    }
    this._contextMenuVisible = false;
  }

  _dispatchAction(entityType, entityId, action) {
    const net = this.network;
    switch (entityType) {
      case 'npc':
        if (action === 'Talk') net.sendNPCTalk(entityId);
        if (action === 'Gift') net._giftTarget = entityId; // handled by UI flow
        break;
      case 'animal':
        if (action === 'Feed') net.sendAnimalFeed(entityId);
        if (action === 'Collect') net.sendAnimalCollect(entityId);
        if (action === 'Pet') net.sendAnimalFeed(entityId); // pet uses same action
        break;
      case 'pet':
        if (action === 'Pet') net.sendPetInteract(entityId, 'pet');
        if (action === 'Groom') {
          if (this.onGroom) this.onGroom(entityId);
        }
        break;
      case 'machine':
        if (action === 'Collect Output') net.sendMachineCollect(entityId);
        // 'Insert Item' requires active item — handled via existing HUD flow
        break;
      case 'crop':
        // Harvest uses tile coords — would need separate handling
        break;
      case 'forage':
        // Forage collect uses tile coords
        break;
    }
  }

  dispose() {
    document.removeEventListener('pointerdown', this._onDocClick, true);
    this.scene.remove(this._hoverRing);
    this._hoverRing.geometry.dispose();
    this._hoverRing.material.dispose();
  }
}
