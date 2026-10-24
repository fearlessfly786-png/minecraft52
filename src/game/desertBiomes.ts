/**
 * Desert biome zones for the RATFIRE world — the hot twin of
 * winterBiomes.ts. The user asked for "a big desert area or zone in the
 * map or terrain, its size matched to the winter zone", so that after
 * this the terrain contains THREE climates: grass heartland, frozen
 * winter countries and now sprawling sand deserts.
 *
 * Everything here is PURE MATH and 100% DETERMINISTIC — no THREE, no DOM,
 * no per-session state — so terrain meshes, the minimap, the sky driver
 * and any future system all agree on where the sand begins and ends:
 *
 *  - DESERT_ZONES are fixed circles in GRID-block space (the same gx/gz
 *    space the height field uses: world x = (gx - gridOffset) * block),
 *    placed in the four compass gaps the winter countries leave open
 *    (winter sits on the diagonals — ENE / NW / SE / SW — so the deserts
 *    claim due north, east, south and west). Every centre was checked
 *    against the worst-case jittered reach of every winter circle
 *    (radius * 1.16 + 9 border) so sand and snow never fight over the
 *    same ground, and each zone is the same size league as the winter
 *    zones (radius 196..224 / core 176..204 vs winter's 186..246 /
 *    166..226 — every biome DOUBLED in size per the user's request, so
 *    the oasis at the due-north zone's exact centre sits mid-desert).
 *  - desertFactor(gx, gz) -> 0..1 rises inside a zone's soft border ring
 *    and saturates at its dune core. The border is wobbled by the same
 *    cheap value-noise jitter the snow line uses (3-block blobs), so the
 *    sand edge wanders organically instead of reading as a perfect arc.
 *  - naturalZoneAt + the cell loop in desertFactor: the endless world is
 *    divided into the same 640-block climate cells winter uses; each
 *    cell rolls ITS OWN deterministic dice (different salts) and on a
 *    hit raises ONE full-size dune country — deep core, soft ring,
 *    jittered coastline — so every desert the generator makes is big
 *    like the hand zones, never a scattered patch. Natural deserts skip
 *    cells whose dune sea would reach the hand-placed WINTER_ZONES, so
 *    the showcase snow countries stay whole; wherever sand and snow do
 *    meet (natural vs natural), terrainChunks gives sand priority.
 *  - desertFactorWorld(x, z) is the world-space wrapper for per-frame
 *    callers (sky tint, rain gating) — a handful of ops, safe per frame.
 */

import {
  WINTER_ZONES,
  registerProtectedZone,
  reachesProtectedZone,
} from './winterBiomes';

/** One dune region: circle in grid-block space with a soft border. */
export interface DesertZone {
  /** Zone centre, grid-block coordinates. */
  cx: number;
  cz: number;
  /** Outer radius in blocks — beyond this the land is normal grass. */
  radius: number;
  /** Core radius in blocks — inside this the dune sea is deepest. */
  core: number;
}

/** Spawn sits at grid (64, 64) — deserts are placed relative to that so
 *  the green spawn plaza keeps its ring of temperate grass. Each zone's
 *  sand reach is core + BORDER; the sizes mirror WINTER_ZONES (the user
 *  asked for a desert matched to the winter zone size). */
export const DESERT_ZONES: DesertZone[] = [
  // due north — first far-discovery desert, world ~(0, 37200). DOUBLED
  // with every biome (centres pushed 2x out from spawn along the
  // original bearings, radii/cores 2x): the OASIS sits at this zone's
  // exact centre, mid-desert.
  { cx: 64, cz: 436, radius: 208, core: 188 },
  // due east, world ~(44200, 0)
  { cx: 506, cz: 64, radius: 196, core: 176 },
  // due south, world ~(0, -44800)
  { cx: 64, cz: -384, radius: 216, core: 196 },
  // due west, world ~(-48800, 0)
  { cx: -424, cz: 64, radius: 224, core: 204 },
];

// Protect the golden dune sea from natural snow countries (the winter
// generator rejects climate cells whose snow would reach these circles)
for (const z of DESERT_ZONES) {
  registerProtectedZone(z.cx, z.cz, z.radius);
}

/** Width of the soft sand-line ring (blocks) between grass and full dune
 *  sea — identical to the winter BORDER so both biomes feather alike. */
const BORDER = 9;

/* ---------------- deterministic border jitter ---------------- */
// mirrored from winterBiomes.ts (kept self-contained; different salts
// below make sure sand and snow wobble independently)

/** Cheap deterministic 2D hash -> 0..1 (integer-safe, no allocations). */
function hash2(ix: number, iz: number, salt: number): number {
  let h = (ix * 374761393 + iz * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

/** Smooth-ish value noise sampled on a 3-block lattice — gives the sand
 *  line its organic 3-block-scale wander instead of a mathematical arc. */
function borderNoise(gx: number, gz: number, salt: number): number {
  const x = gx / 3;
  const z = gz / 3;
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  // smoothstep the lattice corners
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

/** Amplitude of the sand-line wobble, as a fraction of the zone radius. */
const JITTER = 0.16;

/* ---------- natural big dune countries (auto generator) ---------- */

/** Same climate-cell lattice as winter — but the desert dice uses its own
 *  salts, so sand and snow countries land in different places. */
const CLIMATE_CELL = 640;
const CLIMATE_CHANCE = 0.72;
/** Natural deserts never encroach on the spawn plaza either (same ~68
 *  blocks of guaranteed green grass around home as winter keeps). */
const SPAWN_SAFE_DIST = 340;
/** Sand never washes over the hand-placed winter countries: a natural
 *  dune country is rejected if its outer reach (core + BORDER + jitter)
 *  would cross a WINTER_ZONES circle's own worst-case reach. */
const WINTER_REACH_MARGIN = 1.16;

/** Scratch for naturalZoneAt (module-level keeps the per-block factor
 *  calls allocation-free). */
let natCx = 0;
let natCz = 0;
let natCore = 0;

/** Rolls the desert dice for a cell; on a hit fills the scratch with the
 *  dune country's circle (centre + core) and returns true. */
function naturalZoneAt(cellX: number, cellZ: number): boolean {
  if (hash2(cellX, cellZ, 11273) > CLIMATE_CHANCE) return false;
  const cx =
    cellX * CLIMATE_CELL + CLIMATE_CELL / 2 + (hash2(cellX, cellZ, 12107) - 0.5) * 360;
  const cz =
    cellZ * CLIMATE_CELL + CLIMATE_CELL / 2 + (hash2(cellX, cellZ, 13291) - 0.5) * 360;
  const dxs = cx - 64;
  const dzs = cz - 64;
  if (dxs * dxs + dzs * dzs < SPAWN_SAFE_DIST * SPAWN_SAFE_DIST) return false;
  const core = 160 + hash2(cellX, cellZ, 4421) * 56; // 160..216, winter league
  // keep the showcase winter countries whole: reject this dune country if
  // its jittered outer reach would cross any hand-placed snow circle —
  // and (via the shared protected registry) any hand circle of the hot
  // extra biomes or the temperate wild biomes too
  const reach = core + BORDER + JITTER * (core + 10);
  if (reachesProtectedZone(cx, cz, reach)) return false;
  for (let i = 0; i < WINTER_ZONES.length; i++) {
    const z = WINTER_ZONES[i];
    const dx = cx - z.cx;
    const dz = cz - z.cz;
    const winterReach = z.radius * WINTER_REACH_MARGIN + BORDER;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < reach + winterReach) return false;
  }
  natCx = cx;
  natCz = cz;
  natCore = core;
  return true;
}

/** 0 outside every zone .. 1 deep inside a dune-sea core. */
export function desertFactor(gx: number, gz: number): number {
  let best = 0;
  for (let i = 0; i < DESERT_ZONES.length; i++) {
    const z = DESERT_ZONES[i];
    const dx = gx - z.cx;
    const dz = gz - z.cz;
    const d = Math.sqrt(dx * dx + dz * dz);
    const wobble = (borderNoise(gx, gz, 4177 + i * 211) - 0.5) * 2 * JITTER * z.radius;
    const edge = d - wobble;
    if (edge >= z.radius) continue; // fast reject before the smoothstep
    // 1 at/below the core, falling to 0 across the soft border ring
    const w = 1 - smoothstep01((edge - z.core) / BORDER);
    if (w > best) best = w;
  }
  // natural big dune countries: dice-rolled per climate cell, one
  // full-size country per hit, same soft ring + jitter as the main
  // zones (max() unions everything cleanly where countries touch)
  const cellX = Math.floor(gx / CLIMATE_CELL);
  const cellZ = Math.floor(gz / CLIMATE_CELL);
  for (let i = -1; i <= 1; i++) {
    for (let k = -1; k <= 1; k++) {
      if (!naturalZoneAt(cellX + i, cellZ + k)) continue;
      const dx = gx - natCx;
      const dz = gz - natCz;
      const d = Math.sqrt(dx * dx + dz * dz);
      const wobble =
        (borderNoise(gx, gz, 6547 + (cellX + i) * 7919 + (cellZ + k) * 104729) - 0.5) *
        2 *
        JITTER *
        (natCore + 10);
      const w = 1 - smoothstep01((d - natCore) / BORDER);
      if (w > best) best = w;
    }
  }
  return best;
}

/** World-space wrapper: world (x, z) -> grid, then the block-space field. */
export function desertFactorWorld(
  x: number,
  z: number,
  block: number,
  gridOffset: number
): number {
  return desertFactor(Math.round(x / block) + gridOffset, Math.round(z / block) + gridOffset);
}

/** 0..1 smoothstep for an already-normalised t (clamped). */
function smoothstep01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}
