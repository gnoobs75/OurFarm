// shared/constants.js — Game constants used by both client and server

export const TILE_SIZE = 1;
export const WORLD_SIZE = 64;
export const TICK_RATE = 10; // server ticks per second
export const TIME_SCALE = 60; // 1 real second = 1 game minute

export const TILE_TYPES = {
  GRASS: 0,
  DIRT: 1,
  WATER: 2,
  STONE: 3,
  PATH: 4,
  SAND: 5,
  TILLED: 6,
};

export const SEASONS = {
  SPRING: 0,
  SUMMER: 1,
  FALL: 2,
  WINTER: 3,
};

export const SEASON_NAMES = ['Spring', 'Summer', 'Fall', 'Winter'];

export const DAYS_PER_SEASON = 28;
export const HOURS_PER_DAY = 24;
export const GAME_MINUTES_PER_HOUR = 60;

export const CROP_STAGES = {
  SEED: 0,
  SPROUT: 1,
  MATURE: 2,
  HARVESTABLE: 3,
};

export const WEATHER = {
  SUNNY: 0,
  CLOUDY: 1,
  RAINY: 2,
  STORMY: 3,
  SNOWY: 4,
};

export const FISH_RARITY = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 2,
  LEGENDARY: 3,
};

export const RELATIONSHIP_MAX = 10;

export const COLORS = {
  GRASS_SPRING: 0x7ec850,
  GRASS_SUMMER: 0x5da832,
  GRASS_FALL: 0xc4a332,
  GRASS_WINTER: 0xddeeff,
  DIRT: 0x8b6914,
  TILLED: 0x5c4a1e,
  WATER: 0x4a90d9,
  STONE: 0x888888,
  PATH: 0xc4a882,
  SAND: 0xe8d68c,
};

export const MAP_IDS = {
  FARM: 'farm',
  TOWN: 'town',
};

export const ACTIONS = {
  PLAYER_MOVE: 'player:move',
  PLAYER_JOIN: 'player:join',
  PLAYER_LEAVE: 'player:leave',
  MAP_TRANSITION: 'map:transition',
  FARM_TILL: 'farm:till',
  FARM_PLANT: 'farm:plant',
  FARM_WATER: 'farm:water',
  FARM_HARVEST: 'farm:harvest',
  FISH_CAST: 'fish:cast',
  FISH_REEL: 'fish:reel',
  NPC_TALK: 'npc:talk',
  NPC_GIFT: 'npc:gift',
  PET_INTERACT: 'pet:interact',
  CRAFT_START: 'craft:start',
  CRAFT_COLLECT: 'craft:collect',
  SHOP_BUY: 'shop:buy',
  SHOP_SELL: 'shop:sell',
  ANIMAL_FEED: 'animal:feed',
  ANIMAL_COLLECT: 'animal:collect',
  SHIP_ITEM: 'ship:item',
  TOOL_UPGRADE: 'tool:upgrade',
  PLACE_SPRINKLER: 'farm:placeSprinkler',
  APPLY_FERTILIZER: 'farm:fertilize',
  WORLD_STATE: 'world:state',
  WORLD_UPDATE: 'world:update',
  TIME_UPDATE: 'time:update',
  WEATHER_UPDATE: 'weather:update',
  INVENTORY_UPDATE: 'inventory:update',
  CHAT_MESSAGE: 'chat:message',
};

// Skills
export const SKILLS = {
  FARMING: 'farming',
  FISHING: 'fishing',
  MINING: 'mining',
  FORAGING: 'foraging',
  COMBAT: 'combat',
};

export const SKILL_MAX_LEVEL = 10;

// XP needed for each level: level * 100
export function xpForSkillLevel(level) {
  return level * 100;
}

// Crop quality tiers
export const QUALITY = {
  NORMAL: 0,
  SILVER: 1,
  GOLD: 2,
  IRIDIUM: 3,
};

export const QUALITY_MULTIPLIER = {
  0: 1.0,
  1: 1.25,
  2: 1.5,
  3: 2.0,
};

export const GIFT_POINTS = {
  LOVED: 80,
  LIKED: 45,
  NEUTRAL: 20,
  DISLIKED: -20,
  HATED: -40,
};

export const TOOL_TIERS = {
  BASIC: 0, COPPER: 1, IRON: 2, GOLD: 3, IRIDIUM: 4,
};

export const TOOL_UPGRADE_COST = {
  1: { bars: 'copper_bar', barQty: 5, coins: 2000 },
  2: { bars: 'iron_bar', barQty: 5, coins: 5000 },
  3: { bars: 'gold_bar', barQty: 5, coins: 10000 },
  4: { bars: 'iridium_bar', barQty: 5, coins: 25000 },
};

export const TOOL_ENERGY_COST = {
  hoe:          [2, 2, 1, 1, 0],
  watering_can: [1, 1, 1, 0, 0],
  pickaxe:      [3, 3, 2, 2, 1],
  axe:          [2, 2, 1, 1, 0],
};

export const SPRINKLER_DATA = {
  sprinkler_basic: { tier: 1, range: 'adjacent', tiles: [[0,-1],[0,1],[-1,0],[1,0]] },
  sprinkler_quality: { tier: 2, range: '3x3', tiles: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] },
  sprinkler_iridium: { tier: 3, range: '5x5', tiles: [] },
};
// Fill iridium 5x5 minus center and corners
for (let dx = -2; dx <= 2; dx++) {
  for (let dz = -2; dz <= 2; dz++) {
    if (dx === 0 && dz === 0) continue;
    if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
    SPRINKLER_DATA.sprinkler_iridium.tiles.push([dx, dz]);
  }
}

export const FERTILIZER_DATA = {
  fertilizer_basic: { qualityBonus: 0.10, speedBonus: 0 },
  fertilizer_quality: { qualityBonus: 0.25, speedBonus: 0 },
  speed_gro: { qualityBonus: 0, speedBonus: 0.10 },
  deluxe_speed_gro: { qualityBonus: 0, speedBonus: 0.25 },
};
