# Fishing System Design

**Goal:** A full fishing mini-game with Stardew-style catch bar, cinematic cast sequence, 35 fish species across 3 locations, bait crafting, rod upgrades, and integration with existing skill/profession/economy systems.

**Architecture:** Client-side mini-game UI (HTML/CSS overlay) driven by server-determined fish rolls. Server handles cast validation, fish selection, XP, inventory. Client handles all visuals, animations, and the real-time catch bar physics.

---

## Phase 1: Cast Sequence (In-World 3D)

When the player left-clicks a water tile with the fishing rod equipped:

1. **Player cast animation** — arm swing via existing `queueAction('fishing_rod')` system
2. **Bobber flight** — small sphere arcs from player position to clicked water tile (parabolic trajectory, ~0.5s). Created as a `THREE.Mesh(SphereGeometry)` animated along a bezier curve.
3. **Landing** — ripple rings expand from impact point (concentric `RingGeometry` that scale up and fade out over ~1s)
4. **Wait** — 2-5 seconds randomized. During this time:
   - 1-3 fake nibbles: bobber dips slightly (y -= 0.03) and returns
   - Small ripple on each nibble
5. **Bite** — bobber plunges down (y -= 0.1) with splash particle burst (4-6 small white spheres that arc outward and fade). An exclamation mark indicator appears briefly above the player.
6. **Mini-game triggers** — FishingUI panel slides in from the right side
7. **Outcome animations:**
   - **Catch:** fish mesh arcs from water to player with sparkle particles. Toast notification: "Caught a [Fish Name]!"
   - **Miss:** splash effect, line retracts. Toast: "The fish got away..."

**Cancellation:** Right-click or Escape during any phase cancels the cast and retracts the line.

**Server flow:**
- Client sends `FISH_CAST` with `{ x, z }` (water tile coords)
- Server validates water tile, calls `FishCalculator.rollCatch(location, playerLevel, rodTier, baitBonus)`
- Server responds with `fishingBite` event: `{ fishId, rarity, behavior, waitTime, nibbles }`
- Client plays the wait/nibble/bite sequence, then starts mini-game
- When mini-game completes, client sends `FISH_REEL` with `{ success: true/false }`
- Server awards fish + XP on success, or nothing on failure

---

## Phase 2: Mini-Game — The Catch Bar

### Layout

A vertical panel (~120px wide, ~320px tall) appears on the right side of the screen. Styled as a weathered wood frame with rope border, matching the farm aesthetic.

### Components

- **Catch track** — tall vertical bar. The fish icon and catch zone both move within this space.
- **Catch zone (net)** — green highlighted region the player controls. Rises when holding mouse button/spacebar, falls with gravity when released. Has momentum (velocity-based, not instant).
- **Fish icon** — small colored fish that bounces within the bar according to behavior patterns.
- **Progress meter** — horizontal bar at the bottom of the panel. Fills when fish is inside the catch zone, drains when outside.
- **Fish info** — name and rarity shown at the top with rarity-colored border.

### Physics

```
// Catch zone movement (per frame)
if (holding) {
  velocity += LIFT_ACCEL * delta;    // 800 px/s^2
} else {
  velocity -= GRAVITY * delta;       // 600 px/s^2
}
velocity *= DAMPING;                 // 0.92 per frame
position += velocity * delta;
position = clamp(position, 0, trackHeight - netHeight);
```

### Fish Behavior Patterns

| Rarity | Net Size | Fish Speed | Pattern | Progress Drain Rate |
|--------|----------|------------|---------|-------------------|
| Common (0) | 40% of bar | Slow | Gentle sine wave, predictable | 1% per frame |
| Uncommon (1) | 30% of bar | Moderate | Sine + occasional darts | 1.5% per frame |
| Rare (2) | 22% of bar | Fast | Erratic, reverses direction frequently | 2% per frame |
| Legendary (3) | 15% of bar | Very fast | Unique per fish (see below) | 3% per frame |

**Progress fill rate:** 2% per frame when fish is inside net (all rarities).

**Starting progress:** 30%.

**Win condition:** Progress reaches 100%. **Lose condition:** Progress reaches 0%.

### Legendary Fish Unique Behaviors

- **Legend Carp** — "The Dash": holds still for 1-2s then rockets to the opposite end of the bar
- **Anglerfish** — "The Lure": slowly drifts toward the catch zone (baiting you), then snaps away at high speed
- **Swordfish** — "The Sword": makes sharp linear cuts diagonally across the bar with brief pauses
- **Axolotl** — "The Wiggle": rapid small oscillations that are hard to track, occasionally freezes
- **Glacier Pike** — "The Stall": moves normally, then suddenly stops (player overshoots), then darts
- **River King** — "The King": smooth but relentless movement, never pauses, gradually increases speed
- **Moonfish** — "The Phase": teleports to random positions every 2-3 seconds
- **Leviathan** — "The Beast": combines all legendary patterns randomly, shrinks net by 5% during fight

### Net Size Modifiers

- Rod tier: Basic (+0%), Fiberglass (+15%), Iridium (+30%)
- Bait: None (+0%), Basic (+5%), Wild (+10%), Magic (+20%)
- Fishing skill level: +1% per level (max +30% at level 30)

---

## Phase 3: Fish Species (35 Total)

### Pond (12 fish)

| Fish | Rarity | Value | Min Level | Season | Time |
|------|--------|-------|-----------|--------|------|
| Carp | Common | 18 | 1 | Any | Any |
| Perch | Common | 22 | 1 | Any | Any |
| Bass | Common | 20 | 1 | Any | Any |
| Bluegill | Common | 15 | 1 | Spring/Summer | Day |
| Catfish | Common | 30 | 2 | Any | Night |
| Sunfish | Common | 24 | 2 | Summer | Day |
| Bullhead | Uncommon | 45 | 3 | Any | Any |
| Koi | Uncommon | 65 | 5 | Spring | Any |
| Goldfish | Rare | 200 | 9 | Any | Any |
| Ghost Fish | Rare | 180 | 8 | Any | Night |
| Axolotl | Legendary | 800 | 15 | Summer | Night |
| Legend Carp | Legendary | 1000 | 20 | Spring | Rain |

### River (12 fish)

| Fish | Rarity | Value | Min Level | Season | Time |
|------|--------|-------|-----------|--------|------|
| Chub | Common | 18 | 1 | Any | Any |
| Trout | Common | 25 | 1 | Any | Any |
| Shiner | Common | 16 | 1 | Spring/Summer | Day |
| Salmon | Uncommon | 50 | 3 | Fall | Any |
| Pike | Uncommon | 55 | 4 | Winter | Any |
| Walleye | Uncommon | 60 | 5 | Fall | Night |
| Rainbow Trout | Uncommon | 65 | 5 | Summer | Rain |
| Sturgeon | Rare | 120 | 7 | Summer/Winter | Any |
| Tiger Trout | Rare | 150 | 8 | Fall/Winter | Any |
| Electric Eel | Rare | 180 | 10 | Any | Night+Rain |
| Glacier Pike | Legendary | 900 | 18 | Winter | Any |
| River King | Legendary | 1200 | 25 | Any | Rain |

### Ocean (11 fish)

| Fish | Rarity | Value | Min Level | Season | Time |
|------|--------|-------|-----------|--------|------|
| Sardine | Common | 12 | 1 | Any | Any |
| Anchovy | Common | 14 | 1 | Any | Any |
| Sea Bass | Common | 28 | 2 | Any | Any |
| Red Snapper | Uncommon | 55 | 4 | Summer/Fall | Any |
| Tuna | Uncommon | 70 | 6 | Any | Any |
| Lobster | Uncommon | 80 | 6 | Any | Any |
| Octopus | Rare | 140 | 9 | Summer | Day |
| Swordfish | Rare | 150 | 10 | Any | Any |
| Anglerfish | Rare | 500 | 15 | Any | Night |
| Moonfish | Legendary | 1500 | 22 | Any | Night |
| Leviathan | Legendary | 2000 | 30 | Winter | Rain+Night |

---

## Phase 4: Bait System

| Bait | Recipe | Effect |
|------|--------|--------|
| None | — | Base catch rates |
| Basic Bait | 2 fiber + 1 bug meat | +10% uncommon chance, +5% net size |
| Wild Bait | 1 basic bait + 1 common fish | +20% uncommon, +10% rare chance, +10% net size |
| Magic Bait | 1 wild bait + 1 rare fish + 1 gem | Ignores season/time restrictions, +20% net size |

Bait is consumed on each cast. Bait slot appears on the fishing UI when rod is Fiberglass or better.

---

## Phase 5: Rod Upgrades

Uses existing tool upgrade system (blacksmith NPC).

| Rod | Cost | Net Bonus | Special |
|-----|------|-----------|---------|
| Basic Rod | Starter item | +0% | Cannot use bait |
| Fiberglass Rod | 1000g + 5 copper bars | +15% | Can use bait |
| Iridium Rod | 5000g + 5 iridium bars | +30% | Can use bait + tackles (future) |

---

## Phase 6: Integration Points

### Existing Systems Used
- **FishCalculator** (`server/entities/Fish.js`) — already handles weighted random fish selection
- **Tool upgrades** (`handleToolUpgrade` in GameWorld.js) — rod tiers
- **Skill professions** (fishing: Fisher/Trapper at 5, Angler/Pirate/Mariner/Luremaster at 10)
- **Item registry** (`shared/ItemRegistry.js`) — fish items already registered
- **Network actions** (`FISH_CAST`, `FISH_REEL`) — already defined in constants
- **Economy** — fish selling with profession bonus already implemented

### New Components Needed
- `client/src/ui/FishingUI.js` — mini-game UI (HTML/CSS overlay + JS game loop)
- `client/src/effects/FishingEffects.js` — bobber, ripples, splash particles (Three.js)
- Updated `server/data/fish.json` — expanded from 15 to 35 species with season/time/behavior data
- Updated `server/game/GameWorld.js` — enhanced `handleFishCast` to send fish behavior data
- Updated `client/src/main.js` — wire fishing events to new UI
- Updated `client/styles/game.css` — fishing UI styles

### Water Location Detection
- Pond: farm map water tiles (existing)
- River: town map water tiles (existing, classify by adjacency to path/bridge)
- Ocean: future beach map (for now, ocean fish are inaccessible — natural progression gate)
