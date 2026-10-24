/**
 * CITY ROAD SMOOTHING — the mine-&-fill pass over the whole road map.
 * The vectorizer's traced strokes (CITY_PATHS) carry hand-drawn wobble:
 * straight streets arrive as chains of tiny jiggling segments and bends
 * arrive as angular zigzags, so the swept block decks wander, kink and
 * stair-step instead of running straight and sweeping smooth arcs. This
 * module rebuilds every stroke's polyline — pure math, done once at
 * load — into clean geometry:
 *
 *   1. RDP SIMPLIFY        drops micro trace jitter below the one-block
 *                          grid resolution.
 *   2. STRAIGHT-RUN FUSE   chains of near-collinear vertices fuse into
 *                          ONE exact straight segment — gated by a
 *                          corridor bound so a fused line can never
 *                          stray out of its traced corridor (junctions
 *                          and neighbouring streets stay put).
 *   3. ARC FILLETS         every remaining genuine corner is replaced
 *                          by a circular fillet arc whose radius scales
 *                          with the street's own width — bends read as
 *                          smooth sweeps, not kinks.
 *
 * Stroke ENDPOINTS stay EXACT (they anchor junctions and the gaps
 * between trace fragments); widths and classes pass through untouched;
 * the path count never changes. Every consumer — the physics raster
 * (cityRoadSurface), the visible cube deck, the minimap grids
 * (cityLayout) and the GPS centreline index (cityRoadCenter) — builds
 * from SMOOTHED_PATHS, so what you drive, what you see, what the map
 * paints and what the arrows follow are all the same cleaned-up
 * network. Pure math; no three.js, no DOM.
 */

import { CITY_PATHS, type CityPath } from './cityRoadmapData';

/* ------------------------------ tuning ---------------------------------- */

/** RDP epsilon, image px (1 px = 100 world units = 1 terrain block),
 *  eased up a little for wide strokes. */
const RDP_EPS_MIN = 0.9;
const RDP_EPS_PER_W = 0.05;
/** Straight-run fuse: max per-vertex turn (rad) while extending a run
 *  (~8 deg — anything straighter than this fuses into one line). */
const RUN_ANG = 0.14;
/** Straight-run corridor cap (px): max lateral deviation of the traced
 *  vertices from the fused straight line — keeps every smoothed street
 *  inside its own traced corridor (0.3 x stroke width, min 0.8 px). */
const RUN_CORRIDOR_MIN = 0.8;
const RUN_CORRIDOR_PER_W = 0.3;
/** Fillet: minimum / maximum corner turn (rad) worth rounding — under
 *  the minimum the kink is sub-block; over the maximum it is a true
 *  hairpin dead-end hook and stays sharp like the trace drew it. */
const FILLET_MIN_ANG = 0.1;
const FILLET_MAX_ANG = 2.35;
/** Fillet radius wanted (px), scaled with the stroke width so wide
 *  carriageways sweep wider, clamped to sane bounds. */
const FILLET_R_MIN = 2.5;
const FILLET_R_PER_W = 1.1;
const FILLET_R_MAX = 18;
/** Arc sampling step (rad) — disc sweeps overlap heavily along the
 *  fillet, so the deck reads one continuous curve. */
const ARC_STEP = 0.12;

type Pt = [number, number];

/* --------------------------- 1. RDP simplify ----------------------------- */

/** Ramer-Douglas-Peucker: drop vertices closer than eps to the chord
 *  (endpoints always survive). Iterative stack — no recursion limits. */
function rdp(P: Pt[], eps: number): Pt[] {
  const n = P.length;
  if (n < 3) return P;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: number[][] = [[0, n - 1]];
  while (stack.length) {
    const seg = stack.pop() as number[];
    const a = seg[0];
    const b = seg[1];
    if (b <= a + 1) continue;
    const ax = P[a][0];
    const ay = P[a][1];
    const dx = P[b][0] - ax;
    const dy = P[b][1] - ay;
    const L = Math.hypot(dx, dy) || 1e-9;
    let best = -1;
    let bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((P[i][0] - ax) * dy - (P[i][1] - ay) * dx) / L;
      if (d > best) {
        best = d;
        bi = i;
      }
    }
    if (best > eps) {
      keep[bi] = 1;
      stack.push([a, bi], [bi, b]);
    }
  }
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(P[i]);
  return out;
}

/* ------------------------- 2. straight-run fuse -------------------------- */

/** Fuse near-collinear runs into exact straight segments. A run extends
 *  while (a) each new vertex turns the run chord by less than angMax
 *  and (b) every traced vertex of the run stays within corridor of the
 *  chord — so straight streets become PERFECTLY straight while real
 *  bends survive for the fillet stage. */
function straightMerge(P: Pt[], angMax: number, corridor: number): Pt[] {
  const n = P.length;
  if (n < 3) return P;
  const out: Pt[] = [P[0]];
  let i = 0;
  while (i < n - 1) {
    let j = i + 1; // a one-segment run is always taken
    while (j < n - 1) {
      const k = j + 1;
      // turn at P[j] between the run chord (Pi->Pj) and the next segment
      const c1x = P[j][0] - P[i][0];
      const c1y = P[j][1] - P[i][1];
      const s2x = P[k][0] - P[j][0];
      const s2y = P[k][1] - P[j][1];
      const l1 = Math.hypot(c1x, c1y);
      const l2 = Math.hypot(s2x, s2y);
      if (l1 < 1e-9 || l2 < 1e-9) {
        j = k; // zero-length trace duplicate — swallow it
        continue;
      }
      const cosA = (c1x * s2x + c1y * s2y) / (l1 * l2);
      const ang = Math.acos(cosA < -1 ? -1 : cosA > 1 ? 1 : cosA);
      if (ang > angMax) break;
      // corridor gate: every run vertex stays near the chord Pi->Pk
      const chx = P[k][0] - P[i][0];
      const chy = P[k][1] - P[i][1];
      const L = Math.hypot(chx, chy) || 1e-9;
      let ok = true;
      for (let m = i + 1; m < k; m++) {
        const d =
          Math.abs((P[m][0] - P[i][0]) * chy - (P[m][1] - P[i][1]) * chx) / L;
        if (d > corridor) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
      j = k;
    }
    out.push(P[j]);
    i = j;
  }
  return out;
}

/* ---------------------------- 3. arc fillets ----------------------------- */

/** Replace every genuine interior corner with a circular fillet arc.
 *  The tangent length t = R / tan(ang/2) is clamped to 45% of each
 *  adjacent segment, so fillets can never collide across a vertex or
 *  reach a stroke endpoint — junction anchors stay exact. */
function fillet(P: Pt[], rWant: number): Pt[] {
  const n = P.length;
  if (n < 3) return P;
  const out: Pt[] = [P[0]];
  for (let i = 1; i < n - 1; i++) {
    const p0 = P[i - 1];
    const p1 = P[i];
    const p2 = P[i + 1];
    const v1x = p1[0] - p0[0];
    const v1y = p1[1] - p0[1];
    const v2x = p2[0] - p1[0];
    const v2y = p2[1] - p1[1];
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 < 1e-9 || l2 < 1e-9) continue; // swallow trace duplicates
    const u1x = v1x / l1;
    const u1y = v1y / l1;
    const u2x = v2x / l2;
    const u2y = v2y / l2;
    const cross = u1x * u2y - u1y * u2x;
    const dot = u1x * u2x + u1y * u2y;
    const ang = Math.atan2(Math.abs(cross), dot);
    if (ang < FILLET_MIN_ANG || ang > FILLET_MAX_ANG) {
      out.push(p1);
      continue;
    }
    const cap = 0.45 * Math.min(l1, l2);
    const t = Math.min(rWant / Math.tan(ang / 2), cap);
    const R = t * Math.tan(ang / 2);
    // tangent points on the two segments
    const tax = p1[0] - u1x * t;
    const tay = p1[1] - u1y * t;
    const tbx = p1[0] + u2x * t;
    const tby = p1[1] + u2y * t;
    // arc centre: perpendicular to the incoming heading, turn side
    const side = cross >= 0 ? 1 : -1;
    const nx = -u1y * side;
    const ny = u1x * side;
    const cx = tax + nx * R;
    const cy = tay + ny * R;
    const a0 = Math.atan2(tay - cy, tax - cx);
    const a1 = Math.atan2(tby - cy, tbx - cx);
    let dA = a1 - a0;
    while (dA > Math.PI) dA -= 2 * Math.PI;
    while (dA < -Math.PI) dA += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(dA) / ARC_STEP));
    out.push([tax, tay]);
    for (let s = 1; s < steps; s++) {
      const a = a0 + (dA * s) / steps;
      out.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    out.push([tbx, tby]);
  }
  out.push(P[n - 1]);
  return out;
}

/* ------------------------------ the pass --------------------------------- */

let origPts = 0;
let smoothPts = 0;

/** Smooth one traced stroke (see the module header). */
function smoothPath(p: CityPath): CityPath {
  const n = p.pts.length >> 1;
  if (n < 3) return p; // 1-2 point fragments are already straight
  const P: Pt[] = new Array(n);
  for (let i = 0; i < n; i++) P[i] = [p.pts[2 * i], p.pts[2 * i + 1]];
  const first = P[0];
  const last = P[n - 1];
  const eps = Math.max(RDP_EPS_MIN, RDP_EPS_PER_W * p.w);
  const corridor = Math.max(RUN_CORRIDOR_MIN, RUN_CORRIDOR_PER_W * p.w);
  const rWant = Math.min(
    FILLET_R_MAX,
    Math.max(FILLET_R_MIN, FILLET_R_PER_W * p.w)
  );
  let Q = rdp(P, eps);
  Q = straightMerge(Q, RUN_ANG, corridor);
  Q = fillet(Q, rWant);
  // pin the junction anchors exactly where the trace had them
  Q[0] = first;
  Q[Q.length - 1] = last;
  // flatten + thin degenerates
  const out: number[] = [];
  let px = 1e9;
  let py = 1e9;
  for (const q of Q) {
    if (Math.abs(q[0] - px) < 0.05 && Math.abs(q[1] - py) < 0.05) continue;
    out.push(Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100);
    px = q[0];
    py = q[1];
  }
  if (out.length < 4) return p; // degenerated — keep the original stroke
  out[0] = first[0];
  out[1] = first[1];
  out[out.length - 2] = last[0];
  out[out.length - 1] = last[1];
  origPts += n;
  smoothPts += out.length >> 1;
  return { pts: out, w: p.w, cls: p.cls };
}

/** The whole network, smoothed once at load. Same paths in the same
 *  order with the same widths/classes — only the polylines are cleaned
 *  up: straight runs dead straight, bends sweeping circular arcs. */
export const SMOOTHED_PATHS: CityPath[] = CITY_PATHS.map(smoothPath);

/** Build summary for the debug rig / worklog. */
export function cityRoadSmoothStats(): {
  paths: number;
  origPts: number;
  smoothPts: number;
} {
  return { paths: SMOOTHED_PATHS.length, origPts, smoothPts };
}
