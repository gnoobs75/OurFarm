# Loot Toasts, Fruit Trees & Proximity Check — Design

## Features

### 1. Loot Toast + Backpack Fly Animation
Show a toast popup whenever player collects any item (chop tree, mine rock, harvest crop, forage, animal collect). Toast shows item icon + name + quantity, then animates toward a backpack icon in the HUD. Backpack icon is clickable (toggles inventory panel).

**Data change:** Server collection events (`resourceRemoved`, `resourceUpdate`, `cropHarvested`, `forageCollected`) must include a `drops` array so the client knows what was awarded.

### 2. Fruit Trees
- New `fruitType` field on Resource entity: `null` (normal) or `apple`, `cherry`, `orange`, `peach`
- `fruitReady` boolean + `fruitTimer` for daily regrowth
- ~20-30% of natural trees become fruit trees during map generation
- Player can buy/plant fruit tree saplings that grow through 3 stages
- Right-click fruit tree → "Shake" action drops 1-3 fruit
- Visual: colored dots on canopy, wobble animation on shake

### 3. Proximity Range Check
- Player must be within 2 tiles (Manhattan distance) to perform tool actions
- Client-side check before sending action; server-side mirror validation
- Shows "Too far away!" toast when blocked
