// server/entities/Player.js
import { SKILLS, SKILL_MAX_LEVEL, xpForSkillLevel, PROFESSIONS } from '../../shared/constants.js';

export class Player {
  constructor(data) {
    this.id = data.id;
    this.name = data.name || 'Farmer';
    this.x = data.x ?? 32;
    this.z = data.z ?? 32;
    this.coins = data.coins ?? 500;
    this.energy = data.energy ?? 100;
    this.maxEnergy = data.maxEnergy ?? 100;
    this.inventory = data.inventory || this._defaultInventory();
    this.currentMap = data.currentMap || 'farm';
    this.activeToolSlot = 0;
    this.socketId = data.socketId;
    this.toolTiers = data.toolTiers || {
      hoe: 0, watering_can: 0, pickaxe: 0, axe: 0, fishing_rod: 0,
    };

    // Professions — maps skill name to array of chosen profession IDs
    this.professions = data.professions || {};

    // Skills — initialize all to 0/0
    this.skills = {};
    for (const skill of Object.values(SKILLS)) {
      this.skills[skill] = { level: 0, xp: 0 };
    }
    // Overlay saved skills if provided
    if (data.skills) {
      for (const [name, val] of Object.entries(data.skills)) {
        this.skills[name] = { level: val.level || 0, xp: val.xp || 0 };
      }
    }

    // Derived: overall player level = sum of all skill levels
    this.level = this._calcLevel();
  }

  _defaultInventory() {
    return [
      { itemId: 'hoe', quantity: 1 },
      { itemId: 'watering_can', quantity: 1 },
      { itemId: 'pickaxe', quantity: 1 },
      { itemId: 'axe', quantity: 1 },
      { itemId: 'fishing_rod', quantity: 1 },
      { itemId: 'parsnip_seed', quantity: 15 },
      { itemId: 'carrot_seed', quantity: 10 },
    ];
  }

  _calcLevel() {
    let total = 0;
    for (const s of Object.values(this.skills)) total += s.level;
    return total;
  }

  addItem(itemId, quantity = 1, quality = 0) {
    const existing = this.inventory.find(i => i.itemId === itemId && (i.quality || 0) === quality);
    if (existing) existing.quantity += quantity;
    else this.inventory.push({ itemId, quantity, quality });
  }

  removeItem(itemId, quantity = 1, quality = undefined) {
    const slot = this.inventory.find(i =>
      i.itemId === itemId &&
      i.quantity >= quantity &&
      (quality === undefined || (i.quality || 0) === quality)
    );
    if (!slot) return false;
    slot.quantity -= quantity;
    if (slot.quantity <= 0) this.inventory = this.inventory.filter(i => i.quantity > 0);
    return true;
  }

  hasItem(itemId, quantity = 1) {
    const slot = this.inventory.find(i => i.itemId === itemId);
    return slot && slot.quantity >= quantity;
  }

  /** Add XP to a specific skill. Returns true if leveled up. */
  addSkillXP(skillName, amount) {
    const skill = this.skills[skillName];
    if (!skill || skill.level >= SKILL_MAX_LEVEL) return false;

    skill.xp += amount;
    let leveled = false;

    while (skill.level < SKILL_MAX_LEVEL && skill.xp >= xpForSkillLevel(skill.level + 1)) {
      skill.xp -= xpForSkillLevel(skill.level + 1);
      skill.level++;
      this.maxEnergy += 2;
      leveled = true;

      // Check if this level unlocks a profession choice
      if (skill.level === 5 || skill.level === 10) {
        this._pendingProfession = { skill: skillName, level: skill.level };
      }
    }

    this.level = this._calcLevel();
    return leveled;
  }

  getSkillLevel(skillName) {
    return this.skills[skillName]?.level || 0;
  }

  /** Legacy addXP — routes to farming skill */
  addXP(amount) {
    return this.addSkillXP(SKILLS.FARMING, amount);
  }

  useEnergy(amount) {
    if (this.energy < amount) return false;
    this.energy -= amount;
    return true;
  }

  hasProfession(profId) {
    for (const profs of Object.values(this.professions)) {
      if (profs.includes(profId)) return true;
    }
    return false;
  }

  getProfessionBonus(bonusKey) {
    let total = 0;
    for (const profs of Object.values(this.professions)) {
      for (const profId of profs) {
        for (const skillData of Object.values(PROFESSIONS)) {
          // Check level 5 options
          for (const opt of skillData[5] || []) {
            if (opt.id === profId && opt.bonus[bonusKey] !== undefined) {
              total += typeof opt.bonus[bonusKey] === 'number' ? opt.bonus[bonusKey] : 0;
            }
          }
          // Check level 10 options
          for (const branch of Object.values(skillData[10] || {})) {
            for (const opt of branch) {
              if (opt.id === profId && opt.bonus[bonusKey] !== undefined) {
                total += typeof opt.bonus[bonusKey] === 'number' ? opt.bonus[bonusKey] : 0;
              }
            }
          }
        }
      }
    }
    return total;
  }

  getState() {
    return {
      id: this.id, name: this.name,
      x: this.x, z: this.z, currentMap: this.currentMap,
      coins: this.coins,
      level: this.level,
      energy: Math.floor(this.energy),
      maxEnergy: this.maxEnergy,
      skills: this.skills,
      professions: this.professions,
      inventory: this.inventory,
      toolTiers: this.toolTiers,
    };
  }
}
