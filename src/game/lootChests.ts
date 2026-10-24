/**
 * Loot chests for the RATFIRE endless world.
 *
 * Rare treasure crates scattered across the streamed voxel terrain — the
 * in-world counterpart of the lobby economy: aim at one and CLICK / TAP it
 * and it plays a little unlock cinematic — the hasp + padlock flip open
 * first, then the domed lid swings back on its hinges — before bursting
 * coins (rare chests also drop gems) that are banked into the HUD balance.
 * The chest then STAYS OPEN where it stands — an opened chest becomes a
 * permanent landmark with its heaped treasure (ultradetail procedural
 * coins, gold-bar ingots and cut gems — see treasurePbr.ts) on full
 * display, and it is never respawned for the rest of the session.
 *
 * Every chest stands inside a golden SUMMONING CIRCLE (see lootRitual.ts)
 * — rotating rune rings etched into the ground, a warm light pool, rising
 * light beams, drifting rune-script columns and ember motes, all driven
 * by one shared shader clock.
 *
 *  - DETERMINISTIC REGIONS: the plane is cut into square REGIONS (in
 *    height-grid cells, same trick as groundWater.ts). Each region entered
 *    for the first time is scanned for GENTLY-FLAT cells (slope <= 1, so
 *    chests appear on hilltops and in valleys alike) and samples up to
 *    MAX_CHESTS_PER_REGION spaced sites from them with a region-seeded
 *    mulberry32 PRNG — a region always grows the same chests, even after
 *    its sites were pruned and you return later. Some regions roll empty,
 *    keeping chests genuinely rare.
 *  - SESSION LOOTED SET: an opened chest's region key is remembered for
 *    the session — revisiting never respawns it (rediscovery replays the
 *    same sites minus the looted ones).
 *  - MODEL: each chest is THREE meshes built from per-part merged PBR
 *    geometry (aged dark-oak body + domed plank lid, hammered-gold
 *    fittings, ornate gilded lock plate on rare chests, dark-iron
 *    hinges) — see chestPbr.ts. The LID is a separate mesh hung on a
 *    pivot at the back hinge line and the LATCH (hasp + padlock) hangs
 *    on its own pivot at the lid front edge, which is what makes the
 *    two-stage unlock cinematic possible. The body is hollow: open the
 *    lid and the heaped treasure set shows inside (see TREASURE). So a
 *    screen full of chests costs ~10 draw calls each, all sharing two
 *    material kits.
 *    Rare chests wear full gold banding, a ridge cap, stud rivets and
 *    the gilded plate.
 *  - TREASURE: the hollow body carries a shared per-rarity treasure
 *    mesh — a gilded mound heaped with embossed coin stacks (struck
 *    faces + reeded edges), tapered stamped gold-bar ingots and, in
 *    rare chests, cut ruby/emerald/amethyst gems (textures + materials
 *    in treasurePbr.ts). Two merged geometries (common/rare) are shared
 *    by every chest in the world.
 *  - LIFECYCLE: idle chests rest still on the ground (facing a fixed
 *    direction, never rotating, no hover) inside their ritual circle.
 *    Opening: the handle flips (0.38s) → the lid swings back (0.67s) →
 *    the pooled gold coin-burst + loot fire the instant the lid rests
 *    open (THREE.Points, gravity + fade) → the chest REMAINS OPEN in the
 *    world (state 'open', zero per-frame work) with its treasure on
 *    display. Clicking an OPEN chest runs the cinematic in REVERSE —
 *    the lid swings shut (0.67s) → the hasp + padlock flip down and lock
 *    (0.38s) — leaving the chest CLOSED (state 'closed'): still solid,
 *    still clickable, and it re-opens on the next click WITHOUT paying
 *    out again (the session looted-set + a per-chest lootFired latch
 *    guarantee each chest pays exactly once per session). The session
 *    looted-set also guarantees a closed chest never respawns a duplicate
 *    after its region is pruned and rediscovered. Chests only ever open
 *    or close through `openAtRay` (page.tsx feeds it camera-through-cursor
 *    rays on click / tap).
 *  - COLLISION: `collide()` resolves the player capsule against every
 *    solid chest's axis-aligned footprint (chests never rotate, so the
 *    skirt rectangle is exact) using the same push-out idiom as the
 *    jeep — walking into a chest presses you against it instead of
 *    phasing through. A chest stays solid for its entire life — opened
 *    chests keep blocking too, since they remain standing in the world.
 *  - `update(dt, px, py, pz, active)` drives the ambient animation;
 *    `active=false` (lobby / death) is accepted for interface
 *    compatibility — opening is purely click-driven now.
 *  - `mapMarkers()` feeds the minimap: cached array of live, unopened
 *    chests (world xz + rarity), rebuilt only when the chest set changes.
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createChestPbr } from '@/game/chestPbr';
import { createTreasurePbr } from '@/game/treasurePbr';
import { createLootRitual } from '@/game/lootRitual';

/* ---------------- tuning ---------------- */
const REGION_CELLS = 24; // height-grid cells per chest region
const KEEP_REGIONS = 2; // Chebyshev region distance kept around the player
const MAX_CHESTS_PER_REGION = 3; // lowSpec drops this by one
const MIN_CELL_SPACING = 4; // Chebyshev grid distance between chests
const EMPTY_REGION_CHANCE = 0.3; // fraction of regions with no chests
const RARE_CHANCE = 0.22; // fraction of chests that are rare (gold + gems)

/* --- unlock cinematic (seconds per stage) --- */
const LATCH_T = 0.38; // hasp + padlock flip-up
const LID_T = 0.67; // domed lid swings back on its hinges
const LATCH_ANGLE = -1.35; // hasp rest-open angle (rad, flipped up/out)
const LID_ANGLE = -1.9; // lid rest-open angle (rad, back on the hinges)

/* --- interaction --- */
const INTERACT_RADIUS = 320; // click/tap opens only within this range

/** One chest's reward bundle, fired through onLoot at open time. */
export interface LootEvent {
  x: number;
  y: number;
  z: number;
  rare: boolean;
  coins: number;
  gems: number;
}

/** Marker for the minimap: a live, unopened chest. */
export interface ChestMarker {
  x: number;
  z: number;
  rare: boolean;
}

export interface LootChestsOptions {
  /** World units per voxel block edge (100). */
  block: number;
  /** Grid origin offset — world x = (gx - gridOffset) * block. */
  gridOffset: number;
  /** Deterministic integer block height at grid coordinates. */
  heightAt(gx: number, gz: number): number;
  /** Per-session terrain seed — desynchronises chest layouts per session. */
  seedZ: number;
  /** Mobile LOW tier: fewer chests + smaller coin burst. */
  lowSpec?: boolean;
  /** Optional blocklist for chest cells (grid coords) — lets callers keep
   *  loot off special ground (water, plazas, …). */
  blockedAt?(gx: number, gz: number): boolean;
  /** Called when a chest opens — page.tsx banks coins/gems + toasts + SFX. */
  onLoot?(loot: LootEvent): void;
}

export interface LootChestsHandle {
  /** Advance animations, discover/prune regions. `active` is kept for
   *  interface compatibility — opening is click-driven via openAtRay. */
  update(dt: number, px: number, py: number, pz: number, active: boolean): void;
  /** Live unopened chests for the minimap (cached, rebuilt on change). */
  mapMarkers(): ChestMarker[];
  /** Live + session-opened counts (debug handle). */
  stats(): { live: number; opened: number };
  /** Nearest unopened chest to a world xz point (debug helper). */
  nearest(x: number, z: number): (ChestMarker & { y: number }) | null;
  /** Push a circle (the player) out of every solid chest footprint.
   *  Returns the corrected position, or null when nothing was touched.
   *  `py` optionally skips chests entirely below the query height. */
  collide(
    px: number,
    pz: number,
    radius: number,
    py?: number
  ): { x: number; z: number } | null;
  /** True when the ray hits a live chest within interact range. */
  chestHit(raycaster: THREE.Raycaster, px: number, pz: number): boolean;
  /** Clicks a chest under the ray: an idle (virgin) or closed chest runs
   *  the unlock cinematic (handle flip → lid swing → loot on first open),
   *  an OPEN chest runs it in reverse (lid shut → hasp locks). Returns
   *  'opened' when a chest started opening (the chest-open sfx rides
   *  this) or 'closed' when one started closing, null on no hit. */
  openAtRay(
    raycaster: THREE.Raycaster,
    px: number,
    pz: number
  ): 'opened' | 'closed' | null;
  dispose(): void;
}

interface Chest {
  key: string;
  x: number;
  y: number; // resting base y (terrain top face)
  z: number;
  rare: boolean;
  reward: { coins: number; gems: number };
  group: THREE.Group;
  lidPivot: THREE.Group; // hinge line at the body's back-top edge
  latchPivot: THREE.Group; // hasp/padlock hang point at the lid front
  vfx: THREE.Group | null; // ritual circle added to the scene (not the group)
  state: 'idle' | 'opening' | 'open' | 'closing' | 'closed';
  t: number; // open/close animation clock (seconds since click)
  lootFired: boolean; // burst + onLoot fire once — set true up-front on
  // re-opens of an already-looted chest so the payout can never repeat
  solid: boolean; // collision active for the chest's whole life
  phase: number; // legacy stream-compat roll — kept so the placement RNG
  // stream (and therefore chest layouts) stays identical
}

interface Burst {
  points: THREE.Points;
  vel: Float32Array;
  mat: THREE.PointsMaterial;
  t: number;
}

/** Small deterministic PRNG (mulberry32) so regions replay identically. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable integer hash of two region coordinates (+ session salt). */
function hashRegion(rx: number, rz: number, salt: number): number {
  const sx = (rx ^ salt) | 0;
  const sz = (rz + salt) | 0;
  let h = (sx * 374761393 + sz * 668265263) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Smooth 0..1 easing curves for the unlock cinematic. */
function easeOutCubic(u: number): number {
  return 1 - Math.pow(1 - u, 3);
}
function easeInOutCubic(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

export function createLootChests(
  scene: THREE.Scene,
  options: LootChestsOptions
): LootChestsHandle {
  const block = options.block;
  const gridOffset = options.gridOffset;
  const heightAt = options.heightAt;
  const maxPerRegion = options.lowSpec ? MAX_CHESTS_PER_REGION - 1 : MAX_CHESTS_PER_REGION;
  const burstCount = options.lowSpec ? 8 : 14;

  // ---------------- shared chest materials/geometry ----------------
  // PBR kit: photorealistic wood + gold + ornate maps (shared by every
  // chest in the world, disposed with the system) plus the ultradetail
  // procedural treasure kit (coin/ingot/gem materials) for the heaps
  // revealed inside opened chests.
  const pbr = createChestPbr();
  const tpbr = createTreasurePbr();
  // golden summoning-circle lighting VFX standing under every chest
  // (see lootRitual.ts) — shader-driven, zero per-frame CPU per chest
  const ritual = createLootRitual(options.lowSpec ?? false);
  /** Overall size multiplier — the finished chest renders at double its
   *  previous footprint (was 1.15). */
  const CHEST_SCALE = 2.3;

  /** Coin-face sprite for the loot burst (shared, alpha-cutout). */
  function createCoinTexture(): THREE.CanvasTexture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // shaded gold disc: bright face, dark rim, embossed ring, highlight
      const disc = ctx.createRadialGradient(30, 28, 3, 32, 32, 27);
      disc.addColorStop(0, '#fff7cf');
      disc.addColorStop(0.45, '#ffd75e');
      disc.addColorStop(0.82, '#e0a92e');
      disc.addColorStop(1, '#8a5a10');
      ctx.beginPath();
      ctx.arc(32, 32, 27, 0, Math.PI * 2);
      ctx.fillStyle = disc;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#6b4306';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(32, 32, 19, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(122,77,6,0.75)';
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(25, 22, 7, 5, -0.7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,252,225,0.75)';
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const coinTexture = createCoinTexture();

  /** World units covered by one full texture tile. Kept at half the old
   *  values so the wood/gold grain keeps its real-world size now that the
   *  chest itself renders at double scale (UVs live on the base geometry). */
  const WOOD_TILE = 20;
  const GOLD_TILE = 21;

  /**
   * Scales a BoxGeometry's UVs so each face tiles the material map at a
   * consistent world size (BoxGeometry face vertex order is +X,-X,+Y,-Y,
   * +Z,-Z with 4 verts per face).
   */
  function boxUV(
    geo: THREE.BufferGeometry,
    w: number,
    h: number,
    d: number,
    world: number
  ): void {
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const dims: Array<[number, number]> = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ];
    for (let f = 0; f < 6; f++) {
      const [su, sv] = dims[f];
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, uv.getX(i) * (su / world), uv.getY(i) * (sv / world));
      }
    }
  }

  /** Uniform UV scale (used for the domed lid). */
  function scaleUV(geo: THREE.BufferGeometry, su: number, sv: number): void {
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }

  /** Adds one textured box to a material bucket (shared by the chest
   *  builders and the treasure builder). */
  function pushBox(
    bucket: THREE.BufferGeometry[],
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    world: number
  ): void {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(x, y, z);
    if (world > 0) boxUV(geo, w, h, d, world);
    bucket.push(geo);
  }

  /** One animated chest section: merged geometry + its material array. */
  interface ChestPartKit {
    geo: THREE.BufferGeometry;
    mats: THREE.Material[];
  }

  /** Merges named geometry buckets (in fixed material order) into one
   *  draw-grouped geometry paired with a matching material array. */
  function mergePart(
    groups: Array<[THREE.BufferGeometry[], THREE.Material]>
  ): ChestPartKit {
    const parts: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];
    for (const [geos, mat] of groups) {
      if (!geos.length) continue;
      const mergedBucket = BufferGeometryUtils.mergeGeometries(geos);
      for (const g of geos) g.dispose();
      if (mergedBucket) {
        parts.push(mergedBucket);
        mats.push(mat);
      }
    }
    const geo = BufferGeometryUtils.mergeGeometries(parts, true);
    for (const p of parts) p.dispose();
    return { geo: geo ?? new THREE.BufferGeometry(), mats };
  }

  /** Hinge/hang points (geometry units; the group carries CHEST_SCALE). */
  const LID_PIVOT_Y = 26; // body top seam
  const LID_PIVOT_Z = -16.2; // back face
  const LATCH_PIVOT_Y = 34.5; // hasp top edge
  const LATCH_PIVOT_Z = 18; // just proud of the front face

  /**
   * Builds one ultrarealistic treasure chest as THREE merged geometries —
   * BODY (static), LID (pivoted at the back hinge line) and LATCH
   * (pivoted at the hasp's top edge) — each with per-bucket draw groups
   * (base sits on y=0, sized for the 100-unit block world): dark-oak
   * carcass with a hollow gilded interior + domed plank lid with arched
   * metal straps, hammered-gold fittings (lock plate, corner brackets,
   * lid trim, base skirt, hasp, padlock) studded with rivets, a carved
   * skull-and-crossbones front panel, dark-iron hinges — rare chests
   * additionally wear full gold banding, a ridge cap and the ornate
   * gilded front plate.
   */
  function buildChestParts(rare: boolean): {
    body: ChestPartKit;
    lid: ChestPartKit;
    latch: ChestPartKit;
  } {
    // body buckets: wood / gold / ornate / carved / dark
    const bw: THREE.BufferGeometry[] = [];
    const bg: THREE.BufferGeometry[] = [];
    const bo: THREE.BufferGeometry[] = [];
    const bc: THREE.BufferGeometry[] = [];
    const bd: THREE.BufferGeometry[] = [];
    // lid buckets: wood / gold / dark
    const lw: THREE.BufferGeometry[] = [];
    const lg: THREE.BufferGeometry[] = [];
    const ld: THREE.BufferGeometry[] = [];
    // latch buckets: gold / dark
    const gg: THREE.BufferGeometry[] = [];
    const gd: THREE.BufferGeometry[] = [];

    function pushRivet(
      bucket: THREE.BufferGeometry[],
      x: number,
      y: number,
      z: number
    ) {
      const geo = new THREE.SphereGeometry(1.05, 6, 4);
      geo.translate(x, y, z);
      bucket.push(geo);
    }

    // --- wood carcass (BODY): four walls so the chest reads hollow when
    //     the lid swings open — the gold base skirt's top face doubles as
    //     the gilded floor of the interior
    pushBox(bw, 46, 26, 3, 0, 13, 15.5, WOOD_TILE); // front wall
    pushBox(bw, 46, 26, 3, 0, 13, -15.5, WOOD_TILE); // back wall
    pushBox(bw, 3, 26, 28, 21.5, 13, 0, WOOD_TILE); // right wall
    pushBox(bw, 3, 26, 28, -21.5, 13, 0, WOOD_TILE); // left wall

    // domed lid (LID): half cylinder r=17 x length 49, flat side down at
    // y=26, crest at y=43 — plank seams wrap front-to-back over the dome
    const dome = new THREE.CylinderGeometry(17, 17, 49, 22, 1, false, 0, Math.PI);
    dome.rotateZ(Math.PI / 2);
    dome.translate(0, 26, 0);
    scaleUV(dome, 1.35, 1.25);
    lw.push(dome);
    // plank underside board so the swung-open lid reads solid (the half
    // cylinder's chord side is open)
    pushBox(lw, 49, 1.6, 34, 0, 25.1, 0, WOOD_TILE);

    // --- carved skull front panel (both chests, subtle pirate relief) ---
    pushBox(bc, 22, 14, 1.2, 0, 12.5, 17.5, 0); // full texture per face

    // --- hammered-gold fittings (both chests) ---
    pushBox(bg, 9, 12, 5, 0, 26, 18, GOLD_TILE); // front lock plate
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pushBox(bg, 5, 28, 5, sx * 21.5, 14, sz * 15.5, GOLD_TILE); // corner brackets
      }
    }
    pushBox(lg, 50, 3, 2.5, 0, 26.6, 16.4, GOLD_TILE); // lid trim front
    pushBox(lg, 50, 3, 2.5, 0, 26.6, -16.4, GOLD_TILE); // lid trim back
    pushBox(lg, 2.5, 3, 34, 24.7, 26.6, 0, GOLD_TILE); // lid trim right
    pushBox(lg, 2.5, 3, 34, -24.7, 26.6, 0, GOLD_TILE); // lid trim left
    pushBox(bg, 52, 4, 40, 0, 2, 0, GOLD_TILE); // raised base skirt + interior floor

    // metal straps arcing over the dome, front-to-back (both chests)
    for (const sx of [-18, -6, 6, 18]) {
      const strap = new THREE.TorusGeometry(17.9, 1.1, 6, 14, Math.PI);
      strap.rotateY(Math.PI / 2);
      strap.translate(sx, 26, 0);
      scaleUV(strap, 1.3, 1);
      lg.push(strap);
    }

    // hasp + padlock (LATCH): the hasp hangs from the lid's front edge
    // and flips up around its top edge before the lid swings
    pushBox(gg, 4.5, 8, 2, 0, 30.5, 17.6, GOLD_TILE); // hasp over the seam
    const shackle = new THREE.TorusGeometry(2.2, 0.8, 6, 10, Math.PI);
    shackle.translate(0, 22.2, 21.6);
    gg.push(shackle);
    pushBox(gd, 5.5, 6, 2.4, 0, 19, 21.6, 1); // padlock body

    // --- dark-iron hardware ---
    pushBox(ld, 2.5, 6, 2.5, 15, 27.5, -16.2, 1); // hinge left (rides the lid)
    pushBox(ld, 2.5, 6, 2.5, -15, 27.5, -16.2, 1); // hinge right (rides the lid)
    pushBox(bd, 3.5, 6, 1, 0, 28.5, 21, 1); // keyhole escutcheon

    // rivet studs along the trims, skirt, brackets and strap crests
    for (const x of [-21, -14, -7, 0, 7, 14, 21]) {
      pushRivet(lg, x, 26.6, 17.7); // front lid trim
      pushRivet(bg, x, 2, 20.1); // base skirt
    }
    for (const sx of [-1, 1]) {
      for (const sy of [6, 14, 22]) {
        pushRivet(bg, sx * 24.4, sy, 15.5); // corner brackets
      }
    }
    for (const sx of [-18, -6, 6, 18]) {
      pushRivet(lg, sx, 44.8, 0); // strap crests
    }
    pushRivet(gg, 0, 19, 22.7); // padlock keyhole dot

    if (rare) {
      // full gold banding + ridge cap + gilded plate + stud rivets
      // (four plates per band so the hollow interior stays open)
      pushBox(bg, 50, 4, 2.5, 0, 23, 17.75, GOLD_TILE); // band front (under lid seam)
      pushBox(bg, 50, 4, 2.5, 0, 23, -17.75, GOLD_TILE); // band back
      pushBox(bg, 2.5, 4, 38, 23.75, 23, 0, GOLD_TILE); // band right
      pushBox(bg, 2.5, 4, 38, -23.75, 23, 0, GOLD_TILE); // band left
      pushBox(bg, 50, 4, 2.5, 0, 7.5, 17.75, GOLD_TILE); // band front (near base)
      pushBox(bg, 50, 4, 2.5, 0, 7.5, -17.75, GOLD_TILE); // band back
      pushBox(bg, 2.5, 4, 38, 23.75, 7.5, 0, GOLD_TILE); // band right
      pushBox(bg, 2.5, 4, 38, -23.75, 7.5, 0, GOLD_TILE); // band left
      pushBox(lg, 51, 2.2, 5, 0, 42.8, 0, GOLD_TILE); // ridge cap on the crest
      pushBox(bo, 14, 15, 1.6, 0, 24.5, 17.7, 30); // gilded front plate
      for (const sx of [-20, -10, 0, 10, 20]) {
        pushBox(bg, 1.8, 1.8, 1.8, sx, 23, 19.7, GOLD_TILE); // studs (top band)
        pushBox(bg, 1.8, 1.8, 1.8, sx, 7.5, 19.7, GOLD_TILE); // studs (base band)
      }
    }

    // rebase LID + LATCH geometry onto their pivots so a pivot-group
    // rotation swings them exactly around the hinge / hang points
    for (const g of [...lw, ...lg, ...ld]) {
      g.translate(0, -LID_PIVOT_Y, -LID_PIVOT_Z);
    }
    for (const g of [...gg, ...gd]) {
      g.translate(0, -LATCH_PIVOT_Y, -LATCH_PIVOT_Z);
    }

    return {
      body: mergePart([
        [bw, pbr.wood],
        [bg, pbr.gold],
        [bo, pbr.ornate],
        [bc, pbr.carved],
        [bd, pbr.dark],
      ]),
      lid: mergePart([
        [lw, pbr.wood],
        [lg, pbr.gold],
        [ld, pbr.dark],
      ]),
      latch: mergePart([
        [gg, pbr.gold],
        [gd, pbr.dark],
      ]),
    };
  }

  const idleParts = buildChestParts(false);
  const rareParts = buildChestParts(true);

  /* ---------------- heaped treasure inside the cavity ----------------
   * Cavity geometry (units): gilded floor y=4 (skirt top), inner walls
   * x±20 / z±14, closed-lid underside ≈ y=24 — every piece stays under
   * y=23 so a closed lid fully hides the hoard. Each coin is built as a
   * milled-edge cylinder + two struck-face caps (separate buckets) so
   * the reeded rim and the embossed mint face each get their own
   * ultradetail material. */
  const MOUND_TOP = 9; // shallow gilded mound the heaps sit on
  const COIN_R = 3.3;
  const COIN_T = 1.15;

  /**
   * Builds the treasure set revealed by the open lid — a shallow gilded
   * mound heaped with embossed coin stacks (struck faces + reeded
   * edges), tapered stamped gold-bar ingots and, in rare chests, cut
   * ruby/emerald/amethyst gems. One merged draw-grouped geometry per
   * rarity, shared by every chest in the world; the layout is seeded
   * deterministically so both variants replay identically every session.
   */
  function buildTreasure(rare: boolean): ChestPartKit {
    const mound: THREE.BufferGeometry[] = [];
    const cFace: THREE.BufferGeometry[] = [];
    const cSide: THREE.BufferGeometry[] = [];
    const bars: THREE.BufferGeometry[] = [];
    const gemR: THREE.BufferGeometry[] = [];
    const gemE: THREE.BufferGeometry[] = [];
    const gemP: THREE.BufferGeometry[] = [];
    const rng = mulberry32(rare ? 0x51c01a : 0xc01a51);

    /** One coin: reeded-edge side + struck face caps, posed + placed. */
    function pushCoin(x: number, y: number, z: number, ry: number, lean: number): void {
      const side = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_T, 14, 1, true);
      scaleUV(side, 6, 1); // tile the reed stripes around the rim
      const top = new THREE.CircleGeometry(COIN_R, 14);
      top.rotateX(-Math.PI / 2); // struck face up
      const bot = new THREE.CircleGeometry(COIN_R, 14);
      bot.rotateX(Math.PI / 2); // struck face down
      for (const p of [side, top, bot]) {
        p.rotateZ(lean); // tip onto its edge (leaning coins)
        p.rotateY(ry);
        p.translate(x, y, z);
      }
      cSide.push(side);
      cFace.push(top, bot);
    }

    /** A short stack of jittered coins, often with one leaning coin. */
    function pushStack(cx: number, cz: number, count: number): void {
      for (let i = 0; i < count; i++) {
        pushCoin(
          cx + (rng() - 0.5) * 0.7,
          MOUND_TOP + COIN_T / 2 + i * COIN_T,
          cz + (rng() - 0.5) * 0.7,
          rng() * Math.PI * 2,
          0
        );
      }
      if (rng() < 0.7) {
        // a coin resting against the stack's flank
        pushCoin(cx + 4.4, MOUND_TOP + COIN_R * 0.72, cz, rng() * 6.28, 1.3);
      }
    }

    /** Tapered + stamped gold-bar ingot (classic trapezoid prism). */
    function pushBar(x: number, y: number, z: number, ry: number): void {
      const bar = new THREE.BoxGeometry(9, 4.4, 5.6);
      boxUV(bar, 9, 4.4, 5.6, 11);
      const pos = bar.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0) {
          // ingot taper: the top face shrinks toward the center
          pos.setX(i, pos.getX(i) * 0.6);
          pos.setZ(i, pos.getZ(i) * 0.58);
        }
      }
      pos.needsUpdate = true;
      bar.computeVertexNormals();
      bar.rotateY(ry);
      bar.translate(x, y, z);
      bars.push(bar);
    }

    /** Cut gem: stretched octahedron with flat-shaded facets. */
    function pushGem(bucket: THREE.BufferGeometry[], x: number, z: number): void {
      // PolyhedronGeometry is non-indexed — weld it into an indexed
      // geometry so it merges with the indexed coin/ingot buckets (the
      // gem material is flat-shaded, so the facets stay crisp regardless
      // of the welded vertex normals).
      const gem = BufferGeometryUtils.mergeVertices(
        new THREE.OctahedronGeometry(1.9, 0)
      );
      gem.scale(1, 1.4, 1);
      gem.rotateY(rng() * Math.PI * 2);
      gem.translate(x, MOUND_TOP + 2.7, z);
      bucket.push(gem);
    }

    // shallow gilded mound (chest gold) the treasure heaps sit on
    pushBox(mound, 34, 5, 22, 0, MOUND_TOP - 2.5, 0, GOLD_TILE);

    // coin clusters spread across the mound
    const clusters = rare ? 4 : 3;
    for (let c = 0; c < clusters; c++) {
      const cx = -12 + (24 / Math.max(1, clusters - 1)) * c + (rng() - 0.5) * 3;
      const cz = -5 + rng() * 10;
      const stacks = 2 + ((rng() * 2) | 0);
      for (let s = 0; s < stacks; s++) {
        pushStack(cx + (rng() - 0.5) * 6, cz + (rng() - 0.5) * 5, 3 + ((rng() * 5) | 0));
      }
    }
    // loose single coins scattered between the stacks
    const loose = rare ? 8 : 6;
    for (let i = 0; i < loose; i++) {
      pushCoin(
        -15 + rng() * 30,
        MOUND_TOP + COIN_T / 2,
        -9 + rng() * 18,
        rng() * Math.PI * 2,
        0
      );
    }

    // gold bars — rare chests carry more, one stacked crosswise
    if (rare) {
      pushBar(-9, MOUND_TOP + 2.2, -5, 0.18);
      pushBar(-8.6, MOUND_TOP + 6.6, -4.7, 1.75); // stacked crosswise
      pushBar(9.5, MOUND_TOP + 2.2, 4, -0.4);
      pushBar(4, MOUND_TOP + 2.2, -8, 1.2);
    } else {
      pushBar(-8.5, MOUND_TOP + 2.2, -5.5, 0.35);
      pushBar(9, MOUND_TOP + 2.2, 4.5, -0.55);
    }

    // cut gems — rare chests only (they also pay gems when opened)
    if (rare) {
      const buckets = [gemR, gemE, gemP, gemR, gemE];
      for (const bucket of buckets) {
        pushGem(bucket, -14 + rng() * 28, -8 + rng() * 16);
      }
    }

    return mergePart([
      [mound, pbr.gold],
      [cFace, tpbr.coinFace],
      [cSide, tpbr.coinSide],
      [bars, tpbr.ingot],
      [gemR, tpbr.ruby],
      [gemE, tpbr.emerald],
      [gemP, tpbr.amethyst],
    ]);
  }

  const idleTreasure = buildTreasure(false);
  const rareTreasure = buildTreasure(true);

  /** Solid footprint (world units): the raised base skirt rectangle —
   *  the widest part of the chest, so this collider is exact. */
  const CHEST_HX = 26 * CHEST_SCALE;
  const CHEST_HZ = 20 * CHEST_SCALE;
  const CHEST_TOP = 45 * CHEST_SCALE; // strap-crest rivets

  // ---------------- region-based chest discovery ----------------
  const salt = Math.floor(options.seedZ * 1000) | 0;
  const liveRegions = new Map<string, Chest[]>();
  const looted = new Set<string>(); // session memory of opened chest keys
  const bursts: Burst[] = [];
  const stats = { opened: 0 };
  let markersCache: ChestMarker[] = [];
  let markersDirty = true;

  function regionKey(rx: number, rz: number): string {
    return rx + ',' + rz;
  }

  /** Samples up to maxPerRegion spaced chest sites for one region. */
  function discoverRegion(rx: number, rz: number): void {
    const key = regionKey(rx, rz);
    if (liveRegions.has(key)) return;

    const rng = mulberry32(hashRegion(rx, rz, salt));
    const chests: Chest[] = [];

    if (rng() >= EMPTY_REGION_CHANCE) {
      const baseX = rx * REGION_CELLS;
      const baseZ = rz * REGION_CELLS;

      // gently-flat cells (slope <= 1 on all four neighbours), never on
      // blocked ground
      const cells: number[] = [];
      for (let lz = 0; lz < REGION_CELLS; lz++) {
        for (let lx = 0; lx < REGION_CELLS; lx++) {
          const gx = baseX + lx;
          const gz = baseZ + lz;
          if (options.blockedAt?.(gx, gz)) continue;
          const h = heightAt(gx, gz);
          if (
            Math.abs(heightAt(gx + 1, gz) - h) <= 1 &&
            Math.abs(heightAt(gx - 1, gz) - h) <= 1 &&
            Math.abs(heightAt(gx, gz + 1) - h) <= 1 &&
            Math.abs(heightAt(gx, gz - 1) - h) <= 1
          ) {
            cells.push(gz * 65536 + gx);
          }
        }
      }

      // Fisher-Yates (region-seeded) over the candidate cells
      for (let i = cells.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const t = cells[i];
        cells[i] = cells[j];
        cells[j] = t;
      }

      const takenX: number[] = [];
      const takenZ: number[] = [];
      let index = 0;
      for (const cell of cells) {
        if (chests.length >= maxPerRegion) break;
        const gx = cell % 65536;
        const gz = (cell / 65536) | 0;
        const chestKey = key + ':' + index;
        index++;
        if (looted.has(chestKey)) continue; // opened earlier this session

        let crowded = false;
        for (let t = 0; t < takenX.length; t++) {
          if (
            Math.abs(takenX[t] - gx) <= MIN_CELL_SPACING &&
            Math.abs(takenZ[t] - gz) <= MIN_CELL_SPACING
          ) {
            crowded = true;
            break;
          }
        }
        if (crowded) continue;
        takenX.push(gx);
        takenZ.push(gz);

        const rare = rng() < RARE_CHANCE;
        const wx = (gx - gridOffset) * block;
        const wz = (gz - gridOffset) * block;
        const wy = heightAt(gx, gz) * block + block / 2;

        const reward = rare
          ? { coins: 70 + ((rng() * 60) | 0), gems: 1 + ((rng() * 2.99) | 0) }
          : { coins: 25 + ((rng() * 30) | 0), gems: 0 };
        // rolled AFTER the reward so the loot stream (and therefore every
        // chest's contents) stays byte-identical to the pre-VFX export
        const vfxSeed = rng();

        const kit = rare ? rareParts : idleParts;
        const treasureKit = rare ? rareTreasure : idleTreasure;

        // BODY — static carcass
        const bodyMesh = new THREE.Mesh(kit.body.geo, kit.body.mats);
        bodyMesh.castShadow = true;

        // TREASURE — heaped coins/bars/gems inside the hollow body
        // (hidden by the closed lid, revealed when it swings open)
        const treasureMesh = new THREE.Mesh(treasureKit.geo, treasureKit.mats);
        treasureMesh.castShadow = true;

        // LID — hung on the back hinge line
        const lidPivot = new THREE.Group();
        lidPivot.position.set(0, LID_PIVOT_Y, LID_PIVOT_Z);
        const lidMesh = new THREE.Mesh(kit.lid.geo, kit.lid.mats);
        lidMesh.castShadow = true;
        lidPivot.add(lidMesh);

        // LATCH — hasp + padlock hang from the lid's front edge
        const latchPivot = new THREE.Group();
        latchPivot.position.set(0, LATCH_PIVOT_Y, LATCH_PIVOT_Z);
        const latchMesh = new THREE.Mesh(kit.latch.geo, kit.latch.mats);
        latchMesh.castShadow = true;
        latchPivot.add(latchMesh);

        const group = new THREE.Group();
        group.add(bodyMesh, lidPivot, latchPivot, treasureMesh);
        group.position.set(wx, wy, wz);
        group.scale.setScalar(CHEST_SCALE);

        scene.add(group);

        // RITUAL CIRCLE — grounded lighting VFX around the chest, added to
        // the scene itself (not the chest group) so the rune rings stay
        // flat on the terrain while the chest rests inside the circle
        const vfx = ritual.attach(wx, wy + 1.2, wz, rare, vfxSeed);
        scene.add(vfx);

        chests.push({
          key: chestKey,
          x: wx,
          y: wy,
          z: wz,
          rare,
          reward,
          group,
          lidPivot,
          latchPivot,
          vfx,
          state: 'idle',
          t: 0,
          lootFired: false,
          solid: true,
          phase: rng() * Math.PI * 2,
          seed: 0.8 + rng() * 0.4,
        });
      }
    }

    liveRegions.set(key, chests);
    markersDirty = true;
  }

  // ---------------- coin burst ----------------
  function spawnBurst(chest: Chest): void {
    const positions = new Float32Array(burstCount * 3);
    const vel = new Float32Array(burstCount * 3);
    for (let i = 0; i < burstCount; i++) {
      positions[i * 3] = chest.x;
      positions[i * 3 + 1] = chest.y + 78; // open-lid mouth at double scale
      positions[i * 3 + 2] = chest.z;
      const a = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 130;
      vel[i * 3] = Math.cos(a) * speed * 0.6;
      vel[i * 3 + 1] = 220 + Math.random() * 260;
      vel[i * 3 + 2] = Math.sin(a) * speed * 0.6;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      map: coinTexture,
      color: 0xffffff,
      size: 52, // coins doubled to match the bigger chest
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      alphaTest: 0.08,
    });
    const points = new THREE.Points(geometry, mat);
    points.frustumCulled = false;
    scene.add(points);
    bursts.push({ points, vel, mat, t: 0 });
  }

  function updateBursts(dt: number): void {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.t += dt;
      const attr = b.points.geometry.attributes
        .position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let p = 0; p < burstCount; p++) {
        b.vel[p * 3 + 1] -= 900 * dt; // gravity
        arr[p * 3] += b.vel[p * 3] * dt;
        arr[p * 3 + 1] += b.vel[p * 3 + 1] * dt;
        arr[p * 3 + 2] += b.vel[p * 3 + 2] * dt;
      }
      attr.needsUpdate = true;
      b.mat.opacity = Math.max(0, 1 - b.t / 0.75);
      if (b.t >= 0.78) {
        scene.remove(b.points);
        b.points.geometry.dispose();
        b.mat.dispose();
        bursts.splice(i, 1);
      }
    }
  }

  // ---------------- open + close + despawn ----------------
  /** Marks a VIRGIN chest as opening (first click). The loot fires later,
   *  the moment the lid rests open — see the opening branch of update(). */
  function startOpen(chest: Chest): void {
    looted.add(chest.key);
    stats.opened++;
    beginOpening(chest, false);
    markersDirty = true;
  }

  /** Shared opening kickoff. Re-opens of an already-looted chest pass
   *  `silent=true`, which pre-sets lootFired so the payout never repeats. */
  function beginOpening(chest: Chest, silent: boolean): void {
    chest.state = 'opening';
    chest.t = 0;
    chest.lootFired = silent;
  }

  /** Re-opens a CLOSED chest: same cinematic, zero payout. */
  function startReopen(chest: Chest): void {
    beginOpening(chest, true);
  }

  /** Starts the closing cinematic on an OPEN chest (second click): the
   *  lid swings shut, then the hasp + padlock flip down and lock. */
  function startClose(chest: Chest): void {
    chest.state = 'closing';
    chest.t = 0;
  }

  function fireLoot(chest: Chest): void {
    spawnBurst(chest);
    options.onLoot?.({
      x: chest.x,
      y: chest.y,
      z: chest.z,
      rare: chest.rare,
      coins: chest.reward.coins,
      gems: chest.reward.gems,
    });
  }

  function removeChest(chest: Chest): void {
    scene.remove(chest.group);
    chest.group.clear();
    // the ritual circle lives in the scene too — remove + free its
    // per-chest geometries (shared VFX materials survive pruning)
    if (chest.vfx) {
      scene.remove(chest.vfx);
      ritual.release(chest.vfx);
      chest.vfx = null;
    }
  }

  // ---------------- cursor interaction ----------------
  /** Finds the chest under a camera ray (if any) within interact range. */
  function raycastChest(
    raycaster: THREE.Raycaster,
    px: number,
    pz: number
  ): Chest | null {
    const r2 = INTERACT_RADIUS * INTERACT_RADIUS;
    for (const chests of liveRegions.values()) {
      for (const chest of chests) {
        // 'idle' = virgin (loot pending); 'open' = looted, lid resting
        // back; 'closed' = looted, resting shut — ALL THREE are clickable
        // (an open chest runs the close cinematic on click). Only
        // 'opening'/'closing' chests (mid-cinematic) ignore clicks.
        if (chest.state === 'opening' || chest.state === 'closing') continue;
        const dx = chest.x - px;
        const dz = chest.z - pz;
        if (dx * dx + dz * dz > r2) continue;
        if (raycaster.intersectObject(chest.group, true).length > 0) {
          return chest;
        }
      }
    }
    return null;
  }

  // ---------------- solid collision ----------------
  /** Pushes the player circle out of every solid chest footprint — the
   *  same resolve idiom as the jeep, but axis-aligned (chests never
   *  rotate, so the skirt rectangle IS the exact footprint). */
  function collideChests(
    px: number,
    pz: number,
    radius: number,
    py?: number
  ): { x: number; z: number } | null {
    let cx = px;
    let cz = pz;
    let hit = false;
    for (const chests of liveRegions.values()) {
      for (const chest of chests) {
        if (!chest.solid) continue;
        if (py !== undefined && py > chest.y + CHEST_TOP) continue;
        const mdx = CHEST_HX + radius;
        const mdz = CHEST_HZ + radius;
        const dx = cx - chest.x;
        const dz = cz - chest.z;
        if (dx * dx > mdx * mdx || dz * dz > mdz * mdz) continue;
        // closest point on the footprint rectangle
        const qx = Math.max(chest.x - CHEST_HX, Math.min(chest.x + CHEST_HX, cx));
        const qz = Math.max(chest.z - CHEST_HZ, Math.min(chest.z + CHEST_HZ, cz));
        const ox = cx - qx;
        const oz = cz - qz;
        const d2 = ox * ox + oz * oz;
        if (d2 > radius * radius) continue;
        hit = true;
        if (d2 > 1e-6) {
          // outside the rectangle but within radius: push out along the normal
          const d = Math.sqrt(d2);
          const push = (radius - d) / d;
          cx += ox * push;
          cz += oz * push;
        } else {
          // center inside the footprint: exit along the shallowest axis
          const penX = CHEST_HX - Math.abs(cx - chest.x) + radius;
          const penZ = CHEST_HZ - Math.abs(cz - chest.z) + radius;
          if (penX < penZ) {
            cx = chest.x + (cx >= chest.x ? CHEST_HX + radius : -CHEST_HX - radius);
          } else {
            cz = chest.z + (cz >= chest.z ? CHEST_HZ + radius : -CHEST_HZ - radius);
          }
        }
      }
    }
    return hit ? { x: cx, z: cz } : null;
  }

  // ---------------- per-frame update ----------------
  let lastRegionX = NaN;
  let lastRegionZ = NaN;
  let time = 0;

  function update(
    dt: number,
    px: number,
    py: number,
    pz: number,
    active: boolean
  ): void {
    void active; // opening is click-driven now; kept for interface compat
    time += dt;
    // one shared shader clock drives every chest's ritual circle
    ritual.setTime(time);

    // --- region discovery / pruning around the player ---
    const cgx = Math.round(px / block) + gridOffset;
    const cgz = Math.round(pz / block) + gridOffset;
    const prx = Math.floor(cgx / REGION_CELLS);
    const prz = Math.floor(cgz / REGION_CELLS);
    if (prx !== lastRegionX || prz !== lastRegionZ) {
      lastRegionX = prx;
      lastRegionZ = prz;
      let changed = false;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!liveRegions.has(regionKey(prx + dx, prz + dz))) {
            discoverRegion(prx + dx, prz + dz);
            changed = true;
          }
        }
      }
      for (const key of [...liveRegions.keys()]) {
        const sep = key.indexOf(',');
        const krx = Number(key.slice(0, sep));
        const krz = Number(key.slice(sep + 1));
        if (Math.max(Math.abs(krx - prx), Math.abs(krz - prz)) > KEEP_REGIONS) {
          // detach every chest in the pruned region — idle ones grow back
          // on rediscovery, opened ones don't (session looted-set)
          for (const chest of liveRegions.get(key) ?? []) {
            removeChest(chest);
          }
          liveRegions.delete(key);
          changed = true;
        }
      }
      if (changed) markersDirty = true;
    }

    // --- per-chest animation ---
    for (const chests of liveRegions.values()) {
      for (const chest of chests) {
        if (chest.state === 'opening') {
          // opening: lock flip → lid swing → loot → rests open
          chest.t += dt;
          const t = chest.t;
          if (t < LATCH_T) {
            // stage 1: hasp + padlock flip up and out
            chest.latchPivot.rotation.x =
              LATCH_ANGLE * easeOutCubic(t / LATCH_T);
          } else if (t < LATCH_T + LID_T) {
            // stage 2: the domed lid swings back on its hinges
            chest.latchPivot.rotation.x = LATCH_ANGLE;
            chest.lidPivot.rotation.x =
              LID_ANGLE * easeInOutCubic((t - LATCH_T) / LID_T);
          } else {
            // lid rests open — fire the loot once and REMAIN open: no
            // sink, no despawn. The chest becomes a landmark with its
            // treasure on display (state 'open' = zero work).
            chest.lidPivot.rotation.x = LID_ANGLE;
            if (!chest.lootFired) {
              chest.lootFired = true;
              fireLoot(chest);
            }
            chest.state = 'open';
          }
        } else if (chest.state === 'closing') {
          // closing (second click): the exact cinematic in reverse —
          // lid swings shut first, then the lock flips back down
          chest.t += dt;
          const t = chest.t;
          if (t < LID_T) {
            // stage 1: the domed lid swings forward and shuts
            chest.latchPivot.rotation.x = LATCH_ANGLE;
            chest.lidPivot.rotation.x =
              LID_ANGLE * (1 - easeInOutCubic(t / LID_T));
          } else if (t < LID_T + LATCH_T) {
            // stage 2: hasp + padlock flip back down and lock
            chest.lidPivot.rotation.x = 0;
            chest.latchPivot.rotation.x =
              LATCH_ANGLE * (1 - easeOutCubic((t - LID_T) / LATCH_T));
          } else {
            // fully shut: rests CLOSED — still solid, still clickable,
            // re-opens on the next click (payout already collected)
            chest.lidPivot.rotation.x = 0;
            chest.latchPivot.rotation.x = 0;
            chest.state = 'closed';
          }
        }
        // states 'idle', 'open' and 'closed': the chest rests still on
        // the ground — no hover, no beacon, zero per-frame animation
      }
    }

    updateBursts(dt);

    // --- rebuild the minimap cache when the live set changed ---
    if (markersDirty) {
      markersDirty = false;
      const markers: ChestMarker[] = [];
      for (const chests of liveRegions.values()) {
        for (const chest of chests) {
          if (chest.state === 'idle') {
            markers.push({ x: chest.x, z: chest.z, rare: chest.rare });
          }
        }
      }
      markersCache = markers;
    }
  }

  // ---------------- public API ----------------
  function mapMarkers(): ChestMarker[] {
    return markersCache;
  }

  function statsSnapshot(): { live: number; opened: number } {
    let live = 0;
    for (const chests of liveRegions.values()) {
      for (const chest of chests) if (chest.state === 'idle') live++;
    }
    return { live, opened: stats.opened };
  }

  function nearest(x: number, z: number): (ChestMarker & { y: number }) | null {
    let best: (ChestMarker & { y: number }) | null = null;
    let bestD = Infinity;
    for (const chests of liveRegions.values()) {
      for (const chest of chests) {
        if (chest.state !== 'idle') continue;
        const d = (chest.x - x) * (chest.x - x) + (chest.z - z) * (chest.z - z);
        if (d < bestD) {
          bestD = d;
          best = { x: chest.x, y: chest.y, z: chest.z, rare: chest.rare };
        }
      }
    }
    return best;
  }

  function dispose(): void {
    for (const chests of liveRegions.values()) {
      for (const chest of chests) {
        scene.remove(chest.group);
        if (chest.vfx) {
          scene.remove(chest.vfx);
          ritual.release(chest.vfx);
        }
      }
    }
    liveRegions.clear();
    for (const b of bursts) {
      scene.remove(b.points);
      b.points.geometry.dispose();
      b.mat.dispose();
    }
    bursts.length = 0;
    idleParts.body.geo.dispose();
    idleParts.lid.geo.dispose();
    idleParts.latch.geo.dispose();
    rareParts.body.geo.dispose();
    rareParts.lid.geo.dispose();
    rareParts.latch.geo.dispose();
    idleTreasure.geo.dispose();
    rareTreasure.geo.dispose();
    pbr.dispose();
    tpbr.dispose();
    coinTexture.dispose();
    ritual.dispose();
    looted.clear();
    markersCache = [];
  }

  return {
    update,
    mapMarkers,
    stats: statsSnapshot,
    nearest,
    collide: collideChests,
    chestHit: (raycaster, px, pz) => raycastChest(raycaster, px, pz) !== null,
    openAtRay: (raycaster, px, pz) => {
      const chest = raycastChest(raycaster, px, pz);
      if (!chest) return null;
      if (chest.state === 'open') {
        startClose(chest);
        return 'closed';
      }
      if (chest.state === 'closed') {
        startReopen(chest);
        return 'opened';
      }
      startOpen(chest);
      return 'opened';
    },
    dispose,
  };
}
