/**
 * VOLCANO TERRAIN for RATFIRE — real stratovolcano cones for the volcano
 * biome. The biome's factor field (extraBiomes.ts) paints jagged black
 * ash-fields; this module raises an actual VOLCANO inside every volcano
 * zone — hand showcase circles AND natural countries alike — so the zone
 * is named for what stands in it:
 *
 *  - CONE: a concave stratovolcano profile (steep near the summit,
 *    easing to the ash plain) added on top of the terrain, ~54-60 blocks
 *    tall over a 132-144 block base radius — big enough to read as a
 *    mountain from across the biome, still walkable block-by-block.
 *  - CALDERA: the summit is cut into a jagged-rim crater — a parabolic
 *    bowl dipping ~21 blocks below the rim.
 *  - LAVA LAKE: the caldera floor holds a flat glowing lava pool (the
 *    `lava` weight marks its blocks for the emissive lava material and
 *    the minimap); its surface sits a touch below the local bowl so a
 *    natural rock lip rings the molten core.
 *  - LAVA FLOWS: 4-6 breached-rim streams pour down the flank, meandering
 *    with distance and fanning slightly — material-only (the slope keeps
 *    its shape), so they read as glowing rivers coating the black rock.
 *
 * Everything is PURE MATH and 100% DETERMINISTIC (integer-hash based —
 * no THREE, no perlin, no session seed), so terrain meshes, collision,
 * the ash plume, the ember-glow and the minimap all agree on every cone,
 * crater and lava pixel without any shared mutable state.
 */

import { VOLCANO_ZONES, volcanoCountryAt } from './extraBiomes';

/** One volcano's deterministic build plan (derived from its centre). */
interface VolcanoSpec {
  /** Grid-block centre of the cone (= the zone centre). */
  cx: number;
  cz: number;
  /** Cone base radius, blocks — the flank reaches 0 here. */
  baseR: number;
  /** Rim height above the local terrain datum, blocks. */
  rimH: number;
  /** Mean crater radius, blocks (the rim itself jags ±~2.2 per angle). */
  craterR: number;
  /** Caldera bowl depth below the rim, blocks. */
  depth: number;
  /** Lava-pool surface below the rim, blocks. */
  lakeDrop: number;
  /** How far below the rim the pool edge sits relative to the bowl. */
  poolMargin: number;
  /** Max flank run of the lava flows, blocks. */
  flowLen: number;
  /** Active flow bearings (radians). */
  flows: number[];
  /** Per-volcano hash salt for the rim jag + flow meander. */
  salt: number;
}

/** 0..1 deterministic integer hash — the biome modules' standard. */
function hash2(ix: number, iz: number, salt: number): number {
  let h = (ix * 374761393 + iz * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

/** Clamped 0..1 smoothstep. */
function smoothstep01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** Salt bases so hand cones and natural cones derive independent plans. */
const HAND_SALT = 90211;
const NATURAL_SALT = 93277;

/** Spec cache — keyed by centre, computed exactly once per volcano. */
const SPEC_CACHE = new Map<string, VolcanoSpec>();

function coneSpec(cx: number, cz: number, saltBase: number): VolcanoSpec {
  const key = cx + ',' + cz;
  const hit = SPEC_CACHE.get(key);
  if (hit) return hit;

  const r = (s: number) => hash2(cx, cz, saltBase + s);
  const flows: number[] = [];
  for (let k = 0; k < 6; k++) {
    // ~78% of the six evenly-spread bearings grow a flow (4-6 streams)
    if (hash2(cx, cz, saltBase + 100 + k) < 0.78) {
      flows.push(k * (Math.PI / 3) + (r(200 + k) - 0.5) * 0.7);
    }
  }

  const spec: VolcanoSpec = {
    cx,
    cz,
    baseR: 132 + r(11) * 12, // 132..144 — always inside the zone core (160+)
    rimH: 54 + r(22) * 6, // 54..60 blocks of mountain
    craterR: 22 + r(33) * 4, // 22..26
    depth: 21,
    lakeDrop: 15,
    poolMargin: 8,
    flowLen: 80 + r(44) * 44, // 80..124 — ends on the flank
    flows,
    salt: 1 + ((r(55) * 8191) | 0),
  };
  SPEC_CACHE.set(key, spec);
  return spec;
}

/** Jagged crater rim: smooth per-angle wobble (pure sines of the angle,
 *  so it wraps seamlessly around the circle), ≈ -1..1. */
function rimJitter(angle: number, salt: number): number {
  return (
    Math.sin(angle * 3 + salt * 0.711) * 0.55 +
    Math.sin(angle * 7 + salt * 1.313) * 0.3 +
    Math.sin(angle * 13 + salt * 2.117) * 0.15
  );
}

/** Smallest signed angle difference a-b, wrapped to [-PI, PI]. */
function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/* ---------------- per-block sample ---------------- */

export interface VolcanoSample {
  /** Flank/bowl height to ADD to the block (blocks; 0 outside all cones). */
  add: number;
  /** 0..1 lava weight — pool core, flow stripes; >0.55 renders as lava. */
  lava: number;
  /** 0..1 cone mask — damps the ash-field jagged noise under the cone. */
  mask: number;
  /** Lava-pool surface as an offset above the pre-volcano base height. */
  lavaDatum: number;
  /** True when `lava` comes from the caldera pool (vs a flank flow). */
  hasPool: boolean;
}

const sample: VolcanoSample = {
  add: 0,
  lava: 0,
  mask: 0,
  lavaDatum: 0,
  hasPool: false,
};

/** The CURRENT block being sampled — set by volcanoSampleAt so the inner
 *  helpers stay signature-free and allocation-free. */
let CUR_GX = 0;
let CUR_GZ = 0;

/**
 * Samples every volcano that could cover (gx, gz): hand cones + the 3x3
 * climate-cell neighbourhood of natural cones. Fills and returns the
 * SHARED sample scratch (allocation-free; consume before the next call).
 */
export function volcanoSampleAt(gx: number, gz: number): VolcanoSample {
  CUR_GX = gx;
  CUR_GZ = gz;
  sample.add = 0;
  sample.lava = 0;
  sample.mask = 0;
  sample.hasPool = false;

  const cellX = Math.floor(gx / 640); // must mirror extraBiomes.CLIMATE_CELL
  const cellZ = Math.floor(gz / 640);
  for (let i = -1; i <= 1; i++) {
    for (let k = -1; k <= 1; k++) {
      const country = volcanoCountryAt(cellX + i, cellZ + k);
      if (country) {
        samplePoint(
          country.cx,
          country.cz,
          NATURAL_SALT + (cellX + i) * 7919 + (cellZ + k) * 104729,
          sample
        );
      }
    }
  }
  for (let i = 0; i < VOLCANO_ZONES.length; i++) {
    const z = VOLCANO_ZONES[i];
    samplePoint(z.cx, z.cz, HAND_SALT + i * 211, sample);
  }
  return sample;
}

/** Samples one cone for the current block into `out` (max-blend). */
function samplePoint(
  cx: number,
  cz: number,
  saltBase: number,
  out: VolcanoSample
): void {
  const spec = coneSpec(cx, cz, saltBase);
  const dx = CUR_GX - cx;
  const dz = CUR_GZ - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > spec.baseR * spec.baseR) return; // beyond the cone base
  const d = Math.sqrt(d2);
  const angle = Math.atan2(dz, dx);
  const craterR = spec.craterR + rimJitter(angle, spec.salt) * 2.2;

  if (d < craterR) {
    // ---- CALDERA: parabolic bowl dipping below the rim ----
    const t = d / craterR;
    const bowl = spec.rimH - spec.depth * (1 - Math.pow(t, 1.7));
    if (bowl > out.add) out.add = bowl;
    out.mask = 1;
    // lava pool: a flat molten disc on the caldera floor
    const poolR = craterR - spec.poolMargin;
    const lw =
      d < poolR - 1.2
        ? 1
        : 1 - smoothstep01((d - (poolR - 1.2)) / 1.2);
    if (lw > out.lava) {
      out.lava = lw;
      out.lavaDatum = spec.rimH - spec.lakeDrop;
      out.hasPool = true;
    }
    return;
  }

  // ---- FLANK: concave stratovolcano profile ----
  const t = (spec.baseR - d) / (spec.baseR - craterR);
  if (t <= 0) return;
  const flank = spec.rimH * Math.pow(t, 1.35);
  if (flank > out.add) out.add = flank;
  // the cone smooths the ash-field jaggedness (fully near the summit)
  const m = Math.pow(t, 0.7);
  if (m > out.mask) out.mask = m;

  // ---- LAVA FLOWS: meandering glowing stripes down the slope ----
  if (spec.flows.length > 0) {
    const nearRim = smoothstep01((d - craterR) / 3);
    const farFade = smoothstep01((spec.flowLen - d) / 6);
    if (nearRim > 0 && farFade > 0) {
      const meander = Math.sin(d * 0.19 + spec.salt * 0.731) * 0.09;
      const linearHalf = 1.5 + d * 0.018; // fans out downslope
      for (let f = 0; f < spec.flows.length; f++) {
        const dAng = Math.abs(angDiff(angle, spec.flows[f] + meander));
        const across = dAng * d;
        if (across > linearHalf) continue;
        const w =
          nearRim *
          farFade *
          (1 - smoothstep01((across - (linearHalf - 0.9)) / 0.9));
        if (w > out.lava) {
          out.lava = w;
          out.hasPool = false;
        }
      }
    }
  }
}

/** Convenience wrapper for consumers that only need the lava weight
 *  (the minimap) — same field the terrain bucket uses. */
export function volcanoLavaWeight(gx: number, gz: number): number {
  CUR_GX = gx;
  CUR_GZ = gz;
  return volcanoSampleAt(gx, gz).lava;
}

/* ---------------- world-space queries (plume / glow / debug) ---------------- */

export interface VolcanoNear {
  /** False when no cone stands within visibility range. */
  has: boolean;
  /** World-space crater centre. */
  x: number;
  z: number;
  /** Distance from the query point, grid blocks. */
  distBlocks: number;
  /** 0..1 proximity glow (1 standing on the rim, 0 at fade range). */
  glow: number;
}

const near: VolcanoNear = {
  has: false,
  x: 0,
  z: 0,
  distBlocks: 0,
  glow: 0,
};

/** Fade range for the crater glow — ~2.4 cone radii out. */
function glowFade(baseR: number): number {
  return baseR * 2.4;
}

/**
 * Nearest volcano to a WORLD position (for the ash plume anchor, the
 * ember-glow sky cast and the debug handle). Allocation-free scratch.
 */
export function nearestVolcanoWorld(
  x: number,
  z: number,
  block: number,
  gridOffset: number
): VolcanoNear {
  const gx = Math.round(x / block) + gridOffset;
  const gz = Math.round(z / block) + gridOffset;

  let bestD2 = Infinity;
  let bestCx = 0;
  let bestCz = 0;
  let bestBaseR = 60;
  let found = false;

  const cellX = Math.floor(gx / 640); // must mirror extraBiomes.CLIMATE_CELL
  const cellZ = Math.floor(gz / 640);
  for (let i = -1; i <= 1; i++) {
    for (let k = -1; k <= 1; k++) {
      const country = volcanoCountryAt(cellX + i, cellZ + k);
      if (!country) continue;
      const dx = gx - country.cx;
      const dz = gz - country.cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        const spec = coneSpec(
          country.cx,
          country.cz,
          NATURAL_SALT + (cellX + i) * 7919 + (cellZ + k) * 104729
        );
        bestD2 = d2;
        bestCx = country.cx;
        bestCz = country.cz;
        bestBaseR = spec.baseR;
        found = true;
      }
    }
  }
  for (let i = 0; i < VOLCANO_ZONES.length; i++) {
    const zone = VOLCANO_ZONES[i];
    const dx = gx - zone.cx;
    const dz = gz - zone.cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      const spec = coneSpec(zone.cx, zone.cz, HAND_SALT + i * 211);
      bestD2 = d2;
      bestCx = zone.cx;
      bestCz = zone.cz;
      bestBaseR = spec.baseR;
      found = true;
    }
  }

  if (!found) {
    near.has = false;
    return near;
  }
  const dist = Math.sqrt(bestD2);
  near.has = true;
  near.x = (bestCx - gridOffset) * block;
  near.z = (bestCz - gridOffset) * block;
  near.distBlocks = dist;
  near.glow = smoothstep01(1 - dist / glowFade(bestBaseR));
  return near;
}

/** World-space info about hand volcano `i` — the debug teleport helper.
 *  `viewX/viewZ` sits just outside the cone on the spawn-facing side so
 *  teleporting there frames the whole mountain. */
export function handVolcanoInfo(
  i: number,
  block: number,
  gridOffset: number
): {
  x: number;
  z: number;
  viewX: number;
  viewZ: number;
  baseRBlocks: number;
  rimHBlocks: number;
  craterRBlocks: number;
} {
  const zone = VOLCANO_ZONES[i % VOLCANO_ZONES.length];
  const spec = coneSpec(zone.cx, zone.cz, HAND_SALT + (i % VOLCANO_ZONES.length) * 211);
  const x = (spec.cx - gridOffset) * block;
  const z = (spec.cz - gridOffset) * block;
  const out = spec.baseR + 26; // vantage ring just past the cone base
  return {
    x,
    z,
    viewX: x - Math.sign(spec.cx - 64) * out * block,
    viewZ: z - Math.sign(spec.cz - 64) * out * block,
    baseRBlocks: spec.baseR,
    rimHBlocks: spec.rimH,
    craterRBlocks: spec.craterR,
  };
}

/* ---------------- flow-simulation queries (lavaFlow.ts) ---------------- */

/** One rim breach where the caldera pool pours out of the cone. */
export interface VolcanoBreach {
  /** Grid-block cell of the breach (just outside the jagged rim). */
  gx: number;
  gz: number;
}

/** Everything the dynamic lava-flow simulation needs about one cone. */
export interface VolcanoFlowInfo {
  /** Grid-block centre of the cone. */
  cx: number;
  cz: number;
  /** Cone base radius, grid blocks. */
  baseR: number;
  /** Rim height above the pre-volcano terrain datum, grid blocks. */
  rimH: number;
  /** Per-volcano salt (deterministic flavouring downstream). */
  salt: number;
  /** True for hand showcase cones (vs natural country cones). */
  hand: boolean;
  /** Rim breach cells, one per active flow bearing. */
  breaches: VolcanoBreach[];
}

/** Enumerates every volcano relevant to (gx, gz) — the same hand zones +
 *  3x3 natural-country sweep the sampler uses, but exposing the CONCRETE
 *  spec: rim breach cells derived from each cone's flow bearings (the same
 *  bearings the baked flank stripes follow, so the dynamic rivers pour
 *  exactly where the caldera art already breaches the rim). */
export function volcanoesNear(gx: number, gz: number): VolcanoFlowInfo[] {
  const out: VolcanoFlowInfo[] = [];
  const push = (cx: number, cz: number, saltBase: number, hand: boolean) => {
    const spec = coneSpec(cx, cz, saltBase);
    const breaches: VolcanoBreach[] = [];
    for (let f = 0; f < spec.flows.length; f++) {
      const bearing = spec.flows[f];
      const craterR = spec.craterR + rimJitter(bearing, spec.salt) * 2.2;
      breaches.push({
        gx: Math.round(cx + Math.cos(bearing) * (craterR + 0.5)),
        gz: Math.round(cz + Math.sin(bearing) * (craterR + 0.5)),
      });
    }
    out.push({
      cx,
      cz,
      baseR: spec.baseR,
      rimH: spec.rimH,
      salt: spec.salt,
      hand,
      breaches,
    });
  };

  const cellX = Math.floor(gx / 640); // must mirror extraBiomes.CLIMATE_CELL
  const cellZ = Math.floor(gz / 640);
  for (let i = -1; i <= 1; i++) {
    for (let k = -1; k <= 1; k++) {
      const country = volcanoCountryAt(cellX + i, cellZ + k);
      if (country) {
        push(
          country.cx,
          country.cz,
          NATURAL_SALT + (cellX + i) * 7919 + (cellZ + k) * 104729,
          false
        );
      }
    }
  }
  for (let i = 0; i < VOLCANO_ZONES.length; i++) {
    const z = VOLCANO_ZONES[i];
    push(z.cx, z.cz, HAND_SALT + i * 211, true);
  }
  return out;
}
