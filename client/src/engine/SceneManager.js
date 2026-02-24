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
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.left = -40;
    this.sunLight.shadow.camera.right = 40;
    this.sunLight.shadow.camera.top = 40;
    this.sunLight.shadow.camera.bottom = -40;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 120;
    this.scene.add(this.sunLight);

    // Hemisphere — warm sky to earthy ground
    this.hemiLight = new THREE.HemisphereLight(0x88ccee, 0x4a7a2a, 0.35);
    this.scene.add(this.hemiLight);
  }

  /**
   * Update all lighting to match the given game hour (0-24 float).
   * Uses keyframe interpolation for smooth transitions between time periods.
   */
  setTimeOfDay(hour) {
    // Wrap hour into [0, 24)
    hour = ((hour % 24) + 24) % 24;

    // Keyframes: [hour, sunColor, sunIntensity, ambientColor, ambientIntensity, skyColor, hemiGround]
    // Each keyframe defines the exact lighting state at that hour.
    // We interpolate linearly between adjacent keyframes.
    const keyframes = [
      //  hr   sunColor    sunI  ambientColor ambI  skyColor    hemiGround
      [  0,   0x1a1a3a,   0.10, 0x0a0a2a,    0.15, 0x0a0a1a,  0x0a0a1a  ],
      [  5,   0x1a1a3a,   0.10, 0x0a0a2a,    0.15, 0x0a0a1a,  0x0a0a1a  ],
      [  5.5, 0xffaa55,   0.40, 0x443355,    0.25, 0x443355,  0x1a2a1a  ],
      [  7,   0xffcc77,   0.80, 0xffd8aa,    0.45, 0xffbb88,  0x3a5a2a  ],
      [ 10,   0xffe8c0,   1.10, 0xfff8ee,    0.55, 0x87ceeb,  0x4a7a2a  ],
      [ 16,   0xfff0d0,   1.10, 0xfff8ee,    0.55, 0x87ceeb,  0x4a7a2a  ],
      [ 19,   0xff7733,   0.50, 0xff9955,    0.30, 0xff6633,  0x2a3a1a  ],
      [ 21,   0x2a2a5a,   0.15, 0x1a1a3a,    0.20, 0x1a1a3a,  0x0a0a1a  ],
      [ 24,   0x1a1a3a,   0.10, 0x0a0a2a,    0.15, 0x0a0a1a,  0x0a0a1a  ],
    ];

    // Find the two keyframes we're between
    let kA = keyframes[0];
    let kB = keyframes[keyframes.length - 1];
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (hour >= keyframes[i][0] && hour <= keyframes[i + 1][0]) {
        kA = keyframes[i];
        kB = keyframes[i + 1];
        break;
      }
    }

    // Interpolation factor
    const range = kB[0] - kA[0];
    const t = range > 0 ? (hour - kA[0]) / range : 0;

    // Reusable Color objects
    const cA = this._todColorA || (this._todColorA = new THREE.Color());
    const cB = this._todColorB || (this._todColorB = new THREE.Color());
    const cOut = this._todColorOut || (this._todColorOut = new THREE.Color());

    // Helper: lerp between two hex colors
    const lerpHex = (hexA, hexB, f) => {
      cA.set(hexA);
      cB.set(hexB);
      cOut.copy(cA).lerp(cB, f);
      return cOut;
    };

    // Sun light
    this.sunLight.color.copy(lerpHex(kA[1], kB[1], t));
    this.sunLight.intensity = kA[2] + (kB[2] - kA[2]) * t;

    // Ambient light
    this.ambientLight.color.copy(lerpHex(kA[3], kB[3], t));
    this.ambientLight.intensity = kA[4] + (kB[4] - kA[4]) * t;

    // Sky / fog color
    const skyColor = lerpHex(kA[5], kB[5], t);
    this.scene.fog.color.copy(skyColor);
    this.renderer.setClearColor(skyColor);

    // Hemisphere light — sky color matches sky, ground from keyframes
    this.hemiLight.color.copy(skyColor);
    this.hemiLight.groundColor.copy(lerpHex(kA[6], kB[6], t));

    // Sun position — arc across the sky based on hour
    // Dawn (5) = east, Noon (12) = overhead, Dusk (21) = west
    // Map hour to an angle: 5h=0deg(east), 13h=90deg(overhead), 21h=180deg(west)
    // Night hours: sun goes below horizon
    const dayStart = 5;
    const dayEnd = 21;
    const dayLength = dayEnd - dayStart;

    let sunAngle; // 0=horizon east, PI/2=overhead, PI=horizon west
    let sunHeight;

    if (hour >= dayStart && hour <= dayEnd) {
      // Daytime arc
      sunAngle = ((hour - dayStart) / dayLength) * Math.PI;
      sunHeight = Math.sin(sunAngle) * 30 + 2;
    } else {
      // Night — sun below horizon
      sunHeight = -5;
      sunAngle = hour < dayStart ? Math.PI + 0.5 : Math.PI + 0.5;
    }

    const sunX = Math.cos(sunAngle) * 25;
    const sunZ = 15; // Keep sun offset on z-axis for shadow direction
    this.sunLight.position.set(sunX, Math.max(sunHeight, 2), sunZ);

    // Update the shadow camera to follow camera target for consistent shadows
    if (this.cameraTarget) {
      this.sunLight.target.position.copy(this.cameraTarget);
      this.sunLight.target.updateMatrixWorld();
    }
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

  /** Set a mesh for the camera to follow smoothly */
  setFollowTarget(mesh) { this._followTarget = mesh; }

  /** Smooth camera tracking — call every frame */
  updateCamera(delta) {
    if (!this._followTarget) return;
    const tx = this._followTarget.position.x;
    const tz = this._followTarget.position.z;
    const CAM_LERP = 4;
    this.cameraTarget.x += (tx - this.cameraTarget.x) * CAM_LERP * delta;
    this.cameraTarget.z += (tz - this.cameraTarget.z) * CAM_LERP * delta;
    const isoAngle = Math.PI / 6;
    const isoDistance = 50;
    this.camera.position.set(
      this.cameraTarget.x + isoDistance * Math.cos(isoAngle),
      isoDistance * Math.sin(isoAngle) + 10,
      this.cameraTarget.z + isoDistance * Math.cos(isoAngle)
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
