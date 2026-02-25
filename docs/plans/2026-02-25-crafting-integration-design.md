# Phase 2: Crafting & Processing — Full Integration Design

**Date:** 2025-02-25
**Goal:** Make the existing crafting/processing systems fully usable — machine interaction UI, building context menus, persistence, machine placement from inventory.

**Context:** Server handlers (`handleCraftStart`, `handleCraftCollect`, `handleMachineInput`, `handleMachineCollect`, `handlePlaceMachine`) already exist. 16 recipes in `recipes.json`, 4 machine types in `machines.json`. CraftingUI exists but only opens via 'C' key. Buildings are hard-coded. No persistence.

---

## Section 1: Machine Item Picker UI

**New file:** `client/src/ui/MachineUI.js`

When a player right-clicks an empty machine or selects "Insert Item" from context menu:

1. Client looks up machine type → fetches recipes from `machines.json` → filters player inventory to matching inputs
2. Small panel appears near the machine showing only eligible items (name + quantity)
3. Player clicks an item → `sendMachineInput(machineId, itemId)` → panel closes
4. Machine starts processing, tooltip updates to show progress

Panel is lightweight — a positioned div with item buttons, similar to CraftingUI's recipe list. Closes on outside click or ESC.

---

## Section 2: Building Interaction via Context Menu

Wire buildings into the existing entity detection and context menu system:

- Add `BuildingRenderer.getBuildingAtPosition(x, z)` detection to `SelectionManager.getEntityAt()`
- Add `ENTITY_ACTIONS.building: ['Open Crafting']` to context menu actions
- "Open Crafting" dispatch opens CraftingUI with building type + recipes + processing state
- Tooltip on hover: building name + status ("Mill — Idle" / "Forge — Processing flour, 3m left")
- Keep 'C' keyboard shortcut as convenience (finds nearest building)

---

## Section 3: Persistence

### Buildings
- On server start: load buildings from `buildings` DB table
- Seed defaults (house, barn, mill, forge) via INSERT IF NOT EXISTS
- Save processing state changes to DB
- Remove hard-coded `_initStarterFarm()` building creation, replace with DB load

### Machines
New table:
```sql
CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  type TEXT NOT NULL,
  tile_x INTEGER,
  tile_z INTEGER,
  processing_item TEXT,
  processing_output TEXT,
  processing_start TEXT,
  processing_end TEXT
);
```

- On server start: load machines, restore processing state
- If machine was mid-processing and end time has passed → mark as ready to collect
- Save on placement, processing start, and collection

---

## Section 4: Machine Placement from Inventory

**Flow:** Craft machine at forge → item in inventory → select in toolbar → click farm tile → machine placed.

**Changes:**
- Add machine items to ItemRegistry: `keg`, `preserves_jar`, `cheese_press`, `mayonnaise_machine`
- Add placement logic in `main.js`: when active item is a machine type and player clicks farm tile, call `sendPlaceMachine(type, x, z)`
- Server validates: tile is empty, player has item, removes from inventory, creates machine entity
- Already exists: `handlePlaceMachine()` handler and `PLACE_MACHINE` action

**Crafting recipes at forge:**
- Keg: wood ×30, copper_bar ×1, iron_bar ×1
- Preserves Jar: wood ×50, stone ×40, coal ×8
- Cheese Press: wood ×45, stone ×45, copper_bar ×1
- Mayonnaise Machine: wood ×15, stone ×15, copper_bar ×1

---

## Section 5: Missing Items

Add **coal** to ItemRegistry. Coal drops from rocks (integrate with existing RESOURCE_DATA rock-breaking logic).

---

## Section 6: Out of Scope

- Skill-level progression gates for recipes
- Carpenter NPC for large building placement
- Quality-based machine output scaling
- Building demolition
- New machine types beyond the existing 4
- Cask aging system (requires cellar from Phase 7)
