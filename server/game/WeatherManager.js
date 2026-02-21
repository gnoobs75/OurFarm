// server/game/WeatherManager.js
import { WEATHER, SEASONS } from '../../shared/constants.js';

export class WeatherManager {
  constructor(seed) {
    this.currentWeather = WEATHER.SUNNY;
    this.seed = seed;
    this._counter = 0;
  }

  onNewDay(season) {
    this._counter++;
    const rand = this._seededRandom(this.seed + this._counter);
    const probs = {
      [SEASONS.SPRING]: { sunny: 0.4, cloudy: 0.25, rainy: 0.3, stormy: 0.05, snowy: 0 },
      [SEASONS.SUMMER]: { sunny: 0.6, cloudy: 0.2, rainy: 0.15, stormy: 0.05, snowy: 0 },
      [SEASONS.FALL]:   { sunny: 0.35, cloudy: 0.3, rainy: 0.25, stormy: 0.1, snowy: 0 },
      [SEASONS.WINTER]: { sunny: 0.25, cloudy: 0.25, rainy: 0.1, stormy: 0.05, snowy: 0.35 },
    };
    const p = probs[season] || probs[SEASONS.SPRING];
    let cumulative = 0;
    for (const [weather, prob] of Object.entries(p)) {
      cumulative += prob;
      if (rand < cumulative) {
        this.currentWeather = WEATHER[weather.toUpperCase()];
        break;
      }
    }
    return this.currentWeather;
  }

  isRaining() {
    return this.currentWeather === WEATHER.RAINY || this.currentWeather === WEATHER.STORMY;
  }

  _seededRandom(s) {
    const x = Math.sin(s * 9301 + 49297) * 49297;
    return x - Math.floor(x);
  }

  getState() { return { weather: this.currentWeather }; }
}
