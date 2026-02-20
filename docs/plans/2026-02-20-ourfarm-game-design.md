# OurFarm — Game Design Document

**Date:** 2026-02-20
**Status:** Approved

## Overview

OurFarm is a co-op farming simulation game combining Farm Town mechanics with Stardew Valley-style social features. Built with Three.js (client) and Node.js (server), it supports shared-world multiplayer via WebSocket. All graphics are procedurally generated in a low-poly stylized aesthetic.

## Core Decisions

| Decision | Choice |
|----------|--------|
| Scope | Full build — all systems |
| Camera | Isometric 3D (fixed ~45° angle) |
| Art style | Low-poly stylized, fully procedural |
| Multiplayer | Co-op shared world (2+ players) |
| Architecture | Authoritative server |
| Backend | Node.js + Socket.io |
| Storage | SQLite (better-sqlite3) |
| Time | Accelerated real-time (1 real min = 1 game hour), pauses when no players online |
| Engine | Three.js |
| Build tool | Vite |

## Architecture

```
Client (Three.js + Vite)  <-->  WebSocket (Socket.io)  <-->  Server (Node.js)  <-->  SQLite
   - Rendering only                                          - All game logic
   - Input capture                                           - World state
   - Client-side prediction                                  - Validation
   - Animation/shaders                                       - Time/weather/ticks
```

**Authoritative server model:** Clients send intentions, server validates and broadcasts results. Server owns all truth. Prevents cheating and ensures perfect sync between players.

## Project Structure

```
OurFarm/
├── client/
│   ├── index.html
│   ├── src/
│   │   ├── main.js                  # Bootstrap, connect to server
│   │   ├── engine/
│   │   │   ├── SceneManager.js      # Three.js scene, camera, renderer
│   │   │   ├── InputManager.js      # Mouse/touch → tile coords
│   │   │   ├── AssetGenerator.js    # Procedural mesh/material factory
│   │   │   └── AudioManager.js      # Sound (future)
│   │   ├── world/
│   │   │   ├── TerrainRenderer.js   # Terrain from server state
│   │   │   ├── CropRenderer.js      # Instanced crop meshes
│   │   │   ├── BuildingRenderer.js  # Factories, barns
│   │   │   ├── WaterRenderer.js     # Shader water surface
│   │   │   └── WeatherRenderer.js   # Particles
│   │   ├── entities/
│   │   │   ├── PlayerRenderer.js
│   │   │   ├── PetRenderer.js
│   │   │   ├── AnimalRenderer.js
│   │   │   ├── NPCRenderer.js
│   │   │   └── FishRenderer.js
│   │   ├── ui/
│   │   │   ├── HUD.js
│   │   │   ├── Inventory.js
│   │   │   ├── DialogueUI.js
│   │   │   ├── ShopUI.js
│   │   │   └── QuestLog.js
│   │   ├── systems/
│   │   │   ├── FarmingSystem.js
│   │   │   ├── FishingSystem.js
│   │   │   ├── PetSystem.js
│   │   │   ├── CraftingSystem.js
│   │   │   └── SocialSystem.js
│   │   └── network/
│   │       └── NetworkClient.js
│   └── styles/
│       └── game.css
├── server/
│   ├── index.js
│   ├── db/
│   │   ├── database.js
│   │   └── schema.sql
│   ├── game/
│   │   ├── GameWorld.js
│   │   ├── TimeManager.js
│   │   ├── WeatherManager.js
│   │   ├── TerrainGenerator.js
│   │   └── EventManager.js
│   ├── entities/
│   │   ├── Player.js
│   │   ├── Crop.js
│   │   ├── Animal.js
│   │   ├── Pet.js
│   │   ├── NPC.js
│   │   └── Fish.js
│   ├── systems/
│   │   ├── FarmingSystem.js
│   │   ├── FishingSystem.js
│   │   ├── CraftingSystem.js
│   │   ├── QuestSystem.js
│   │   ├── EconomySystem.js
│   │   └── ProgressionSystem.js
│   └── data/
│       ├── crops.json
│       ├── animals.json
│       ├── pets.json
│       ├── npcs.json
│       ├── recipes.json
│       ├── fish.json
│       └── quests.json
├── shared/
│   ├── constants.js
│   ├── TileMap.js
│   └── ItemRegistry.js
└── package.json
```

## Systems Design

### Terrain & World Generation
- 64x64 tile grid (expandable)
- Tile types: Dirt, Grass, Water, Stone, Path
- Perlin noise heightmap from shared seed
- Zones: Farm (center), Village (north), Pond/River (east), Mine (west), Forest (south)
- Seasons: Spring → Summer → Fall → Winter (affect colors, crops, weather, events)

### Farming
- Flow: Till → Plant → Water → Grow (4 stages over game-days) → Harvest → Sell/Process
- Rain auto-waters crops
- Rendered as instanced meshes, growth shown via scale + color change

### Animals
- Types: Chickens (eggs), Cows (milk), Sheep (wool), Goats (cheese), Bees (honey)
- Require housing (coop/barn), daily feeding
- Happiness affects product quality
- Low-poly procedural models with idle animations

### Pets
- Types: Dogs, Cats, Rabbits, Parrots, rare exotics (fox, owl)
- Stats: Energy, Happiness, Loyalty, Skill
- Bonuses: Dogs=faster harvest, Cats=pest protection, Parrots=NPC bonus, Rabbits=foraging luck
- Training via minigames, breeding at max loyalty
- Procedural models from parameterized parts (body, ears, tail, color)

### Fishing
- Locations: Pond (common), River (medium), Ocean (rare, unlocked later)
- Timing-based minigame (Stardew-style bar)
- Rod/bait/tackle upgrades
- 30+ fish species across 4 rarity tiers
- Water: shader with vertex displacement + transparency

### NPCs & Social
- 8-12 NPCs with unique personalities
- Friendship meter (0-10 hearts), raised by talking/gifts/quests
- Branching dialogue trees, context-sensitive
- Fetch/craft/exploration quests with coin/item/recipe rewards
- Romance at 8+ hearts (cosmetic/story)
- Daily schedules, seasonal festivals with minigames

### Factories / Crafting
- Buildings: Mill, Kitchen, Forge, Loom
- Input raw materials → wait → collect processed goods (2-5x value)
- Recipes unlocked via levels and NPC friendship

### Mining / Exploration
- Multi-floor procedural cave dungeon
- Resources: copper, iron, gold ore + gems + artifacts
- Energy cost prevents infinite grinding
- Light combat (slimes, bats) — click to swing

### Progression
- XP from all activities, levels 1-50
- Each level unlocks new crops/animals/recipes/areas
- Coins for purchasing, farm expansion via buying adjacent plots

### Multiplayer Sync
- Server tick rate: 10/sec, clients interpolate
- Full snapshot on connect, delta updates after
- Action model: client intention → server validation → broadcast
- Conflict resolution: first action wins (authoritative server)

## Tech Stack

### Client
- Three.js (r160+) — 3D rendering
- Socket.io-client — WebSocket
- simplex-noise — terrain rendering
- Vite — dev server + bundler
- @tweenjs/tween.js — animations
- stats.js — dev FPS monitor
- lil-gui — dev debug panel

### Server
- Node.js 20+
- Express — HTTP + static serving
- Socket.io — real-time communication
- better-sqlite3 — database
- simplex-noise — terrain generation
- uuid — entity IDs

### Future: Mobile Wrapping
- Capacitor.js or PWA for native mobile deployment
