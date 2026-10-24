/**
 * OASIS POOL WATER — the turquoise heart of the desert bowl, now with
 * REAL-WORLD-FEEL WATER PHYSICS on top of the crystal-clear look.
 *
 * The stepped oasis basin (see src/game/oasisTerrain.ts) holds one
 * brim-filled tropical pool. The look still follows the
 * "Crystal_Clear_Desert_Oasis_Water" brief (one turquoise theme, warm
 * caustic light web, sun glint, sky fresnel, fog), but the surface is
 * no longer purely decorative — it is now a LIVING body of water:
 *
 *  - INTERACTIVE RIPPLES (GPU wave simulation): a 256x256 heightfield
 *    runs the classic two-buffer wave equation on the GPU (ping-pong
 *    render targets, ~28 world units per cell over the whole pool).
 *    Anything that touches the water drops a gaussian "dip" into the
 *    field — swim strokes, wading steps, splashdowns, bullet impacts —
 *    and the dip propagates outward as a real travelling wave,
 *    REBOUNDS off the circular shore wall (hard boundary in the sim)
 *    and settles back to a mirror-flat surface through viscous
 *    damping. The surface shader samples the heightfield and folds its
 *    gradient into the fragment normal, so the sun glint, the fresnel
 *    sky mirror and the caustics all react to every wave you make.
 *  - SPLASHES: an additive particle spray (gravity arcs, per-particle
 *    fade) erupts from any hard water entry — the player plunge, a
 *    bullet "plip", a rocket detonation. A splash also punches a
 *    crater dip into the sim whose rebound throws the expanding ring
 *    wave — physics does the crown, not keyframes.
 *  - PUBLIC PHYSICS API for the page: layout() (pool centre/line),
 *    probe() (is this spot water? — bullets die on the waterline),
 *    disturb() (push a ripple), splash() (spray + ring wave).
 *
 * The pool is still ONE surface mesh — a single draw call — and the
 * sim is two tiny render-target passes per frame, so the whole physics
 * package costs less than one chunk of terrain.
 */

import * as THREE from 'three';
import { OASIS } from './oasisTerrain';

/** Caustic web tile spans, world units — octave 1 lays ~4-5-block net
 *  cells across the pool like the reference photo; octave 2 adds a
 *  finer, sparser web so the pattern never reads as a repeating grid. */
const NET_SCALE = 460;
const NET_SCALE_2 = 300;

/** --- ripple sim tuning ------------------------------------------------ */
const SIM_SIZE = 256; // heightfield resolution (square, covers the pool)
/** Wave stiffness (0..0.5 stable) — sqrt gives cells travelled per step. */
const SIM_C2 = 0.42;
/** Viscous damping per step — waves live a couple of seconds then die. */
const SIM_DAMP = 0.986;
/** Slow global settle so the pool always returns to mirror-flat. */
const SIM_SETTLE = 0.9985;
/** Max simultaneous drop injections per frame (strongest wins). */
const MAX_DROPS = 16;
/** Queued-drop cap — a wild frame keeps its newest disturbances. */
const MAX_QUEUED = 28;

/** --- splash particle tuning ------------------------------------------- */
const MAX_SPLASH = 220; // particle pool (full spec)
const SPLASH_GRAVITY = 1350; // u/s² — spray arcs fall like real water

/** --- shared ambient swell (JS mirror of the surface shader) -----------
 *  The fragment shader perturbs its normals with a triple-sine swell
 *  (the a1/a2/a3 terms in WATER_FRAGMENT below). These constants are
 *  that exact wave, exported for anything that floats on the pool so
 *  it bobs IN PHASE with the water it rides (falling coconuts use it
 *  for their buoyant sit). Keep in lockstep with the shader literals. */
export const OASIS_SWELL = {
  kx1: 0.011,
  w1: 1.15,
  kz2: 0.008,
  w2: -0.9,
  kx3: 0.006,
  w3: 0.62,
} as const;

/** Height/gradient of the swell at world (x, z), time t — the same
 *  triple-sine the water shader renders as normals. `y` is the implied
 *  surface height (±3 shader units), (dhdx, dhdz) its slope. */
export function oasisSwell(
  x: number,
  z: number,
  t: number,
  cx: number,
  cz: number
): { y: number; dhdx: number; dhdz: number } {
  const px = x - cx;
  const pz = z - cz;
  const a1 = px * OASIS_SWELL.kx1 + t * OASIS_SWELL.w1;
  const a2 = pz * OASIS_SWELL.kz2 + t * OASIS_SWELL.w2;
  const a3 = (px + pz) * OASIS_SWELL.kx3 + t * OASIS_SWELL.w3;
  return {
    y: Math.sin(a1) + Math.sin(a2) + Math.sin(a3),
    dhdx: Math.cos(a1) * OASIS_SWELL.kx1 + Math.cos(a3) * OASIS_SWELL.kx3,
    dhdz: Math.cos(a2) * OASIS_SWELL.kz2 + Math.cos(a3) * OASIS_SWELL.kx3,
  };
}

const WATER_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const WATER_FRAGMENT = /* glsl */ `
  uniform vec3 uSkyColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uTime;
  uniform vec2 uCenter;
  uniform float uShoreR;
  uniform float uPanR;
  // live GPU wave field (R = surface height around the rest line)
  uniform sampler2D uRipple;
  uniform vec2 uSimCenter;
  uniform float uSimExtent;
  uniform float uRippleTexel;
  varying vec3 vWorldPos;
  #include <fog_pars_fragment>

  // Classic iterative caustic net — four trig-orbit iterations accrete a
  // bright connected web exactly like sunlight focusing through ripples.
  float causticNet(vec2 uv, float t) {
    vec2 p = mod(uv * 6.2831853, 6.2831853) - 250.0;
    vec2 i = p;
    float c = 1.0;
    float inten = 0.005;
    for (int n = 0; n < 4; n++) {
      float tt = t * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.0);
  }

  void main() {
    vec2 p = vWorldPos.xz - uCenter;
    float r = length(p);

    // depth read as ONE SMOOTH radial gradient — no per-terrace steps:
    // 0 at the shoreline wall, easing to 1 over the round pan, so the
    // colour shades differ very subtly and merge seamlessly (per the
    // gradient ask)
    float depthT = 1.0 - smoothstep(uPanR, uShoreR, r); // 0 shore .. 1 deepest

    // live sun state: the pool dims to moonlit teal after dusk
    float sunUp = clamp(uSunDir.y * 1.5 + 0.08, 0.06, 1.0);

    // base body — ONE turquoise theme, the two ends very lightly
    // different and blended by the smooth gradient above
    vec3 shallowCol = vec3(0.333, 0.875, 0.902); // #55DFE6
    vec3 deepCol = vec3(0.145, 0.765, 0.847); // #25C3D8
    vec3 col = mix(shallowCol, deepCol, depthT);

    // the reference look: two octaves of animated warm-gold caustic
    // light web over the sand, run STRONG so the bright lines read
    // clearly on the surface (opacity per the ask), easing softly
    // toward the pan
    float net = causticNet(vWorldPos.xz / ${NET_SCALE.toFixed(1)}, uTime * 0.42);
    net += 0.55 * causticNet(
      vWorldPos.xz / ${NET_SCALE_2.toFixed(1)} + vec2(13.71, 7.31),
      uTime * 0.31 + 4.7
    );
    col += vec3(1.0, 0.98, 0.93) * net * mix(1.45, 0.85, depthT) * sunUp;

    // gentle triple-sine ambient swell — analytic slope -> perturbed normal
    float t = uTime;
    float a1 = p.x * 0.011 + t * 1.15;
    float a2 = p.y * 0.008 - t * 0.9;
    float a3 = (p.x + p.y) * 0.006 + t * 0.62;
    float dhdx = cos(a1) * 0.011 + cos(a3) * 0.006;
    float dhdz = cos(a2) * 0.008 + cos(a3) * 0.006;

    // --- LIVE WAVE FIELD: fold the simulated height gradient into the
    // normal so travelling ripples catch the sun glint + sky fresnel ---
    vec2 suv = (vWorldPos.xz - uSimCenter) / uSimExtent + 0.5;
    float rippleH = 0.0;
    if (suv.x > 0.002 && suv.x < 0.998 && suv.y > 0.002 && suv.y < 0.998) {
      float hC = texture2D(uRipple, suv).r;
      float hE = texture2D(uRipple, suv + vec2(uRippleTexel, 0.0)).r;
      float hW = texture2D(uRipple, suv - vec2(uRippleTexel, 0.0)).r;
      float hN = texture2D(uRipple, suv + vec2(0.0, uRippleTexel)).r;
      float hS = texture2D(uRipple, suv - vec2(0.0, uRippleTexel)).r;
      rippleH = hC;
      vec2 rg = vec2(hE - hW, hN - hS) * 0.5;
      // fade the read toward the shore wall — the sim's hard boundary
      // spike must never paint a bright ring on the waterline
      float fade = smoothstep(uShoreR, uShoreR - 240.0, r);
      dhdx += rg.x * 5.5 * fade;
      dhdz += rg.y * 5.5 * fade;
      // crest whitening: wave tops catch a whisper of foam light
      col += vec3(0.88, 1.0, 1.0) *
        clamp(rippleH * 1.7, 0.0, 0.55) * 0.3 * sunUp * fade;
    }

    vec3 n = normalize(vec3(-dhdx * 26.0, 1.0, -dhdz * 26.0));

    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    // sun glint (Blinn) — the sparkle path across the ripple crests
    vec3 halfV = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(n, halfV), 0.0), 110.0);
    col += uSunColor * spec * 0.9 * sunUp;

    // fresnel: grazing angles mirror the live sky, kept gentle so the
    // pool holds its turquoise theme from every viewpoint
    float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
    col = mix(col, uSkyColor * 1.04, fres * 0.32);

    // transparency: clear everywhere with only a gentle deepening of
    // body toward the pan (subtle, like the colour gradient)
    float alpha = mix(0.66, 0.9, depthT);
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`;

/** SIM STEP — one explicit wave-equation tick over the heightfield.
 *  R channel = surface height, G = per-cell velocity. The circular
 *  shore wall is a hard zero outside uShoreR, so waves reflect off the
 *  pool's edge exactly like the real basin. Up to MAX_DROPS gaussian
 *  dips (x, z, strength, radius) are injected straight into the field. */
const SIM_FRAGMENT = /* glsl */ `
  uniform sampler2D uPrev;
  uniform vec2 uTexel;
  uniform vec2 uCenter;
  uniform float uExtent;
  uniform float uShoreR;
  uniform vec4 uDrops[${MAX_DROPS}];
  uniform int uDropCount;
  varying vec2 vUv;

  void main() {
    vec4 c = texture2D(uPrev, vUv);
    float h = c.r;
    float v = c.g;

    float avg =
      texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)).r +
      texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)).r +
      texture2D(uPrev, vUv + vec2(0.0, uTexel.y)).r +
      texture2D(uPrev, vUv - vec2(0.0, uTexel.y)).r;
    avg *= 0.25;

    // discrete wave equation: curvature accelerates the velocity,
    // damping bleeds it, the height integrates
    v += (avg - h) * ${SIM_C2.toFixed(3)};
    v *= ${SIM_DAMP.toFixed(4)};
    h = (h + v) * ${SIM_SETTLE.toFixed(5)};

    // world position of this cell (matches the surface shader's inverse)
    vec2 world = uCenter + (vUv - 0.5) * uExtent;

    // circular shore wall: hard zero beyond the waterline radius —
    // incoming waves bounce straight back off the basin edge
    float rr = length(world - uCenter);
    float inside = 1.0 - step(uShoreR, rr);
    h *= inside;
    v *= inside;

    // drop injection: gaussian dips punched into the surface
    for (int i = 0; i < ${MAX_DROPS}; i++) {
      if (i >= uDropCount) break;
      vec4 d = uDrops[i];
      float dist2 = dot(world - d.xy, world - d.xy);
      h += d.z * exp(-dist2 / max(d.w * d.w, 1.0));
    }

    gl_FragColor = vec4(h, v, 0.0, 1.0);
  }
`;

const SIM_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export interface OasisWaterLayout {
  x: number;
  z: number;
  /** Waterline height, world units. */
  y: number;
  /** Visible pool radius, world units. */
  radius: number;
}

export interface OasisWaterHandle {
  /** Drive the surface: time, sim step, splashes, live sky + sun. */
  update(
    dt: number,
    skyColor: THREE.Color,
    sunLight: THREE.DirectionalLight
  ): void;
  /** Static pool geometry (cached object — read, don't mutate). */
  layout(): OasisWaterLayout;
  /** Waterline height + visible radius, world units (debug handle). */
  stats(): { y: number; radius: number };
  /** World-space spot on the pool surface (debug handle). */
  debugSpot(): { x: number; y: number; z: number };
  /** Water probe: null when (x, z) is dry land, otherwise the waterline
   *  (SCRATCH object — read immediately, never stored). */
  probe(x: number, z: number): { surfaceY: number } | null;
  /** Push a ripple into the pool: a gaussian dip of `strength` (+
   *  bumps up, - craters down) with `radius` world units. */
  disturb(x: number, z: number, strength: number, radius?: number): void;
  /** Full splash package: spray particles + a crater dip whose rebound
   *  throws the expanding ring wave. power 0..1 scales everything. */
  splash(x: number, y: number, z: number, power: number): void;
  dispose(): void;
}

export function createOasisWater(
  scene: THREE.Scene,
  opts: {
    block: number;
    gridOffset: number;
    floorY: number;
    lowSpec?: boolean;
    /** Lazy renderer access — the renderer is created after the water
     *  system but before the first update() tick. */
    getRenderer: () => THREE.WebGLRenderer;
  }
): OasisWaterHandle {
  const block = opts.block;
  const lowSpec = opts.lowSpec ?? false;

  // pool placement: world centre of the oasis circle, waterline measured
  // from the pit floor the terrain handle exposes
  const cxw = (OASIS.cx - opts.gridOffset) * block;
  const czw = (OASIS.cz - opts.gridOffset) * block;
  const waterY = opts.floorY + OASIS.waterLevel * block;
  const radius = OASIS.waterR * block;

  // the bowl's geometry, in world units — the shader rebuilds the
  // smooth radial depth gradient from these (straight off the OASIS
  // plan, so water and terrain can never disagree)
  const shoreR = (OASIS.waterR - 0.5) * block;
  const panR = OASIS.bottomR * block;

  // --- ripple sim domain: a square centred on the pool, one block of
  // margin past the visible disc on every side ---
  const simExtent = radius * 2 + 2 * block;
  const simTexel = 1 / SIM_SIZE;

  /* ------------------------- render targets ------------------------- */
  const rtOpts: THREE.RenderTargetOptions = {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  };
  let rtA = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, rtOpts);
  let rtB = new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, rtOpts);

  /* --------------------------- sim quad ------------------------------ */
  const dropVecs: THREE.Vector4[] = [];
  for (let i = 0; i < MAX_DROPS; i++) dropVecs.push(new THREE.Vector4());

  const simUniforms: Record<string, THREE.IUniform> = {
    uPrev: { value: rtA.texture },
    uTexel: { value: new THREE.Vector2(simTexel, simTexel) },
    uCenter: { value: new THREE.Vector2(cxw, czw) },
    uExtent: { value: simExtent },
    uShoreR: { value: shoreR },
    uDrops: { value: dropVecs },
    uDropCount: { value: 0 },
  };
  const simMaterial = new THREE.ShaderMaterial({
    uniforms: simUniforms,
    vertexShader: SIM_VERTEX,
    fragmentShader: SIM_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const simScene = new THREE.Scene();
  const simQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial);
  simQuad.frustumCulled = false;
  simScene.add(simQuad);
  const simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /* ------------------------- surface shader -------------------------- */
  const uniforms: Record<string, THREE.IUniform> = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uSkyColor: { value: new THREE.Color(0xbfd1e5) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.2) },
    uSunColor: { value: new THREE.Color(0xffffff) },
    uCenter: { value: new THREE.Vector2(cxw, czw) },
    uShoreR: { value: shoreR },
    uPanR: { value: panR },
    uRipple: { value: rtA.texture },
    uSimCenter: { value: new THREE.Vector2(cxw, czw) },
    uSimExtent: { value: simExtent },
    uRippleTexel: { value: simTexel },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide, // the pool reads from underwater too
    fog: true, // distant water fades into the aerial haze
  });

  const geometry = new THREE.CircleGeometry(radius, 160);
  geometry.rotateX(-Math.PI / 2); // lie flat, facing up

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(cxw, waterY, czw);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.renderOrder = 3; // above the terrain, below the rain streaks
  scene.add(mesh);

  /* ---------------------- splash particle spray ---------------------- */
  const splashMax = lowSpec ? 120 : MAX_SPLASH;
  const splashPos = new Float32Array(splashMax * 3);
  const splashCol = new Float32Array(splashMax * 3);
  const splashVel = new Float32Array(splashMax * 3);
  const splashLife = new Float32Array(splashMax); // remaining seconds
  const splashMaxLife = new Float32Array(splashMax);
  let splashCursor = 0;

  for (let i = 0; i < splashMax; i++) {
    // park unused particles far below the world, coloured black — with
    // additive blending black is invisible, so a dead particle is free
    splashPos[i * 3 + 1] = -1e6;
  }
  const splashGeo = new THREE.BufferGeometry();
  splashGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(splashPos, 3).setUsage(THREE.DynamicDrawUsage)
  );
  splashGeo.setAttribute(
    'color',
    new THREE.BufferAttribute(splashCol, 3).setUsage(THREE.DynamicDrawUsage)
  );
  const splashMat = new THREE.PointsMaterial({
    size: 30,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const splashPoints = new THREE.Points(splashGeo, splashMat);
  splashPoints.frustumCulled = false;
  splashPoints.renderOrder = 4; // above the water disc
  scene.add(splashPoints);

  /* --------------------------- drop queue ---------------------------- */
  interface Drop {
    x: number;
    z: number;
    strength: number;
    radius: number;
  }
  const dropQueue: Drop[] = [];

  function disturb(
    x: number,
    z: number,
    strength: number,
    radius = 130
  ): void {
    const dx = x - cxw;
    const dz = z - czw;
    // far-off misses never reach the field
    if (dx * dx + dz * dz > (radius + simExtent) * (radius + simExtent)) {
      return;
    }
    if (dropQueue.length >= MAX_QUEUED) dropQueue.shift();
    dropQueue.push({ x, z, strength, radius });
  }

  /** One explicit wave-equation step: read rtA -> write rtB -> swap. */
  function simStep(): void {
    const renderer = opts.getRenderer();
    if (!renderer) return;
    simUniforms.uPrev.value = rtA.texture;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false; // never wipe the field with the sky colour
    renderer.setRenderTarget(rtB);
    renderer.render(simScene, simCam);
    renderer.setRenderTarget(null);
    renderer.autoClear = prevAutoClear;
    const t = rtA;
    rtA = rtB;
    rtB = t;
    uniforms.uRipple.value = rtA.texture;
  }

  /* --------------------------- splashes ------------------------------ */
  function spawnSpray(x: number, y: number, z: number, power: number): void {
    const count = Math.round((lowSpec ? 8 : 14) + (lowSpec ? 14 : 26) * power);
    for (let n = 0; n < count; n++) {
      const i = splashCursor;
      splashCursor = (splashCursor + 1) % splashMax;
      const a = Math.random() * Math.PI * 2;
      const rad = (55 + 240 * power) * (0.25 + Math.random() * 0.75);
      splashPos[i * 3] = x + Math.cos(a) * Math.random() * 40;
      splashPos[i * 3 + 1] = y + Math.random() * 18;
      splashPos[i * 3 + 2] = z + Math.sin(a) * Math.random() * 40;
      splashVel[i * 3] = Math.cos(a) * rad;
      splashVel[i * 3 + 1] =
        (240 + 540 * power) * (0.45 + Math.random() * 0.65);
      splashVel[i * 3 + 2] = Math.sin(a) * rad;
      splashMaxLife[i] = 0.45 + Math.random() * 0.45;
      splashLife[i] = splashMaxLife[i];
    }
  }

  function splash(x: number, y: number, z: number, power: number): void {
    const p = THREE.MathUtils.clamp(power, 0.05, 1);
    spawnSpray(x, y, z, p);
    // crater dip — the wave equation's rebound throws the expanding
    // crown ring all by itself, exactly like a real stone-drop
    disturb(x, z, -(0.18 + 0.55 * p), 150 + 150 * p);
  }

  /* --------------------------- scratch ------------------------------- */
  const probeScratch = { surfaceY: 0 };
  const layoutScratch: OasisWaterLayout = {
    x: cxw,
    z: czw,
    y: waterY,
    radius,
  };

  const sunScratch = new THREE.Vector3();
  let time = 0;

  function update(
    dt: number,
    skyColor: THREE.Color,
    sunLight: THREE.DirectionalLight
  ): void {
    time += dt;
    const u = uniforms;
    u.uTime.value = time;
    (u.uSkyColor.value as THREE.Color).copy(skyColor);
    sunScratch.copy(sunLight.position).normalize();
    (u.uSunDir.value as THREE.Vector3).copy(sunScratch);
    (u.uSunColor.value as THREE.Color).copy(sunLight.color);

    // flush this frame's disturbances into the drop uniform block and
    // advance the wave field one step
    const n = Math.min(MAX_DROPS, dropQueue.length);
    for (let i = 0; i < n; i++) {
      const d = dropQueue[i];
      dropVecs[i].set(d.x, d.z, d.strength, d.radius);
    }
    simUniforms.uDropCount.value = n;
    dropQueue.length = 0;
    simStep();

    // splash spray: ballistic arcs under gravity, additive fade-out
    let any = false;
    for (let i = 0; i < splashMax; i++) {
      if (splashLife[i] <= 0) continue;
      any = true;
      splashLife[i] -= dt;
      splashVel[i * 3 + 1] -= SPLASH_GRAVITY * dt;
      splashPos[i * 3] += splashVel[i * 3] * dt;
      splashPos[i * 3 + 1] += splashVel[i * 3 + 1] * dt;
      splashPos[i * 3 + 2] += splashVel[i * 3 + 2] * dt;
      const k = Math.max(0, splashLife[i] / splashMaxLife[i]);
      const glow = k * k; // ease-out brightness
      splashCol[i * 3] = 0.82 * glow;
      splashCol[i * 3 + 1] = 0.97 * glow;
      splashCol[i * 3 + 2] = glow;
      if (splashLife[i] <= 0) {
        splashPos[i * 3 + 1] = -1e6; // park the corpse off-world
      }
    }
    if (any) {
      (splashGeo.attributes.position as THREE.BufferAttribute).needsUpdate =
        true;
      (splashGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  function stats(): { y: number; radius: number } {
    return { y: waterY, radius };
  }

  function layout(): OasisWaterLayout {
    return layoutScratch;
  }

  function debugSpot(): { x: number; y: number; z: number } {
    return { x: cxw, y: waterY, z: czw };
  }

  function probe(x: number, z: number): { surfaceY: number } | null {
    const dx = x - cxw;
    const dz = z - czw;
    if (dx * dx + dz * dz > radius * radius) return null;
    probeScratch.surfaceY = waterY;
    return probeScratch;
  }

  function dispose(): void {
    scene.remove(mesh);
    scene.remove(splashPoints);
    geometry.dispose();
    material.dispose();
    splashGeo.dispose();
    splashMat.dispose();
    simQuad.geometry.dispose();
    simMaterial.dispose();
    rtA.dispose();
    rtB.dispose();
  }

  return {
    update,
    stats,
    layout,
    debugSpot,
    probe,
    disturb,
    splash,
    dispose,
  };
}
