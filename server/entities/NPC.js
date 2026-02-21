// server/entities/NPC.js
export class NPC {
  constructor(data) {
    Object.assign(this, data);
    this.currentX = data.homeX;
    this.currentZ = data.homeZ;
  }

  updateSchedule(hour) {
    if (hour >= 8 && hour < 18) {
      this.currentX = this.shopX;
      this.currentZ = this.shopZ;
    } else {
      this.currentX = this.homeX;
      this.currentZ = this.homeZ;
    }
  }

  getDialogue(hearts) {
    if (hearts >= 8) return this.dialogue.high;
    if (hearts >= 4) return this.dialogue.mid;
    if (hearts >= 1) return this.dialogue.low;
    return this.dialogue.intro;
  }

  getState() {
    return {
      id: this.id, name: this.name, role: this.role,
      x: this.currentX, z: this.currentZ,
      personality: this.personality,
      skinColor: this.skinColor, shirtColor: this.shirtColor, hairColor: this.hairColor,
    };
  }
}
