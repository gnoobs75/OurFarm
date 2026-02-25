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

export const STAGE_NAMES = ['Seed', 'Sprout', 'Mature', 'Harvestable'];

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
  PET_GROOM: 'pet:groom',
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
  PLACE_MACHINE: 'machine:place',
  MACHINE_INPUT: 'machine:input',
  MACHINE_COLLECT: 'machine:collect',
  FORAGE_COLLECT: 'forage:collect',
  PROFESSION_CHOICE: 'profession:choice',
  WORLD_STATE: 'world:state',
  WORLD_UPDATE: 'world:update',
  TIME_UPDATE: 'time:update',
  WEATHER_UPDATE: 'weather:update',
  INVENTORY_UPDATE: 'inventory:update',
  CHAT_MESSAGE: 'chat:message',
  RESOURCE_HIT: 'farm:resourceHit',
  MULTI_TILL: 'farm:multiTill',
  MULTI_WATER: 'farm:multiWater',
  MULTI_PLANT: 'farm:multiPlant',
  REST_AT_HOUSE: 'player:rest',
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

export const FORAGE_ITEMS = {
  0: ['daffodil', 'leek', 'dandelion', 'spring_onion'],
  1: ['grape', 'spice_berry', 'sweet_pea', 'fiddlehead_fern'],
  2: ['wild_plum', 'hazelnut', 'blackberry', 'chanterelle'],
  3: ['crystal_fruit', 'crocus', 'snow_yam', 'winter_root'],
};

export const PROFESSIONS = {
  farming: {
    5: [
      { id: 'rancher', name: 'Rancher', description: '+20% animal product value', bonus: { animalProductValue: 0.20 } },
      { id: 'tiller', name: 'Tiller', description: '+10% crop sell value', bonus: { cropSellValue: 0.10 } },
    ],
    10: {
      rancher: [
        { id: 'coopmaster', name: 'Coopmaster', description: 'Incubation time halved', bonus: { incubationSpeed: 0.5 } },
        { id: 'shepherd', name: 'Shepherd', description: 'Animals befriend faster', bonus: { animalFriendship: 0.5 } },
      ],
      tiller: [
        { id: 'artisan', name: 'Artisan', description: '+40% artisan goods value', bonus: { artisanValue: 0.40 } },
        { id: 'agriculturist', name: 'Agriculturist', description: '+10% crop growth speed', bonus: { cropGrowth: 0.10 } },
      ],
    },
  },
  fishing: {
    5: [
      { id: 'fisher', name: 'Fisher', description: '+25% fish sell value', bonus: { fishSellValue: 0.25 } },
      { id: 'trapper', name: 'Trapper', description: 'Crab pots no bait needed', bonus: { noBait: true } },
    ],
    10: {
      fisher: [
        { id: 'angler', name: 'Angler', description: '+50% fish sell value', bonus: { fishSellValue: 0.50 } },
        { id: 'pirate', name: 'Pirate', description: 'Double treasure chance', bonus: { treasureChance: 2 } },
      ],
      trapper: [
        { id: 'mariner', name: 'Mariner', description: 'No junk in crab pots', bonus: { noJunk: true } },
        { id: 'luremaster', name: 'Luremaster', description: 'No bait needed for fishing', bonus: { noBaitFishing: true } },
      ],
    },
  },
  mining: {
    5: [
      { id: 'miner', name: 'Miner', description: '+1 ore per node', bonus: { oreBonus: 1 } },
      { id: 'geologist', name: 'Geologist', description: '+50% gem chance', bonus: { gemChance: 0.5 } },
    ],
    10: {
      miner: [
        { id: 'blacksmith_prof', name: 'Blacksmith', description: '+50% bar sell value', bonus: { barSellValue: 0.5 } },
        { id: 'prospector', name: 'Prospector', description: 'Double coal finds', bonus: { coalDouble: true } },
      ],
      geologist: [
        { id: 'excavator', name: 'Excavator', description: 'Double geode finds', bonus: { geodeDouble: true } },
        { id: 'gemologist', name: 'Gemologist', description: '+30% gem sell value', bonus: { gemSellValue: 0.3 } },
      ],
    },
  },
  foraging: {
    5: [
      { id: 'forester', name: 'Forester', description: '+25% wood from trees', bonus: { woodBonus: 0.25 } },
      { id: 'gatherer', name: 'Gatherer', description: '20% chance double forage', bonus: { doubleForage: 0.2 } },
    ],
    10: {
      forester: [
        { id: 'lumberjack', name: 'Lumberjack', description: 'Hardwood from any tree', bonus: { hardwoodAll: true } },
        { id: 'tapper_prof', name: 'Tapper', description: 'Tree syrup 2x faster', bonus: { tapperSpeed: 2 } },
      ],
      gatherer: [
        { id: 'botanist', name: 'Botanist', description: 'Forage always best quality', bonus: { forageQuality: 'gold' } },
        { id: 'tracker', name: 'Tracker', description: 'Forage locations shown on map', bonus: { forageTracker: true } },
      ],
    },
  },
  combat: {
    5: [
      { id: 'fighter', name: 'Fighter', description: '+15% attack damage', bonus: { attackDamage: 0.15 } },
      { id: 'scout', name: 'Scout', description: '+50% crit chance', bonus: { critChance: 0.5 } },
    ],
    10: {
      fighter: [
        { id: 'brute', name: 'Brute', description: '+15% more attack damage', bonus: { attackDamage: 0.15 } },
        { id: 'defender', name: 'Defender', description: '+25 max HP', bonus: { maxHP: 25 } },
      ],
      scout: [
        { id: 'acrobat', name: 'Acrobat', description: 'Cooldown halved', bonus: { cooldownReduction: 0.5 } },
        { id: 'desperado', name: 'Desperado', description: 'Crit damage doubled', bonus: { critDamage: 2 } },
      ],
    },
  },
};

// Fruit tree types and data
export const FRUIT_TYPES = ['apple', 'cherry', 'orange', 'peach'];

export const FRUIT_DATA = {
  apple:  { name: 'Apple',  sellPrice: 50,  color: 0xcc3333 },
  cherry: { name: 'Cherry', sellPrice: 40,  color: 0xdd2255 },
  orange: { name: 'Orange', sellPrice: 60,  color: 0xff8800 },
  peach:  { name: 'Peach',  sellPrice: 70,  color: 0xffaa88 },
};

export const FRUIT_REGROW_HOURS = 24; // in-game hours until fruit regrows

export const SAPLING_DATA = {
  apple_sapling:  { fruitType: 'apple',  growthDays: 7, price: 200 },
  cherry_sapling: { fruitType: 'cherry', growthDays: 7, price: 150 },
  orange_sapling: { fruitType: 'orange', growthDays: 7, price: 250 },
  peach_sapling:  { fruitType: 'peach',  growthDays: 7, price: 300 },
};

export const RESOURCE_DATA = {
  tree: { health: 5, drops: [{ itemId: 'wood', quantity: 8 }], stumpHealth: 2, stumpDrops: [{ itemId: 'wood', quantity: 2 }], tool: 'axe', xpPerHit: 2 },
  rock: { health: 3, drops: [{ itemId: 'stone', quantity: 5 }], tool: 'pickaxe', xpPerHit: 2 },
};

export const HOLD_EXPAND_TILES = 3;  // 1x3 row
export const HOLD_EXPAND_ENERGY_MULT = 2; // 2x energy for 3 tiles
