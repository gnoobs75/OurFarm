# Crop Tooltips & General Polish Design

**Date:** 2026-02-24
**Goal:** Add rich hover tooltips for crops showing growth details, projected maturity, and status — plus comprehensive polish across UI, visuals, and interactions.

---

## Part 1: Crop Tooltips

### Problem
Players can't see crop details without guessing. The SelectionManager has a tooltip system but `getEntityAt()` doesn't detect crops. The client receives crop state (stage, growth, watered, fertilizer) but has no static crop data (growthTime, sellPrice, seasons) for projections.

### Architecture

**Data flow:**
1. Server sends static `cropsData` (from crops.json) to client on initial state sync
2. Client stores it in a module-level lookup accessible to CropRenderer and SelectionManager
3. CropRenderer gets a `getCropAtPosition(x, z)` method
4. SelectionManager's `getEntityAt()` gains a crop detection block
5. `_showTooltip()` renders rich HTML for crop entities

**Why send static data to client:** The growth rate formula (`3 stages / (growthTime * 24)`) requires `growthTime` per crop type. Without it, we can't project maturity. Sending the small crops.json blob once on connect is cheaper than adding a server endpoint.

### Tooltip Content (Full Detail)

```
┌──────────────────────────────┐
│ 🌽 Corn                      │
│ ─────────────────────────── │
│ Stage: Sprout (2/4)          │
│ Growth: ████████░░░░ 67%     │
│ ─────────────────────────── │
│ 💧 Watered                   │
│ 🧪 Speed Gro (+10%)         │
│ ─────────────────────────── │
│ Matures: ~Day 14 Summer     │
│ Season: Summer, Fall         │
│ Sells for: 35g               │
│ Regrows: Yes                 │
└──────────────────────────────┘
```

### Projected Maturity Calculation

Client-side estimate using the growth formula from `Crop.tick()`:
```
remainingStages = (3 - currentStage) + (1 - currentGrowthWithinStage)
totalGrowthHours = growthTime * 24
hoursPerStageProgress = totalGrowthHours / 3
remainingHours = remainingStages * hoursPerStageProgress / rate / speedMult
projectedDay = currentDay + Math.ceil(remainingHours / 24)
```

Where `rate = watered ? 1.5 : 1.0` and `speedMult = 1 + fertilizerSpeedBonus`.

Note: This is an estimate since watered status resets each stage. The tooltip shows "~Day N" to indicate approximation.

### Files to Modify

| File | Change |
|------|--------|
| `server/game/GameWorld.js` | Include `cropsData` in initial state sync |
| `client/src/main.js` | Store `cropsData` from state, pass to SelectionManager |
| `client/src/world/CropRenderer.js` | Add `getCropAtPosition(x, z)` method |
| `client/src/ui/SelectionManager.js` | Add crop detection in `getEntityAt()`, rich tooltip rendering |
| `shared/constants.js` | Add `STAGE_NAMES` constant for display |
| `client/styles/game.css` | Add tooltip styles for progress bar and crop details |

---

## Part 2: General Polish

### A. UI Polish

1. **Rich tooltips for ALL entities** — NPCs show relationship level, animals show product readiness, machines show processing time remaining, pets show affection. Extend `_showTooltip()` to render entity-type-specific content.

2. **Tooltip fade-in/out animation** — CSS transition on opacity (0.15s) instead of instant show/hide.

3. **Action bar hover tooltips** — Show item name and quantity when hovering action bar slots.

4. **Progress bar in HUD** — Smooth CSS transitions on energy bar, XP bar changes.

5. **Toast notification improvements** — Categorized icons (harvest = crop emoji, level up = star, etc.), slide-in animation.

### B. Visual World Polish

6. **Crop watered visual indicator** — Darken the soil tile under watered crops (subtle color shift on terrain mesh).

7. **Harvestable crop glow** — Subtle golden pulse on stage-3 crops to draw attention.

8. **Hover highlight on interactable objects** — Slight emissive boost on the hovered entity mesh (not just the ring).

### C. Interaction Polish

9. **Click feedback particles** — Small particle burst on tool actions (till, water, harvest).

10. **Smooth camera on player move** — Lerp camera position instead of snapping when following player.

11. **Context menu crop harvest** — Wire up the stubbed crop harvest action in SelectionManager._dispatchAction.

---

## Dependency Graph

```
Crop tooltips (1-6 above) = core feature, do first
  ├── Server sends cropsData (prerequisite)
  ├── CropRenderer.getCropAtPosition (prerequisite)
  ├── SelectionManager crop detection + rich tooltip
  └── CSS styling

General polish (7-11) = independent tasks, can parallelize
```

## Implementation Order

1. Server: send cropsData in initial state
2. Client: store cropsData, add getCropAtPosition to CropRenderer
3. SelectionManager: crop detection + rich tooltip HTML
4. CSS: tooltip progress bar, crop detail styles, fade animation
5. Entity tooltip enrichment (NPCs, animals, machines, pets)
6. Harvestable crop glow effect
7. Crop watered visual indicator
8. Click feedback particles
9. Action bar hover tooltips
10. Context menu crop harvest wiring
11. Camera smoothing + toast improvements
