// client/src/ui/SplashScreen.js
// Character customization splash screen with live 3D preview.

import * as THREE from 'three';
import { AssetGenerator } from '../engine/AssetGenerator.js';

const COLOR_PALETTES = {
  shirt: [0x4488ff, 0xcc3333, 0x33aa55, 0x8844aa, 0xff8833, 0xee6699, 0x8b6b4a, 0xeeeeee],
  pants: [0x223355, 0x222222, 0x5c3a1e, 0x666666, 0xb8a070, 0x2d5a1e, 0x883333, 0x1a2a4a],
  hair:  [0x5c3a1e, 0x111111, 0xdaa520, 0xaa3322, 0x888888, 0xeeeeee, 0x3355aa, 0xee6699],
  skin:  [0xffe0bd, 0xf5cba7, 0xd4a574, 0xc68642, 0x8d5524, 0xd5b882, 0xfce4d6, 0xe8b88a],
};

const HAIR_STYLES = ['round', 'spiked', 'long'];
const EYE_STYLES = ['dots', 'ovals', 'closed'];
const MOUTH_STYLES = ['smile', 'neutral', 'open'];

export class SplashScreen {
  constructor() {
    // Use a separate AssetGenerator so cached materials don't
    // cross WebGL contexts (preview vs main game renderer).
    this.assetGen = new AssetGenerator();
    this.appearance = {
      skinColor: COLOR_PALETTES.skin[0],
      shirtColor: COLOR_PALETTES.shirt[0],
      pantsColor: COLOR_PALETTES.pants[0],
      hairColor: COLOR_PALETTES.hair[0],
      hairStyle: 'round',
      eyeStyle: 'dots',
      mouthStyle: 'smile',
    };
    this.name = 'Farmer';
    this._previewMesh = null;
  }

  show() {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._buildDOM();
      this._setupPreview();
      this._startPreviewLoop();
    });
  }

  _buildDOM() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'splash-overlay';
    this.overlay.innerHTML = `
      <div class="splash-card">
        <div class="splash-header">
          <h1 class="splash-title">OurFarm</h1>
          <p class="splash-subtitle">Create Your Farmer</p>
        </div>
        <div class="splash-body">
          <div class="splash-preview">
            <canvas id="splash-preview-canvas"></canvas>
          </div>
          <div class="splash-options">
            <div class="splash-field">
              <label class="splash-label">Name</label>
              <input type="text" class="splash-input" id="splash-name" value="Farmer" maxlength="16" spellcheck="false" />
            </div>
            ${this._buildPalette('Skin', 'skin')}
            ${this._buildPalette('Shirt', 'shirt')}
            ${this._buildPalette('Pants', 'pants')}
            ${this._buildPalette('Hair Color', 'hair')}
            ${this._buildStylePicker('Hair Style', 'hair', HAIR_STYLES)}
            ${this._buildStylePicker('Eyes', 'eye', EYE_STYLES)}
            ${this._buildStylePicker('Mouth', 'mouth', MOUTH_STYLES)}
          </div>
        </div>
        <button class="splash-start" id="splash-start">Start Farming!</button>
      </div>
    `;

    document.body.appendChild(this.overlay);

    // Wire events
    const nameInput = this.overlay.querySelector('#splash-name');
    nameInput.addEventListener('input', () => { this.name = nameInput.value || 'Farmer'; });
    nameInput.focus();

    // Color palettes
    for (const key of ['skin', 'shirt', 'pants', 'hair']) {
      const swatches = this.overlay.querySelectorAll(`.swatch-${key}`);
      swatches.forEach((el, i) => {
        el.addEventListener('click', () => {
          swatches.forEach(s => s.classList.remove('active'));
          el.classList.add('active');
          const colorKey = key === 'skin' ? 'skinColor'
            : key === 'shirt' ? 'shirtColor'
            : key === 'pants' ? 'pantsColor'
            : 'hairColor';
          this.appearance[colorKey] = COLOR_PALETTES[key][i];
          this._refreshPreview();
        });
      });
    }

    // Style pickers
    for (const [prefix, styles, appKey] of [
      ['hair', HAIR_STYLES, 'hairStyle'],
      ['eye', EYE_STYLES, 'eyeStyle'],
      ['mouth', MOUTH_STYLES, 'mouthStyle'],
    ]) {
      const btns = this.overlay.querySelectorAll(`.style-${prefix}`);
      btns.forEach((el, i) => {
        el.addEventListener('click', () => {
          btns.forEach(b => b.classList.remove('active'));
          el.classList.add('active');
          this.appearance[appKey] = styles[i];
          this._refreshPreview();
        });
      });
    }

    // Start button
    this.overlay.querySelector('#splash-start').addEventListener('click', () => {
      this._cleanup();
      this._resolve({ name: this.name, appearance: { ...this.appearance } });
    });

    // Enter key starts game
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this._cleanup();
        this._resolve({ name: this.name, appearance: { ...this.appearance } });
      }
    });
  }

  _buildPalette(label, key) {
    const swatches = COLOR_PALETTES[key].map((color, i) => {
      const hex = '#' + color.toString(16).padStart(6, '0');
      return `<div class="swatch swatch-${key}${i === 0 ? ' active' : ''}" style="background:${hex}" data-index="${i}"></div>`;
    }).join('');
    return `
      <div class="splash-field">
        <label class="splash-label">${label}</label>
        <div class="swatch-row">${swatches}</div>
      </div>
    `;
  }

  _buildStylePicker(label, prefix, styles) {
    const btns = styles.map((s, i) =>
      `<button class="style-btn style-${prefix}${i === 0 ? ' active' : ''}">${s}</button>`
    ).join('');
    return `
      <div class="splash-field">
        <label class="splash-label">${label}</label>
        <div class="style-row">${btns}</div>
      </div>
    `;
  }

  _setupPreview() {
    const canvas = this.overlay.querySelector('#splash-preview-canvas');
    this._previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this._previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._previewRenderer.setSize(220, 300);
    this._previewRenderer.setClearColor(0x000000, 0);

    this._previewScene = new THREE.Scene();

    // Lighting for preview
    this._previewScene.add(new THREE.AmbientLight(0xfff8ee, 0.7));
    const light = new THREE.DirectionalLight(0xffe0a0, 1.2);
    light.position.set(2, 4, 3);
    this._previewScene.add(light);
    this._previewScene.add(new THREE.HemisphereLight(0x88ccee, 0x4a7a2a, 0.3));

    // Camera — perspective for preview (more dynamic than ortho)
    this._previewCamera = new THREE.PerspectiveCamera(35, 220 / 300, 0.1, 20);
    this._previewCamera.position.set(0, 1.0, 3.2);
    this._previewCamera.lookAt(0, 0.7, 0);

    this._refreshPreview();
  }

  _refreshPreview() {
    if (this._previewMesh) {
      this._previewScene.remove(this._previewMesh);
    }
    this._previewMesh = this.assetGen.createPlayer(this.appearance);
    this._previewScene.add(this._previewMesh);
  }

  _startPreviewLoop() {
    this._previewRunning = true;
    const animate = () => {
      if (!this._previewRunning) return;
      requestAnimationFrame(animate);
      if (this._previewMesh) {
        this._previewMesh.rotation.y += 0.01;
      }
      this._previewRenderer.render(this._previewScene, this._previewCamera);
    };
    animate();
  }

  _cleanup() {
    this._previewRunning = false;
    if (this._previewRenderer) this._previewRenderer.dispose();
    if (this.assetGen) this.assetGen.dispose();
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  }
}
