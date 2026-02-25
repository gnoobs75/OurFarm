// client/src/ui/SelectionManager.js
// Hover indicator, entity tooltips, and context menus.

import * as THREE from 'three';
import { SEASON_NAMES, STAGE_NAMES } from '@shared/constants.js';

const ENTITY_ACTIONS = {
  animal:  ['Feed', 'Collect', 'Pet'],
  pet:     ['Pet', 'Groom'],
  npc:     ['Talk', 'Gift'],
  machine: ['Insert Item', 'Collect Output'],
  crop:    ['Harvest'],
  forage:  ['Collect'],
};

export class SelectionManager {
  constructor(scene, renderers, network, options = {}) {
    this.scene = scene;
    this.renderers = renderers; // { npcs, animals, pets, machines, crops, forage }
    this.network = network;
    this._cropsData = options.cropsData || {};
    this._getTime = options.getTime || (() => null);

    // Hover ring
    this._hoverRing = this._createHoverRing();
    this.scene.add(this._hoverRing);

    // HTML elements
    this._tooltip = document.getElementById('entity-tooltip');
    this._contextMenu = document.getElementById('context-menu');
    this._contextMenuVisible = false;
    this._hoverTime = 0;

    this.onGroom = null;
    this._contextEntity = null;

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
      const data = entry?.mesh?.userData || {};
      const name = data.name || 'Villager';
      const role = data.role || 'Villager';
      return { type: 'npc', id: npcId, name, detail: role };
    }

    // Animals
    const animalId = this.renderers.animals.getAnimalAtPosition(x, z);
    if (animalId) {
      const entry = this.renderers.animals.animalMeshes.get(animalId);
      const data = entry?.data || {};
      const name = data.name || data.type || 'Animal';
      const detail = [];
      if (data.type) detail.push(data.type.charAt(0).toUpperCase() + data.type.slice(1));
      if (data.happiness !== undefined) detail.push(`Happiness: ${data.happiness}/10`);
      if (data.productReady) detail.push('Product ready!');
      return { type: 'animal', id: animalId, name, detail: detail.join(' \u00B7 ') };
    }

    // Pets
    const petId = this.renderers.pets.getPetAtPosition(x, z);
    if (petId) {
      const entry = this.renderers.pets.petMeshes.get(petId);
      const data = entry?.data || {};
      const name = data.name || 'Pet';
      const type = data.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1) : 'Pet';
      const affection = data.affection !== undefined ? ` \u00B7 \u2764\uFE0F ${data.affection}/10` : '';
      return { type: 'pet', id: petId, name, detail: type + affection };
    }

    // Machines
    const machineId = this.renderers.machines.getMachineAtPosition(x, z);
    if (machineId) {
      const entry = this.renderers.machines.machineMeshes.get(machineId);
      const data = entry?.data || {};
      let detail;
      if (data.processing?.ready) {
        detail = '\u2705 Ready to collect';
      } else if (data.processing) {
        detail = '\u2699\uFE0F Processing...';
      } else {
        detail = 'Empty';
      }
      const typeName = (data.type || 'Machine').replace(/_/g, ' ');
      return { type: 'machine', id: machineId, name: typeName, detail };
    }

    // Crops
    const cropData = this.renderers.crops.getCropAtPosition(x, z);
    if (cropData) {
      const staticData = this._cropsData[cropData.cropType] || {};
      return {
        type: 'crop',
        id: cropData.id,
        name: staticData.name || cropData.cropType,
        cropData,
        staticData,
      };
    }

    return null;
  }

  _showTooltip(entity, screenPos) {
    if (!this._tooltip) return;

    let html;
    if (entity.type === 'crop') {
      html = this._buildCropTooltipHTML(entity);
      this._tooltip.classList.add('tooltip-rich');
    } else {
      html = `
        <div class="tooltip-name">${entity.name}</div>
        ${entity.detail ? `<div class="tooltip-detail">${entity.detail}</div>` : ''}
      `;
      this._tooltip.classList.remove('tooltip-rich');
    }

    this._tooltip.innerHTML = html;
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
    this._contextEntity = entity;

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
        if (action === 'Harvest' && this._contextEntity?.cropData) {
          net.sendHarvest(this._contextEntity.cropData.tileX, this._contextEntity.cropData.tileZ);
        }
        break;
      case 'forage':
        // Forage collect uses tile coords
        break;
    }
  }

  _buildCropTooltipHTML(entity) {
    const { cropData, staticData } = entity;
    const stage = cropData.stage;
    const stageName = STAGE_NAMES[stage] || 'Unknown';

    // Overall progress: stage contributes 0-3, growth within stage 0-1
    const overallProgress = Math.min(1, (stage + cropData.growth) / 3);
    const pctText = Math.round(overallProgress * 100);

    // Status indicators
    const watered = cropData.watered ? '\uD83D\uDCA7 Watered' : '\uD83C\uDF35 Needs water';
    let fertLine = '';
    if (cropData.fertilizer) {
      const fertNames = {
        fertilizer_basic: 'Basic Fertilizer',
        fertilizer_quality: 'Quality Fertilizer',
        speed_gro: 'Speed-Gro (+10%)',
        deluxe_speed_gro: 'Deluxe Speed-Gro (+25%)',
      };
      fertLine = `<div class="tooltip-detail">\uD83E\uDDEA ${fertNames[cropData.fertilizer] || cropData.fertilizer}</div>`;
    }

    // Projected maturity
    let maturityLine = '';
    if (stage < 3 && staticData.growthTime) {
      const time = this._getTime();
      if (time) {
        const remaining = this._estimateRemainingHours(cropData, staticData);
        const daysLeft = Math.ceil(remaining / 24);
        const projDay = (time.day || 1) + daysLeft;
        const season = SEASON_NAMES[time.season] || '';
        maturityLine = `<div class="tooltip-detail">\uD83D\uDCC5 Matures: ~Day ${projDay} ${season}</div>`;
      }
    } else if (stage >= 3) {
      maturityLine = `<div class="tooltip-detail" style="color:#7fda4f;">\u2705 Ready to harvest!</div>`;
    }

    // Season info
    const seasons = (staticData.season || []).map(s => SEASON_NAMES[s]).join(', ');

    // Sell price and regrow info
    const sellLine = staticData.sellPrice ? `Sells: ${staticData.sellPrice}g` : '';
    const regrowLine = staticData.regrows ? ' \u00B7 Regrows' : '';

    return `
      <div class="tooltip-name">${entity.name}</div>
      <div class="tooltip-detail">${stageName} (${stage + 1}/4)</div>
      <div class="tooltip-progress">
        <div class="tooltip-progress-bar" style="width:${pctText}%"></div>
      </div>
      <div class="tooltip-detail tooltip-pct">${pctText}% grown</div>
      <div class="tooltip-divider"></div>
      <div class="tooltip-detail">${watered}</div>
      ${fertLine}
      <div class="tooltip-divider"></div>
      ${maturityLine}
      <div class="tooltip-detail">\uD83C\uDF3F ${seasons}</div>
      <div class="tooltip-detail">${sellLine}${regrowLine}</div>
    `;
  }

  _estimateRemainingHours(cropData, staticData) {
    const totalGrowthHours = staticData.growthTime * 24;
    const progressPerHour = 3 / totalGrowthHours;
    const rate = cropData.watered ? 1.5 : 1.0;
    let speedMult = 1;
    if (cropData.fertilizer) {
      const FERT_SPEED = { speed_gro: 0.10, deluxe_speed_gro: 0.25 };
      speedMult += FERT_SPEED[cropData.fertilizer] || 0;
    }
    const stagesLeft = (3 - cropData.stage) - cropData.growth;
    const hoursLeft = stagesLeft / (progressPerHour * rate * speedMult);
    return Math.max(0, hoursLeft);
  }

  dispose() {
    document.removeEventListener('pointerdown', this._onDocClick, true);
    this.scene.remove(this._hoverRing);
    this._hoverRing.geometry.dispose();
    this._hoverRing.material.dispose();
  }
}
