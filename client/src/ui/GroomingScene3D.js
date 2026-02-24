// client/src/ui/GroomingScene3D.js
// Secondary Three.js renderer for the grooming mini-game overlay.
// Provides camera, lighting, orbit controls, raycasting, and render loop.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildGroomingDog } from './GroomingDogBuilder.js';

const CAMERA_FOV = 40;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 50;
const CAMERA_POS = new THREE.Vector3(0, 0.5, 2.0);
const CAMERA_TARGET = new THREE.Vector3(0, 0.3, 0);

const POLAR_MIN = 0.3;
const POLAR_MAX = 1.4;

export class GroomingScene3D {
  /**
   * @param {HTMLCanvasElement} canvas — DOM canvas element to render into
   */
  constructor(canvas) {
    this._canvas = canvas;
    this._running = false;
    this._rafId = null;
    this._dogGroup = null;
    this._zoneMeshes = [];
    this._overlayMeshes = [];
    this._glowMeshes = [];

    // --- Renderer ---
    this._renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setClearColor(0x000000, 0);

    // --- Scene ---
    this._scene = new THREE.Scene();

    // --- Camera ---
    const aspect = canvas.width / canvas.height || 1;
    this._camera = new THREE.PerspectiveCamera(
      CAMERA_FOV, aspect, CAMERA_NEAR, CAMERA_FAR
    );
    this._camera.position.copy(CAMERA_POS);
    this._camera.lookAt(CAMERA_TARGET);

    // --- Orbit Controls ---
    this._controls = new OrbitControls(this._camera, canvas);
    this._controls.target.copy(CAMERA_TARGET);
    this._controls.enablePan = false;
    this._controls.enableZoom = false;
    this._controls.enableDamping = true;
    this._controls.dampingFactor = 0.08;
    this._controls.minPolarAngle = POLAR_MIN;
    this._controls.maxPolarAngle = POLAR_MAX;
    this._controls.update();

    // --- Lighting (warm salon) ---
    this._setupLighting();

    // --- Raycaster (reused) ---
    this._raycaster = new THREE.Raycaster();
    this._pointerNDC = new THREE.Vector2();
  }

  // ─── Lighting ──────────────────────────────────────────────

  _setupLighting() {
    // Warm ambient fill
    const ambient = new THREE.AmbientLight(0xfff5e6, 0.6);
    this._scene.add(ambient);

    // Key light — warm white, above-front
    const key = new THREE.PointLight(0xffeedd, 1.2, 20);
    key.position.set(0.5, 3.0, 2.0);
    this._scene.add(key);

    // Fill light — soft blue from the side for contrast
    const fill = new THREE.PointLight(0xaaccff, 0.4, 15);
    fill.position.set(-2.0, 1.0, -0.5);
    this._scene.add(fill);

    // Hemisphere — ground/sky colour blend
    const hemi = new THREE.HemisphereLight(0xfff8ee, 0x8b7355, 0.35);
    this._scene.add(hemi);
  }

  // ─── Dog Loading ───────────────────────────────────────────

  /**
   * Build and add the grooming dog model to the scene.
   * @param {object} petData — pet data from the server (breed, name, etc.)
   * @returns {{ group: THREE.Group, parts: object, zones: THREE.Mesh[], overlays: THREE.Mesh[], glowMeshes: THREE.Mesh[] }}
   */
  loadDog(petData) {
    // Remove any previously loaded dog
    if (this._dogGroup) {
      this._scene.remove(this._dogGroup);
      this._dogGroup = null;
      this._zoneMeshes = [];
      this._overlayMeshes = [];
      this._glowMeshes = [];
    }

    const { group, parts, zones, overlays, glowMeshes } = buildGroomingDog(petData);
    this._dogGroup = group;
    this._zoneMeshes = zones;
    this._overlayMeshes = overlays;
    this._glowMeshes = glowMeshes;
    this._scene.add(group);

    return { group, parts, zones, overlays, glowMeshes };
  }

  // ─── Render Loop ───────────────────────────────────────────

  /** Start the requestAnimationFrame render loop. */
  start() {
    if (this._running) return;
    this._running = true;
    this._tick();
  }

  /** Stop the render loop. */
  stop() {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** @private */
  _tick() {
    if (!this._running) return;
    this._rafId = requestAnimationFrame(() => this._tick());
    this._controls.update();
    this._renderer.render(this._scene, this._camera);
  }

  // ─── Raycasting ────────────────────────────────────────────

  /**
   * Cast a ray from canvas pixel coordinates into the zone meshes.
   * @param {number} canvasX — x position relative to canvas left edge
   * @param {number} canvasY — y position relative to canvas top edge
   * @returns {{ point: THREE.Vector3, zone: string } | null}
   */
  raycastFromPointer(canvasX, canvasY) {
    if (this._zoneMeshes.length === 0) return null;

    const rect = this._canvas.getBoundingClientRect();
    // Convert canvas-local pixel coords to NDC (-1..+1)
    this._pointerNDC.x = ((canvasX) / rect.width) * 2 - 1;
    this._pointerNDC.y = -((canvasY) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._pointerNDC, this._camera);
    const hits = this._raycaster.intersectObjects(this._zoneMeshes, false);

    if (hits.length === 0) return null;

    const hit = hits[0];
    const zone = hit.object.userData.zone || null;
    return { point: hit.point.clone(), zone };
  }

  // ─── Resize ────────────────────────────────────────────────

  /**
   * Resize the renderer and update camera aspect ratio.
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    this._renderer.setSize(width, height);
    this._camera.aspect = width / height;
    this._camera.updateProjectionMatrix();
  }

  // ─── Cleanup ───────────────────────────────────────────────

  /** Full teardown: stop loop, dispose renderer, free GPU resources. */
  dispose() {
    this.stop();

    // Dispose orbit controls
    this._controls.dispose();

    // Walk the scene and dispose all geometries + materials
    this._scene.traverse((obj) => {
      if (obj.geometry) {
        obj.geometry.dispose();
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    // Dispose the renderer itself
    this._renderer.dispose();

    // Clear references
    this._dogGroup = null;
    this._zoneMeshes = [];
    this._overlayMeshes = [];
    this._glowMeshes = [];
    this._scene = null;
    this._camera = null;
    this._renderer = null;
    this._controls = null;
  }
}
