// client/src/effects/FishingEffects.js
// Manages in-world 3D fishing effects: bobber, ripples, splash, catch arc.

import * as THREE from 'three';

export class FishingEffects {
  constructor(scene) {
    this.scene = scene;
    this._bobber = null;
    this._line = null;
    this._ripples = [];
    this._splashParticles = [];
    this._exclamation = null;
    this._catchArc = null;
    this._elapsed = 0;
    this._state = 'idle'; // 'idle' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'result'
    this._castStart = 0;
    this._castDuration = 0.5;
    this._playerPos = null;
    this._targetPos = null;
    this._nibbleTimer = 0;
  }

  /**
   * Start the cast sequence: bobber arcs from player to water tile.
   * @param {THREE.Vector3} playerPos - player world position
   * @param {{ x: number, z: number }} target - water tile world position
   */
  startCast(playerPos, target) {
    this.cleanup();
    this._playerPos = playerPos.clone();
    this._targetPos = new THREE.Vector3(target.x, -0.05, target.z);
    this._state = 'casting';
    this._castStart = this._elapsed;

    // Create bobber (small red sphere)
    const bobberGeo = new THREE.SphereGeometry(0.04, 8, 6);
    const bobberMat = new THREE.MeshPhongMaterial({ color: 0xff3333 });
    this._bobber = new THREE.Mesh(bobberGeo, bobberMat);
    this._bobber.position.copy(this._playerPos);
    this._bobber.position.y = 1.0;
    this.scene.add(this._bobber);

    // Create fishing line
    const lineMat = new THREE.LineBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.6 });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      this._playerPos.clone().setY(1.0),
      this._bobber.position.clone(),
    ]);
    this._line = new THREE.Line(lineGeo, lineMat);
    this.scene.add(this._line);
  }

  /** Transition to waiting state (bobber bobs on water) */
  _enterWaiting() {
    this._state = 'waiting';
    if (this._bobber) {
      this._bobber.position.copy(this._targetPos);
      this._bobber.position.y = 0.02;
    }
    this._spawnRipple(this._targetPos.x, this._targetPos.z);
  }

  /** Play a nibble animation (bobber dips briefly) */
  playNibble() {
    if (!this._bobber) return;
    this._nibbleTimer = 0.3;
    this._spawnRipple(this._targetPos.x, this._targetPos.z, 0.06);
  }

  /** Play the bite animation (bobber plunges, splash, exclamation) */
  playBite() {
    this._state = 'bite';
    if (this._bobber) {
      this._bobber.position.y = -0.08;
    }
    this._spawnSplash(this._targetPos.x, this._targetPos.z);
    this._spawnExclamation(this._targetPos.x, this._targetPos.z);
  }

  /** Play catch success animation (fish arcs from water to player) */
  playCatch(fishColor = 0x4488ff) {
    this._state = 'result';

    const fishGeo = new THREE.ConeGeometry(0.03, 0.1, 4);
    fishGeo.rotateZ(Math.PI / 2);
    const fishMat = new THREE.MeshPhongMaterial({ color: fishColor });
    this._catchArc = new THREE.Mesh(fishGeo, fishMat);
    this._catchArc.position.copy(this._targetPos);
    this._catchArc.position.y = 0;
    this.scene.add(this._catchArc);

    this._catchArcTimer = 0;
    this._catchArcDuration = 0.6;

    this._spawnSparkles(this._targetPos.x, this._targetPos.z);
    this._removeBobber();
  }

  /** Play miss animation (splash, retract line) */
  playMiss() {
    this._state = 'result';
    this._spawnSplash(this._targetPos.x, this._targetPos.z);
    this._removeBobber();
    setTimeout(() => this.cleanup(), 1000);
  }

  /** Cancel the cast */
  cancel() {
    this.cleanup();
  }

  /** Per-frame update */
  update(delta) {
    this._elapsed += delta;

    // Cast arc animation
    if (this._state === 'casting') {
      const t = Math.min((this._elapsed - this._castStart) / this._castDuration, 1);
      if (this._bobber) {
        const startY = 1.0;
        const endY = 0.02;
        const arcHeight = 1.5;
        const y = startY + (endY - startY) * t + arcHeight * Math.sin(t * Math.PI);

        this._bobber.position.lerpVectors(
          new THREE.Vector3(this._playerPos.x, 0, this._playerPos.z),
          new THREE.Vector3(this._targetPos.x, 0, this._targetPos.z),
          t
        );
        this._bobber.position.y = y;
      }
      this._updateLine();

      if (t >= 1) {
        this._enterWaiting();
      }
    }

    // Waiting: gentle bob
    if (this._state === 'waiting' && this._bobber) {
      const bob = Math.sin(this._elapsed * 2) * 0.01;
      this._bobber.position.y = 0.02 + bob;

      if (this._nibbleTimer > 0) {
        this._nibbleTimer -= delta;
        this._bobber.position.y -= 0.03 * Math.max(0, this._nibbleTimer / 0.3);
      }

      this._updateLine();
    }

    // Catch arc animation
    if (this._catchArc && this._playerPos) {
      this._catchArcTimer += delta;
      const t = Math.min(this._catchArcTimer / this._catchArcDuration, 1);
      const arcHeight = 1.2;
      const y = arcHeight * Math.sin(t * Math.PI);

      this._catchArc.position.lerpVectors(
        this._targetPos,
        this._playerPos,
        t
      );
      this._catchArc.position.y = y;
      this._catchArc.rotation.z += delta * 8;

      if (t >= 1) {
        this.scene.remove(this._catchArc);
        this._catchArc.geometry.dispose();
        this._catchArc.material.dispose();
        this._catchArc = null;
        this.cleanup();
      }
    }

    // Update ripples
    for (let i = this._ripples.length - 1; i >= 0; i--) {
      const r = this._ripples[i];
      r.timer += delta;
      const t = r.timer / r.duration;
      if (t >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this._ripples.splice(i, 1);
      } else {
        const scale = 1 + t * 3;
        r.mesh.scale.set(scale, scale, 1);
        r.mesh.material.opacity = (1 - t) * 0.4;
      }
    }

    // Update splash particles
    for (let i = this._splashParticles.length - 1; i >= 0; i--) {
      const p = this._splashParticles[i];
      p.timer += delta;
      const t = p.timer / p.duration;
      if (t >= 1) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this._splashParticles.splice(i, 1);
      } else {
        p.mesh.position.x += p.vx * delta;
        p.mesh.position.y += p.vy * delta;
        p.mesh.position.z += p.vz * delta;
        p.vy -= 3 * delta;
        p.mesh.material.opacity = 1 - t;
        const s = 1 - t * 0.5;
        p.mesh.scale.set(s, s, s);
      }
    }

    // Update exclamation
    if (this._exclamation) {
      this._exclamation.timer += delta;
      if (this._exclamation.timer > 0.8) {
        this.scene.remove(this._exclamation.mesh);
        this._exclamation.mesh.traverse(c => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) c.material.dispose();
        });
        this._exclamation = null;
      } else {
        const pulse = 1 + Math.sin(this._exclamation.timer * 12) * 0.15;
        this._exclamation.mesh.scale.set(pulse, pulse, pulse);
      }
    }
  }

  // --- Internal helpers ---

  _updateLine() {
    if (this._line && this._bobber && this._playerPos) {
      const positions = this._line.geometry.attributes.position;
      positions.setXYZ(0, this._playerPos.x, 1.0, this._playerPos.z);
      positions.setXYZ(1, this._bobber.position.x, this._bobber.position.y, this._bobber.position.z);
      positions.needsUpdate = true;
    }
  }

  _spawnRipple(x, z, size = 0.1) {
    const geo = new THREE.RingGeometry(size * 0.3, size, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xaaddff, transparent: true, opacity: 0.4, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.01, z);
    this.scene.add(mesh);
    this._ripples.push({ mesh, timer: 0, duration: 1.0 });
  }

  _spawnSplash(x, z) {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.015, 4, 3);
      const mat = new THREE.MeshPhongMaterial({ color: 0xeeffff, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (i / count) * Math.PI * 2;
      const speed = 0.5 + Math.random() * 0.5;
      mesh.position.set(x, 0.05, z);
      this.scene.add(mesh);
      this._splashParticles.push({
        mesh, timer: 0, duration: 0.6,
        vx: Math.cos(angle) * speed,
        vy: 1.5 + Math.random(),
        vz: Math.sin(angle) * speed,
      });
    }
  }

  _spawnSparkles(x, z) {
    const count = 4;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.01, 4, 3);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      const angle = (i / count) * Math.PI * 2;
      mesh.position.set(x, 0.1, z);
      this.scene.add(mesh);
      this._splashParticles.push({
        mesh, timer: 0, duration: 0.8,
        vx: Math.cos(angle) * 0.3,
        vy: 0.8 + Math.random() * 0.5,
        vz: Math.sin(angle) * 0.3,
      });
    }
  }

  _spawnExclamation(x, z) {
    const group = new THREE.Group();
    const barGeo = new THREE.BoxGeometry(0.04, 0.12, 0.04);
    const barMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.y = 0.06;
    group.add(bar);

    const dotGeo = new THREE.SphereGeometry(0.025, 4, 3);
    const dot = new THREE.Mesh(dotGeo, barMat);
    dot.position.y = -0.04;
    group.add(dot);

    group.position.set(x, 0.6, z);
    this.scene.add(group);

    this._exclamation = { mesh: group, timer: 0 };
  }

  _removeBobber() {
    if (this._bobber) {
      this.scene.remove(this._bobber);
      this._bobber.geometry.dispose();
      this._bobber.material.dispose();
      this._bobber = null;
    }
    if (this._line) {
      this.scene.remove(this._line);
      this._line.geometry.dispose();
      this._line.material.dispose();
      this._line = null;
    }
  }

  /** Full cleanup — removes all effects */
  cleanup() {
    this._removeBobber();
    this._state = 'idle';
    this._nibbleTimer = 0;

    for (const r of this._ripples) {
      this.scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
    }
    this._ripples = [];

    for (const p of this._splashParticles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    this._splashParticles = [];

    if (this._exclamation) {
      this.scene.remove(this._exclamation.mesh);
      this._exclamation.mesh.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
      this._exclamation = null;
    }

    if (this._catchArc) {
      this.scene.remove(this._catchArc);
      this._catchArc.geometry.dispose();
      this._catchArc.material.dispose();
      this._catchArc = null;
    }
  }

  get isFishing() {
    return this._state !== 'idle';
  }

  dispose() {
    this.cleanup();
  }
}
