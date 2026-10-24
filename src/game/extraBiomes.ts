/**
 * Three MORE climate zones for the RATFIRE world — the hot trio that
 * completes the biome roster alongside the grass heartland, the winter
 * countries (winterBiomes.ts) and the golden dune sea (desertBiomes.ts):
 *
 *  - RED DESERT  — rust-red Mars-like dune country (own red sand atlas)
 *  - BADLANDS    — terraced terracotta mesa country with striped strata
 *  - VOLCANO     — jagged black basalt ash-fields with glowing lava cracks
 *
 * Everything here is PURE MATH and 100% DETERMINISTIC — no THREE, no DOM —
 * exactly like the winter/desert modules, so terrain meshes, the minimap,
 * the sky driver and the 3D zone-sign all agree on where every biome
 * begins and ends:
 *
 *  - HAND ZONES are fixed circles in GRID-block space (world x =
 *    (gx - gridOffset) * block, spawn at grid (64,64)). They sit in the
 *    eight half-compass directions (22.5°, 67.5°, ... — the gaps left
 *    between the cardinals the deserts own and the diagonals the winter
 *    countries own) on a 900-block ring, with the volcano ring pushed to
 *    1280 on the cardinals. Every centre was validated against the
 *    worst-case jittered reach of EVERY hand zone of ALL five biomes
 *    (radius * 1.16 + 9) so no two showcase zones ever fight over ground.
 *  - redFactor / mesaFactor / volcanoFactor -> 0..1 rise inside a zone's
 *    soft border ring and saturate at the core, with the same 3-block
 *    value-noise wobble on the border line as winter/desert.
 *  - NATURAL countries: the same 640-block climate-cell dice as winter
 *    and desert (own salts, slightly lower hit chance so green grass
 *    stays the common ground), one full-size country per hit. A cell is
 *    rejected if the country's jittered reach would cross ANY hand zone
 *    of ANY biome — the showcase circles stay whole everywhere.
 *  - *FactorWorld wrappers are the world-space forms for per-frame
 *    callers (sky tint, weather gating, zone sign) — cheap, no allocs.
 */

import {
  WINTER_ZONES,
  registerProtectedZone,
  reachesProtectedZone,
} from './winterBiomes';
import { DESERT_ZONES } from './desertBiomes';

/** One extra climate region: circle in grid-block space, soft border. */
export interface ExtraZone {
  /** Zone centre, grid-block coordinates. */
  cx: number;
  cz: number;
  /** Outer radius in blocks — beyond this the land is normal grass. */
  radius: number;
  /** Core radius in blocks — inside this the biome is deepest. */
  core: number;
}

/* ---------------- hand-placed showcase zones ---------------- */

/** RED DESERT countries — the rust-red twin of the golden dune sea.
 *  Ring 900 on the 22.5°/157.5°/247.5°/337.5° half-compass bearings. */
export const RED_ZONES: ExtraZone[] = [
  { cx: 408, cz: 896, radius: 204, core: 184 },   // NNE, world ~(34400, 83200)
  { cx: 408, cz: -768, radius: 192, core: 172 },  // SSE, world ~(34400, -83200)
  { cx: -824, cz: -304, radius: 200, core: 180 }, // SSW, world ~(-88800, -36800)
  { cx: -280, cz: 896, radius: 208, core: 188 },  // NNW, world ~(-34400, 83200)
];

/** BADLANDS mesa countries — terraced terracotta plateau land.
 *  Ring 900 on the 67.5°/112.5°/202.5°/292.5° half-compass bearings. */
export const MESA_ZONES: ExtraZone[] = [
  { cx: 896, cz: 408, radius: 196, core: 176 },   // ENE, world ~(83200, 34400)
  { cx: 896, cz: -280, radius: 204, core: 184 },  // ESE, world ~(83200, -34400)
  { cx: -280, cz: -768, radius: 192, core: 172 }, // SSW, world ~(-34400, -83200)
  { cx: -824, cz: 432, radius: 200, core: 180 },  // NNW, world ~(-88800, 36800)
];

/** VOLCANO ash countries — jagged black basalt around a glowing heart.
 *  Farther ring (1280) on the cardinals, beyond the desert ring. */
export const VOLCANO_ZONES: ExtraZone[] = [
  { cx: 64, cz: 1344, radius: 216, core: 196 },   // due north, world ~(0, 128000)
  { cx: 1344, cz: 64, radius: 208, core: 188 },   // due east, world ~(128000, 0)
  { cx: 64, cz: -1216, radius: 212, core: 192 },  // due south, world ~(0, -128000)
  { cx: -1216, cz: 64, radius: 208, core: 188 },  // due west, world ~(-128000, 0)
];

/** Width of the soft biome-line ring (blocks) — identical to winter and
 *  desert so every climate feathers alike. */
const BORDER = 9;

// Protect all twelve showcase circles from natural snow countries (the
// winter generator rejects climate cells whose snow would reach them)
for (const z of [...RED_ZONES, ...MESA_ZONES, ...VOLCANO_ZONES]) {
  registerProtectedZone(z.cx, z.cz, z.radius);
}

/* ---------------- deterministic border jitter ---------------- */
// mirrored from winterBiomes.ts / desertBiomes.ts (own salts below keep
// every biome's border line wandering independently)

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

/** Same climate-cell lattice as winter/desert — the three new biomes roll
 *  their own dice with their own salts, at slightly lower chances than
 *  winter/desert so the default green grass stays common ground. */
const CLIMATE_CELL = 640;
const RED_CHANCE = 0.45;
const MESA_CHANCE = 0.45;
const VOLCANO_CHANCE = 0.4;
/** Natural countries never encroach on the spawn plaza (same rule as
 *  winter and desert keep). */
const SPAWN_SAFE_DIST = 340;

/** Every hand-placed circle of ALL biomes. Natural countries of the
 *  new biomes keep their jittered reach clear of every one of them, so
 *  each showcase zone stays whole no matter what the dice roll. */
const HAND_ZONES: ExtraZone[] = [
  ...WINTER_ZONES,
  ...DESERT_ZONES,
  ...RED_ZONES,
  ...MESA_ZONES,
  ...VOLCANO_ZONES,
];

/** Worst-case jittered reach of a zone (the desert module's standard). */
function zoneReach(radius: number): number {
  return radius * 1.16 + BORDER;
}

/** True if a would-be country at (cx, cz) with outer reach `reach` would
 *  cross any showcase circle's own worst-case reach — the explicit list
 *  below (frozen at module init, so it can't include the later wild
 *  biomes without an import cycle) PLUS the shared protected registry,
 *  which the wild biomes register into and which is only ever queried
 *  at per-block roll time, after every module has loaded. */
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

/** Rolls the red-desert dice for a climate cell. */
function naturalRedAt(cellX: number, cellZ: number): boolean {
  if (hash2(cellX, cellZ, 21101) > RED_CHANCE) return false;
  const cx =
    cellX * CLIMATE_CELL + CLIMATE_CELL / 2 + (hash2(cellX, cellZ, 22111) - 0.5) * 360;
  const cz =
    cellZ * CLIMATE_CELL + CLIMATE_CELL / 2 + (hash2(cellX, cellZ, 23087) - 0.5) * 360;
  const dxs = cx - 64;
  const dzs = cz - 64;
  if (dxs * dxs + dzs * dzs < SPAWN_SAFE_DIST * SPAWN_SAFE_DIST) return false;
  const core = 160 + hash2(cellX, cellZ, 24019) * 56; // 160..216, winter league
  const reach = core + BORDER + JITTER * (core + 10);
  if (reachesHandZone(cx, cz, reach)) return false;
  natCx = cx;
  natCz = cz;
  natCore = core;
  return true;
}

/** Rolls the badlands dice for a climate cell. */
function naturalMesaAt(cellX: number, cellZ: number): boolean {
  if (hash2(cellX, cellZ, 31223) > MESA_CHANCE) return false;
  const cx =
    cellX * CLIMATE_CELL + CLIMATE_CELL / 2 + (hash2(cellX, cellZ, 32251) - 0.5) * 360;
  const cz =
    cellZ * CLIMATE_CELL + CLIMATE_CELL / 2 + (hash2(cellX, cellZ, 33247) - 0.5) * 360;
  const dxs = cx - 64;
  const dzs = cz - 64;
  if (dxs * dxs + dzs * dzs < SPAWN_SAFE_DIST * SPAWN_SAFE_DIST) return false;
  const core = 160 + hash2(cellX, cellZ, 34259) * 56;
  const reach = core + BORDER + JITTER * (core + 10);
  if (reachesHandZone(cx, cz, reach)) return false;
  natCx = cx;
  natCz = cz;
  natCore = core;
  return true;
}

/** One natural volcano country: centre + core radius, grid-block space. */
export interface VolcanoCountry {
  cx: number;
  cz: number;
  core: number;
}

/** Memoised natural-volcano-country dice for a climate cell. The volcano
 *  CONE builder (volcanoTerrain.ts) needs the same deterministic centres
 *  the factor field rolls, so the roll lives here behind a cache — every
 *  consumer (terrain height, lava, the ash plume, the minimap) agrees on
 *  exactly where every natural stratovolcano stands. */
const VOLCANO_COUNTRY_CACHE = new Map<string, VolcanoCountry | null>();

export function volcanoCountryAt(
  cellX: number,
  cellZ: number
): VolcanoCountry | null {
  const key = cellX + ',' + cellZ;
  const hit = VOLCANO_COUNTRY_CACHE.get(key);
  if (hit !== undefined) return hit;

  let out: VolcanoCountry | null = null;
  if (hash2(cellX, cellZ, 41341) <= VOLCANO_CHANCE) {
    const cx =
      cellX * CLIMATE_CELL + CLIMATE_CELL / 2 + (hash2(cellX, cellZ, 42353) - 0.5) * 360;
    const cz =
      cellZ * CLIMATE_CELL + CLIMATE_CELL / 2 + (hash2(cellX, cellZ, 43349) - 0.5) * 360;
    const dxs = cx - 64;
    const dzs = cz - 64;
    if (dxs * dxs + dzs * dzs >= SPAWN_SAFE_DIST * SPAWN_SAFE_DIST) {
      const core = 160 + hash2(cellX, cellZ, 44371) * 56;
      const reach = core + BORDER + JITTER * (core + 10);
      if (!reachesHandZone(cx, cz, reach)) out = { cx, cz, core };
    }
  }

  // tiny safety valve for endless exploration sessions
  if (VOLCANO_COUNTRY_CACHE.size > 20_000) VOLCANO_COUNTRY_CACHE.clear();
  VOLCANO_COUNTRY_CACHE.set(key, out);
  return out;
}

/** Rolls the volcano dice for a climate cell. */
function naturalVolcanoAt(cellX: number, cellZ: number): boolean {
  const country = volcanoCountryAt(cellX, cellZ);
  if (!country) return false;
  natCx = country.cx;
  natCz = country.cz;
  natCore = country.core;
  return true;
}

/** Shared per-block scan: hand circles + the 3x3 climate-cell neighbourhood
 *  rolled by `roll`, wobbled by `wobbleSalt`. Returns the max weight. */
function zoneWeight(
  gx: number,
  gz: number,
  zones: ExtraZone[],
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

/** 0 outside every zone .. 1 deep inside a red-dune core. */
export function redFactor(gx: number, gz: number): number {
  return zoneWeight(gx, gz, RED_ZONES, naturalRedAt, 51423, 52429);
}

/** 0 outside every zone .. 1 deep inside a badlands core. */
export function mesaFactor(gx: number, gz: number): number {
  return zoneWeight(gx, gz, MESA_ZONES, naturalMesaAt, 61441, 62447);
}

/** 0 outside every zone .. 1 deep inside a volcano core. */
export function volcanoFactor(gx: number, gz: number): number {
  return zoneWeight(gx, gz, VOLCANO_ZONES, naturalVolcanoAt, 71459, 72463);
}

/** World-space wrappers: world (x, z) -> grid, then the block-space
 *  field — one handful of ops, safe to call every frame. */
export function redFactorWorld(
  x: number,
  z: number,
  block: number,
  gridOffset: number
): number {
  return redFactor(Math.round(x / block) + gridOffset, Math.round(z / block) + gridOffset);
}

export function mesaFactorWorld(
  x: number,
  z: number,
  block: number,
  gridOffset: number
): number {
  return mesaFactor(Math.round(x / block) + gridOffset, Math.round(z / block) + gridOffset);
}

export function volcanoFactorWorld(
  x: number,
  z: number,
  block: number,
  gridOffset: number
): number {
  return volcanoFactor(Math.round(x / block) + gridOffset, Math.round(z / block) + gridOffset);
}

/** 0..1 smoothstep for an already-normalised t (clamped). */
function smoothstep01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}
