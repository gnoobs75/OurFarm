// client/src/engine/SceneManager.js
// Manages the Three.js scene, isometric camera, renderer, and resize handling.

import * as THREE from 'three';
import { WORLD_SIZE } from '@shared/constants.js';

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
    this.scene.fog = new THREE.Fog(0x87ceeb, 100, 200);

    // Isometric camera
    const aspect = window.innerWidth / window.innerHeight;
    const frustum = 16;
    this.camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect,
      frustum, -frustum,
      0.1, 200
    );
    // Position for isometric view (45deg azimuth, ~30deg elevation)
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
    // Ambient — warm soft fill
    this.ambientLight = new THREE.AmbientLight(0xfff8ee, 0.55);
    this.scene.add(this.ambientLight);

    // Sun — warm golden-hour, lower angle for longer shadows
    this.sunLight = new THREE.DirectionalLight(0xffe0a0, 1.1);
    this.sunLight.position.set(20, 30, 15);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -50;
    this.sunLight.shadow.camera.right = 50;
    this.sunLight.shadow.camera.top = 50;
    this.sunLight.shadow.camera.bottom = -50;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 120;
    this.scene.add(this.sunLight);

    // Hemisphere — warm sky to earthy ground
    this.hemiLight = new THREE.HemisphereLight(0x88ccee, 0x4a7a2a, 0.35);
    this.scene.add(this.hemiLight);
  }

  /** Update lighting based on game hour (0-24) */
  updateTimeOfDay(hour) {
    let ambientIntensity, sunIntensity, ambientColor, sunColor, fogColor;

    if (hour >= 6 && hour < 8) {
      // Dawn
      const t = (hour - 6) / 2;
      ambientIntensity = 0.25 + t * 0.30;
      sunIntensity = 0.3 + t * 0.8;
      ambientColor = this._lerpColor(0x334466, 0xfff8ee, t);
      sunColor = this._lerpColor(0xff8844, 0xffe0a0, t);
      fogColor = this._lerpColor(0x445566, 0x87ceeb, t);
    } else if (hour >= 8 && hour < 17) {
      // Daytime
      ambientIntensity = 0.55;
      sunIntensity = 1.1;
      ambientColor = 0xfff8ee;
      sunColor = 0xffe0a0;
      fogColor = 0x87ceeb;
    } else if (hour >= 17 && hour < 20) {
      // Sunset
      const t = (hour - 17) / 3;
      ambientIntensity = 0.55 - t * 0.35;
      sunIntensity = 1.1 - t * 0.85;
      ambientColor = this._lerpColor(0xfff8ee, 0x334466, t);
      sunColor = this._lerpColor(0xffe0a0, 0xff6633, t);
      fogColor = this._lerpColor(0x87ceeb, 0x223344, t);
    } else {
      // Night (20-6)
      ambientIntensity = 0.2;
      sunIntensity = 0.25;
      ambientColor = 0x334466;
      sunColor = 0x6677aa;
      fogColor = 0x223344;
    }

    this.ambientLight.intensity = ambientIntensity;
    this.ambientLight.color.setHex(ambientColor);
    this.sunLight.intensity = sunIntensity;
    this.sunLight.color.setHex(sunColor);
    this.scene.fog.color.setHex(fogColor);
    this.renderer.setClearColor(fogColor);
  }

  _lerpColor(c1, c2, t) {
    const a = new THREE.Color(c1);
    const b = new THREE.Color(c2);
    a.lerp(b, t);
    return a.getHex();
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
