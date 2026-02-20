# OurFarm Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a co-op farming simulation game with procedural 3D graphics, multiplayer support, and Stardew Valley-style social features.

**Architecture:** Authoritative Node.js server owns all game state and logic. Three.js client handles rendering and input only. Socket.io connects them in real-time. SQLite persists world state.

**Tech Stack:** Three.js, Node.js, Express, Socket.io, better-sqlite3, simplex-noise, Vite, @tweenjs/tween.js

---

## Phase 1: Project Scaffolding

### Task 1: Initialize project and install dependencies

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `client/index.html`
- Create: `client/src/main.js`
- Create: `server/index.js`
- Create: `shared/constants.js`

**Step 1: Initialize npm and install dependencies**

Run:
```bash
cd C:/Claude/OurFarm
npm init -y
npm install three socket.io socket.io-client express better-sqlite3 simplex-noise uuid @tweenjs/tween.js
npm install -D vite stats.js lil-gui
```

**Step 2: Create .gitignore**

```gitignore
node_modules/
dist/
*.db
.DS_Store
```

**Step 3: Create shared/constants.js**

```js
// shared/constants.js — Game constants used by both client and server

export const TILE_SIZE = 1;
export const WORLD_SIZE = 64;
export const TICK_RATE = 10; // server ticks per second
export const TIME_SCALE = 60; // 1 real second = 1 game minute

export const TILE_TYPES = {
  GRASS: 0,
  DIRT: 1,
  WATER: 2,
  STONE: 3,
  PATH: 4,
  SAND: 5,
  TILLED: 6,
};

export const SEASONS = {
  SPRING: 0,
  SUMMER: 1,
  FALL: 2,
  WINTER: 3,
};

export const SEASON_NAMES = ['Spring', 'Summer', 'Fall', 'Winter'];

export const DAYS_PER_SEASON = 28;
export const HOURS_PER_DAY = 24;
export const GAME_MINUTES_PER_HOUR = 60;

export const CROP_STAGES = {
  SEED: 0,
  SPROUT: 1,
  MATURE: 2,
  HARVESTABLE: 3,
};

export const WEATHER = {
  SUNNY: 0,
  CLOUDY: 1,
  RAINY: 2,
  STORMY: 3,
  SNOWY: 4,
};

export const FISH_RARITY = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 2,
  LEGENDARY: 3,
};

export const RELATIONSHIP_MAX = 10;

export const COLORS = {
  GRASS_SPRING: 0x7ec850,
  GRASS_SUMMER: 0x5da832,
  GRASS_FALL: 0xc4a332,
  GRASS_WINTER: 0xddeeff,
  DIRT: 0x8b6914,
  TILLED: 0x5c4a1e,
  WATER: 0x4a90d9,
  STONE: 0x888888,
  PATH: 0xc4a882,
  SAND: 0xe8d68c,
};

export const ACTIONS = {
  PLAYER_MOVE: 'player:move',
  PLAYER_JOIN: 'player:join',
  PLAYER_LEAVE: 'player:leave',
  FARM_TILL: 'farm:till',
  FARM_PLANT: 'farm:plant',
  FARM_WATER: 'farm:water',
  FARM_HARVEST: 'farm:harvest',
  FISH_CAST: 'fish:cast',
  FISH_REEL: 'fish:reel',
  NPC_TALK: 'npc:talk',
  NPC_GIFT: 'npc:gift',
  PET_INTERACT: 'pet:interact',
  CRAFT_START: 'craft:start',
  CRAFT_COLLECT: 'craft:collect',
  SHOP_BUY: 'shop:buy',
  SHOP_SELL: 'shop:sell',
  WORLD_STATE: 'world:state',
  WORLD_UPDATE: 'world:update',
  TIME_UPDATE: 'time:update',
  WEATHER_UPDATE: 'weather:update',
  INVENTORY_UPDATE: 'inventory:update',
  CHAT_MESSAGE: 'chat:message',
};
```

**Step 4: Create client/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>OurFarm</title>
  <link rel="stylesheet" href="/styles/game.css">
</head>
<body>
  <canvas id="game-canvas"></canvas>
  <div id="ui-overlay">
    <div id="hud"></div>
    <div id="inventory-panel" class="hidden"></div>
    <div id="dialogue-panel" class="hidden"></div>
    <div id="shop-panel" class="hidden"></div>
    <div id="quest-panel" class="hidden"></div>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

**Step 5: Create client/styles/game.css**

```css
/* client/styles/game.css */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  overflow: hidden;
  background: #000;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  touch-action: none;
}

#game-canvas {
  display: block;
  width: 100vw;
  height: 100vh;
}

#ui-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
}

#ui-overlay > * {
  pointer-events: auto;
}

#hud {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  color: #fff;
  font-size: 14px;
}

.hud-group {
  background: rgba(0, 0, 0, 0.6);
  border-radius: 8px;
  padding: 8px 12px;
  display: flex;
  gap: 12px;
  align-items: center;
}

.hud-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.hidden {
  display: none !important;
}

.panel {
  position: absolute;
  background: rgba(20, 15, 10, 0.9);
  border: 2px solid #8b6914;
  border-radius: 12px;
  padding: 16px;
  color: #fff;
}

#inventory-panel {
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
}

.inventory-grid {
  display: grid;
  grid-template-columns: repeat(9, 48px);
  gap: 4px;
}

.inventory-slot {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
}

.inventory-slot.selected {
  border-color: #ffcc00;
  background: rgba(255, 204, 0, 0.2);
}

.inventory-slot .count {
  position: absolute;
  bottom: 2px;
  right: 4px;
  font-size: 10px;
}

.toolbar {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
}

.toolbar-slot {
  width: 52px;
  height: 52px;
  background: rgba(20, 15, 10, 0.8);
  border: 2px solid rgba(139, 105, 20, 0.6);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  font-size: 11px;
  text-align: center;
}

.toolbar-slot.active {
  border-color: #ffcc00;
  background: rgba(255, 204, 0, 0.15);
}

#dialogue-panel {
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  width: min(500px, 90vw);
  min-height: 100px;
}

.dialogue-name {
  font-weight: bold;
  color: #ffcc00;
  margin-bottom: 8px;
}

.dialogue-text {
  line-height: 1.5;
  margin-bottom: 12px;
}

.dialogue-choices {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dialogue-choice {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  padding: 8px 12px;
  color: #fff;
  cursor: pointer;
  text-align: left;
}

.dialogue-choice:hover {
  background: rgba(255, 204, 0, 0.2);
  border-color: #ffcc00;
}

@media (max-width: 600px) {
  .inventory-grid {
    grid-template-columns: repeat(5, 44px);
  }
  .toolbar-slot {
    width: 44px;
    height: 44px;
  }
}
```

**Step 6: Create stub client/src/main.js**

```js
// client/src/main.js — Application entry point
console.log('OurFarm loading...');
```

**Step 7: Create stub server/index.js**

```js
// server/index.js — Server entry point
console.log('OurFarm server starting...');
```

**Step 8: Update package.json scripts**

Add to package.json scripts:
```json
{
  "scripts": {
    "dev:client": "vite client --open",
    "dev:server": "node --watch server/index.js",
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "build": "vite build client"
  }
}
```

Run: `npm install -D concurrently`

**Step 9: Create vite.config.js**

```js
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  resolve: {
    alias: {
      '@shared': '../shared',
    },
  },
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../dist',
  },
});
```

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with dependencies and config"
```

---

### Task 2: Three.js Scene Manager (client engine core)

**Files:**
- Create: `client/src/engine/SceneManager.js`

**Step 1: Implement SceneManager**

```js
// client/src/engine/SceneManager.js
// Manages the Three.js scene, isometric camera, renderer, and resize handling.

import * as THREE from 'three';
import { WORLD_SIZE, TILE_SIZE } from '@shared/constants.js';

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;

    // Renderer — antialiased, responsive
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x87ceeb); // Sky blue background

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87ceeb, 40, 80);

    // Isometric camera
    const aspect = window.innerWidth / window.innerHeight;
    const frustum = 16;
    this.camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect,
      frustum, -frustum,
      0.1, 200
    );
    // Position for isometric view (45° azimuth, ~35° elevation = true isometric)
    const isoAngle = Math.PI / 6; // 30 degrees elevation
    const isoDistance = 50;
    this.camera.position.set(
      isoDistance * Math.cos(isoAngle),
      isoDistance * Math.sin(isoAngle) + 10,
      isoDistance * Math.cos(isoAngle)
    );
    this.camera.lookAt(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);
    this.camera.zoom = 1.5;
    this.camera.updateProjectionMatrix();

    // Camera target (for panning)
    this.cameraTarget = new THREE.Vector3(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);

    // Lighting
    this._setupLighting();

    // Handle window resize
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);

    // Render loop callbacks
    this._updateCallbacks = [];

    // Raycaster for picking
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
  }

  _setupLighting() {
    // Ambient light — soft overall illumination
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    // Directional light — sun
    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 1.0);
    this.sunLight.position.set(30, 40, 20);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -40;
    this.sunLight.shadow.camera.right = 40;
    this.sunLight.shadow.camera.top = 40;
    this.sunLight.shadow.camera.bottom = -40;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 100;
    this.scene.add(this.sunLight);

    // Hemisphere light — sky/ground color blend
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x5da832, 0.3);
    this.scene.add(hemi);
  }

  /** Move camera to follow a world position */
  panTo(x, z) {
    this.cameraTarget.set(x, 0, z);
    const isoAngle = Math.PI / 6;
    const isoDistance = 50;
    this.camera.position.set(
      x + isoDistance * Math.cos(isoAngle),
      isoDistance * Math.sin(isoAngle) + 10,
      z + isoDistance * Math.cos(isoAngle)
    );
    this.camera.lookAt(this.cameraTarget);
  }

  /** Register a function to be called every frame with (deltaTime) */
  onUpdate(callback) {
    this._updateCallbacks.push(callback);
  }

  /** Convert screen coordinates to normalized device coords */
  screenToNDC(screenX, screenY) {
    this.mouse.x = (screenX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(screenY / window.innerHeight) * 2 + 1;
    return this.mouse;
  }

  /** Raycast from screen position to find intersected objects */
  raycast(screenX, screenY, objects) {
    this.screenToNDC(screenX, screenY);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  /** Raycast to a ground plane (y=0) and return world coordinates */
  screenToWorld(screenX, screenY) {
    this.screenToNDC(screenX, screenY);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, target);
    return target;
  }

  /** Main render loop */
  start() {
    const clock = new THREE.Clock();
    const animate = () => {
      requestAnimationFrame(animate);
      const delta = clock.getDelta();
      for (const cb of this._updateCallbacks) {
        cb(delta);
      }
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  _onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustum = 16;
    this.camera.left = -frustum * aspect;
    this.camera.right = frustum * aspect;
    this.camera.top = frustum;
    this.camera.bottom = -frustum;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Clean up */
  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
```

**Step 2: Commit**

```bash
git add client/src/engine/SceneManager.js
git commit -m "feat: Three.js SceneManager with isometric camera and lighting"
```

---

### Task 3: Input Manager (mouse/touch to tile coords)

**Files:**
- Create: `client/src/engine/InputManager.js`
- Create: `shared/TileMap.js`

**Step 1: Create shared/TileMap.js**

```js
// shared/TileMap.js — Grid math and coordinate utilities

import { TILE_SIZE, WORLD_SIZE } from './constants.js';

/** Convert world position to tile coordinates */
export function worldToTile(worldX, worldZ) {
  return {
    x: Math.floor(worldX / TILE_SIZE),
    z: Math.floor(worldZ / TILE_SIZE),
  };
}

/** Convert tile coordinates to world center position */
export function tileToWorld(tileX, tileZ) {
  return {
    x: tileX * TILE_SIZE + TILE_SIZE / 2,
    z: tileZ * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** Check if tile coordinates are within world bounds */
export function isValidTile(tileX, tileZ) {
  return tileX >= 0 && tileX < WORLD_SIZE && tileZ >= 0 && tileZ < WORLD_SIZE;
}

/** Get flat array index from tile coordinates */
export function tileIndex(tileX, tileZ) {
  return tileZ * WORLD_SIZE + tileX;
}

/** Get tile coordinates from flat array index */
export function indexToTile(index) {
  return {
    x: index % WORLD_SIZE,
    z: Math.floor(index / WORLD_SIZE),
  };
}

/** Manhattan distance between two tiles */
export function tileDistance(x1, z1, x2, z2) {
  return Math.abs(x1 - x2) + Math.abs(z1 - z2);
}

/** Get neighboring tile coords (4-directional) */
export function getNeighbors(tileX, tileZ) {
  return [
    { x: tileX - 1, z: tileZ },
    { x: tileX + 1, z: tileZ },
    { x: tileX, z: tileZ - 1 },
    { x: tileX, z: tileZ + 1 },
  ].filter(t => isValidTile(t.x, t.z));
}
```

**Step 2: Create InputManager**

```js
// client/src/engine/InputManager.js
// Handles mouse and touch input, converts screen coords to tile coords.

import { worldToTile } from '@shared/TileMap.js';

export class InputManager {
  constructor(sceneManager) {
    this.scene = sceneManager;
    this.canvas = sceneManager.canvas;

    // State
    this.hoveredTile = null;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.cameraOffset = { x: 0, z: 0 };

    // Event handlers
    this._handlers = {
      tileClick: [],
      tileHover: [],
      keyDown: [],
    };

    // Bind events
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onWheel = this._onWheel.bind(this);

    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('keydown', this._onKeyDown);
    this.canvas.addEventListener('wheel', this._onWheel, { passive: false });

    // Prevent context menu on right-click
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  /** Register event listener */
  on(event, callback) {
    if (this._handlers[event]) {
      this._handlers[event].push(callback);
    }
  }

  _emit(event, data) {
    for (const cb of this._handlers[event] || []) {
      cb(data);
    }
  }

  _getPointerPos(e) {
    return { x: e.clientX, y: e.clientY };
  }

  _onPointerDown(e) {
    this.isDragging = false;
    this.dragStart = this._getPointerPos(e);
    this._pointerDownTime = Date.now();
  }

  _onPointerMove(e) {
    const pos = this._getPointerPos(e);

    // Detect drag (camera pan)
    if (e.buttons > 0) {
      const dx = pos.x - this.dragStart.x;
      const dy = pos.y - this.dragStart.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        this.isDragging = true;
        // Pan camera based on drag delta
        const panSpeed = 0.05;
        this.scene.cameraTarget.x -= dx * panSpeed;
        this.scene.cameraTarget.z -= dy * panSpeed;
        this.scene.panTo(this.scene.cameraTarget.x, this.scene.cameraTarget.z);
        this.dragStart = pos;
      }
      return;
    }

    // Hover detection
    const worldPos = this.scene.screenToWorld(pos.x, pos.y);
    if (worldPos) {
      const tile = worldToTile(worldPos.x, worldPos.z);
      this.hoveredTile = tile;
      this._emit('tileHover', tile);
    }
  }

  _onPointerUp(e) {
    if (this.isDragging) {
      this.isDragging = false;
      return;
    }

    // Click — convert to tile and emit
    const pos = this._getPointerPos(e);
    const worldPos = this.scene.screenToWorld(pos.x, pos.y);
    if (worldPos) {
      const tile = worldToTile(worldPos.x, worldPos.z);
      this._emit('tileClick', { tile, worldPos, button: e.button });
    }
  }

  _onKeyDown(e) {
    this._emit('keyDown', { key: e.key, code: e.code, shift: e.shiftKey, ctrl: e.ctrlKey });
  }

  _onWheel(e) {
    e.preventDefault();
    // Zoom camera
    const zoomSpeed = 0.1;
    this.scene.camera.zoom = Math.max(0.5, Math.min(4, this.scene.camera.zoom - e.deltaY * zoomSpeed * 0.01));
    this.scene.camera.updateProjectionMatrix();
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('keydown', this._onKeyDown);
    this.canvas.removeEventListener('wheel', this._onWheel);
  }
}
```

**Step 3: Commit**

```bash
git add shared/TileMap.js client/src/engine/InputManager.js
git commit -m "feat: InputManager with mouse/touch tile picking and TileMap utils"
```

---

### Task 4: Procedural Asset Generator

**Files:**
- Create: `client/src/engine/AssetGenerator.js`

**Step 1: Implement AssetGenerator**

```js
// client/src/engine/AssetGenerator.js
// Factory for procedurally generated low-poly meshes and materials.
// All game visuals are created here — no external texture files needed.

import * as THREE from 'three';

export class AssetGenerator {
  constructor() {
    // Cache generated geometries and materials to avoid duplicates
    this._geoCache = new Map();
    this._matCache = new Map();
  }

  /** Get or create a cached material */
  getMaterial(color, options = {}) {
    const key = `${color}-${JSON.stringify(options)}`;
    if (!this._matCache.has(key)) {
      this._matCache.set(key, new THREE.MeshLambertMaterial({
        color,
        flatShading: true,
        ...options,
      }));
    }
    return this._matCache.get(key);
  }

  // ─── Crops ───

  /** Create a crop mesh at a given growth stage (0-3) */
  createCrop(cropType, stage) {
    const group = new THREE.Group();
    const scale = 0.2 + stage * 0.27; // grows from 0.2 to ~1.0

    // Stem
    const stemGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.5 * scale, 4);
    const stemMat = this.getMaterial(0x2d5a1e);
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.25 * scale;
    group.add(stem);

    // Top varies by crop type and stage
    if (stage >= 1) {
      const colors = {
        wheat: 0xdaa520,
        corn: 0xf5d142,
        tomato: 0xe74c3c,
        carrot: 0xff8c00,
        potato: 0x8b7355,
        strawberry: 0xff3366,
        pumpkin: 0xff7518,
        blueberry: 0x4169e1,
      };
      const topColor = colors[cropType] || 0x44aa22;

      if (stage === 1) {
        // Sprout — small leaves
        const leafGeo = new THREE.SphereGeometry(0.08, 4, 3);
        const leafMat = this.getMaterial(0x44aa22);
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.y = 0.5 * scale;
        group.add(leaf);
      } else if (stage === 2) {
        // Mature — bigger leaves
        const leafGeo = new THREE.SphereGeometry(0.15, 5, 3);
        const leafMat = this.getMaterial(0x3d9930);
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.y = 0.5 * scale;
        leaf.scale.y = 0.6;
        group.add(leaf);
      } else if (stage === 3) {
        // Harvestable — fruit/grain visible
        const leafGeo = new THREE.SphereGeometry(0.12, 5, 3);
        const leafMat = this.getMaterial(0x3d9930);
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.y = 0.45 * scale;
        leaf.scale.y = 0.6;
        group.add(leaf);

        const fruitGeo = new THREE.SphereGeometry(0.1, 5, 4);
        const fruitMat = this.getMaterial(topColor);
        const fruit = new THREE.Mesh(fruitGeo, fruitMat);
        fruit.position.set(0.05, 0.55 * scale, 0.05);
        group.add(fruit);
      }
    }

    group.castShadow = true;
    return group;
  }

  // ─── Trees ───

  createTree(variant = 0) {
    const group = new THREE.Group();

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, 0.8, 5);
    const trunkMat = this.getMaterial(0x5c3a1e);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.4;
    trunk.castShadow = true;
    group.add(trunk);

    // Foliage — stacked cones for low-poly look
    const leafColor = [0x2d8a4e, 0x3da85a, 0x228b22][variant % 3];
    const leafMat = this.getMaterial(leafColor);

    for (let i = 0; i < 3; i++) {
      const radius = 0.5 - i * 0.1;
      const coneGeo = new THREE.ConeGeometry(radius, 0.5, 6);
      const cone = new THREE.Mesh(coneGeo, leafMat);
      cone.position.y = 0.9 + i * 0.3;
      cone.castShadow = true;
      group.add(cone);
    }

    return group;
  }

  // ─── Buildings ───

  createBuilding(type) {
    const group = new THREE.Group();

    const configs = {
      house: { w: 2, h: 1.5, d: 2, color: 0xc4956a, roofColor: 0x8b4513 },
      barn: { w: 3, h: 2, d: 2.5, color: 0xcc3333, roofColor: 0x5c2a0e },
      coop: { w: 1.5, h: 1, d: 1.5, color: 0xdeb887, roofColor: 0x8b6914 },
      mill: { w: 1.5, h: 2.5, d: 1.5, color: 0xf5f5dc, roofColor: 0x666666 },
      shop: { w: 2, h: 1.5, d: 2, color: 0x6495ed, roofColor: 0x4169e1 },
    };
    const cfg = configs[type] || configs.house;

    // Walls
    const wallGeo = new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d);
    const wallMat = this.getMaterial(cfg.color);
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.position.y = cfg.h / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    // Roof
    const roofGeo = new THREE.ConeGeometry(cfg.w * 0.8, cfg.h * 0.5, 4);
    const roofMat = this.getMaterial(cfg.roofColor);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = cfg.h + cfg.h * 0.25;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    // Door
    const doorGeo = new THREE.PlaneGeometry(0.4, 0.6);
    const doorMat = this.getMaterial(0x5c2a0e);
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, 0.3, cfg.d / 2 + 0.01);
    group.add(door);

    return group;
  }

  // ─── Animals ───

  createAnimal(type) {
    const group = new THREE.Group();

    const configs = {
      chicken: { bodyColor: 0xffffff, size: 0.2, legHeight: 0.1 },
      cow: { bodyColor: 0xf5f5f5, size: 0.5, legHeight: 0.3 },
      sheep: { bodyColor: 0xeeeeee, size: 0.4, legHeight: 0.25 },
      goat: { bodyColor: 0xccbbaa, size: 0.35, legHeight: 0.25 },
    };
    const cfg = configs[type] || configs.chicken;

    // Body
    const bodyGeo = new THREE.SphereGeometry(cfg.size, 6, 4);
    const bodyMat = this.getMaterial(cfg.bodyColor);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = cfg.legHeight + cfg.size;
    body.scale.x = 1.3;
    group.add(body);

    // Head
    const headSize = cfg.size * 0.5;
    const headGeo = new THREE.SphereGeometry(headSize, 5, 4);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.set(cfg.size * 1.1, cfg.legHeight + cfg.size * 1.3, 0);
    group.add(head);

    // Legs (4 for cow/sheep/goat, 2 for chicken)
    const legCount = type === 'chicken' ? 2 : 4;
    const legGeo = new THREE.CylinderGeometry(0.03, 0.03, cfg.legHeight, 4);
    const legMat = this.getMaterial(type === 'chicken' ? 0xffaa00 : 0x555555);
    const positions = legCount === 2
      ? [[-0.05, 0, 0.05], [0.05, 0, 0.05]]
      : [
        [-cfg.size * 0.5, 0, cfg.size * 0.3],
        [cfg.size * 0.5, 0, cfg.size * 0.3],
        [-cfg.size * 0.5, 0, -cfg.size * 0.3],
        [cfg.size * 0.5, 0, -cfg.size * 0.3],
      ];
    for (const [lx, , lz] of positions) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, cfg.legHeight / 2, lz);
      group.add(leg);
    }

    group.castShadow = true;
    return group;
  }

  // ─── Pets ───

  /** Generate a unique pet model from parameters */
  createPet(type, params = {}) {
    const group = new THREE.Group();
    const {
      bodySize = 0.25,
      earSize = 0.1,
      tailLength = 0.2,
      color = 0xbb8844,
    } = params;

    // Body
    const bodyGeo = new THREE.SphereGeometry(bodySize, 6, 4);
    const bodyMat = this.getMaterial(color);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = bodySize + 0.1;
    body.scale.z = 1.3;
    group.add(body);

    // Head
    const headSize = bodySize * 0.6;
    const headGeo = new THREE.SphereGeometry(headSize, 5, 4);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.set(0, bodySize + 0.1 + bodySize * 0.5, bodySize * 1.2);
    group.add(head);

    // Ears
    const earGeo = new THREE.ConeGeometry(earSize, earSize * 2, 4);
    const earMat = this.getMaterial(color);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, earMat);
      ear.position.set(
        side * headSize * 0.5,
        bodySize + 0.1 + bodySize * 0.5 + headSize,
        bodySize * 1.2
      );
      group.add(ear);
    }

    // Tail
    const tailGeo = new THREE.CylinderGeometry(0.02, 0.04, tailLength, 4);
    const tail = new THREE.Mesh(tailGeo, bodyMat);
    tail.position.set(0, bodySize + 0.1, -bodySize * 1.2);
    tail.rotation.x = -0.5;
    group.add(tail);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.1, 4);
    for (const [lx, lz] of [[-0.1, 0.1], [0.1, 0.1], [-0.1, -0.1], [0.1, -0.1]]) {
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(lx, 0.05, lz);
      group.add(leg);
    }

    group.castShadow = true;
    return group;
  }

  // ─── NPC ───

  createNPC(params = {}) {
    const group = new THREE.Group();
    const {
      skinColor = 0xffcc99,
      shirtColor = 0x4488cc,
      hairColor = 0x332211,
    } = params;

    // Body / shirt
    const bodyGeo = new THREE.BoxGeometry(0.4, 0.5, 0.25);
    const bodyMat = this.getMaterial(shirtColor);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.75;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.18, 6, 5);
    const headMat = this.getMaterial(skinColor);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.2;
    group.add(head);

    // Hair
    const hairGeo = new THREE.SphereGeometry(0.2, 6, 5);
    const hairMat = this.getMaterial(hairColor);
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 1.28;
    hair.scale.set(1, 0.6, 1);
    group.add(hair);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.12, 0.4, 0.15);
    const legMat = this.getMaterial(0x334455);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(side * 0.1, 0.2, 0);
      group.add(leg);
    }

    // Arms
    const armGeo = new THREE.BoxGeometry(0.1, 0.4, 0.12);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, this.getMaterial(skinColor));
      arm.position.set(side * 0.28, 0.75, 0);
      group.add(arm);
    }

    group.castShadow = true;
    return group;
  }

  // ─── Player ───

  createPlayer(color = 0x4488ff) {
    // Player is like NPC but with a highlight
    const group = this.createNPC({ shirtColor: color });
    return group;
  }

  // ─── Rocks / Ore ───

  createRock(oreType = null) {
    const geo = new THREE.DodecahedronGeometry(0.25, 0);
    const color = oreType === 'copper' ? 0xb87333
      : oreType === 'iron' ? 0x888899
      : oreType === 'gold' ? 0xffd700
      : 0x777777;
    const mat = this.getMaterial(color);
    const rock = new THREE.Mesh(geo, mat);
    rock.position.y = 0.15;
    rock.castShadow = true;
    return rock;
  }

  /** Clean up all cached resources */
  dispose() {
    for (const geo of this._geoCache.values()) geo.dispose();
    for (const mat of this._matCache.values()) mat.dispose();
    this._geoCache.clear();
    this._matCache.clear();
  }
}
```

**Step 2: Commit**

```bash
git add client/src/engine/AssetGenerator.js
git commit -m "feat: procedural AssetGenerator for crops, buildings, animals, pets, NPCs"
```

---

### Task 5: Network Client

**Files:**
- Create: `client/src/network/NetworkClient.js`

**Step 1: Implement NetworkClient**

```js
// client/src/network/NetworkClient.js
// Handles Socket.io connection to the authoritative server.
// Sends player actions, receives world state updates.

import { io } from 'socket.io-client';
import { ACTIONS } from '@shared/constants.js';

export class NetworkClient {
  constructor() {
    this.socket = null;
    this.playerId = null;
    this.connected = false;
    this._handlers = {};
  }

  /** Connect to the game server */
  connect(playerName = 'Farmer') {
    return new Promise((resolve, reject) => {
      this.socket = io(window.location.origin, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
      });

      this.socket.on('connect', () => {
        this.connected = true;
        console.log('Connected to server:', this.socket.id);
        // Request to join the game world
        this.socket.emit(ACTIONS.PLAYER_JOIN, { name: playerName });
      });

      // Server sends back player ID and initial world state
      this.socket.on(ACTIONS.WORLD_STATE, (state) => {
        this.playerId = state.playerId;
        this._emit('worldState', state);
        resolve(state);
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        console.log('Disconnected from server');
        this._emit('disconnect');
      });

      this.socket.on('connect_error', (err) => {
        console.error('Connection error:', err.message);
        reject(err);
      });

      // Register all incoming event handlers
      this._setupListeners();
    });
  }

  _setupListeners() {
    // World updates (delta)
    this.socket.on(ACTIONS.WORLD_UPDATE, (data) => this._emit('worldUpdate', data));

    // Time updates
    this.socket.on(ACTIONS.TIME_UPDATE, (data) => this._emit('timeUpdate', data));

    // Weather changes
    this.socket.on(ACTIONS.WEATHER_UPDATE, (data) => this._emit('weatherUpdate', data));

    // Inventory changes
    this.socket.on(ACTIONS.INVENTORY_UPDATE, (data) => this._emit('inventoryUpdate', data));

    // Chat messages
    this.socket.on(ACTIONS.CHAT_MESSAGE, (data) => this._emit('chatMessage', data));

    // Player join/leave
    this.socket.on(ACTIONS.PLAYER_JOIN, (data) => this._emit('playerJoin', data));
    this.socket.on(ACTIONS.PLAYER_LEAVE, (data) => this._emit('playerLeave', data));
  }

  // ─── Send actions to server ───

  sendMove(x, z) {
    this.socket.emit(ACTIONS.PLAYER_MOVE, { x, z });
  }

  sendTill(tileX, tileZ) {
    this.socket.emit(ACTIONS.FARM_TILL, { x: tileX, z: tileZ });
  }

  sendPlant(tileX, tileZ, cropType) {
    this.socket.emit(ACTIONS.FARM_PLANT, { x: tileX, z: tileZ, cropType });
  }

  sendWater(tileX, tileZ) {
    this.socket.emit(ACTIONS.FARM_WATER, { x: tileX, z: tileZ });
  }

  sendHarvest(tileX, tileZ) {
    this.socket.emit(ACTIONS.FARM_HARVEST, { x: tileX, z: tileZ });
  }

  sendFishCast(x, z) {
    this.socket.emit(ACTIONS.FISH_CAST, { x, z });
  }

  sendFishReel() {
    this.socket.emit(ACTIONS.FISH_REEL);
  }

  sendNPCTalk(npcId) {
    this.socket.emit(ACTIONS.NPC_TALK, { npcId });
  }

  sendNPCGift(npcId, itemId) {
    this.socket.emit(ACTIONS.NPC_GIFT, { npcId, itemId });
  }

  sendPetInteract(petId, action) {
    this.socket.emit(ACTIONS.PET_INTERACT, { petId, action });
  }

  sendCraftStart(buildingId, recipeId) {
    this.socket.emit(ACTIONS.CRAFT_START, { buildingId, recipeId });
  }

  sendCraftCollect(buildingId) {
    this.socket.emit(ACTIONS.CRAFT_COLLECT, { buildingId });
  }

  sendBuy(itemId, quantity) {
    this.socket.emit(ACTIONS.SHOP_BUY, { itemId, quantity });
  }

  sendSell(itemId, quantity) {
    this.socket.emit(ACTIONS.SHOP_SELL, { itemId, quantity });
  }

  sendChat(message) {
    this.socket.emit(ACTIONS.CHAT_MESSAGE, { message });
  }

  // ─── Event system ───

  on(event, callback) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(callback);
  }

  _emit(event, data) {
    for (const cb of this._handlers[event] || []) {
      cb(data);
    }
  }

  disconnect() {
    if (this.socket) this.socket.disconnect();
  }
}
```

**Step 2: Commit**

```bash
git add client/src/network/NetworkClient.js
git commit -m "feat: NetworkClient with Socket.io connection and action methods"
```

---

## Phase 2: Server Core

### Task 6: Database schema and connection

**Files:**
- Create: `server/db/schema.sql`
- Create: `server/db/database.js`

**Step 1: Create schema.sql**

```sql
-- server/db/schema.sql

CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  seed INTEGER NOT NULL,
  season INTEGER DEFAULT 0,
  day INTEGER DEFAULT 1,
  hour REAL DEFAULT 6.0,
  weather INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  name TEXT NOT NULL,
  x REAL DEFAULT 32,
  z REAL DEFAULT 32,
  coins INTEGER DEFAULT 500,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  energy REAL DEFAULT 100,
  max_energy REAL DEFAULT 100,
  FOREIGN KEY (world_id) REFERENCES worlds(id)
);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  slot INTEGER,
  FOREIGN KEY (player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS tiles (
  world_id TEXT NOT NULL,
  x INTEGER NOT NULL,
  z INTEGER NOT NULL,
  type INTEGER NOT NULL,
  height REAL DEFAULT 0,
  PRIMARY KEY (world_id, x, z),
  FOREIGN KEY (world_id) REFERENCES worlds(id)
);

CREATE TABLE IF NOT EXISTS crops (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  tile_x INTEGER NOT NULL,
  tile_z INTEGER NOT NULL,
  crop_type TEXT NOT NULL,
  stage INTEGER DEFAULT 0,
  growth REAL DEFAULT 0,
  watered INTEGER DEFAULT 0,
  planted_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (world_id) REFERENCES worlds(id)
);

CREATE TABLE IF NOT EXISTS animals (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  type TEXT NOT NULL,
  x REAL, z REAL,
  happiness REAL DEFAULT 50,
  fed_today INTEGER DEFAULT 0,
  product_ready INTEGER DEFAULT 0,
  FOREIGN KEY (world_id) REFERENCES worlds(id)
);

CREATE TABLE IF NOT EXISTS pets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT,
  energy REAL DEFAULT 100,
  happiness REAL DEFAULT 50,
  loyalty REAL DEFAULT 0,
  skill REAL DEFAULT 0,
  body_size REAL DEFAULT 0.25,
  ear_size REAL DEFAULT 0.1,
  tail_length REAL DEFAULT 0.2,
  color INTEGER DEFAULT 0xbb8844,
  FOREIGN KEY (owner_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS npc_relationships (
  player_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  hearts REAL DEFAULT 0,
  talked_today INTEGER DEFAULT 0,
  gifted_today INTEGER DEFAULT 0,
  PRIMARY KEY (player_id, npc_id),
  FOREIGN KEY (player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  npc_id TEXT,
  type TEXT NOT NULL,
  description TEXT,
  target_item TEXT,
  target_count INTEGER DEFAULT 1,
  current_count INTEGER DEFAULT 0,
  reward_coins INTEGER DEFAULT 0,
  reward_xp INTEGER DEFAULT 0,
  reward_item TEXT,
  completed INTEGER DEFAULT 0,
  FOREIGN KEY (player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  type TEXT NOT NULL,
  tile_x INTEGER, tile_z INTEGER,
  processing_recipe TEXT,
  processing_start TEXT,
  processing_done INTEGER DEFAULT 0,
  FOREIGN KEY (world_id) REFERENCES worlds(id)
);
```

**Step 2: Create database.js**

```js
// server/db/database.js
// SQLite database connection and initialization.

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

export function getDB() {
  if (!db) {
    db = new Database(join(__dirname, '../../ourfarm.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Run schema
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schema);
  }
  return db;
}

export function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}
```

**Step 3: Commit**

```bash
git add server/db/
git commit -m "feat: SQLite database schema and connection"
```

---

### Task 7: Game data files (JSON configs)

**Files:**
- Create: `server/data/crops.json`
- Create: `server/data/animals.json`
- Create: `server/data/pets.json`
- Create: `server/data/fish.json`
- Create: `server/data/npcs.json`
- Create: `server/data/recipes.json`
- Create: `server/data/quests.json`
- Create: `shared/ItemRegistry.js`

**Step 1: Create all data files**

`server/data/crops.json`:
```json
{
  "wheat": { "name": "Wheat", "buyPrice": 10, "sellPrice": 25, "growthTime": 4, "season": [0,1], "xp": 8 },
  "corn": { "name": "Corn", "buyPrice": 15, "sellPrice": 35, "growthTime": 6, "season": [1], "xp": 12 },
  "tomato": { "name": "Tomato", "buyPrice": 20, "sellPrice": 40, "growthTime": 5, "season": [1], "xp": 10 },
  "carrot": { "name": "Carrot", "buyPrice": 8, "sellPrice": 20, "growthTime": 3, "season": [0], "xp": 6 },
  "potato": { "name": "Potato", "buyPrice": 12, "sellPrice": 30, "growthTime": 5, "season": [0,2], "xp": 10 },
  "strawberry": { "name": "Strawberry", "buyPrice": 30, "sellPrice": 60, "growthTime": 4, "season": [0], "xp": 14 },
  "pumpkin": { "name": "Pumpkin", "buyPrice": 40, "sellPrice": 100, "growthTime": 8, "season": [2], "xp": 20 },
  "blueberry": { "name": "Blueberry", "buyPrice": 25, "sellPrice": 50, "growthTime": 5, "season": [1], "xp": 12 }
}
```

`server/data/animals.json`:
```json
{
  "chicken": { "name": "Chicken", "buyPrice": 200, "product": "egg", "productValue": 30, "productInterval": 24, "building": "coop" },
  "cow": { "name": "Cow", "buyPrice": 500, "product": "milk", "productValue": 60, "productInterval": 48, "building": "barn" },
  "sheep": { "name": "Sheep", "buyPrice": 400, "product": "wool", "productValue": 80, "productInterval": 72, "building": "barn" },
  "goat": { "name": "Goat", "buyPrice": 450, "product": "cheese", "productValue": 70, "productInterval": 48, "building": "barn" },
  "bee": { "name": "Bee Hive", "buyPrice": 300, "product": "honey", "productValue": 50, "productInterval": 96, "building": "none" }
}
```

`server/data/pets.json`:
```json
{
  "dog": { "name": "Dog", "buyPrice": 300, "bonus": "harvestSpeed", "bonusValue": 0.15, "rarity": "common" },
  "cat": { "name": "Cat", "buyPrice": 300, "bonus": "pestProtection", "bonusValue": 0.2, "rarity": "common" },
  "rabbit": { "name": "Rabbit", "buyPrice": 250, "bonus": "foragingLuck", "bonusValue": 0.1, "rarity": "common" },
  "parrot": { "name": "Parrot", "buyPrice": 500, "bonus": "npcRelation", "bonusValue": 0.15, "rarity": "uncommon" },
  "fox": { "name": "Fox", "buyPrice": 1000, "bonus": "animalProduct", "bonusValue": 0.2, "rarity": "rare" },
  "owl": { "name": "Owl", "buyPrice": 1200, "bonus": "nightBonus", "bonusValue": 0.25, "rarity": "rare" }
}
```

`server/data/fish.json`:
```json
{
  "bass": { "name": "Bass", "rarity": 0, "value": 20, "location": "pond", "minLevel": 1 },
  "trout": { "name": "Trout", "rarity": 0, "value": 25, "location": "river", "minLevel": 1 },
  "catfish": { "name": "Catfish", "rarity": 0, "value": 30, "location": "pond", "minLevel": 2 },
  "salmon": { "name": "Salmon", "rarity": 1, "value": 50, "location": "river", "minLevel": 3 },
  "pike": { "name": "Pike", "rarity": 1, "value": 55, "location": "river", "minLevel": 4 },
  "perch": { "name": "Perch", "rarity": 0, "value": 22, "location": "pond", "minLevel": 1 },
  "carp": { "name": "Carp", "rarity": 0, "value": 18, "location": "pond", "minLevel": 1 },
  "walleye": { "name": "Walleye", "rarity": 1, "value": 60, "location": "river", "minLevel": 5 },
  "sturgeon": { "name": "Sturgeon", "rarity": 2, "value": 120, "location": "river", "minLevel": 7 },
  "tuna": { "name": "Tuna", "rarity": 1, "value": 70, "location": "ocean", "minLevel": 8 },
  "swordfish": { "name": "Swordfish", "rarity": 2, "value": 150, "location": "ocean", "minLevel": 10 },
  "lobster": { "name": "Lobster", "rarity": 1, "value": 80, "location": "ocean", "minLevel": 6 },
  "goldfish": { "name": "Goldfish", "rarity": 2, "value": 200, "location": "pond", "minLevel": 9 },
  "anglerfish": { "name": "Anglerfish", "rarity": 3, "value": 500, "location": "ocean", "minLevel": 15 },
  "legendCarp": { "name": "Legend Carp", "rarity": 3, "value": 1000, "location": "pond", "minLevel": 20 }
}
```

`server/data/npcs.json`:
```json
[
  {
    "id": "npc_baker", "name": "Rosie", "role": "Baker",
    "personality": "cheerful",
    "skinColor": "0xffcc99", "shirtColor": "0xff8866", "hairColor": "0xaa4400",
    "homeX": 28, "homeZ": 8, "shopX": 30, "shopZ": 10,
    "likedGifts": ["wheat", "strawberry", "egg"],
    "dialogue": {
      "intro": "Hi there! I'm Rosie. I run the bakery in town!",
      "low": "Oh, hello. Can I help you with something?",
      "mid": "Good to see you, friend! How's the farm?",
      "high": "You're my favorite farmer! I saved you a fresh pastry!"
    }
  },
  {
    "id": "npc_smith", "name": "Grim", "role": "Blacksmith",
    "personality": "grumpy",
    "skinColor": "0xcc9966", "shirtColor": "0x555555", "hairColor": "0x222222",
    "homeX": 35, "homeZ": 6, "shopX": 36, "shopZ": 8,
    "likedGifts": ["copper_ore", "iron_ore", "gold_ore"],
    "dialogue": {
      "intro": "What do you want? I'm busy. Name's Grim.",
      "low": "Back again? Make it quick.",
      "mid": "Hmph. You're not so bad, I guess.",
      "high": "...You're alright, kid. Here, take this — I made it for you."
    }
  },
  {
    "id": "npc_librarian", "name": "Willow", "role": "Librarian",
    "personality": "shy",
    "skinColor": "0xffe0cc", "shirtColor": "0x8866aa", "hairColor": "0x553388",
    "homeX": 32, "homeZ": 5, "shopX": 33, "shopZ": 7,
    "likedGifts": ["blueberry", "pumpkin"],
    "dialogue": {
      "intro": "Oh! I didn't see you there... I'm Willow.",
      "low": "H-hi... Did you need a book?",
      "mid": "I found a passage about ancient farming techniques. Want to hear?",
      "high": "I... I look forward to seeing you every day."
    }
  },
  {
    "id": "npc_fisher", "name": "Old Pete", "role": "Fisherman",
    "personality": "laid-back",
    "skinColor": "0xddaa77", "shirtColor": "0x336699", "hairColor": "0xaaaaaa",
    "homeX": 45, "homeZ": 32, "shopX": 48, "shopZ": 34,
    "likedGifts": ["bass", "salmon", "sturgeon"],
    "dialogue": {
      "intro": "Well hey there! Name's Pete. Pull up a chair, the fish ain't bitin' anyway.",
      "low": "Nice day for fishin', ain't it?",
      "mid": "You know, you remind me of myself when I was young.",
      "high": "Here, take my lucky rod. You've earned it, friend."
    }
  },
  {
    "id": "npc_mayor", "name": "Mayor Hart", "role": "Mayor",
    "personality": "formal",
    "skinColor": "0xffcc99", "shirtColor": "0x224466", "hairColor": "0x666666",
    "homeX": 30, "homeZ": 4, "shopX": 32, "shopZ": 6,
    "likedGifts": ["pumpkin", "gold_ore", "honey"],
    "dialogue": {
      "intro": "Welcome to our town! I'm Mayor Hart. We're glad to have a new farmer.",
      "low": "Good day, citizen. Everything in order?",
      "mid": "The town has really benefited from your contributions.",
      "high": "You're an honorary citizen now. This town wouldn't be the same without you."
    }
  },
  {
    "id": "npc_vet", "name": "Dr. Fern", "role": "Veterinarian",
    "personality": "caring",
    "skinColor": "0xffe0cc", "shirtColor": "0x44aa66", "hairColor": "0x663300",
    "homeX": 26, "homeZ": 7, "shopX": 27, "shopZ": 9,
    "likedGifts": ["milk", "egg", "wool"],
    "dialogue": {
      "intro": "Hello! I'm Dr. Fern. I take care of all the animals around here.",
      "low": "Remember to take good care of your animals!",
      "mid": "Your animals seem really happy. You're doing great!",
      "high": "You have such a gift with animals. I could learn from you!"
    }
  }
]
```

`server/data/recipes.json`:
```json
{
  "flour": { "name": "Flour", "building": "mill", "inputs": {"wheat": 3}, "output": "flour", "count": 1, "time": 2, "sellPrice": 50, "xp": 5 },
  "bread": { "name": "Bread", "building": "kitchen", "inputs": {"flour": 1}, "output": "bread", "count": 1, "time": 3, "sellPrice": 80, "xp": 8 },
  "cake": { "name": "Cake", "building": "kitchen", "inputs": {"flour": 2, "egg": 2, "strawberry": 3}, "output": "cake", "count": 1, "time": 5, "sellPrice": 250, "xp": 20 },
  "cheese_wheel": { "name": "Cheese Wheel", "building": "kitchen", "inputs": {"milk": 3}, "output": "cheese_wheel", "count": 1, "time": 4, "sellPrice": 200, "xp": 15 },
  "cloth": { "name": "Cloth", "building": "loom", "inputs": {"wool": 2}, "output": "cloth", "count": 1, "time": 3, "sellPrice": 120, "xp": 10 },
  "copper_bar": { "name": "Copper Bar", "building": "forge", "inputs": {"copper_ore": 5}, "output": "copper_bar", "count": 1, "time": 3, "sellPrice": 60, "xp": 8 },
  "iron_bar": { "name": "Iron Bar", "building": "forge", "inputs": {"iron_ore": 5}, "output": "iron_bar", "count": 1, "time": 4, "sellPrice": 100, "xp": 12 },
  "gold_bar": { "name": "Gold Bar", "building": "forge", "inputs": {"gold_ore": 5}, "output": "gold_bar", "count": 1, "time": 5, "sellPrice": 200, "xp": 18 }
}
```

`server/data/quests.json`:
```json
[
  { "id": "q_rosie_1", "npcId": "npc_baker", "type": "fetch", "description": "Rosie needs wheat for her bakery.", "targetItem": "wheat", "targetCount": 10, "rewardCoins": 150, "rewardXp": 30, "minHearts": 1 },
  { "id": "q_rosie_2", "npcId": "npc_baker", "type": "fetch", "description": "Rosie wants strawberries for a special pie.", "targetItem": "strawberry", "targetCount": 5, "rewardCoins": 250, "rewardXp": 50, "minHearts": 3 },
  { "id": "q_grim_1", "npcId": "npc_smith", "type": "fetch", "description": "Grim needs copper ore for a commission.", "targetItem": "copper_ore", "targetCount": 15, "rewardCoins": 200, "rewardXp": 40, "minHearts": 1 },
  { "id": "q_grim_2", "npcId": "npc_smith", "type": "craft", "description": "Grim wants you to bring him an iron bar.", "targetItem": "iron_bar", "targetCount": 1, "rewardCoins": 300, "rewardXp": 60, "rewardItem": "steel_pickaxe", "minHearts": 4 },
  { "id": "q_pete_1", "npcId": "npc_fisher", "type": "fetch", "description": "Old Pete wants to see a salmon.", "targetItem": "salmon", "targetCount": 1, "rewardCoins": 100, "rewardXp": 25, "minHearts": 1 },
  { "id": "q_pete_2", "npcId": "npc_fisher", "type": "fetch", "description": "Pete heard rumors of a legendary carp...", "targetItem": "legendCarp", "targetCount": 1, "rewardCoins": 2000, "rewardXp": 200, "minHearts": 6 },
  { "id": "q_fern_1", "npcId": "npc_vet", "type": "fetch", "description": "Dr. Fern needs milk for a sick animal.", "targetItem": "milk", "targetCount": 3, "rewardCoins": 120, "rewardXp": 20, "minHearts": 1 },
  { "id": "q_mayor_1", "npcId": "npc_mayor", "type": "fetch", "description": "The Mayor wants pumpkins for the harvest festival.", "targetItem": "pumpkin", "targetCount": 5, "rewardCoins": 500, "rewardXp": 80, "minHearts": 2 }
]
```

**Step 2: Create shared/ItemRegistry.js**

```js
// shared/ItemRegistry.js — Central item ID and category registry

export const ITEM_CATEGORIES = {
  SEED: 'seed',
  CROP: 'crop',
  ANIMAL_PRODUCT: 'animal_product',
  FISH: 'fish',
  ORE: 'ore',
  BAR: 'bar',
  PROCESSED: 'processed',
  TOOL: 'tool',
};

export const TOOLS = {
  HOE: 'hoe',
  WATERING_CAN: 'watering_can',
  PICKAXE: 'pickaxe',
  AXE: 'axe',
  FISHING_ROD: 'fishing_rod',
};

// Maps item IDs to display info
export const ITEMS = {
  // Seeds (derived from crops at runtime)
  // Crops
  wheat: { name: 'Wheat', category: 'crop' },
  corn: { name: 'Corn', category: 'crop' },
  tomato: { name: 'Tomato', category: 'crop' },
  carrot: { name: 'Carrot', category: 'crop' },
  potato: { name: 'Potato', category: 'crop' },
  strawberry: { name: 'Strawberry', category: 'crop' },
  pumpkin: { name: 'Pumpkin', category: 'crop' },
  blueberry: { name: 'Blueberry', category: 'crop' },
  // Animal products
  egg: { name: 'Egg', category: 'animal_product' },
  milk: { name: 'Milk', category: 'animal_product' },
  wool: { name: 'Wool', category: 'animal_product' },
  cheese: { name: 'Cheese', category: 'animal_product' },
  honey: { name: 'Honey', category: 'animal_product' },
  // Ores
  copper_ore: { name: 'Copper Ore', category: 'ore' },
  iron_ore: { name: 'Iron Ore', category: 'ore' },
  gold_ore: { name: 'Gold Ore', category: 'ore' },
  // Bars
  copper_bar: { name: 'Copper Bar', category: 'bar' },
  iron_bar: { name: 'Iron Bar', category: 'bar' },
  gold_bar: { name: 'Gold Bar', category: 'bar' },
  // Processed
  flour: { name: 'Flour', category: 'processed' },
  bread: { name: 'Bread', category: 'processed' },
  cake: { name: 'Cake', category: 'processed' },
  cheese_wheel: { name: 'Cheese Wheel', category: 'processed' },
  cloth: { name: 'Cloth', category: 'processed' },
  // Tools
  hoe: { name: 'Hoe', category: 'tool' },
  watering_can: { name: 'Watering Can', category: 'tool' },
  pickaxe: { name: 'Pickaxe', category: 'tool' },
  axe: { name: 'Axe', category: 'tool' },
  fishing_rod: { name: 'Fishing Rod', category: 'tool' },
};
```

**Step 3: Commit**

```bash
git add server/data/ shared/ItemRegistry.js
git commit -m "feat: game data files (crops, animals, pets, fish, NPCs, recipes, quests) and ItemRegistry"
```

---

### Task 8: Terrain Generator (server-side, deterministic)

**Files:**
- Create: `server/game/TerrainGenerator.js`

**Step 1: Implement TerrainGenerator**

```js
// server/game/TerrainGenerator.js
// Generates the world tile grid from a seed using simplex noise.
// Deterministic: same seed always produces the same world.

import { createNoise2D } from 'simplex-noise';
import { WORLD_SIZE, TILE_TYPES } from '../../shared/constants.js';

export class TerrainGenerator {
  constructor(seed) {
    this.seed = seed;
    // Create seeded PRNG for noise
    this.noise = createNoise2D(() => {
      // Simple seeded random using seed
      let s = seed;
      return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
      };
    });
  }

  /** Generate the full tile grid. Returns flat array of WORLD_SIZE*WORLD_SIZE tiles. */
  generate() {
    const tiles = [];
    const centerX = WORLD_SIZE / 2;
    const centerZ = WORLD_SIZE / 2;

    for (let z = 0; z < WORLD_SIZE; z++) {
      for (let x = 0; x < WORLD_SIZE; x++) {
        // Multi-octave noise for natural terrain
        const nx = x / WORLD_SIZE;
        const nz = z / WORLD_SIZE;
        let height = 0;
        height += 1.0 * this.noise(1 * nx * 8, 1 * nz * 8);
        height += 0.5 * this.noise(2 * nx * 8, 2 * nz * 8);
        height += 0.25 * this.noise(4 * nx * 8, 4 * nz * 8);
        height = height / 1.75; // Normalize to roughly -1..1

        // Distance from center (farm is in the middle)
        const dx = (x - centerX) / centerX;
        const dz = (z - centerZ) / centerZ;
        const distFromCenter = Math.sqrt(dx * dx + dz * dz);

        // Determine tile type based on height and position
        let type;
        if (height < -0.3) {
          type = TILE_TYPES.WATER;
        } else if (height < -0.15) {
          type = TILE_TYPES.SAND;
        } else if (distFromCenter < 0.25) {
          // Farm area — mostly dirt/grass
          type = height < 0.1 ? TILE_TYPES.DIRT : TILE_TYPES.GRASS;
        } else if (z < WORLD_SIZE * 0.25) {
          // North — village area
          type = TILE_TYPES.PATH;
        } else if (x > WORLD_SIZE * 0.7) {
          // East — water/fishing zone (force more water)
          type = height < 0.2 ? TILE_TYPES.WATER : TILE_TYPES.GRASS;
        } else if (x < WORLD_SIZE * 0.2) {
          // West — mining/stone zone
          type = height > 0.2 ? TILE_TYPES.STONE : TILE_TYPES.GRASS;
        } else {
          // South / general — forest/grass
          type = TILE_TYPES.GRASS;
        }

        tiles.push({
          x, z, type,
          height: Math.max(type === TILE_TYPES.WATER ? -0.3 : 0, height * 0.5),
        });
      }
    }

    return tiles;
  }
}
```

**Step 2: Commit**

```bash
git add server/game/TerrainGenerator.js
git commit -m "feat: deterministic TerrainGenerator with Perlin noise zones"
```

---

### Task 9: Time Manager and Weather Manager

**Files:**
- Create: `server/game/TimeManager.js`
- Create: `server/game/WeatherManager.js`

**Step 1: Create TimeManager**

```js
// server/game/TimeManager.js
// Manages accelerated game time: day/night cycle, seasons, calendar.

import { TIME_SCALE, DAYS_PER_SEASON, HOURS_PER_DAY, SEASONS } from '../../shared/constants.js';

export class TimeManager {
  constructor(state = {}) {
    this.season = state.season || SEASONS.SPRING;
    this.day = state.day || 1;
    this.hour = state.hour || 6.0; // Start at 6 AM
    this.totalDays = 0;
    this.paused = false;
  }

  /** Advance time by deltaSec real seconds. Returns events triggered. */
  tick(deltaSec) {
    if (this.paused) return [];

    const events = [];
    const gameMinutes = (deltaSec * TIME_SCALE) / 60;
    this.hour += gameMinutes / 60;

    // New day
    if (this.hour >= HOURS_PER_DAY) {
      this.hour -= HOURS_PER_DAY;
      this.day++;
      this.totalDays++;
      events.push({ type: 'newDay', day: this.day, season: this.season });

      // New season
      if (this.day > DAYS_PER_SEASON) {
        this.day = 1;
        this.season = (this.season + 1) % 4;
        events.push({ type: 'newSeason', season: this.season });
      }
    }

    return events;
  }

  /** Is it currently nighttime? (8pm - 6am) */
  isNight() {
    return this.hour >= 20 || this.hour < 6;
  }

  /** Get the sun intensity (0 to 1) based on time of day */
  getSunIntensity() {
    if (this.hour < 5) return 0.1;
    if (this.hour < 7) return 0.1 + (this.hour - 5) * 0.45;
    if (this.hour < 17) return 1.0;
    if (this.hour < 20) return 1.0 - (this.hour - 17) * 0.3;
    return 0.1;
  }

  getState() {
    return { season: this.season, day: this.day, hour: this.hour };
  }
}
```

**Step 2: Create WeatherManager**

```js
// server/game/WeatherManager.js
// Generates weather patterns that affect gameplay.

import { WEATHER, SEASONS } from '../../shared/constants.js';

export class WeatherManager {
  constructor(seed) {
    this.currentWeather = WEATHER.SUNNY;
    this.seed = seed;
    this._counter = 0;
  }

  /** Called each new day to potentially change weather. */
  onNewDay(season) {
    this._counter++;
    // Seeded pseudo-random for weather
    const rand = this._seededRandom(this.seed + this._counter);

    // Weather probabilities vary by season
    const probs = {
      [SEASONS.SPRING]: { sunny: 0.4, cloudy: 0.25, rainy: 0.3, stormy: 0.05, snowy: 0 },
      [SEASONS.SUMMER]: { sunny: 0.6, cloudy: 0.2, rainy: 0.15, stormy: 0.05, snowy: 0 },
      [SEASONS.FALL]:   { sunny: 0.35, cloudy: 0.3, rainy: 0.25, stormy: 0.1, snowy: 0 },
      [SEASONS.WINTER]: { sunny: 0.25, cloudy: 0.25, rainy: 0.1, stormy: 0.05, snowy: 0.35 },
    };

    const p = probs[season] || probs[SEASONS.SPRING];
    let cumulative = 0;
    for (const [weather, prob] of Object.entries(p)) {
      cumulative += prob;
      if (rand < cumulative) {
        this.currentWeather = WEATHER[weather.toUpperCase()];
        break;
      }
    }

    return this.currentWeather;
  }

  isRaining() {
    return this.currentWeather === WEATHER.RAINY || this.currentWeather === WEATHER.STORMY;
  }

  _seededRandom(s) {
    const x = Math.sin(s * 9301 + 49297) * 49297;
    return x - Math.floor(x);
  }

  getState() {
    return { weather: this.currentWeather };
  }
}
```

**Step 3: Commit**

```bash
git add server/game/TimeManager.js server/game/WeatherManager.js
git commit -m "feat: TimeManager (accelerated clock/seasons) and WeatherManager"
```

---

### Task 10: Server entity classes

**Files:**
- Create: `server/entities/Player.js`
- Create: `server/entities/Crop.js`
- Create: `server/entities/NPC.js`
- Create: `server/entities/Pet.js`
- Create: `server/entities/Fish.js`
- Create: `server/entities/Animal.js`

**Step 1: Create Player.js**

```js
// server/entities/Player.js
import { v4 as uuid } from 'uuid';

export class Player {
  constructor(data = {}) {
    this.id = data.id || uuid();
    this.name = data.name || 'Farmer';
    this.x = data.x ?? 32;
    this.z = data.z ?? 32;
    this.coins = data.coins ?? 500;
    this.xp = data.xp ?? 0;
    this.level = data.level ?? 1;
    this.energy = data.energy ?? 100;
    this.maxEnergy = data.maxEnergy ?? 100;
    this.inventory = data.inventory || this._defaultInventory();
    this.activeToolSlot = 0;
    this.socketId = null;
  }

  _defaultInventory() {
    return [
      { itemId: 'hoe', quantity: 1 },
      { itemId: 'watering_can', quantity: 1 },
      { itemId: 'pickaxe', quantity: 1 },
      { itemId: 'axe', quantity: 1 },
      { itemId: 'fishing_rod', quantity: 1 },
      { itemId: 'wheat_seed', quantity: 15 },
      { itemId: 'carrot_seed', quantity: 10 },
    ];
  }

  addItem(itemId, quantity = 1) {
    const existing = this.inventory.find(s => s.itemId === itemId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.inventory.push({ itemId, quantity });
    }
  }

  removeItem(itemId, quantity = 1) {
    const slot = this.inventory.find(s => s.itemId === itemId);
    if (!slot || slot.quantity < quantity) return false;
    slot.quantity -= quantity;
    if (slot.quantity <= 0) {
      this.inventory = this.inventory.filter(s => s.quantity > 0);
    }
    return true;
  }

  hasItem(itemId, quantity = 1) {
    const slot = this.inventory.find(s => s.itemId === itemId);
    return slot && slot.quantity >= quantity;
  }

  addXP(amount) {
    this.xp += amount;
    // Simple leveling: each level needs level*100 XP
    const needed = this.level * 100;
    if (this.xp >= needed) {
      this.xp -= needed;
      this.level++;
      this.maxEnergy += 5;
      this.energy = this.maxEnergy;
      return true; // Leveled up
    }
    return false;
  }

  useEnergy(amount) {
    if (this.energy < amount) return false;
    this.energy -= amount;
    return true;
  }

  getState() {
    return {
      id: this.id, name: this.name,
      x: this.x, z: this.z,
      coins: this.coins, xp: this.xp, level: this.level,
      energy: this.energy, maxEnergy: this.maxEnergy,
      inventory: this.inventory,
    };
  }
}
```

**Step 2: Create Crop.js**

```js
// server/entities/Crop.js
import { v4 as uuid } from 'uuid';
import { CROP_STAGES } from '../../shared/constants.js';

export class Crop {
  constructor(data = {}) {
    this.id = data.id || uuid();
    this.tileX = data.tileX;
    this.tileZ = data.tileZ;
    this.cropType = data.cropType;
    this.stage = data.stage ?? CROP_STAGES.SEED;
    this.growth = data.growth ?? 0; // 0..1 progress to next stage
    this.watered = data.watered ?? false;
  }

  /** Advance growth. growthRate is hours of game time elapsed. */
  tick(gameHoursElapsed, cropData) {
    if (this.stage >= CROP_STAGES.HARVESTABLE) return false;

    const rate = this.watered ? 1.5 : 1.0;
    const totalGrowthHours = cropData.growthTime * 24; // growthTime is in game-days
    const progressPerHour = 3 / totalGrowthHours; // 3 stage transitions total

    this.growth += gameHoursElapsed * progressPerHour * rate;

    if (this.growth >= 1) {
      this.growth = 0;
      this.stage++;
      this.watered = false;
      return true; // Stage changed
    }
    return false;
  }

  getState() {
    return {
      id: this.id, tileX: this.tileX, tileZ: this.tileZ,
      cropType: this.cropType, stage: this.stage, growth: this.growth,
      watered: this.watered,
    };
  }
}
```

**Step 3: Create NPC.js, Pet.js, Animal.js, Fish.js (stubs)**

```js
// server/entities/NPC.js
export class NPC {
  constructor(data) {
    Object.assign(this, data);
    this.currentX = data.homeX;
    this.currentZ = data.homeZ;
  }

  updateSchedule(hour) {
    // NPCs move between home and shop based on time
    if (hour >= 8 && hour < 18) {
      this.currentX = this.shopX;
      this.currentZ = this.shopZ;
    } else {
      this.currentX = this.homeX;
      this.currentZ = this.homeZ;
    }
  }

  getDialogue(hearts) {
    if (hearts >= 8) return this.dialogue.high;
    if (hearts >= 4) return this.dialogue.mid;
    if (hearts >= 1) return this.dialogue.low;
    return this.dialogue.intro;
  }

  getState() {
    return {
      id: this.id, name: this.name, role: this.role,
      x: this.currentX, z: this.currentZ,
      personality: this.personality,
      skinColor: this.skinColor, shirtColor: this.shirtColor, hairColor: this.hairColor,
    };
  }
}
```

```js
// server/entities/Pet.js
import { v4 as uuid } from 'uuid';

export class Pet {
  constructor(data = {}) {
    this.id = data.id || uuid();
    this.ownerId = data.ownerId;
    this.type = data.type;
    this.name = data.name || data.type;
    this.energy = data.energy ?? 100;
    this.happiness = data.happiness ?? 50;
    this.loyalty = data.loyalty ?? 0;
    this.skill = data.skill ?? 0;
    // Visual params
    this.bodySize = data.bodySize ?? 0.2 + Math.random() * 0.1;
    this.earSize = data.earSize ?? 0.08 + Math.random() * 0.05;
    this.tailLength = data.tailLength ?? 0.15 + Math.random() * 0.1;
    this.color = data.color ?? Math.floor(Math.random() * 0xffffff);
    this.x = data.x ?? 32;
    this.z = data.z ?? 33;
  }

  feed() {
    this.energy = Math.min(100, this.energy + 30);
    this.happiness = Math.min(100, this.happiness + 10);
  }

  train() {
    if (this.energy < 20) return false;
    this.energy -= 20;
    this.skill = Math.min(100, this.skill + 2 + Math.random() * 3);
    this.loyalty = Math.min(100, this.loyalty + 1);
    return true;
  }

  pet() {
    this.happiness = Math.min(100, this.happiness + 15);
    this.loyalty = Math.min(100, this.loyalty + 0.5);
  }

  tickDaily() {
    this.energy = Math.max(0, this.energy - 10);
    this.happiness = Math.max(0, this.happiness - 5);
  }

  getState() {
    return {
      id: this.id, ownerId: this.ownerId, type: this.type, name: this.name,
      energy: this.energy, happiness: this.happiness,
      loyalty: this.loyalty, skill: this.skill,
      bodySize: this.bodySize, earSize: this.earSize,
      tailLength: this.tailLength, color: this.color,
      x: this.x, z: this.z,
    };
  }
}
```

```js
// server/entities/Animal.js
import { v4 as uuid } from 'uuid';

export class Animal {
  constructor(data = {}) {
    this.id = data.id || uuid();
    this.type = data.type;
    this.x = data.x ?? 30;
    this.z = data.z ?? 30;
    this.happiness = data.happiness ?? 50;
    this.fedToday = data.fedToday ?? false;
    this.productReady = data.productReady ?? false;
    this._hoursSinceProduct = 0;
  }

  feed() {
    this.fedToday = true;
    this.happiness = Math.min(100, this.happiness + 20);
  }

  tickHour(animalData) {
    if (this.fedToday) {
      this._hoursSinceProduct++;
      if (this._hoursSinceProduct >= animalData.productInterval) {
        this.productReady = true;
        this._hoursSinceProduct = 0;
      }
    }
  }

  tickDaily() {
    if (!this.fedToday) {
      this.happiness = Math.max(0, this.happiness - 15);
    }
    this.fedToday = false;
  }

  collectProduct() {
    if (!this.productReady) return null;
    this.productReady = false;
    const qualityBonus = this.happiness > 80 ? 1.5 : 1.0;
    return { qualityBonus };
  }

  getState() {
    return {
      id: this.id, type: this.type,
      x: this.x, z: this.z,
      happiness: this.happiness,
      fedToday: this.fedToday,
      productReady: this.productReady,
    };
  }
}
```

```js
// server/entities/Fish.js
// Fishing catch calculation

export class FishCalculator {
  constructor(fishData) {
    this.fishData = fishData;
    this.allFish = Object.entries(fishData);
  }

  /** Calculate a catch attempt based on location, player level, rod quality. */
  rollCatch(location, playerLevel, rodQuality = 1, baitBonus = 0) {
    // Filter fish available at this location and level
    const available = this.allFish.filter(([, f]) =>
      f.location === location && f.minLevel <= playerLevel
    );

    if (available.length === 0) return null;

    // Weight by inverse rarity, boosted by rod/bait
    const weights = available.map(([id, f]) => {
      const rarityWeight = [1, 0.3, 0.1, 0.02][f.rarity] || 0.5;
      return { id, fish: f, weight: rarityWeight * rodQuality + baitBonus };
    });

    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const w of weights) {
      roll -= w.weight;
      if (roll <= 0) return { id: w.id, ...w.fish };
    }

    return { id: weights[0].id, ...weights[0].fish };
  }
}
```

**Step 4: Commit**

```bash
git add server/entities/
git commit -m "feat: server entity classes (Player, Crop, NPC, Pet, Animal, Fish)"
```

---

### Task 11: GameWorld (master server game loop)

**Files:**
- Create: `server/game/GameWorld.js`

**Step 1: Implement GameWorld**

```js
// server/game/GameWorld.js
// The master game world — owns all state, runs the tick loop,
// processes player actions, and broadcasts updates.

import { v4 as uuid } from 'uuid';
import { TICK_RATE, TILE_TYPES, ACTIONS, TIME_SCALE } from '../../shared/constants.js';
import { isValidTile, tileIndex } from '../../shared/TileMap.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { TimeManager } from './TimeManager.js';
import { WeatherManager } from './WeatherManager.js';
import { Player } from '../entities/Player.js';
import { Crop } from '../entities/Crop.js';
import { NPC } from '../entities/NPC.js';
import { Pet } from '../entities/Pet.js';
import { Animal } from '../entities/Animal.js';
import { FishCalculator } from '../entities/Fish.js';
import { getDB } from '../db/database.js';

// Load data files
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../data');

const cropsData = JSON.parse(readFileSync(join(dataDir, 'crops.json'), 'utf-8'));
const animalsData = JSON.parse(readFileSync(join(dataDir, 'animals.json'), 'utf-8'));
const npcsData = JSON.parse(readFileSync(join(dataDir, 'npcs.json'), 'utf-8'));
const fishData = JSON.parse(readFileSync(join(dataDir, 'fish.json'), 'utf-8'));
const recipesData = JSON.parse(readFileSync(join(dataDir, 'recipes.json'), 'utf-8'));

export class GameWorld {
  constructor(io) {
    this.io = io;
    this.worldId = 'world_main';

    // Generate or load world
    const seed = this._getOrCreateSeed();
    this.terrainGen = new TerrainGenerator(seed);
    this.tiles = this.terrainGen.generate();
    this.time = new TimeManager();
    this.weather = new WeatherManager(seed);
    this.fishCalc = new FishCalculator(fishData);

    // Entity collections
    this.players = new Map();    // socketId -> Player
    this.crops = new Map();      // id -> Crop
    this.animals = new Map();    // id -> Animal
    this.pets = new Map();       // id -> Pet
    this.npcs = npcsData.map(d => new NPC(d));
    this.buildings = new Map();

    // Start tick loop
    this._tickInterval = null;
    this._lastTick = Date.now();
  }

  _getOrCreateSeed() {
    const db = getDB();
    let row = db.prepare('SELECT * FROM worlds WHERE id = ?').get(this.worldId);
    if (!row) {
      const seed = Math.floor(Math.random() * 2147483647);
      db.prepare('INSERT INTO worlds (id, seed) VALUES (?, ?)').run(this.worldId, seed);
      return seed;
    }
    // Restore time state
    this.time = new TimeManager({ season: row.season, day: row.day, hour: row.hour });
    return row.seed;
  }

  start() {
    console.log('GameWorld started. Tick rate:', TICK_RATE);
    this._tickInterval = setInterval(() => this._tick(), 1000 / TICK_RATE);
  }

  stop() {
    clearInterval(this._tickInterval);
    this._saveWorldState();
  }

  _tick() {
    const now = Date.now();
    const deltaSec = (now - this._lastTick) / 1000;
    this._lastTick = now;

    // Pause if no players
    if (this.players.size === 0) return;

    // Advance time
    const timeEvents = this.time.tick(deltaSec);

    // Calculate game hours elapsed this tick
    const gameHoursElapsed = (deltaSec * TIME_SCALE) / 3600;

    // Process time events
    for (const event of timeEvents) {
      if (event.type === 'newDay') {
        this._onNewDay();
      }
      if (event.type === 'newSeason') {
        this._onNewSeason(event.season);
      }
    }

    // Update crops
    for (const crop of this.crops.values()) {
      const data = cropsData[crop.cropType];
      if (data) {
        crop.tick(gameHoursElapsed, data);
      }
    }

    // Update NPC schedules
    for (const npc of this.npcs) {
      npc.updateSchedule(this.time.hour);
    }

    // Broadcast time update (every ~1 second real-time)
    if (Math.floor(now / 1000) !== Math.floor((now - deltaSec * 1000) / 1000)) {
      this.io.emit(ACTIONS.TIME_UPDATE, this.time.getState());
    }
  }

  _onNewDay() {
    // Weather change
    const newWeather = this.weather.onNewDay(this.time.season);
    this.io.emit(ACTIONS.WEATHER_UPDATE, { weather: newWeather });

    // Rain waters all crops
    if (this.weather.isRaining()) {
      for (const crop of this.crops.values()) {
        crop.watered = true;
      }
    }

    // Animal daily tick
    for (const animal of this.animals.values()) {
      animal.tickDaily();
    }

    // Pet daily tick
    for (const pet of this.pets.values()) {
      pet.tickDaily();
    }

    // Restore player energy
    for (const player of this.players.values()) {
      player.energy = player.maxEnergy;
    }

    // Save state
    this._saveWorldState();

    // Broadcast full update
    this._broadcastWorldUpdate();
  }

  _onNewSeason(season) {
    console.log('New season:', season);
    // Could remove out-of-season crops, trigger festivals, etc.
  }

  // ─── Player Actions ───

  handlePlayerJoin(socket, data) {
    const player = new Player({ name: data.name });
    player.socketId = socket.id;
    this.players.set(socket.id, player);

    // Send full world state to joining player
    socket.emit(ACTIONS.WORLD_STATE, this._getFullState(player.id));

    // Notify others
    socket.broadcast.emit(ACTIONS.PLAYER_JOIN, { player: player.getState() });

    console.log(`${player.name} joined (${this.players.size} players online)`);
  }

  handlePlayerLeave(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;
    this.players.delete(socketId);
    this.io.emit(ACTIONS.PLAYER_LEAVE, { playerId: player.id });
    console.log(`${player.name} left (${this.players.size} players online)`);
  }

  handlePlayerMove(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;
    player.x = data.x;
    player.z = data.z;
    this.io.emit(ACTIONS.WORLD_UPDATE, {
      type: 'playerMove',
      playerId: player.id,
      x: player.x, z: player.z,
    });
  }

  handleTill(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || !player.useEnergy(2)) return;
    if (!isValidTile(data.x, data.z)) return;

    const idx = tileIndex(data.x, data.z);
    const tile = this.tiles[idx];
    if (tile.type !== TILE_TYPES.DIRT && tile.type !== TILE_TYPES.GRASS) return;

    tile.type = TILE_TYPES.TILLED;
    this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'tileChange', x: data.x, z: data.z, tileType: TILE_TYPES.TILLED });
  }

  handlePlant(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    const seedId = data.cropType + '_seed';
    if (!player.hasItem(seedId)) return;
    if (!isValidTile(data.x, data.z)) return;

    const idx = tileIndex(data.x, data.z);
    if (this.tiles[idx].type !== TILE_TYPES.TILLED) return;

    // Check no crop already there
    for (const crop of this.crops.values()) {
      if (crop.tileX === data.x && crop.tileZ === data.z) return;
    }

    player.removeItem(seedId, 1);
    const crop = new Crop({ tileX: data.x, tileZ: data.z, cropType: data.cropType });
    this.crops.set(crop.id, crop);

    this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'cropPlanted', crop: crop.getState() });
    this._sendInventoryUpdate(socketId, player);
  }

  handleWater(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || !player.useEnergy(1)) return;

    for (const crop of this.crops.values()) {
      if (crop.tileX === data.x && crop.tileZ === data.z) {
        crop.watered = true;
        this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'cropWatered', cropId: crop.id });
        break;
      }
    }
  }

  handleHarvest(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    for (const [id, crop] of this.crops.entries()) {
      if (crop.tileX === data.x && crop.tileZ === data.z && crop.stage >= 3) {
        const cropData = cropsData[crop.cropType];
        if (!cropData) continue;

        player.addItem(crop.cropType, 1 + Math.floor(Math.random() * 2));
        player.addXP(cropData.xp);
        this.crops.delete(id);

        // Reset tile to tilled
        const idx = tileIndex(data.x, data.z);
        this.tiles[idx].type = TILE_TYPES.TILLED;

        this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'cropHarvested', cropId: id, x: data.x, z: data.z });
        this._sendInventoryUpdate(socketId, player);
        break;
      }
    }
  }

  handleFishCast(socketId, data) {
    const player = this.players.get(socketId);
    if (!player || !player.useEnergy(5)) return;

    // Determine location by tile type
    const idx = tileIndex(Math.floor(data.x), Math.floor(data.z));
    if (idx < 0 || idx >= this.tiles.length) return;
    if (this.tiles[idx].type !== TILE_TYPES.WATER) return;

    const location = 'pond'; // Simplified — could check coordinates for river/ocean
    const fish = this.fishCalc.rollCatch(location, player.level);

    if (fish) {
      player.addItem(fish.id, 1);
      player.addXP(5 + fish.rarity * 10);
      this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'fishCaught', playerId: player.id, fish });
      this._sendInventoryUpdate(socketId, player);
    } else {
      this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'fishMiss', playerId: player.id });
    }
  }

  handleNPCTalk(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    const npc = this.npcs.find(n => n.id === data.npcId);
    if (!npc) return;

    // Get or create relationship
    const db = getDB();
    let rel = db.prepare('SELECT * FROM npc_relationships WHERE player_id = ? AND npc_id = ?')
      .get(player.id, npc.id);

    if (!rel) {
      db.prepare('INSERT INTO npc_relationships (player_id, npc_id) VALUES (?, ?)')
        .run(player.id, npc.id);
      rel = { hearts: 0, talked_today: 0 };
    }

    // Talking gives +0.2 hearts per day (once)
    if (!rel.talked_today) {
      db.prepare('UPDATE npc_relationships SET hearts = MIN(hearts + 0.2, 10), talked_today = 1 WHERE player_id = ? AND npc_id = ?')
        .run(player.id, npc.id);
      rel.hearts = Math.min(rel.hearts + 0.2, 10);
    }

    const dialogue = npc.getDialogue(rel.hearts);
    this.io.to(socketId).emit(ACTIONS.WORLD_UPDATE, {
      type: 'npcDialogue',
      npcId: npc.id,
      npcName: npc.name,
      text: dialogue,
      hearts: rel.hearts,
    });
  }

  handleShopBuy(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    // Check if it's a crop seed
    const cropType = data.itemId.replace('_seed', '');
    const cropData = cropsData[cropType];
    if (cropData) {
      const cost = cropData.buyPrice * (data.quantity || 1);
      if (player.coins < cost) return;
      player.coins -= cost;
      player.addItem(data.itemId, data.quantity || 1);
      this._sendInventoryUpdate(socketId, player);
    }
  }

  handleShopSell(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    const quantity = data.quantity || 1;
    if (!player.hasItem(data.itemId, quantity)) return;

    // Look up sell price
    const cropData = cropsData[data.itemId];
    const price = cropData ? cropData.sellPrice : 10; // Default fallback

    player.removeItem(data.itemId, quantity);
    player.coins += price * quantity;
    player.addXP(2 * quantity);
    this._sendInventoryUpdate(socketId, player);
  }

  // ─── Helpers ───

  _sendInventoryUpdate(socketId, player) {
    this.io.to(socketId).emit(ACTIONS.INVENTORY_UPDATE, {
      inventory: player.inventory,
      coins: player.coins,
      xp: player.xp,
      level: player.level,
      energy: player.energy,
    });
  }

  _broadcastWorldUpdate() {
    const crops = Array.from(this.crops.values()).map(c => c.getState());
    const animals = Array.from(this.animals.values()).map(a => a.getState());
    const pets = Array.from(this.pets.values()).map(p => p.getState());
    this.io.emit(ACTIONS.WORLD_UPDATE, { type: 'fullSync', crops, animals, pets });
  }

  _getFullState(playerId) {
    return {
      playerId,
      tiles: this.tiles,
      crops: Array.from(this.crops.values()).map(c => c.getState()),
      animals: Array.from(this.animals.values()).map(a => a.getState()),
      pets: Array.from(this.pets.values()).map(p => p.getState()),
      npcs: this.npcs.map(n => n.getState()),
      players: Array.from(this.players.values()).map(p => p.getState()),
      buildings: Array.from(this.buildings.values()),
      time: this.time.getState(),
      weather: this.weather.getState(),
    };
  }

  _saveWorldState() {
    const db = getDB();
    const state = this.time.getState();
    db.prepare('UPDATE worlds SET season = ?, day = ?, hour = ?, weather = ? WHERE id = ?')
      .run(state.season, state.day, state.hour, this.weather.currentWeather, this.worldId);
  }
}
```

**Step 2: Commit**

```bash
git add server/game/GameWorld.js
git commit -m "feat: GameWorld with tick loop, farming, fishing, NPC, shop actions"
```

---

### Task 12: Server entry point (Express + Socket.io)

**Files:**
- Modify: `server/index.js`

**Step 1: Implement server/index.js**

```js
// server/index.js
// Express HTTP server + Socket.io WebSocket server.
// Serves the client and runs the authoritative game world.

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ACTIONS } from '../shared/constants.js';
import { GameWorld } from './game/GameWorld.js';
import { closeDB } from './db/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
});

const PORT = process.env.PORT || 3000;

// Serve static client files (production)
app.use(express.static(join(__dirname, '../dist')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', players: world.players.size });
});

// Create game world
const world = new GameWorld(io);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Player join
  socket.on(ACTIONS.PLAYER_JOIN, (data) => world.handlePlayerJoin(socket, data));

  // Player movement
  socket.on(ACTIONS.PLAYER_MOVE, (data) => world.handlePlayerMove(socket.id, data));

  // Farming actions
  socket.on(ACTIONS.FARM_TILL, (data) => world.handleTill(socket.id, data));
  socket.on(ACTIONS.FARM_PLANT, (data) => world.handlePlant(socket.id, data));
  socket.on(ACTIONS.FARM_WATER, (data) => world.handleWater(socket.id, data));
  socket.on(ACTIONS.FARM_HARVEST, (data) => world.handleHarvest(socket.id, data));

  // Fishing
  socket.on(ACTIONS.FISH_CAST, (data) => world.handleFishCast(socket.id, data));

  // NPC interaction
  socket.on(ACTIONS.NPC_TALK, (data) => world.handleNPCTalk(socket.id, data));

  // Shop
  socket.on(ACTIONS.SHOP_BUY, (data) => world.handleShopBuy(socket.id, data));
  socket.on(ACTIONS.SHOP_SELL, (data) => world.handleShopSell(socket.id, data));

  // Disconnect
  socket.on('disconnect', () => {
    world.handlePlayerLeave(socket.id);
  });
});

// Start server
world.start();
httpServer.listen(PORT, () => {
  console.log(`OurFarm server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  world.stop();
  closeDB();
  process.exit(0);
});
```

**Step 2: Commit**

```bash
git add server/index.js
git commit -m "feat: server entry point with Express + Socket.io + GameWorld wiring"
```

---

## Phase 3: Client Renderers

### Task 13: Terrain Renderer

**Files:**
- Create: `client/src/world/TerrainRenderer.js`

**Step 1: Implement TerrainRenderer**

```js
// client/src/world/TerrainRenderer.js
// Renders the tile grid as a colorful low-poly terrain mesh.

import * as THREE from 'three';
import { WORLD_SIZE, TILE_SIZE, TILE_TYPES, COLORS, SEASONS } from '@shared/constants.js';

export class TerrainRenderer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.tileColors = null; // Float32Array for per-face coloring
  }

  /** Build terrain mesh from tile data received from server */
  build(tiles, season = SEASONS.SPRING) {
    // Remove old mesh
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];
    const indices = [];

    const grassColor = new THREE.Color(
      season === SEASONS.SPRING ? COLORS.GRASS_SPRING
      : season === SEASONS.SUMMER ? COLORS.GRASS_SUMMER
      : season === SEASONS.FALL ? COLORS.GRASS_FALL
      : COLORS.GRASS_WINTER
    );

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const x = tile.x * TILE_SIZE;
      const z = tile.z * TILE_SIZE;
      const y = tile.height || 0;

      // Choose color based on tile type
      let color;
      switch (tile.type) {
        case TILE_TYPES.WATER: color = new THREE.Color(COLORS.WATER); break;
        case TILE_TYPES.SAND: color = new THREE.Color(COLORS.SAND); break;
        case TILE_TYPES.DIRT: color = new THREE.Color(COLORS.DIRT); break;
        case TILE_TYPES.TILLED: color = new THREE.Color(COLORS.TILLED); break;
        case TILE_TYPES.STONE: color = new THREE.Color(COLORS.STONE); break;
        case TILE_TYPES.PATH: color = new THREE.Color(COLORS.PATH); break;
        default: color = grassColor.clone(); break;
      }

      // Add slight color variation for natural look
      const variation = (Math.sin(tile.x * 13.37 + tile.z * 7.31) * 0.03);
      color.r = Math.max(0, Math.min(1, color.r + variation));
      color.g = Math.max(0, Math.min(1, color.g + variation));

      // 4 vertices per tile (quad)
      const vi = vertices.length / 3;
      const waterY = tile.type === TILE_TYPES.WATER ? -0.1 : y;
      vertices.push(
        x, waterY, z,
        x + TILE_SIZE, waterY, z,
        x + TILE_SIZE, waterY, z + TILE_SIZE,
        x, waterY, z + TILE_SIZE
      );

      // Color per vertex
      for (let j = 0; j < 4; j++) {
        colors.push(color.r, color.g, color.b);
      }

      // Two triangles per quad
      indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    // Store tile data for updates
    this.tiles = tiles;
    this.colorAttr = geometry.getAttribute('color');
  }

  /** Update a single tile's appearance (e.g., after tilling) */
  updateTile(x, z, newType, season = SEASONS.SPRING) {
    const idx = z * WORLD_SIZE + x;
    if (idx < 0 || idx >= this.tiles.length) return;

    this.tiles[idx].type = newType;

    const grassColor = new THREE.Color(
      season === SEASONS.SPRING ? COLORS.GRASS_SPRING
      : season === SEASONS.SUMMER ? COLORS.GRASS_SUMMER
      : season === SEASONS.FALL ? COLORS.GRASS_FALL
      : COLORS.GRASS_WINTER
    );

    let color;
    switch (newType) {
      case TILE_TYPES.WATER: color = new THREE.Color(COLORS.WATER); break;
      case TILE_TYPES.TILLED: color = new THREE.Color(COLORS.TILLED); break;
      case TILE_TYPES.DIRT: color = new THREE.Color(COLORS.DIRT); break;
      default: color = grassColor; break;
    }

    const vi = idx * 4;
    for (let j = 0; j < 4; j++) {
      this.colorAttr.setXYZ(vi + j, color.r, color.g, color.b);
    }
    this.colorAttr.needsUpdate = true;
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
  }
}
```

**Step 2: Commit**

```bash
git add client/src/world/TerrainRenderer.js
git commit -m "feat: TerrainRenderer with vertex-colored low-poly terrain"
```

---

### Task 14: Water Renderer (shader-based)

**Files:**
- Create: `client/src/world/WaterRenderer.js`

**Step 1: Implement WaterRenderer**

```js
// client/src/world/WaterRenderer.js
// Animated water surface using custom shaders.

import * as THREE from 'three';
import { WORLD_SIZE, TILE_SIZE, TILE_TYPES } from '@shared/constants.js';

const waterVertexShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;

  void main() {
    vUv = uv;
    vec3 pos = position;
    // Gentle wave animation
    float wave = sin(pos.x * 3.0 + uTime * 2.0) * 0.03
               + sin(pos.z * 2.5 + uTime * 1.5) * 0.02;
    pos.y += wave;
    vWave = wave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const waterFragmentShader = `
  uniform float uTime;
  varying vec2 vUv;
  varying float vWave;

  void main() {
    // Base water color with subtle animation
    vec3 shallow = vec3(0.29, 0.56, 0.85);
    vec3 deep = vec3(0.15, 0.35, 0.65);
    float blend = sin(vUv.x * 10.0 + uTime) * 0.5 + 0.5;
    vec3 color = mix(shallow, deep, blend * 0.3 + 0.35);

    // Foam/sparkle at wave peaks
    float sparkle = smoothstep(0.02, 0.03, vWave);
    color += sparkle * 0.3;

    gl_FragColor = vec4(color, 0.8);
  }
`;

export class WaterRenderer {
  constructor(scene) {
    this.scene = scene;
    this.meshes = [];
    this.uniforms = {
      uTime: { value: 0 },
    };
  }

  /** Build water overlays for all water tiles */
  build(tiles) {
    // Collect water tile positions
    const waterTiles = tiles.filter(t => t.type === TILE_TYPES.WATER);
    if (waterTiles.length === 0) return;

    // Create a merged geometry for all water tiles
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i < waterTiles.length; i++) {
      const t = waterTiles[i];
      const x = t.x * TILE_SIZE;
      const z = t.z * TILE_SIZE;
      const y = 0.01; // Slightly above terrain

      const vi = i * 4;
      vertices.push(
        x, y, z,
        x + TILE_SIZE, y, z,
        x + TILE_SIZE, y, z + TILE_SIZE,
        x, y, z + TILE_SIZE
      );
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    const material = new THREE.ShaderMaterial({
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);
    this.meshes.push(mesh);
  }

  /** Call every frame with delta time */
  update(delta) {
    this.uniforms.uTime.value += delta;
  }

  dispose() {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
```

**Step 2: Commit**

```bash
git add client/src/world/WaterRenderer.js
git commit -m "feat: WaterRenderer with animated shader-based water surface"
```

---

### Task 15: Crop, Weather, Building Renderers + Player/NPC/Pet entity renderers

**Files:**
- Create: `client/src/world/CropRenderer.js`
- Create: `client/src/world/WeatherRenderer.js`
- Create: `client/src/world/BuildingRenderer.js`
- Create: `client/src/entities/PlayerRenderer.js`
- Create: `client/src/entities/NPCRenderer.js`
- Create: `client/src/entities/PetRenderer.js`
- Create: `client/src/entities/AnimalRenderer.js`

These follow the same pattern: receive state from server, create/update/remove Three.js objects. Each renderer class has `build(stateArray)`, `update(delta)`, and `handleUpdate(data)` methods. They all use AssetGenerator for mesh creation.

**Step 1: Create CropRenderer.js**

```js
// client/src/world/CropRenderer.js
import * as THREE from 'three';
import { tileToWorld } from '@shared/TileMap.js';

export class CropRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.cropMeshes = new Map(); // cropId -> THREE.Group
  }

  build(crops) {
    for (const crop of crops) {
      this.addCrop(crop);
    }
  }

  addCrop(crop) {
    if (this.cropMeshes.has(crop.id)) this.removeCrop(crop.id);
    const mesh = this.assetGen.createCrop(crop.cropType, crop.stage);
    const pos = tileToWorld(crop.tileX, crop.tileZ);
    mesh.position.set(pos.x, 0, pos.z);
    this.scene.add(mesh);
    this.cropMeshes.set(crop.id, { mesh, data: crop });
  }

  updateCrop(cropId, newStage) {
    const entry = this.cropMeshes.get(cropId);
    if (!entry) return;
    this.scene.remove(entry.mesh);
    entry.data.stage = newStage;
    const newMesh = this.assetGen.createCrop(entry.data.cropType, newStage);
    newMesh.position.copy(entry.mesh.position);
    this.scene.add(newMesh);
    entry.mesh = newMesh;
  }

  removeCrop(cropId) {
    const entry = this.cropMeshes.get(cropId);
    if (entry) {
      this.scene.remove(entry.mesh);
      this.cropMeshes.delete(cropId);
    }
  }

  update(delta) {
    // Gentle swaying animation
    for (const { mesh } of this.cropMeshes.values()) {
      mesh.rotation.z = Math.sin(Date.now() * 0.001 + mesh.position.x) * 0.05;
    }
  }

  dispose() {
    for (const { mesh } of this.cropMeshes.values()) {
      this.scene.remove(mesh);
    }
    this.cropMeshes.clear();
  }
}
```

**Step 2: Create remaining renderers (compact pattern)**

Each entity renderer follows the same add/remove/update pattern. Create `PlayerRenderer.js`, `NPCRenderer.js`, `PetRenderer.js`, `AnimalRenderer.js`, `WeatherRenderer.js`, `BuildingRenderer.js` using the same structure as CropRenderer — a Map of id→mesh, with methods to sync from server state. They use `AssetGenerator` for mesh creation.

```js
// client/src/entities/PlayerRenderer.js
import { tileToWorld } from '@shared/TileMap.js';

export class PlayerRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.playerMeshes = new Map();
  }

  addPlayer(playerState, isLocal = false) {
    const mesh = this.assetGen.createPlayer(isLocal ? 0x4488ff : 0x44cc44);
    mesh.position.set(playerState.x, 0, playerState.z);
    this.scene.add(mesh);
    this.playerMeshes.set(playerState.id, { mesh, target: { x: playerState.x, z: playerState.z } });
  }

  updatePosition(playerId, x, z) {
    const entry = this.playerMeshes.get(playerId);
    if (entry) {
      entry.target = { x, z };
    }
  }

  removePlayer(playerId) {
    const entry = this.playerMeshes.get(playerId);
    if (entry) {
      this.scene.remove(entry.mesh);
      this.playerMeshes.delete(playerId);
    }
  }

  update(delta) {
    // Smooth interpolation toward target position
    for (const { mesh, target } of this.playerMeshes.values()) {
      mesh.position.x += (target.x - mesh.position.x) * 5 * delta;
      mesh.position.z += (target.z - mesh.position.z) * 5 * delta;
    }
  }

  getLocalPlayerPosition(playerId) {
    const entry = this.playerMeshes.get(playerId);
    return entry ? entry.mesh.position : null;
  }

  dispose() {
    for (const { mesh } of this.playerMeshes.values()) this.scene.remove(mesh);
    this.playerMeshes.clear();
  }
}
```

```js
// client/src/entities/NPCRenderer.js
export class NPCRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.npcMeshes = new Map();
  }

  build(npcs) {
    for (const npc of npcs) {
      const mesh = this.assetGen.createNPC({
        skinColor: parseInt(npc.skinColor),
        shirtColor: parseInt(npc.shirtColor),
        hairColor: parseInt(npc.hairColor),
      });
      mesh.position.set(npc.x, 0, npc.z);
      mesh.userData = { npcId: npc.id, name: npc.name };
      this.scene.add(mesh);
      this.npcMeshes.set(npc.id, { mesh, target: { x: npc.x, z: npc.z } });
    }
  }

  updatePositions(npcs) {
    for (const npc of npcs) {
      const entry = this.npcMeshes.get(npc.id);
      if (entry) entry.target = { x: npc.x, z: npc.z };
    }
  }

  update(delta) {
    for (const { mesh, target } of this.npcMeshes.values()) {
      mesh.position.x += (target.x - mesh.position.x) * 2 * delta;
      mesh.position.z += (target.z - mesh.position.z) * 2 * delta;
    }
  }

  getNPCAtPosition(x, z, radius = 1.5) {
    for (const [id, { mesh }] of this.npcMeshes) {
      const dx = mesh.position.x - x;
      const dz = mesh.position.z - z;
      if (Math.sqrt(dx * dx + dz * dz) < radius) {
        return mesh.userData.npcId;
      }
    }
    return null;
  }

  dispose() {
    for (const { mesh } of this.npcMeshes.values()) this.scene.remove(mesh);
    this.npcMeshes.clear();
  }
}
```

```js
// client/src/entities/PetRenderer.js
export class PetRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.petMeshes = new Map();
  }

  build(pets) {
    for (const pet of pets) this.addPet(pet);
  }

  addPet(pet) {
    const mesh = this.assetGen.createPet(pet.type, {
      bodySize: pet.bodySize,
      earSize: pet.earSize,
      tailLength: pet.tailLength,
      color: pet.color,
    });
    mesh.position.set(pet.x, 0, pet.z);
    mesh.userData = { petId: pet.id, name: pet.name };
    this.scene.add(mesh);
    this.petMeshes.set(pet.id, { mesh, data: pet });
  }

  update(delta) {
    // Pets idle — slight bobbing
    for (const { mesh } of this.petMeshes.values()) {
      mesh.position.y = Math.sin(Date.now() * 0.003 + mesh.position.x) * 0.02;
    }
  }

  dispose() {
    for (const { mesh } of this.petMeshes.values()) this.scene.remove(mesh);
    this.petMeshes.clear();
  }
}
```

```js
// client/src/entities/AnimalRenderer.js
export class AnimalRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.animalMeshes = new Map();
  }

  build(animals) {
    for (const animal of animals) {
      const mesh = this.assetGen.createAnimal(animal.type);
      mesh.position.set(animal.x, 0, animal.z);
      this.scene.add(mesh);
      this.animalMeshes.set(animal.id, { mesh, data: animal });
    }
  }

  update(delta) {
    // Animals wander slightly
    for (const { mesh, data } of this.animalMeshes.values()) {
      mesh.position.y = Math.sin(Date.now() * 0.002) * 0.01;
      mesh.rotation.y += Math.sin(Date.now() * 0.0005 + mesh.position.x) * 0.001;
    }
  }

  dispose() {
    for (const { mesh } of this.animalMeshes.values()) this.scene.remove(mesh);
    this.animalMeshes.clear();
  }
}
```

```js
// client/src/world/WeatherRenderer.js
import * as THREE from 'three';
import { WEATHER } from '@shared/constants.js';

export class WeatherRenderer {
  constructor(scene) {
    this.scene = scene;
    this.particles = null;
    this.currentWeather = WEATHER.SUNNY;
  }

  setWeather(weather) {
    this.currentWeather = weather;
    this._clearParticles();

    if (weather === WEATHER.RAINY || weather === WEATHER.STORMY) {
      this._createRain();
    } else if (weather === WEATHER.SNOWY) {
      this._createSnow();
    }
  }

  _createRain() {
    const count = 2000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xaaccff, size: 0.05, transparent: true, opacity: 0.6 });
    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  _createSnow() {
    const count = 1000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1, transparent: true, opacity: 0.8 });
    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  update(delta, cameraTarget) {
    if (!this.particles) return;
    const positions = this.particles.geometry.getAttribute('position');
    const isSnow = this.currentWeather === WEATHER.SNOWY;
    const speed = isSnow ? 2 : 15;

    for (let i = 0; i < positions.count; i++) {
      let y = positions.getY(i) - speed * delta;
      if (isSnow) {
        positions.setX(i, positions.getX(i) + Math.sin(Date.now() * 0.001 + i) * 0.02);
      }
      if (y < 0) y = 20;
      positions.setY(i, y);
    }
    positions.needsUpdate = true;

    // Center particles on camera
    if (cameraTarget) {
      this.particles.position.x = cameraTarget.x;
      this.particles.position.z = cameraTarget.z;
    }
  }

  _clearParticles() {
    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles.geometry.dispose();
      this.particles.material.dispose();
      this.particles = null;
    }
  }

  dispose() { this._clearParticles(); }
}
```

```js
// client/src/world/BuildingRenderer.js
export class BuildingRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.buildingMeshes = new Map();
  }

  build(buildings) {
    for (const b of buildings) {
      const mesh = this.assetGen.createBuilding(b.type);
      mesh.position.set(b.tile_x || b.tileX, 0, b.tile_z || b.tileZ);
      this.scene.add(mesh);
      this.buildingMeshes.set(b.id, mesh);
    }
  }

  dispose() {
    for (const mesh of this.buildingMeshes.values()) this.scene.remove(mesh);
    this.buildingMeshes.clear();
  }
}
```

**Step 3: Commit**

```bash
git add client/src/world/ client/src/entities/
git commit -m "feat: all client renderers (crops, water, weather, buildings, players, NPCs, pets, animals)"
```

---

## Phase 4: UI Systems

### Task 16: HUD and UI components

**Files:**
- Create: `client/src/ui/HUD.js`
- Create: `client/src/ui/Inventory.js`
- Create: `client/src/ui/DialogueUI.js`

These are DOM-based UI overlays that update from game state.

**Step 1: Create HUD.js**

```js
// client/src/ui/HUD.js
// Heads-up display showing coins, XP, time, energy, toolbar.

import { SEASON_NAMES, WEATHER } from '@shared/constants.js';

const WEATHER_ICONS = { 0: 'Sunny', 1: 'Cloudy', 2: 'Rainy', 3: 'Stormy', 4: 'Snowy' };
const TOOL_NAMES = ['Hoe', 'Water', 'Pick', 'Axe', 'Rod', 'Seeds'];

export class HUD {
  constructor(container) {
    this.container = container;
    this.activeSlot = 0;
    this.onSlotSelect = null;

    this.container.innerHTML = `
      <div class="hud-group" id="hud-stats">
        <div class="hud-item" id="hud-coins">Coins: 500</div>
        <div class="hud-item" id="hud-level">Lv 1</div>
        <div class="hud-item" id="hud-xp">XP: 0</div>
        <div class="hud-item" id="hud-energy">Energy: 100</div>
      </div>
      <div class="hud-group" id="hud-time">
        <div class="hud-item" id="hud-season">Spring</div>
        <div class="hud-item" id="hud-day">Day 1</div>
        <div class="hud-item" id="hud-clock">6:00 AM</div>
        <div class="hud-item" id="hud-weather">Sunny</div>
      </div>
    `;

    // Toolbar at bottom
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'toolbar';
    for (let i = 0; i < TOOL_NAMES.length; i++) {
      const slot = document.createElement('div');
      slot.className = 'toolbar-slot' + (i === 0 ? ' active' : '');
      slot.textContent = TOOL_NAMES[i];
      slot.dataset.slot = i;
      slot.addEventListener('click', () => this.selectSlot(i));
      this.toolbar.appendChild(slot);
    }
    document.getElementById('ui-overlay').appendChild(this.toolbar);
  }

  selectSlot(index) {
    this.activeSlot = index;
    const slots = this.toolbar.querySelectorAll('.toolbar-slot');
    slots.forEach((s, i) => s.classList.toggle('active', i === index));
    if (this.onSlotSelect) this.onSlotSelect(index);
  }

  updateStats(data) {
    if (data.coins !== undefined) document.getElementById('hud-coins').textContent = `Coins: ${data.coins}`;
    if (data.level !== undefined) document.getElementById('hud-level').textContent = `Lv ${data.level}`;
    if (data.xp !== undefined) document.getElementById('hud-xp').textContent = `XP: ${data.xp}`;
    if (data.energy !== undefined) document.getElementById('hud-energy').textContent = `Energy: ${Math.floor(data.energy)}`;
  }

  updateTime(data) {
    if (data.season !== undefined) document.getElementById('hud-season').textContent = SEASON_NAMES[data.season];
    if (data.day !== undefined) document.getElementById('hud-day').textContent = `Day ${data.day}`;
    if (data.hour !== undefined) {
      const h = Math.floor(data.hour);
      const m = Math.floor((data.hour - h) * 60);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      document.getElementById('hud-clock').textContent = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
    }
  }

  updateWeather(weather) {
    document.getElementById('hud-weather').textContent = WEATHER_ICONS[weather] || 'Sunny';
  }
}
```

**Step 2: Create Inventory.js**

```js
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
```

**Step 3: Create DialogueUI.js**

```js
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
```

**Step 4: Commit**

```bash
git add client/src/ui/
git commit -m "feat: UI components (HUD, Inventory, DialogueUI)"
```

---

## Phase 5: Client Main — Wire Everything Together

### Task 17: Client main.js — full game bootstrap

**Files:**
- Modify: `client/src/main.js`

**Step 1: Implement the full client entry point**

```js
// client/src/main.js
// OurFarm client entry point.
// Connects to server, sets up Three.js scene, wires all systems together.

import { SceneManager } from './engine/SceneManager.js';
import { InputManager } from './engine/InputManager.js';
import { AssetGenerator } from './engine/AssetGenerator.js';
import { NetworkClient } from './network/NetworkClient.js';
import { TerrainRenderer } from './world/TerrainRenderer.js';
import { WaterRenderer } from './world/WaterRenderer.js';
import { CropRenderer } from './world/CropRenderer.js';
import { WeatherRenderer } from './world/WeatherRenderer.js';
import { BuildingRenderer } from './world/BuildingRenderer.js';
import { PlayerRenderer } from './entities/PlayerRenderer.js';
import { NPCRenderer } from './entities/NPCRenderer.js';
import { PetRenderer } from './entities/PetRenderer.js';
import { AnimalRenderer } from './entities/AnimalRenderer.js';
import { HUD } from './ui/HUD.js';
import { InventoryUI } from './ui/Inventory.js';
import { DialogueUI } from './ui/DialogueUI.js';
import { tileToWorld } from '@shared/TileMap.js';
import { TILE_TYPES } from '@shared/constants.js';

async function main() {
  // ─── Engine Setup ───
  const canvas = document.getElementById('game-canvas');
  const sceneManager = new SceneManager(canvas);
  const input = new InputManager(sceneManager);
  const assets = new AssetGenerator();

  // ─── Renderers ───
  const terrain = new TerrainRenderer(sceneManager.scene);
  const water = new WaterRenderer(sceneManager.scene);
  const crops = new CropRenderer(sceneManager.scene, assets);
  const weather = new WeatherRenderer(sceneManager.scene);
  const buildings = new BuildingRenderer(sceneManager.scene, assets);
  const players = new PlayerRenderer(sceneManager.scene, assets);
  const npcs = new NPCRenderer(sceneManager.scene, assets);
  const pets = new PetRenderer(sceneManager.scene, assets);
  const animals = new AnimalRenderer(sceneManager.scene, assets);

  // ─── UI ───
  const hud = new HUD(document.getElementById('hud'));
  const inventoryUI = new InventoryUI(document.getElementById('inventory-panel'));
  const dialogueUI = new DialogueUI(document.getElementById('dialogue-panel'));

  // ─── Network ───
  const network = new NetworkClient();

  // Prompt for player name
  const playerName = prompt('Enter your farmer name:', 'Farmer') || 'Farmer';

  try {
    const state = await network.connect(playerName);

    // ─── Build world from server state ───
    terrain.build(state.tiles, state.time.season);
    water.build(state.tiles);
    crops.build(state.crops);
    npcs.build(state.npcs);
    pets.build(state.pets);
    animals.build(state.animals);
    buildings.build(state.buildings);

    // Add players
    for (const p of state.players) {
      players.addPlayer(p, p.id === state.playerId);
    }

    // Update HUD
    const localPlayer = state.players.find(p => p.id === state.playerId);
    if (localPlayer) {
      hud.updateStats(localPlayer);
      inventoryUI.update(localPlayer.inventory);
    }
    hud.updateTime(state.time);
    hud.updateWeather(state.weather.weather);

    // Center camera on player
    if (localPlayer) {
      sceneManager.panTo(localPlayer.x, localPlayer.z);
    }

    // ─── Current tool state ───
    let activeTool = 0;
    const toolActions = ['hoe', 'watering_can', 'pickaxe', 'axe', 'fishing_rod', 'seeds'];
    let selectedSeed = 'wheat';

    hud.onSlotSelect = (slot) => {
      activeTool = slot;
    };

    // ─── Handle tile clicks ───
    input.on('tileClick', ({ tile, worldPos, button }) => {
      if (dialogueUI.visible) return;

      // Right-click or check for NPC
      const npcId = npcs.getNPCAtPosition(worldPos.x, worldPos.z);
      if (npcId) {
        network.sendNPCTalk(npcId);
        return;
      }

      // Move player to clicked position
      network.sendMove(worldPos.x, worldPos.z);

      // Perform tool action
      const tool = toolActions[activeTool];
      switch (tool) {
        case 'hoe':
          network.sendTill(tile.x, tile.z);
          break;
        case 'watering_can':
          network.sendWater(tile.x, tile.z);
          break;
        case 'seeds':
          network.sendPlant(tile.x, tile.z, selectedSeed);
          break;
        case 'fishing_rod':
          network.sendFishCast(worldPos.x, worldPos.z);
          break;
        case 'pickaxe':
          // Harvest if there's a crop, else mine
          network.sendHarvest(tile.x, tile.z);
          break;
      }
    });

    // ─── Keyboard shortcuts ───
    input.on('keyDown', ({ key }) => {
      if (key === 'e' || key === 'E') inventoryUI.toggle();
      if (key >= '1' && key <= '6') hud.selectSlot(parseInt(key) - 1);
    });

    // ─── Network event handlers ───
    network.on('worldUpdate', (data) => {
      switch (data.type) {
        case 'playerMove':
          players.updatePosition(data.playerId, data.x, data.z);
          if (data.playerId === network.playerId) {
            sceneManager.panTo(data.x, data.z);
          }
          break;
        case 'tileChange':
          terrain.updateTile(data.x, data.z, data.tileType);
          break;
        case 'cropPlanted':
          crops.addCrop(data.crop);
          break;
        case 'cropWatered':
          // Visual feedback could be added here
          break;
        case 'cropHarvested':
          crops.removeCrop(data.cropId);
          break;
        case 'fishCaught':
          console.log('Caught:', data.fish.name);
          break;
        case 'fishMiss':
          console.log('The fish got away...');
          break;
        case 'npcDialogue':
          dialogueUI.show(data.npcName, data.text);
          break;
        case 'fullSync':
          crops.dispose();
          crops.build(data.crops);
          break;
      }
    });

    network.on('timeUpdate', (data) => hud.updateTime(data));
    network.on('weatherUpdate', (data) => {
      hud.updateWeather(data.weather);
      weather.setWeather(data.weather);
    });
    network.on('inventoryUpdate', (data) => {
      hud.updateStats(data);
      inventoryUI.update(data.inventory);
    });
    network.on('playerJoin', (data) => {
      players.addPlayer(data.player, false);
    });
    network.on('playerLeave', (data) => {
      players.removePlayer(data.playerId);
    });

    // ─── Render loop ───
    sceneManager.onUpdate((delta) => {
      water.update(delta);
      crops.update(delta);
      weather.update(delta, sceneManager.cameraTarget);
      players.update(delta);
      npcs.update(delta);
      pets.update(delta);
      animals.update(delta);
    });

    sceneManager.start();
    console.log('OurFarm started!');

  } catch (err) {
    console.error('Failed to connect:', err);
    document.body.innerHTML = '<div style="color:white;padding:20px;font-family:sans-serif"><h2>Connection Failed</h2><p>Make sure the server is running on port 3000.</p><p>Run: <code>npm run dev:server</code></p></div>';
  }
}

main();
```

**Step 2: Commit**

```bash
git add client/src/main.js
git commit -m "feat: client main.js wiring all systems together"
```

---

## Phase 6: Final Setup and Testing

### Task 18: Verify everything builds and runs

**Step 1: Run the server**

```bash
npm run dev:server
```
Expected: "OurFarm server running on http://localhost:3000"

**Step 2: Run the client dev server**

```bash
npm run dev:client
```
Expected: Vite dev server opens browser, Three.js scene renders with terrain.

**Step 3: Test basic gameplay**

- Click tiles with hoe selected to till
- Switch to seeds and click tilled tiles to plant
- Watch crops grow over time
- Click harvestable crops to collect
- Open inventory with 'E' key
- Click near an NPC to trigger dialogue

**Step 4: Test multiplayer**

- Open a second browser tab to the same URL
- Verify both players appear in the world
- Verify actions from one player are visible to the other

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: OurFarm v0.1 — complete farming sim with multiplayer"
```
