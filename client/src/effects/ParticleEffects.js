// client/src/effects/ParticleEffects.js
// Fire-and-forget particle bursts for farming and tool actions.

import * as THREE from 'three';

export class ParticleEffects {
  constructor(scene) {
    this.scene = scene;
    this._active = [];
  }

  /** Golden sparkles when harvesting crops */
  harvestBurst(x, z) {
    this._burst(x, 0.3, z, {
      count: 15,
      colors: [0xffdd44, 0xffaa22, 0x44ff44, 0xffffff],
      speed: 1.5,
      gravity: -2,
      lifetime: 0.8,
      size: 0.04,
    });
  }

  /** Blue water drops when watering */
  waterDrops(x, z) {
    this._burst(x, 0.5, z, {
      count: 8,
      colors: [0x44aaff, 0x6699cc, 0xaaddff],
      speed: 0.8,
      gravity: -3,
      lifetime: 0.6,
      size: 0.03,
    });
  }

  /** Brown dirt puffs when tilling */
  tillDust(x, z) {
    this._burst(x, 0.1, z, {
      count: 10,
      colors: [0x8b6914, 0x6b4a0e, 0xaa8833],
      speed: 0.6,
      gravity: -1,
      lifetime: 0.5,
      size: 0.05,
    });
  }

  /** Green leaves when planting */
  plantLeaves(x, z) {
    this._burst(x, 0.2, z, {
      count: 6,
      colors: [0x44aa22, 0x2d7a1e, 0x66cc44],
      speed: 0.5,
      gravity: -1.5,
      lifetime: 0.7,
      size: 0.035,
    });
  }

  _burst(x, y, z, opts) {
    const particles = [];
    for (let i = 0; i < opts.count; i++) {
      const color = opts.colors[Math.floor(Math.random() * opts.colors.length)];
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(opts.size, 4, 3),
        new THREE.MeshLambertMaterial({ color, transparent: true })
      );
      mesh.position.set(x, y, z);

      const angle = Math.random() * Math.PI * 2;
      const speed = opts.speed * (0.5 + Math.random() * 0.5);
      mesh.userData.vel = {
        x: Math.cos(angle) * speed * 0.5,
        y: speed,
        z: Math.sin(angle) * speed * 0.5,
      };
      mesh.userData.lifetime = opts.lifetime;
      mesh.userData.elapsed = 0;
      mesh.userData.gravity = opts.gravity;

      this.scene.add(mesh);
      particles.push(mesh);
    }
    this._active.push(particles);
  }

  update(delta) {
    for (let g = this._active.length - 1; g >= 0; g--) {
      const group = this._active[g];
      let allDone = true;

      for (let i = group.length - 1; i >= 0; i--) {
        const p = group[i];
        p.userData.elapsed += delta;
        const t = p.userData.elapsed;
        const lt = p.userData.lifetime;

        if (t >= lt) {
          this.scene.remove(p);
          p.geometry.dispose();
          p.material.dispose();
          group.splice(i, 1);
          continue;
        }

        allDone = false;
        p.position.x += p.userData.vel.x * delta;
        p.position.y += p.userData.vel.y * delta;
        p.position.z += p.userData.vel.z * delta;
        p.userData.vel.y += p.userData.gravity * delta;
        p.material.opacity = 1 - (t / lt);
      }

      if (allDone) {
        this._active.splice(g, 1);
      }
    }
  }

  dispose() {
    for (const group of this._active) {
      for (const p of group) {
        this.scene.remove(p);
        p.geometry.dispose();
        p.material.dispose();
      }
    }
    this._active = [];
  }
}
