# Pet Grooming & Dress-Up Mini-Game Design

**Goal:** Full-screen pet grooming mini-game with two phases (grooming then dress-up), cosmetic unlocks earned + bought, persisted on the farm pet.

**Architecture:** Full-screen HTML/CSS overlay (same pattern as fishing overhaul). Client-side grooming mechanics with drag/click interactions. Server validates results, awards happiness/loyalty/cosmetic drops. Cosmetics stored in player DB and rendered on the 3D pet mesh.

## Full-Screen Scene
- Dark overlay dims game world
- Large centered panel (~600x550px) with cozy salon background (warm wood gradient, shelf with bottles, hanging plants via CSS)
- Pet displayed large and center, reactive to interactions
- Cute spectator elements (soap bubbles, sparkles, hearts)

## Phase 1: Grooming (3 steps, sequential)

### Step 1 — Wash
- Drag sponge across pet. Soap bubbles appear at cursor.
- Pet has ~6 dirty spots (random positions). Scrub each to clean.
- Progress bar fills as spots are cleaned.
- Pet squirms animation if you scrub too fast.

### Step 2 — Brush
- Drag brush in fur direction (arrow hints show direction).
- Streak counter for consecutive correct strokes.
- Pet purrs/hearts on good streaks (3+).
- Progress bar fills per correct stroke.

### Step 3 — Dry
- Click-hold dryer, move it over wet spots.
- Sparkle effects where spots dry.
- Progress bar fills as spots evaporate.

### Scoring
- Each step awards 0-3 sub-points based on speed + accuracy
- Total: 0-9 points mapped to 1-3 star rating
- 1 star: 0-3 points, 2 stars: 4-6 points, 3 stars: 7-9 points

## Phase 2: Dress-Up
- After grooming, cosmetic slots appear: Hat, Neck, Back
- Scrollable item tray at bottom with unlocked items
- Click to equip/preview on pet
- Confirm button saves equipped cosmetics
- Equipped items persist and render on farm pet

## Cosmetic Items (starter set — 15 items)

### Hats (5)
- Straw Hat (common), Party Hat (common), Flower Wreath (uncommon), Cowboy Hat (uncommon), Crown (rare)

### Neck (5)
- Red Bandana (common), Bow Tie (common), Bell Collar (uncommon), Flower Lei (uncommon), Scarf (rare)

### Back (5)
- Cape (common), Backpack (common), Angel Wings (uncommon), Butterfly Wings (uncommon), Saddle (rare)

## Rewards
- Happiness: +20 (1 star), +30 (2 stars), +40 (3 stars)
- Loyalty: +2 (1 star), +3 (2 stars), +5 (3 stars)
- Cosmetic drop: 30% common, 10% uncommon, 2% rare per session
- Daily limit: 1 grooming session per pet per day (resets at day tick)

## Data Model
- `player.petCosmetics`: `{ unlocked: string[], equipped: { hat: string|null, neck: string|null, back: string|null } }`
- Stored in player DB row
- Sent to client on join, updated on equip/unlock

## Network Events
- Client sends: `PET_GROOM` with `{ petId, stars, equipped: { hat, neck, back } }`
- Server validates, awards rewards, rolls cosmetic drop
- Server sends: `petGroomResult` with `{ happiness, loyalty, newCosmetic, equipped }`

## Integration
- Trigger: Context menu "Groom" action on pet (alongside existing Pet/Play)
- Cooldown: Once per in-game day per pet
- Pet cosmetics render as small colored meshes on the 3D pet model
