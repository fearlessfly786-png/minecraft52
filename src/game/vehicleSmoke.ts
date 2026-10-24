/**
 * ULTRA-REALISTIC VEHICLE SMOKE — one pooled billboard-quad mesh per scene
 * serving EVERY vehicle (the NASCAR, the four Hot Wheels cars and the
 * jeep): burnout strain smoke, drift tyre smoke, exhaust and dust.
 *
 * THE LOOK
 *   - PUFFY MULTI-LOBE TEXTURE: each sprite is a cluster of 8 overlapping
 *     radial blobs plus fine grain speckle — reads volumetric, not like a
 *     flat circle.
 *   - NORMAL BLENDING (occluding, not additive) with a tiny fog-aware
 *     shader so clouds sit in the scene haze.
 *   - PER-PUFF SPIN + TURBULENCE: every puff rotates slowly and wobbles
 *     on its own noise phase, so clouds churn like real smoke.
 *
 * THE DYNAMICS
 *   - Hot-rise buoyancy that cools with age, air drag, accelerating
 *     growth (puffs billow as they mature) and an alpha envelope with a
 *     fast attack and a long soft tail (no pop-in, no pop-out).
 *   - `power` (0..1) drives density, darkness and size — a strained
 *     burnout pours thick dark smoke, a light drift wisp stays thin.
 *
 * THE STRAIN BUILDUP (the request)
 *   The vehicles own a `strainBuild` scalar that ramps 0 -> 1 over ~2.2s
 *   while full throttle is held and the car barely moves (blocked on a
 *   footpath kerb or an obstacle) and decays when released — so the
 *   smoke "slowly slowly increases" the longer the car strains, from
 *   thin wisps into a churning cloud. See the drive loops.
 *
 * One mesh, one draw call, 800 puffs; `updateVehicleSmoke` is called
 * from every vehicle's updateFx and de-duplicates same-frame double
 * calls by timestamp (same pattern as the kerb sparks).
 */

import * as THREE from 'three';

/* ------------------------------ tuning ---------------------------------- */

const SMOKE_N = 800; // pooled puffs (shared by all vehicles)
const RISE_HEAT = 30; // u/s² early buoyancy (hot smoke climbs)
const RISE_COOL = 0.55; // 1/s vertical damping
const DRAG = 1.5; // 1/s horizontal damping
const TURB = 9; // u/s² turbulence amplitude
const ATTACK = 0.09; // fraction of life spent fading IN
const BASE_ALPHA = 0.5; // peak opacity floor
const POWER_ALPHA = 0.34; // extra peak opacity at power 1

interface SmokeSys {
  scene: THREE.Scene;
  geo: THREE.BufferGeometry;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  tex: THREE.CanvasTexture;
  /** particle state */
  px: Float32Array; // 3N — position
  vx: Float32Array; // 3N — velocity
  age: Float32Array;
  maxAge: Float32Array;
  base: Float32Array; // N — born radius (world u)
  grow: Float32Array; // N — growth fraction over life
  rot: Float32Array;
  rotV: Float32Array;
  phase: Float32Array; // N — turbulence phase
  power: Float32Array;
  tint: Float32Array; // 3N — rgb tint at birth
  cursor: number;
}

let sys: SmokeSys | null = null;
let lastFxT = 0;
let cameraRef: THREE.Camera | null = null;
const camRight = new THREE.Vector3(1, 0, 0);
const camUp = new THREE.Vector3(0, 1, 0);

export function setVehicleSmokeCamera(cam: THREE.Camera | null): void {
  cameraRef = cam;
}

/** Live puff count (debug/verification). */
export function liveVehicleSmoke(): number {
  if (!sys) return 0;
  let n = 0;
  for (let i = 0; i < SMOKE_N; i++) if (sys.age[i] < sys.maxAge[i]) n++;
  return n;
}

/** Total puffs ever emitted (debug/verification). */
let emittedTotal = 0;
let stepsTotal = 0;
let lastDt = 0;
export function emittedVehicleSmoke(): number {
  return emittedTotal;
}
if (typeof window !== 'undefined') {
  (window as unknown as { __vsmoke?: object }).__vsmoke = {
    live: liveVehicleSmoke,
    emitted: () => emittedTotal,
    steps: () => stepsTotal,
    lastDt: () => lastDt,
    /** Manual pool step (verification rigs — headless rAF throttling). */
    step: (dt: number) => updateVehicleSmoke(dt),
  };
}

/** Puffy multi-lobe smoke sprite: 8 overlapping radial blobs + grain. */
function smokeTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  const blobs: Array<[number, number, number, number]> = [
    [64, 66, 42, 0.8],
    [40, 52, 26, 0.66],
    [88, 50, 27, 0.68],
    [52, 92, 24, 0.62],
    [80, 88, 25, 0.64],
    [64, 40, 30, 0.55],
    [30, 72, 18, 0.46],
    [98, 74, 17, 0.46],
  ];
  for (const [bx, by, br, ba] of blobs) {
    const grad = g.createRadialGradient(bx, by, br * 0.08, bx, by, br);
    grad.addColorStop(0, `rgba(255,255,255,${ba})`);
    grad.addColorStop(0.55, `rgba(255,255,255,${ba * 0.5})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  }
  // fine grain speckle — breaks the perfect-gradient look
  for (let i = 0; i < 70; i++) {
    const sx = 14 + Math.random() * (S - 28);
    const sy = 14 + Math.random() * (S - 28);
    const sr = 2 + Math.random() * 6;
    const grad = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
    grad.addColorStop(0, `rgba(255,255,255,${0.05 + Math.random() * 0.09})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function smokeFor(scene: THREE.Scene): SmokeSys {
  if (sys && sys.scene === scene) return sys;
  if (sys) {
    // scene swapped (hot reload / rebuild) — drop the old pool
    sys.scene.remove(sys.mesh);
    sys.geo.dispose();
    sys.mat.dispose();
    sys.tex.dispose();
    sys = null;
  }
  // static quad topology: 4 verts + 2 tris per puff, corners ordered
  // [(-x,-y) uv(0,0), (-x,+y) uv(0,1), (+x,+y) uv(1,1), (+x,-y) uv(1,0)]
  const quadPos = new Float32Array(SMOKE_N * 4 * 3);
  const quadCol = new Float32Array(SMOKE_N * 4 * 3);
  const quadAlp = new Float32Array(SMOKE_N * 4);
  const uv = new Float32Array(SMOKE_N * 4 * 2);
  const idx = new Uint32Array(SMOKE_N * 6);
  for (let i = 0; i < SMOKE_N; i++) {
    const v = i * 4;
    uv.set([0, 0, 0, 1, 1, 1, 1, 0], v * 2);
    idx.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
    for (let k = 0; k < 4; k++) quadPos[v * 3 + k * 3 + 1] = -1e5; // parked
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(quadPos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(quadCol, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(quadAlp, 1));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const tex = smokeTexture();
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  uniforms.uMap = { value: tex };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute float aAlpha;
      attribute vec3 aColor;
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vAlpha;
      void main() {
        vUv = uv;
        vTint = aColor;
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform sampler2D uMap;
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vAlpha;
      void main() {
        vec4 tex = texture2D(uMap, vUv);
        float a = tex.a * vAlpha;
        if (a < 0.012) discard;
        gl_FragColor = vec4(vTint * tex.rgb, a);
        #include <fog_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 24; // behind the kerb sparks (25), above the world
  mesh.visible = false;
  scene.add(mesh);
  sys = {
    scene,
    geo,
    mesh,
    mat,
    tex,
    px: new Float32Array(SMOKE_N * 3),
    vx: new Float32Array(SMOKE_N * 3),
    age: new Float32Array(SMOKE_N),
    maxAge: new Float32Array(SMOKE_N),
    base: new Float32Array(SMOKE_N),
    grow: new Float32Array(SMOKE_N),
    rot: new Float32Array(SMOKE_N),
    rotV: new Float32Array(SMOKE_N),
    phase: new Float32Array(SMOKE_N),
    power: new Float32Array(SMOKE_N),
    tint: new Float32Array(SMOKE_N * 3),
    cursor: 0,
  };
  return sys;
}

export interface VehicleSmokePuff {
  x: number;
  y: number;
  z: number;
  /** Base velocity; callers add the car-motion inheritance themselves. */
  vx?: number;
  vy?: number;
  vz?: number;
  /** Born radius (world u). */
  size?: number;
  /** Lifetime (s). */
  life?: number;
  /** 0..1 — density: darkness, peak alpha and growth all scale with it. */
  power?: number;
  /** rgb tint 0..1 (tyre smoke grey, desert dust sand, exhaust pale). */
  tint?: [number, number, number];
  /** Growth fraction over the puff's life (default 2.2 — real billow). */
  grow?: number;
}

/** Spawn one ultra-realistic smoke puff into the shared pool. */
export function emitVehicleSmoke(scene: THREE.Scene, p: VehicleSmokePuff): void {
  const s = smokeFor(scene);
  emittedTotal++;
  const i = s.cursor;
  s.cursor = (s.cursor + 1) % SMOKE_N;
  const power = Math.min(1, Math.max(0, p.power ?? 0.5));
  s.px[i * 3] = p.x;
  s.px[i * 3 + 1] = p.y;
  s.px[i * 3 + 2] = p.z;
  s.vx[i * 3] = p.vx ?? 0;
  s.vx[i * 3 + 1] = p.vy ?? 0;
  s.vx[i * 3 + 2] = p.vz ?? 0;
  s.maxAge[i] = p.life ?? 1.2;
  s.age[i] = 0;
  s.base[i] = p.size ?? 10;
  s.grow[i] = p.grow ?? 2.2;
  s.rot[i] = Math.random() * Math.PI * 2;
  s.rotV[i] = (Math.random() - 0.5) * 1.7;
  s.phase[i] = Math.random() * Math.PI * 2;
  s.power[i] = power;
  const tint = p.tint;
  s.tint[i * 3] = tint ? tint[0] : 0.87;
  s.tint[i * 3 + 1] = tint ? tint[1] : 0.87;
  s.tint[i * 3 + 2] = tint ? tint[2] : 0.9;
  s.mesh.visible = true;
}

/**
 * Advance the pooled smoke and rebuild the billboard quads. Called from
 * EVERY vehicle's updateFx — same-frame double calls are de-duplicated
 * by timestamp, so the pool steps exactly once per frame.
 */
export function updateVehicleSmoke(dt: number): void {
  if (!sys || !sys.mesh.visible) return;
  const now =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastFxT < 4) return; // another vehicle already ticked this frame
  lastFxT = now;
  stepsTotal++;
  lastDt = dt;
  const d = Math.min(dt, 1 / 20);

  // camera right/up for the billboard basis (screen-aligned + per-puff spin)
  if (cameraRef) {
    const e = cameraRef.matrixWorld.elements;
    camRight.set(e[0], e[1], e[2]);
    camUp.set(e[4], e[5], e[6]);
  } else {
    camRight.set(1, 0, 0);
    camUp.set(0, 1, 0);
  }

  const pos = sys.geo.getAttribute('position') as THREE.BufferAttribute;
  const col = sys.geo.getAttribute('aColor') as THREE.BufferAttribute;
  const alp = sys.geo.getAttribute('aAlpha') as THREE.BufferAttribute;
  const posArr = pos.array as Float32Array;
  const colArr = col.array as Float32Array;
  const alpArr = alp.array as Float32Array;
  let alive = 0;

  for (let i = 0; i < SMOKE_N; i++) {
    if (sys.age[i] >= sys.maxAge[i]) continue;
    sys.age[i] += d;
    const v = i * 4;
    if (sys.age[i] >= sys.maxAge[i]) {
      for (let k = 0; k < 4; k++) posArr[v * 3 + k * 3 + 1] = -1e5;
      continue;
    }
    alive++;
    const k = sys.age[i] / sys.maxAge[i]; // 0 born -> 1 dead
    // --- dynamics: hot rise that cools, drag, per-puff turbulence ---
    sys.vx[i * 3 + 1] += RISE_HEAT * d * Math.max(0, 1 - k * 3);
    sys.vx[i * 3] *= 1 - DRAG * d;
    sys.vx[i * 3 + 1] *= 1 - RISE_COOL * d;
    sys.vx[i * 3 + 2] *= 1 - DRAG * d;
    sys.vx[i * 3] += Math.sin(now * 0.0012 + sys.phase[i]) * TURB * d;
    sys.vx[i * 3 + 2] += Math.cos(now * 0.00095 + sys.phase[i] * 1.71) * TURB * d;
    sys.px[i * 3] += sys.vx[i * 3] * d;
    sys.px[i * 3 + 1] += sys.vx[i * 3 + 1] * d;
    sys.px[i * 3 + 2] += sys.vx[i * 3 + 2] * d;
    sys.rot[i] += sys.rotV[i] * d;
    // --- look: accelerating growth + attack/tail alpha envelope ---
    const size = sys.base[i] * (1 + sys.grow[i] * Math.pow(k, 0.8));
    const alpha =
      Math.min(1, k / ATTACK) *
      Math.pow(1 - k, 0.62) *
      (BASE_ALPHA + POWER_ALPHA * sys.power[i]);
    const dark = 1 - 0.26 * sys.power[i] * (1 - k); // dense fresh smoke is darker
    const r = sys.tint[i * 3] * dark;
    const g = sys.tint[i * 3 + 1] * dark;
    const b = sys.tint[i * 3 + 2] * dark;
    // --- billboard quad with spin: rotate the screen-plane basis ---
    const cs = Math.cos(sys.rot[i]);
    const sn = Math.sin(sys.rot[i]);
    const axX = camRight.x * cs + camUp.x * sn;
    const axY = camRight.y * cs + camUp.y * sn;
    const axZ = camRight.z * cs + camUp.z * sn;
    const ayX = camRight.x * -sn + camUp.x * cs;
    const ayY = camRight.y * -sn + camUp.y * cs;
    const ayZ = camRight.z * -sn + camUp.z * cs;
    const cx = sys.px[i * 3];
    const cy = sys.px[i * 3 + 1];
    const cz = sys.px[i * 3 + 2];
    for (let k2 = 0; k2 < 4; k2++) {
      const sx = k2 === 0 || k2 === 3 ? -1 : 1;
      const sy = k2 === 0 || k2 === 1 ? -1 : 1;
      posArr[v * 3 + k2 * 3] = cx + axX * size * sx + ayX * size * sy;
      posArr[v * 3 + k2 * 3 + 1] = cy + axY * size * sx + ayY * size * sy;
      posArr[v * 3 + k2 * 3 + 2] = cz + axZ * size * sx + ayZ * size * sy;
      colArr[v * 3 + k2 * 3] = r;
      colArr[v * 3 + k2 * 3 + 1] = g;
      colArr[v * 3 + k2 * 3 + 2] = b;
      alpArr[v + k2] = alpha;
    }
  }
  sys.mesh.visible = alive > 0;
  pos.needsUpdate = true;
  col.needsUpdate = true;
  alp.needsUpdate = true;
}
