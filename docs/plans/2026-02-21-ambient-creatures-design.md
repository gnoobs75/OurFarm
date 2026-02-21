# Ambient Creatures Design

## Goal
Add birds, butterflies, and fish jumps as client-side ambient creatures to make the environment feel alive and inviting.

## Architecture
- Single new class: `client/src/world/AmbientCreatureRenderer.js`
- Fully client-side — no server involvement, no network traffic
- Each client spawns and manages its own creatures locally
- Creature count: ~8-12 birds, ~10-15 butterflies, ~3-5 fish jump spots

## Creature Types

### Birds (grass/tree areas)
- Spawn on grass tiles near trees. Sit on ground or perch on canopies.
- Idle: tiny Y bobbing (sine wave). Occasional small XZ hop.
- Flee: player within ~3 tiles triggers quick upward arc to random position 8-15 tiles away, then descend and resume idling.
- Visual: flat V-shape (two angled planes), warm brown/grey. Wing "flap" is sine oscillation on wing angle while flying.

### Butterflies (flower areas)
- Spawn near flower decorations.
- Idle: lazy spiral drift — sine-wave XZ with slow Y bobbing. Random warm color (yellow, orange, white, light blue).
- Flee: player within ~2 tiles triggers quick flutter to new flower position.
- Visual: two tiny colored planes at an angle.

### Fish Jumps (water tiles)
- Every 5-15s random interval, a fish jumps from a random water tile.
- Animation: small arc shape rises, rotates, splashes back (duration ~0.8s).
- Small splash particle (2-3 tiny white spheres that scale down) at entry/exit.
- Visual: tiny elongated ellipsoid, silver-blue.

## Integration
- Created in `main.js` alongside other renderers after world state loads
- Passed tile array to know grass/water/flower positions
- `update(delta)` in render loop with player position for flee detection
- `dispose()` for cleanup on map transition; creatures rebuild on new map

## Geometry
- Minimal: 2-4 triangles per creature
- Matches existing low-poly aesthetic
- Zero meaningful performance impact
