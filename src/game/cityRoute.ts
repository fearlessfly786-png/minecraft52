/**
 * City road ROUTER — Google-Maps-style shortest routes over the road-map
 * street network for the city-map overlay (see Minimap.tsx).
 *
 * The routable field is the SAME raster the city map paints (cityLayout.ts
 * `cityMinimapTint`: one sample per block across the CITY_GRID rect —
 * asphalt road, stone walkway or plain city grass) with the traced water
 * rects from cityRoadmapData.ts punched out. Two lazy one-time layers are
 * built from that: a Uint8 terrain class grid and a Float32 enter-cost
 * grid. Every route request then runs an 8-connected A* search with
 * street-shaped step costs and an octile heuristic (real 45-degree
 * avenues are taken when they are shorter — see the cost note below):
 *   - asphalt is cheapest, so the route hugs the roads like Google Maps,
 *   - walkways cost a bit more (reach the kerb, don't cruise them),
 *   - city grass is expensive (only short hops door -> street),
 *   - water is impassable EXCEPT where a road/walk crosses it — bridges
 *     are real walkable decks, so the router keeps routing over them.
 * Returns the polyline in ABSOLUTE grid coordinates plus the traversed
 * length in straight-block steps; the overlay renders it as an amber
 * Google-style line with a red teardrop destination pin.
 *
 * GOOGLE-STYLE SMOOTHING — the raw cell path is then shaped into one
 * flowing curve in three verified stages: (1) string pulling — any
 * all-asphalt straight chord replaces the zigzag between its ends, so
 * staircases on diagonal streets collapse into clean diagonals and
 * wide-carriageway wobble straightens out; (2) centre-line alignment —
 * every straight FULLY-ROAD run is re-anchored onto the exact traced
 * centreline (cityRoadCenter.ts: nearest direction-matched CITY_PATHS
 * stroke), so navigation arrows and the map line both paint down the
 * MIDDLE of the street; (3) corner rounding — every remaining corner
 * becomes a clamped quadratic Bézier whose samples are re-verified on
 * asphalt (corners that cannot stay on the street keep their sharp
 * shape). The result is a dense fractional-grid polyline that both the
 * map overlay and the world chevrons walk point to point.
 *
 * Pure math, no DOM, no three.js — zero per-frame cost.
 */

import {
  CITY_BLOCK,
  CITY_GRID,
  CITY_GRID_OFFSET,
  CITY_UPP,
  CITY_WD,
  CITY_WX0,
  CITY_WZ0,
  cityMinimapTint,
} from './cityLayout';
import { CITY_IMG_H, CITY_WATER } from './cityRoadmapData';
import { snapToRoadCenter } from './cityRoadCenter';

/** Routable field size — one cell per block of the city rect. */
const GW = CITY_GRID.gx1 - CITY_GRID.gx0 + 1; // 1536
const GH = CITY_GRID.gz1 - CITY_GRID.gz0 + 1; // 1024

/* terrain classes stored in the class grid */
const CLS_BLOCKED = 0;
const CLS_ROAD = 1;
const CLS_WALK = 2;
const CLS_GRASS = 3;

/* straight-step ENTER costs per class (diagonal steps multiply by DIAG).
 * Shaped for GOOGLE-MAPS routes: asphalt is by far the cheapest so long
 * legs run down the streets, walkways are only for kerb hops (never
 * cruise the footpaths — the arrows must stay on the asphalt) and grass
 * is a rare emergency cut. DIAG sits just above the true geometric
 * ratio (√2 ≈ 1.41) so the search takes real 45° avenues and pier ramps
 * whenever they are shorter — the smoothing stages below then render
 * those runs as one flowing curve instead of a staircase. */
const COST_ROAD = 10;
const COST_WALK = 80;
const COST_GRASS = 450;
const DIAG = 1.45;

/** Metres per block at the game's own toM() scale (page.tsx: 1u = 0.09 m,
 *  one voxel block = 100u -> 9 m), for the distance readout. */
export const CITY_M_PER_BLOCK = CITY_BLOCK * 0.09;

/** A planned route. `pts` is a flat absolute-grid polyline
 *  [gx, gz, gx, gz, ...] from start to goal — string-pulled, centred
 *  on the streets and rounded into one flowing curve (fractional cells
 *  on the rounded corners), ready for both the map overlay and the
 *  world chevron chain to walk point to point. */
export interface CityRoute {
  pts: number[];
  /** True traversed length in blocks (diagonals count 1.414). */
  blocks: number;
}

/* ---------------- one-time cost layers ---------------- */

let costGrid: Uint8Array | null = null; // terrain class per cell
let enterCost: Float32Array | null = null; // straight-step cost into cell

/** Build (once) the cost layers from the minimap raster + the traced
 *  water rects. Roads/walks survive the water punch (they are the
 *  bridges); only grass under water becomes impassable. */
export function ensureCityRouteGrid(): void {
  if (costGrid) return;
  const grid = new Uint8Array(GW * GH);
  const cost = new Float32Array(GW * GH);
  for (let lz = 0; lz < GH; lz++) {
    const gz = CITY_GRID.gz0 + lz;
    for (let lx = 0; lx < GW; lx++) {
      const tint = cityMinimapTint(CITY_GRID.gx0 + lx, gz);
      const i = lz * GW + lx;
      if (tint === 'road') {
        grid[i] = CLS_ROAD;
        cost[i] = COST_ROAD;
      } else if (tint === 'walk') {
        grid[i] = CLS_WALK;
        cost[i] = COST_WALK;
      } else {
        grid[i] = CLS_GRASS;
        cost[i] = COST_GRASS;
      }
    }
  }
  // water rects — image px -> local grid px, the exact mapping the city
  // map cache paints (Minimap.ensureCityMap), so router and picture agree
  const uppZ = CITY_WD / CITY_IMG_H;
  for (const [wxp, wyp, ww, wh] of CITY_WATER) {
    const bx =
      (CITY_WX0 + wxp * CITY_UPP) / CITY_BLOCK +
      CITY_GRID_OFFSET -
      CITY_GRID.gx0;
    const bz =
      (CITY_WZ0 + wyp * uppZ) / CITY_BLOCK +
      CITY_GRID_OFFSET -
      CITY_GRID.gz0;
    const bw = (ww * CITY_UPP) / CITY_BLOCK;
    const bh = (wh * uppZ) / CITY_BLOCK;
    const x0 = Math.max(0, Math.floor(bx));
    const z0 = Math.max(0, Math.floor(bz));
    const x1 = Math.min(GW - 1, Math.ceil(bx + bw));
    const z1 = Math.min(GH - 1, Math.ceil(bz + bh));
    for (let lz = z0; lz <= z1; lz++) {
      for (let lx = x0; lx <= x1; lx++) {
        const i = lz * GW + lx;
        if (grid[i] === CLS_GRASS) {
          grid[i] = CLS_BLOCKED;
          cost[i] = 0;
        }
      }
    }
  }
  costGrid = grid;
  enterCost = cost;
}

/** Re-sample the cost layers over a world rect after a footpath edit —
 *  the router sees painted/cut paths the moment the stroke lands (the
 *  same tint rule the map paints, water punch included). */
export function cityRouteRefreshRegion(
  wx0: number,
  wz0: number,
  wx1: number,
  wz1: number
): void {
  ensureCityRouteGrid();
  const g = costGrid as Uint8Array;
  const c = enterCost as Float32Array;
  const lx0 = Math.max(
    0,
    Math.floor(Math.min(wx0, wx1) / CITY_BLOCK) +
      CITY_GRID_OFFSET -
      CITY_GRID.gx0
  );
  const lz0 = Math.max(
    0,
    Math.floor(Math.min(wz0, wz1) / CITY_BLOCK) +
      CITY_GRID_OFFSET -
      CITY_GRID.gz0
  );
  const lx1 = Math.min(
    GW - 1,
    Math.ceil(Math.max(wx0, wx1) / CITY_BLOCK) +
      CITY_GRID_OFFSET -
      CITY_GRID.gx0
  );
  const lz1 = Math.min(
    GH - 1,
    Math.ceil(Math.max(wz0, wz1) / CITY_BLOCK) +
      CITY_GRID_OFFSET -
      CITY_GRID.gz0
  );
  const uppZ = CITY_WD / CITY_IMG_H;
  for (let lz = lz0; lz <= lz1; lz++) {
    const gz = CITY_GRID.gz0 + lz;
    for (let lx = lx0; lx <= lx1; lx++) {
      const gx = CITY_GRID.gx0 + lx;
      const i = lz * GW + lx;
      const tint = cityMinimapTint(gx, gz);
      if (tint === 'road') {
        g[i] = CLS_ROAD;
        c[i] = COST_ROAD;
      } else if (tint === 'walk') {
        g[i] = CLS_WALK;
        c[i] = COST_WALK;
      } else {
        g[i] = CLS_GRASS;
        c[i] = COST_GRASS;
        // grass under a traced water rect stays impassable
        const wx = (gx - CITY_GRID_OFFSET) * CITY_BLOCK;
        const wz = (gz - CITY_GRID_OFFSET) * CITY_BLOCK;
        for (const [rx, rz, rw, rh] of CITY_WATER) {
          if (
            wx >= CITY_WX0 + rx * CITY_UPP &&
            wx < CITY_WX0 + (rx + rw) * CITY_UPP &&
            wz >= CITY_WZ0 + rz * uppZ &&
            wz < CITY_WZ0 + (rz + rh) * uppZ
          ) {
            g[i] = CLS_BLOCKED;
            c[i] = 0;
            break;
          }
        }
      }
    }
  }
}

/* ---------------- reusable binary min-heap on (f, idx) ---------------- */

const heapF: number[] = [];
const heapI: number[] = [];

function heapClear(): void {
  heapF.length = 0;
  heapI.length = 0;
}

function heapPush(f: number, i: number): void {
  heapF.push(f);
  heapI.push(i);
  let c = heapF.length - 1;
  while (c > 0) {
    const p = (c - 1) >> 1;
    if (heapF[p] <= heapF[c]) break;
    const tf = heapF[p];
    heapF[p] = heapF[c];
    heapF[c] = tf;
    const ti = heapI[p];
    heapI[p] = heapI[c];
    heapI[c] = ti;
    c = p;
  }
}

function heapPop(): number {
  const top = heapI[0];
  const lf = heapF.pop() as number;
  const li = heapI.pop() as number;
  const n = heapF.length;
  if (n > 0) {
    heapF[0] = lf;
    heapI[0] = li;
    let p = 0;
    for (;;) {
      const l = p * 2 + 1;
      const r = l + 1;
      let m = p;
      if (l < n && heapF[l] < heapF[m]) m = l;
      if (r < n && heapF[r] < heapF[m]) m = r;
      if (m === p) break;
      const tf = heapF[p];
      heapF[p] = heapF[m];
      heapF[m] = tf;
      const ti = heapI[p];
      heapI[p] = heapI[m];
      heapI[m] = ti;
      p = m;
    }
  }
  return top;
}

/* ---------------- centre-line alignment ---------------- */

/** Road class at ABSOLUTE grid coords (false outside the city rect). */
function roadAt(gx: number, gz: number): boolean {
  const grid = costGrid;
  if (!grid) return false;
  const lx = gx - CITY_GRID.gx0;
  const lz = gz - CITY_GRID.gz0;
  return (
    lx >= 0 &&
    lx < GW &&
    lz >= 0 &&
    lz < GH &&
    grid[lz * GW + lx] === CLS_ROAD
  );
}

/** Centreline track for one straight run of the compressed route —
 *  axis-aligned OR diagonal (the traced map has real 45-degree
 *  streets, and the A* walks them with chained diagonal steps): sample
 *  the run every 2 blocks, project each sample onto the
 *  direction-matched road centreline, and keep the sample when the
 *  projection lies within THAT stroke's own deck (a far parallel
 *  street can then never hijack the run) and the lateral offset stays
 *  continuous with the previous kept sample (no line hopping).
 *  Samples with no sane line are skipped — the chords between kept
 *  points cross junction asphalt. Returns flat absolute-grid points
 *  for the run interior, or null when nothing matched (the run keeps
 *  its raw A* shape). */
function runCentreTrack(
  ax: number,
  az: number,
  bx: number,
  bz: number
): number[] | null {
  const dx = bx - ax;
  const dz = bz - az;
  const cells = Math.max(Math.abs(dx), Math.abs(dz));
  const segLen = Math.hypot(dx, dz);
  if (cells < 3 || segLen < 1e-6) return null;
  const ux = dx / segLen;
  const uz = dz / segLen;
  // the run must be fully asphalt (re-check: cheap, and guards the
  // raw fallback edges that were never road-verified)
  const steps = Math.ceil(segLen);
  for (let s = 0; s <= steps; s++) {
    const gx = Math.round(ax + (dx * s) / steps);
    const gz = Math.round(az + (dz * s) / steps);
    if (!roadAt(gx, gz)) return null;
  }
  const out: number[] = [];
  let prevLat = 0;
  for (let d = 0; d <= segLen * CITY_BLOCK; d += 2 * CITY_BLOCK) {
    const wx = (ax - CITY_GRID_OFFSET) * CITY_BLOCK + ux * d;
    const wz = (az - CITY_GRID_OFFSET) * CITY_BLOCK + uz * d;
    const snap = snapToRoadCenter(wx, wz, ux, uz);
    if (!snap) continue;
    const ox = snap[0] - wx;
    const oz = snap[1] - wz;
    // signed perpendicular offset from the run line
    const lat = ox * -uz + oz * ux;
    if (Math.abs(lat) > snap[2] + 60) continue;
    if (out.length > 0 && Math.abs(lat - prevLat) > 350) continue;
    prevLat = lat;
    const gx = snap[0] / CITY_BLOCK + CITY_GRID_OFFSET;
    const gz = snap[1] / CITY_BLOCK + CITY_GRID_OFFSET;
    const len = out.length;
    if (
      len >= 2 &&
      (gx - out[len - 2]) * (gx - out[len - 2]) +
        (gz - out[len - 1]) * (gz - out[len - 1]) <
        1600
    ) {
      continue; // sub-step wobble — keep the last point
    }
    out.push(gx, gz);
  }
  return out.length >= 2 ? out : null;
}

/** Re-anchor the route onto the traced road centrelines run by run:
 *  every straight run long enough to matter (axis or diagonal) gets
 *  its centreline track (runCentreTrack) spliced between its corners;
 *  corners shared by two tracked runs are dropped so the line flows
 *  smoothly across the junction, otherwise the raw A* corner stays
 *  (always asphalt). Short kerb hops keep their raw shape. */
function centerOnRoads(pts: number[]): number[] {
  const n = pts.length >> 1;
  if (n < 2 || !costGrid) return pts;
  const tracks: (number[] | null)[] = new Array(n - 1).fill(null);
  let touched = false;
  for (let k = 0; k + 1 < n; k++) {
    const track = runCentreTrack(
      pts[k * 2],
      pts[k * 2 + 1],
      pts[k * 2 + 2],
      pts[k * 2 + 3]
    );
    if (track !== null) {
      tracks[k] = track;
      touched = true;
    }
  }
  if (!touched) return pts;
  const out: number[] = [pts[0], pts[1]];
  const pushPt = (x: number, z: number): void => {
    const len = out.length;
    if (len >= 2 && out[len - 2] === x && out[len - 1] === z) return;
    out.push(x, z);
  };
  for (let k = 0; k + 1 < n; k++) {
    const track = tracks[k];
    if (track) {
      for (let i = 0; i < track.length; i += 2) {
        pushPt(track[i], track[i + 1]);
      }
    }
    // the shared corner survives unless BOTH sides flow on centrelines
    const nextTracked = k + 1 < n - 1 && tracks[k + 1] !== null;
    if (!nextTracked) {
      pushPt(pts[k * 2 + 2], pts[k * 2 + 3]);
    }
  }
  return out;
}

/* ---------------- route shape: pull taut + round corners ---------------- */

/** Traced asphalt (CLS_ROAD) at fractional ABSOLUTE grid coords. */
function streetAt(gx: number, gz: number): boolean {
  const grid = costGrid;
  if (!grid) return false;
  const lx = Math.round(gx) - CITY_GRID.gx0;
  const lz = Math.round(gz) - CITY_GRID.gz0;
  if (lx < 0 || lx >= GW || lz < 0 || lz >= GH) return false;
  return grid[lz * GW + lx] === CLS_ROAD;
}

/** Traced asphalt tolerating hairline raster slits: the traced street
 *  strokes are thinner than one grid cell in places (thin diagonal
 *  piers), so the class raster shows one-cell grass gaps across what is
 *  continuous asphalt in the real 3D deck. A sample counts as street
 *  when its own cell or any 4-neighbour is road. True block interiors
 *  (a full cell deep) still fail. */
function streetish(gx: number, gz: number): boolean {
  if (streetAt(gx, gz)) return true;
  return (
    streetAt(gx + 0.5, gz) ||
    streetAt(gx - 0.5, gz) ||
    streetAt(gx, gz + 0.5) ||
    streetAt(gx, gz - 0.5)
  );
}

/** True when the straight chord a->b stays on traced asphalt for its
 *  whole length (sampled every ~half block). Hairline raster slits are
 *  bridged (streetish + short miss runs only), so chords follow the
 *  continuous real deck; genuine cuts across blocks or water — long
 *  consecutive misses — still fail and keep the raw search shape. */
function chordClear(
  ax: number,
  az: number,
  bx: number,
  bz: number
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return true;
  const steps = Math.max(2, Math.ceil(len * 2));
  let miss = 0;
  let misses = 0;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    if (streetish(ax + dx * t, az + dz * t)) {
      miss = 0;
    } else {
      miss++;
      misses++;
      if (miss > 2 || misses * 8 > steps) return false;
    }
  }
  return true;
}

/** Pull the polyline taut (Google-style string pulling): greedily
 *  replace everything between two points with one straight chord
 *  whenever that chord is all-asphalt. Kills A* staircases on diagonal
 *  streets and wobble on wide carriageways; chords that would cut a
 *  block corner or hop water fail the test, so the raw search shape
 *  survives where the streets do not allow a shortcut. */
function pullStraights(pts: number[]): number[] {
  const n = pts.length >> 1;
  if (n < 3) return pts;
  const out: number[] = [pts[0], pts[1]];
  let i = 0;
  while (i < n - 1) {
    let far = i + 1;
    // cap the lookahead — post-collapse straight runs are already
    // single segments, so only staircase districts pay the search
    const jMax = Math.min(n - 1, i + 64);
    for (let j = jMax; j > far; j--) {
      if (chordClear(pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1])) {
        far = j;
        break;
      }
    }
    out.push(pts[far * 2], pts[far * 2 + 1]);
    i = far;
  }
  return out;
}

/** Round every interior corner with a clamped quadratic Bézier so the
 *  line flows through junctions like Google Maps. The cut distance is
 *  capped by both legs and every arc sample is re-verified on asphalt —
 *  a corner that cannot stay on the street keeps its sharp shape. */
function roundCorners(pts: number[]): number[] {
  const n = pts.length >> 1;
  if (n < 3) return pts.slice();
  const out: number[] = [pts[0], pts[1]];
  const R_MAX = 2.4; // blocks — keeps cuts inside the junction asphalt
  const emitArc = (
    bx: number,
    bz: number,
    p0x: number,
    p0z: number,
    p2x: number,
    p2z: number
  ): boolean => {
    const steps = Math.max(
      2,
      Math.ceil(Math.hypot(p2x - p0x, p2z - p0z) * 2)
    );
    let miss = 0;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const m = 1 - t;
      const qx = m * m * p0x + 2 * m * t * bx + t * t * p2x;
      const qz = m * m * p0z + 2 * m * t * bz + t * t * p2z;
      if (streetish(qx, qz)) {
        miss = 0;
      } else if (++miss > 2) {
        return false;
      }
    }
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const m = 1 - t;
      const qx = m * m * p0x + 2 * m * t * bx + t * t * p2x;
      const qz = m * m * p0z + 2 * m * t * bz + t * t * p2z;
      const len = out.length;
      if (len >= 2 && out[len - 2] === qx && out[len - 1] === qz) continue;
      out.push(qx, qz);
    }
    return true;
  };
  for (let k = 1; k + 1 < n; k++) {
    const ax = pts[(k - 1) * 2];
    const az = pts[(k - 1) * 2 + 1];
    const bx = pts[k * 2];
    const bz = pts[k * 2 + 1];
    const cx = pts[(k + 1) * 2];
    const cz = pts[(k + 1) * 2 + 1];
    const lin = Math.hypot(bx - ax, bz - az);
    const lout = Math.hypot(cx - bx, cz - bz);
    let r = Math.min(R_MAX, lin * 0.45, lout * 0.45);
    let placed = false;
    for (let attempt = 0; attempt < 3 && !placed && r >= 0.4; attempt++) {
      placed = emitArc(
        bx,
        bz,
        bx - ((bx - ax) * r) / lin,
        bz - ((bz - az) * r) / lin,
        bx + ((cx - bx) * r) / lout,
        bz + ((cz - bz) * r) / lout
      );
      if (!placed) r *= 0.5;
    }
    if (!placed) {
      const len = out.length;
      if (out[len - 2] !== bx || out[len - 1] !== bz) out.push(bx, bz);
    }
  }
  const len = out.length;
  const ex = pts[(n - 1) * 2];
  const ez = pts[(n - 1) * 2 + 1];
  if (out[len - 2] !== ex || out[len - 1] !== ez) out.push(ex, ez);
  return out;
}

/* ---------------- helpers ---------------- */

/** Closest passable cell index (local coords), searching outward ring by
 *  ring and preferring roads — used to snap clicked water/plot points to
 *  the routable field. -1 when nothing passable inside `maxR`. */
function nearestPassable(lx: number, lz: number, maxR: number): number {
  const grid = costGrid as Uint8Array;
  let best = -1;
  let bestCls = 255;
  for (let r = 0; r <= maxR; r++) {
    const x0 = Math.max(0, lx - r);
    const x1 = Math.min(GW - 1, lx + r);
    const z0 = Math.max(0, lz - r);
    const z1 = Math.min(GH - 1, lz + r);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (r > 0 && x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
        const i = z * GW + x;
        const cls = grid[i];
        if (cls !== CLS_BLOCKED && cls < bestCls) {
          best = i;
          bestCls = cls;
          if (cls === CLS_ROAD) return best;
        }
      }
    }
  }
  return best;
}

/* ---------------- the A* route search ---------------- */

/** 8-connected step tables: axis moves first, then diagonals. */
const D8X = [1, -1, 0, 0, 1, 1, -1, -1];
const D8Z = [0, 0, 1, -1, 1, -1, 1, -1];
const D8D = [1, 1, 1, 1, DIAG, DIAG, DIAG, DIAG];

/** Shortest route across the street network, absolute grid coords.
 *  `fromGx/fromGz` = player, `toGx/toGz` = clicked block (floats ok).
 *  Returns null when either end is unreachable (deep water, outside). */
export function findCityRoute(
  fromGx: number,
  fromGz: number,
  toGx: number,
  toGz: number
): CityRoute | null {
  ensureCityRouteGrid();
  const cost = enterCost as Float32Array;

  let sx = Math.round(fromGx) - CITY_GRID.gx0;
  let sz = Math.round(fromGz) - CITY_GRID.gz0;
  let gx = Math.round(toGx) - CITY_GRID.gx0;
  let gz = Math.round(toGz) - CITY_GRID.gz0;
  if (
    sx < 0 ||
    sx >= GW ||
    sz < 0 ||
    sz >= GH ||
    gx < 0 ||
    gx >= GW ||
    gz < 0 ||
    gz >= GH
  ) {
    return null;
  }

  // BOTH ends snap to the nearest ROAD when one is in reach — passable
  // footpath/grass cells would put the arrows on the raised cobbles.
  // nearestPassable prefers roads ring by ring and falls back to the
  // clicked cell itself (r = 0), so on-road clicks are untouched.
  const start = nearestPassable(sx, sz, 4);
  if (start < 0) return null;
  const goal = nearestPassable(gx, gz, 8);
  if (goal < 0) return null;
  if (start === goal) {
    return {
      pts: [
        CITY_GRID.gx0 + (start % GW),
        CITY_GRID.gz0 + ((start / GW) | 0),
      ],
      blocks: 0,
    };
  }

  const gScore = new Float32Array(GW * GH).fill(Infinity);
  const prev = new Int32Array(GW * GH).fill(-1);
  const closed = new Uint8Array(GW * GH);

  const gxi = goal % GW;
  const gzi = (goal / GW) | 0;
  // Octile heuristic x10 — admissible with the street-shaped costs:
  // axis steps cost >= 10 (asphalt) and diagonals >= 14.5, so the true
  // cheapest dx/dz mix is 10*max + 4.5*min
  const h = (x: number, z: number): number => {
    const dx = Math.abs(x - gxi);
    const dz = Math.abs(z - gzi);
    return 10 * (dx + dz) - 5.5 * Math.min(dx, dz);
  };

  const sxi = start % GW;
  const szi = (start / GW) | 0;
  heapClear();
  gScore[start] = 0;
  heapPush(h(sxi, szi), start);

  let found = false;
  let pops = 0;
  const MAX_POPS = GW * GH;
  while (heapF.length > 0) {
    const cur = heapPop();
    if (closed[cur]) continue; // lazy-deletion duplicate
    closed[cur] = 1;
    if (cur === goal) {
      found = true;
      break;
    }
    // budget counts UNIQUE expansions — duplicate heap entries must not
    // eat it, or far goals die halfway through the grid (false "no route")
    if (++pops >= MAX_POPS) break;
    const g = gScore[cur];
    const cx = cur % GW;
    const cz = (cur / GW) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + D8X[d];
      const nz = cz + D8Z[d];
      if (nx < 0 || nx >= GW || nz < 0 || nz >= GH) continue;
      const ni = nz * GW + nx;
      if (closed[ni]) continue;
      const ec = cost[ni];
      if (ec === 0) continue; // water / out of reach
      // no squeezing through point-touching block corners: a diagonal
      // step needs at least one orthogonal neighbour passable
      if (d >= 4 && cost[cz * GW + nx] === 0 && cost[nz * GW + cx] === 0) {
        continue;
      }
      const t = g + ec * D8D[d];
      if (t < gScore[ni]) {
        gScore[ni] = t;
        prev[ni] = cur;
        heapPush(t + h(nx, nz), ni);
      }
    }
  }
  if (!found) return null;

  // reconstruct start -> goal, then collapse collinear runs so the
  // polyline turns only at corners (thousands of blocks -> dozens of pts)
  const path: number[] = [];
  for (let c = goal; c !== -1; c = prev[c]) path.push(c);
  path.reverse();
  const pts: number[] = [];
  let ldx = 99;
  let ldz = 99;
  let px = path[0] % GW;
  let pz = (path[0] / GW) | 0;
  pts.push(CITY_GRID.gx0 + px, CITY_GRID.gz0 + pz);
  for (let k = 1; k < path.length; k++) {
    const x = path[k] % GW;
    const z = (path[k] / GW) | 0;
    const dx = x - px;
    const dz = z - pz;
    if (dx !== ldx || dz !== ldz) {
      pts.push(CITY_GRID.gx0 + x, CITY_GRID.gz0 + z);
      ldx = dx;
      ldz = dz;
    }
    px = x;
    pz = z;
  }
  const glx = goal % GW;
  const glz = (goal / GW) | 0;
  if (
    pts[pts.length - 2] !== CITY_GRID.gx0 + glx ||
    pts[pts.length - 1] !== CITY_GRID.gz0 + glz
  ) {
    pts.push(CITY_GRID.gx0 + glx, CITY_GRID.gz0 + glz);
  }

  // true geometric length in blocks — the enter costs are shaped for
  // street following, so they are NOT distances
  let blocks = 0;
  for (let k = 1; k < path.length; k++) {
    const dx = Math.abs((path[k] % GW) - (path[k - 1] % GW));
    const dz = Math.abs(((path[k] / GW) | 0) - ((path[k - 1] / GW) | 0));
    blocks += dx > 0 && dz > 0 ? 1.414 : 1;
  }

  // Safety lives at every stage: chords must be all-asphalt (verified
  // every half block), re-anchored runs re-verify inside runCentreTrack
  // and every Bézier corner sample is re-checked on the street — a
  // shortcut or rounding that leaves the asphalt is discarded and the
  // raw search shape survives, so the centred smooth plan is always
  // returned, never discarded wholesale.
  return {
    pts: roundCorners(centerOnRoads(pullStraights(pts))),
    blocks,
  };
}
