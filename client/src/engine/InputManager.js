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
