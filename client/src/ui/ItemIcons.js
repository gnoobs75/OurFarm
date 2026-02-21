// client/src/ui/ItemIcons.js
// Maps itemId → display info (emoji, color, name) for all game items.

const ITEMS = {
  // Tools
  hoe:          { emoji: '\u{1F33E}', color: '#b87333', name: 'Hoe' },
  watering_can: { emoji: '\u{1F4A7}', color: '#4488cc', name: 'Watering Can' },
  pickaxe:      { emoji: '\u{26CF}',  color: '#888899', name: 'Pickaxe' },
  axe:          { emoji: '\u{1FA93}', color: '#8b6b4a', name: 'Axe' },
  fishing_rod:  { emoji: '\u{1F3A3}', color: '#4a7a2a', name: 'Fishing Rod' },

  // Seeds
  wheat_seed:      { emoji: '\u{1F331}', color: '#daa520', name: 'Wheat Seeds' },
  corn_seed:       { emoji: '\u{1F331}', color: '#f5d142', name: 'Corn Seeds' },
  tomato_seed:     { emoji: '\u{1F331}', color: '#e74c3c', name: 'Tomato Seeds' },
  carrot_seed:     { emoji: '\u{1F331}', color: '#ff8c00', name: 'Carrot Seeds' },
  potato_seed:     { emoji: '\u{1F331}', color: '#8b7355', name: 'Potato Seeds' },
  strawberry_seed: { emoji: '\u{1F331}', color: '#ff3366', name: 'Strawberry Seeds' },
  pumpkin_seed:    { emoji: '\u{1F331}', color: '#ff7518', name: 'Pumpkin Seeds' },
  blueberry_seed:  { emoji: '\u{1F331}', color: '#4169e1', name: 'Blueberry Seeds' },

  // Harvested crops
  wheat:      { emoji: '\u{1F33E}', color: '#daa520', name: 'Wheat' },
  corn:       { emoji: '\u{1F33D}', color: '#f5d142', name: 'Corn' },
  tomato:     { emoji: '\u{1F345}', color: '#e74c3c', name: 'Tomato' },
  carrot:     { emoji: '\u{1F955}', color: '#ff8c00', name: 'Carrot' },
  potato:     { emoji: '\u{1F954}', color: '#8b7355', name: 'Potato' },
  strawberry: { emoji: '\u{1F353}', color: '#ff3366', name: 'Strawberry' },
  pumpkin:    { emoji: '\u{1F383}', color: '#ff7518', name: 'Pumpkin' },
  blueberry:  { emoji: '\u{1FAD0}', color: '#4169e1', name: 'Blueberry' },

  // Fish
  bass:       { emoji: '\u{1F41F}', color: '#4a7a2a', name: 'Bass' },
  trout:      { emoji: '\u{1F41F}', color: '#cc6644', name: 'Trout' },
  salmon:     { emoji: '\u{1F41F}', color: '#ff6655', name: 'Salmon' },
  catfish:    { emoji: '\u{1F41F}', color: '#776655', name: 'Catfish' },
  carp:       { emoji: '\u{1F41F}', color: '#aa8844', name: 'Carp' },
  pike:       { emoji: '\u{1F41F}', color: '#556644', name: 'Pike' },
  sturgeon:   { emoji: '\u{1F41F}', color: '#445566', name: 'Sturgeon' },

  // Animal products
  egg:        { emoji: '\u{1F95A}', color: '#fff8ee', name: 'Egg' },
  milk:       { emoji: '\u{1F95B}', color: '#ffffff', name: 'Milk' },
  wool:       { emoji: '\u{1F9F6}', color: '#eeeeee', name: 'Wool' },

  // Processed / crafted items
  flour:        { emoji: '\u{1F33E}', color: '#f5e6c8', name: 'Flour' },
  bread:        { emoji: '\u{1F35E}', color: '#d4a34a', name: 'Bread' },
  cake:         { emoji: '\u{1F370}', color: '#ffccdd', name: 'Cake' },
  cheese_wheel: { emoji: '\u{1F9C0}', color: '#f0c040', name: 'Cheese Wheel' },
  cloth:        { emoji: '\u{1F9F5}', color: '#dde8f0', name: 'Cloth' },
  copper_bar:   { emoji: '\u{1F7E7}', color: '#b87333', name: 'Copper Bar' },
  iron_bar:     { emoji: '\u{2B1C}',  color: '#a8a8a8', name: 'Iron Bar' },
  gold_bar:     { emoji: '\u{1F7E8}', color: '#ffd700', name: 'Gold Bar' },

  // Ores (for crafting inputs)
  copper_ore:   { emoji: '\u{1FAA8}', color: '#b87333', name: 'Copper Ore' },
  iron_ore:     { emoji: '\u{1FAA8}', color: '#a0a0a0', name: 'Iron Ore' },
  gold_ore:     { emoji: '\u{1FAA8}', color: '#ffd700', name: 'Gold Ore' },

  // Sprinklers
  sprinkler_basic:   { emoji: '\u{1F4A7}', color: '#888888', name: 'Sprinkler' },
  sprinkler_quality: { emoji: '\u{1F4A7}', color: '#ccaa44', name: 'Quality Sprinkler' },
  sprinkler_iridium: { emoji: '\u{1F4A7}', color: '#8844aa', name: 'Iridium Sprinkler' },

  // Fertilizers
  fertilizer_basic:   { emoji: '\u{1F9EA}', color: '#8B4513', name: 'Basic Fertilizer' },
  fertilizer_quality: { emoji: '\u{1F9EA}', color: '#DAA520', name: 'Quality Fertilizer' },
  speed_gro:          { emoji: '\u{26A1}',  color: '#00AA00', name: 'Speed-Gro' },
  deluxe_speed_gro:   { emoji: '\u{26A1}',  color: '#00FF00', name: 'Deluxe Speed-Gro' },
};

const TOOLS = new Set(['hoe', 'watering_can', 'pickaxe', 'axe', 'fishing_rod']);

const TOOL_ACTIONS = {
  hoe: 'hoe',
  watering_can: 'watering_can',
  pickaxe: 'pickaxe',
  axe: 'axe',
  fishing_rod: 'fishing_rod',
};

export function getItemIcon(itemId) {
  return ITEMS[itemId] || { emoji: '\u{2753}', color: '#aaaaaa', name: itemId };
}

export function getToolAction(itemId) {
  if (TOOL_ACTIONS[itemId]) return TOOL_ACTIONS[itemId];
  if (isSeed(itemId)) return 'seeds';
  if (itemId && itemId.startsWith('sprinkler_')) return 'sprinkler';
  if (itemId && (itemId.startsWith('fertilizer_') || itemId.includes('speed_gro'))) return 'fertilizer';
  return null;
}

export function isTool(itemId) {
  return TOOLS.has(itemId);
}

export function isSeed(itemId) {
  return itemId && itemId.endsWith('_seed');
}
