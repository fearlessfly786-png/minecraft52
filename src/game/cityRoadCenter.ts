/**
 * CITY ROAD CENTRE-LINE INDEX — exact road centres for route guidance.
 *
 * The A* router (cityRoute.ts) walks road CELL centres, so on one of
 * the wide traced carriageways (the common 12 px streets sweep out to
 * 1500 world units across) its polyline can hug whichever lane won the
 * search. This module indexes the traced strokes themselves —
 * CITY_PATHS, the exact polylines the city builder sweeps into the
 * asphalt decks — into a uniform world-space segment hash and answers
 * one query: "the nearest road CENTRELINE point near me whose street
 * runs along my direction". The router re-samples its road runs onto
 * that centreline, so the navigation arrows and the map line both
 * paint down the MIDDLE of the street.
 *
 * Each segment also carries its stroke's own deck half width, so the
 * router can tell "the centreline of the street I am driving on" from
 * "some other street that happens to pass nearby": a projection is
 * only meaningful when the query point sits inside that stroke's deck.
 *
 * Pure math, no DOM, no three.js — the index builds lazily in a few
 * milliseconds on the first route plan and every query afterwards is a
 * handful of bucket lookups.
 */

import {
  CITY_WD,
  CITY_WW,
  CITY_WX0,
  CITY_WZ0,
  cityRoadWU,
} from './cityLayout';
import { CITY_IMG_H, CITY_IMG_W } from './cityRoadmapData';
import { SMOOTHED_PATHS } from './cityRoadSmooth';

/** Hash cell in world units (~6 blocks) — segments are subdivided to
 *  at most two cells long, so a lookup never touches more than a 3x3
 *  bucket neighbourhood per ring. */
const CELL = 640;
/** Snap reach — comfortably past the widest traced half width (the
 *  34 px runway strip sweeps to 2125 u) so even a route running along
 *  the outermost kerb cell can still find its own centreline. */
const SNAP_R = 2300;
/** Direction gate — a candidate centreline must run within ~35 deg of
 *  the route run's direction. Tight enough to keep crossing streets
 *  (and diagonal junction shortcuts) out of the answer, loose enough
 *  that the curved traced streets still match their own segments. */
const COS_GATE = 0.82;
/** Projection overhang — the traced strokes are short fragments with
 *  gaps, so a query may sit just past a fragment's end; project up to
 *  this far beyond it. Anything further clamps to the endpoint (and
 *  its distance explodes, disqualifying it) so a distant collinear
 *  street can never hijack the snap. */
const PROJ_EXT = 600;

/* packed segment store (world coords) */
let sAx = new Float32Array(0);
let sAz = new Float32Array(0);
let sUx = new Float32Array(0);
let sUz = new Float32Array(0);
let sLen = new Float32Array(0);
let sW = new Float32Array(0); // own deck half width per segment
let buckets: Map<number, number[]> | null = null;

/** Bucket key — city world coords span ~[-260k, +141k], so cell indices
 *  stay far inside the +-4096 bias and the packing never collides. */
function bkey(bx: number, bz: number): number {
  return (bx + 4096) * 16384 + (bz + 4096);
}

/** Reference-image pixel -> world (the same linear mapping the city
 *  builder uses to sweep the decks). */
function imgToWorld(px: number, py: number): [number, number] {
  return [
    CITY_WX0 + (px / CITY_IMG_W) * CITY_WW,
    CITY_WZ0 + (py / CITY_IMG_H) * CITY_WD,
  ];
}

/** Build (once) the subdivided segment index over every traced path.
 *  Sub-segments carry their parent stroke's deck half width. */
function ensureIndex(): void {
  if (buckets) return;
  const raw: number[] = []; // ax, az, bx, bz, halfW per sub-segment
  for (const p of SMOOTHED_PATHS) {
    const pts = p.pts;
    const halfW = cityRoadWU(p.w) / 2;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      let [ax, az] = imgToWorld(pts[i], pts[i + 1]);
      const [ex, ez] = imgToWorld(pts[i + 2], pts[i + 3]);
      const len = Math.hypot(ex - ax, ez - az);
      if (len < 1) continue;
      const chunks = Math.max(1, Math.ceil(len / (CELL * 2)));
      const stepX = (ex - ax) / chunks;
      const stepZ = (ez - az) / chunks;
      for (let c = 0; c < chunks; c++) {
        const bx = c === chunks - 1 ? ex : ax + stepX;
        const bz = c === chunks - 1 ? ez : az + stepZ;
        raw.push(ax, az, bx, bz, halfW);
        ax = bx;
        az = bz;
      }
    }
  }
  const n = raw.length / 5;
  sAx = new Float32Array(n);
  sAz = new Float32Array(n);
  sUx = new Float32Array(n);
  sUz = new Float32Array(n);
  sLen = new Float32Array(n);
  sW = new Float32Array(n);
  const map = new Map<number, number[]>();
  for (let s = 0; s < n; s++) {
    const ax = (sAx[s] = raw[s * 5]);
    const az = (sAz[s] = raw[s * 5 + 1]);
    const bx = raw[s * 5 + 2];
    const bz = raw[s * 5 + 3];
    sW[s] = raw[s * 5 + 4];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    sLen[s] = Math.hypot(dx, dz);
    sUx[s] = dx / len;
    sUz[s] = dz / len;
    for (
      let cx = Math.floor(Math.min(ax, bx) / CELL);
      cx <= Math.floor(Math.max(ax, bx) / CELL);
      cx++
    ) {
      for (
        let cz = Math.floor(Math.min(az, bz) / CELL);
        cz <= Math.floor(Math.max(az, bz) / CELL);
        cz++
      ) {
        const k = bkey(cx, cz);
        const list = map.get(k);
        if (list) list.push(s);
        else map.set(k, [s]);
      }
    }
  }
  buckets = map;
}

/** Nearest road-centreline point to world (wx, wz) over traced
 *  segments whose direction agrees with (hx, hz). Returns
 *  [x, z, ownDeckHalfWidth] — null when nothing direction-matched is
 *  in reach (the caller keeps its original line). */
export function snapToRoadCenter(
  wx: number,
  wz: number,
  hx: number,
  hz: number
): [number, number, number] | null {
  ensureIndex();
  const bk = buckets as Map<number, number[]>;
  const hl = Math.hypot(hx, hz);
  if (hl < 1e-6) return null;
  const hnx = hx / hl;
  const hnz = hz / hl;
  const cx0 = Math.floor(wx / CELL);
  const cz0 = Math.floor(wz / CELL);
  const rings = Math.ceil(SNAP_R / CELL);
  const maxD2 = SNAP_R * SNAP_R;
  let bestInD2 = Infinity; // nearest deck-CONTAINING match
  let bestAnyD2 = Infinity; // nearest match of any kind
  let bestX = 0;
  let bestZ = 0;
  let bestW = 0;
  for (let r = 0; r <= rings; r++) {
    for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
      for (let cz = cz0 - r; cz <= cz0 + r; cz++) {
        // perimeter of the ring square only — inner cells already done
        if (
          r > 0 &&
          cx > cx0 - r &&
          cx < cx0 + r &&
          cz > cz0 - r &&
          cz < cz0 + r
        ) {
          continue;
        }
        const list = bk.get(bkey(cx, cz));
        if (!list) continue;
        for (let li = 0; li < list.length; li++) {
          const s = list[li];
          const rx = wx - sAx[s];
          const rz = wz - sAz[s];
          const tRaw = rx * sUx[s] + rz * sUz[s];
          // perpendicular distance to the segment's line — a query
          // within the stroke's own half width is riding THAT street
          const cross = Math.abs(rx * sUz[s] - rz * sUx[s]);
          let t = tRaw;
          if (t < -PROJ_EXT) t = -PROJ_EXT;
          else if (t > sLen[s] + PROJ_EXT) t = sLen[s] + PROJ_EXT;
          const px = sAx[s] + sUx[s] * t;
          const pz = sAz[s] + sUz[s] * t;
          const d2 = (px - wx) * (px - wx) + (pz - wz) * (pz - wz);
          if (d2 > maxD2) continue;
          const dot = sUx[s] * hnx + sUz[s] * hnz;
          if (dot < COS_GATE && dot > -COS_GATE) continue;
          if (cross <= sW[s]) {
            // deck-contained beats anything not containing the query
            if (d2 < bestInD2) {
              bestInD2 = d2;
              bestX = px;
              bestZ = pz;
              bestW = sW[s];
            }
          } else if (d2 < bestAnyD2) {
            bestAnyD2 = d2;
            if (bestInD2 === Infinity) {
              bestX = px;
              bestZ = pz;
              bestW = sW[s];
            }
          }
        }
      }
    }
  }
  return bestInD2 < Infinity || bestAnyD2 < Infinity
    ? [bestX, bestZ, bestW]
    : null;
}
