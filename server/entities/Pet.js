// server/entities/Pet.js
import { v4 as uuid } from 'uuid';

export class Pet {
  constructor(data = {}) {
    this.id = data.id || uuid();
    this.ownerId = data.ownerId;
    this.type = data.type;
    this.name = data.name || data.type;
    this.energy = data.energy ?? 100;
    this.happiness = data.happiness ?? 50;
    this.loyalty = data.loyalty ?? 0;
    this.skill = data.skill ?? 0;
    this.bodySize = data.bodySize ?? 0.2 + Math.random() * 0.1;
    this.earSize = data.earSize ?? 0.08 + Math.random() * 0.05;
    this.tailLength = data.tailLength ?? 0.15 + Math.random() * 0.1;
    this.color = data.color ?? Math.floor(Math.random() * 0xffffff);
    this.x = data.x ?? 32;
    this.z = data.z ?? 33;
    this.cosmetics = data.cosmetics || { unlocked: ['straw_hat', 'red_bandana', 'cape'], equipped: { hat: null, neck: null, back: null } };
    this.lastGroomed = data.lastGroomed || -1;
  }

  feed() { this.energy = Math.min(100, this.energy + 30); this.happiness = Math.min(100, this.happiness + 10); }
  train() {
    if (this.energy < 20) return false;
    this.energy -= 20;
    this.skill = Math.min(100, this.skill + 2 + Math.random() * 3);
    this.loyalty = Math.min(100, this.loyalty + 1);
    return true;
  }
  pet() { this.happiness = Math.min(100, this.happiness + 15); this.loyalty = Math.min(100, this.loyalty + 0.5); }

  groom(stars, currentDay) {
    if (this.lastGroomed >= currentDay) return { success: false, message: 'Already groomed today' };
    const happinessGain = [0, 20, 30, 40][stars] || 20;
    const loyaltyGain = [0, 2, 3, 5][stars] || 2;
    this.happiness = Math.min(100, this.happiness + happinessGain);
    this.loyalty = Math.min(100, this.loyalty + loyaltyGain);
    this.lastGroomed = currentDay;
    return { success: true, happinessGain, loyaltyGain };
  }

  equipCosmetics(equipped) {
    if (equipped.hat && !this.cosmetics.unlocked.includes(equipped.hat)) return false;
    if (equipped.neck && !this.cosmetics.unlocked.includes(equipped.neck)) return false;
    if (equipped.back && !this.cosmetics.unlocked.includes(equipped.back)) return false;
    this.cosmetics.equipped = { hat: equipped.hat || null, neck: equipped.neck || null, back: equipped.back || null };
    return true;
  }

  tickDaily() { this.energy = Math.max(0, this.energy - 10); this.happiness = Math.max(0, this.happiness - 5); }

  getState() {
    return {
      id: this.id, ownerId: this.ownerId, type: this.type, name: this.name,
      energy: this.energy, happiness: this.happiness, loyalty: this.loyalty, skill: this.skill,
      bodySize: this.bodySize, earSize: this.earSize, tailLength: this.tailLength, color: this.color,
      x: this.x, z: this.z, cosmetics: this.cosmetics,
    };
  }
}
