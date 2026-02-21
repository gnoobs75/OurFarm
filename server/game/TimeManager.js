// server/game/TimeManager.js
// Manages accelerated game time: day/night cycle, seasons, calendar.

import { TIME_SCALE, DAYS_PER_SEASON, HOURS_PER_DAY, SEASONS } from '../../shared/constants.js';

export class TimeManager {
  constructor(state = {}) {
    this.season = state.season ?? SEASONS.SPRING;
    this.day = state.day ?? 1;
    this.hour = state.hour ?? 6.0;
    this.paused = false;
  }

  tick(deltaSec) {
    if (this.paused) return [];
    const events = [];
    const gameMinutes = (deltaSec * TIME_SCALE) / 60;
    this.hour += gameMinutes / 60;

    if (this.hour >= HOURS_PER_DAY) {
      this.hour -= HOURS_PER_DAY;
      this.day++;
      events.push({ type: 'newDay', day: this.day, season: this.season });

      if (this.day > DAYS_PER_SEASON) {
        this.day = 1;
        this.season = (this.season + 1) % 4;
        events.push({ type: 'newSeason', season: this.season });
      }
    }
    return events;
  }

  isNight() { return this.hour >= 20 || this.hour < 6; }

  getSunIntensity() {
    if (this.hour < 5) return 0.1;
    if (this.hour < 7) return 0.1 + (this.hour - 5) * 0.45;
    if (this.hour < 17) return 1.0;
    if (this.hour < 20) return 1.0 - (this.hour - 17) * 0.3;
    return 0.1;
  }

  getState() { return { season: this.season, day: this.day, hour: this.hour }; }
}
