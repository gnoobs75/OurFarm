// server/entities/Fish.js
export class FishCalculator {
  constructor(fishData) {
    this.fishData = fishData;
    this.allFish = Object.entries(fishData);
  }

  rollCatch(location, playerLevel, rodQuality = 1, baitBonus = 0) {
    const available = this.allFish.filter(([, f]) =>
      f.location === location && f.minLevel <= playerLevel
    );
    if (available.length === 0) return null;

    const weights = available.map(([id, f]) => {
      const rarityWeight = [1, 0.3, 0.1, 0.02][f.rarity] || 0.5;
      return { id, fish: f, weight: rarityWeight * rodQuality + baitBonus };
    });

    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const w of weights) {
      roll -= w.weight;
      if (roll <= 0) return { id: w.id, ...w.fish };
    }
    return { id: weights[0].id, ...weights[0].fish };
  }
}
