// shared/ItemRegistry.js — Central item ID and category registry

export const ITEM_CATEGORIES = {
  SEED: 'seed',
  CROP: 'crop',
  ANIMAL_PRODUCT: 'animal_product',
  FISH: 'fish',
  ORE: 'ore',
  BAR: 'bar',
  PROCESSED: 'processed',
  TOOL: 'tool',
};

export const TOOLS = {
  HOE: 'hoe',
  WATERING_CAN: 'watering_can',
  PICKAXE: 'pickaxe',
  AXE: 'axe',
  FISHING_ROD: 'fishing_rod',
};

// Maps item IDs to display info
export const ITEMS = {
  // Crops
  wheat: { name: 'Wheat', category: 'crop' },
  corn: { name: 'Corn', category: 'crop' },
  tomato: { name: 'Tomato', category: 'crop' },
  carrot: { name: 'Carrot', category: 'crop' },
  potato: { name: 'Potato', category: 'crop' },
  strawberry: { name: 'Strawberry', category: 'crop' },
  pumpkin: { name: 'Pumpkin', category: 'crop' },
  blueberry: { name: 'Blueberry', category: 'crop' },
  // Seeds
  wheat_seed: { name: 'Wheat Seeds', category: 'seed' },
  corn_seed: { name: 'Corn Seeds', category: 'seed' },
  tomato_seed: { name: 'Tomato Seeds', category: 'seed' },
  carrot_seed: { name: 'Carrot Seeds', category: 'seed' },
  potato_seed: { name: 'Potato Seeds', category: 'seed' },
  strawberry_seed: { name: 'Strawberry Seeds', category: 'seed' },
  pumpkin_seed: { name: 'Pumpkin Seeds', category: 'seed' },
  blueberry_seed: { name: 'Blueberry Seeds', category: 'seed' },
  // Animal products
  egg: { name: 'Egg', category: 'animal_product' },
  milk: { name: 'Milk', category: 'animal_product' },
  wool: { name: 'Wool', category: 'animal_product' },
  cheese: { name: 'Cheese', category: 'animal_product' },
  honey: { name: 'Honey', category: 'animal_product' },
  // Ores
  copper_ore: { name: 'Copper Ore', category: 'ore' },
  iron_ore: { name: 'Iron Ore', category: 'ore' },
  gold_ore: { name: 'Gold Ore', category: 'ore' },
  // Bars
  copper_bar: { name: 'Copper Bar', category: 'bar' },
  iron_bar: { name: 'Iron Bar', category: 'bar' },
  gold_bar: { name: 'Gold Bar', category: 'bar' },
  // Processed
  flour: { name: 'Flour', category: 'processed' },
  bread: { name: 'Bread', category: 'processed' },
  cake: { name: 'Cake', category: 'processed' },
  cheese_wheel: { name: 'Cheese Wheel', category: 'processed' },
  cloth: { name: 'Cloth', category: 'processed' },
  // Tools
  hoe: { name: 'Hoe', category: 'tool' },
  watering_can: { name: 'Watering Can', category: 'tool' },
  pickaxe: { name: 'Pickaxe', category: 'tool' },
  axe: { name: 'Axe', category: 'tool' },
  fishing_rod: { name: 'Fishing Rod', category: 'tool' },
};
