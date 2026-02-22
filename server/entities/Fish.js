// server/entities/Fish.js
export class FishCalculator {
  constructor(fishData) {
    this.fishData = fishData;
    this.allFish = Object.entries(fishData);
  }

  rollCatch(location, playerLevel, fishingLevel = 0, rodTier = 0, baitInfo = null, season = -1, hour = 12, isRaining = false) {
    const ignoreRestrictions = baitInfo?.ignoreRestrictions || false;

    const available = this.allFish.filter(([, f]) => {
      if (f.location !== location) return false;
      if (f.minLevel > fishingLevel) return false;

      if (!ignoreRestrictions && f.season.length > 0 && !f.season.includes(season)) {
        return false;
      }

      if (!ignoreRestrictions && f.time !== 'any') {
        const isDay = hour >= 6 && hour < 20;
        const isNight = !isDay;

        if (f.time === 'day' && !isDay) return false;
        if (f.time === 'night' && !isNight) return false;
        if (f.time === 'rain' && !isRaining) return false;
        if (f.time === 'night+rain' && (!isNight || !isRaining)) return false;
      }

      return true;
    });

    if (available.length === 0) return null;

    const rarityBoost = baitInfo?.rarityBoost || 0;
    const weights = available.map(([id, f]) => {
      let weight = [1.0, 0.3, 0.1, 0.02][f.rarity] || 0.5;
      if (f.rarity >= 1 && rarityBoost > 0) {
        weight *= (1 + rarityBoost);
      }
      return { id, fish: f, weight };
    });

    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const w of weights) {
      roll -= w.weight;
      if (roll <= 0) return { id: w.id, ...w.fish };
    }
    return { id: weights[0].id, ...weights[0].fish };
  }

  rollBiteParams(rarity) {
    const baseWait = 2 + rarity * 0.5;
    const waitVariance = 1 + Math.random() * 2;
    const waitTime = baseWait + waitVariance;
    const nibbles = 1 + Math.floor(Math.random() * (1 + rarity));
    return { waitTime, nibbles };
  }
}
