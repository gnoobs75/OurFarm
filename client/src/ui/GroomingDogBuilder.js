// client/src/ui/GroomingDogBuilder.js
// Builds a detailed procedural dog mesh for the grooming mini-game.
// More detailed than the world-view AssetGenerator models since the
// player sees this model up close in the grooming salon overlay.
//
// Exports buildGroomingDog(petData) -> { group, parts, zones, overlays }

import * as THREE from 'three';

// ─── Shared geometry / material helpers ───────────────────────────
// Slightly higher segment counts than world-view (6-8 for spheres).

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, ...opts });
}

function sphere(radius, wSeg = 8, hSeg = 6) {
  return new THREE.SphereGeometry(radius, wSeg, hSeg);
}

function cylinder(rTop, rBottom, height, segs = 6) {
  return new THREE.CylinderGeometry(rTop, rBottom, height, segs);
}

function cone(radius, height, segs = 6) {
  return new THREE.ConeGeometry(radius, height, segs);
}

function box(w, h, d) {
  return new THREE.BoxGeometry(w, h, d);
}

// ─── Breed config ─────────────────────────────────────────────────

function getBreedConfig(petData) {
  const type = petData.type || 'labrador';
  const color = petData.color || (type === 'chihuahua' ? 0xc4956a : 0x1a1a1a);
  const bodySize = petData.bodySize || (type === 'chihuahua' ? 0.25 : 0.40);
  const earSize = petData.earSize || (type === 'chihuahua' ? 0.9 : 0.35);
  const tailLength = petData.tailLength || (type === 'chihuahua' ? 0.5 : 0.7);

  if (type === 'chihuahua') {
    return {
      type,
      color,
      bodySize,
      bodyScaleZ: 1.3,
      headRatio: 0.7,          // large head relative to body
      headOffsetY: 0.55,       // how high above body centre
      headOffsetZ: 1.0,        // how far forward
      snoutScale: 0.35,        // small muzzle
      eyeRadius: 0.22,         // big eyes (ratio of headSize)
      eyeSpread: 0.45,
      earSize,
      earStyle: 'cone',        // pointy upright cones
      legHeight: 0.10,
      legRadius: 0.022,
      legSpreadX: 0.55,
      legSpreadZ: 0.60,
      pawRadius: 0.028,
      tailLength,
      tailStyle: 'curled',
      tailSegments: 3,
      tailRadius: 0.016,
    };
  }

  // Labrador (and fallback for unknown breeds)
  return {
    type: 'labrador',  // labrador proportions used as fallback for unknown breeds
    color,
    bodySize,
    bodyScaleZ: 1.4,
    headRatio: 0.5,            // proportional head
    headOffsetY: 0.40,
    headOffsetZ: 1.25,
    snoutScale: 0.55,          // larger muzzle
    eyeRadius: 0.16,
    eyeSpread: 0.40,
    earSize,
    earStyle: 'floppy',        // hanging half-spheres
    legHeight: 0.22,
    legRadius: 0.045,
    legSpreadX: 0.55,
    legSpreadZ: 0.70,
    pawRadius: 0.05,
    tailLength,
    tailStyle: 'straight',
    tailSegments: 2,
    tailRadius: 0.03,
  };
}

// ─── Main builder ─────────────────────────────────────────────────

export function buildGroomingDog(petData) {
  const cfg = getBreedConfig(petData);
  const group = new THREE.Group();
  const bodyMat = mat(cfg.color);
  const darkMat = mat(0x111111);
  const whiteMat = mat(0xffffff);
  const pinkMat = mat(0xff8899);
  const noseMat = mat(0x0a0a0a);

  const bs = cfg.bodySize;        // shorthand
  const hs = bs * cfg.headRatio;  // head radius

  // ─── Body ───────────────────────────────────────────────────────
  const body = new THREE.Mesh(sphere(bs), bodyMat);
  body.position.y = bs + cfg.legHeight;
  body.scale.z = cfg.bodyScaleZ;
  body.castShadow = true;
  group.add(body);

  const bodyY = body.position.y;

  // ─── Head ───────────────────────────────────────────────────────
  const head = new THREE.Mesh(sphere(hs, 8, 7), bodyMat);
  head.position.set(
    0,
    bodyY + bs * cfg.headOffsetY,
    bs * cfg.headOffsetZ,
  );
  head.castShadow = true;
  group.add(head);

  const hx = head.position.x;
  const hy = head.position.y;
  const hz = head.position.z;

  // ─── Snout / Muzzle ─────────────────────────────────────────────
  const snoutRadius = hs * cfg.snoutScale;
  const snout = new THREE.Mesh(sphere(snoutRadius, 7, 5), bodyMat);
  snout.position.set(hx, hy - hs * 0.15, hz + hs * 0.85);
  snout.scale.set(1, 0.75, 1.1);
  snout.castShadow = true;
  group.add(snout);

  // ─── Nose ───────────────────────────────────────────────────────
  const noseRadius = hs * 0.1;
  const nose = new THREE.Mesh(sphere(noseRadius, 6, 5), noseMat);
  nose.position.set(hx, hy - hs * 0.08, hz + hs * 0.85 + snoutRadius * 1.05);
  group.add(nose);

  // ─── Eyes ───────────────────────────────────────────────────────
  const eyeR = hs * cfg.eyeRadius;

  function buildEye(side) {
    const ex = hx + side * hs * cfg.eyeSpread;
    const ey = hy + hs * 0.18;
    const ez = hz + hs * 0.72;

    const sclera = new THREE.Mesh(sphere(eyeR, 7, 5), whiteMat);
    sclera.position.set(ex, ey, ez);
    group.add(sclera);

    const pupil = new THREE.Mesh(sphere(eyeR * 0.55, 6, 5), darkMat);
    pupil.position.set(ex, ey, ez + eyeR * 0.52);
    group.add(pupil);

    // Brow — thin dark box above the eye
    const browWidth = eyeR * 2.2;
    const browHeight = eyeR * 0.25;
    const brow = new THREE.Mesh(box(browWidth, browHeight, eyeR * 0.3), darkMat);
    brow.position.set(ex, ey + eyeR * 1.1, ez + eyeR * 0.2);
    group.add(brow);

    return { sclera, pupil, brow };
  }

  const leftEye = buildEye(-1);
  const rightEye = buildEye(1);

  // ─── Ears ───────────────────────────────────────────────────────
  let leftEar, rightEar;

  if (cfg.earStyle === 'cone') {
    // Chihuahua: large pointy upright cones
    const earHeight = bs * cfg.earSize;
    const earRadius = bs * 0.25;
    const earGeo = cone(earRadius, earHeight);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, bodyMat);
      ear.position.set(
        hx + side * hs * 0.55,
        hy + hs * 0.72,
        hz - hs * 0.1,
      );
      ear.rotation.z = side * -0.25;
      ear.castShadow = true;
      group.add(ear);
      if (side === -1) leftEar = ear;
      else rightEar = ear;
    }
  } else {
    // Labrador: floppy hanging half-spheres
    const earRadius = hs * cfg.earSize;
    const earGeo = new THREE.SphereGeometry(earRadius, 7, 5, 0, Math.PI);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, bodyMat);
      ear.position.set(
        hx + side * hs * 0.72,
        hy - hs * 0.08,
        hz - hs * 0.15,
      );
      ear.rotation.x = 0.5;
      ear.rotation.z = side * 0.3;
      ear.castShadow = true;
      group.add(ear);
      if (side === -1) leftEar = ear;
      else rightEar = ear;
    }
  }

  // ─── Jaw / Mouth ────────────────────────────────────────────────
  const jawWidth = snoutRadius * 1.4;
  const jawHeight = hs * 0.06;
  const jawDepth = snoutRadius * 1.0;
  const jaw = new THREE.Mesh(box(jawWidth, jawHeight, jawDepth), bodyMat);
  jaw.position.set(hx, hy - hs * 0.35, hz + hs * 0.85);
  group.add(jaw);

  // ─── Tongue ─────────────────────────────────────────────────────
  const tongueLen = snoutRadius * 0.9;
  const tongue = new THREE.Mesh(
    cylinder(snoutRadius * 0.15, snoutRadius * 0.2, tongueLen),
    pinkMat,
  );
  tongue.position.set(hx, hy - hs * 0.42, hz + hs * 0.85);
  tongue.rotation.x = Math.PI / 2;  // point forward
  tongue.visible = false;            // shown during happy expression
  group.add(tongue);

  // ─── Tail (multi-segment, parent-child chain) ───────────────────
  const tailSegs = [];
  const segCount = cfg.tailSegments;
  const segLength = (cfg.tailLength * bs) / segCount;
  const isCurled = cfg.tailStyle === 'curled';

  // Base anchor at back of body
  const tailAnchor = new THREE.Vector3(0, bodyY + bs * 0.15, -bs * cfg.bodyScaleZ * 0.8);

  for (let i = 0; i < segCount; i++) {
    const t = i / (segCount - 1 || 1);  // 0..1
    const rTop = cfg.tailRadius * (1 - t * 0.45);
    const rBot = cfg.tailRadius * (1 - (Math.max(0, t - 0.33)) * 0.6);
    const seg = new THREE.Mesh(cylinder(rTop, rBot, segLength), bodyMat);
    seg.castShadow = true;

    if (i === 0) {
      // First segment positioned in world space relative to group
      seg.position.copy(tailAnchor);
      if (isCurled) {
        seg.rotation.x = -1.0;  // curled up
      } else {
        seg.rotation.x = -0.35; // hanging slightly down
      }
      group.add(seg);
    } else {
      // Subsequent segments parented to previous segment
      // Position at the end of the parent cylinder (half-length along local Y)
      seg.position.set(0, -segLength * 0.95, 0);
      if (isCurled) {
        seg.rotation.x = -0.55; // additional curl per segment
      } else {
        seg.rotation.x = 0.05;  // slight droop
      }
      tailSegs[i - 1].add(seg);
    }

    tailSegs.push(seg);
  }

  // ─── Legs ───────────────────────────────────────────────────────
  const legGeo = cylinder(cfg.legRadius, cfg.legRadius, cfg.legHeight);
  const pawGeo = sphere(cfg.pawRadius, 6, 5);

  const legPositions = {
    frontLeft:  [-cfg.legSpreadX * bs, cfg.legHeight / 2, cfg.legSpreadZ * bs],
    frontRight: [ cfg.legSpreadX * bs, cfg.legHeight / 2, cfg.legSpreadZ * bs],
    backLeft:   [-cfg.legSpreadX * bs, cfg.legHeight / 2, -cfg.legSpreadZ * bs],
    backRight:  [ cfg.legSpreadX * bs, cfg.legHeight / 2, -cfg.legSpreadZ * bs],
  };

  const legs = {};
  for (const [name, [lx, ly, lz]] of Object.entries(legPositions)) {
    const legGroup = new THREE.Group();
    legGroup.position.set(lx, ly, lz);

    const leg = new THREE.Mesh(legGeo, bodyMat);
    leg.castShadow = true;
    legGroup.add(leg);

    // Paw at bottom
    const paw = new THREE.Mesh(pawGeo, bodyMat);
    paw.position.y = -cfg.legHeight / 2;
    paw.scale.set(1.15, 0.6, 1.3); // flattened paw shape
    legGroup.add(paw);

    group.add(legGroup);
    legs[name] = legGroup;
  }

  // ─── Enable shadows on all child meshes ─────────────────────────
  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });

  // ─── Cosmetic attach points ────────────────────────────────────
  const hatAttach = new THREE.Object3D();
  hatAttach.position.set(0, hs * 0.95, 0); // top of head
  head.add(hatAttach);

  const neckAttach = new THREE.Object3D();
  neckAttach.position.set(0, -bs * 0.3, bs * cfg.bodyScaleZ * 0.65); // below chin, front of body
  body.add(neckAttach);

  const backAttach = new THREE.Object3D();
  backAttach.position.set(0, bs * 0.85, -bs * 0.1); // on upper back
  body.add(backAttach);

  // ─── Named parts ────────────────────────────────────────────────
  const parts = {
    body,
    head,
    snout,
    nose,
    leftEye,
    rightEye,
    leftEar,
    rightEar,
    jaw,
    tongue,
    tail: tailSegs,
    legs,
    hatAttach,
    neckAttach,
    backAttach,
  };

  // ─── Zone meshes (invisible raycast targets) ────────────────────
  const zoneMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const zones = [];

  function addZone(name, geometry, position, scale) {
    const mesh = new THREE.Mesh(geometry, zoneMat);
    mesh.position.copy(position);
    if (scale) mesh.scale.copy(scale);
    mesh.userData.zone = name;
    group.add(mesh);
    zones.push(mesh);
    return mesh;
  }

  // Head zone — sphere around head area, slightly larger
  addZone(
    'head',
    sphere(hs * 1.5, 8, 6),
    head.position.clone(),
  );

  // Body-left zone — box on the left side of the body
  const bodyZoneH = bs * 1.4;
  const bodyZoneW = bs * 1.1;
  const bodyZoneD = bs * cfg.bodyScaleZ * 1.3;
  addZone(
    'body-left',
    box(bodyZoneW, bodyZoneH, bodyZoneD),
    new THREE.Vector3(-bs * 0.5, bodyY, 0),
  );

  // Body-right zone — box on the right side of the body
  addZone(
    'body-right',
    box(bodyZoneW, bodyZoneH, bodyZoneD),
    new THREE.Vector3(bs * 0.5, bodyY, 0),
  );

  // Back zone — flat box on top of body
  addZone(
    'back',
    box(bs * 2.0, bs * 0.6, bodyZoneD),
    new THREE.Vector3(0, bodyY + bs * 0.7, 0),
  );

  // Belly zone — flat box under body
  addZone(
    'belly',
    box(bs * 1.8, bs * 0.6, bodyZoneD),
    new THREE.Vector3(0, bodyY - bs * 0.7, 0),
  );

  // Legs zone — wide flat box covering the leg region
  addZone(
    'legs',
    box(bs * 2.2, cfg.legHeight * 1.8, bs * cfg.bodyScaleZ * 1.6),
    new THREE.Vector3(0, cfg.legHeight * 0.5, 0),
  );

  // ─── Overlay meshes (visible dirty/phase indicators) ──────────
  const overlays = [];

  function addOverlay(name, geometry, position, scale) {
    const overlayMat = new THREE.MeshStandardMaterial({
      color: 0x8B6914,  // dirty brown
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      roughness: 1.0,
    });
    const mesh = new THREE.Mesh(geometry, overlayMat);
    mesh.position.copy(position);
    if (scale) mesh.scale.copy(scale);
    // Slightly smaller than zone mesh to avoid z-fighting
    mesh.scale.multiplyScalar(0.98);
    mesh.userData.overlayZone = name;
    mesh.renderOrder = 1;
    group.add(mesh);
    addSplotches(mesh, overlayMat);
    overlays.push(mesh);
    return mesh;
  }

  function addSplotches(parentMesh, overlayMat) {
    const splotchCount = 3 + Math.floor(Math.random() * 3); // 3-5
    const parentRadius = parentMesh.geometry.parameters?.radius || 0.1;
    for (let i = 0; i < splotchCount; i++) {
      const r = parentRadius * (0.15 + Math.random() * 0.2);
      const splotch = new THREE.Mesh(sphere(r, 5, 4), overlayMat);
      splotch.position.set(
        (Math.random() - 0.5) * parentRadius * 0.8,
        (Math.random() - 0.5) * parentRadius * 0.6,
        (Math.random() - 0.5) * parentRadius * 0.8,
      );
      parentMesh.add(splotch);
    }
  }

  // Head overlay
  addOverlay(
    'head',
    sphere(hs * 1.5, 8, 6),
    head.position.clone(),
  );

  // Body-left overlay
  addOverlay(
    'body-left',
    box(bodyZoneW, bodyZoneH, bodyZoneD),
    new THREE.Vector3(-bs * 0.5, bodyY, 0),
  );

  // Body-right overlay
  addOverlay(
    'body-right',
    box(bodyZoneW, bodyZoneH, bodyZoneD),
    new THREE.Vector3(bs * 0.5, bodyY, 0),
  );

  // Back overlay
  addOverlay(
    'back',
    box(bs * 2.0, bs * 0.6, bodyZoneD),
    new THREE.Vector3(0, bodyY + bs * 0.7, 0),
  );

  // Belly overlay
  addOverlay(
    'belly',
    box(bs * 1.8, bs * 0.6, bodyZoneD),
    new THREE.Vector3(0, bodyY - bs * 0.7, 0),
  );

  // Legs overlay
  addOverlay(
    'legs',
    box(bs * 2.2, cfg.legHeight * 1.8, bs * cfg.bodyScaleZ * 1.6),
    new THREE.Vector3(0, cfg.legHeight * 0.5, 0),
  );

  return { group, parts, zones, overlays };
}

// ─── Cosmetic Mesh Builder ───────────────────────────────────────
// Returns a THREE.Group containing simple geometry for the given cosmetic ID.
// Each cosmetic is sized to be proportional to the grooming dog model.

const COSMETIC_BUILDERS = {
  // ── Hats (attach to hatAttach) ──────────────────────────────────
  straw_hat() {
    const g = new THREE.Group();
    const brim = new THREE.Mesh(cylinder(0.14, 0.14, 0.015, 12), mat(0xdaa520));
    g.add(brim);
    const crown = new THREE.Mesh(cylinder(0.07, 0.07, 0.06, 8), mat(0xdaa520));
    crown.position.y = 0.038;
    g.add(crown);
    return g;
  },

  party_hat() {
    const g = new THREE.Group();
    const c = new THREE.Mesh(cone(0.06, 0.12, 8), mat(0xcc2222));
    c.position.y = 0.06;
    g.add(c);
    return g;
  },

  flower_wreath() {
    const g = new THREE.Group();
    const geo = new THREE.TorusGeometry(0.08, 0.015, 6, 12);
    const t = new THREE.Mesh(geo, mat(0x44aa44));
    t.rotation.x = Math.PI / 2;
    g.add(t);
    return g;
  },

  cowboy_hat() {
    const g = new THREE.Group();
    const brim = new THREE.Mesh(cylinder(0.16, 0.16, 0.012, 12), mat(0x8B4513));
    g.add(brim);
    const crown = new THREE.Mesh(cylinder(0.06, 0.07, 0.08, 8), mat(0x8B4513));
    crown.position.y = 0.046;
    g.add(crown);
    return g;
  },

  crown() {
    const g = new THREE.Group();
    const band = new THREE.Mesh(cylinder(0.07, 0.07, 0.03, 8), mat(0xffd700));
    g.add(band);
    // 5 spikes around the top
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(cone(0.012, 0.035, 4), mat(0xffd700));
      spike.position.set(
        Math.cos(angle) * 0.055,
        0.032,
        Math.sin(angle) * 0.055,
      );
      g.add(spike);
    }
    return g;
  },

  // ── Neck (attach to neckAttach) ─────────────────────────────────
  red_bandana() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(box(0.12, 0.04, 0.015), mat(0xcc0000));
    // Slight rotation for triangle effect
    b.rotation.z = 0.1;
    g.add(b);
    return g;
  },

  bow_tie() {
    const g = new THREE.Group();
    const left = new THREE.Mesh(cone(0.025, 0.05, 5), mat(0x111111));
    left.rotation.z = Math.PI / 2;
    left.position.x = -0.025;
    g.add(left);
    const right = new THREE.Mesh(cone(0.025, 0.05, 5), mat(0x111111));
    right.rotation.z = -Math.PI / 2;
    right.position.x = 0.025;
    g.add(right);
    return g;
  },

  bell_collar() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.06, 0.008, 6, 12),
      mat(0xdaa520),
    );
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const bell = new THREE.Mesh(sphere(0.015, 6, 5), mat(0xffd700));
    bell.position.y = -0.02;
    g.add(bell);
    return g;
  },

  flower_lei() {
    const g = new THREE.Group();
    const geo = new THREE.TorusGeometry(0.07, 0.012, 6, 12);
    const t = new THREE.Mesh(geo, mat(0xff69b4));
    t.rotation.x = Math.PI / 2;
    g.add(t);
    return g;
  },

  scarf() {
    const g = new THREE.Group();
    const s = new THREE.Mesh(box(0.14, 0.03, 0.015), mat(0x3366cc));
    g.add(s);
    // Hanging tail
    const tail = new THREE.Mesh(box(0.025, 0.06, 0.012), mat(0x3366cc));
    tail.position.set(0.05, -0.04, 0.005);
    g.add(tail);
    return g;
  },

  // ── Back (attach to backAttach) ─────────────────────────────────
  cape() {
    const g = new THREE.Group();
    const c = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.22),
      mat(0x6622aa, { side: THREE.DoubleSide }),
    );
    c.rotation.x = -0.3; // drape slightly backward
    c.position.y = -0.05;
    g.add(c);
    return g;
  },

  backpack() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(box(0.07, 0.07, 0.05), mat(0x8B4513));
    g.add(b);
    return g;
  },

  angel_wings() {
    const g = new THREE.Group();
    const wingMat = mat(0xffffff, { side: THREE.DoubleSide });
    const leftW = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.14), wingMat);
    leftW.position.set(-0.06, 0, 0);
    leftW.rotation.y = 0.4;
    g.add(leftW);
    const rightW = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.14), wingMat);
    rightW.position.set(0.06, 0, 0);
    rightW.rotation.y = -0.4;
    g.add(rightW);
    return g;
  },

  butterfly_wings() {
    const g = new THREE.Group();
    const colors = [0xff6699, 0x66ccff, 0xffcc33, 0x66ff99];
    const wingMat = mat(colors[Math.floor(Math.random() * colors.length)], {
      side: THREE.DoubleSide,
    });
    const leftW = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.10), wingMat);
    leftW.position.set(-0.045, 0, 0);
    leftW.rotation.y = 0.5;
    g.add(leftW);
    const rightW = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.10), wingMat);
    rightW.position.set(0.045, 0, 0);
    rightW.rotation.y = -0.5;
    g.add(rightW);
    return g;
  },

  saddle() {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(box(0.10, 0.02, 0.12), mat(0x3e2723));
    g.add(seat);
    // Raised front pommel
    const pommel = new THREE.Mesh(box(0.04, 0.03, 0.02), mat(0x3e2723));
    pommel.position.set(0, 0.02, 0.05);
    g.add(pommel);
    return g;
  },
};

/**
 * Build a simple Three.js mesh group for a cosmetic item.
 * @param {string} cosmeticId — e.g. 'straw_hat', 'cape', etc.
 * @returns {THREE.Group|null}
 */
export function buildCosmeticMesh(cosmeticId) {
  const builder = COSMETIC_BUILDERS[cosmeticId];
  if (!builder) return null;
  const mesh = builder();
  mesh.userData.cosmeticId = cosmeticId;
  return mesh;
}
