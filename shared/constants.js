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

export const ACTIONS = {
  PLAYER_MOVE: 'player:move',
  PLAYER_JOIN: 'player:join',
  PLAYER_LEAVE: 'player:leave',
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
  WORLD_STATE: 'world:state',
  WORLD_UPDATE: 'world:update',
  TIME_UPDATE: 'time:update',
  WEATHER_UPDATE: 'weather:update',
  INVENTORY_UPDATE: 'inventory:update',
  CHAT_MESSAGE: 'chat:message',
};
