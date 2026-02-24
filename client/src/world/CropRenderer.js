// client/src/world/CropRenderer.js
import * as THREE from 'three';
import { tileToWorld } from '@shared/TileMap.js';

// Sway intensity per growth stage
const STAGE_SWAY = [
  0.0,   // 0 = SEED:        no sway
  0.02,  // 1 = SPROUT:      very minimal
  0.06,  // 2 = MATURE:      moderate
  0.1,   // 3 = HARVESTABLE: full sway
];

// GLSL snippet injected into the vertex shader to displace vertices based on
// dual-frequency wind sine waves.  Height factor keeps the base of the crop
// anchored while the top sways freely.
const WIND_VERTEX_PARS = /* glsl */ `
  uniform float uTime;
  uniform float uSwayIntensity;
  uniform vec3  uCropWorldPos;
`;

const WIND_VERTEX_TRANSFORM = /* glsl */ `
  // --- wind sway ---
  float phase = uCropWorldPos.x * 1.3 + uCropWorldPos.z * 0.7;
  float sway  = sin(uTime * 2.0 + phase) * 0.6
              + sin(uTime * 3.3 + phase * 1.5) * 0.4;
  float heightFactor = clamp(position.y / 0.5, 0.0, 1.0);
  transformed.x += sway * heightFactor * uSwayIntensity;
  transformed.z += sway * 0.5 * heightFactor * uSwayIntensity;
  // --- end wind sway ---
`;

export class CropRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.cropMeshes = new Map(); // cropId -> { mesh, data }

    // Shared time uniform — one object, referenced by every injected material
    this._timeUniform = { value: 0 };
  }

  // ── public API ──

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

    const swayIntensity = STAGE_SWAY[crop.stage] ?? 0;
    this._injectWindShader(mesh, pos, swayIntensity);

    this.scene.add(mesh);
    this.cropMeshes.set(crop.id, { mesh, data: crop });
  }

  updateCrop(cropData) {
    const existing = this.cropMeshes.get(cropData.id);
    if (existing) {
      this.scene.remove(existing.mesh);
      this._disposeGroup(existing.mesh);
      this.cropMeshes.delete(cropData.id);
    }
    this.addCrop(cropData);
  }

  removeCrop(cropId) {
    const entry = this.cropMeshes.get(cropId);
    if (entry) {
      this.scene.remove(entry.mesh);
      this._disposeGroup(entry.mesh);
      this.cropMeshes.delete(cropId);
    }
  }

  getCropAtPosition(worldX, worldZ) {
    const tileX = Math.floor(worldX);
    const tileZ = Math.floor(worldZ);
    for (const [id, entry] of this.cropMeshes) {
      if (entry.data.tileX === tileX && entry.data.tileZ === tileZ) {
        return { id, ...entry.data };
      }
    }
    return null;
  }

  update(delta) {
    // Advance the shared time uniform — all crop shaders read from this
    this._timeUniform.value += delta;
  }

  dispose() {
    for (const { mesh } of this.cropMeshes.values()) {
      this.scene.remove(mesh);
      this._disposeGroup(mesh);
    }
    this.cropMeshes.clear();
  }

  // ── internals ──

  /**
   * Traverse a crop group and inject the wind-sway vertex shader into every
   * mesh material.  Materials are cloned so the shared AssetGenerator cache
   * is not mutated (other objects using the same colour won't start swaying).
   */
  _injectWindShader(group, worldPos, swayIntensity) {
    // Nothing to inject for seeds — skip the traversal entirely
    if (swayIntensity === 0) return;

    const timeUniform = this._timeUniform;
    const cropPos = new THREE.Vector3(worldPos.x, 0, worldPos.z);

    group.traverse((child) => {
      if (!child.isMesh) return;

      // Clone so we don't pollute the shared material cache
      const mat = child.material.clone();

      // Per-crop uniforms (intensity & position are baked per crop; time is shared)
      const uniforms = {
        uTime:          timeUniform,
        uSwayIntensity: { value: swayIntensity },
        uCropWorldPos:  { value: cropPos },
      };

      mat.onBeforeCompile = (shader) => {
        // Merge our uniforms into the shader's uniform map
        shader.uniforms.uTime          = uniforms.uTime;
        shader.uniforms.uSwayIntensity = uniforms.uSwayIntensity;
        shader.uniforms.uCropWorldPos  = uniforms.uCropWorldPos;

        // Inject uniform declarations just before main()
        shader.vertexShader = shader.vertexShader.replace(
          'void main() {',
          WIND_VERTEX_PARS + '\nvoid main() {'
        );

        // Inject vertex displacement right after #include <begin_vertex>
        // (that include defines `vec3 transformed = position;`)
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n' + WIND_VERTEX_TRANSFORM
        );
      };

      // Three.js uses customProgramCacheKey to decide whether a compiled
      // program can be reused.  Because every crop has its own sway intensity
      // and world-position baked in, we give each a unique key so the engine
      // doesn't accidentally share compiled programs between crops that need
      // different uniform values.  (The uniforms themselves are per-material,
      // but the cache key prevents stale shader reuse when intensity differs.)
      mat.customProgramCacheKey = () => {
        return `crop_wind_${swayIntensity}_${cropPos.x}_${cropPos.z}`;
      };

      child.material = mat;
    });
  }

  _disposeGroup(obj) {
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      // Also dispose cloned materials so we don't leak GPU programs
      if (child.material && child.material.dispose) {
        child.material.dispose();
      }
    });
  }
}
