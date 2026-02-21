// client/src/world/WeatherRenderer.js
import * as THREE from 'three';
import { WEATHER } from '@shared/constants.js';

export class WeatherRenderer {
  constructor(scene) {
    this.scene = scene;
    this.particles = null;
    this.currentWeather = WEATHER.SUNNY;
  }

  setWeather(weather) {
    this.currentWeather = weather;
    this._clearParticles();

    if (weather === WEATHER.RAINY || weather === WEATHER.STORMY) {
      this._createRain();
    } else if (weather === WEATHER.SNOWY) {
      this._createSnow();
    }
  }

  _createRain() {
    const count = 2000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xaaccff, size: 0.05, transparent: true, opacity: 0.6 });
    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  _createSnow() {
    const count = 1000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1, transparent: true, opacity: 0.8 });
    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  update(delta, cameraTarget) {
    if (!this.particles) return;
    const positions = this.particles.geometry.getAttribute('position');
    const isSnow = this.currentWeather === WEATHER.SNOWY;
    const speed = isSnow ? 2 : 15;

    for (let i = 0; i < positions.count; i++) {
      let y = positions.getY(i) - speed * delta;
      if (isSnow) {
        positions.setX(i, positions.getX(i) + Math.sin(Date.now() * 0.001 + i) * 0.02);
      }
      if (y < 0) y = 20;
      positions.setY(i, y);
    }
    positions.needsUpdate = true;

    // Center particles on camera
    if (cameraTarget) {
      this.particles.position.x = cameraTarget.x;
      this.particles.position.z = cameraTarget.z;
    }
  }

  _clearParticles() {
    if (this.particles) {
      this.scene.remove(this.particles);
      this.particles.geometry.dispose();
      this.particles.material.dispose();
      this.particles = null;
    }
  }

  dispose() { this._clearParticles(); }
}
