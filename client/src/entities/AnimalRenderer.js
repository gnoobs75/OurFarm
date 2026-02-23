// client/src/entities/AnimalRenderer.js

const IDLE_MAP = {
  chicken: ['peck', 'scratch', 'headBob'],
  cow: ['graze', 'tailFlick', 'earTwitch', 'chew'],
  sheep: ['baaBob', 'woolShuffle', 'earFlick'],
  goat: ['headButt', 'earWaggle', 'curiousTilt'],
};

// Duration in seconds for each idle animation
const IDLE_DURATION = {
  peck: 0.5,
  scratch: 0.4,
  headBob: 0.6,
  graze: 2.3,
  tailFlick: 0.6,
  earTwitch: 0.3,
  chew: 1.0,
  baaBob: 0.5,
  woolShuffle: 0.4,
  earFlick: 0.3,
  headButt: 0.6,
  earWaggle: 0.4,
  curiousTilt: 0.9,
};

export class AnimalRenderer {
  constructor(scene, assetGen) {
    this.scene = scene;
    this.assetGen = assetGen;
    this.animalMeshes = new Map();
  }

  build(animals) {
    for (const animal of animals) {
      const mesh = this.assetGen.createAnimal(animal.type);
      mesh.position.set(animal.x, 0, animal.z);

      // Preserve existing userData (e.g. userData.parts from animal models)
      mesh.userData.animalType = animal.type;
      mesh.userData.animalId = animal.id;

      this.scene.add(mesh);

      // Capture default positions for animated parts
      const parts = mesh.userData.parts;
      const defaults = {};
      if (parts) {
        if (parts.head) {
          defaults.headY = parts.head.position.y;
          defaults.headRotX = parts.head.rotation.x;
          defaults.headRotZ = parts.head.rotation.z;
          defaults.headScaleX = parts.head.scale.x;
        }
        if (parts.body) {
          defaults.bodyY = parts.body.position.y;
          defaults.bodyRotZ = parts.body.rotation.z;
          defaults.bodyScaleY = parts.body.scale.y;
        }
        if (parts.tail) {
          defaults.tailRotZ = parts.tail.rotation.z;
        }
        if (parts.earL) {
          defaults.earLRotX = parts.earL.rotation.x;
          defaults.earLRotZ = parts.earL.rotation.z;
        }
        if (parts.earR) {
          defaults.earRRotX = parts.earR.rotation.x;
          defaults.earRRotZ = parts.earR.rotation.z;
        }
        if (parts.legL) {
          defaults.legLRotX = parts.legL.rotation.x;
        }
        if (parts.legR) {
          defaults.legRRotX = parts.legR.rotation.x;
        }
      }

      this.animalMeshes.set(animal.id, {
        mesh,
        data: animal,
        time: 0,
        idleTimer: Math.random() * 5,
        currentIdle: null,
        idleProgress: 0,
        defaults,
      });
    }
  }

  update(delta) {
    for (const entry of this.animalMeshes.values()) {
      entry.time += delta;
      const { mesh } = entry;
      const parts = mesh.userData.parts;
      const type = mesh.userData.animalType;

      // --- Universal animations (always running) ---

      // Breathing
      if (parts && parts.body) {
        parts.body.scale.y = 1 + Math.sin(entry.time * 1.5) * 0.015;
      }

      // Subtle drift
      mesh.rotation.y += Math.sin(entry.time * 0.3 + mesh.position.x) * 0.001;

      // --- Idle trigger ---
      entry.idleTimer -= delta;
      if (entry.idleTimer <= 0) {
        const idles = IDLE_MAP[type];
        if (idles) {
          entry.currentIdle = idles[Math.floor(Math.random() * idles.length)];
          entry.idleProgress = 0;
        }
        entry.idleTimer = 3 + Math.random() * 5;
      }

      if (entry.currentIdle) {
        entry.idleProgress += delta;
        if (parts) {
          this._animateIdle(entry, parts);
        }

        // Check if idle animation is complete
        const duration = IDLE_DURATION[entry.currentIdle];
        if (duration && entry.idleProgress >= duration) {
          entry.currentIdle = null;
          if (parts) {
            this._resetIdle(entry, parts);
          }
        }
      }
    }
  }

  _animateIdle(entry, parts) {
    const t = entry.idleProgress;

    switch (entry.currentIdle) {
      // ---- Chicken idles ----
      case 'peck': {
        if (!parts.head) break;
        if (t < 0.2) {
          // Lerp head down
          const f = t / 0.2;
          parts.head.rotation.x = f * 0.8;
        } else if (t < 0.3) {
          // Hold
          parts.head.rotation.x = 0.8;
        } else {
          // Return
          const f = Math.min((t - 0.3) / 0.2, 1);
          parts.head.rotation.x = 0.8 * (1 - f);
        }
        break;
      }

      case 'scratch': {
        if (t < 0.2) {
          if (parts.body) parts.body.rotation.z = 0.15;
          if (parts.legL) parts.legL.rotation.x = -0.4;
        } else {
          // Return
          const f = Math.min((t - 0.2) / 0.2, 1);
          if (parts.body) parts.body.rotation.z = 0.15 * (1 - f);
          if (parts.legL) parts.legL.rotation.x = -0.4 * (1 - f);
        }
        break;
      }

      case 'headBob': {
        if (!parts.head) break;
        const d = entry.defaults;
        const baseY = d.headY || 0;
        parts.head.position.y = baseY + Math.sin(t * 25) * 0.02;
        break;
      }

      // ---- Cow idles ----
      case 'graze': {
        if (!parts.head) break;
        const d = entry.defaults;
        const baseY = d.headY || 0;
        if (t < 0.8) {
          // Head drops down + tilts forward
          const f = t / 0.8;
          parts.head.position.y = baseY - f * 0.15;
          parts.head.rotation.x = f * 0.4;
        } else if (t < 1.8) {
          // Hold grazing position
          parts.head.position.y = baseY - 0.15;
          parts.head.rotation.x = 0.4;
        } else {
          // Return
          const f = Math.min((t - 1.8) / 0.5, 1);
          parts.head.position.y = baseY - 0.15 * (1 - f);
          parts.head.rotation.x = 0.4 * (1 - f);
        }
        break;
      }

      case 'tailFlick': {
        if (!parts.tail) break;
        parts.tail.rotation.z = Math.sin(t * 30) * 0.3 * Math.max(0, 1 - t / 0.6);
        break;
      }

      case 'earTwitch': {
        if (!parts.earL) break;
        const d = entry.defaults;
        const base = d.earLRotX || 0;
        if (t < 0.15) {
          parts.earL.rotation.x = base + (t / 0.15) * 0.2;
        } else {
          const f = Math.min((t - 0.15) / 0.15, 1);
          parts.earL.rotation.x = base + 0.2 * (1 - f);
        }
        break;
      }

      case 'chew': {
        if (!parts.head) break;
        parts.head.scale.x = 1 + Math.sin(t * 25) * 0.01;
        break;
      }

      // ---- Sheep idles ----
      case 'baaBob': {
        if (!parts.head) break;
        const d = entry.defaults;
        const baseY = d.headY || 0;
        // Sin arc: lifts then drops
        parts.head.position.y = baseY + Math.sin(t / 0.5 * Math.PI) * 0.03;
        break;
      }

      case 'woolShuffle': {
        if (!parts.body) break;
        parts.body.rotation.z = Math.sin(t * 15) * 0.05;
        break;
      }

      case 'earFlick': {
        if (!parts.earL) break;
        const d = entry.defaults;
        const base = d.earLRotZ || 0;
        parts.earL.rotation.z = base + Math.sin(t / 0.3 * Math.PI) * 0.2;
        break;
      }

      // ---- Goat idles ----
      case 'headButt': {
        if (!parts.head) break;
        if (t < 0.2) {
          // Wind up
          const f = t / 0.2;
          parts.head.rotation.x = -0.3 * f;
        } else if (t < 0.35) {
          // Thrust forward
          const f = (t - 0.2) / 0.15;
          parts.head.rotation.x = -0.3 + f * 0.7; // -0.3 -> 0.4
        } else {
          // Return
          const f = Math.min((t - 0.35) / 0.25, 1);
          parts.head.rotation.x = 0.4 * (1 - f);
        }
        break;
      }

      case 'earWaggle': {
        const offset = Math.sin(t * 20) * 0.2;
        if (parts.earL) parts.earL.rotation.z = (entry.defaults.earLRotZ || 0) + offset;
        if (parts.earR) parts.earR.rotation.z = (entry.defaults.earRRotZ || 0) - offset;
        break;
      }

      case 'curiousTilt': {
        if (!parts.head) break;
        if (t < 0.3) {
          const f = t / 0.3;
          parts.head.rotation.z = f * 0.25;
        } else if (t < 0.6) {
          // Hold
          parts.head.rotation.z = 0.25;
        } else {
          // Return
          const f = Math.min((t - 0.6) / 0.3, 1);
          parts.head.rotation.z = 0.25 * (1 - f);
        }
        break;
      }
    }
  }

  _resetIdle(entry, parts) {
    const d = entry.defaults;

    if (parts.head) {
      parts.head.position.y = d.headY || 0;
      parts.head.rotation.x = d.headRotX || 0;
      parts.head.rotation.z = d.headRotZ || 0;
      parts.head.scale.x = d.headScaleX || 1;
    }
    if (parts.body) {
      parts.body.rotation.z = d.bodyRotZ || 0;
      // Note: scale.y is continuously driven by breathing, no need to reset here
    }
    if (parts.tail) {
      parts.tail.rotation.z = d.tailRotZ || 0;
    }
    if (parts.earL) {
      parts.earL.rotation.x = d.earLRotX || 0;
      parts.earL.rotation.z = d.earLRotZ || 0;
    }
    if (parts.earR) {
      parts.earR.rotation.x = d.earRRotX || 0;
      parts.earR.rotation.z = d.earRRotZ || 0;
    }
    if (parts.legL) {
      parts.legL.rotation.x = d.legLRotX || 0;
    }
    if (parts.legR) {
      parts.legR.rotation.x = d.legRRotX || 0;
    }
  }

  getAnimalAtPosition(worldX, worldZ) {
    const threshold = 0.8;
    for (const [id, entry] of this.animalMeshes) {
      const dx = entry.mesh.position.x - worldX;
      const dz = entry.mesh.position.z - worldZ;
      if (Math.sqrt(dx * dx + dz * dz) < threshold) return id;
    }
    return null;
  }

  dispose() {
    for (const { mesh } of this.animalMeshes.values()) this.scene.remove(mesh);
    this.animalMeshes.clear();
  }
}
