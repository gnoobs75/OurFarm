// client/src/effects/FishingEffects.js
// Visual effects for fishing: bobber, ripples, bite animation, splash.

import * as THREE from 'three';

export class FishingEffects {
  constructor(scene) {
    this.scene = scene;
    this.bobber = null;
    this.ripple = null;
    this._rippleTime = 0;
    this._bobbing = false;
    this._biting = false;
  }

  /** Show bobber at water position */
  cast(x, z) {
    this.clear();
    this._bobbing = true;
    this._biting = false;

    // Bobber — red/white ball on a stick
    const bobberGroup = new THREE.Group();
    const redPart = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 4),
      new THREE.MeshLambertMaterial({ color: 0xff2222, flatShading: true })
    );
    redPart.position.y = 0.06;
    bobberGroup.add(redPart);

    const whitePart = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 6, 4),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })
    );
    whitePart.position.y = 0.12;
    bobberGroup.add(whitePart);

    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.12, 3),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    stick.position.y = 0.18;
    bobberGroup.add(stick);

    bobberGroup.position.set(x, 0.02, z);
    this.scene.add(bobberGroup);
    this.bobber = bobberGroup;

    // Ripple ring
    const rippleGeo = new THREE.RingGeometry(0.05, 0.08, 16);
    const rippleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    this.ripple = new THREE.Mesh(rippleGeo, rippleMat);
    this.ripple.rotation.x = -Math.PI / 2;
    this.ripple.position.set(x, 0.03, z);
    this.scene.add(this.ripple);
    this._rippleTime = 0;
  }

  /** Fish is biting — bobber dunks */
  bite() {
    this._biting = true;
  }

  /** Show catch splash and clear */
  catchResult(success) {
    if (this.bobber) {
      this._createSplash(this.bobber.position.x, this.bobber.position.z, success);
    }
    setTimeout(() => this.clear(), 800);
  }

  _createSplash(x, z, success) {
    const count = success ? 12 : 6;
    const color = success ? 0x44ccff : 0x6688aa;
    const particles = [];

    for (let i = 0; i < count; i++) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 4, 3),
        new THREE.MeshLambertMaterial({ color, transparent: true })
      );
      const angle = (i / count) * Math.PI * 2;
      dot.position.set(x, 0.1, z);
      dot.userData.vel = {
        x: Math.cos(angle) * (0.5 + Math.random() * 0.5),
        y: 1.5 + Math.random(),
        z: Math.sin(angle) * (0.5 + Math.random() * 0.5),
      };
      this.scene.add(dot);
      particles.push(dot);
    }

    let elapsed = 0;
    const scene = this.scene;
    const animate = () => {
      elapsed += 0.016;
      for (const p of particles) {
        p.position.x += p.userData.vel.x * 0.016;
        p.position.y += p.userData.vel.y * 0.016;
        p.position.z += p.userData.vel.z * 0.016;
        p.userData.vel.y -= 4 * 0.016; // gravity
        p.material.opacity = Math.max(0, 1 - elapsed * 2);
      }
      if (elapsed < 0.8) {
        requestAnimationFrame(animate);
      } else {
        for (const p of particles) {
          scene.remove(p);
          p.geometry.dispose();
          p.material.dispose();
        }
      }
    };
    requestAnimationFrame(animate);
  }

  /** Per-frame update */
  update(delta) {
    if (!this.bobber || !this._bobbing) return;

    const time = Date.now() * 0.001;
    if (this._biting) {
      // Dunk down repeatedly
      this.bobber.position.y = 0.02 + Math.sin(time * 12) * 0.04 - 0.03;
    } else {
      // Gentle float
      this.bobber.position.y = 0.02 + Math.sin(time * 2) * 0.01;
    }

    // Ripple expand and fade
    if (this.ripple) {
      this._rippleTime += delta;
      const cycle = this._rippleTime % 2;
      const scale = 1 + cycle * 1.5;
      this.ripple.scale.set(scale, scale, 1);
      this.ripple.material.opacity = 0.3 * (1 - cycle / 2);
    }
  }

  clear() {
    this._bobbing = false;
    this._biting = false;
    if (this.bobber) {
      this.scene.remove(this.bobber);
      this.bobber.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
      this.bobber = null;
    }
    if (this.ripple) {
      this.scene.remove(this.ripple);
      this.ripple.geometry.dispose();
      this.ripple.material.dispose();
      this.ripple = null;
    }
  }

  dispose() {
    this.clear();
  }
}
