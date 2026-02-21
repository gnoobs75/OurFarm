// client/src/ui/DebugWindow.js
// On-screen debug overlay with FPS, frame time, renderer stats, and entity counts.
// Toggle with F3 key.

export class DebugWindow {
  constructor() {
    this.visible = false;
    this.el = document.createElement('div');
    this.el.id = 'debug-window';
    this.el.className = 'hidden';
    document.getElementById('ui-overlay').appendChild(this.el);

    // FPS tracking
    this._frames = 0;
    this._lastFpsUpdate = performance.now();
    this._fps = 0;
    this._frameTime = 0;
    this._minFps = Infinity;
    this._maxFps = 0;
    this._fpsHistory = new Float32Array(120); // 2 seconds of samples
    this._historyIndex = 0;

    // Entity counts (set externally)
    this._entityCounts = {};

    // Renderer info (set externally)
    this._rendererInfo = null;

    // Build static DOM structure
    this._buildDOM();

    // Update display at ~4Hz to avoid DOM thrash
    this._displayInterval = setInterval(() => this._updateDisplay(), 250);
  }

  _buildDOM() {
    this.el.innerHTML = `
      <div class="debug-header">DEBUG <span class="debug-toggle">[F3]</span></div>
      <div class="debug-section">
        <div class="debug-label">Performance</div>
        <div class="debug-row"><span>FPS:</span><span id="dbg-fps">--</span></div>
        <div class="debug-row"><span>Frame:</span><span id="dbg-frametime">--</span></div>
        <div class="debug-row"><span>Min/Max:</span><span id="dbg-minmax">--</span></div>
        <canvas id="dbg-fps-graph" width="276" height="50"></canvas>
      </div>
      <div class="debug-section">
        <div class="debug-label">Renderer</div>
        <div class="debug-row"><span>Draw calls:</span><span id="dbg-drawcalls">--</span></div>
        <div class="debug-row"><span>Triangles:</span><span id="dbg-triangles">--</span></div>
        <div class="debug-row"><span>Geometries:</span><span id="dbg-geometries">--</span></div>
        <div class="debug-row"><span>Textures:</span><span id="dbg-textures">--</span></div>
      </div>
      <div class="debug-section">
        <div class="debug-label">Entities</div>
        <div id="dbg-entities"></div>
      </div>
      <div class="debug-section">
        <div class="debug-label">World</div>
        <div id="dbg-world"></div>
      </div>
    `;

    // Cache element refs
    this._elFps = this.el.querySelector('#dbg-fps');
    this._elFrameTime = this.el.querySelector('#dbg-frametime');
    this._elMinMax = this.el.querySelector('#dbg-minmax');
    this._elDrawCalls = this.el.querySelector('#dbg-drawcalls');
    this._elTriangles = this.el.querySelector('#dbg-triangles');
    this._elGeometries = this.el.querySelector('#dbg-geometries');
    this._elTextures = this.el.querySelector('#dbg-textures');
    this._elEntities = this.el.querySelector('#dbg-entities');
    this._elWorld = this.el.querySelector('#dbg-world');
    this._canvas = this.el.querySelector('#dbg-fps-graph');
    this._ctx = this._canvas.getContext('2d');
  }

  toggle() {
    this.visible = !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
    if (this.visible) {
      this._minFps = Infinity;
      this._maxFps = 0;
      this._fpsHistory.fill(0);
      this._historyIndex = 0;
    }
  }

  /** Call every frame from the render loop with delta in seconds */
  update(delta) {
    this._frames++;
    this._frameTime = delta * 1000;

    const now = performance.now();
    const elapsed = now - this._lastFpsUpdate;

    if (elapsed >= 250) {
      this._fps = Math.round((this._frames / elapsed) * 1000);
      this._frames = 0;
      this._lastFpsUpdate = now;

      if (this._fps > 0 && this._fps < 1000) {
        if (this._fps < this._minFps) this._minFps = this._fps;
        if (this._fps > this._maxFps) this._maxFps = this._fps;
      }

      this._fpsHistory[this._historyIndex % this._fpsHistory.length] = this._fps;
      this._historyIndex++;
    }
  }

  /** Set the Three.js renderer for reading render info */
  setRenderer(renderer) {
    this._rendererInfo = renderer.info;
  }

  /** Update entity counts. Pass an object like { Players: 2, NPCs: 6, Crops: 12 } */
  setEntityCounts(counts) {
    this._entityCounts = counts;
  }

  /** Update world info. Pass an object like { Season: 'Spring', Day: 3, Weather: 'Sunny' } */
  setWorldInfo(info) {
    this._worldInfo = info;
  }

  _updateDisplay() {
    if (!this.visible) return;

    // FPS
    const fpsColor = this._fps >= 55 ? '#4f4' : this._fps >= 30 ? '#ff4' : '#f44';
    this._elFps.textContent = this._fps;
    this._elFps.style.color = fpsColor;
    this._elFrameTime.textContent = `${this._frameTime.toFixed(1)}ms`;
    this._elMinMax.textContent = `${this._minFps === Infinity ? '--' : this._minFps} / ${this._maxFps === 0 ? '--' : this._maxFps}`;

    // Renderer
    if (this._rendererInfo) {
      const r = this._rendererInfo.render;
      const m = this._rendererInfo.memory;
      this._elDrawCalls.textContent = r.calls;
      this._elTriangles.textContent = r.triangles.toLocaleString();
      this._elGeometries.textContent = m.geometries;
      this._elTextures.textContent = m.textures;
    }

    // Entities
    const entLines = Object.entries(this._entityCounts)
      .map(([k, v]) => `<div class="debug-row"><span>${k}:</span><span>${v}</span></div>`)
      .join('');
    this._elEntities.innerHTML = entLines;

    // World
    if (this._worldInfo) {
      const worldLines = Object.entries(this._worldInfo)
        .map(([k, v]) => `<div class="debug-row"><span>${k}:</span><span>${v}</span></div>`)
        .join('');
      this._elWorld.innerHTML = worldLines;
    }

    // FPS graph
    this._drawGraph();
  }

  _drawGraph() {
    const ctx = this._ctx;
    const w = this._canvas.width;
    const h = this._canvas.height;
    const len = this._fpsHistory.length;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, w, h);

    // 60fps line
    const target60 = h - (60 / 120) * h;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(0, target60);
    ctx.lineTo(w, target60);
    ctx.stroke();

    // 30fps line
    const target30 = h - (30 / 120) * h;
    ctx.beginPath();
    ctx.moveTo(0, target30);
    ctx.lineTo(w, target30);
    ctx.stroke();

    // FPS line
    ctx.strokeStyle = '#4f4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const idx = (this._historyIndex - len + i + len * 2) % len;
      const fps = this._fpsHistory[idx];
      const x = (i / len) * w;
      const y = h - Math.min(fps / 120, 1) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  dispose() {
    clearInterval(this._displayInterval);
    this.el.remove();
  }
}
