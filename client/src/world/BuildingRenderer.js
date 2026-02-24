// client/src/world/BuildingRenderer.js
// Renders buildings and manages nighttime window glow effect.

import * as THREE from 'three';

// Window material signature used in AssetGenerator
const WINDOW_COLOR = 0xaaddff;

// Warm glow colors
const GLOW_COLOR_DAY = new THREE.Color(0xaaddff);
const GLOW_EMISSIVE_DAY = new THREE.Color(0x334455);
const GLOW_COLOR_NIGHT = new THREE.Color(0xffcc55);
const GLOW_EMISSIVE_NIGHT = new THREE.Color(0xffaa33);

export class BuildingRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.buildingMeshes = new Map();

    // Track window materials for time-of-day transitions
    // Since AssetGenerator caches materials, we only need the single shared material reference
    this._windowMat = null;

    // Glow overlay planes added on top of existing windows (warm light bleeding out)
    this._glowPlanes = [];

    // Interior point light for the main house
    this._interiorLight = null;

    // Current glow intensity (0 = day, 1 = full night)
    this._glowIntensity = 0;
  }

  build(buildings) {
    for (const b of buildings) {
      const mesh = this.assetGen.createBuilding(b.type);
      mesh.position.set(b.tile_x || b.tileX, 0, b.tile_z || b.tileZ);
      this.scene.add(mesh);
      this.buildingMeshes.set(b.id, mesh);

      // Find and store window material reference + add glow overlays
      this._processWindows(mesh, b);

      // Add interior light to the main house
      if (b.id === 'house_main' || b.type === 'house') {
        this._addInteriorLight(mesh, b);
      }
    }
  }

  /**
   * Traverse a building group to find window meshes and add glow overlays.
   * Window meshes in AssetGenerator use color 0xaaddff with emissive 0x334455.
   */
  _processWindows(buildingGroup, buildingData) {
    buildingGroup.traverse((child) => {
      if (!child.isMesh || !child.material) return;

      const mat = child.material;
      // Detect window material: color ~0xaaddff and has emissive
      if (mat.color && Math.abs(mat.color.getHex() - WINDOW_COLOR) < 0x000100 && mat.emissive) {
        // Store the shared material reference (only need one since it's cached)
        if (!this._windowMat) {
          this._windowMat = mat;
        }

        // Add a warm glow overlay plane slightly in front of the window
        this._addGlowPlane(child, buildingGroup);
      }
    });
  }

  /**
   * Add a warm glow overlay plane at the same position as a window mesh.
   * This plane uses MeshBasicMaterial for a bright, unshaded glow effect.
   */
  _addGlowPlane(windowMesh, buildingGroup) {
    const geo = new THREE.PlaneGeometry(
      windowMesh.geometry.parameters.width * 1.15,
      windowMesh.geometry.parameters.height * 1.15
    );

    const mat = new THREE.MeshBasicMaterial({
      color: 0xffcc55,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const plane = new THREE.Mesh(geo, mat);

    // Copy position and rotation from the window mesh
    plane.position.copy(windowMesh.position);
    plane.rotation.copy(windowMesh.rotation);

    // Offset slightly outward from the building wall to avoid z-fighting
    // Determine the outward direction based on the window's orientation
    const normal = new THREE.Vector3(0, 0, 1);
    normal.applyEuler(windowMesh.rotation);
    plane.position.add(normal.multiplyScalar(0.005));

    buildingGroup.add(plane);
    this._glowPlanes.push(plane);
  }

  /**
   * Add a subtle interior point light to a building (for main house).
   * Only one light to keep performance reasonable.
   */
  _addInteriorLight(buildingGroup, buildingData) {
    // Don't add multiple lights if we already have one
    if (this._interiorLight) return;

    const light = new THREE.PointLight(0xffaa44, 0, 4, 2);
    // Position inside the building, roughly center at window height
    light.position.set(0, 0.8, 0);
    buildingGroup.add(light);

    this._interiorLight = light;
  }

  /**
   * Set the time of day and update window glow accordingly.
   * @param {number} hour - Game hour (0-24, can be fractional)
   *
   * Glow schedule:
   *   7-18: Day (no glow, intensity = 0)
   *  18-20: Dusk (glow fades in, 0 -> 1)
   *  20-6:  Night (full glow, intensity = 1)
   *   6-7:  Dawn (glow fades out, 1 -> 0)
   */
  setTimeOfDay(hour) {
    let intensity = 0;

    if (hour >= 20 || hour < 6) {
      // Full night
      intensity = 1.0;
    } else if (hour >= 18 && hour < 20) {
      // Dusk: fade in over 2 hours
      intensity = (hour - 18) / 2.0;
    } else if (hour >= 6 && hour < 7) {
      // Dawn: fade out over 1 hour
      intensity = 1.0 - (hour - 6);
    } else {
      // Daytime
      intensity = 0;
    }

    this._glowIntensity = intensity;
    this._applyGlow(intensity);
  }

  /**
   * Apply the glow effect at the given intensity (0-1).
   */
  _applyGlow(intensity) {
    // Update the shared window material (MeshPhongMaterial from AssetGenerator)
    if (this._windowMat) {
      // Lerp color between day blue and warm night yellow
      this._windowMat.color.copy(GLOW_COLOR_DAY).lerp(GLOW_COLOR_NIGHT, intensity);

      // Lerp emissive from subtle blue-grey to warm orange
      this._windowMat.emissive.copy(GLOW_EMISSIVE_DAY).lerp(GLOW_EMISSIVE_NIGHT, intensity);

      // Scale emissive intensity: 0.3 at day, up to 0.8 at night
      this._windowMat.emissiveIntensity = 0.3 + intensity * 0.5;
    }

    // Update glow overlay planes
    for (const plane of this._glowPlanes) {
      const mat = plane.material;
      // Opacity ramps from 0 (day) to 0.45 (night) — subtle warm light bleed
      mat.opacity = intensity * 0.45;
      // Shift color from yellow to warmer orange at full night
      mat.color.setHex(0xffcc55).lerp(new THREE.Color(0xffaa33), intensity * 0.5);
    }

    // Update interior point light
    if (this._interiorLight) {
      this._interiorLight.intensity = intensity * 0.4;
    }
  }

  dispose() {
    // Remove glow planes and their materials/geometries
    for (const plane of this._glowPlanes) {
      if (plane.geometry) plane.geometry.dispose();
      if (plane.material) plane.material.dispose();
    }
    this._glowPlanes = [];

    // Remove interior light
    this._interiorLight = null;

    // Reset window material to defaults (so it's clean if re-used)
    if (this._windowMat) {
      this._windowMat.color.setHex(WINDOW_COLOR);
      this._windowMat.emissive.setHex(0x334455);
      this._windowMat.emissiveIntensity = 0.3;
      this._windowMat = null;
    }

    // Remove building meshes from scene
    for (const mesh of this.buildingMeshes.values()) this.scene.remove(mesh);
    this.buildingMeshes.clear();
  }
}
