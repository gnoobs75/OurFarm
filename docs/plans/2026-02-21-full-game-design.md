# OurFarm — Full Game Design Document

**Date:** 2026-02-21
**Direction:** Stardew-style cozy grinder with deep interlocking systems
**Multiplayer:** Co-op shared-world focus
**Meta-progression:** Hybrid — Community Barn bundles + milestone permits

---

## Core Loop

```
FARM → raw goods → PROCESS → artisan goods → SELL → coins
  ↓                                                   ↓
MINE → ores → SMELT → bars → CRAFT → tools/machines/sprinklers
  ↓                                                   ↓
FISH → catches → COOK → meals (buffs) ← recipes from NPCs
  ↓                                                   ↓
FORAGE → wild items ──────→ COMMUNITY BARN bundles ← all systems
```

---

## 1. Economy & Progression

### Currency
- **Coins** — sole currency. Start: 500. No cap.
- **Shipping bin** on farm — toss items in, payment next morning.
- Direct shop sales also available (immediate, same price).

### XP & Skill System (5 skills, each 0-10)

| Skill | Levels By | Per-Level Bonus | Lvl 5 Choice | Lvl 10 Choice |
|-------|-----------|-----------------|---------------|----------------|
| Farming | Harvesting | Crop quality +3% | Rancher (animal +20%) vs Tiller (crop sell +10%) | Artisan (artisan goods +40%) vs Agriculturist (grow 10% faster) |
| Fishing | Catching | Bar size +8px | Fisher (sell +25%) vs Trapper (pots no bait) | Angler (sell +50%) vs Mariner (pots no junk) |
| Mining | Breaking rocks | Ore +5% | Miner (+1 ore/vein) vs Geologist (gem +50%) | Blacksmith (bars sell +50%) vs Prospector (coal +100%) |
| Foraging | Picking wild items | Quality +3% | Forester (wood +25%) vs Gatherer (double 20%) | Lumberjack (hardwood all trees) vs Botanist (gold quality) |
| Combat | Killing monsters | HP +5 | Fighter (dmg +10%) vs Scout (crit +50%) | Brute (dmg +15%) vs Defender (taken -15%) |

**Level XP curve:** Level N = N × 100 XP.

### Energy System
- Base 100, +5 per player level.
- Costs: till 2, water 1, mine 3, chop 2, fish cast 5.
- Food restores 10-80+ energy.
- Full restore on new day.
- **Collapse at 2 AM** — lose 10% coins (max 1000), wake with reduced energy.
- **Bed by midnight** for full energy; after midnight, proportionally reduced.

---

## 2. Farming & Processing

### Crop Quality

| Quality | Sell Multiplier | Base Chance |
|---------|----------------|-------------|
| Normal | 1.0x | 100% - others |
| Silver | 1.25x | Farming × 3% |
| Gold | 1.5x | Farming × 1.5% |
| Iridium | 2.0x | Deluxe Fertilizer only |

### Fertilizers

| Fertilizer | Effect | Recipe |
|------------|--------|--------|
| Basic | +1 quality tier | 2 Sap |
| Quality | +2 quality tier | Fish + Sap |
| Deluxe | Enables iridium | Gold-star fish + Iridium bar |
| Speed-Gro | Growth 10% faster | Pine Tar + Clam |
| Deluxe Speed-Gro | Growth 25% faster | Oak Resin + Coral |
| Water-Retaining Soil | 33% stay watered | Clay × 2 |

### Crops (24 total)

**Spring:** Parsnip (4d), Potato (6d), Cauliflower (12d), Garlic (4d), Kale (6d), Strawberry (8d, regrows)

**Summer:** Melon (12d), Tomato (11d, regrows), Blueberry (13d, regrows), Hot Pepper (5d, regrows), Corn (14d, regrows — also fall), Red Cabbage (9d)

**Fall:** Pumpkin (13d), Cranberry (7d, regrows), Grape (10d, regrows), Artichoke (8d), Beet (6d), Yam (10d)

**Year-round (greenhouse):** Ancient Fruit (28d, regrows), Starfruit (13d), Coffee Bean (10d, regrows)

**Multi-season:** Corn (summer+fall), Wheat (summer+fall, 4d)

### Artisan Processing Machines

| Machine | Input | Output | Time | Value |
|---------|-------|--------|------|-------|
| Keg | Fruit | Wine | 7 days | 3× base |
| Keg | Vegetable | Juice | 4 days | 2.25× base |
| Preserves Jar | Any crop | Pickles/Jam | 3 days | 2× base + 50g |
| Oil Maker | Corn/Sunflower/Truffle | Oil | 1 day | Truffle oil = 1065g |
| Cheese Press | Milk | Cheese | 3.3 hours | 200g (gold 230g) |
| Mayonnaise Machine | Egg | Mayonnaise | 3 hours | 190g |
| Loom | Wool | Cloth | 4 hours | 470g |
| Bee House | Near flowers | Honey | 4 days | 100-680g |

**Design tension:** Kegs multiply by base value (expensive crops win). Preserves Jars add flat bonus (cheap crops benefit proportionally). Genuine strategy in what to process.

### Cask Aging (Cellar)
- Normal → Silver: 14 days
- Silver → Gold: 14 days
- Gold → Iridium: 14 days
- **Iridium Starfruit Wine = 4500g**

### Sprinkler Progression

| Sprinkler | Recipe | Tiles | Unlock |
|-----------|--------|-------|--------|
| Basic | Copper bar + Iron bar | 4 adjacent | Farming 2 |
| Quality | Iron bar + Gold bar | 8 (3×3) | Farming 6 |
| Iridium | Iridium bar + Gold bar + Battery | 24 (5×5) | Farming 9 |

### Tool Upgrades

| Tier | Material | Effect | Cost | Time |
|------|----------|--------|------|------|
| Basic | — | Single tile | Free | — |
| Copper | Copper bar × 5 | Charge: 3 tiles | 2000g | 2 days |
| Iron | Iron bar × 5 | Charge: 5 tiles | 5000g | 2 days |
| Gold | Gold bar × 5 | Charge: 3×3 | 10000g | 2 days |
| Iridium | Iridium bar × 5 | Charge: 5×5 | 25000g | 2 days |

Tools: Hoe, Watering Can, Pickaxe, Axe. Each tier: -1 energy cost. 2-day downtime forces planning.

---

## 3. Mining & Combat

### The Mine (120 floors)

| Floors | Biome | Ores | Monsters |
|--------|-------|------|----------|
| 1-39 | Earth | Copper, Coal | Slimes, Grubs |
| 40-79 | Ice | Iron, Coal, Gold | Bats, Frost Slimes |
| 80-119 | Lava | Gold, Iridium | Shadow Brutes, Lava Bats |
| 120 | Bottom | — | Skull Key reward |

Elevator checkpoints every 5 floors. Break rocks to find ladder.

### Skull Cavern (Endgame)
Unlocked after floor 120. No elevator — start from 1 each run. Iridium ramps past floor 50. Roguelite "how deep" challenge.

### Smelting

| Ore | Time | Bar Value | Key Uses |
|-----|------|-----------|----------|
| Copper | 30 min | 60g | Basic sprinklers, copper tools |
| Iron | 2 hours | 120g | Quality sprinklers, iron tools |
| Gold | 5 hours | 250g | Gold tools, components |
| Iridium | 8 hours | 1000g | Iridium tools/sprinklers, endgame |

Each smelt requires 1 coal.

### Weapons

| Weapon | Damage | Source |
|--------|--------|--------|
| Rusty Sword | 2-5 | Starting |
| Steel Falchion | 8-14 | Floor 25 chest |
| Obsidian Edge | 18-28 | Floor 60 chest |
| Lava Katana | 30-45 | Floor 100 chest |
| Galaxy Sword | 60-80 | Special quest |

### Monster Drops
- Slime → Slime (crafting)
- Bat → Bat Wing (lightning rod)
- Shadow Brute → Void Essence (endgame crafting)
- All → chance of gems, coal, ore

### Geodes
40 unique minerals. Cracked at Blacksmith (25g). Feed into museum collection.

---

## 4. Fishing

### Minigame
- Vertical bar with moveable green "catch zone"
- Fish icon bounces erratically (behavior type determines pattern)
- Keep catch zone on fish to fill progress meter
- Fish escapes if meter empties
- Fishing skill: +8px catch zone per level (60px → 140px)

### Rods

| Rod | Slots | Source | Cost |
|-----|-------|--------|------|
| Bamboo | None | Starting | Free |
| Fiberglass | Bait | Fishing 2 | 1800g |
| Iridium | Bait + Tackle | Fishing 6 | 7500g |

### Bait

| Bait | Effect | Source |
|------|--------|--------|
| Basic | Bite -50% | 1 Bug Meat |
| Wild | Bite -62%, double catch chance | Fiber + Bug Meat + Slime |
| Magic | Catch any fish regardless of conditions | Radioactive Ore + Bug Meat |

### Tackle (lasts ~20 uses)

| Tackle | Effect |
|--------|--------|
| Spinner | Bite -25% |
| Trap Bobber | Fish escapes 33% slower |
| Cork Bobber | Catch bar +24px |
| Lead Bobber | Bar doesn't bounce |
| Curiosity Lure | 2× rare fish chance |

### Fish Behaviors

| Behavior | Movement | Examples |
|----------|----------|---------|
| Mixed | Moderate | Bass, Trout, Salmon |
| Dart | Fast bursts | Pike, Tuna, Swordfish |
| Smooth | Slow, gentle | Carp, Catfish |
| Sinker | Stays low | Sturgeon, Lobster |
| Floater | Stays high | Perch, Goldfish |

### Fish (30+ species)
Keep existing 15, add 15+ with season/weather/time/location requirements. Legendaries require specific conditions + skill level.

### Crab Pots
Place in water, bait daily, harvest daily. 60% catch (Crayfish, Snail, etc.), 40% junk (recyclable).

### Fish Ponds
Stock with fish. Fish reproduce. Produce roe (processable into Aged Roe via Preserves Jar).

---

## 5. NPCs & Social

### Relationships
- 10 hearts per NPC (250 pts/heart)
- 2 gifts/week (max 1/day). Birthday: 8× bonus
- Decay: -2 pts/day if not talked to
- Heart events at 2, 4, 6, 8, 10 hearts (cutscenes with choices)
- Recipe rewards at 2, 4, 6, 8 hearts

### NPCs & Gift Preferences

| NPC | Role | Loved Gifts | Recipe Rewards |
|-----|------|------------|----------------|
| Rosie | Baker | Cake, Chocolate, Strawberry | Bread, Cake, Cookie, Pie |
| Grim | Blacksmith | Gold Bar, Diamond, Ruby | Miner's Treat, Spicy Eel |
| Willow | Librarian | Pumpkin, Ancient Fruit, Jade | Lucky Lunch, Pumpkin Soup |
| Old Pete | Fisherman | Legend Carp, Lobster, Coral | Fish Stew, Sashimi, Lobster Bisque |
| Mayor Hart | Mayor | Truffle Oil, Wine, Gold Melon | Farmer's Lunch, Roasted Vegetables |
| Dr. Fern | Vet | Animal products, Flowers | Salad, Cheese Cauliflower, Complete Breakfast |

### NPC Schedules
- 6-8 AM: Home
- 8 AM - 6 PM: Shop/work
- 6-8 PM: Town square
- 8 PM - 6 AM: Home (locked)

### Cooking
Unlocked with kitchen house upgrade. Recipes from NPCs, TV, mine chests.

Key meals with buffs:

| Meal | Buff |
|------|------|
| Farmer's Lunch | Farming +3 |
| Miner's Treat | Mining +3, Speed +1 |
| Lucky Lunch | Luck +3 |
| Spicy Eel | Speed +1, Luck +1 |
| Complete Breakfast | Farming +2, Speed +1, Energy +50 |

### Festivals

| Festival | Season Day | Activity |
|----------|-----------|----------|
| Egg Festival | Spring 13 | Egg hunt, strawberry seeds |
| Luau | Summer 11 | Potluck (ingredient quality matters) |
| Harvest Fair | Fall 16 | Grange display judging, Star Token shop |
| Festival of Ice | Winter 8 | Ice fishing competition |

---

## 6. Buildings & Farm Upgrades

### Farm Buildings

| Building | Cost | Purpose | Upgrades |
|----------|------|---------|----------|
| Coop | 4000g + Wood 300 + Stone 100 | Chickens (4 cap) | Big → Deluxe (ducks, rabbits, incubator, auto-feed) |
| Barn | 6000g + Wood 350 + Stone 150 | Cows (4 cap) | Big → Deluxe (goats, sheep, pigs, auto-feed) |
| Silo | 100g + Stone 100 + Clay 10 | 240 hay storage | — |
| Well | 1000g + Stone 75 | Refill watering can | — |
| Stable | 10000g + Hardwood 100 + Iron 5 | Horse (fast travel) | — |
| Fish Pond | 5000g + Stone 200 + Seaweed 5 | Breed fish, roe | — |
| Mill | 2500g + Stone 50 + Wood 150 | Wheat→Flour, Beet→Sugar | — |
| Shed | 15000g + Wood 300 | Machine room | Big Shed (2×) |
| Slime Hutch | 10000g + Stone 500 + Iridium 1 | Breed slimes | — |

### House Upgrades

| Tier | Cost | Adds |
|------|------|------|
| Starter Cabin | Free | Bed, single room |
| Kitchen | 10000g + Wood 450 | Kitchen, fridge |
| Nursery | 50000g + Hardwood 150 | Extra rooms, cellar (33 casks) |

---

## 7. Community Barn (Meta-Progression)

Dilapidated barn, center of map. 6 rooms, each with 4-5 bundles.

| Room | Theme | Reward |
|------|-------|--------|
| Crops Room | Farming | **Greenhouse** (year-round growing) |
| Fish Tank | Fishing | Fish Pond blueprints + new fishing area |
| Forge Room | Mining | **Mine carts** (fast travel) |
| Kitchen Room | Cooking/Foraging | Upgraded shop inventory |
| Animal Room | Animals | Auto-pet (no happiness decay) |
| Workshop Room | Crafting | Teleport totems |

### Milestone Permits

Achievements earn Permit Points. Examples:
- Ship 100 items → 1 PP
- Catch 30 fish → 1 PP
- Mine floor 40 → 1 PP

Permit unlocks:

| Permit | Cost | Unlocks |
|--------|------|---------|
| Fishing License II | 2 PP | Ocean area |
| Mining License II | 2 PP | Skull Cavern |
| Building Permit II | 3 PP | Shed, Fish Pond, Slime Hutch |
| Horse License | 2 PP | Stable blueprint |
| Land Expansion | 5 PP | Additional farmable land |

---

## 8. Animals

| Animal | Building | Product | Frequency | Base Value |
|--------|----------|---------|-----------|-----------|
| Chicken | Coop | Egg | Daily | 50g |
| Duck | Big Coop | Duck Egg | 2 days | 95g |
| Rabbit | Deluxe Coop | Wool | 4 days | 340g |
| Cow | Barn | Milk | Daily | 125g |
| Goat | Big Barn | Goat Milk | 2 days | 225g |
| Sheep | Deluxe Barn | Wool | 3 days | 340g |
| Pig | Deluxe Barn | Truffle | Daily (outside) | 625g |

Happiness 0-5 hearts. Higher happiness = silver/gold star products.

---

## 9. Foraging & Seasons

### Seasonal Forageables

| Season | Items |
|--------|-------|
| Spring | Daffodil, Leek, Dandelion, Spring Onion |
| Summer | Grape, Spice Berry, Sweet Pea, Fiddlehead Fern |
| Fall | Wild Plum, Hazelnut, Blackberry, Chanterelle |
| Winter | Crystal Fruit, Crocus, Snow Yam, Winter Root |

### Tree Tapping

| Tree | Product | Time |
|------|---------|------|
| Oak | Oak Resin | 7 days |
| Maple | Maple Syrup | 9 days |
| Pine | Pine Tar | 5 days |

### Season Mechanics
- **Spring:** Frequent rain (free watering), regrowth
- **Summer:** Long days, thunderstorms → battery packs via lightning rods
- **Fall:** Mushrooms, multi-harvest peak
- **Winter:** No outdoor crops. Mining/fishing/relationship focus. Tool upgrade season.
- **Season change kills unfinished crops** (except multi-season + greenhouse)

---

## 10. Collections & Endgame

### Museum
- 40 minerals (from geodes)
- 20 artifacts (from artifact spots)
- 30+ fish (encyclopedia)
- Milestone rewards at 10/20/30/40/50/60 donations

### Shipping Log
Every unique item shipped tracked. Completion percentage goal.

### Perfection Tracker

| Category | Weight |
|----------|--------|
| Shipping Log | 15% |
| Fish Caught | 10% |
| Cooking Recipes | 10% |
| Crafting Recipes | 10% |
| Museum | 10% |
| Community Barn | 10% |
| Milestones | 10% |
| NPC Hearts | 10% |
| Skills | 10% |
| Wallet Items | 5% |

100% reward: Statue of Perfection (daily iridium) + cosmetic.

### Stardrops (7 total, +34 max energy each)
1. Harvest Fair (2000 Star Tokens)
2. Museum (60 donations)
3. Mine floor 100
4. Fishing treasure chest (rare)
5. Max hearts with best friend NPC
6. All Community Barn bundles
7. Skull Cavern floor 100+

---

## 11. Co-op Design

**Shared:** Community Barn, buildings, museum, milestones (group), shipping bin
**Individual:** Skills, inventory, NPC relationships, professions, tools
**Trade:** Shared chest for item exchange
**Specialization:** Players can focus on different skills — everyone benefits from shared economy

---

## 12. Crafting Recipes

### Farm Machines
- Scarecrow: Wood + Coal + Fiber
- Bee House: Wood + Coal + Iron bar + Maple Syrup
- Keg: Wood × 30 + Copper bar + Iron bar + Oak Resin
- Preserves Jar: Wood × 50 + Stone × 40 + Coal × 8
- Cheese Press: Wood × 45 + Stone × 45 + Hardwood × 10 + Copper bar
- Mayonnaise Machine: Wood × 15 + Stone × 15 + Earth Crystal + Copper bar
- Loom: Wood × 60 + Fiber × 30 + Pine Tar
- Oil Maker: Hardwood × 20 + Slime × 50 + Gold bar
- Seed Maker: Wood × 25 + Coal × 10 + Gold bar
- Recycling Machine: Wood × 25 + Stone × 25 + Iron bar

### Utility
- Chest: Wood × 50
- Furnace: Copper ore × 20 + Stone × 25
- Lightning Rod: Iron bar + Refined Quartz + Bat Wing
- Worm Bin: Hardwood × 25 + Gold bar + Iron bar + Fiber × 50
- Rain Totem: Hardwood + Truffle Oil + Pine Tar × 5

### Sprinklers
- Basic: Copper bar + Iron bar
- Quality: Iron bar + Gold bar
- Iridium: Iridium bar + Gold bar + Battery Pack

### Bombs
- Cherry Bomb: Copper ore × 4 + Coal
- Bomb: Iron ore × 4 + Coal
- Mega Bomb: Gold ore × 4 + Void Essence + Solar Essence
