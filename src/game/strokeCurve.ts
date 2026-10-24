/**
 * STROKE CURVE GEOMETRY — pure math for the city-map painter's CURVE
 * tool: sample a quadratic bezier that passes through a dragged bend
 * point and offset a polyline sideways (the road's flanking footpath
 * spines). 1 unit = 1 cache px = 1 terrain block, same space the
 * painter works in.
 *
 * No three.js, no DOM, no state — safe to call from anywhere.
 */

/**
 * Sample a quadratic bezier defined by endpoints (x0,z0)-(x1,z1) and
 * a midpoint (mx,mz) the curve must pass through exactly at t = 0.5
 * (the dragged bend handle). Returns a flat polyline [x0,z0,x1,z1,...]
 * in the same units, sampled roughly every `step` units along the arc
 * length (8..256 samples), endpoints included and exact.
 *
 * With the bend on the straight chord between the endpoints the
 * control point collapses onto the chord and the samples degenerate to
 * a perfectly straight line — the curve tool then behaves like a
 * click-placed line tool.
 */
export function quadBezierThrough(
  x0: number,
  z0: number,
  mx: number,
  mz: number,
  x1: number,
  z1: number,
  step = 1.2
): number[] {
  // B(0.5) = 0.25*P0 + 0.5*C + 0.25*P1 = M  =>  C = 2M - (P0+P1)/2
  const cx = 2 * mx - (x0 + x1) / 2;
  const cz = 2 * mz - (z0 + z1) / 2;
  const est = Math.hypot(mx - x0, mz - z0) + Math.hypot(x1 - mx, z1 - mz);
  // EVEN sample count — t = 0.5 (the bend midpoint M) is then always an
  // exact sample of the returned polyline
  let n = Math.max(8, Math.min(256, Math.ceil(est / step)));
  if (n % 2 !== 0) n++;
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push(
      u * u * x0 + 2 * u * t * cx + t * t * x1,
      u * u * z0 + 2 * u * t * cz + t * t * z1
    );
  }
  return pts;
}

/**
 * Offset a flat polyline sideways by `d` units along the local normal,
 * once to each side — the two kerb footpath spines that flank a painted
 * road. Returns [left, right] as flat polylines with the SAME sample
 * count as the input (dense input => the per-point offset needs no
 * miter handling; ends reuse the nearest segment tangent).
 */
export function offsetPolyline(
  pts: number[],
  d: number
): [number[], number[]] {
  const n = pts.length / 2;
  const left: number[] = [];
  const right: number[] = [];
  let tx = 0;
  let tz = 0;
  for (let i = 0; i < n; i++) {
    const prev = Math.max(0, i - 1);
    const next = Math.min(n - 1, i + 1);
    const dx = pts[next * 2] - pts[prev * 2];
    const dz = pts[next * 2 + 1] - pts[prev * 2 + 1];
    const len = Math.hypot(dx, dz);
    if (len > 1e-6) {
      tx = dx / len;
      tz = dz / len;
    }
    const x = pts[i * 2];
    const z = pts[i * 2 + 1];
    // normal = tangent rotated +90°
    left.push(x - tz * d, z + tx * d);
    right.push(x + tz * d, z - tx * d);
  }
  return [left, right];
}
