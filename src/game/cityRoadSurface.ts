/**
 * CITY ROAD SURFACE — the physics twin of the 3D road deck built in
 * cityRoadmap.ts. The flat painted map was a decal; the city's roads are
 * now REAL raised 3D block roads (asphalt deck + kerbed rock walkways +
 * grass islands), so every height consumer — the player's ground
 * snap, the jeep's suspension, the camera clearance, mob walkers, the
 * spawn finders — must ride the new deck instead of the bare plateau.
 *
 *  ONE TRUTH, TWO LAYERS (+ THE CUT):
 *  - cityRoadmap.ts builds the visible CUBE deck: one terrain-style cube
 *    per plateau block, textured/heighted by the class this raster
 *    reports (asphalt road / rock footpath / grass island).
 *  - this module rasterizes the SAME vectors once into a BLOCK-resolution
 *    grid (one cell per terrain block; walk / road / island bits) so
 *    per-frame queries are a single array read — O(1), zero allocations,
 *    and pixel-identical to the visible cube field.
 *  - THE CUT (straight footpath edges): full cubes along a diagonal or
 *    curved footpath edge stair-step. So after the bit raster we ALSO
 *    compute, for every block the walk boundary passes through, a
 *    validated HALF-PLANE cut record — the local boundary line of the
 *    exact walk region (union of road capsules + roundabout aprons).
 *    The deck builder clips those cubes into wedge pieces along the
 *    line (and fills the just-outside blocks), and cityRoadClassAt
 *    answers per-position inside/outside — so the footpath border is a
 *    STRAIGHT edge and what you stand on still matches what you see.
 *
 * HEIGHT MODEL (all lifts above terrain.cityTopY(), the flattened
 * plateau top) — CUBE BLOCK heights, same stepped scale as the terrain
 * itself (1 cube = CITY_BLOCK = 100 world units):
 *      base quad (painted grass/water underlay)    +CITY_QUAD_LIFT
 *      asphalt road cube top                       +CITY_ROAD_RISE (1 block)
 *      kerbed footpath cube top                    +CITY_WALK_RISE (2 blocks —
 *                                                    ONE BLOCK above the road)
 *      roundabout grass island cube top            +CITY_ISLAND_RISE
 * PLAYER-PAINTED footpaths follow a ONE-BLOCK-ONLY rule: a painted
 * path that crosses a road/traced walkway/island rides one block above
 * THAT (+CITY_WALK_RISE), while a painted path on plain grass sits
 * just ONE BLOCK above the grass (+CITY_ROAD_RISE — see USER_LOW_BIT),
 * so a painted footpath is never more than a single climbable kerb
 * above whatever it crosses.
 * The raster is BLOCK-RESOLUTION (one cell per terrain block) so the
 * physics answers from exactly the same blocky field the visible cube
 * deck is built from — what you stand on is what you see.
 * Outside the plateau rect the lift is 0 — the natural world is
 * untouched. Pure math + one lazy Uint8Array; no three.js, no DOM.
 */

import { CITY_ROUNDABOUTS, CITY_IMG_H } from './cityRoadmapData';
import { SMOOTHED_PATHS } from './cityRoadSmooth';
import { listFootpathEdits } from './cityFootpathStore';
import {
  CITY_WX0,
  CITY_WX1,
  CITY_WZ0,
  CITY_WZ1,
  CITY_WW,
  CITY_WD,
  CITY_UPP,
  CITY_SCALE,
  cityRoadWU,
  citySidewalkExtra,
} from './cityLayout';

/* ------------------------------ tuning ---------------------------------- */

/** Painted base quad lift above the flattened plateau top (the deck's
 *  "ground floor" — matches the flat quad's position in cityRoadmap). */
export const CITY_QUAD_LIFT = 3;
/** Asphalt road cube top above the base datum (ONE full block). */
export const CITY_ROAD_RISE = 100;
/** Kerbed footpath cube top — TWO blocks above the ground, i.e. ONE
 *  BLOCK higher than the road cubes (real raised sidewalks). */
export const CITY_WALK_RISE = 200;
/** Roundabout grass island cube top (same level as the road ring). */
export const CITY_ISLAND_RISE = 100;

/** Raster cell = ONE terrain block — the physics field IS the cube grid. */
const CELL = 100;
const GW = Math.round(CITY_WW / CELL); // 1536
const GH = Math.round(CITY_WD / CELL); // 1024

const WALK_BIT = 1;
const ROAD_BIT = 2;
const ISLAND_BIT = 4;
/** Player-painted footpath (minimap edit) — beats road/island so a
 *  painted path cuts straight across asphalt or a roundabout island. */
const USER_BIT = 8;
/** Player-painted ASPHALT road (minimap edit, 3-colour painter) — the
 *  topmost user class: a painted road deck rides over everything the
 *  player painted before (mutator swaps the bits, never stacks them). */
const USER_ROAD_BIT = 16;
/** Player-painted footpath on PLAIN ground (no road/island/walkway
 *  underneath) — the kerb-height tag: the path cube tops at ONE BLOCK
 *  above the grass instead of the traced-walkway height, so painted
 *  paths are always a single climbable step above their base. */
const USER_LOW_BIT = 32;

/* ------------------------------ raster ---------------------------------- */

let grid: Uint8Array | null = null;

/** Rasterize the road network once: every path stamps a road disc (its
 *  traced half-width) and a walk disc (half-width + sidewalk extra)
 *  along the polyline; every roundabout stamps the walk apron (r+26),
 *  the asphalt disc (r+14) and the sunken grass island (r-15) — the
 *  same numbers the cube deck uses, so physics and geometry agree. */
function ensureGrid(): void {
  if (grid) return;
  grid = new Uint8Array(GW * GH);

  const uppZ = CITY_WD / CITY_IMG_H;
  const K = CITY_SCALE;
  const stamp = (wx: number, wz: number, r: number, bit: number): void => {
    const gx = (wx - CITY_WX0) / CELL;
    const gz = (wz - CITY_WZ0) / CELL;
    const gr = r / CELL;
    const x0 = Math.max(0, Math.floor(gx - gr));
    const x1 = Math.min(GW - 1, Math.ceil(gx + gr));
    const z0 = Math.max(0, Math.floor(gz - gr));
    const z1 = Math.min(GH - 1, Math.ceil(gz + gr));
    const r2 = gr * gr;
    for (let z = z0; z <= z1; z++) {
      const dz = z - gz;
      const row = z * GW;
      for (let x = x0; x <= x1; x++) {
        const dx = x - gx;
        if (dx * dx + dz * dz <= r2) grid[row + x] |= bit;
      }
    }
  };

  for (const p of SMOOTHED_PATHS) {
    const roadR = cityRoadWU(p.w) / 2;
    const walkR = roadR + citySidewalkExtra(p.cls);
    // stamp spacing follows the NARROWEST disc so even the thinnest
    // traced lanes stay contiguous (spacing <= road radius)
    const spacing = Math.max(24, Math.min(CELL * 0.8, roadR));
    let px = CITY_WX0 + p.pts[0] * CITY_UPP;
    let pz = CITY_WZ0 + p.pts[1] * uppZ;
    stamp(px, pz, walkR, WALK_BIT);
    stamp(px, pz, roadR, ROAD_BIT);
    for (let i = 2; i < p.pts.length; i += 2) {
      const nx = CITY_WX0 + p.pts[i] * CITY_UPP;
      const nz = CITY_WZ0 + p.pts[i + 1] * uppZ;
      const len = Math.hypot(nx - px, nz - pz);
      const steps = Math.max(1, Math.ceil(len / spacing));
      for (let s = 1; s <= steps; s++) {
        const sx = px + ((nx - px) * s) / steps;
        const sz = pz + ((nz - pz) * s) / steps;
        stamp(sx, sz, walkR, WALK_BIT);
        stamp(sx, sz, roadR, ROAD_BIT);
      }
      px = nx;
      pz = nz;
    }
  }

  for (const ra of CITY_ROUNDABOUTS) {
    const wx = CITY_WX0 + ra[0] * CITY_UPP;
    const wz = CITY_WZ0 + ra[1] * uppZ;
    const ru = ra[2] * CITY_UPP;
    stamp(wx, wz, ru + 26 * K, WALK_BIT);
    stamp(wx, wz, ru + 14 * K, ROAD_BIT);
    // the sunken grass island inside real roundabouts (its own cube
    // height — the player spawns beside the central one)
    if (ru > 30 * K) stamp(wx, wz, ru - 15 * K, ISLAND_BIT);
  }

  buildCuts();
  // replay the persisted minimap paint edits (the player's painted
  // footpaths + roads) onto the fresh raster — AFTER buildCuts, so their
  // touched blocks drop their now-stale cut records
  for (const e of listFootpathEdits()) {
    cityFootpathEditStrokeW(e.pts, e.r, e.cls);
  }
}

/* ------------------- walk-edge CUT records ------------------- *
 * The bit raster answers per BLOCK CENTRE, so footpath edges along
 * diagonal roads stair-step. The exact walk region, though, is the
 * union of capsules (per path segment, radius walkR) and roundabout
 * apron discs — its boundary is locally a STRAIGHT LINE. For every
 * boundary block we fit that line as a half-plane, validate it against
 * the exact region at the block's corners, and store it. The deck
 * builder clips cubes along it; cityRoadClassAt answers inside/outside
 * per position. The result: footpath borders follow the true boundary
 * — straight along diagonals, smooth along roundabouts. */

/** One walk-region feature: a path segment capsule (seg) or a
 *  roundabout ring (centre + radii). All radii are world units. */
interface CityFeat {
  seg: boolean;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  cx: number;
  cz: number;
  walkR: number;
  roadR: number;
  islR: number; // 0 = no island
}

/** Spatial hash of the features — a point query reads ONE bucket (the
 *  insertion margin guarantees every influencing feature is there). */
const BKT = 400;
const BKW = Math.ceil(CITY_WW / BKT) + 2;
const BKH = Math.ceil(CITY_WD / BKT) + 2;
let feats: CityFeat[] = [];
let buckets: number[][] = [];
/** Half-plane cut per block (index → [nx, nz, d0]; inside: n·p <= d0). */
let cuts: Map<number, number[]> | null = null;

const clampB = (v: number, n: number): number =>
  v < 0 ? 0 : v >= n ? n - 1 : v;

function insertFeat(f: CityFeat, minx: number, minz: number, maxx: number, maxz: number): void {
  const i = feats.push(f) - 1;
  const bx0 = clampB(Math.floor((minx - CITY_WX0) / BKT), BKW);
  const bx1 = clampB(Math.floor((maxx - CITY_WX0) / BKT), BKW);
  const bz0 = clampB(Math.floor((minz - CITY_WZ0) / BKT), BKH);
  const bz1 = clampB(Math.floor((maxz - CITY_WZ0) / BKT), BKH);
  for (let bz = bz0; bz <= bz1; bz++) {
    for (let bx = bx0; bx <= bx1; bx++) {
      const k = bz * BKW + bx;
      (buckets[k] || (buckets[k] = [])).push(i);
    }
  }
}

function buildFeatHash(): void {
  feats = [];
  buckets = new Array(BKW * BKH);
  const uppZ = CITY_WD / CITY_IMG_H;
  const K = CITY_SCALE;
  const M = 100; // probe margin: corners sit <= 71u from a block centre
  for (const p of SMOOTHED_PATHS) {
    const walkR = cityRoadWU(p.w) / 2 + citySidewalkExtra(p.cls);
    const roadR = cityRoadWU(p.w) / 2;
    for (let i = 0; i < p.pts.length - 2; i += 2) {
      const ax = CITY_WX0 + p.pts[i] * CITY_UPP;
      const az = CITY_WZ0 + p.pts[i + 1] * uppZ;
      const bx = CITY_WX0 + p.pts[i + 2] * CITY_UPP;
      const bz = CITY_WZ0 + p.pts[i + 3] * uppZ;
      insertFeat(
        { seg: true, ax, az, bx, bz, cx: 0, cz: 0, walkR, roadR, islR: 0 },
        Math.min(ax, bx) - walkR - M,
        Math.min(az, bz) - walkR - M,
        Math.max(ax, bx) + walkR + M,
        Math.max(az, bz) + walkR + M
      );
    }
  }
  for (const ra of CITY_ROUNDABOUTS) {
    const cx = CITY_WX0 + ra[0] * CITY_UPP;
    const cz = CITY_WZ0 + ra[1] * uppZ;
    const ru = ra[2] * CITY_UPP;
    insertFeat(
      {
        seg: false,
        ax: 0,
        az: 0,
        bx: 0,
        bz: 0,
        cx,
        cz,
        walkR: ru + 26 * K,
        roadR: ru + 14 * K,
        islR: ru > 30 * K ? ru - 15 * K : 0,
      },
      cx - ru - 26 * K - M,
      cz - ru - 26 * K - M,
      cx + ru + 26 * K + M,
      cz + ru + 26 * K + M
    );
  }
}

interface WalkProbe {
  sW: number; // signed dist to the walk boundary (<0 = on the footpath)
  sR: number; // signed dist to the road boundary
  sI: number; // signed dist to the island boundary
  feat: CityFeat | null; // argmin walk feature
  qx: number; // nearest point on the feature (rings: the centre)
  qz: number;
}

/** Exact walk-region probe at a world point (min over the bucket). */
function walkProbe(x: number, z: number): WalkProbe {
  let sW = 1e9;
  let sR = 1e9;
  let sI = 1e9;
  let feat: CityFeat | null = null;
  let qx = 0;
  let qz = 0;
  let bx = Math.floor((x - CITY_WX0) / BKT);
  let bz = Math.floor((z - CITY_WZ0) / BKT);
  bx = bx < 0 ? 0 : bx >= BKW ? BKW - 1 : bx;
  bz = bz < 0 ? 0 : bz >= BKH ? BKH - 1 : bz;
  const list = buckets[bz * BKW + bx];
  if (list) {
    for (let i = 0; i < list.length; i++) {
      const f = feats[list[i]];
      let d: number;
      let px: number;
      let pz: number;
      if (f.seg) {
        const dx = f.bx - f.ax;
        const dz = f.bz - f.az;
        const L2 = dx * dx + dz * dz;
        let t = L2 > 0 ? ((x - f.ax) * dx + (z - f.az) * dz) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        px = f.ax + dx * t;
        pz = f.az + dz * t;
        d = Math.hypot(x - px, z - pz);
      } else {
        px = f.cx;
        pz = f.cz;
        d = Math.hypot(x - f.cx, z - f.cz);
      }
      const sw = d - f.walkR;
      if (sw < sW) {
        sW = sw;
        feat = f;
        qx = px;
        qz = pz;
      }
      if (f.roadR > 0) {
        const s = d - f.roadR;
        if (s < sR) sR = s;
      }
      if (f.islR > 0) {
        const s = d - f.islR;
        if (s < sI) sI = s;
      }
    }
  }
  return { sW, sR, sI, feat, qx, qz };
}

/** Block class from the bit raster (user > island > road > walk). The
 *  USER bits never coexist (the mutator swaps them), so their order
 *  here is only a tie-break safety net. */
function bitClass(v: number): number {
  if (v & USER_ROAD_BIT) return 2;
  if (v & USER_BIT) return 1;
  if (v & ISLAND_BIT) return 3;
  if (v & ROAD_BIT) return 2;
  if (v & WALK_BIT) return 1;
  return 0;
}

/** Build the per-block cut records (one-time, after the bit raster). */
function buildCuts(): void {
  cuts = new Map();
  buildFeatHash();
  const g = grid as Uint8Array;
  const E = 0.01; // boundary epsilon for corner validation
  for (let gz = 0; gz < GH; gz++) {
    for (let gx = 0; gx < GW; gx++) {
      const idx = gz * GW + gx;
      const cls = bitClass(g[idx]);
      if (cls !== 0 && cls !== 1) continue;
      // candidate gate: the block must touch the walk/class-0 border
      let adjWalk = false;
      let adj0 = false;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = gx + dx;
          const nz = gz + dz;
          if (nx < 0 || nz < 0 || nx >= GW || nz >= GH) continue;
          const c2 = bitClass(g[nz * GW + nx]);
          if (c2 === 1) adjWalk = true;
          else if (c2 === 0) adj0 = true;
        }
      }
      if (cls === 1 && !adj0) continue;
      if (cls === 0 && !adjWalk) continue;

      const x0 = CITY_WX0 + gx * CELL;
      const z0 = CITY_WZ0 + gz * CELL;
      const cxs = x0 + CELL / 2;
      const czs = z0 + CELL / 2;
      const pr = walkProbe(cxs, czs);
      if (!pr.feat) continue;
      // half-plane through the block: keep the side of the centreline
      const dxc = cxs - pr.qx;
      const dzc = czs - pr.qz;
      const dc = Math.hypot(dxc, dzc);
      if (dc < 1 || Math.abs(dc - pr.feat.walkR) < 1) continue;
      const nx = dxc / dc;
      const nz = dzc / dc;
      const d0 = nx * pr.qx + nz * pr.qz + pr.feat.walkR;

      // clip the square against n·p <= d0 (corner signs)
      const cxs4 = [x0, x0 + CELL, x0 + CELL, x0];
      const czs4 = [z0, z0, z0 + CELL, z0 + CELL];
      let inN = 0;
      let outN = 0;
      const keep: number[] = [];
      const drop: number[] = [];
      for (let i = 0; i < 4; i++) {
        const s = nx * cxs4[i] + nz * czs4[i] - d0;
        if (s <= 0) {
          inN++;
          keep.push(i);
        } else {
          outN++;
          drop.push(i);
        }
      }
      if (inN === 4 || outN === 4) continue; // not a boundary block

      // validate against the EXACT region: every kept corner must be a
      // genuine footpath spot (not road/island/another feature's edge),
      // every dropped corner must not belong to another walk area
      let ok = true;
      for (const i of keep) {
        const p = walkProbe(cxs4[i], czs4[i]);
        if (!(p.sW < -E) || p.sR < -E || p.sI < -E) {
          ok = false;
          break;
        }
      }
      if (ok) {
        for (const i of drop) {
          const p = walkProbe(cxs4[i], czs4[i]);
          if (p.sW < -E) {
            ok = false;
            break;
          }
        }
      }
      if (ok) cuts.set(idx, [nx, nz, d0]);
    }
  }
}

/** Cut record of the block containing a world point (or null). */
export function cityWalkCutAtW(
  wx: number,
  wz: number
): [number, number, number] | null {
  if (!cuts) return null;
  if (!(wx >= CITY_WX0) || !(wx < CITY_WX1) || !(wz >= CITY_WZ0) || !(wz < CITY_WZ1)) {
    return null;
  }
  const gx = ((wx - CITY_WX0) / CELL) | 0;
  const gz = ((wz - CITY_WZ0) / CELL) | 0;
  return (cuts.get(gz * GW + gx) as [number, number, number]) ?? null;
}

/* ------------------------------ queries --------------------------------- */

export type CityRoadClass = 0 | 1 | 2 | 3;

/** 0 = plain plateau, 1 = kerbed walkway, 2 = asphalt road deck,
 *  3 = roundabout grass island. */
export function cityRoadClassAt(wx: number, wz: number): CityRoadClass {
  if (!(wx >= CITY_WX0) || !(wx < CITY_WX1) || !(wz >= CITY_WZ0) || !(wz < CITY_WZ1)) {
    return 0; // outside the plateau rect (also catches NaN)
  }
  ensureGrid();
  const g = grid as Uint8Array; // ensureGrid filled it
  const gx = Math.min(GW - 1, Math.max(0, ((wx - CITY_WX0) / CELL) | 0));
  const gz = Math.min(GH - 1, Math.max(0, ((wz - CITY_WZ0) / CELL) | 0));
  const idx = gz * GW + gx;
  const v = g[idx];
  if (v & USER_ROAD_BIT) return 2; // player-painted asphalt deck
  if (v & USER_BIT) return 1; // player-painted footpath wins everything
  if (v & ISLAND_BIT) return 3;
  if (v & ROAD_BIT) return 2;
  if (v & WALK_BIT) {
    // cut block: outside the half-plane the footpath was trimmed away
    const cut = cuts?.get(idx);
    if (cut && cut[0] * wx + cut[1] * wz > cut[2]) return 0;
    return 1;
  }
  // plain block that gained a cut footpath wedge
  const cut = cuts?.get(idx);
  if (cut && cut[0] * wx + cut[1] * wz <= cut[2]) return 1;
  return 0;
}

/** Total surface lift at a world position (0 = untouched nature; inside
 *  the plateau: base quad + walkway/road deck where present). Add this
 *  to terrain.surfaceYAt() to stand on the real city. */
export function citySurfaceLiftAt(wx: number, wz: number): number {
  if (wx < CITY_WX0 || wx >= CITY_WX1 || wz < CITY_WZ0 || wz >= CITY_WZ1) {
    return 0;
  }
  const cls = cityRoadClassAt(wx, wz);
  if (cls === 2) return CITY_QUAD_LIFT + CITY_ROAD_RISE;
  if (cls === 3) return CITY_QUAD_LIFT + CITY_ISLAND_RISE;
  if (cls === 1) {
    // the painted-path ONE-BLOCK-ONLY kerb rule: over plain grass the
    // path tops one block above the ground, over road/walkway/island
    // one block above that — never a two-block wall anywhere
    return (
      CITY_QUAD_LIFT +
      (cityUserWalkLowAt(wx, wz) ? CITY_ROAD_RISE : CITY_WALK_RISE)
    );
  }
  return CITY_QUAD_LIFT;
}

/** Grid summary for the debug handle (built lazily). */
export function citySurfaceStats(): {
  cell: number;
  grid: string;
  roadCells: number;
  walkCells: number;
  islandCells: number;
  userWalkCells: number;
  userRoadCells: number;
  cutBlocks: number;
} {
  ensureGrid();
  const g = grid as Uint8Array; // ensureGrid filled it
  let roadCells = 0;
  let walkCells = 0;
  let islandCells = 0;
  let userWalkCells = 0;
  let userRoadCells = 0;
  for (let i = 0; i < g.length; i++) {
    const v = g[i];
    if (v & USER_BIT) userWalkCells++;
    if (v & USER_ROAD_BIT) userRoadCells++;
    if (v & ISLAND_BIT) islandCells++;
    else if (v & ROAD_BIT) roadCells++;
    else if (v & WALK_BIT) walkCells++;
  }
  return {
    cell: CELL,
    grid: `${GW}x${GH}`,
    roadCells,
    walkCells,
    islandCells,
    userWalkCells,
    userRoadCells,
    cutBlocks: cuts ? cuts.size : 0,
  };
}

/* ----------------- player footpath edits (minimap paint) ---------------- */

/** Mutate the footpath/road raster along a world-space capsule run —
 *  the physics half of the minimap 3-colour painter. cls=1 paints the
 *  USER footpath bit (class 1, beats road/island) plus the USER_LOW
 *  kerb tag when the cell was plain ground (the painted path tops ONE
 *  BLOCK above the grass; over a road/walkway/island it stays one
 *  block above THAT — the traced bits beneath the user bit decide);
 *  cls=2 paints the USER road bit (class 2 asphalt deck — the user
 *  bits SWAP, they never stack, so repainting one colour over the
 *  other just works); cls=0 (erase) clears BOTH user bits + the low
 *  tag and the traced footpath bit (traced asphalt/island stay — the
 *  eraser cannot bulldoze the city). Every cut record around a touched
 *  cell is dropped — its validated footpath edge no longer exists
 *  there. Returns the touched WORLD rect (deck-tile rebuild + map
 *  repaint read it), or null when the stroke changed nothing. */
export function cityFootpathEditStrokeW(
  pts: number[],
  r: number,
  cls: 0 | 1 | 2
): { wx0: number; wz0: number; wx1: number; wz1: number } | null {
  if (pts.length < 4 || !(r > 0)) return null;
  ensureGrid();
  const g = grid as Uint8Array;
  let minGx = GW;
  let minGz = GH;
  let maxGx = -1;
  let maxGz = -1;
  const touch = (gx: number, gz: number): void => {
    const idx = gz * GW + gx;
    const before = g[idx];
    const after =
      cls === 0
        ? before & ~(USER_BIT | USER_ROAD_BIT | USER_LOW_BIT | WALK_BIT)
        : cls === 2
          ? (before & ~(USER_BIT | USER_LOW_BIT)) | USER_ROAD_BIT
          : ((before & ~(USER_ROAD_BIT | USER_LOW_BIT)) | USER_BIT) |
            // the ONE-BLOCK-ONLY kerb rule: a painted footpath over
            // plain ground sits low (grass + 1 block); over anything
            // raised it rides one block above that surface
            (before & (ROAD_BIT | ISLAND_BIT | WALK_BIT)
              ? 0
              : USER_LOW_BIT);
    if (after === before) return;
    g[idx] = after;
    if (gx < minGx) minGx = gx;
    if (gz < minGz) minGz = gz;
    if (gx > maxGx) maxGx = gx;
    if (gz > maxGz) maxGz = gz;
    // the cut half-planes around the touched cell validated against the
    // OLD footpath region — drop them (the deck rebuild re-reads class
    // truth; edges there stair-step like any freshly painted path)
    const cx0 = Math.max(0, gx - 1);
    const cx1 = Math.min(GW - 1, gx + 1);
    const cz0 = Math.max(0, gz - 1);
    const cz1 = Math.min(GH - 1, gz + 1);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        cuts?.delete(cz * GW + cx);
      }
    }
  };
  const stampAt = (wx: number, wz: number): void => {
    const gr = r / CELL;
    const gx = (wx - CITY_WX0) / CELL;
    const gz = (wz - CITY_WZ0) / CELL;
    const x0 = Math.max(0, Math.floor(gx - gr));
    const x1 = Math.min(GW - 1, Math.ceil(gx + gr));
    const z0 = Math.max(0, Math.floor(gz - gr));
    const z1 = Math.min(GH - 1, Math.ceil(gz + gr));
    const r2 = gr * gr;
    for (let z = z0; z <= z1; z++) {
      const dz = z - gz;
      for (let x = x0; x <= x1; x++) {
        const dx = x - gx;
        if (dx * dx + dz * dz <= r2) touch(x, z);
      }
    }
    // GUARANTEE the stamp covers its own containing cell — the raster
    // reader quantizes positions with the same |0 truncation, and a
    // stamp centre near a cell corner sits up to 1.41 cells from that
    // cell's centre, outside a small (brush 1-2) disc. Without this,
    // the road spine of the curve tool could leave its own cell to an
    // overlapping kerb flank disc stamped just before it.
    touch(
      Math.min(GW - 1, Math.max(0, gx | 0)),
      Math.min(GH - 1, Math.max(0, gz | 0))
    );
  };
  const spacing = Math.max(8, Math.min(r * 0.5, CELL));
  let px = pts[0];
  let pz = pts[1];
  stampAt(px, pz);
  for (let i = 2; i < pts.length; i += 2) {
    const nx = pts[i];
    const nz = pts[i + 1];
    const len = Math.hypot(nx - px, nz - pz);
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let s = 1; s <= steps; s++) {
      stampAt(px + ((nx - px) * s) / steps, pz + ((nz - pz) * s) / steps);
    }
    px = nx;
    pz = nz;
  }
  if (maxGx < 0) return null;
  return {
    wx0: CITY_WX0 + minGx * CELL,
    wz0: CITY_WZ0 + minGz * CELL,
    wx1: CITY_WX0 + (maxGx + 1) * CELL,
    wz1: CITY_WZ0 + (maxGz + 1) * CELL,
  };
}

/** Is the walk cell under a world point a PLAYER-PAINTED path on
 *  PLAIN ground (the low kerb rule — one block above the grass)? The
 *  deck builder and the physics lift read this so a painted footpath
 *  is never more than one climbable block above what it crosses.
 *  Pure bit read — never builds the grid (the class query next to
 *  every call site already has). */
export function cityUserWalkLowAt(wx: number, wz: number): boolean {
  if (!grid) return false;
  if (!(wx >= CITY_WX0) || !(wx < CITY_WX1) || !(wz >= CITY_WZ0) || !(wz < CITY_WZ1)) {
    return false;
  }
  const gx = Math.min(GW - 1, Math.max(0, ((wx - CITY_WX0) / CELL) | 0));
  const gz = Math.min(GH - 1, Math.max(0, ((wz - CITY_WZ0) / CELL) | 0));
  const v = grid[gz * GW + gx];
  return (v & USER_BIT) !== 0 && (v & USER_LOW_BIT) !== 0;
}

/** Wipe every player paint edit from the raster (the traced network
 *  stays) and rebuild the cut records from scratch. Used by the RESET
 *  button; cheap because the base rasterization is a one-time sweep. */
export function cityFootpathEditReset(): void {
  if (!grid) return; // never built — the replay list is empty anyway
  grid = null;
  cuts = null;
  ensureGrid();
}
