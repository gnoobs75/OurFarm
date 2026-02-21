// server/entities/Crop.js
import { v4 as uuid } from 'uuid';
import { CROP_STAGES, FERTILIZER_DATA } from '../../shared/constants.js';

export class Crop {
  constructor(data = {}) {
    this.id = data.id || uuid();
    this.tileX = data.tileX;
    this.tileZ = data.tileZ;
    this.cropType = data.cropType;
    this.stage = data.stage ?? CROP_STAGES.SEED;
    this.growth = data.growth ?? 0;
    this.watered = data.watered ?? false;
    this.fertilizer = data.fertilizer || null;
  }

  tick(gameHoursElapsed, cropData) {
    if (this.stage >= CROP_STAGES.HARVESTABLE) return false;
    const rate = this.watered ? 1.5 : 1.0;
    let speedMult = 1;
    if (this.fertilizer) {
      const fData = FERTILIZER_DATA[this.fertilizer];
      if (fData) speedMult += fData.speedBonus;
    }
    const totalGrowthHours = cropData.growthTime * 24;
    const progressPerHour = 3 / totalGrowthHours;
    this.growth += gameHoursElapsed * progressPerHour * rate * speedMult;

    if (this.growth >= 1) {
      this.growth = 0;
      this.stage++;
      this.watered = false;
      return true;
    }
    return false;
  }

  getState() {
    return {
      id: this.id, tileX: this.tileX, tileZ: this.tileZ,
      cropType: this.cropType, stage: this.stage,
      growth: this.growth, watered: this.watered,
      fertilizer: this.fertilizer,
    };
  }
}
