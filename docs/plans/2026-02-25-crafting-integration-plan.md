# Crafting & Processing Full Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the existing crafting/processing systems fully usable — machine item picker UI, building context menus, persistence to database, machine placement from inventory.

**Architecture:** The server handlers already exist (`handleCraftStart`, `handleCraftCollect`, `handleMachineInput`, `handleMachineCollect`, `handlePlaceMachine`). This plan wires them into the client through: (1) adding buildings to SelectionManager entity detection, (2) creating a MachineUI item picker panel, (3) persisting buildings and machines to the SQLite database, and (4) registering missing items. No new server endpoints needed.

**Tech Stack:** Three.js r183, Socket.io, better-sqlite3, Vite.

---

### Task 1: Register Missing Items in ItemRegistry

**Files:**
- Modify: `shared/ItemRegistry.js:88-99`

**Step 1: Add coal, machine items, and artisan output items**

After the `PROCESSED` section (line 93) and before `TOOL` (line 94), add:

```javascript
  // Processed
  flour: { name: 'Flour', category: 'processed' },
  bread: { name: 'Bread', category: 'processed' },
  cake: { name: 'Cake', category: 'processed' },
  cheese_wheel: { name: 'Cheese Wheel', category: 'processed' },
  cloth: { name: 'Cloth', category: 'processed' },
  wine: { name: 'Wine', category: 'processed' },
  juice: { name: 'Juice', category: 'processed' },
  preserves: { name: 'Preserves', category: 'processed' },
  mayonnaise: { name: 'Mayonnaise', category: 'processed' },
  // Resources
  coal: { name: 'Coal', category: 'ore' },
  stone: { name: 'Stone', category: 'ore' },
  wood: { name: 'Wood', category: 'ore' },
  // Placeable machines
  keg: { name: 'Keg', category: 'processed' },
  preserves_jar: { name: 'Preserves Jar', category: 'processed' },
  cheese_press: { name: 'Cheese Press', category: 'processed' },
  mayonnaise_machine: { name: 'Mayonnaise Machine', category: 'processed' },
  // Sprinklers & fertilizer
  sprinkler_basic: { name: 'Basic Sprinkler', category: 'processed' },
  sprinkler_quality: { name: 'Quality Sprinkler', category: 'processed' },
  fertilizer_basic: { name: 'Basic Fertilizer', category: 'processed' },
```

Note: The existing entries for `flour`, `bread`, `cake`, `cheese_wheel`, `cloth` stay — add the NEW items only: `wine`, `juice`, `preserves`, `mayonnaise`, `coal`, `stone`, `wood`, `keg`, `preserves_jar`, `cheese_press`, `mayonnaise_machine`, `sprinkler_basic`, `sprinkler_quality`, `fertilizer_basic`.

**Step 2: Verify — restart server, no import errors**

Run: `npm run dev` — server starts cleanly.

**Step 3: Commit**
```bash
git add shared/ItemRegistry.js
git commit -m "feat: register coal, artisan goods, and machine items in ItemRegistry"
```

---

### Task 2: Add Machines Table and Persistence

**Files:**
- Modify: `server/db/schema.sql:132` (add after buildings table)
- Modify: `server/game/GameWorld.js:149-214` (_initStarterFarm), plus new methods

**Step 1: Add machines table to schema.sql**

Append after the buildings table (after line 132):

```sql
CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  type TEXT NOT NULL,
  tile_x INTEGER NOT NULL,
  tile_z INTEGER NOT NULL,
  processing_input TEXT,
  processing_output TEXT,
  processing_value INTEGER DEFAULT 0,
  processing_start INTEGER,
  processing_end INTEGER,
  FOREIGN KEY (world_id) REFERENCES worlds(id)
);
```

**Step 2: Add machine save/load methods to GameWorld**

Add these two methods after `_savePlayerSkills` (around line 1875):

```javascript
  _loadMachines(worldId) {
    const db = getDB();
    const rows = db.prepare('SELECT * FROM machines WHERE world_id = ?').all(worldId);
    const machines = [];
    for (const row of rows) {
      const processing = row.processing_output ? {
        inputItem: row.processing_input,
        outputItem: row.processing_output,
        outputValue: row.processing_value || 0,
        startTime: row.processing_start,
        endTime: row.processing_end,
      } : null;
      machines.push(new Machine({
        id: row.id,
        type: row.type,
        tileX: row.tile_x,
        tileZ: row.tile_z,
        processing,
      }));
    }
    return machines;
  }

  _saveMachines() {
    const db = getDB();
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO machines (id, world_id, type, tile_x, tile_z,
        processing_input, processing_output, processing_value, processing_start, processing_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const deleteMachine = db.prepare('DELETE FROM machines WHERE id = ?');

    const save = db.transaction(() => {
      // Save all machines on all maps
      for (const map of this.maps.values()) {
        for (const m of map.machines.values()) {
          upsert.run(
            m.id, this.worldId, m.type, m.tileX, m.tileZ,
            m.processing?.inputItem || null,
            m.processing?.outputItem || null,
            m.processing?.outputValue || 0,
            m.processing?.startTime || null,
            m.processing?.endTime || null
          );
        }
      }
    });
    save();
  }
```

**Step 3: Load machines on startup**

In `_initStarterFarm()` (line 149), after building initialization, load machines from DB:

```javascript
    // Load persisted machines
    const savedMachines = this._loadMachines(this.worldId);
    for (const machine of savedMachines) {
      farmMap.machines.set(machine.id, machine);
    }
```

**Step 4: Save machines periodically**

Call `this._saveMachines()` inside the existing `_onNewDay()` method (alongside `_savePlayerSkills` calls) and in `handlePlayerLeave`.

Also call it in `handlePlaceMachine` after adding the machine to the map:

```javascript
    // In handlePlaceMachine, after farmMap.machines.set(machine.id, machine):
    this._saveMachines();
```

**Step 5: Verify — restart server, place a machine, restart again, machine still there**

Run: `npm run dev` — place a keg via console or gameplay, restart server, verify machine persists.

**Step 6: Commit**
```bash
git add server/db/schema.sql server/game/GameWorld.js
git commit -m "feat: persist machines to database with save/load on startup"
```

---

### Task 3: Building Persistence

**Files:**
- Modify: `server/game/GameWorld.js:149-214` (_initStarterFarm)

**Step 1: Add building save/load methods to GameWorld**

```javascript
  _loadBuildings(worldId) {
    const db = getDB();
    const rows = db.prepare('SELECT * FROM buildings WHERE world_id = ?').all(worldId);
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      tileX: row.tile_x,
      tileZ: row.tile_z,
      processing: row.processing_recipe ? {
        recipeId: row.processing_recipe,
        startTime: parseInt(row.processing_start) || 0,
        endTime: parseInt(row.processing_start) + (row.processing_done ? 0 : 3600000),
      } : null,
    }));
  }

  _saveBuildings() {
    const db = getDB();
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO buildings (id, world_id, type, tile_x, tile_z,
        processing_recipe, processing_start, processing_done)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const save = db.transaction(() => {
      for (const map of this.maps.values()) {
        for (const b of map.buildings.values()) {
          upsert.run(
            b.id, this.worldId, b.type, b.tileX, b.tileZ,
            b.processing?.recipeId || null,
            b.processing?.startTime ? String(b.processing.startTime) : null,
            b.processing ? (Date.now() >= b.processing.endTime ? 1 : 0) : 0
          );
        }
      }
    });
    save();
  }
```

**Step 2: Rewrite _initStarterFarm to seed from DB**

Replace the hard-coded building creation in `_initStarterFarm()` with DB-seeded defaults:

```javascript
  _initStarterFarm() {
    const farmMap = this.maps.get(MAP_IDS.FARM);

    // Load buildings from DB
    const savedBuildings = this._loadBuildings(this.worldId);
    for (const b of savedBuildings) {
      farmMap.buildings.set(b.id, b);
    }

    // Seed defaults if no buildings exist
    if (farmMap.buildings.size === 0) {
      const cx = 32, cz = 32;
      const defaults = [
        { id: 'house_main', type: 'house', tileX: cx - 3, tileZ: cz - 1 },
        { id: 'barn_main', type: 'barn', tileX: cx - 4, tileZ: cz + 3 },
        { id: 'farm_mill', type: 'mill', tileX: 38, tileZ: 31, processing: null },
        { id: 'farm_forge', type: 'forge', tileX: 38, tileZ: 34, processing: null },
      ];
      for (const b of defaults) {
        farmMap.buildings.set(b.id, b);
      }
      this._saveBuildings();
    }

    // ... rest of _initStarterFarm (resources, animals, pets, etc.) stays the same
```

**Step 3: Save buildings after craft state changes**

In `handleCraftStart` (line 1043), after setting `building.processing`, call `this._saveBuildings()`.
In `handleCraftCollect` (line 1090), after clearing `building.processing = null`, call `this._saveBuildings()`.

**Step 4: Verify — start crafting at mill, restart server, processing state persists**

Run: `npm run dev` — start a flour recipe at the mill, restart, mill still shows processing.

**Step 5: Commit**
```bash
git add server/game/GameWorld.js
git commit -m "feat: persist buildings to database, seed defaults on first run"
```

---

### Task 4: Add Building Position Detection to BuildingRenderer

**Files:**
- Modify: `client/src/world/BuildingRenderer.js:34-50`

**Step 1: Store building data alongside meshes**

Change `build()` to store the building data object alongside the mesh, and add `getBuildingAtPosition()`:

In the `build` method, change `this.buildingMeshes.set(b.id, mesh)` (line 40) to store both mesh and data:

```javascript
      this.buildingMeshes.set(b.id, { mesh, data: b });
```

Update `dispose()` to match (line 206):

```javascript
    for (const { mesh } of this.buildingMeshes.values()) this.scene.remove(mesh);
```

Update `_processWindows` and `_addInteriorLight` calls (they receive `mesh` already, no change needed).

**Step 2: Add getBuildingAtPosition method**

Add after the `build()` method:

```javascript
  /** Find a craftable building (mill, forge) near the given world position. */
  getBuildingAtPosition(worldX, worldZ) {
    for (const [id, entry] of this.buildingMeshes) {
      const b = entry.data;
      if (b.type !== 'mill' && b.type !== 'forge') continue; // Only interactive buildings
      const bx = (b.tile_x || b.tileX) + 0.5;
      const bz = (b.tile_z || b.tileZ) + 0.5;
      const dx = worldX - bx;
      const dz = worldZ - bz;
      if (Math.sqrt(dx * dx + dz * dz) < 1.5) {
        return { id, ...b };
      }
    }
    return null;
  }
```

**Step 3: Verify — no rendering regressions**

Run: `npm run dev` — buildings render as before, windows glow at night.

**Step 4: Commit**
```bash
git add client/src/world/BuildingRenderer.js
git commit -m "feat: add building position detection and data storage to BuildingRenderer"
```

---

### Task 5: Wire Buildings into SelectionManager

**Files:**
- Modify: `client/src/ui/SelectionManager.js:7-15` (ENTITY_ACTIONS)
- Modify: `client/src/ui/SelectionManager.js:82-166` (getEntityAt)
- Modify: `client/src/ui/SelectionManager.js:245-284` (_dispatchAction)
- Modify: `client/src/main.js:284-286` (SelectionManager construction)

**Step 1: Add building to ENTITY_ACTIONS**

Add to the ENTITY_ACTIONS object (line 7):

```javascript
const ENTITY_ACTIONS = {
  animal:  ['Feed', 'Collect', 'Pet'],
  pet:     ['Pet', 'Groom'],
  npc:     ['Talk', 'Gift'],
  machine: ['Insert Item', 'Collect Output'],
  building: ['Open Crafting'],
  crop:    ['Harvest'],
  forage:  ['Collect'],
  fruit_tree: ['Shake', 'Chop'],
};
```

**Step 2: Add building detection to getEntityAt**

After the machines block (line 135) and before the crops block (line 137), add:

```javascript
    // Buildings (craftable: mill, forge)
    if (this.renderers.buildings) {
      const building = this.renderers.buildings.getBuildingAtPosition(x, z);
      if (building) {
        const typeName = building.type.charAt(0).toUpperCase() + building.type.slice(1);
        let detail = 'Idle';
        if (building.processing) {
          const remaining = Math.max(0, building.processing.endTime - Date.now());
          if (remaining <= 0) {
            detail = 'Ready to collect!';
          } else {
            const mins = Math.ceil(remaining / 60000);
            detail = `Processing... ${mins}m left`;
          }
        }
        return { type: 'building', id: building.id, name: typeName, detail, buildingData: building };
      }
    }
```

**Step 3: Add building dispatch action**

In `_dispatchAction` (line 245), add a case for buildings:

```javascript
      case 'building':
        if (action === 'Open Crafting') {
          if (this.onOpenCrafting) {
            this.onOpenCrafting(this._contextEntity.buildingData);
          }
        }
        break;
```

**Step 4: Pass buildings renderer to SelectionManager in main.js**

Change line 284 to include `buildings`:

```javascript
    const selectionManager = new SelectionManager(sceneManager.scene, {
      npcs, animals, pets, machines, crops, forage, resources, buildings,
    }, network, { cropsData, getTime: () => hud._lastTime });
```

**Step 5: Wire onOpenCrafting callback in main.js**

After creating selectionManager (around line 286), add:

```javascript
    selectionManager.onOpenCrafting = (buildingData) => {
      const b = buildingsMap[buildingData.id] || buildingData;
      craftingUI.show(b.id, b.type, recipes, localPlayer?.inventory || [], b.processing);
    };
```

**Step 6: Verify — click on mill or forge, context menu appears with "Open Crafting", clicking opens CraftingUI**

Run: `npm run dev` — hover over mill, tooltip shows "Mill — Idle". Left-click, context menu shows "Open Crafting". Click it, CraftingUI opens with mill recipes.

**Step 7: Commit**
```bash
git add client/src/ui/SelectionManager.js client/src/main.js
git commit -m "feat: wire buildings into context menu with Open Crafting action"
```

---

### Task 6: Create MachineUI Item Picker Panel

**Files:**
- Create: `client/src/ui/MachineUI.js`

**Step 1: Create the MachineUI class**

```javascript
// client/src/ui/MachineUI.js
// Lightweight item picker shown when inserting items into a processing machine.

export class MachineUI {
  constructor() {
    this._el = document.createElement('div');
    this._el.id = 'machine-ui';
    this._el.className = 'machine-ui hidden';
    document.getElementById('ui-overlay').appendChild(this._el);

    this.onItemSelected = null; // (machineId, itemId) => void
    this._currentMachineId = null;

    // Close on outside click
    this._onDocClick = (e) => {
      if (!this._el.classList.contains('hidden') && !this._el.contains(e.target)) {
        this.hide();
      }
    };
    document.addEventListener('pointerdown', this._onDocClick, true);
  }

  /**
   * Show the item picker for a machine.
   * @param {string} machineId
   * @param {string} machineType - e.g. 'keg', 'preserves_jar'
   * @param {object} machinesData - full machines.json data
   * @param {Array} inventory - player inventory [{itemId, quantity, quality}]
   * @param {object} cropsData - crops.json data (for category matching)
   * @param {{x: number, y: number}} screenPos - position to show near
   */
  show(machineId, machineType, machinesData, inventory, cropsData, screenPos) {
    this._currentMachineId = machineId;
    const machineInfo = machinesData[machineType];
    if (!machineInfo) { this.hide(); return; }

    // Build list of valid input items from inventory
    const validItems = [];
    for (const slot of inventory) {
      if (!slot || !slot.itemId || slot.quantity <= 0) continue;
      // Check each recipe for this machine
      for (const recipe of Object.values(machineInfo.recipes)) {
        if (recipe.input && recipe.input === slot.itemId) {
          validItems.push(slot);
          break;
        }
        if (recipe.inputCategory === 'crop' && cropsData[slot.itemId]) {
          validItems.push(slot);
          break;
        }
      }
    }

    if (validItems.length === 0) {
      this._el.innerHTML = `
        <div class="machine-ui-header">${machineInfo.name}</div>
        <div class="machine-ui-empty">No valid items in inventory</div>
      `;
    } else {
      const itemBtns = validItems.map(item => {
        const name = (item.itemId || '').replace(/_/g, ' ');
        const capName = name.charAt(0).toUpperCase() + name.slice(1);
        return `<button class="machine-ui-item" data-item="${item.itemId}">${capName} x${item.quantity}</button>`;
      }).join('');

      this._el.innerHTML = `
        <div class="machine-ui-header">${machineInfo.name}</div>
        <div class="machine-ui-list">${itemBtns}</div>
      `;
    }

    // Position near click
    this._el.style.left = (screenPos?.x || 200) + 'px';
    this._el.style.top = (screenPos?.y || 200) + 'px';
    this._el.classList.remove('hidden');

    // Clamp to viewport
    requestAnimationFrame(() => {
      const rect = this._el.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        this._el.style.left = (window.innerWidth - rect.width - 8) + 'px';
      }
      if (rect.bottom > window.innerHeight) {
        this._el.style.top = (window.innerHeight - rect.height - 8) + 'px';
      }
    });

    // Wire item clicks
    this._el.querySelectorAll('.machine-ui-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemId = btn.dataset.item;
        if (this.onItemSelected) {
          this.onItemSelected(this._currentMachineId, itemId);
        }
        this.hide();
      });
    });
  }

  hide() {
    this._el.classList.add('hidden');
    this._el.innerHTML = '';
    this._currentMachineId = null;
  }

  dispose() {
    document.removeEventListener('pointerdown', this._onDocClick, true);
    this._el.remove();
  }
}
```

**Step 2: Add CSS for MachineUI**

In `client/src/styles/` or `index.html` (wherever styles are managed), add:

```css
.machine-ui {
  position: absolute;
  background: rgba(20, 20, 30, 0.95);
  border: 2px solid #5588aa;
  border-radius: 8px;
  padding: 8px;
  min-width: 160px;
  max-width: 240px;
  z-index: 1000;
  font-family: monospace;
  color: #e0e0e0;
}
.machine-ui.hidden { display: none; }
.machine-ui-header {
  font-weight: bold;
  color: #aaddff;
  margin-bottom: 6px;
  font-size: 14px;
}
.machine-ui-empty {
  color: #888;
  font-size: 12px;
  padding: 4px 0;
}
.machine-ui-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.machine-ui-item {
  background: rgba(50, 70, 90, 0.8);
  border: 1px solid #446;
  border-radius: 4px;
  color: #e0e0e0;
  padding: 6px 10px;
  cursor: pointer;
  font-family: monospace;
  font-size: 13px;
  text-align: left;
}
.machine-ui-item:hover {
  background: rgba(70, 110, 140, 0.9);
  border-color: #6af;
}
```

Find where the game's CSS lives and add these styles there.

**Step 3: Verify — MachineUI module imports without error**

Run: `npm run dev` — no import/build errors.

**Step 4: Commit**
```bash
git add client/src/ui/MachineUI.js
git commit -m "feat: create MachineUI item picker panel for processing machines"
```

---

### Task 7: Wire MachineUI into SelectionManager and main.js

**Files:**
- Modify: `client/src/main.js` (imports, construction, callbacks)
- Modify: `client/src/ui/SelectionManager.js:263-266` (machine Insert Item dispatch)

**Step 1: Import and construct MachineUI in main.js**

Add import near other UI imports (around line 25):

```javascript
import { MachineUI } from './ui/MachineUI.js';
```

Construct after other UI constructors (around line 60):

```javascript
  const machineUI = new MachineUI();
```

**Step 2: Update SelectionManager machine "Insert Item" dispatch**

Change the machine case in `_dispatchAction` (line 263-266):

```javascript
      case 'machine':
        if (action === 'Collect Output') net.sendMachineCollect(entityId);
        if (action === 'Insert Item') {
          if (this.onMachineInsert) {
            this.onMachineInsert(entityId, this._contextEntity);
          }
        }
        break;
```

**Step 3: Wire onMachineInsert callback in main.js**

After creating selectionManager (near the `onOpenCrafting` callback), add:

```javascript
    // Store machines.json data for MachineUI filtering
    const machinesDataRef = state.machinesData || {};

    selectionManager.onMachineInsert = (machineId, entity) => {
      const machineEntry = machines.machineMeshes.get(machineId);
      if (!machineEntry) return;
      const machineType = machineEntry.data.type;
      machineUI.show(
        machineId, machineType, machinesDataRef,
        localPlayer?.inventory || [],
        cropsData,
        input.hoveredScreenPos || { x: 300, y: 300 }
      );
    };

    machineUI.onItemSelected = (machineId, itemId) => {
      network.sendMachineInput(machineId, itemId);
    };
```

**Step 4: Send machinesData from server to client**

In `server/game/GameWorld.js` `_getFullState()` (line 1828), add `machinesData` to the returned object:

```javascript
    return {
      // ... existing fields ...
      machinesData,  // Add this line (machinesData is already imported at file top)
    };
```

Verify `machinesData` is imported at the top of GameWorld.js (it should already be, since `handleMachineInput` uses it).

**Step 5: Capture machinesData in main.js**

Where `recipes` and `buildingsMap` are captured from state (around line 242), add:

```javascript
    const machinesDataRef = state.machinesData || {};
```

And update the `selectionManager.onMachineInsert` callback to use this variable.

**Step 6: Verify — click "Insert Item" on an empty machine, picker shows valid items, selecting one starts processing**

Run: `npm run dev` — place a keg, left-click it, context menu shows "Insert Item" and "Collect Output". Click "Insert Item" → picker panel appears showing crops. Click a crop → machine starts processing.

**Step 7: Commit**
```bash
git add client/src/main.js client/src/ui/SelectionManager.js client/src/ui/MachineUI.js server/game/GameWorld.js
git commit -m "feat: wire MachineUI item picker into context menu for processing machines"
```

---

### Task 8: Final Verification

**Step 1: Full manual test pass**

Run: `npm run dev`

**Crafting buildings checklist:**
- [ ] Hover over mill → tooltip shows "Mill — Idle"
- [ ] Left-click mill → context menu shows "Open Crafting"
- [ ] Click "Open Crafting" → CraftingUI opens with mill recipes (flour, fertilizer)
- [ ] Craft flour (need 3 wheat) → building shows "Processing..."
- [ ] Hover mill while processing → tooltip shows "Mill — Processing... Xm left"
- [ ] After processing completes → "Open Crafting" shows "Ready to collect"
- [ ] Collect → flour in inventory
- [ ] Hover over forge → tooltip shows "Forge — Idle"
- [ ] Craft copper bar at forge (need 5 copper ore)
- [ ] 'C' keyboard shortcut still works (opens nearest mill/forge)

**Machine interaction checklist:**
- [ ] Craft a keg at the forge (copper_bar x1, iron_bar x1, wheat x5)
- [ ] Keg item appears in inventory
- [ ] Select keg in toolbar → click empty farm tile → keg placed
- [ ] Hover over placed keg → tooltip shows "keg — Empty"
- [ ] Left-click keg → context menu shows "Insert Item" / "Collect Output"
- [ ] Click "Insert Item" → picker shows valid crops from inventory
- [ ] Select a crop → keg starts processing, tooltip updates
- [ ] After processing → "Collect Output" yields wine/juice
- [ ] Right-click on empty keg → sends active toolbar item (existing behavior still works)
- [ ] Right-click on ready keg → collects output (existing behavior still works)

**Persistence checklist:**
- [ ] Place a machine, restart server → machine still there
- [ ] Start crafting at mill, restart → processing state preserved
- [ ] Buildings load correctly on fresh start (house, barn, mill, forge)

**No regressions:**
- [ ] Building window glow still works at night
- [ ] NPC context menu still works
- [ ] Animal context menu still works
- [ ] Crop tooltip still shows growth info
- [ ] Fruit tree shake still works
- [ ] No console errors

**Step 2: Commit**
```bash
git add -A
git commit -m "feat: complete crafting and processing integration — machine UI, building menus, persistence"
```
