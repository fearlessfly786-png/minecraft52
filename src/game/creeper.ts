import * as THREE from 'three';
import {
  cherryFactorWorld,
  shroomFactorWorld,
  crimsonFactorWorld,
  goldenFactorWorld,
} from './wildBiomes';
import { winterFactorWorld, iceFactorWorld } from './winterBiomes';
import { desertFactorWorld } from './desertBiomes';
import {
  redFactorWorld,
  mesaFactorWorld,
  volcanoFactorWorld,
} from './extraBiomes';
import { citySpawnBlockedWorld } from './cityLayout';

/**
 *  THE MOSSY CREEPER — grassland night hunter
 *  -------------------------------------------
 *  A Minecraft-style creeper built entirely from voxel boxes (no
 *  downloaded assets): the classic 4-leg / body / head silhouette
 *  with a clean mossy-camo pixel skin and dirt on its feet. The
 *  eyes and mouth GLOW (unlit green boxes + additive halos —
 *  "lightly glowing" by day, bright beacons at night).
 *
 *  SPAWN RULE: grassland ONLY (every special biome factor must read
 *  ≈ 0 and the city plateau is excluded) and NIGHT ONLY. At sunrise
 *  every creeper burns away in a puff of smoke.
 *
 *  ADVANCED AI (a real brain, not a chase script):
 *   - SENSES     — hearing (sprinting nearby), vision range, peripheral
 *                  close-range awareness; wounds snap it aggro.
 *   - STALK      — the Weeping-Angel creep: while far and INSIDE your
 *                  view it FREEZES (a mossy bush you barely notice);
 *                  the instant you look away it sprints at 1.7x.
 *   - PACK FLANK — every aggro creeper owns an approach angle around
 *                  the player, so a pack converges from spread sides.
 *   - AMBUSH     — a camouflaged creeper (glow dimmed to embers) stands
 *                  perfectly still, then POUNCES ballistically when you
 *                  wander into its kill radius.
 *   - LEAP       — a chasing creeper leaps the last stretch of ground.
 *   - FUSE       — the classic hiss + swell + white-flash at close
 *                  range; escapes > DEFUSE radius cool it into a
 *                  dazed stagger (and it re-stalks).
 *   - EXPLODE    — flash sphere, shockwave ring, dirt/grass debris,
 *                  rolling smoke, scorch decal, screen shake + boom
 *                  (page callbacks), distance-falloff damage, radial
 *                  player knockback — and a CHAIN REACTION: packmates
 *                  caught in the blast light their own short fuses.
 *   - CHARGED    — storms earth REAL bolts onto the pack: alive creepers
 *                  take turns asking the sky (takeStrikeRequest, routed
 *                  by the page into the atmosphere module so the bolt
 *                  visibly lands on the requester) and a bolt striking
 *                  near a creeper charges it into the lightning elite —
 *                  electric-blue aura + face, faster fuse, DOUBLE blast
 *                  radius, harder knockback and a leg-shock slow routed
 *                  through slowPlayer.
 *   - COLLISION  — rides the terrain, respects fruit/palm solids via
 *                  an injected obstacle callback, steers around steep
 *                  steps, separates from packmates, and is a solid
 *                  body the player cannot walk through. Bullets and
 *                  rockets find it through hitTest/damage/blast.
 */

// ---- scale: 1 vanilla texture pixel = PX world units ---------------------
// (classic creeper: 8px head, 8x12x4 body, 4x6x4 corner legs -> ~1.8 blocks tall)
const PX = 7;
const HEAD = 8 * PX; // 56 — cube
const BODY_W = 8 * PX; // 56 — across the shoulders (x)
const BODY_H = 12 * PX; // 84
const BODY_D = 4 * PX; // 28 — chest depth along the walk axis (z)
const LEG_W = 4 * PX; // 28
const LEG_H = 6 * PX; // 42
const LEG_D = 4 * PX; // 28
/** Solid footprint for the player push-out. */
const BODY_RADIUS = 30;
/** Total height (legs + body + head) — the bullet-test ceiling. */
const MOB_HEIGHT = LEG_H + BODY_H + HEAD; // 182

// ---- tuning --------------------------------------------------------------
const MAX_HP = 120;
const WALK_SPEED = 95;
const STALK_SPEED = 130;
const STALK_FAST = 190; // unobserved creep
const CHASE_SPEED = 215;
const SEE_RADIUS = 1100; // vision
const HEAR_RADIUS = 620; // sprint footsteps nearby
const CLOSE_RADIUS = 260; // peripheral awareness — always detected
/** Freezes when you look at it beyond this range. */
const FREEZE_RANGE = 520;
/** After this long frozen it creeps anyway (never a statue forever). */
const FREEZE_GIVEUP = 4;
const FUSE_RANGE = 150; // 3D — start the hiss
const DEFUSE_RANGE = 330; // escape this and the fuse cools
const FUSE_TIME = 1.5;
const AMBUSH_FUSE = 1.1; // a pounce lands already lit
const BLAST_RADIUS = 380;
const BLAST_DAMAGE = 75;
// ---- CHARGED (lightning elite) tuning -------------------------------------
const CHARGED_BLAST_MULT = 2; // double blast radius, like vanilla
const CHARGED_DAMAGE_MULT = 1.4; // ...and a nastier splash
const CHARGED_FUSE_MULT = 0.8; // a charged core burns its fuse faster
const CHARGED_SLOW_TIME = 1.8; // s of leg-shock wired through slowPlayer
const CHARGE_STRIKE_MIN = 11; // s of storm before the pack asks for a bolt
const CHARGE_STRIKE_MAX = 24;

/** Charged cores burn their fuse faster than the mossy baseline. */
const fuseTimeOf = (c: { charged: boolean }): number =>
  c.charged ? FUSE_TIME * CHARGED_FUSE_MULT : FUSE_TIME;
const LEAP_MIN = 210;
const LEAP_MAX = 480;
const LEAP_CD = 8;
const AMBUSH_CD = 14;
const AMBUSH_MIN = 280;
const AMBUSH_MAX = 680;
const HIT_IMPULSE = 170;
const HIT_TAU = 0.3;
const LEAP_G = 1500;
/** Pack spacing (never one blob of creepers). */
const SEPARATION = 90;
/** Population (low-spec devices run a thinner pack). */
const POP_TARGET = 5;
const SPAWN_MIN = 460;
const SPAWN_MAX = 1200;
const SPAWN_COOLDOWN = 2.2;
const SPAWN_CLEARANCE = 380; // never materialise in your face
/** A biome counts as GRASSLAND when every special factor reads low. */
const BIOME_FACTOR_MAX = 0.3;
const BURN_TIME = 1.7; // sunrise despawn
const DEATH_HOLD = 1.1;
const SINK_TIME = 1.1;

type Brain =
  | 'idle'
  | 'wander'
  | 'stalk'
  | 'ambush'
  | 'chase'
  | 'leap'
  | 'fuse'
  | 'dazed';

type Phase = 'alive' | 'dying' | 'burning';

export interface CreeperMobOptions {
  lowSpec?: boolean;
  /** Terrain height query — the creeper walks the same ground you do. */
  heightAt: (x: number, z: number) => number;
  /** Grid->world conversion for the biome factors (page constants). */
  block: number;
  gridOffset: number;
  /** Explosion splash lands here — wired to the page's applyDamage. */
  damagePlayer: (amount: number) => void;
  /** Radial launch — the page adds horizontal shove + vertical lift. */
  launchPlayer: (dirX: number, dirZ: number, vy: number, force: number) => void;
  /** Charged blasts shock the hero's legs — the page applies a move
   *  slow for `duration` seconds (optional; charged stays pure visual
   *  without it). */
  slowPlayer?: (duration: number) => void;
  /** Detonation happened (page: camera shake + boom cue). */
  onBoom: (x: number, y: number, z: number, strength: number) => void;
  /** The fuse hiss started (page: synthesized sssss cue). */
  onHiss: () => void;
  /** Optional solid props (fruit + palm push-out) the creeper respects. */
  obstacleAt?: (
    x: number,
    z: number,
    radius: number,
    y: number
  ) => { x: number; z: number } | null;
}

export interface CreeperInfo {
  id: number;
  hp: number;
  maxHp: number;
  state: string;
  aggro: boolean;
  /** Lightning-charged elite (blue aura, double blast). */
  charged: boolean;
  observed: boolean;
  x: number;
  y: number;
  z: number;
}

export interface Creepers {
  list(): CreeperInfo[];
  /** Advance brains, animation, spawning. nightF: 1 = night (moon up).
   *  stormF: 0..1 rain intensity — heavy storms earth bolts onto the
   *  pack (take turns charging via real lightning strikes). */
  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerYaw: number,
    nightF: number,
    stormF?: number
  ): void;
  /** Bullet test: is the world point inside any alive creeper? */
  hitTest(p: THREE.Vector3): { id: number } | null;
  /** Damage one creeper; true if this blow was the killing one. */
  damage(id: number, amount: number, from?: THREE.Vector3): boolean;
  /** Explosion splash: every alive creeper in radius takes falloff damage. */
  blast(p: THREE.Vector3, radius: number, maxDamage: number): void;
  /** Player push-out — returns the corrected position or null if clear. */
  collide(x: number, z: number, radius: number): { x: number; z: number } | null;
  /** Debug/verification spawn — keeps the grassland gate, skips night. */
  spawnAt(x: number, z: number): boolean;
  /** Lightning-charging: the nearest ALIVE un-charged creeper within
   *  `radius` of the strike point becomes the charged elite. */
  chargeNear(x: number, z: number, radius: number): boolean;
  /** The pack's queued lightning request for this frame (a storm asks
   *  the sky to earth a bolt onto one of its members) — null when none.
   *  The page routes it into the atmosphere module so a real bolt lands
   *  there; the bolt's onStrike callback does the actual charging. */
  takeStrikeRequest(): { x: number; z: number } | null;
  /** Counters for debug surfaces. */
  stats: {
    alive: number;
    spawned: number;
    exploded: number;
    killed: number;
    aggro: number;
    charged: number;
  };
  dispose(): void;
}

// ---------------------------------------------------------------------------
// deterministic hash (textures + model variation must be reload-stable)
// ---------------------------------------------------------------------------
function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------------------------------------------------------------------------
// pixel art — the mossy camo skin + daisy decal
// ---------------------------------------------------------------------------

/** Mossy camo greens (pre-darkened for the harsh sun, like the plants). */
const MOSS = {
  base: '#4a8f2c',
  light: '#63b03c',
  dark: '#376b1f',
  speck: '#274f15',
  fleck: '#7cc24e',
};
const DIRT = { base: '#6b4a2a', dark: '#52381f', light: '#7d5936' };

/** Paint one 16x16 mossy-camo tile with per-pixel deterministic noise. */
function paintMossTile(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  seed: number
): void {
  const px = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x, oy + y, 1, 1);
  };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const r = hash1(seed + x * 12.9898 + y * 78.233);
      // clustered camo patches: low-freq field + high-freq flecks
      const patch = hash1(seed * 0.71 + Math.floor(x / 3) * 4.7 + Math.floor(y / 3) * 8.3);
      let c = MOSS.base;
      if (patch < 0.22) c = MOSS.dark;
      else if (patch > 0.8) c = MOSS.light;
      if (r < 0.09) c = MOSS.speck;
      else if (r > 0.93) c = MOSS.fleck;
      px(x, y, c);
    }
  }
}

/** The 48x16 skin atlas: body moss | leg (moss + dirt feet) | head moss. */
function paintSkinAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  paintMossTile(ctx, 0, 0, 3.1);
  paintMossTile(ctx, 16, 0, 7.7);
  paintMossTile(ctx, 32, 0, 12.9);
  // dirt feet: the bottom 6 rows of the LEG tile
  for (let y = 10; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const r = hash1(51.7 + x * 9.1 + y * 3.3);
      let c = DIRT.base;
      if (r < 0.2) c = DIRT.dark;
      else if (r > 0.85) c = DIRT.light;
      ctx.fillStyle = c;
      ctx.fillRect(16 + x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial blob for explosion smoke sprites + glow halos. */
function paintBlob(inner: string, outer: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// UV helpers: the atlas is 3 tiles wide (16px each). BoxGeometry's face
// order is +x,-x,+y,-y,+z,-z with 4 verts per face; remap every face onto
// one tile (or split leg faces between moss rows and the dirt bottom by
// just using the leg tile as-is — the dirt rows live INSIDE the tile).
function remapBoxUVs(
  geo: THREE.BufferGeometry,
  tile: number // 0 body | 1 leg | 2 head
): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const u0 = tile / 3;
  const u1 = (tile + 1) / 3;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      u0 + uv.getX(i) * (u1 - u0),
      uv.getY(i)
    );
  }
  uv.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// model
// ---------------------------------------------------------------------------

interface CreeperParts {
  root: THREE.Group; // feet-positioned
  bodyGroup: THREE.Group; // bobs while walking
  legPivots: THREE.Group[]; // 4, pivot at hip (y = LEG_H)
  headPivot: THREE.Group; // pivot at neck (y = LEG_H + BODY_H)
  glowMats: THREE.MeshBasicMaterial[]; // eyes + mouth
  halos: THREE.Sprite[]; // additive eye/mouth glow
  haloMats: THREE.SpriteMaterial[];
  fadeMats: THREE.Material[]; // every material — for burn/death fades
  bodyMats: THREE.MeshLambertMaterial[]; // fuse white-flash targets
  chargeHalo: THREE.Sprite; // electric aura — visible while charged
  chargeHaloMat: THREE.SpriteMaterial;
}

/** Box helper with skin-tile UVs. */
function skinBox(
  w: number,
  h: number,
  d: number,
  tile: number,
  mat: THREE.MeshLambertMaterial
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  remapBoxUVs(geo, tile);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

/** Build one creeper. */
function buildCreeper(
  skin: THREE.Texture,
  haloTex: THREE.Texture,
  lowSpec: boolean
): CreeperParts {
  const root = new THREE.Group();

  // per-creeper materials (cloned so fuse-flash / burn-fade are private)
  const bodyMat = new THREE.MeshLambertMaterial({ map: skin });
  const legMat = new THREE.MeshLambertMaterial({ map: skin });
  const headMat = new THREE.MeshLambertMaterial({ map: skin });
  const glowMat = new THREE.MeshBasicMaterial({ color: '#69d84f' });
  const fadeMats: THREE.Material[] = [bodyMat, legMat, headMat, glowMat];
  const bodyMats = [bodyMat, legMat, headMat];

  // --- legs (4 corner legs, the classic creeper stance) -------------------
  // Vanilla layout: a 4x6x4 leg planted at each CORNER of the body
  // footprint — flush with the flanks (x = ±2px) and protruding one
  // leg-depth fore/aft (z = ±4px). Index order: FL, FR, BL, BR so the
  // walk gait can pair the diagonals (FL+BR vs FR+BL) like the real mob.
  const legPivots: THREE.Group[] = [];
  const legGeo = new THREE.BoxGeometry(LEG_W, LEG_H, LEG_D);
  remapBoxUVs(legGeo, 1);
  const legCorner: [number, number][] = [
    [-1, 1], // 0 front-left
    [1, 1], // 1 front-right
    [-1, -1], // 2 back-left
    [1, -1], // 3 back-right
  ];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(
      legCorner[i][0] * (BODY_W / 2 - LEG_W / 2),
      LEG_H,
      legCorner[i][1] * (BODY_D / 2 + LEG_D / 2)
    );
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.y = -LEG_H / 2;
    leg.castShadow = !lowSpec;
    pivot.add(leg);
    root.add(pivot);
    legPivots.push(pivot);
  }

  // --- body + head --------------------------------------------------------
  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = LEG_H;
  root.add(bodyGroup);

  const bodyGeo = new THREE.BoxGeometry(BODY_W, BODY_H, BODY_D);
  remapBoxUVs(bodyGeo, 0);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = BODY_H / 2;
  body.castShadow = !lowSpec;
  bodyGroup.add(body);

  const headPivot = new THREE.Group();
  headPivot.position.y = BODY_H;
  bodyGroup.add(headPivot);
  const headGeo = new THREE.BoxGeometry(HEAD, HEAD, HEAD);
  remapBoxUVs(headGeo, 2);
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = HEAD / 2;
  head.castShadow = !lowSpec;
  headPivot.add(head);

  // --- the GLOWING FACE (unlit boxes slightly proud of the head front) ---
  // vanilla 8px face: 2x2 eyes at rows 2-3, cols 1-2 / 5-6; mouth = 2px
  // centre bar rows 4-6 + 1px side extensions rows 5-6.
  const glowMats: THREE.MeshBasicMaterial[] = [];
  const faceZ = HEAD / 2 + 2;
  const addGlow = (
    w: number,
    h: number,
    x: number,
    y: number
  ): THREE.Mesh => {
    const m = glowMat.clone();
    glowMats.push(m);
    fadeMats.push(m);
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 5), m);
    box.position.set(x, y, faceZ);
    headPivot.add(box);
    return box;
  };
  // eyes (rows 2-3 -> centre 161 when head spans 126..182)
  addGlow(2 * PX, 2 * PX, -2 * PX, HEAD - 3 * PX); // left
  addGlow(2 * PX, 2 * PX, 2 * PX, HEAD - 3 * PX); // right
  // mouth centre (rows 4-6)
  addGlow(2 * PX, 3 * PX, 0, HEAD - 5.5 * PX);
  // mouth side extensions (rows 5-6)
  addGlow(PX, 2 * PX, -1.5 * PX, HEAD - 6 * PX);
  addGlow(PX, 2 * PX, 1.5 * PX, HEAD - 6 * PX);

  // additive halos — the "lightly glowing" aura around eyes + mouth
  const haloMats: THREE.SpriteMaterial[] = [];
  const halos: THREE.Sprite[] = [];
  const haloPos: [number, number, number][] = [
    [-2 * PX, HEAD - 3 * PX, faceZ + 4],
    [2 * PX, HEAD - 3 * PX, faceZ + 4],
    [0, HEAD - 5 * PX, faceZ + 4],
  ];
  for (const [hx, hy, hz] of haloPos) {
    const hm = new THREE.SpriteMaterial({
      map: haloTex,
      color: '#6dff4d',
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    haloMats.push(hm);
    fadeMats.push(hm);
    const s = new THREE.Sprite(hm);
    s.position.set(hx, hy, hz);
    s.scale.setScalar(3.4 * PX);
    headPivot.add(s);
    halos.push(s);
  }

  // --- charged elite aura: an electric-blue halo that only shows while
  // the creeper carries the lightning charge (opacity/scale animated in
  // animate(); burst big on the strike itself, then a menace pulse) ---
  const chargeHaloMat = new THREE.SpriteMaterial({
    map: haloTex,
    color: '#7fdcff',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  fadeMats.push(chargeHaloMat);
  const chargeHalo = new THREE.Sprite(chargeHaloMat);
  chargeHalo.position.set(0, BODY_H * 0.55, 0); // mid-body (in bodyGroup)
  chargeHalo.visible = false;
  bodyGroup.add(chargeHalo);

  return {
    root,
    bodyGroup,
    legPivots,
    headPivot,
    glowMats,
    halos,
    haloMats,
    fadeMats,
    bodyMats,
    chargeHalo,
    chargeHaloMat,
  };
}

// ---------------------------------------------------------------------------
// the manager
// ---------------------------------------------------------------------------

interface Creeper extends CreeperParts {
  id: number;
  active: boolean;
  phase: Phase;
  brain: Brain;
  hp: number;
  x: number;
  y: number;
  z: number; // feet
  yaw: number;
  yawTarget: number;
  vy: number; // leap / knock hop
  leapVX: number;
  leapVZ: number;
  airborne: boolean;
  kbX: number;
  kbZ: number;
  walkT: number; // gait phase
  squashT: number; // landing squash-and-stretch timer
  moving: boolean;
  timer: number; // brain countdown
  targetX: number;
  targetZ: number;
  fuseT: number; // >0 = fuse lit
  dazeT: number;
  frozenT: number;
  unobservedT: number;
  observed: boolean;
  aggro: boolean;
  leapCd: number;
  ambushCd: number;
  strafe: number; // flank slot side
  dieT: number;
  burnT: number;
  scanSeed: number;
  charged: boolean; // lightning-charged elite
  zapT: number; // time since the charge strike (burst envelope)
}

export function createCreeperMobs(
  scene: THREE.Scene,
  opts: CreeperMobOptions
): Creepers {
  const lowSpec = opts.lowSpec ?? false;
  const POOL = POP_TARGET + 2;

  // ---- shared assets ------------------------------------------------------
  const skin = paintSkinAtlas();
  const haloTex = paintBlob('rgba(140,255,110,0.9)', 'rgba(140,255,110,0)');
  const smokeTex = paintBlob('rgba(70,66,60,0.85)', 'rgba(70,66,60,0)');

  const group = new THREE.Group();
  group.name = 'creeperMobs';
  scene.add(group);

  const creepers: Creeper[] = [];
  for (let i = 0; i < POOL; i++) {
    const parts = buildCreeper(skin, haloTex, lowSpec);
    parts.root.visible = false;
    group.add(parts.root);
    creepers.push({
      ...parts,
      id: i + 1,
      active: false,
      phase: 'alive',
      brain: 'idle',
      hp: MAX_HP,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      yawTarget: 0,
      vy: 0,
      leapVX: 0,
      leapVZ: 0,
      airborne: false,
      kbX: 0,
      kbZ: 0,
      walkT: 0,
      squashT: 0,
      moving: false,
      timer: 0,
      targetX: 0,
      targetZ: 0,
      fuseT: 0,
      dazeT: 0,
      frozenT: 0,
      unobservedT: 0,
      observed: false,
      aggro: false,
      leapCd: 0,
      ambushCd: 0,
      strafe: 1,
      dieT: 0,
      burnT: 0,
      scanSeed: i * 3.7,
      charged: false,
      zapT: 0,
    });
  }

  // ---- explosion VFX pools ------------------------------------------------
  // debris shards (dirt + grass chunks)
  const debrisGeo = new THREE.BoxGeometry(7, 7, 7);
  const debrisMats = [
    new THREE.MeshLambertMaterial({ color: '#3f7d24' }),
    new THREE.MeshLambertMaterial({ color: '#57a636' }),
    new THREE.MeshLambertMaterial({ color: '#6b4a2a' }),
    new THREE.MeshLambertMaterial({ color: '#52381f' }),
  ];
  const DEBRIS_N = lowSpec ? 22 : 40;
  const debris: {
    mesh: THREE.Mesh;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    spin: number;
  }[] = [];
  for (let i = 0; i < DEBRIS_N; i++) {
    const mesh = new THREE.Mesh(debrisGeo, debrisMats[i % debrisMats.length]);
    mesh.visible = false;
    scene.add(mesh);
    debris.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, spin: 0 });
  }
  let debrisCursor = 0;

  // flash sphere + shockwave ring + light
  const flashMat = new THREE.MeshBasicMaterial({
    color: '#fffbe8',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), flashMat);
  flash.visible = false;
  scene.add(flash);
  let flashT = 0;
  let flashMax = 380; // peak diameter — charged blasts blow much bigger

  const ringMat = new THREE.MeshBasicMaterial({
    color: '#eaffe0',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  let ringT = 0;
  let ringMax = 530; // peak shockwave diameter — charged runs wider

  const boomLight = new THREE.PointLight('#dcffd0', 0, 1100, 2);
  scene.add(boomLight);
  let lightT = 0;

  // smoke sprites
  const SMOKE_N = lowSpec ? 8 : 16;
  const smokes: {
    sprite: THREE.Sprite;
    mat: THREE.SpriteMaterial;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    max: number;
    size: number;
  }[] = [];
  for (let i = 0; i < SMOKE_N; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTex,
      color: '#9a948a',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    scene.add(sprite);
    smokes.push({ sprite, mat, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 60 });
  }
  let smokeCursor = 0;

  // scorch decals
  const DECAL_N = 5;
  const decals: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number }[] =
    [];
  for (let i = 0; i < DECAL_N; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: '#181510',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(190, 22), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    decals.push({ mesh, mat, t: 0 });
  }
  let decalCursor = 0;

  // ---- stats + state -------------------------------------------------------
  const stats = {
    alive: 0,
    spawned: 0,
    exploded: 0,
    killed: 0,
    aggro: 0,
    charged: 0,
  };
  let spawnCd = 1.5;
  let nextId = 1;
  /** Queued lightning request: the pack asks the sky to earth a bolt on
   *  one of its own — the page routes it into the atmosphere module. */
  let strikeReq: { x: number; z: number } | null = null;
  let strikeTimer = CHARGE_STRIKE_MIN;

  // scratch
  const playerPos = new THREE.Vector3();
  let playerYaw = 0;
  let nightF = 1;

  const isGrassland = (x: number, z: number): boolean => {
    const f = Math.max(
      cherryFactorWorld(x, z, opts.block, opts.gridOffset),
      shroomFactorWorld(x, z, opts.block, opts.gridOffset),
      crimsonFactorWorld(x, z, opts.block, opts.gridOffset),
      goldenFactorWorld(x, z, opts.block, opts.gridOffset),
      winterFactorWorld(x, z, opts.block, opts.gridOffset),
      iceFactorWorld(x, z, opts.block, opts.gridOffset),
      desertFactorWorld(x, z, opts.block, opts.gridOffset),
      redFactorWorld(x, z, opts.block, opts.gridOffset),
      mesaFactorWorld(x, z, opts.block, opts.gridOffset),
      volcanoFactorWorld(x, z, opts.block, opts.gridOffset)
    );
    if (f >= BIOME_FACTOR_MAX) return false;
    return !citySpawnBlockedWorld(x, z, opts.block, opts.gridOffset);
  };

  const flatEnough = (x: number, z: number): boolean => {
    const h = opts.heightAt(x, z);
    const dx = 24;
    return (
      Math.abs(opts.heightAt(x + dx, z) - h) < 34 &&
      Math.abs(opts.heightAt(x - dx, z) - h) < 34 &&
      Math.abs(opts.heightAt(x, z + dx) - h) < 34 &&
      Math.abs(opts.heightAt(x, z - dx) - h) < 34
    );
  };

  const activate = (x: number, z: number, c: Creeper): void => {
    c.active = true;
    c.phase = 'alive';
    c.brain = 'idle';
    c.hp = MAX_HP;
    c.x = x;
    c.z = z;
    c.y = opts.heightAt(x, z);
    c.yaw = Math.random() * Math.PI * 2;
    c.yawTarget = c.yaw;
    c.vy = 0;
    c.leapVX = 0;
    c.leapVZ = 0;
    c.airborne = false;
    c.kbX = 0;
    c.kbZ = 0;
    c.walkT = 0;
    c.squashT = 0;
    c.moving = false;
    c.timer = 1 + Math.random() * 2;
    c.fuseT = 0;
    c.dazeT = 0;
    c.frozenT = 0;
    c.unobservedT = 0;
    c.observed = false;
    c.aggro = false;
    c.leapCd = 3 + Math.random() * 3;
    c.ambushCd = 6 + Math.random() * 6;
    c.dieT = 0;
    c.burnT = 0;
    c.strafe = Math.random() > 0.5 ? 1 : -1;
    c.charged = false;
    c.zapT = 0;
    c.chargeHalo.visible = false;
    // fresh body: opaque + normal tint
    for (const m of c.fadeMats) {
      m.transparent = false;
      m.opacity = 1;
    }
    c.root.visible = true;
    c.root.position.set(x, c.y, z);
    c.root.rotation.set(0, 0, 0);
    c.root.scale.setScalar(1);
    stats.spawned++;
  };

  const release = (c: Creeper): void => {
    c.active = false;
    c.root.visible = false;
  };

  const spawnCreeper = (x: number, z: number): Creeper | null => {
    if (!isGrassland(x, z)) return null;
    if (!flatEnough(x, z)) return null;
    // keep a spawning margin from the player and packmates
    if (Math.hypot(x - playerPos.x, z - playerPos.z) < SPAWN_CLEARANCE)
      return null;
    for (const o of creepers) {
      if (o.active && Math.hypot(x - o.x, z - o.z) < 140) return null;
    }
    const slot = creepers.find((c) => !c.active);
    if (!slot) return null;
    activate(x, z, slot);
    return slot;
  };

  // ---- explosion -----------------------------------------------------------
  const spawnDebris = (x: number, y: number, z: number, n: number): void => {
    for (let i = 0; i < n; i++) {
      const d = debris[debrisCursor];
      debrisCursor = (debrisCursor + 1) % DEBRIS_N;
      const a = Math.random() * Math.PI * 2;
      const up = 180 + Math.random() * 420;
      const sp = 140 + Math.random() * 380;
      d.mesh.position.set(x, y + 40, z);
      d.mesh.visible = true;
      d.mesh.scale.setScalar(0.7 + Math.random() * 0.9);
      d.vx = Math.sin(a) * sp;
      d.vz = Math.cos(a) * sp;
      d.vy = up;
      d.life = 1.1 + Math.random() * 0.5;
      d.spin = (Math.random() - 0.5) * 14;
    }
  };

  const spawnSmoke = (
    x: number,
    y: number,
    z: number,
    n: number,
    tint?: string
  ): void => {
    for (let i = 0; i < n; i++) {
      const s = smokes[smokeCursor];
      smokeCursor = (smokeCursor + 1) % SMOKE_N;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 90;
      s.sprite.position.set(x + Math.sin(a) * r, y + 20 + Math.random() * 60, z + Math.cos(a) * r);
      s.sprite.visible = true;
      s.vx = Math.sin(a) * 40;
      s.vz = Math.cos(a) * 40;
      s.vy = 70 + Math.random() * 90;
      s.life = 0;
      s.max = 1.5 + Math.random() * 0.8;
      s.size = 70 + Math.random() * 60;
      s.mat.color.set(tint ?? '#9a948a');
      s.mat.rotation = Math.random() * Math.PI * 2;
    }
  };

  const scorch = (x: number, y: number, z: number): void => {
    const d = decals[decalCursor];
    decalCursor = (decalCursor + 1) % DECAL_N;
    d.mesh.position.set(x, y + 2.5, z);
    d.mesh.rotation.z = Math.random() * Math.PI * 2;
    d.mesh.visible = true;
    d.mat.opacity = 0.42;
    d.t = 0;
  };

  const explode = (c: Creeper): void => {
    const bx = c.x;
    const by = c.y;
    const bz = c.z;
    const cy = by + 70;
    const charged = c.charged;
    const R = charged ? BLAST_RADIUS * CHARGED_BLAST_MULT : BLAST_RADIUS;
    const DMG = charged
      ? BLAST_DAMAGE * CHARGED_DAMAGE_MULT
      : BLAST_DAMAGE;
    release(c);
    stats.exploded++;

    // VFX — charged blasts run electric blue and much bigger
    flashMat.color.set(charged ? '#dff4ff' : '#fffbe8');
    ringMat.color.set(charged ? '#bfeaff' : '#eaffe0');
    boomLight.color.set(charged ? '#aee2ff' : '#dcffd0');
    flashMax = charged ? 680 : 380;
    ringMax = charged ? 980 : 530;
    flash.position.set(bx, cy, bz);
    flash.visible = true;
    flashT = 0;
    ring.position.set(bx, opts.heightAt(bx, bz) + 10, bz);
    ring.visible = true;
    ringT = 0;
    boomLight.position.set(bx, cy + 60, bz);
    lightT = 0;
    spawnDebris(bx, by, bz, charged ? (lowSpec ? 20 : 38) : lowSpec ? 14 : 26);
    spawnSmoke(
      bx,
      by,
      bz,
      charged ? (lowSpec ? 8 : 14) : lowSpec ? 5 : 10,
      charged ? '#9fd4f0' : undefined
    );
    scorch(bx, opts.heightAt(bx, bz), bz);

    // page callbacks: shake + synthesized boom (charged hits harder)
    opts.onBoom(bx, by, bz, charged ? 1.5 : 1);

    // player splash: distance falloff + radial knockback
    const dx = playerPos.x - bx;
    const dy = playerPos.y + 90 - cy;
    const dz = playerPos.z - bz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < R) {
      const k = 1 - d / R;
      const dmg = Math.round(DMG * k);
      if (dmg > 0) {
        opts.damagePlayer(dmg);
        // the charged blast shocks your legs — a move slow while it wears
        if (charged) opts.slowPlayer?.(CHARGED_SLOW_TIME);
      }
      const inv = 1 / Math.max(1, d);
      opts.launchPlayer(
        dx * inv,
        dz * inv,
        (320 + 420 * k) * (charged ? 1.25 : 1),
        (620 + 620 * k) * (charged ? 1.3 : 1)
      );
    }

    // CHAIN REACTION: packmates caught in the blast light short fuses
    for (const o of creepers) {
      if (!o.active || o === c) continue;
      const od = Math.hypot(o.x - bx, o.z - bz);
      if (od < R * 0.85 && o.phase === 'alive') {
        if (o.fuseT <= 0) opts.onHiss();
        o.fuseT = Math.max(o.fuseT, FUSE_TIME * 0.45);
        o.aggro = true;
      }
    }
  };

  // ---- charging: the lightning elite ---------------------------------------
  /** Zap a creeper with the lightning charge — electric burst + aggro. */
  const chargeCreeper = (c: Creeper): void => {
    if (!c.active || c.phase !== 'alive' || c.charged) return;
    c.charged = true;
    c.zapT = 0.0001; // burst envelope starts
    // the strike snaps it onto your trail
    c.aggro = true;
    if (c.brain === 'idle' || c.brain === 'wander') c.brain = 'stalk';
    // crackling blue burst around the fresh elite
    spawnSmoke(c.x, c.y, c.z, lowSpec ? 4 : 7, '#7fc4ff');
  };

  // ---- damage ---------------------------------------------------------------
  const greenPuff = (x: number, y: number, z: number): void => {
    // reuse the smoke pool with a green tint
    for (let i = 0; i < 6; i++) {
      const s = smokes[smokeCursor];
      smokeCursor = (smokeCursor + 1) % SMOKE_N;
      const a = Math.random() * Math.PI * 2;
      s.sprite.position.set(x + Math.sin(a) * 20, y + 40 + Math.random() * 80, z + Math.cos(a) * 20);
      s.sprite.visible = true;
      s.vx = Math.sin(a) * 55;
      s.vz = Math.cos(a) * 55;
      s.vy = 60 + Math.random() * 60;
      s.life = 0;
      s.max = 0.9 + Math.random() * 0.5;
      s.size = 40 + Math.random() * 30;
      s.mat.color.set('#7cbf5a');
      s.mat.rotation = Math.random() * Math.PI * 2;
    }
  };

  const killCreeper = (c: Creeper): void => {
    c.phase = 'dying';
    c.dieT = 0;
    c.fuseT = 0;
    c.moving = false;
    c.charged = false;
    c.chargeHalo.visible = false;
    stats.killed++;
    greenPuff(c.x, c.y, c.z);
  };

  // ---- per-frame helpers ------------------------------------------------------
  /** Minecraft mobs step up ONE block — this world's terraces rise in
   *  100u block rows, so the climb gate must accept a full block step. */
  const STEP_UP = 108;
  const steerAhead = (c: Creeper, dirX: number, dirZ: number): number => {
    // returns the passable heading offset (radians) — 0 = straight ahead
    const probe = (off: number): boolean => {
      const s = Math.sin(off);
      const co = Math.cos(off);
      const rx = dirX * co - dirZ * s;
      const rz = dirX * s + dirZ * co;
      const h = opts.heightAt(c.x + rx * 60, c.z + rz * 60);
      return h - c.y < STEP_UP;
    };
    if (probe(0)) return 0;
    if (probe(0.7 * c.strafe)) return 0.7 * c.strafe;
    if (probe(-0.7 * c.strafe)) return -0.7 * c.strafe;
    if (probe(1.4 * c.strafe)) return 1.4 * c.strafe;
    if (probe(-1.4 * c.strafe)) return -1.4 * c.strafe;
    if (probe(2.1 * c.strafe)) return 2.1 * c.strafe;
    if (probe(-2.1 * c.strafe)) return -2.1 * c.strafe;
    return NaN; // walled in — hold position
  };

  const stepWalk = (
    c: Creeper,
    dt: number,
    dirX: number,
    dirZ: number,
    speed: number
  ): void => {
    if (speed <= 0 || !Number.isFinite(dirX)) {
      c.moving = false;
      return;
    }
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;
    const off = steerAhead(c, nx, nz);
    if (Number.isNaN(off)) {
      c.moving = false;
      c.strafe = -c.strafe;
      return;
    }
    const s = Math.sin(off);
    const co = Math.cos(off);
    const mx = (nx * co - nz * s) * speed * dt;
    const mz = (nx * s + nz * co) * speed * dt;
    c.x += mx + c.kbX * dt;
    c.z += mz + c.kbZ * dt;
    c.yawTarget = Math.atan2(nx, nz);
    c.moving = true;
    // solid props (fruits + palms) push the creeper out like the player
    if (opts.obstacleAt) {
      const push = opts.obstacleAt(c.x, c.z, BODY_RADIUS, c.y);
      if (push) {
        c.x = push.x;
        c.z = push.z;
      }
    }
  };

  const brainTick = (c: Creeper, dt: number): void => {
    const dx = playerPos.x - c.x;
    const dz = playerPos.z - c.z;
    const dy = playerPos.y - c.y;
    const distH = Math.hypot(dx, dz);
    const dist3 = Math.sqrt(distH * distH + dy * dy);
    const dirX = dx / (distH || 1);
    const dirZ = dz / (distH || 1);

    // perception: is the player LOOKING at me? (view cone + range)
    const lookX = Math.sin(playerYaw);
    const lookZ = Math.cos(playerYaw);
    const facing = -(dirX * lookX + dirZ * lookZ); // dot(look, -dirToCreeper)
    const observed =
      dist3 < CLOSE_RADIUS || (dist3 < 1500 && facing > 0.55);
    c.observed = observed;

    // senses: detection (hearing sprint steps, vision, close range)
    if (!c.aggro) {
      if (dist3 < CLOSE_RADIUS || dist3 < SEE_RADIUS) {
        c.aggro = true;
        c.brain = 'stalk';
      }
    }

    // cooldowns
    c.leapCd = Math.max(0, c.leapCd - dt);
    c.ambushCd = Math.max(0, c.ambushCd - dt);
    c.unobservedT = observed ? 0 : c.unobservedT + dt;

    // FUSE overrides everything
    if (c.fuseT > 0) {
      c.fuseT += dt;
      c.moving = false;
      if (dist3 > DEFUSE_RANGE) {
        // escaped — the fuse cools into a dazed stagger
        c.fuseT = 0;
        c.dazeT = 1.2;
        c.brain = 'dazed';
        return;
      }
      if (c.fuseT >= fuseTimeOf(c)) {
        explode(c);
      }
      return;
    }
    // close range lights the fuse (unless dazed / mid-leap)
    if (dist3 < FUSE_RANGE && c.brain !== 'dazed' && !c.airborne) {
      c.fuseT = 0.0001;
      opts.onHiss();
      c.brain = 'fuse';
      return;
    }

    switch (c.brain) {
      case 'dazed': {
        c.dazeT -= dt;
        c.moving = false;
        if (c.dazeT <= 0) c.brain = 'stalk';
        break;
      }
      case 'idle': {
        c.moving = false;
        c.timer -= dt;
        if (c.timer <= 0) {
          c.timer = 2 + Math.random() * 3;
          c.targetX = c.x + (Math.random() - 0.5) * 500;
          c.targetZ = c.z + (Math.random() - 0.5) * 500;
          c.brain = 'wander';
        }
        break;
      }
      case 'wander': {
        c.timer -= dt;
        const tdx = c.targetX - c.x;
        const tdz = c.targetZ - c.z;
        const td = Math.hypot(tdx, tdz);
        if (td < 40 || c.timer <= 0) {
          c.brain = 'idle';
          c.timer = 1 + Math.random() * 3;
          c.moving = false;
        } else {
          stepWalk(c, dt, tdx / td, tdz / td, WALK_SPEED);
        }
        break;
      }
      case 'stalk': {
        if (!c.aggro) {
          c.brain = 'idle';
          break;
        }
        // AMBUSH decision: camouflaged wait when unobserved at mid range
        if (
          !observed &&
          c.ambushCd <= 0 &&
          dist3 > AMBUSH_MIN &&
          dist3 < AMBUSH_MAX &&
          !c.airborne
        ) {
          c.brain = 'ambush';
          c.timer = 9;
          c.ambushCd = AMBUSH_CD;
          c.moving = false;
          break;
        }
        // Weeping-Angel creep: freeze while watched (far), sprint unseen
        if (observed && dist3 > FREEZE_RANGE) {
          c.frozenT += dt;
          c.moving = false;
          if (c.frozenT > FREEZE_GIVEUP) {
            // never a statue forever — creep anyway, slowly
            stepWalk(c, dt, dirX, dirZ, 55);
          }
        } else {
          c.frozenT = 0;
          // pack flank: hold my assigned approach angle around the player
          // (base = the side of the player I'm already on, spread per pack
          // index by the golden angle so a pack converges from all sides)
          const aggroList = creepers.filter(
            (o) => o.active && o.aggro && o.phase === 'alive'
          );
          const myIdx = aggroList.indexOf(c);
          const baseA = Math.atan2(c.x - playerPos.x, c.z - playerPos.z);
          const slotA = baseA + myIdx * 2.399963 * c.strafe;
          const ringR = Math.min(Math.max(dist3 - 180, 120), 320);
          const wx = playerPos.x + Math.sin(slotA) * ringR;
          const wz = playerPos.z + Math.cos(slotA) * ringR;
          let wdx: number;
          let wdz: number;
          if (dist3 < 340 || c.unobservedT > 0.4) {
            // close range, or STEALTH SPRINT: unseen creepers beeline —
            // flanking is for the watched approach, not the unseen rush
            wdx = dirX;
            wdz = dirZ;
          } else {
            wdx = wx - c.x;
            wdz = wz - c.z;
          }
          const speed =
            c.unobservedT > 0.4 ? STALK_FAST : dist3 > 800 ? STALK_FAST : STALK_SPEED;
          stepWalk(c, dt, wdx, wdz, speed);
        }
        break;
      }
      case 'ambush': {
        // hold still, glow dimmed (the moss-bush disguise)
        c.moving = false;
        c.timer -= dt;
        if (dist3 < 250 && !observed) {
          // POUNCE — ballistic leap straight at the target
          c.airborne = true;
          c.vy = 560;
          const t = Math.max(0.3, Math.min(0.75, dist3 / 620));
          c.leapVX = dirX * (dist3 / t);
          c.leapVZ = dirZ * (dist3 / t);
          c.brain = 'leap';
          c.leapCd = LEAP_CD;
        } else if (c.timer <= 0 || (observed && dist3 > AMBUSH_MAX)) {
          c.brain = 'stalk'; // busted or bored
        }
        break;
      }
      case 'chase': {
        if (!c.aggro) {
          c.brain = 'idle';
          break;
        }
        // leap attack across the last stretch
        if (
          c.leapCd <= 0 &&
          !c.airborne &&
          distH > LEAP_MIN &&
          distH < LEAP_MAX &&
          Math.abs(dy) < 160
        ) {
          c.airborne = true;
          c.vy = 540;
          const t = Math.max(0.3, Math.min(0.8, distH / 680));
          c.leapVX = dirX * (distH / t);
          c.leapVZ = dirZ * (distH / t);
          c.brain = 'leap';
          c.leapCd = LEAP_CD;
          break;
        }
        if (dist3 > 1500 && c.unobservedT > 6) {
          c.brain = 'stalk'; // lost the scent — go stealth again
          break;
        }
        stepWalk(c, dt, dirX, dirZ, CHASE_SPEED);
        break;
      }
      case 'leap': {
        // handled by the ballistic integration below — hold the brain
        break;
      }
      default:
        c.brain = 'idle';
    }
  };

  // ---- animation ------------------------------------------------------------
  const dayGlow = new THREE.Color('#3f9c33');
  const nightGlow = new THREE.Color('#8cff5e');
  const fuseGlow = new THREE.Color('#ffffff');
  const chargeGlow = new THREE.Color('#7fdcff');
  const zapGlow = new THREE.Color('#eaffff');
  const tmpGlow = new THREE.Color();

  const animate = (c: Creeper, dt: number, time: number): void => {
    c.root.position.set(c.x, c.y, c.z);

    // yaw easing (root) — head aims separately
    let dyaw = c.yawTarget - c.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    c.yaw += dyaw * Math.min(1, 8 * dt);
    c.root.rotation.y = c.yaw;

    const t = time + c.scanSeed;

    if (c.phase === 'dying') {
      c.dieT += dt;
      const fall = Math.min(1, c.dieT / 0.45);
      c.root.rotation.z = fall * (Math.PI / 2) * c.strafe;
      // the light goes out: head lolls, legs shudder then settle
      c.headPivot.rotation.z = fall * 0.5 * -c.strafe;
      c.headPivot.rotation.y *= Math.max(0, 1 - 3 * dt);
      for (const p of c.legPivots) {
        p.rotation.x *= Math.max(0, 1 - 4 * dt);
        p.rotation.z = Math.sin(c.dieT * 9 + p.position.z) * 0.12 * (1 - fall);
      }
      for (const m of c.haloMats) m.opacity *= Math.max(0, 1 - 2.5 * dt);
      if (c.dieT > DEATH_HOLD) {
        const k = Math.min(1, (c.dieT - DEATH_HOLD) / SINK_TIME);
        c.root.position.y = c.y - k * 70;
        for (const m of c.fadeMats) {
          m.transparent = true;
          m.opacity = 1 - k;
        }
        if (k >= 1) release(c);
      }
      return;
    }
    if (c.phase === 'burning') {
      c.burnT += dt;
      const k = Math.min(1, c.burnT / BURN_TIME);
      c.root.position.y = c.y + k * 24;
      c.root.scale.setScalar(1 - k * 0.25);
      for (const m of c.fadeMats) {
        m.transparent = true;
        m.opacity = 1 - k;
      }
      // sizzle smoke
      if (Math.random() < dt * 9) {
        const s = smokes[smokeCursor];
        smokeCursor = (smokeCursor + 1) % SMOKE_N;
        s.sprite.position.set(
          c.x + (Math.random() - 0.5) * 50,
          c.y + 40 + Math.random() * 120,
          c.z + (Math.random() - 0.5) * 50
        );
        s.sprite.visible = true;
        s.vx = (Math.random() - 0.5) * 30;
        s.vy = 110 + Math.random() * 70;
        s.vz = (Math.random() - 0.5) * 30;
        s.life = 0;
        s.max = 1 + Math.random() * 0.6;
        s.size = 34 + Math.random() * 26;
        s.mat.color.set('#cfd4c2');
        s.mat.rotation = Math.random() * Math.PI * 2;
      }
      if (k >= 1) release(c);
      return;
    }

    // ---- alive ----
    if (c.airborne) {
      // ballistic pounce: front legs reach out, back legs trail, body pitched
      for (let i = 0; i < 4; i++) {
        c.legPivots[i].rotation.x = i < 2 ? -0.55 : 0.95;
        c.legPivots[i].rotation.z *= Math.max(0, 1 - 10 * dt);
      }
      c.bodyGroup.rotation.x = 0.18;
      c.root.position.y = c.y; // y integrated in the physics step
    } else {
      // terrain ride
      const gy = opts.heightAt(c.x, c.z);
      c.y += (gy - c.y) * Math.min(1, 10 * dt);
      // gait: vanilla trot — diagonal pairs (FL+BR vs FR+BL)
      if (c.moving) {
        c.walkT += dt * (c.brain === 'chase' ? 11 : 7.5);
        const amp = c.brain === 'chase' ? 0.68 : 0.55;
        const swing = Math.sin(c.walkT) * amp;
        c.legPivots[0].rotation.x = swing; // front-left
        c.legPivots[3].rotation.x = swing; // back-right
        c.legPivots[1].rotation.x = -swing; // front-right
        c.legPivots[2].rotation.x = -swing; // back-left
        // feet plant visibly at the four corners
        const splay = 0.05;
        c.legPivots[0].rotation.z = -splay;
        c.legPivots[1].rotation.z = splay;
        c.legPivots[2].rotation.z = -splay;
        c.legPivots[3].rotation.z = splay;
        // lumbering body: bob + roll + gentle weave
        c.bodyGroup.position.y = LEG_H + Math.abs(Math.sin(c.walkT)) * 3.4;
        c.bodyGroup.rotation.x = 0;
        c.bodyGroup.rotation.z = Math.sin(c.walkT) * 0.05;
        c.bodyGroup.rotation.y = Math.sin(c.walkT * 0.5) * 0.04;
      } else {
        for (const p of c.legPivots) {
          p.rotation.x *= Math.max(0, 1 - 8 * dt);
          p.rotation.z *= Math.max(0, 1 - 8 * dt);
        }
        c.bodyGroup.rotation.x *= Math.max(0, 1 - 8 * dt);
        c.bodyGroup.rotation.z *= Math.max(0, 1 - 8 * dt);
        c.bodyGroup.rotation.y *= Math.max(0, 1 - 8 * dt);
        c.bodyGroup.position.y =
          LEG_H + Math.sin(t * 1.7) * 1.2; // idle breathing
      }
      // fuse coil: crouch and splay as the blast charges
      if (c.fuseT > 0) {
        const k = Math.min(1, c.fuseT / fuseTimeOf(c));
        c.bodyGroup.position.y -= 7 * k;
        for (let i = 0; i < 4; i++) {
          c.legPivots[i].rotation.z =
            (i % 2 === 0 ? -1 : 1) * (0.05 + 0.16 * k);
        }
      }
    }

    // head: idle scan, or aim at the player when aggro
    if (c.aggro) {
      const want = Math.atan2(
        playerPos.x - c.x,
        playerPos.z - c.z
      );
      let rel = want - c.yaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      c.headPivot.rotation.y += (THREE.MathUtils.clamp(rel, -1.1, 1.1) - c.headPivot.rotation.y) * Math.min(1, 7 * dt);
      c.headPivot.rotation.x = THREE.MathUtils.clamp(
        (c.y + 154 - (playerPos.y + 95)) / 900,
        -0.4,
        0.4
      );
    } else {
      c.headPivot.rotation.y = Math.sin(t * 0.55) * 0.5;
      c.headPivot.rotation.x = Math.sin(t * 0.34) * 0.08;
    }

    // fuse menace: the head trembles and tilts as the blast nears
    if (c.fuseT > 0 && c.phase === 'alive') {
      const k = Math.min(1, c.fuseT / fuseTimeOf(c));
      c.headPivot.rotation.z =
        Math.sin(c.fuseT * 46) * 0.09 * k + 0.14 * k;
    } else if (c.phase === 'alive') {
      c.headPivot.rotation.z *= Math.max(0, 1 - 6 * dt);
    }

    // ambush disguise: glow dims to embers + a very slow breath
    const ambushK = c.brain === 'ambush' ? 1 : 0;

    // fuse: swell + tremble + white blink
    let swell = 1;
    let flashWhite = 0;
    // the charged elite's crackle: a steady pulse + a burst envelope that
    // spikes hard right after the lightning strike (zapT counts up)
    let chargePulse = 0;
    let zapK = 0;
    if (c.charged) {
      chargePulse = 0.3 + 0.15 * Math.sin(t * 8.3);
      if (c.zapT > 0) c.zapT += dt;
      zapK = Math.max(0, 1 - c.zapT / 0.45);
    }
    if (c.fuseT > 0) {
      const k = Math.min(1, c.fuseT / fuseTimeOf(c));
      swell =
        1 +
        (c.charged ? 0.52 : 0.42) * k * (0.85 + 0.15 * Math.sin(c.fuseT * 42));
      flashWhite = Math.sin(c.fuseT * 26) > 0 ? 0.85 : 0;
      c.root.position.x += (Math.random() - 0.5) * 3 * k;
      c.root.position.z += (Math.random() - 0.5) * 3 * k;
    }
    // landing squash-and-stretch rides on top of the fuse swell
    let squashY = 1;
    let squashXZ = 1;
    if (c.squashT > 0) {
      c.squashT -= dt;
      const k = Math.max(0, c.squashT) / 0.22;
      const s = Math.sin((1 - k) * Math.PI);
      squashY = 1 - 0.2 * s;
      squashXZ = 1 + 0.13 * s;
    }
    c.root.scale.set(swell * squashXZ, swell * squashY, swell * squashXZ);

    // body emissive: fuse flash (white) + the charged core's blue pulse
    const chargeE = Math.min(1, chargePulse * 0.65 + zapK * 0.9);
    for (const m of c.bodyMats) {
      const w = flashWhite * 0.9;
      m.emissive.setRGB(
        Math.max(w, chargeE * 0.4),
        Math.max(w, chargeE * 0.78),
        Math.max(w, chargeE)
      );
      m.emissiveIntensity = 1;
    }

    // face glow: dim day -> bright night; ambush embers; fuse -> white;
    // the charged elite's face burns electric blue
    tmpGlow.copy(dayGlow).lerp(nightGlow, nightF);
    tmpGlow.lerp(fuseGlow, flashWhite);
    if (c.charged) tmpGlow.lerp(chargeGlow, 0.8 * (1 - flashWhite * 0.5));
    if (zapK > 0) tmpGlow.lerp(zapGlow, zapK * 0.6);
    tmpGlow.lerp(new THREE.Color('#173012'), ambushK * 0.82);
    for (const m of c.glowMats) m.color.copy(tmpGlow);
    for (const m of c.haloMats) {
      m.opacity =
        0.18 +
        0.6 * nightF -
        ambushK * 0.16 +
        flashWhite * 0.5 +
        (c.charged ? chargePulse * 0.35 : 0) +
        zapK * 0.45;
      m.color.copy(tmpGlow);
      m.color.lerp(new THREE.Color('#cfffbe'), flashWhite * 0.6);
    }
    // halos swell with the fuse
    const haloScale = (3.4 + flashWhite * 3 + swell * 0.6) * PX;
    for (const h of c.halos) h.scale.setScalar(haloScale);

    // charged aura: crackling electric halo around the body — burst big on
    // the strike itself, then a steady menace pulse while it lives
    c.chargeHalo.visible = c.charged;
    if (c.charged) {
      c.chargeHalo.scale.setScalar(
        120 + 30 * Math.sin(t * 11.7) + 150 * zapK
      );
      c.chargeHaloMat.opacity =
        0.17 + 0.07 * Math.sin(t * 9.4 + 1.7) + 0.55 * zapK;
    }
  };

  // ---- update ----------------------------------------------------------------
  let elapsed = 0;
  const update = (
    dt: number,
    pPos: THREE.Vector3,
    pYaw: number,
    pNightF: number,
    stormF = 0
  ): void => {
    elapsed += dt;
    playerPos.copy(pPos);
    playerYaw = pYaw;
    nightF = pNightF;

    // population counters
    let alive = 0;
    let aggro = 0;
    let chargedN = 0;
    for (const c of creepers) {
      if (!c.active || c.phase !== 'alive') continue;
      alive++;
      if (c.aggro) aggro++;
      if (c.charged) chargedN++;
    }
    stats.alive = alive;
    stats.aggro = aggro;
    stats.charged = chargedN;

    // spawning: night + grassland only
    spawnCd -= dt;
    if (nightF >= 0.5 && alive < POP_TARGET && spawnCd <= 0) {
      spawnCd = SPAWN_COOLDOWN;
      tryNaturalSpawn();
    }

    // CHARGED HUNT: heavy storms earth real bolts onto the pack. Alive
    // creepers take turns asking the sky — the page routes the request
    // into the atmosphere module so the bolt VISIBLY lands on the
    // requester, and the bolt's onStrike callback charges the creeper
    // standing there (chargeNear).
    strikeReq = null;
    if (stormF > 0.45 && alive > 0) {
      strikeTimer -= dt;
      if (strikeTimer <= 0) {
        strikeTimer =
          CHARGE_STRIKE_MIN +
          Math.random() * (CHARGE_STRIKE_MAX - CHARGE_STRIKE_MIN);
        const pool = creepers.filter(
          (c) => c.active && c.phase === 'alive' && !c.charged
        );
        if (pool.length > 0) {
          const c = pool[(Math.random() * pool.length) | 0];
          strikeReq = { x: c.x, z: c.z };
        }
      }
    } else {
      // armed but capped, so a rolling storm strikes promptly
      strikeTimer = Math.min(strikeTimer, 4);
    }

    for (const c of creepers) {
      if (!c.active) continue;

      // dawn: the mossy horde burns away
      if (c.phase === 'alive' && nightF < 0.5) {
        c.phase = 'burning';
        c.burnT = 0;
        c.charged = false;
        c.chargeHalo.visible = false;
      }

      if (c.phase === 'alive') {
        // knockback decay + hop integration
        if (c.kbX !== 0 || c.kbZ !== 0) {
          c.x += c.kbX * dt;
          c.z += c.kbZ * dt;
          const dec = Math.exp(-HIT_TAU * 3 * dt);
          c.kbX *= dec;
          c.kbZ *= dec;
          if (Math.abs(c.kbX) + Math.abs(c.kbZ) < 4) {
            c.kbX = 0;
            c.kbZ = 0;
          }
        }
        if (c.airborne) {
          c.vy -= LEAP_G * dt;
          c.y += c.vy * dt;
          c.x += c.leapVX * dt;
          c.z += c.leapVZ * dt;
          const gy = opts.heightAt(c.x, c.z);
          if (c.y <= gy) {
            c.y = gy;
            c.airborne = false;
            c.vy = 0;
            c.leapVX = 0;
            c.leapVZ = 0;
            c.squashT = 0.22; // landing squash
            if (c.brain === 'leap') {
              // a pounce lands with the fuse already lit if close
              const d3 = Math.hypot(
                playerPos.x - c.x,
                playerPos.y - c.y,
                playerPos.z - c.z
              );
              c.brain = d3 < 300 ? 'chase' : 'stalk';
            }
          }
        } else {
          brainTick(c, dt);
        }
      }

      animate(c, dt, elapsed);
    }

    tickVfx(dt);
  };

  const tryNaturalSpawn = (): void => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      // bias 7 of 10 attempts to spawn BEHIND the player's view
      if (attempt < 7) {
        const lookX = Math.sin(playerYaw);
        const lookZ = Math.cos(playerYaw);
        const toX = Math.sin(ang);
        const toZ = Math.cos(ang);
        if (toX * lookX + toZ * lookZ > 0.15) continue;
      }
      const d = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const x = playerPos.x + Math.sin(ang) * d;
      const z = playerPos.z + Math.cos(ang) * d;
      if (spawnCreeper(x, z)) return;
    }
  };

  const tickVfx = (dt: number): void => {
    // debris
    for (const d of debris) {
      if (!d.mesh.visible) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.mesh.visible = false;
        continue;
      }
      d.vy -= 1500 * dt;
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      d.mesh.rotation.x += d.spin * dt;
      d.mesh.rotation.y += d.spin * 0.7 * dt;
      const gy = opts.heightAt(d.mesh.position.x, d.mesh.position.z);
      if (d.mesh.position.y < gy + 4) {
        d.mesh.position.y = gy + 4;
        d.vy = -d.vy * 0.3;
        d.vx *= 0.6;
        d.vz *= 0.6;
        if (Math.abs(d.vy) < 60) d.life = Math.min(d.life, 0.25);
      }
      if (d.life < 0.3) d.mesh.scale.multiplyScalar(Math.max(0.01, 1 - dt * 4));
    }
    // flash sphere
    if (flash.visible) {
      flashT += dt;
      const k = flashT / 0.32;
      if (k >= 1) {
        flash.visible = false;
      } else {
        flash.scale.setScalar(40 + 340 * k);
        flashMat.opacity = 0.95 * (1 - k);
      }
    }
    // shockwave ring
    if (ring.visible) {
      ringT += dt;
      const k = ringT / 0.55;
      if (k >= 1) {
        ring.visible = false;
      } else {
        ring.scale.setScalar(60 + 470 * k);
        ringMat.opacity = 0.75 * (1 - k);
      }
    }
    // boom light
    if (lightT < 0.55) {
      lightT += dt;
      const k = lightT / 0.55;
      boomLight.intensity = 7 * (1 - k) * (1 - k);
    } else {
      boomLight.intensity = 0;
    }
    // smoke
    for (const s of smokes) {
      if (!s.sprite.visible) continue;
      s.life += dt;
      const k = s.life / s.max;
      if (k >= 1) {
        s.sprite.visible = false;
        s.mat.opacity = 0;
        continue;
      }
      s.sprite.position.x += s.vx * dt;
      s.sprite.position.y += s.vy * dt;
      s.sprite.position.z += s.vz * dt;
      s.vy *= Math.max(0, 1 - 0.9 * dt);
      s.sprite.scale.setScalar(s.size * (1 + k * 2.4));
      s.mat.opacity = 0.55 * (1 - k) * (0.5 + 0.5 * Math.min(1, k * 6));
      s.mat.rotation += dt * 0.5;
    }
    // scorch decals
    for (const d of decals) {
      if (!d.mesh.visible) continue;
      d.t += dt;
      if (d.t > 25) {
        d.mesh.visible = false;
        continue;
      }
      if (d.t > 18) d.mat.opacity = 0.42 * (1 - (d.t - 18) / 7);
    }
  };

  // ---- public API --------------------------------------------------------------
  return {
    list() {
      return creepers
        .filter((c) => c.active)
        .map(
          (c): CreeperInfo => ({
            id: c.id,
            hp: Math.max(0, Math.round(c.hp)),
            maxHp: MAX_HP,
            state:
              c.phase !== 'alive'
                ? c.phase
                : c.fuseT > 0
                  ? 'fuse'
                  : c.brain,
            aggro: c.aggro,
            charged: c.charged,
            observed: c.observed,
            x: Math.round(c.x),
            y: Math.round(c.y),
            z: Math.round(c.z),
          })
        );
    },

    update,

    hitTest(p) {
      for (const c of creepers) {
        if (!c.active || c.phase !== 'alive') continue;
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        if (dx * dx + dz * dz > 36 * 36) continue;
        if (p.y < c.y - 6 || p.y > c.y + MOB_HEIGHT + 8) continue;
        return { id: c.id };
      }
      return null;
    },

    damage(id, amount, from) {
      const c = creepers.find((o) => o.id === id && o.active);
      if (!c || c.phase !== 'alive') return false;
      c.hp -= amount;
      // shove away from the hit + a little hop
      if (from) {
        const dx = c.x - from.x;
        const dz = c.z - from.z;
        const d = Math.hypot(dx, dz) || 1;
        c.kbX += (dx / d) * HIT_IMPULSE;
        c.kbZ += (dz / d) * HIT_IMPULSE;
      }
      if (!c.airborne) {
        c.airborne = true;
        c.vy = 170;
      }
      if (c.hp <= 0) {
        killCreeper(c);
        return true;
      }
      // wounded: snap out of stealth, straight onto the trail
      c.aggro = true;
      if (c.fuseT <= 0 && c.phase === 'alive' && c.brain !== 'dazed') {
        c.brain = 'chase';
      }
      return false;
    },

    blast(p, radius, maxDamage) {
      for (const c of creepers) {
        if (!c.active || c.phase !== 'alive') continue;
        const cy = c.y + 90;
        const d = Math.sqrt(
          (c.x - p.x) ** 2 + (cy - p.y) ** 2 + (c.z - p.z) ** 2
        );
        if (d > radius) continue;
        const dmg = maxDamage * (1 - d / radius);
        if (dmg < 4) continue;
        this.damage(c.id, dmg, p);
      }
    },

    collide(x, z, radius) {
      let cx = x;
      let cz = z;
      let hit = false;
      for (const c of creepers) {
        if (!c.active || c.phase !== 'alive') continue;
        const dx = cx - c.x;
        const dz = cz - c.z;
        const min = BODY_RADIUS + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 > min * min || d2 < 0.0001) continue;
        const d = Math.sqrt(d2);
        const push = min - d;
        cx += (dx / d) * push;
        cz += (dz / d) * push;
        hit = true;
      }
      return hit ? { x: cx, z: cz } : null;
    },

    spawnAt(x, z) {
      // debug hook — grassland gate stays, the night gate is skipped so
      // tooling can stage encounters any time of day
      if (!isGrassland(x, z)) return false;
      if (!flatEnough(x, z)) return false;
      for (const o of creepers) {
        if (o.active && Math.hypot(x - o.x, z - o.z) < 120) return false;
      }
      const slot = creepers.find((c) => !c.active);
      if (!slot) return false;
      activate(x, z, slot);
      // debug spawns come in aggro — ready to demonstrate the AI
      slot.aggro = true;
      slot.brain = 'stalk';
      return true;
    },

    chargeNear(x, z, radius) {
      let best: Creeper | null = null;
      let bestD = Infinity;
      for (const c of creepers) {
        if (!c.active || c.phase !== 'alive' || c.charged) continue;
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < radius && d < bestD) {
          best = c;
          bestD = d;
        }
      }
      if (!best) return false;
      chargeCreeper(best);
      return true;
    },

    takeStrikeRequest() {
      const r = strikeReq;
      strikeReq = null;
      return r;
    },

    stats,

    dispose() {
      for (const c of creepers) release(c);
      scene.remove(group);
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh || (obj as THREE.Sprite).isSprite) {
          // per-creeper materials + shared geometries
          const mat = (mesh as THREE.Mesh).material as
            | THREE.Material
            | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else if (mat) mat.dispose();
        }
      });
      for (const d of debris) {
        scene.remove(d.mesh);
      }
      debrisGeo.dispose();
      for (const m of debrisMats) m.dispose();
      for (const s of smokes) {
        scene.remove(s.sprite);
        s.mat.dispose();
      }
      for (const d of decals) {
        scene.remove(d.mesh);
        (d.mesh.geometry as THREE.BufferGeometry).dispose();
        d.mat.dispose();
      }
      flash.geometry.dispose();
      flashMat.dispose();
      ring.geometry.dispose();
      ringMat.dispose();
      scene.remove(flash, ring, boomLight);
      skin.dispose();
      haloTex.dispose();
      smokeTex.dispose();
    },
  };
}
