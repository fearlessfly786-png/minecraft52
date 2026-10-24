/**
 * VEHICLE FOOTPATH COLLISION — the city's raised kerbed footpaths are
 * SOLID to every vehicle (jeep + NASCAR + the Hot Wheels fleet).
 *
 * THE RULE
 *   A car can never drive, reverse or be shoved onto a footpath. The
 *   footpath raster (cityRoadSurface.cityRoadClassAt — the same blocky
 *   field the visible kerb cubes are built from, so physics IS the
 *   visible deck) answers one O(1) query per probe point; the vehicle
 *   footprint is sampled at 20 points across its oriented bounding box.
 *
 * THE HIT (the request)
 *   When any probe lands on a footpath the drive step:
 *   1. BLOCKS the move — a sweep (bisection between the last clear pose
 *      and the attempted one, position AND yaw together) holds the car
 *      at the deepest pose that still clears every probe, so the car
 *      can never tunnel through or swing its nose onto the deck.
 *   2. SPARKS — metal-on-stone spray emitted at the EXACT kerb-edge
 *      point where the struck car part crossed onto the footpath (the
 *      anchor is bisected between the part's attempted position and the
 *      same part at the resolved pose, so every streak is born BETWEEN
 *      the car part and the kerb). The spray scales with the impact
 *      speed, the impact angle (head-on = a burst that splashes back
 *      off the wall, grazing = a stream that runs along the kerb) and
 *      the car part that struck (nose throws hardest, tail least).
 *   3. SLIDES — three contact regimes, all frame-rate independent:
 *      - IMPACT (hard press ≥ IMPACT_INTO): the into-wall speed dies
 *        while the along-kerb speed survives, scaled by the hit angle —
 *        a shallow hit keeps ~98% (the car glides down the kerb), a
 *        head-on keeps ~40% + a rebound crunch. The pose then settles a
 *        few units OFF the kerb.
 *      - GRIND (fast scrape, low press): a wall-slide with soft wall
 *        friction — the car HUGS the kerb and keeps streaming sparks
 *        while it slides smoothly along the edge.
 *      - REST (slow press): the press is killed and the car is eased a
 *        few units OFF the kerb — it never welds to the footpath and
 *        frees instantly (no more kerb-attached cars).
 *      The nose slews toward the slide direction with a smooth
 *      exponential approach (never a snap), stronger the shallower the
 *      hit.
 *
 * STUCK RECOVERY: a pose that STARTS the frame inside a footpath (a
 * vehicle-vs-vehicle shove, a debug teleport) walks out along the local
 * escape normal in fine 12u steps — minimal travel, no teleport snap.
 *
 * The module owns ONE pooled spark system (additive streak quads) shared
 * by every vehicle; `updateFootpathSparks` is called from each vehicle's
 * updateFx and de-duplicates same-frame double calls itself.
 */

import * as THREE from 'three';
import {
  cityRoadClassAt,
  cityWalkCutAtW,
  cityFootpathEditStrokeW,
} from './cityRoadSurface';

/* ------------------------------ tuning ---------------------------------- */

/** Footpath probe points as fractions of the vehicle's collision
 *  (half-width, half-length): corners, side shoulders + mids, nose and
 *  tail tips + quarters. 20 samples catch every ~100u raster cell the
 *  OBB can clip without costing a frame. */
const PROBES: Array<[number, number]> = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0.72],
  [-1, 0.72],
  [1, -0.72],
  [-1, -0.72],
  [1, 0.36],
  [-1, 0.36],
  [1, -0.36],
  [-1, -0.36],
  [1, 0],
  [-1, 0],
  [0.5, 1],
  [-0.5, 1],
  [0.5, -1],
  [-0.5, -1],
  [0, 1],
  [0, -1],
];

/** Escape-march: directions × step to find the way out of a footpath
 *  (shortest escape ≈ the boundary normal). */
const ESCAPE_DIRS = 12;
const ESCAPE_STEP = 40;
const ESCAPE_MAX = 480;

/** Pose sweep precision (bisection iterations — 1/64 of the frame move). */
const BISECT_ITERS = 6;

/* --- contact response (the SLIDE) — all frame-rate independent --- */
const IMPACT_INTO = 140; // u/s into the kerb before it counts as a crash
const GRIND_VT = 160; // u/s along the kerb before a press becomes a grind
const KEEP_HEAD_ON = 0.4; // impact: along-kerb speed kept on a head-on
const KEEP_GRAZE = 0.985; // impact: along-kerb speed kept at a full graze
const REBOUND = 0.22; // impact: head-on rebound (share of the into speed)
const GRIND_FRICTION = 0.35; // 1/s wall friction while grinding
const REST_SCRUB = 2.5; // 1/s tangential scrub on a slow press
const SEPARATE = 35; // u/s ease-off push on a slow press (anti-weld)
const ALIGN_MIN_VT = 80; // u/s along the kerb before the nose slews
const SETTLE_PUSH = 8; // u — impact settle-off gap behind the kerb line
const SETTLE_PUSH_REST = 14; // u — slow-press ease-off gap

/* ------------------------------ contacts -------------------------------- */

export interface FootpathContact {
  /** World probe point that landed on the footpath. */
  x: number;
  z: number;
  /** Car-local probe point (right +, nose +). */
  lx: number;
  lz: number;
  /** Which part of the car struck: 0 = nose, 1 = side, 2 = tail. */
  part: 0 | 1 | 2;
  /** Outward escape normal (unit, points OFF the footpath). */
  nx: number;
  nz: number;
}

/** Sample the vehicle OBB footprint at a pose; returns every probe that
 *  stands on a footpath (null = clear). rotY is the game yaw (+Z nose).
 *  Each contact carries its own outward wall normal (field-gradient —
 *  independent of the car's motion). */
export function footpathContacts(
  cx: number,
  cz: number,
  rotY: number,
  hw: number,
  hl: number
): FootpathContact[] | null {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  let out: FootpathContact[] | null = null;
  for (const [fx, fz] of PROBES) {
    const lx = fx * hw;
    const lz = fz * hl;
    const px = cx + lx * cos + lz * sin;
    const pz = cz - lx * sin + lz * cos;
    if (cityRoadClassAt(px, pz) !== 1) continue;
    const n = outwardNormal(px, pz);
    const part: 0 | 1 | 2 = fz >= 0.55 ? 0 : fz <= -0.55 ? 2 : 1;
    (out ??= []).push({ x: px, z: pz, lx, lz, part, nx: n.x, nz: n.z });
  }
  return out;
}

/** Response normal at a footpath contact: the way off the kerb — a
 *  property of the WALL, not of the car's motion (a facing-weighted
 *  escape pick reads a shallow graze as a 60°-skewed crunch, which
 *  wrecked the slide physics).
 *
 *  1) The block's validated CUT half-plane (the smoothed boundary the
 *     deck was clipped along) is the precise truth when present.
 *  2) FIELD GRADIENT: sample the deck indicator on two small rings
 *     around the contact; the normalized gradient of deck mass points
 *     INTO the deck, so its negation is the outward wall normal. On a
 *     straight edge the symmetric ring cancels every tangential
 *     component — the result is the exact perpendicular; on a staircase
 *     corner it naturally returns the corner's bisector (the physically
 *     right push-out for a convex corner); at a path's end face it
 *     points straight out of the end.
 *  3) Fallback: the shortest escape march (deep-inside pathologies). */
function outwardNormal(px: number, pz: number): { x: number; z: number } {
  // 1) smoothed cut half-plane of the contact block (inside side: n·p <= d0)
  const cut = cityWalkCutAtW(px, pz);
  if (cut) return { x: cut[0], z: cut[1] };

  // 2) field-gradient normal: deck mass grows into the deck
  let gx = 0;
  let gz = 0;
  const RINGS = [55, 120];
  const DIRS = 10;
  for (const r of RINGS) {
    for (let i = 0; i < DIRS; i++) {
      const a = (i / DIRS) * Math.PI * 2;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      if (cityRoadClassAt(px + dx * r, pz + dz * r) === 1) {
        gx += dx / DIRS;
        gz += dz / DIRS;
      }
    }
  }
  const gl = Math.hypot(gx, gz);
  if (gl > 0.02) return { x: -gx / gl, z: -gz / gl };

  // 3) fallback: shortest escape direction (rare — uniform deck around)
  let rBest = Infinity;
  let bx = 0;
  let bz = 1;
  for (let i = 0; i < ESCAPE_DIRS; i++) {
    const a = (i / ESCAPE_DIRS) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    for (let r = ESCAPE_STEP; r <= ESCAPE_MAX; r += ESCAPE_STEP) {
      if (cityRoadClassAt(px + dx * r, pz + dz * r) !== 1) {
        if (r < rBest) {
          rBest = r;
          bx = dx;
          bz = dz;
        }
        break;
      }
    }
  }
  return { x: bx, z: bz };
}

/* ------------------------------ the resolver ----------------------------- */

export interface FootpathHit {
  /** Resolved pose — the deepest clear pose along the attempted move. */
  x: number;
  z: number;
  /** Post-impact heading (scrape-align ease included). */
  heading: number;
  /** Post-impact car-frame velocities (feed straight back into the
   *  vehicle's speed/lateral state — the slide carries over). */
  speed: number;
  lateral: number;
  /** Impact speed into the kerb (u/s). */
  impact: number;
  /** 0 = head-on … 1 = grazing hit. */
  graze: number;
  /** Contact points that produced the hit (spark anchors). */
  contacts: FootpathContact[];
  /** True when the car started the frame already inside a footpath. */
  unstuck: boolean;
}

export interface FootpathHitOpts {
  /** Scene for the shared spark system. */
  scene: THREE.Scene;
  /** Last frame's pose (assumed clear) + this frame's attempted pose. */
  prevX: number;
  prevZ: number;
  prevRotY: number;
  newX: number;
  newZ: number;
  rotY: number;
  /** Vehicle collision footprint (oriented box, world units). */
  hw: number;
  hl: number;
  /** Car-frame velocities of the attempted move + world velocity. */
  speed: number;
  lateral: number;
  velX: number;
  velZ: number;
  /** Top speed reference (spark power normalisation). */
  maxRef: number;
  /** Physics step (s). */
  step: number;
  /** Ground height sampler — sparks emit just above the kerb top. */
  heightAt?: (x: number, z: number) => number;
}

/**
 * The one-call footpath response for a vehicle drive step: returns null
 * when the attempted pose is clear (nothing to do), otherwise the
 * resolved pose + post-impact velocities. Position AND yaw are swept
 * together, so a stationary turn cannot swing the nose onto a kerb.
 */
export function resolveVehicleFootpath(
  o: FootpathHitOpts
): FootpathHit | null {
  const hitC = footpathContacts(o.newX, o.newZ, o.rotY, o.hw, o.hl);
  if (!hitC) return null;

  // aggregated outward normal (plain mean of the per-contact escapes)
  let ax = 0;
  let az = 0;
  for (const c of hitC) {
    ax += c.nx;
    az += c.nz;
  }
  const alen = Math.hypot(ax, az);
  if (alen > 0.01) {
    ax /= alen;
    az /= alen;
  } else {
    const vl0 = Math.hypot(o.velX, o.velZ);
    if (vl0 > 1) {
      ax = -o.velX / vl0;
      az = -o.velZ / vl0;
    } else {
      ax = 0;
      az = 1;
    }
  }

  // --- resolve the pose: sweep back toward the last clear pose ---
  let rx = o.newX;
  let rz = o.newZ;
  let heading = o.rotY;
  let unstuck = false;
  // shortest-arc yaw delta (the sweep interpolates the turn too)
  let yawD = o.rotY - o.prevRotY;
  while (yawD > Math.PI) yawD -= Math.PI * 2;
  while (yawD < -Math.PI) yawD += Math.PI * 2;

  if (footpathContacts(o.prevX, o.prevZ, o.prevRotY, o.hw, o.hl)) {
    // started INSIDE a footpath (a shove / teleport): walk out along the
    // aggregated normal in fine 12u steps — minimal travel, no snap
    unstuck = true;
    let done = false;
    for (let r = 12; r <= 700; r += 12) {
      const tx = o.prevX + ax * r;
      const tz = o.prevZ + az * r;
      if (!footpathContacts(tx, tz, o.rotY, o.hw, o.hl)) {
        rx = tx;
        rz = tz;
        done = true;
        break;
      }
    }
    if (!done) return null; // nowhere clear in reach — leave the pose alone
  } else {
    // bisection on the pose parameter t: 0 = last clear, 1 = attempted
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < BISECT_ITERS; i++) {
      const mid = (lo + hi) / 2;
      const mx = o.prevX + (o.newX - o.prevX) * mid;
      const mz = o.prevZ + (o.newZ - o.prevZ) * mid;
      const my = o.prevRotY + yawD * mid;
      if (
        footpathContacts(mx, mz, my, o.hw, o.hl)
      )
        hi = mid;
      else lo = mid;
    }
    rx = o.prevX + (o.newX - o.prevX) * lo;
    rz = o.prevZ + (o.newZ - o.prevZ) * lo;
    heading = o.prevRotY + yawD * lo;
  }

  // --- impact metrics: speed into the wall + along the wall ---
  const vl = Math.hypot(o.velX, o.velZ);
  const vn = o.velX * ax + o.velZ * az; // < 0 = driving into the kerb
  const into = Math.max(0, -vn);
  const cosA = vl > 1 ? Math.min(1, into / vl) : 0;
  const graze = 1 - cosA; // 1 = sliding along the kerb, 0 = head-on

  // unit tangent along the kerb edge (the car's own slide direction)
  let tx = o.velX - ax * vn;
  let tz = o.velZ - az * vn;
  const tl = Math.hypot(tx, tz);
  let vt = 0;
  if (tl > 1) {
    tx /= tl;
    tz /= tl;
    vt = tx * o.velX + tz * o.velZ;
  } else {
    tx = -az; // pure head-on — slide plane is the kerb line itself
    tz = ax;
  }

  // --- THE RESPONSE — three regimes, all frame-rate independent ---
  let pvx: number;
  let pvz: number;
  let regime: 0 | 1 | 2; // 0 = rest · 1 = grind · 2 = impact
  if (into < IMPACT_INTO && Math.abs(vt) < GRIND_VT) {
    // REST — a slow press: kill it and EASE the car off the kerb, so a
    // touched car never welds flush and always frees instantly
    regime = 0;
    const scrub = Math.max(0, 1 - REST_SCRUB * o.step);
    const push = SEPARATE + into * 0.5;
    pvx = tx * vt * scrub + ax * push;
    pvz = tz * vt * scrub + az * push;
  } else if (into < IMPACT_INTO) {
    // GRIND — a fast scrape with a light press: wall-slide. The along-
    // kerb speed survives under a soft wall friction, so the car glides
    // down the edge smoothly and keeps streaming sparks
    regime = 1;
    const keep = 1 - GRIND_FRICTION * o.step;
    pvx = tx * vt * keep + ax * into * 0.2;
    pvz = tz * vt * keep + az * into * 0.2;
  } else {
    // IMPACT — the crash event: the into-wall speed dies, the along-
    // kerb speed survives scaled by the hit angle, head-ons rebound
    regime = 2;
    const keep =
      KEEP_HEAD_ON + (KEEP_GRAZE - KEEP_HEAD_ON) * Math.pow(graze, 0.65);
    const rest = REBOUND * Math.pow(1 - graze, 1.5);
    pvx = tx * vt * keep + ax * into * rest;
    pvz = tz * vt * keep + az * into * rest;
  }

  // --- settle OFF the kerb: rest + impact poses back off a few units so
  // the car never rests welded flush to the footpath (frees instantly;
  // grinds keep hugging so the spark stream stays pinned to the edge) ---
  if (!unstuck && regime !== 1) {
    const gap = regime === 2 ? SETTLE_PUSH : SETTLE_PUSH_REST;
    for (let d = 4; d <= gap; d += 5) {
      if (
        !footpathContacts(rx + ax * d, rz + az * d, heading, o.hw, o.hl)
      ) {
        rx += ax * d;
        rz += az * d;
        break;
      }
    }
  }

  // --- scrape align: the nose EASES toward the slide direction (an
  // exponential approach — smooth kerb tracking, never a snap; a kerb-
  // side parked car has no tangential speed and never wobbles) ---
  if (regime > 0 && Math.abs(vt) > ALIGN_MIN_VT) {
    const sgn = vt >= 0 ? 1 : -1;
    const target = Math.atan2(tx * sgn, tz * sgn);
    let d = target - heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const k =
      (1.2 + 2.8 * graze) *
      THREE.MathUtils.clamp(Math.max(into, Math.abs(vt) * 0.3) / 800, 0.3, 1.6);
    heading += d * (1 - Math.exp(-k * o.step));
  }

  // re-decompose the post-impact world velocity into the car frame
  // (composition contract: vel = fwd*speed + right*lateral, fwd = (sin, cos),
  //  right = (cos, -sin))
  const s = Math.sin(heading);
  const c = Math.cos(heading);
  const speed = pvx * s + pvz * c;
  const lateral = pvx * c - pvz * s;

  // --- sparks at the exact kerb-edge contact points ---
  if (
    regime === 2 ||
    (regime === 1 && (into > SPARK_MIN_INTO || Math.abs(vt) > 200))
  ) {
    emitContactSparks(
      hitC,
      tx,
      tz,
      into,
      graze,
      vt,
      regime,
      o,
      rx,
      rz,
      heading
    );
  }

  noteWindow(into, graze, hitC, speed, unstuck);

  return {
    x: rx,
    z: rz,
    heading,
    speed,
    lateral,
    impact: into,
    graze,
    contacts: hitC,
    unstuck,
  };
}

/* --------------------------- spark particle system -----------------------
 * ULTRA-REALISTIC METAL-ON-STONE SPARKS — not dots, not squares:
 *
 *   - EXACT PLACEMENT: every spray is anchored at the precise kerb-edge
 *     point where the struck car part crossed onto the footpath (bisected
 *     between the part's attempted position and the same part at the
 *     resolved pose) — sparks are born BETWEEN the car part and the kerb,
 *     with only a sliver of jitter along the kerb line.
 *   - STREAK QUADS: every spark is a camera-facing quad STRETCHED along
 *     its velocity (the classic motion-blur spark line — faster sparks
 *     draw longer streaks), painted with a comet texture: a white-hot
 *     core line with a soft sheath and a blazing round head.
 *   - TEMPERATURE RAMP: sparks are born white-hot (the hottest few are
 *     arc-blue), cool through gold -> orange -> deep crimson ember and
 *     fade by darkening (additive black = gone) — never an alpha pop.
 *   - REAL BALLISTICS: gravity, air drag, GROUND BOUNCES (each impact
 *     keeps ~38% of the vertical energy, scrubs the horizontal, flashes
 *     brighter for a frame and a spark that runs out of bounce dies fast
 *     on the floor), plus a per-spark flicker phase so the spray
 *     shimmers like real grinding.
 *   - IMPACT BLOOM: hard hits fire a short white-hot flash right at the
 *     contact point, and every spark inherits a slice of the car's own
 *     velocity so the spray tears off the metal.
 *   - SPRAY SHAPE: head-on hits splash back OFF the kerb; grazing hits
 *     stream ALONG it in the slide direction and skip down the kerb line.
 *
 * One pooled THREE.Mesh (per-vertex quads) serves every vehicle; the
 * physics runs in `updateFootpathSparks`, which de-duplicates the
 * same-frame double calls from the vehicles' updateFx ticks.
 * ----------------------------------------------------------------------- */

const SPARK_N = 1400; // pooled streaks
const SPARK_GRAVITY = 1450; // u/s²
const SPARK_DRAG = 1.1; // 1/s — sparks stay lively
const SPARK_EMIT_CAP = 110; // per frame, all contacts combined
const SPARK_MIN_INTO = 25; // u/s into the kerb before a grind streams
const SPARK_BOUNCE_KEEP = 0.38; // vertical energy kept per ground bounce
const SPARK_BOUNCE_SCRUB = 0.55; // horizontal scrub per bounce
const SPARK_MAX_BOUNCES = 3;

interface SparkSys {
  scene: THREE.Scene;
  geo: THREE.BufferGeometry;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  tex: THREE.CanvasTexture;
  /** particle state */
  px: Float32Array; // 3N — position
  vx: Float32Array; // 3N — velocity
  life: Float32Array;
  maxLife: Float32Array;
  base: Float32Array; // 3N — hot tint at birth (temperature variance)
  size: Float32Array; // N — half-width (world units)
  ground: Float32Array; // N — floor y for the bounce plane
  phase: Float32Array; // N — flicker phase
  bounces: Float32Array;
  flash: Float32Array; // N — bounce/bloom brightness kick (decays fast)
  cursor: number;
}

let sys: SparkSys | null = null;
let lastFxT = 0;
/** The render camera — streaks billboard against the view axis. The page
 *  registers it once via setFootpathSparkCamera; without it the streaks
 *  fall back to view-horizontal (still correct from a chase camera). */
let cameraRef: THREE.Camera | null = null;
const camDirTmp = new THREE.Vector3();

export function setFootpathSparkCamera(cam: THREE.Camera | null): void {
  cameraRef = cam;
}

/** Comet streak texture: a white-hot core line with a soft sheath that
 *  tapers into a wisping tail and a blazing round head. Painted once. */
function sparkTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d')!;
  const img = g.createImageData(128, 32);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 128; x++) {
      const u = x / 127; // 0 = tail, 1 = head
      const v = (y / 31 - 0.5) * 2; // -1..1 across the width
      const taper = Math.pow(u, 1.35); // tail wisp -> bright head
      const core = Math.exp(-v * v * 42); // white-hot centre line
      const glow = Math.exp(-v * v * 3.1) * 0.5; // soft outer sheath
      const head =
        Math.exp(-((u - 0.96) * (u - 0.96)) * 26 - v * v * 8) * 1.45;
      const a = Math.min(1, (core + glow) * taper * 0.9 + head);
      const i = (y * 128 + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 244;
      img.data[i + 2] = 214;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sparksFor(scene: THREE.Scene): SparkSys {
  if (sys && sys.scene === scene) return sys;
  if (sys) {
    // scene swapped (hot reload / rebuild) — drop the old pool
    sys.scene.remove(sys.mesh);
    sys.geo.dispose();
    sys.mat.dispose();
    sys.tex.dispose();
    sys = null;
  }
  // static quad topology: 4 verts + 2 tris per particle; corners ordered
  // [tailL, tailR, headR, headL] with UV u running tail(0) -> head(1)
  const quadPos = new Float32Array(SPARK_N * 4 * 3);
  const quadCol = new Float32Array(SPARK_N * 4 * 3);
  const uv = new Float32Array(SPARK_N * 4 * 2);
  const idx = new Uint32Array(SPARK_N * 6);
  for (let i = 0; i < SPARK_N; i++) {
    const v = i * 4;
    uv.set([0, 0, 0, 1, 1, 1, 1, 0], v * 2);
    idx.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
    for (let k = 0; k < 4; k++) quadPos[v * 3 + k * 3 + 1] = -1e5; // parked
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(quadPos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(quadCol, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const tex = sparkTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 25;
  mesh.visible = false;
  scene.add(mesh);
  sys = {
    scene,
    geo,
    mesh,
    mat,
    tex,
    px: new Float32Array(SPARK_N * 3),
    vx: new Float32Array(SPARK_N * 3),
    life: new Float32Array(SPARK_N),
    maxLife: new Float32Array(SPARK_N),
    base: new Float32Array(SPARK_N * 3),
    size: new Float32Array(SPARK_N),
    ground: new Float32Array(SPARK_N),
    phase: new Float32Array(SPARK_N),
    bounces: new Float32Array(SPARK_N),
    flash: new Float32Array(SPARK_N),
    cursor: 0,
  };
  return sys;
}

/** The precise kerb-edge point where a struck car part crossed onto the
 *  footpath: bisect between the part's attempted position (on the deck)
 *  and the SAME part at the resolved pose (clear road) — the crossing is
 *  exactly "between the car part and the kerb". Returns the anchor just
 *  off the kerb face plus the outward (off-deck) unit normal. */
function kerbEdgeAnchor(
  c: FootpathContact,
  rx: number,
  rz: number,
  heading: number
): { x: number; z: number; ox: number; oz: number } {
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const px2 = rx + c.lx * cos + c.lz * sin;
  const pz2 = rz - c.lx * sin + c.lz * cos;
  if (cityRoadClassAt(px2, pz2) === 1) {
    // resolved part still on the deck (rare interior-cell case) — anchor
    // at the probe itself, spray back the way the car came
    const dx = c.x - rx;
    const dz = c.z - rz;
    const dl = Math.hypot(dx, dz) || 1;
    return { x: c.x, z: c.z, ox: dx / dl, oz: dz / dl };
  }
  let inX = c.x;
  let inZ = c.z;
  let outX = px2;
  let outZ = pz2;
  for (let i = 0; i < 6; i++) {
    const mx = (inX + outX) / 2;
    const mz = (inZ + outZ) / 2;
    if (cityRoadClassAt(mx, mz) === 1) {
      inX = mx;
      inZ = mz;
    } else {
      outX = mx;
      outZ = mz;
    }
  }
  let ox = outX - inX;
  let oz = outZ - inZ;
  const ol = Math.hypot(ox, oz) || 1;
  ox /= ol;
  oz /= ol;
  return { x: outX + ox * 3, z: outZ + oz * 3, ox, oz };
}

/** Spray sparks at the exact kerb-edge point of every contact — BETWEEN
 *  the struck car part and the kerb. IMPACT hits burst (splash back off
 *  the wall, power ∝ the impact speed); GRINDS stream along the kerb in
 *  the slide direction (power ∝ the scrape speed). The nose throws
 *  hardest, the tail least. */
function emitContactSparks(
  contacts: FootpathContact[],
  tx: number,
  tz: number,
  into: number,
  graze: number,
  vt: number,
  regime: 1 | 2,
  o: FootpathHitOpts,
  rx: number,
  rz: number,
  heading: number
): void {
  const s = sparksFor(o.scene);
  const streamSign = vt >= 0 ? 1 : -1;
  let budget = SPARK_EMIT_CAP;
  const frameMul = Math.min(1.5, Math.max(0.4, o.step * 60));
  for (const c of contacts) {
    if (budget <= 0) break;
    const a = kerbEdgeAnchor(c, rx, rz, heading);
    const gy = o.heightAt ? o.heightAt(c.x, c.z) : 0;
    const partMul = c.part === 0 ? 1.35 : c.part === 1 ? 1 : 0.75;
    const n =
      regime === 2
        ? Math.min(
            44,
            budget,
            Math.round((3 + into * 0.014) * partMul * frameMul)
          )
        : Math.min(
            26,
            budget,
            Math.round(
              (2 + Math.abs(vt) * 0.016 + into * 0.02) * partMul * frameMul
            )
          );
    for (let k = 0; k < n; k++) {
      const i = s.cursor;
      s.cursor = (s.cursor + 1) % SPARK_N;
      // tight anchor jitter: a few units ALONG the kerb line, a sliver
      // across it — the spray stays pinned to the exact contact point
      const jA = (Math.random() - 0.5) * 10;
      const jC = (Math.random() - 0.5) * 5;
      s.px[i * 3] = a.x + tx * jA + a.ox * jC;
      s.px[i * 3 + 1] = gy + 2 + Math.random() * 7;
      s.px[i * 3 + 2] = a.z + tz * jA + a.oz * jC;
      const along =
        streamSign * (0.5 + 0.9 * graze) * (0.35 + Math.random() * 0.85);
      const back = (0.85 - 0.6 * graze) * (0.3 + Math.random() * 0.8);
      const spd =
        regime === 2
          ? (150 + into * 0.5) * (0.4 + Math.random() * 0.85)
          : (110 + Math.abs(vt) * 0.22) * (0.35 + Math.random() * 0.8);
      s.vx[i * 3] =
        (tx * along + a.ox * back + (Math.random() - 0.5) * 0.5) * spd +
        o.velX * 0.22;
      s.vx[i * 3 + 1] = (0.1 + Math.random() * 0.75) * spd;
      s.vx[i * 3 + 2] =
        (tz * along + a.oz * back + (Math.random() - 0.5) * 0.5) * spd +
        o.velZ * 0.22;
      s.maxLife[i] = 0.28 + Math.random() * 0.55;
      s.life[i] = s.maxLife[i];
      // temperature variance: mostly white->gold embers, the hottest few
      // are born arc-blue (white-hot metal at its flash point)
      const hot = Math.random();
      if (hot > 0.87) {
        s.base[i * 3] = 1;
        s.base[i * 3 + 1] = 1.12;
        s.base[i * 3 + 2] = 1.38;
      } else {
        s.base[i * 3] = 1;
        s.base[i * 3 + 1] = 0.58 + hot * 0.4;
        s.base[i * 3 + 2] = 0.16 + hot * 0.58;
      }
      s.size[i] = 2.6 + Math.random() * 4.2;
      s.ground[i] = gy;
      s.phase[i] = Math.random() * Math.PI * 2;
      s.bounces[i] = 0;
      s.flash[i] = 0;
    }
    budget -= n;
    // the white-hot BLOOM on hard impacts — a short bright flash right
    // at the contact point between the car part and the kerb
    if (regime === 2 && into >= 320 && c === contacts[0] && budget > 0) {
      const blooms = Math.min(3, budget);
      for (let f = 0; f < blooms; f++) {
        const i = s.cursor;
        s.cursor = (s.cursor + 1) % SPARK_N;
        s.px[i * 3] = a.x + a.ox * 3 + (Math.random() - 0.5) * 8;
        s.px[i * 3 + 1] = gy + 6 + Math.random() * 10;
        s.px[i * 3 + 2] = a.z + a.oz * 3 + (Math.random() - 0.5) * 8;
        s.vx[i * 3] = a.ox * (30 + Math.random() * 40);
        s.vx[i * 3 + 1] = 20 + Math.random() * 50;
        s.vx[i * 3 + 2] = a.oz * (30 + Math.random() * 40);
        s.maxLife[i] = 0.05 + Math.random() * 0.04;
        s.life[i] = s.maxLife[i];
        s.base[i * 3] = 1;
        s.base[i * 3 + 1] = 0.98;
        s.base[i * 3 + 2] = 0.9;
        s.size[i] = 13 + Math.random() * 8;
        s.ground[i] = gy;
        s.phase[i] = Math.random() * Math.PI * 2;
        s.bounces[i] = 0;
        s.flash[i] = 0;
      }
      budget -= blooms;
    }
  }
  s.mesh.visible = true;
}

/**
 * Advance the pooled sparks and rebuild the streak quads. Called from
 * EVERY vehicle's updateFx — the same-frame double calls are
 * de-duplicated by timestamp, so the pool steps exactly once per frame.
 */
export function updateFootpathSparks(dt: number): void {
  if (!sys || !sys.mesh.visible) return;
  const now =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastFxT < 4) return; // another vehicle already ticked this frame
  lastFxT = now;
  const d = Math.min(dt, 1 / 20);

  // view axis for the billboard side vector (falls back to horizontal)
  let camX = 0;
  let camY = 0;
  let camZ = 1;
  if (cameraRef) {
    cameraRef.getWorldDirection(camDirTmp);
    camX = camDirTmp.x;
    camY = camDirTmp.y;
    camZ = camDirTmp.z;
  }

  const pos = sys.geo.getAttribute('position') as THREE.BufferAttribute;
  const col = sys.geo.getAttribute('color') as THREE.BufferAttribute;
  const posArr = pos.array as Float32Array;
  const colArr = col.array as Float32Array;
  let alive = 0;
  const flick = 0.72 + 0.28 * Math.sin(now * 0.045); // global shimmer

  for (let i = 0; i < SPARK_N; i++) {
    if (sys.life[i] <= 0) continue;
    sys.life[i] -= d;
    sys.flash[i] *= Math.exp(-16 * d);
    const v = i * 4;
    if (sys.life[i] <= 0) {
      for (let k = 0; k < 4; k++) posArr[v * 3 + k * 3 + 1] = -1e5;
      continue;
    }
    alive++;
    // --- ballistics ---
    sys.vx[i * 3 + 1] -= SPARK_GRAVITY * d;
    const drag = 1 - SPARK_DRAG * d;
    sys.vx[i * 3] *= drag;
    sys.vx[i * 3 + 1] *= drag;
    sys.vx[i * 3 + 2] *= drag;
    sys.px[i * 3] += sys.vx[i * 3] * d;
    sys.px[i * 3 + 1] += sys.vx[i * 3 + 1] * d;
    sys.px[i * 3 + 2] += sys.vx[i * 3 + 2] * d;
    // --- ground bounce: sparks skip off the road, flashing as they hit ---
    if (sys.px[i * 3 + 1] < sys.ground[i] + 2 && sys.vx[i * 3 + 1] < 0) {
      sys.px[i * 3 + 1] = sys.ground[i] + 2;
      sys.vx[i * 3 + 1] *= -SPARK_BOUNCE_KEEP;
      sys.vx[i * 3] *= SPARK_BOUNCE_SCRUB;
      sys.vx[i * 3 + 2] *= SPARK_BOUNCE_SCRUB;
      sys.bounces[i] += 1;
      sys.flash[i] = 1;
      if (
        sys.bounces[i] > SPARK_MAX_BOUNCES ||
        Math.abs(sys.vx[i * 3 + 1]) < 45
      ) {
        sys.life[i] = Math.min(sys.life[i], 0.09); // spent on the floor
      }
    }
    // --- colour: white-hot -> gold -> orange -> crimson ember, flickering
    const t = sys.life[i] / sys.maxLife[i];
    const tem = Math.pow(t, 0.85);
    const fl = flick * (0.7 + 0.3 * Math.sin(now * 0.05 + sys.phase[i]));
    const inten = fl * Math.pow(t, 1.45) * (1 + 1.4 * sys.flash[i]);
    const r = inten;
    const g = inten * (0.3 + 0.7 * tem) * sys.base[i * 3 + 1];
    const b = inten * tem * tem * sys.base[i * 3 + 2];
    // --- streak quad: stretched along the velocity, facing the camera ---
    let dx = sys.vx[i * 3];
    let dy = sys.vx[i * 3 + 1];
    let dz = sys.vx[i * 3 + 2];
    const spd = Math.hypot(dx, dy, dz);
    if (spd < 1) {
      dx = 0;
      dy = 1;
      dz = 0;
    } else {
      dx /= spd;
      dy /= spd;
      dz /= spd;
    }
    // side = normalize(cross(vel, view)) — degenerate when parallel
    let sx = dy * camZ - dz * camY;
    let sy = dz * camX - dx * camZ;
    let sz = dx * camY - dy * camX;
    const sl = Math.hypot(sx, sy, sz);
    if (sl < 0.05) {
      sx = -dz;
      sy = 0;
      sz = dx;
      const sl2 = Math.hypot(sx, sy, sz) || 1;
      sx /= sl2;
      sz /= sl2;
    } else {
      sx /= sl;
      sy /= sl;
      sz /= sl;
    }
    const stretch = Math.min(1, spd / 850);
    const hl = sys.size[i] * (1.2 + 4.6 * stretch); // half length
    const hw = sys.size[i];
    const cx = sys.px[i * 3];
    const cy = sys.px[i * 3 + 1];
    const cz = sys.px[i * 3 + 2];
    // corners: tailL, tailR, headR, headL
    const tx2 = -dx * hl;
    const ty2 = -dy * hl;
    const tz2 = -dz * hl;
    const hx = dx * hl;
    const hy = dy * hl;
    const hz = dz * hl;
    // tail (dim), head (bright)
    const tFade = 0.22;
    for (let k = 0; k < 4; k++) {
      const headV = k >= 2;
      const px = headV ? hx : tx2;
      const py = headV ? hy : ty2;
      const pz = headV ? hz : tz2;
      const sg = k === 0 || k === 3 ? 1 : -1;
      posArr[v * 3 + k * 3] = cx + px + sx * hw * sg;
      posArr[v * 3 + k * 3 + 1] = cy + py + sy * hw * sg;
      posArr[v * 3 + k * 3 + 2] = cz + pz + sz * hw * sg;
      const f = headV ? 1 : tFade;
      colArr[v * 3 + k * 3] = r * f;
      colArr[v * 3 + k * 3 + 1] = g * f;
      colArr[v * 3 + k * 3 + 2] = b * f;
    }
  }
  sys.mesh.visible = alive > 0;
  pos.needsUpdate = true;
  col.needsUpdate = true;
}

/* --------------------------- debug + verification ------------------------ */

interface FootpathDebug {
  hits: number;
  last: {
    impact: number;
    graze: number;
    contacts: number;
    part: 0 | 1 | 2;
    speed: number;
    unstuck: boolean;
  } | null;
  /** The raw per-probe contacts of the last hit (spark anchors, normals,
   *  car-local part ids) — deep verification telemetry. */
  lastContacts: {
    x: number;
    z: number;
    lx: number;
    lz: number;
    part: 0 | 1 | 2;
    nx: number;
    nz: number;
  }[];
  sparks: () => number;
  probe: (x: number, z: number) => number;
  /** Paint/erase a footpath stroke (the game's own painter — tests and
   *  sandbox rigs). Returns the touched world rect or null. */
  paint: (pts: number[], r: number, cls: 0 | 1 | 2) => {
    wx0: number;
    wz0: number;
    wx1: number;
    wz1: number;
  } | null;
  /** Full footprint probe of a pose — the exact contacts the resolver
   *  sees (debug/verification). */
  probePose: (
    cx: number,
    cz: number,
    rotY: number,
    hw: number,
    hl: number
  ) =>
    | {
        x: number;
        z: number;
        part: 0 | 1 | 2;
        nx: number;
        nz: number;
      }[]
    | null;
}

function noteWindow(
  impact: number,
  graze: number,
  hitC: FootpathContact[],
  speed: number,
  unstuck: boolean
): void {
  const dbg = footpathDebug();
  dbg.hits++;
  dbg.last = {
    impact: Math.round(impact),
    graze: +graze.toFixed(3),
    contacts: hitC.length,
    part: hitC[0]?.part ?? 1,
    speed: Math.round(speed),
    unstuck,
  };
  dbg.lastContacts = hitC.map((k) => ({
    x: Math.round(k.x),
    z: Math.round(k.z),
    lx: Math.round(k.lx),
    lz: Math.round(k.lz),
    part: k.part,
    nx: +k.nx.toFixed(2),
    nz: +k.nz.toFixed(2),
  }));
}

/** The `window.__footpath` debug handle — created eagerly on first
 *  client import so test rigs can probe the footpath raster BEFORE the
 *  first hit (probe: cityRoadClassAt, sparks: live particle count). */
export function footpathDebug(): FootpathDebug {
  const live = (): number => {
    if (!sys) return 0;
    let n = 0;
    for (let i = 0; i < SPARK_N; i++) if (sys.life[i] > 0) n++;
    return n;
  };
  if (typeof window === 'undefined') {
    // SSR / headless import — a throwaway object keeps call sites simple
    return {
      hits: 0,
      last: null,
      lastContacts: [],
      sparks: live,
      probe: (x, z) => cityRoadClassAt(x, z),
      paint: (pts, r, cls) => cityFootpathEditStrokeW(pts, r, cls),
      probePose: () => null,
    };
  }
  const w = window as unknown as { __footpath?: FootpathDebug };
  if (!w.__footpath) {
    w.__footpath = {
      hits: 0,
      last: null,
      lastContacts: [],
      sparks: live,
      probe: (x: number, z: number) => cityRoadClassAt(x, z),
      paint: (pts: number[], r: number, cls: 0 | 1 | 2) =>
        cityFootpathEditStrokeW(pts, r, cls),
      probePose: (cx, cz, rotY, hw, hl) => {
        const c = footpathContacts(cx, cz, rotY, hw, hl);
        return c
          ? c.map((k) => ({
              x: Math.round(k.x),
              z: Math.round(k.z),
              part: k.part,
              nx: +k.nx.toFixed(2),
              nz: +k.nz.toFixed(2),
            }))
          : null;
      },
    };
  }
  return w.__footpath;
}

if (typeof window !== 'undefined') footpathDebug();
