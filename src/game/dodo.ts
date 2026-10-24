import * as THREE from 'three';
import { citySpawnBlockedWorld } from './cityLayout';

/**
 *  THE DODO — island wildlife (day + night flock)
 *  ----------------------------------------------
 *  A premium Minecraft-style voxel dodo bird built entirely from
 *  rectangular prisms (no downloaded assets), matched to the reference:
 *   - broad squared slate-blue head with a stepped crown
 *   - huge hooked beak: golden base -> ochre shaft -> charcoal tip,
 *     with a small dark nostril on the yellow section
 *   - cream face patch with a big square black eye + white highlight
 *   - long cream neck (dark slate rear), full cream chest
 *   - bulky layered blue-gray torso with a pale beige underside
 *   - folded side wings with layered pale feather plates
 *   - short upright fan tail of ivory feathers
 *   - long ochre legs + broad feet with three fanned toes (dark tips)
 *
 *  SPAWN RULE: spawns in DAY and NIGHT alike (no time gate) — the flock
 *  wanders flat open ground away from the city plateau, keeps pack
 *  spacing, and never materialises in your face.
 *
 *  BEHAVIOR (kept deliberately minimal — this is a model drop, not a
 *  full AI creature): idle / wander / peck / flee-when-wounded brains,
 *  a lumbering waddle gait, tail wag and idle head scans.
 *
 *  COLLISION  — rides the terrain through the injected heightAt (with
 *  one-block step steering), respects fruit/palm solids via obstacleAt,
 *  is a SOLID body to the player (circle push-out), and bullets/rockets
 *  find it through hitTest/damage/blast. Distance-despawns far away.
 */

// ---- scale: the bird stands ~2.5 blocks tall ------------------------------
const LEG_H = 76; // hip height — legs lift the heavy torso above ground
const MOB_HEIGHT = 250; // bullet-test ceiling (hip->crown ~212 + beak mass)
/** Solid footprint for the player push-out. */
const BODY_RADIUS = 36;

// ---- tuning ----------------------------------------------------------------
const MAX_HP = 90; // passive wildlife — three pistol bites
const WALK_SPEED = 70; // dodos waddle
const FLEE_SPEED = 165; // wounded panic waddle
const FLEE_TIME = 2.6;
const HIT_IMPULSE = 120;
const HIT_TAU = 0.3;
const HIT_HOP = 150;
const LEAP_G = 1500; // knockback hop gravity
const STEP_UP = 108; // Minecraft mobs step up ONE 100u block row
/** Population (low-spec devices run a thinner flock). */
const POP_TARGET_LOW = 2;
const POP_TARGET = 4;
const SPAWN_MIN = 460;
const SPAWN_MAX = 1150;
const SPAWN_COOLDOWN = 3.2;
const SPAWN_CLEARANCE = 380; // never materialise in your face
const PACK_SPACING = 170;
const DESPAWN_DIST = 2400; // far birds quietly leave the flock
const DEATH_FADE = 0.95; // dying fade + sink duration

type Brain = 'idle' | 'wander' | 'flee';
type Phase = 'alive' | 'dying';

// ---------------------------------------------------------------------------
// deterministic hash (textures + per-bird tint must be reload-stable)
// ---------------------------------------------------------------------------
function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------------------------------------------------------------------------
// pixel art — one 16x16 tile per plumage/material family (8-tile atlas)
// ---------------------------------------------------------------------------
const PAL = {
  slate: { base: '#343B4B', dark: '#252B37', light: '#505969', speck: '#1E232D' },
  cream: { base: '#E8D8B5', dark: '#CDBB92', light: '#F3E7CA' },
  wing: { base: '#697181', dark: '#505969', light: '#7A8494' },
  ivory: { base: '#D8D7D2', dark: '#B0AFA9', light: '#EFEDE8' },
  beakY: { base: '#D5A63D', dark: '#A97725', light: '#E0B44E' },
  beakD: { base: '#332E2D', dark: '#221F1E', light: '#4A4340' },
  leg: { base: '#C38A2E', dark: '#A97725', light: '#D9A545' },
  belly: { base: '#B8AE9C', dark: '#9C9282', light: '#CFC6B4' },
};

/** Paint one 16x16 feather/skin tile with per-pixel deterministic noise. */
function paintTile(
  ctx: CanvasRenderingContext2D,
  ox: number,
  p: { base: string; dark: string; light: string; speck?: string },
  seed: number
): void {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const r = hash1(seed + x * 12.9898 + y * 78.233);
      // layered plumage patches: low-freq field + high-freq flecks
      const patch = hash1(
        seed * 0.71 + Math.floor(x / 3) * 4.7 + Math.floor(y / 3) * 8.3
      );
      let c = p.base;
      if (patch < 0.24) c = p.dark;
      else if (patch > 0.78) c = p.light;
      if (p.speck && r < 0.08) c = p.speck;
      else if (r < 0.1) c = p.dark;
      else if (r > 0.93) c = p.light;
      ctx.fillStyle = c;
      ctx.fillRect(ox + x, y, 1, 1);
    }
  }
}

/** The 128x16 atlas: slate|cream|wing|ivory|beakY|beakD|leg|belly. */
function paintSkinAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const seeds = [3.1, 7.7, 12.9, 21.3, 29.7, 34.9, 41.1, 47.3];
  const fams = [
    PAL.slate,
    PAL.cream,
    PAL.wing,
    PAL.ivory,
    PAL.beakY,
    PAL.beakD,
    PAL.leg,
    PAL.belly,
  ];
  for (let t = 0; t < 8; t++) paintTile(ctx, t * 16, fams[t], seeds[t]);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// UV helper: the atlas is 8 tiles wide (16px each). BoxGeometry's face
// order is +x,-x,+y,-y,+z,-z; remap every face onto one tile.
function remapBoxUVs(geo: THREE.BufferGeometry, tile: number): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const u0 = tile / 8;
  const u1 = (tile + 1) / 8;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), uv.getY(i));
  }
  uv.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// model
// ---------------------------------------------------------------------------

/** Tiles: 0 slate | 1 cream | 2 wing | 3 ivory | 4 beakY | 5 beakD | 6 leg | 7 belly */
const TILE = {
  slate: 0,
  cream: 1,
  wing: 2,
  ivory: 3,
  beakY: 4,
  beakD: 5,
  leg: 6,
  belly: 7,
} as const;

interface DodoParts {
  root: THREE.Group; // feet-positioned
  bodyGroup: THREE.Group; // waddle bob + roll
  neckGroup: THREE.Group; // peck dips forward
  headGroup: THREE.Group; // idle scans
  tailGroup: THREE.Group; // wag
  legPivots: THREE.Group[]; // [left, right] pivot at hip
  fadeMats: THREE.Material[]; // every material — death fade
}

/** Box helper with skin-tile UVs + shadow casting. */
function skinBox(
  w: number,
  h: number,
  d: number,
  tile: number,
  mat: THREE.MeshLambertMaterial
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  remapBoxUVs(geo, tile);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

/** Plain-color box helper (eyes, highlights, toe tips). */
function colorBox(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  noShadow = false
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  if (!noShadow) mesh.castShadow = true;
  return mesh;
}

/** Position a mesh inside its parent (centers, like Minecraft parts). */
function place(
  parent: THREE.Object3D,
  mesh: THREE.Mesh,
  x: number,
  y: number,
  z: number
): THREE.Mesh {
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** Build one dodo. The bird FACES +Z (beak forward), matching the
 *  shared yaw convention (yawTarget = atan2(dirX, dirZ)). */
function buildDodo(skin: THREE.Texture, tintSeed: number): DodoParts {
  // per-bird material set (fade targets must be per-bird); a subtle
  // brightness tint differentiates flockmates without breaking palette
  const tint = 0.94 + hash1(tintSeed) * 0.1;
  const mkLam = (tile: number): THREE.MeshLambertMaterial => {
    const m = new THREE.MeshLambertMaterial({ map: skin });
    m.color.setScalar(tint);
    return m;
  };
  const matSlate = mkLam(TILE.slate);
  const matCream = mkLam(TILE.cream);
  const matWing = mkLam(TILE.wing);
  const matIvory = mkLam(TILE.ivory);
  const matBeakY = mkLam(TILE.beakY);
  const matBeakD = mkLam(TILE.beakD);
  const matLeg = mkLam(TILE.leg);
  const matBelly = mkLam(TILE.belly);
  const matEye = new THREE.MeshLambertMaterial({ color: '#08090B' });
  const matSpark = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
  const matToeTip = new THREE.MeshLambertMaterial({ color: '#44352B' });
  const fadeMats: THREE.Material[] = [
    matSlate,
    matCream,
    matWing,
    matIvory,
    matBeakY,
    matBeakD,
    matLeg,
    matBelly,
    matEye,
    matSpark,
    matToeTip,
  ];

  const root = new THREE.Group();

  // ================= LEGS + FEET (root children — they stay grounded) =====
  const legPivots: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 26, LEG_H, -8);
    root.add(hip);
    legPivots.push(hip);
    // thigh (tucked under the torso)
    place(hip, skinBox(24, 30, 26, TILE.leg, matLeg), 0, -15, 0);
    // sturdy straight shin
    place(hip, skinBox(14, 42, 14, TILE.leg, matLeg), 0, -51, 0);
    // broad flat foot pad
    place(hip, skinBox(26, 8, 36, TILE.leg, matLeg), 0, -LEG_H + 4, 8);
    // three forward toes, fanned slightly outward (natural asymmetry)
    const toeAngles = [-0.28, 0, 0.3];
    const toeLens = [24, 28, 23];
    for (let t = 0; t < 3; t++) {
      const toe = new THREE.Group();
      toe.position.set(side * (t === 0 ? -7 : t === 2 ? 8 : 1), 0, 24);
      toe.rotation.y = toeAngles[t] * side * 0.9;
      hip.add(toe);
      place(toe, skinBox(9, 8, toeLens[t], TILE.leg, matLeg), 0, -LEG_H + 4, toeLens[t] / 2);
      // dark chocolate toe tip
      place(toe, colorBox(9, 8, 8, matToeTip), 0, -LEG_H + 4, toeLens[t] + 3);
    }
  }

  // ================= BODY (torso / chest / underside) ======================
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);
  // main heavy torso — broad, deep, rounded-cubic via layered slabs
  place(bodyGroup, skinBox(108, 82, 120, TILE.slate, matSlate), 0, 108, 0);
  // upper back slab (rounded-cubic back, slightly rear-shifted mass)
  place(bodyGroup, skinBox(92, 26, 104, TILE.slate, matSlate), 0, 156, -6);
  // pale beige lower belly bridging legs and torso
  place(bodyGroup, skinBox(88, 28, 100, TILE.belly, matBelly), 0, 58, -4);
  // full cream chest — proud, front-facing light region
  place(bodyGroup, skinBox(80, 70, 32, TILE.cream, matCream), 0, 94, 50);

  // ================= NECK (cream front, slate rear) ========================
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0, 0, 0);
  bodyGroup.add(neckGroup);
  // stacked cream front column (stepped transition into the chest)
  place(neckGroup, skinBox(44, 26, 40, TILE.cream, matCream), 0, 172, 40);
  place(neckGroup, skinBox(38, 34, 34, TILE.cream, matCream), 0, 198, 42);
  place(neckGroup, skinBox(34, 26, 30, TILE.cream, matCream), 0, 224, 42);
  // dark slate rear feathers running down from the head
  place(neckGroup, skinBox(30, 58, 16, TILE.slate, matSlate), 0, 196, 26);

  // ================= HEAD (broad, squared, stepped crown) ==================
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 212, 40);
  bodyGroup.add(headGroup);
  // main slate head cube
  place(headGroup, skinBox(60, 48, 52, TILE.slate, matSlate), 0, 22, 2);
  // stepped crown
  place(headGroup, skinBox(52, 14, 40, TILE.slate, matSlate), 0, 52, -4);
  // squared rear skull
  place(headGroup, skinBox(48, 36, 16, TILE.slate, matSlate), 0, 24, -24);
  // cream face patch — strong contrast against the dark crown
  place(headGroup, skinBox(44, 30, 18, TILE.cream, matCream), 0, 16, 26);
  // eyes: big square black cuboids high on the face + white highlights
  for (const side of [-1, 1]) {
    place(headGroup, colorBox(4, 15, 12, matEye), side * 31, 26, 16);
    place(headGroup, colorBox(2, 5, 5, matSpark, true), side * 33.5, 30, 18);
  }
  // ============== SIGNATURE BEAK — oversized, hooked, stepped ==============
  // golden base (high near the forehead)
  place(headGroup, skinBox(42, 26, 26, TILE.beakY, matBeakY), 0, 12, 38);
  // ochre central shaft with amber shadow accents (tile noise)
  place(headGroup, skinBox(36, 22, 34, TILE.beakY, matBeakY), 0, 8, 62);
  // bulbous charcoal tip — blunt and heavy, drooping slightly
  place(headGroup, skinBox(32, 24, 28, TILE.beakD, matBeakD), 0, 2, 86);
  // tip highlight: graphite facets on the upper terminal
  place(headGroup, skinBox(24, 6, 18, TILE.beakD, matBeakD), 0, 13, 84);
  // small dark nostril on the yellow section, front half
  place(headGroup, colorBox(6, 4, 6, matEye), 0, 27, 48);

  // ================= WINGS (folded, layered feather plates) ================
  for (const side of [-1, 1]) {
    // main folded wing slab hugging the torso side
    place(bodyGroup, skinBox(16, 62, 88, TILE.wing, matWing), side * 60, 112, -6);
    // dark outer border along the wing's top edge
    place(bodyGroup, skinBox(12, 12, 84, TILE.slate, matSlate), side * 62, 146, -6);
    // broad pale feather blocks stepping diagonally down the wing
    place(bodyGroup, skinBox(10, 26, 40, TILE.ivory, matIvory), side * 68, 120, 14);
    place(bodyGroup, skinBox(10, 24, 36, TILE.ivory, matIvory), side * 68, 104, -20);
    place(bodyGroup, skinBox(10, 22, 32, TILE.ivory, matIvory), side * 68, 88, -50);
  }

  // ================= TAIL (short upright fan of ivory feathers) ============
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 150, -56);
  bodyGroup.add(tailGroup);
  for (let f = 0; f < 5; f++) {
    const feather = new THREE.Group();
    tailGroup.add(feather);
    // fanned splay + stepped heights + layered upward-back angles
    feather.position.set((f - 2) * 17, 8 + Math.abs(f - 2) * -3, -10);
    feather.rotation.x = -(0.42 + (2 - Math.abs(f - 2)) * 0.1);
    feather.rotation.y = (f - 2) * 0.16;
    const w = f % 2 === 0 ? 18 : 15;
    place(feather, skinBox(w, 12, 46, TILE.ivory, matIvory), 0, 0, -20);
    // gray shadow accent between feathers
    place(feather, skinBox(4, 10, 30, TILE.wing, matWing), f < 2 ? 10 : -10, 1, -16);
  }

  return { root, bodyGroup, neckGroup, headGroup, tailGroup, legPivots, fadeMats };
}

// ---------------------------------------------------------------------------
// manager
// ---------------------------------------------------------------------------

export interface DodoMobOptions {
  lowSpec?: boolean;
  /** Terrain height query — the dodo walks the same ground you do. */
  heightAt: (x: number, z: number) => number;
  /** Grid->world conversion for the city-exclusion test (page constants). */
  block: number;
  gridOffset: number;
  /** Solid props (fruits + palms) the bird should respect, like the player. */
  obstacleAt?: (
    x: number,
    z: number,
    radius: number,
    y: number
  ) => { x: number; z: number } | null;
}

export interface DodoInfo {
  id: number;
  hp: number;
  maxHp: number;
  state: Brain | 'dying';
  x: number;
  y: number;
  z: number;
}

export interface Dodos {
  list(): DodoInfo[];
  /** Day+night flock tick — no night factor needed. */
  update(dt: number, playerPos: THREE.Vector3): void;
  hitTest(p: THREE.Vector3): { id: number } | null;
  damage(id: number, amount: number, from?: THREE.Vector3): boolean;
  blast(p: THREE.Vector3, radius: number, maxDamage: number): void;
  /** Solid-body push-out for the player (dying birds ghost). */
  collide(x: number, z: number, radius: number): { x: number; z: number } | null;
  /** Tooling spawn (skips nothing but crowding — day or night). */
  spawnAt(x: number, z: number): boolean;
  stats: { spawned: number; killed: number; alive: number };
  dispose(): void;
}

interface Dodo extends DodoParts {
  id: number;
  active: boolean;
  phase: Phase;
  brain: Brain;
  hp: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  yawTarget: number;
  vy: number;
  airborne: boolean;
  kbX: number;
  kbZ: number;
  walkT: number;
  moving: boolean;
  timer: number;
  targetX: number;
  targetZ: number;
  fleeT: number;
  peckT: number;
  peckCd: number;
  dieT: number;
  scanSeed: number;
}

export function createDodos(scene: THREE.Scene, opts: DodoMobOptions): Dodos {
  const lowSpec = opts.lowSpec ?? false;
  const popTarget = lowSpec ? POP_TARGET_LOW : POP_TARGET;
  const POOL = popTarget + 2;

  // ---- shared assets -------------------------------------------------------
  const skin = paintSkinAtlas();

  const group = new THREE.Group();
  group.name = 'dodoMobs';
  scene.add(group);

  const dodos: Dodo[] = [];
  for (let i = 0; i < POOL; i++) {
    const parts = buildDodo(skin, i * 5.3 + 1.7);
    parts.root.visible = false;
    group.add(parts.root);
    dodos.push({
      ...parts,
      id: i + 1,
      active: false,
      phase: 'alive',
      brain: 'idle',
      hp: MAX_HP,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      yawTarget: 0,
      vy: 0,
      airborne: false,
      kbX: 0,
      kbZ: 0,
      walkT: 0,
      moving: false,
      timer: 0,
      targetX: 0,
      targetZ: 0,
      fleeT: 0,
      peckT: 0,
      peckCd: 4 + Math.random() * 6,
      dieT: 0,
      scanSeed: i * 2.9,
    });
  }

  const stats = { spawned: 0, killed: 0, alive: 0 };
  let spawnCd = 2;
  let elapsed = 0;
  const playerPos = new THREE.Vector3();

  const flatEnough = (x: number, z: number): boolean => {
    const h = opts.heightAt(x, z);
    const dx = 24;
    return (
      Math.abs(opts.heightAt(x + dx, z) - h) < 34 &&
      Math.abs(opts.heightAt(x - dx, z) - h) < 34 &&
      Math.abs(opts.heightAt(x, z + dx) - h) < 34 &&
      Math.abs(opts.heightAt(x, z - dx) - h) < 34
    );
  };

  /** Dodos roam open ground — the city plateau is excluded. */
  const spawnOk = (x: number, z: number): boolean =>
    flatEnough(x, z) && !citySpawnBlockedWorld(x, z, opts.block, opts.gridOffset);

  const activate = (x: number, z: number, c: Dodo): void => {
    c.active = true;
    c.phase = 'alive';
    c.brain = 'idle';
    c.hp = MAX_HP;
    c.x = x;
    c.z = z;
    c.y = opts.heightAt(x, z);
    c.yaw = Math.random() * Math.PI * 2;
    c.yawTarget = c.yaw;
    c.vy = 0;
    c.airborne = false;
    c.kbX = 0;
    c.kbZ = 0;
    c.walkT = 0;
    c.moving = false;
    c.timer = 1 + Math.random() * 2;
    c.fleeT = 0;
    c.peckT = 0;
    c.peckCd = 3 + Math.random() * 6;
    c.dieT = 0;
    // fresh body: opaque
    for (const m of c.fadeMats) {
      m.transparent = false;
      m.opacity = 1;
    }
    c.root.visible = true;
    c.root.position.set(x, c.y, z);
    c.root.rotation.set(0, 0, 0);
    c.root.scale.setScalar(1);
    stats.spawned++;
  };

  const release = (c: Dodo): void => {
    c.active = false;
    c.root.visible = false;
  };

  const spawnDodo = (x: number, z: number): Dodo | null => {
    if (!spawnOk(x, z)) return null;
    // keep a spawning margin from the player and flockmates
    if (Math.hypot(x - playerPos.x, z - playerPos.z) < SPAWN_CLEARANCE)
      return null;
    for (const o of dodos) {
      if (o.active && Math.hypot(x - o.x, z - o.z) < PACK_SPACING) return null;
    }
    const slot = dodos.find((c) => !c.active);
    if (!slot) return null;
    activate(x, z, slot);
    return slot;
  };

  /** Ring pick around the player — works the same in day and night. */
  const tryNaturalSpawn = (): void => {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const x = playerPos.x + Math.sin(a) * r;
      const z = playerPos.z + Math.cos(a) * r;
      if (spawnDodo(x, z)) return;
    }
  };

  const killDodo = (c: Dodo): void => {
    c.phase = 'dying';
    c.dieT = 0;
    c.moving = false;
    stats.killed++;
  };

  // ---- per-frame helpers ------------------------------------------------------
  /** One-block step steering, shared with the creeper mob convention. */
  const steerAhead = (c: Dodo, dirX: number, dirZ: number): number => {
    const probe = (off: number): boolean => {
      const s = Math.sin(off);
      const co = Math.cos(off);
      const rx = dirX * co - dirZ * s;
      const rz = dirX * s + dirZ * co;
      const h = opts.heightAt(c.x + rx * 60, c.z + rz * 60);
      return h - c.y < STEP_UP;
    };
    if (probe(0)) return 0;
    if (probe(0.7)) return 0.7;
    if (probe(-0.7)) return -0.7;
    if (probe(1.4)) return 1.4;
    if (probe(-1.4)) return -1.4;
    if (probe(2.1)) return 2.1;
    if (probe(-2.1)) return -2.1;
    return NaN; // walled in — hold position
  };

  const stepWalk = (
    c: Dodo,
    dt: number,
    dirX: number,
    dirZ: number,
    speed: number
  ): void => {
    if (speed <= 0 || !Number.isFinite(dirX)) {
      c.moving = false;
      return;
    }
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;
    const off = steerAhead(c, nx, nz);
    if (Number.isNaN(off)) {
      c.moving = false;
      return;
    }
    const s = Math.sin(off);
    const co = Math.cos(off);
    c.x += (nx * co - nz * s) * speed * dt + c.kbX * dt;
    c.z += (nx * s + nz * co) * speed * dt + c.kbZ * dt;
    c.yawTarget = Math.atan2(nx, nz);
    c.moving = true;
    // solid props (fruits + palms) push the bird out like the player
    if (opts.obstacleAt) {
      const push = opts.obstacleAt(c.x, c.z, BODY_RADIUS, c.y);
      if (push) {
        c.x = push.x;
        c.z = push.z;
      }
    }
  };

  const brainTick = (c: Dodo, dt: number): void => {
    // flee on a timer — a wounded dodo panics away from the player
    if (c.brain === 'flee') {
      c.fleeT -= dt;
      const dx = c.x - playerPos.x;
      const dz = c.z - playerPos.z;
      const d = Math.hypot(dx, dz) || 1;
      stepWalk(c, dt, dx / d, dz / d, FLEE_SPEED);
      if (c.fleeT <= 0) {
        c.brain = 'idle';
        c.timer = 0.6 + Math.random();
      }
      return;
    }
    switch (c.brain) {
      case 'idle': {
        c.moving = false;
        c.timer -= dt;
        // idle pecking — head dips to the ground and back
        c.peckCd -= dt;
        if (c.peckCd <= 0 && c.peckT <= 0) {
          c.peckT = 0.62;
          c.peckCd = 3 + Math.random() * 7;
        }
        if (c.timer <= 0) {
          c.timer = 2 + Math.random() * 3;
          c.targetX = c.x + (Math.random() - 0.5) * 420;
          c.targetZ = c.z + (Math.random() - 0.5) * 420;
          c.brain = 'wander';
        }
        break;
      }
      case 'wander': {
        c.timer -= dt;
        const tdx = c.targetX - c.x;
        const tdz = c.targetZ - c.z;
        const td = Math.hypot(tdx, tdz);
        if (td < 40 || c.timer <= 0) {
          c.brain = 'idle';
          c.timer = 1 + Math.random() * 3;
          c.moving = false;
        } else {
          stepWalk(c, dt, tdx / td, tdz / td, WALK_SPEED);
        }
        break;
      }
    }
  };

  /** Gait + peck + tail wag + idle head scans (minimal, charming motion). */
  const animate = (c: Dodo, dt: number, t: number): void => {
    // yaw easing toward the walk heading
    let rel = c.yawTarget - c.yaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    c.yaw += rel * Math.min(1, 8 * dt);
    c.root.rotation.y = c.yaw;
    c.root.position.set(c.x, c.y, c.z);

    if (c.airborne) {
      // knocked into the air: wings tight, legs trail
      for (const p of c.legPivots) p.rotation.x = 0.7;
      c.root.position.y = c.y;
      return;
    }

    // terrain ride (exponential ease onto the surface)
    const gy = opts.heightAt(c.x, c.z);
    c.y += (gy - c.y) * Math.min(1, 10 * dt);

    // waddle gait: alternating leg swings + body roll/bob
    if (c.moving) {
      const fast = c.brain === 'flee';
      c.walkT += dt * (fast ? 12 : 7);
      const amp = fast ? 0.62 : 0.48;
      const swing = Math.sin(c.walkT) * amp;
      c.legPivots[0].rotation.x = swing;
      c.legPivots[1].rotation.x = -swing;
      c.bodyGroup.position.y = Math.abs(Math.sin(c.walkT)) * 3.2;
      c.bodyGroup.rotation.z = Math.sin(c.walkT) * 0.07; // the waddle
      c.bodyGroup.rotation.y = Math.sin(c.walkT * 0.5) * 0.05;
    } else {
      for (const p of c.legPivots) {
        p.rotation.x *= Math.max(0, 1 - 8 * dt);
      }
      c.bodyGroup.position.y = Math.sin(t * 1.6 + c.scanSeed) * 1.2; // breathing
      c.bodyGroup.rotation.z *= Math.max(0, 1 - 8 * dt);
      c.bodyGroup.rotation.y *= Math.max(0, 1 - 8 * dt);
    }

    // peck: neck dips forward-down in a smooth arc while idle
    if (c.peckT > 0) {
      c.peckT = Math.max(0, c.peckT - dt);
      const k = Math.sin((1 - c.peckT / 0.62) * Math.PI);
      c.neckGroup.rotation.x = k * 0.85;
      c.headGroup.rotation.x = k * 0.35;
    } else {
      c.neckGroup.rotation.x *= Math.max(0, 1 - 9 * dt);
      c.headGroup.rotation.x *= Math.max(0, 1 - 9 * dt);
      // idle head scan
      c.headGroup.rotation.y = Math.sin(t * 0.55 + c.scanSeed) * 0.45;
    }

    // tail wag — lazy when idle, brisk on the move
    c.tailGroup.rotation.y =
      Math.sin(t * (c.moving ? 6 : 2.2) + c.scanSeed) * (c.moving ? 0.16 : 0.1);
  };

  const update = (dt: number, pPos: THREE.Vector3): void => {
    elapsed += dt;
    playerPos.copy(pPos);

    // population counter
    let alive = 0;
    for (const c of dodos) {
      if (c.active && c.phase === 'alive') alive++;
    }
    stats.alive = alive;

    // spawning: DAY and NIGHT alike — only crowding/cooldown gates
    spawnCd -= dt;
    if (alive < popTarget && spawnCd <= 0) {
      spawnCd = SPAWN_COOLDOWN;
      tryNaturalSpawn();
    }

    for (const c of dodos) {
      if (!c.active) continue;

      if (c.phase === 'dying') {
        // fade + sink, then recycle the slot
        c.dieT += dt;
        const k = Math.min(1, c.dieT / DEATH_FADE);
        for (const m of c.fadeMats) {
          m.transparent = true;
          m.opacity = 1 - k;
        }
        c.root.position.y = c.y - k * 34;
        if (k >= 1) release(c);
        continue;
      }

      // knockback decay + hop integration
      if (c.kbX !== 0 || c.kbZ !== 0) {
        c.x += c.kbX * dt;
        c.z += c.kbZ * dt;
        const dec = Math.exp(-HIT_TAU * 3 * dt);
        c.kbX *= dec;
        c.kbZ *= dec;
        if (Math.abs(c.kbX) + Math.abs(c.kbZ) < 4) {
          c.kbX = 0;
          c.kbZ = 0;
        }
      }
      if (c.airborne) {
        c.vy -= LEAP_G * dt;
        c.y += c.vy * dt;
        const gy = opts.heightAt(c.x, c.z);
        if (c.y <= gy) {
          c.y = gy;
          c.airborne = false;
          c.vy = 0;
        }
      } else {
        brainTick(c, dt);
      }

      // distance despawn — far birds quietly leave
      if (Math.hypot(c.x - playerPos.x, c.z - playerPos.z) > DESPAWN_DIST) {
        release(c);
        continue;
      }

      animate(c, dt, elapsed);
    }
  };

  return {
    list(): DodoInfo[] {
      return dodos
        .filter((c) => c.active)
        .map((c) => ({
          id: c.id,
          hp: Math.max(0, Math.round(c.hp)),
          maxHp: MAX_HP,
          state: c.phase === 'dying' ? ('dying' as const) : c.brain,
          x: Math.round(c.x),
          y: Math.round(c.y),
          z: Math.round(c.z),
        }));
    },

    update,

    hitTest(p) {
      for (const c of dodos) {
        if (!c.active || c.phase !== 'alive') continue;
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        if (dx * dx + dz * dz > 44 * 44) continue;
        if (p.y < c.y - 6 || p.y > c.y + MOB_HEIGHT + 8) continue;
        return { id: c.id };
      }
      return null;
    },

    damage(id, amount, from) {
      const c = dodos.find((o) => o.id === id && o.active);
      if (!c || c.phase !== 'alive') return false;
      c.hp -= amount;
      // shove away from the hit + a startled hop
      if (from) {
        const dx = c.x - from.x;
        const dz = c.z - from.z;
        const d = Math.hypot(dx, dz) || 1;
        c.kbX += (dx / d) * HIT_IMPULSE;
        c.kbZ += (dz / d) * HIT_IMPULSE;
      }
      if (!c.airborne) {
        c.airborne = true;
        c.vy = HIT_HOP;
      }
      if (c.hp <= 0) {
        killDodo(c);
        return true;
      }
      // wounded: panic waddle away from the player
      c.brain = 'flee';
      c.fleeT = FLEE_TIME;
      c.peckT = 0;
      return false;
    },

    blast(p, radius, maxDamage) {
      for (const c of dodos) {
        if (!c.active || c.phase !== 'alive') continue;
        const cy = c.y + 90;
        const d = Math.sqrt(
          (c.x - p.x) ** 2 + (cy - p.y) ** 2 + (c.z - p.z) ** 2
        );
        if (d > radius) continue;
        const dmg = maxDamage * (1 - d / radius);
        if (dmg < 4) continue;
        this.damage(c.id, dmg, p);
      }
    },

    collide(x, z, radius) {
      let cx = x;
      let cz = z;
      let hit = false;
      for (const c of dodos) {
        if (!c.active || c.phase !== 'alive') continue;
        const dx = cx - c.x;
        const dz = cz - c.z;
        const min = BODY_RADIUS + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 > min * min || d2 < 0.0001) continue;
        const d = Math.sqrt(d2);
        const push = min - d;
        cx += (dx / d) * push;
        cz += (dz / d) * push;
        hit = true;
      }
      return hit ? { x: cx, z: cz } : null;
    },

    spawnAt(x, z) {
      // tooling hook — flat-ground + city gate stays, time does not matter
      if (!spawnOk(x, z)) return false;
      for (const o of dodos) {
        if (o.active && Math.hypot(x - o.x, z - o.z) < 120) return false;
      }
      const slot = dodos.find((c) => !c.active);
      if (!slot) return false;
      activate(x, z, slot);
      return true;
    },

    stats,

    dispose() {
      for (const c of dodos) release(c);
      scene.remove(group);
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const mats = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          for (const m of mats) m.dispose();
        }
      });
      skin.dispose();
    },
  };
}
