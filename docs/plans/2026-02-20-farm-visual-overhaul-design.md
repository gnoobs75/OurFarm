# Farm Visual Overhaul Design

## Goal
Transform the farm from a flat checkerboard of tile types into a cozy, polished low-poly world with natural terrain zones, detailed procedural 3D objects, ambient decorations, and warm atmospheric lighting.

## 1. Terrain Overhaul

### Fix Noise Generation
The `TerrainGenerator` passes a factory function to `createNoise2D` instead of the RNG itself. Fix with an IIFE so the noise produces natural, coherent terrain regions.

### Zoned World Layout (64x64)
Instead of arbitrary noise-based tile assignment, use a deliberate zone system layered on top of noise for height variation:

- **Farm zone (center, r<0.20):** Mostly DIRT and GRASS. This is where the house, barn, and crop plots go.
- **Grassland (r<0.55):** Predominantly GRASS with scattered trees, rocks, flowers.
- **Path:** A clear PATH strip running from the farm northward (to a future town).
- **Pond/Lake:** A proper water body in the southeast quadrant, using noise to create organic shoreline shape. SAND tiles border WATER tiles.
- **Forest edges (r>0.55):** Dense tree placement, more STONE outcrops near edges.
- **Height variation:** Gentle rolling hills for grass (y: 0 to 0.15 via noise). Water sits at y=-0.1. Sand at y=0.02.

### Starting Farm Layout
The server generates these structures at fixed positions within the farm zone:
- House at tile (30, 30)
- Barn at tile (26, 32)
- A 6x4 tilled crop plot at tiles (33-38, 30-33) with some starter corn planted
- Fence around the crop plot

## 2. Enhanced AssetGenerator Objects

### Upgraded Trees (3 variants)
- **Oak:** Brown cylinder trunk (randomized height 0.6-1.0), 2-3 overlapping green spheres for canopy (varying sizes, slight random offset). Cast shadows.
- **Pine:** Taller trunk, 3 stacked cones (decreasing size upward), darker green.
- **Fruit tree:** Oak-style but with small colored sphere "fruits" (red/orange) dotted on the canopy.

### Upgraded Rocks
- Cluster of 2-3 dodecahedrons at different scales (0.1-0.3), slightly overlapping, partially sunk into ground (y offset -0.05 to 0.1). Gray with slight color variation.

### New: Flower Clusters
- 3-5 thin cylinder stems (0.01 radius, 0.1-0.2 height) topped with tiny colored spheres (0.03 radius). Random colors: red, yellow, pink, purple, white.

### New: Bushes
- Flattened sphere (0.2 radius, y-scaled 0.6), dark green (0x1a6b2a). Placed along path edges and fence lines.

### New: Fence Segments
- Vertical post: thin cylinder (0.03 radius, 0.4 height), brown.
- Horizontal rails: thin boxes (0.5 x 0.03 x 0.03) connecting posts. Two rails per span at y=0.15 and y=0.3.

### Upgraded House
- Base box geometry with lighter colored window planes on sides.
- Chimney: small box on roof.
- Door: darker brown plane with tiny knob sphere.
- Small porch overhang (thin box extending from front).

### Upgraded Barn
- Wider double-door opening (two brown planes with gap).
- Hay bales nearby: yellow boxes (0.3 x 0.2 x 0.2) with slight rotation.

### Upgraded Corn
- Tall stalk (0.4-0.6 height cylinder), 2-3 long thin leaf planes angled outward, yellow ear cylinder near top at stage 3.

## 3. Decoration System

### Server: DecorationGenerator
New file `server/game/DecorationGenerator.js`:
- Takes the tile array and world seed
- Deterministically places decorations using seeded RNG:
  - GRASS tiles: 15% chance of tree, 10% flower cluster, 5% bush, 3% rock
  - STONE tiles: 40% rock cluster
  - PATH edges: 10% bush
  - Near WATER: 8% reed cluster
- Skip tiles near buildings/farm structures
- Returns array of `{ type, x, z, variant, rotation }` objects
- Sent to client as part of `_getFullState()`

### Client: DecorationRenderer
New file `client/src/world/DecorationRenderer.js`:
- Receives decoration array from server
- Creates and places 3D objects using AssetGenerator
- Static objects (no animation needed except subtle tree sway)

## 4. Lighting & Atmosphere

### Warm Golden-Hour Lighting
- Directional light color: 0xffe8c0 (warm golden)
- Lower sun angle: position (20, 30, 15) for longer shadows
- Slightly increase ambient to 0.55 for softer look

### Hemisphere Light Adjustment
- Sky: 0x87ceeb (keep)
- Ground: 0x4a7a2a (slightly darker green, more contrast)

### Ambient Dust Particles
- 200 tiny points (0.02 size, 0xffffee, opacity 0.3)
- Slowly drift upward and laterally with sine motion
- Only visible near camera, recycled like weather particles

## 5. Files Modified / Created

### Modified
- `server/game/TerrainGenerator.js` — fix RNG, add zoned layout
- `server/game/GameWorld.js` — generate decorations + starter buildings/crops, send in state
- `client/src/engine/AssetGenerator.js` — upgraded trees/rocks/crops, new flowers/bushes/fences
- `client/src/engine/SceneManager.js` — warm lighting adjustments
- `client/src/main.js` — wire up DecorationRenderer

### Created
- `server/game/DecorationGenerator.js` — deterministic decoration placement
- `client/src/world/DecorationRenderer.js` — render decorations
