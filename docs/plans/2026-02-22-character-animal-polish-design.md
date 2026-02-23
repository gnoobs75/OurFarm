# Character & Animal Visual Polish — Design Document

**Date:** 2026-02-22
**Goal:** Give animals cute expressive faces and unique idle behaviors. Give NPCs walking animation, distinguishing accessories, and personality-driven gestures.

---

## Animal Model Overhaul

### Universal Additions (all 4 types)
- Eyes: white sclera sphere + dark pupil sphere (matching pet dog style)
- Nose/beak: small colored sphere or cone
- Ears: breed-appropriate geometry
- Tail: cylinder or cone
- Named `userData.parts` for animation: `{ body, head, tail, legs: [...] }`

### Per-Type Model Details

**Chicken** (size 0.2)
- Rounder body (sphere, slight X-elongation)
- Red comb: small box on top of head
- Orange beak: tiny cone protruding from front of head
- Tiny dark dot eyes (spheres)
- Wing nubs: flat spheres on body sides
- Tail fan: small cone behind body, angled up
- Orange legs (2, existing)

**Cow** (size 0.5)
- Elongated body (sphere, 1.3x Z-scale)
- Snout: box on front of head
- Pink nose: small sphere on snout
- Small horns: two cones on top of head, slightly curved outward
- Floppy ears: half-spheres hanging down (like Labrador)
- Udder: small pink sphere under rear body
- Spotted patches: 2-3 small dark spheres partially embedded in body surface
- Tail: thin cylinder hanging down with small sphere tuft at end
- 4 grey legs (existing)

**Sheep** (size 0.4)
- Fluffy body: dodecahedron (subdivision 1) for wool-like texture
- Dark face: head uses darker color than body (0x4a3a2a)
- Small ears: tiny cones angled outward
- Stub tail: short cylinder
- Slightly shorter/stockier legs
- Wool color: light cream (0xf5f0e0)

**Goat** (size 0.35)
- Angular face: slightly box-shaped head (not pure sphere)
- Beard: thin cone below chin
- Curved horns: two thin cones, tilted back
- Upright pointy ears: cones, angled outward
- Thin tail: small cylinder angled up
- Tan/brown color with darker legs

### Animal Idle Behaviors (AnimalRenderer)

Each animal type gets unique idle animations triggered randomly on timers. A timer picks a random idle every 3-8 seconds per animal.

**Chicken idles:**
- Peck: head dips forward-down (head.rotation.x) over 0.4s, returns
- Scratch: body tilts slightly, one leg extends back
- Head bob: rapid small head up-down (3-4 bobs in 0.6s)

**Cow idles:**
- Graze: head lowers slowly (0.8s), stays 1s, rises (0.5s)
- Tail flick: tail.rotation.y oscillates side-to-side 3x
- Ear twitch: one ear rotates slightly, returns
- Chew: subtle head.position.y oscillation (simulates jaw)

**Sheep idles:**
- Baa bob: head lifts slightly then drops back (0.5s)
- Wool shuffle: body wiggles (body.rotation.z oscillation, 0.3s)
- Ear flick: ear rotation pulse

**Goat idles:**
- Head butt prep: head tilts back then thrusts forward (0.6s)
- Ear waggle: both ears rotate back and forth
- Curious tilt: head.rotation.z tilts to one side (0.5s), returns

**Universal idles (all animals):**
- Breathing: `body.scale.y = 1 + sin(time) * 0.015`
- Subtle position drift: very slow random rotation (existing, enhanced)

---

## NPC Personality Overhaul

### Universal NPC Animation (NPCRenderer rewrite)

**Walking animation** (reuse player gait system):
- Leg/arm pivot points already exist in `createNPC` (`userData.parts`)
- Track `isMoving` based on distance between mesh position and target
- When moving: swing legs/arms in opposition (same frequency as PlayerRenderer)
- Face movement direction (atan2-based heading)

**Idle animation** (when stationary):
- Breathing: body.scale pulse (same as PlayerRenderer)
- Weight shift: subtle body.rotation.z oscillation
- Arm sway: slight arm pivot swing

**Head-turn toward player:**
- When player is within 4 tiles, NPC head rotates toward player (clamped ±45 degrees)
- Smooth lerp transition

### Per-NPC Accessories

Added via new `accessory` and `hairStyle` fields in `npcs.json`.

| NPC | Accessory Parts |
|-----|----------------|
| **Rosie** (Baker) | White chef hat (cylinder + torus brim), white apron (thin box in front of body) |
| **Grim** (Blacksmith) | Dark leather apron (thin box), hammer at hip (cylinder handle + box head) |
| **Willow** (Librarian) | Round glasses (2 torus rings + box bridge), book in hand (small box, purple) |
| **Old Pete** (Fisherman) | Fishing hat (flat cylinder, olive), grey beard (half-sphere on chin) |
| **Mayor Hart** (Mayor) | Top hat (tall cylinder, dark), bow tie (two small cones at neck) |
| **Dr. Fern** (Vet) | Stethoscope (thin torus at neck), hair bun (sphere on top of head) |

Accessories are built by AssetGenerator based on accessory ID and attached to the appropriate part.

### Personality-Based Idle Gestures

Random gesture triggers every 5-12 seconds based on NPC personality:

| Personality | Gesture 1 | Gesture 2 |
|------------|-----------|-----------|
| **cheerful** | Wave (one arm up briefly) | Bounce (slight Y hop) |
| **grumpy** | Arms crossed (both arm pivots rotated inward) | Head shake (head.rotation.y oscillation) |
| **shy** | Look away (head turns to side) | Fidget (body rotation.z oscillation) |
| **laid-back** | Stretch (arms spread outward) | Lean (body tilts sideways) |
| **formal** | Hands behind back (arms rotated behind) | Nod (head dips forward-down) |
| **caring** | Head tilt (head.rotation.z) | Gentle wave (small arm raise) |

### Server Data Changes

Add to each NPC in `npcs.json`:
```json
"hairStyle": "round|spiked|long",
"accessory": "chef_hat|leather_apron|glasses|fishing_hat|top_hat|stethoscope"
```

---

## Architecture Summary

**Files to modify:**
- `client/src/engine/AssetGenerator.js` — rewrite `createAnimal()` with per-type detail, add `createAccessory()` method
- `client/src/entities/AnimalRenderer.js` — full rewrite with idle behavior system
- `client/src/entities/NPCRenderer.js` — full rewrite with walking animation, head tracking, gestures
- `server/data/npcs.json` — add `hairStyle`, `accessory` fields

**No new files needed.** All changes enhance existing modules.
