/**
 * Four TEMPERATE wild biomes for the RATFIRE world — the gentle family that
 * extends the roster past the harsh climates (winter countries, the dune
 * seas, the badlands and the volcanoes):
 *
 *  - CHERRY GROVE     — pink blossom grassland under soft rolling hills
 *  - MUSHROOM FIELDS  — pale mycelium ground lumpy with small hillocks
 *  - CRIMSON FIELDS   — red-recoloured grassland with long ground swells
 *  - GOLDEN FIELDS    — yellow-recoloured grassland kept exactly as flat
 *                       and plain as the grassland heartland itself (its
 *                       sky is the plain GRASSLAND vault — no tint)
 *
 * Everything here is PURE MATH and 100% DETERMINISTIC — no THREE, no DOM —
 * exactly like the winter/desert/extra modules, so terrain meshes, the
 * minimap, the sky driver and the 3D zone-sign all agree on where every
 * biome begins and ends:
 *
 *  - HAND ZONES are fixed circles in GRID-block space (world x =
 *    (gx - gridOffset) * block, spawn at grid (64,64)). They share one
 *    far ring (1459 blocks — beyond the volcano ring at 1280) on the
 *    half-compass bearings and diagonals: cherry owns 22.5/112.5/202.5/
 *    292.5, mushroom owns 67.5/157.5/247.5/337.5, and crimson owns the
 *    four open 45° diagonals (45/135/225/315 — open green grass since
 *    the swampland's removal). Every
 *    centre was validated against the worst-case
 *    jittered reach of every OTHER biome's hand zones (radius * 1.16 +
 *    9) — the only pairwise overlaps left in the world are the
 *    pre-existing winter/desert ones the terrain priority already
 *    resolves.
 *  - cherryFactor / shroomFactor / goldenFactor -> 0..1 rise inside a
 *    zone's soft border ring and saturate at the core, with the same
 *    3-block value-noise wobble on the border line as every other biome.
 *  - NATURAL countries: the same 640-block climate-cell dice (own salts,
 *    lower hit chance than winter/desert so green grass stays the common
 *    ground), one full-size country per hit. A cell is rejected if the
 *    country's jittered reach would cross ANY hand zone of ANY biome —
 *    every showcase circle stays whole everywhere.
 *  - *FactorWorld wrappers are the world-space forms for per-frame
 *    callers (sky tint, weather gating, zone sign) — cheap, no allocs.
 */

import { WINTER_ZONES, registerProtectedZone, reachesProtectedZone } from './winterBiomes';
import { DESERT_ZONES } from './desertBiomes';
import { RED_ZONES, MESA_ZONES, VOLCANO_ZONES } from './extraBiomes';
import { CITY_GRID, cityEdgeT } from './cityLayout';

/** One wild climate region: circle in grid-block space, soft border. */
export interface WildZone {
  /** Zone centre, grid-block coordinates. */
  cx: number;
  cz: number;
  /** Outer radius in blocks — beyond this the land is normal grass. */
  radius: number;
  /** Core radius in blocks — inside this the biome is deepest. */
  core: number;
}

/* ---------------- hand-placed showcase zones ---------------- */

/** CHERRY GROVE countries — pink blossom meadows on rolling hills.
 *  Far ring 1459 on the 22.5°/112.5°/202.5°/292.5° bearings (doubled). */
export const CHERRY_ZONES: WildZone[] = [
  { cx: 1412, cz: 622, radius: 188, core: 168 },   // NNE, world ~(134800, 55800)
  { cx: -494, cz: 1412, radius: 188, core: 168 },  // WNW, world ~(-55800, 134800)
  { cx: -1284, cz: -494, radius: 188, core: 168 }, // SSW, world ~(-134800, -55800)
  { cx: 622, cz: -1284, radius: 188, core: 168 },  // ESE, world ~(55800, -134800)
];

/** MUSHROOM FIELD countries — pale mycelium moorland.
 *  Far ring 1459 on the 67.5°/157.5°/247.5°/337.5° bearings (doubled). */
export const SHROOM_ZONES: WildZone[] = [
  { cx: 622, cz: 1412, radius: 188, core: 168 },   // ENE, world ~(55800, 134800)
  { cx: -1284, cz: 622, radius: 188, core: 168 },  // WSW, world ~(-134800, 55800)
  { cx: -494, cz: -1284, radius: 188, core: 168 }, // SSE, world ~(-55800, -134800)
  { cx: 1412, cz: -494, radius: 188, core: 168 },  // ESE deep, world ~(134800, -55800)
];

/** CRIMSON FIELD countries — the red-themed grassland.
 *  Far ring on the four open 45° diagonals (45/135/225/315), DOUBLED
 *  from ±576/±576: the centres now sit at ±1088/±1216 (2x out from
 *  spawn along the original bearings). Every neighbouring showcase
 *  circle was re-checked at worst-case reach (radius * 1.16 + 9): the
 *  closest neighbour pair (crimson <-> cherry/shroom) still leaves
 *  ~96 blocks of green between the two jittered borders. */
export const CRIMSON_ZONES: WildZone[] = [
  { cx: 1088, cz: 1088, radius: 188, core: 168 },  // NE diagonal, world ~(102400, 102400)
  { cx: -1216, cz: 1088, radius: 188, core: 168 }, // NW, world ~(-128000, 102400)
  { cx: -1216, cz: -1216, radius: 188, core: 168 },// SW, world ~(-128000, -128000)
  { cx: 1088, cz: -1216, radius: 188, core: 168 }, // SE, world ~(102400, -128000)
];

/** GOLDEN FIELD countries — the yellow-themed grassland. The FOUR
 *  CARDINAL bearings were the last full-size slots on the 16-wind far
 *  ring, but the VOLCANO cones already own them at ring ~1216-1344 —
 *  so the golden circles sit one ring FARTHER OUT (ring ~1900, straight
 *  beyond each volcano along the same bearing). Same full showcase size
 *  as the rest of the wild family (radius 188 / core 168). Every centre
 *  was re-validated at worst-case reach (radius * 1.16 + 9 = 227): the
 *  tightest neighbour pair (golden <-> volcano, 620 blocks centre to
 *  centre) still leaves ~143 blocks of green past both jittered
 *  borders; the wild trio circles all sit ~785+ away (need 454). */
export const GOLDEN_ZONES: WildZone[] = [
  { cx: 1964, cz: 64, radius: 188, core: 168 },   // beyond volcano E, world ~(190000, 0)
  { cx: 64, cz: 1964, radius: 188, core: 168 },   // beyond volcano N, world ~(0, 190000)
  { cx: -1836, cz: 64, radius: 188, core: 168 },  // beyond volcano W, world ~(-190000, 0)
  { cx: 64, cz: -1856, radius: 188, core: 168 },  // beyond volcano S, world ~(0, -192000)
];

/** Width of the soft biome-line ring (blocks) — identical to every other
 *  biome so all climates feather alike. */
const BORDER = 9;

// Protect all sixteen showcase circles from natural snow countries (the
// winter generator rejects climate cells whose snow would reach them).
// Natural desert/extra countries keep their existing (looser) avoidance —
// the terrain bucket priority settles any rare far-field overlap.
for (const z of [
  ...CHERRY_ZONES,
  ...SHROOM_ZONES,
  ...CRIMSON_ZONES,
  ...GOLDEN_ZONES,
]) {
  registerProtectedZone(z.cx, z.cz, z.radius);
}

// THE CITY GRASSLAND DECREE: the giant road-map plateau is plain
// grassland — no natural country of ANY biome (snow, dune, red, mesa,
// volcano or the wild trio) may roll across it. One protected circle
// covering the whole rect (half-diagonal + margin) rejects every
// would-be country whose jittered reach could touch the city, which
// also keeps spiders and mushroom Bups (the biome-gated mobs) from
// ever materialising on the roads. Hand zones are unaffected — the
// cherry-ESE showcase south of the city stays exactly where it is.
registerProtectedZone(
  (CITY_GRID.gx0 + CITY_GRID.gx1) / 2,
  (CITY_GRID.gz0 + CITY_GRID.gz1) / 2,
  Math.sqrt(
    ((CITY_GRID.gx1 - CITY_GRID.gx0) / 2) ** 2 +
      ((CITY_GRID.gz1 - CITY_GRID.gz0) / 2) ** 2
  ) + 3
);

/* ---------------- deterministic border jitter ---------------- */
// mirrored from winterBiomes.ts / desertBiomes.ts / extraBiomes.ts (own
// salts below keep every biome's border line wandering independently)

/** Cheap deterministic 2D hash -> 0..1 (integer-safe, no allocations). */
function hash2(ix: number, iz: number, salt: number): number {
  let h = (ix * 374761393 + iz * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

/** Smooth-ish value noise sampled on a 3-block lattice — the organic
 *  3-block-scale border wander every biome's edge shares. */
function borderNoise(gx: number, gz: number, salt: number): number {
  const x = gx / 3;
  const z = gz / 3;
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const n00 = hash2(x0, z0, salt);
  const n10 = hash2(x0 + 1, z0, salt);
  const n01 = hash2(x0, z0 + 1, salt);
  const n11 = hash2(x0 + 1, z0 + 1, salt);
  return (
    (n00 + (n10 - n00) * sx) * (1 - sz) +
    (n01 + (n11 - n01) * sx) * sz
  );
}

/** Amplitude of the border wobble, as a fraction of the zone radius. */
const JITTER = 0.16;

/* ---------- natural big countries (auto generator) ---------- */

/** Same climate-cell lattice as winter/desert/extra — the wild
 *  biomes roll their own dice with their own salts, at lower chances
 *  than the harsh climates so green grass stays the common ground and
 *  wild countries read as gentle surprises, not wall-to-wall carpet. */
const CLIMATE_CELL = 640;
const CHERRY_CHANCE = 0.4;
const SHROOM_CHANCE = 0.38;
const CRIMSON_CHANCE = 0.36;
const GOLDEN_CHANCE = 0.35;
/** Natural countries never encroach on the spawn plaza (same rule as
 *  winter and desert keep). */
const SPAWN_SAFE_DIST = 340;

/** Every hand-placed circle of ALL biomes. Natural countries of the
 *  wild biomes keep their jittered reach clear of every one of them, so
 *  each showcase zone stays whole no matter what the dice roll. */
const HAND_ZONES: WildZone[] = [
  ...WINTER_ZONES,
  ...DESERT_ZONES,
  ...RED_ZONES,
  ...MESA_ZONES,
  ...VOLCANO_ZONES,
  ...CHERRY_ZONES,
  ...SHROOM_ZONES,
  ...CRIMSON_ZONES,
  ...GOLDEN_ZONES,
];

/** Worst-case jittered reach of a zone (the desert module's standard). */
function zoneReach(radius: number): number {
  return radius * 1.16 + BORDER;
}

/** True if a would-be country at (cx, cz) with outer reach `reach` would
 *  cross any showcase circle's own worst-case reach — including every
 *  circle registered in the shared protected registry (queried live at
 *  roll time, so every biome's showcases are covered too). */
function reachesHandZone(cx: number, cz: number, reach: number): boolean {
  if (reachesProtectedZone(cx, cz, reach)) return true;
  for (let i = 0; i < HAND_ZONES.length; i++) {
    const z = HAND_ZONES[i];
    const dx = cx - z.cx;
    const dz = cz - z.cz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < reach + zoneReach(z.radius)) return true;
  }
  return false;
}

/** Scratch for the per-cell natural rolls (module-level keeps the
 *  per-block factor calls allocation-free). */
let natCx = 0;
let natCz = 0;
let natCore = 0;

/** Shared natural-country roll: dice on `chance` salt, jittered centre
 *  inside the climate cell, spawn-plaza safe, showcase-circle safe. */
function rollCountry(
  cellX: number,
  cellZ: number,
  chanceSalt: number,
  chance: number,
  xSalt: number,
  zSalt: number,
  coreSalt: number
): boolean {
  if (hash2(cellX, cellZ, chanceSalt) > chance) return false;
  const cx =
    cellX * CLIMATE_CELL + CLIMATE_CELL / 2 + (hash2(cellX, cellZ, xSalt) - 0.5) * 360;
  const cz =
    cellZ * CLIMATE_CELL + CLIMATE_CELL / 2 + (hash2(cellX, cellZ, zSalt) - 0.5) * 360;
  const dxs = cx - 64;
  const dzs = cz - 64;
  if (dxs * dxs + dzs * dzs < SPAWN_SAFE_DIST * SPAWN_SAFE_DIST) return false;
  const core = 160 + hash2(cellX, cellZ, coreSalt) * 56; // 160..216
  const reach = core + BORDER + JITTER * (core + 10);
  if (reachesHandZone(cx, cz, reach)) return false;
  natCx = cx;
  natCz = cz;
  natCore = core;
  return true;
}

/** Rolls the cherry-grove dice for a climate cell. */
function naturalCherryAt(cellX: number, cellZ: number): boolean {
  return rollCountry(cellX, cellZ, 81101, CHERRY_CHANCE, 82111, 83187, 84199);
}

/** Rolls the mushroom-field dice for a climate cell. */
function naturalShroomAt(cellX: number, cellZ: number): boolean {
  return rollCountry(cellX, cellZ, 91103, SHROOM_CHANCE, 92113, 93191, 94197);
}

/** Rolls the crimson-field dice for a climate cell (own salt band, low
 *  chance — red stays a rare surprise). */
function naturalCrimsonAt(cellX: number, cellZ: number): boolean {
  return rollCountry(cellX, cellZ, 121103, CRIMSON_CHANCE, 122113, 123191, 124197);
}

/** Rolls the golden-field dice for a climate cell (own salt band, lowest
 *  chance of the wild four — the golden plains stay the rarest find). */
function naturalGoldenAt(cellX: number, cellZ: number): boolean {
  return rollCountry(cellX, cellZ, 131103, GOLDEN_CHANCE, 132113, 133191, 134197);
}

/** Shared per-block scan: hand circles + the 3x3 climate-cell neighbourhood
 *  rolled by `roll`, wobbled by `wobbleSalt`. Returns the max weight. */
function zoneWeight(
  gx: number,
  gz: number,
  zones: WildZone[],
  roll: (cellX: number, cellZ: number) => boolean,
  handSaltBase: number,
  natSaltBase: number
): number {
  let best = 0;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const dx = gx - z.cx;
    const dz = gz - z.cz;
    const d = Math.sqrt(dx * dx + dz * dz);
    const wobble =
      (borderNoise(gx, gz, handSaltBase + i * 211) - 0.5) * 2 * JITTER * z.radius;
    const edge = d - wobble;
    if (edge >= z.radius) continue; // fast reject before the smoothstep
    const w = 1 - smoothstep01((edge - z.core) / BORDER);
    if (w > best) best = w;
  }
  const cellX = Math.floor(gx / CLIMATE_CELL);
  const cellZ = Math.floor(gz / CLIMATE_CELL);
  for (let i = -1; i <= 1; i++) {
    for (let k = -1; k <= 1; k++) {
      if (!roll(cellX + i, cellZ + k)) continue;
      const dx = gx - natCx;
      const dz = gz - natCz;
      const d = Math.sqrt(dx * dx + dz * dz);
      const wobble =
        (borderNoise(gx, gz, natSaltBase + (cellX + i) * 7919 + (cellZ + k) * 104729) - 0.5) *
        2 *
        JITTER *
        (natCore + 10);
      const w = 1 - smoothstep01((d - natCore) / BORDER);
      if (w > best) best = w;
    }
  }
  return best;
}

/** 0 outside every zone .. 1 deep inside a cherry-grove core. */
export function cherryFactor(gx: number, gz: number): number {
  // CITY GRASSLAND KILL-SWITCH: the road-map plateau (core + skirt) is
  // grass by decree — the cherry field answers ZERO across the whole
  // city, so the cherry-gated spiders can never claim the roads.
  if (cityEdgeT(gx, gz) < 1) return 0;
  return zoneWeight(gx, gz, CHERRY_ZONES, naturalCherryAt, 81217, 85229);
}

/** 0 outside every zone .. 1 deep inside a mushroom-field core. */
export function shroomFactor(gx: number, gz: number): number {
  // CITY GRASSLAND KILL-SWITCH — see cherryFactor.
  if (cityEdgeT(gx, gz) < 1) return 0;
  return zoneWeight(gx, gz, SHROOM_ZONES, naturalShroomAt, 91331, 95239);
}

/** 0 outside every zone .. 1 deep inside a crimson-field core. */
export function crimsonFactor(gx: number, gz: number): number {
  // CITY GRASSLAND KILL-SWITCH — see cherryFactor. Zeroes the crimson
  // field across the city so the Bups (its gated mob) stay out too.
  if (cityEdgeT(gx, gz) < 1) return 0;
  return zoneWeight(gx, gz, CRIMSON_ZONES, naturalCrimsonAt, 125331, 126239);
}

/** 0 outside every zone .. 1 deep inside a golden-field core. */
export function goldenFactor(gx: number, gz: number): number {
  // CITY GRASSLAND KILL-SWITCH — see cherryFactor. The road-map city
  // plateau (core + skirt) always reads as plain green grassland.
  if (cityEdgeT(gx, gz) < 1) return 0;
  return zoneWeight(gx, gz, GOLDEN_ZONES, naturalGoldenAt, 131331, 136239);
}

/** World-space wrappers: world (x, z) -> grid, then the block-space
 *  field — one handful of ops, safe to call every frame. */
export function cherryFactorWorld(
  x: number,
  z: number,
  block: number,
  gridOffset: number
): number {
  return cherryFactor(Math.round(x / block) + gridOffset, Math.round(z / block) + gridOffset);
}

export function shroomFactorWorld(
  x: number,
  z: number,
  block: number,
  gridOffset: number
): number {
  return shroomFactor(Math.round(x / block) + gridOffset, Math.round(z / block) + gridOffset);
}

export function crimsonFactorWorld(
  x: number,
  z: number,
  block: number,
  gridOffset: number
): number {
  return crimsonFactor(Math.round(x / block) + gridOffset, Math.round(z / block) + gridOffset);
}

export function goldenFactorWorld(
  x: number,
  z: number,
  block: number,
  gridOffset: number
): number {
  return goldenFactor(Math.round(x / block) + gridOffset, Math.round(z / block) + gridOffset);
}

/** 0..1 smoothstep for an already-normalised t (clamped). */
function smoothstep01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}
