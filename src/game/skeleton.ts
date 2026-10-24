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
 *  THE BONE ARCHER — grassland night marksman
 *  -------------------------------------------
 *  A Minecraft-style skeleton built entirely from voxel boxes (no
 *  downloaded assets): the classic skull / ribcage / stick-limb
 *  silhouette in pale bone with dark joint bands, a skull face with
 *  dark sockets + faint ghostly-cyan pupils, and a real BOW (grip,
 *  curved limbs, a string that visibly pulls during the draw).
 *
 *  SPAWN RULE: grassland ONLY (every special biome factor must read
 *  ≈ 0 and the city plateau is excluded) and NIGHT ONLY. At sunrise
 *  every skeleton burns away in a puff of smoke (vanilla rule).
 *
 *  ADVANCED AI (a genuine ranged-combat brain, not a chase script):
 *   - SENSES       — line-of-sight vision (terrain-sampled ray), close
 *                    peripheral awareness; wounds snap it aggro.
 *   - KEEP-DISTANCE— the classic skeleton kite: RETREAT below ENGAGE_MIN
 *                    (diagonal backpedal while shooting), ADVANCE above
 *                    PREFERRED_HI, hold the 470-640 killing pocket.
 *   - STRAFE       — circles the player in combat (vanilla skeleton
 *                    strafe), flipping direction on a jitter timer or
 *                    when the terrain walls it in.
 *   - LOS          — no terrain ray, no shot: without line of sight it
 *                    breaks off the draw and REPOSITIONS to regain it.
 *   - DRAW + LOOSE — raises the bow and DRAWS (0.9s, slowed movement,
 *                    string pulls visibly, trembles near release) then
 *                    fires a real BALLISTIC ARROW: flat speed solved
 *                    with gravity compensation + VELOCITY LEAD on the
 *                    player's smoothed motion + spread. Close range
 *                    speeds the cycle and can trigger a two-arrow flurry.
 *   - PANIC        — cornered (retreat walled for ~1s) it dumps rapid
 *                    point-blank shots while scrabbling away.
 *   - PACK         — golden-angle flank slots so a pack spreads around
 *                    the player instead of blobbing; separation spacing.
 *   - COLLISION    — rides the terrain, respects fruit/palm solids via
 *                    an injected obstacle callback, steers around steep
 *                    steps, and is a solid body the player cannot walk
 *                    through. Bullets and rockets find it through
 *                    hitTest/damage/blast.
 */

// ---- scale: 1 vanilla texture pixel = PX world units ---------------------
// (classic skeleton: 8px skull, 8x12x4 chest, 2x12x2 stick limbs -> 32px tall)
const PX = 7;
const HEAD = 8 * PX; // 56 — skull cube
const BODY_W = 8 * PX; // 56 — across the shoulders
const BODY_H = 12 * PX; // 84 — ribcage
const BODY_D = 4 * PX; // 28 — chest depth
const LIMB_W = 2 * PX; // 14 — stick arms/legs
const LIMB_H = 12 * PX; // 84
/** Solid footprint for the player push-out. */
const BODY_RADIUS = 26;
/** Total height (legs + body + head) — the bullet-test ceiling. */
const MOB_HEIGHT = LIMB_H + BODY_H + HEAD; // 224

// ---- tuning --------------------------------------------------------------
const MAX_HP = 80;
const WALK_SPEED = 90;
const ADVANCE_SPEED = 205;
const RETREAT_SPEED = 155;
const STRAFE_SPEED = 115;
/** Movement fraction while drawing the bow (vanilla: charge slows you). */
const AIM_MOVE_FRAC = 0.35;
const SEE_RADIUS = 1300; // vision (with LOS)
const CLOSE_RADIUS = 300; // peripheral awareness — always detected
/** The killing pocket: retreat below MIN, advance above MAX. */
const ENGAGE_MIN = 380;
const ENGAGE_MAX = 820;
const PREFERRED_LO = 470;
const PREFERRED_HI = 640;
/** Bow draw time before the loose. */
const AIM_TIME = 0.9;
const SHOOT_RANGE = 1050;
const SHOOT_CD = 1.7; // between shots at range (randomized ±25%)
const CLOSE_CD = 1.0; // close-range rapid shots
const FLURRY_CHANCE = 0.35; // quick second arrow when the player closes in
const ARROW_SPEED = 950;
const ARROW_G = 780;
const ARROW_DAMAGE = 13;
const ARROW_LIFE = 4;
const ARROW_HIT_R = 46;
/** Lead fraction of the player's smoothed velocity baked into the aim. */
const LEAD_FRAC = 0.8;
const AIM_SPREAD = 0.022; // fraction of distance — dodgeable, not laser
const HIT_IMPULSE = 150;
const HIT_TAU = 0.3;
/** Pack spacing (never one blob of archers). */
const SEPARATION = 120;
/** Population (low-spec devices run a thinner pack). */
const POP_TARGET = 3;
const SPAWN_MIN = 480;
const SPAWN_MAX = 1150;
const SPAWN_COOLDOWN = 3.2;
const SPAWN_CLEARANCE = 400; // never materialise in your face
/** A biome counts as GRASSLAND when every special factor reads low. */
const BIOME_FACTOR_MAX = 0.3;
const BURN_TIME = 1.7; // sunrise despawn
const DEATH_HOLD = 0.9;
const SINK_TIME = 1.0;

type Brain =
  | 'idle'
  | 'wander'
  | 'stalk'
  | 'combat'
  | 'aim';

type Phase = 'alive' | 'dying' | 'burning';

export interface SkeletonMobOptions {
  lowSpec?: boolean;
  /** Terrain height query — the skeleton walks the same ground you do. */
  heightAt: (x: number, z: number) => number;
  /** Grid->world conversion for the biome factors (page constants). */
  block: number;
  gridOffset: number;
  /** Arrow hits land here — wired to the page's applyDamage. */
  damagePlayer: (amount: number) => void;
  /** Arrow knockback — the page adds horizontal shove + vertical lift. */
  launchPlayer: (dirX: number, dirZ: number, vy: number, force: number) => void;
  /** The bow loosed (page: synthesized "thwip" cue). */
  onShoot: () => void;
  /** An arrow buried itself in you or the dirt (page: soft thud). */
  onArrowHit: () => void;
  /** Optional solid props (fruit + palm push-out) the skeleton respects. */
  obstacleAt?: (
    x: number,
    z: number,
    radius: number,
    y: number
  ) => { x: number; z: number } | null;
}

export interface SkeletonInfo {
  id: number;
  hp: number;
  maxHp: number;
  state: string;
  aggro: boolean;
  los: boolean;
  x: number;
  y: number;
  z: number;
}

export interface Skeletons {
  list(): SkeletonInfo[];
  /** Advance brains, arrows, animation, spawning. nightF: 1 = night. */
  update(dt: number, playerPos: THREE.Vector3, playerYaw: number, nightF: number): void;
  /** Bullet test: is the world point inside any alive skeleton? */
  hitTest(p: THREE.Vector3): { id: number } | null;
  /** Damage one skeleton; true if this blow was the killing one. */
  damage(id: number, amount: number, from?: THREE.Vector3): boolean;
  /** Explosion splash: every alive skeleton in radius takes falloff damage. */
  blast(p: THREE.Vector3, radius: number, maxDamage: number): void;
  /** Player push-out — returns the corrected position or null if clear. */
  collide(x: number, z: number, radius: number): { x: number; z: number } | null;
  /** Debug/verification spawn — keeps the grassland gate, skips night. */
  spawnAt(x: number, z: number): boolean;
  /** Counters for debug surfaces. */
  stats: {
    alive: number;
    spawned: number;
    shot: number;
    hits: number;
    killed: number;
  };
  dispose(): void;
}

// ---------------------------------------------------------------------------
// deterministic hash (textures must be reload-stable)
// ---------------------------------------------------------------------------
function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------------------------------------------------------------------------
// pixel art — the bone skin atlas
// ---------------------------------------------------------------------------

/** Pale bone palette (pre-shaded like the creeper's moss) — warm cream
 *  bone with the grey-purple shading from the reference art. */
const BONE = {
  base: '#e3dcc6',
  light: '#f4eedd',
  shade: '#a79da0',
  joint: '#8d8390',
  dark: '#5f5866',
};

/** Paint one 16x16 bone tile — kind 0 ribcage | 1 limb joints | 2 skull. */
function paintBoneTile(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  kind: number
): void {
  const px = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x, oy + y, 1, 1);
  };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const r = hash1(x * 12.9898 + y * 78.233 + kind * 7.7);
      let c = BONE.base;
      if (r < 0.12) c = BONE.shade;
      else if (r > 0.9) c = BONE.light;
      px(x, y, c);
    }
  }
  if (kind === 0) {
    // plain bone slab: soft top highlight + bottom shade (bevel look)
    for (let x = 0; x < 16; x++) {
      px(x, 0, BONE.light);
      px(x, 1, BONE.light);
      px(x, 14, BONE.shade);
      px(x, 15, BONE.dark);
    }
  } else if (kind === 1) {
    // limb: dark joint wraps top + bottom
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 16; x++) px(x, y, BONE.joint);
    for (let y = 13; y < 16; y++)
      for (let x = 0; x < 16; x++) px(x, y, BONE.joint);
  } else {
    // skull: a slightly darker jaw band along the bottom
    for (let y = 12; y < 16; y++)
      for (let x = 0; x < 16; x++) px(x, y, BONE.shade);
  }
}

/** The 48x16 skin atlas: ribcage | limb | skull. */
function paintSkinAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  paintBoneTile(ctx, 0, 0, 0);
  paintBoneTile(ctx, 16, 0, 1);
  paintBoneTile(ctx, 32, 0, 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial blob for the pupil halos + burn smoke. */
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

// UV helpers: the atlas is 3 tiles wide (16px each). Remap every box face
// onto one tile.
function remapBoxUVs(
  geo: THREE.BufferGeometry,
  tile: number // 0 ribcage | 1 limb | 2 skull
): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const u0 = tile / 3;
  const u1 = (tile + 1) / 3;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), uv.getY(i));
  }
  uv.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// model
// ---------------------------------------------------------------------------

interface SkeletonParts {
  root: THREE.Group; // feet-positioned
  bodyGroup: THREE.Group; // bobs while walking
  armPivots: THREE.Group[]; // [left, right] — pivots at the shoulders
  elbowPivots: THREE.Group[]; // [left, right] — forearm bend
  legPivots: THREE.Group[]; // [left, right] — pivots at the hips
  kneePivots: THREE.Group[]; // [left, right] — shin bend
  headPivot: THREE.Group; // pivot at the neck
  ribGroup: THREE.Group; // ribcage — scales with breathing
  bow: THREE.Group; // the bow, riding the RIGHT hand
  stringMesh: THREE.Mesh; // the bowstring — pulls during the draw
  glowMats: THREE.MeshBasicMaterial[]; // ghostly pupils
  haloMats: THREE.SpriteMaterial[]; // pupil halos
  fadeMats: THREE.Material[]; // every material — for burn/death fades
}

/** Box helper with skin-tile UVs. */
function boneBox(
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

/** Build one skeleton — a segmented bone body: grinning skull with a
 *  triangular nasal hole, exposed ribcage over a dark chest cavity,
 *  spine + pelvis, and jointed stick limbs with little feet. */
function buildSkeleton(
  skin: THREE.Texture,
  haloTex: THREE.Texture,
  lowSpec: boolean
): SkeletonParts {
  const root = new THREE.Group();

  // per-skeleton materials (cloned so burn-fade is private)
  const bodyMat = new THREE.MeshLambertMaterial({ map: skin });
  const limbMat = new THREE.MeshLambertMaterial({ map: skin });
  const headMat = new THREE.MeshLambertMaterial({ map: skin });
  const cavityMat = new THREE.MeshLambertMaterial({ color: '#26222b' });
  const spineMat = new THREE.MeshLambertMaterial({ color: '#8a8191' });
  const teethMat = new THREE.MeshLambertMaterial({ color: '#f2ecda' });
  const socketMat = new THREE.MeshBasicMaterial({ color: '#141412' });
  const pupilMat = new THREE.MeshBasicMaterial({ color: '#8fe8ff' });
  const woodMat = new THREE.MeshLambertMaterial({ color: '#6b4a2a' });
  const woodDarkMat = new THREE.MeshLambertMaterial({ color: '#52381f' });
  const stringMat = new THREE.MeshBasicMaterial({ color: '#e8e5d8' });
  const shadow = !lowSpec;
  const fadeMats: THREE.Material[] = [
    bodyMat,
    limbMat,
    headMat,
    cavityMat,
    spineMat,
    teethMat,
    socketMat,
    pupilMat,
    woodMat,
    woodDarkMat,
    stringMat,
  ];

  /** Textured bone part: box + atlas UVs + shadow, added to a parent. */
  const bonePart = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    tile: number,
    parent: THREE.Object3D
  ): THREE.Mesh => {
    const geo = new THREE.BoxGeometry(w, h, d);
    remapBoxUVs(geo, tile);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    parent.add(mesh);
    return mesh;
  };

  // --- legs: thigh | knee wrap | shin | foot (knees bend while walking) ----
  const legPivots: THREE.Group[] = [];
  const kneePivots: THREE.Group[] = [];
  for (let i = 0; i < 2; i++) {
    const pivot = new THREE.Group();
    pivot.position.set((i === 0 ? -1 : 1) * LIMB_W, LIMB_H, 0);
    bonePart(LIMB_W, 36, LIMB_W, 0, -18, 0, limbMat, 1, pivot); // thigh
    const knee = new THREE.Group();
    knee.position.y = -36;
    pivot.add(knee);
    bonePart(LIMB_W + 3, 6, LIMB_W + 3, 0, -3, 0, limbMat, 1, knee); // wrap
    bonePart(LIMB_W, 36, LIMB_W, 0, -24, 0, limbMat, 1, knee); // shin
    bonePart(LIMB_W, 6, LIMB_W + 10, 0, -45, 4, limbMat, 1, knee); // foot
    root.add(pivot);
    legPivots.push(pivot);
    kneePivots.push(knee);
  }

  // --- torso: pelvis + spine + an exposed ribcage over a dark cavity ------
  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = LIMB_H;
  root.add(bodyGroup);

  // pelvis — a hip bar with two flared wing bones, like the art
  bonePart(40, 14, BODY_D + 6, 0, 9, 0, bodyMat, 0, bodyGroup);
  const hipL = bonePart(12, 12, BODY_D + 2, -19, 11, 0, bodyMat, 0, bodyGroup);
  hipL.rotation.z = 0.35;
  const hipR = bonePart(12, 12, BODY_D + 2, 19, 11, 0, bodyMat, 0, bodyGroup);
  hipR.rotation.z = -0.35;
  // spine — the grey vertebra bar showing between pelvis and ribcage
  const spine = new THREE.Mesh(new THREE.BoxGeometry(10, 14, 10), spineMat);
  spine.position.set(0, 21, -5);
  spine.castShadow = shadow;
  bodyGroup.add(spine);
  // ribcage — four rib bars over a dark chest cavity (it breathes)
  const ribGroup = new THREE.Group();
  bodyGroup.add(ribGroup);
  bonePart(BODY_W - 14, 56, BODY_D - 8, 0, 53, 0, cavityMat, 0, ribGroup);
  for (let r = 0; r < 4; r++) {
    bonePart(BODY_W, 9, BODY_D + 2, 0, 31 + r * 14, 0, bodyMat, 0, ribGroup);
  }
  // shoulder bar — the arms hang off this clavicle beam
  bonePart(BODY_W + 2, 10, BODY_D + 4, 0, 79, 0, bodyMat, 0, bodyGroup);

  const headPivot = new THREE.Group();
  headPivot.position.y = BODY_H;
  bodyGroup.add(headPivot);
  const headGeo = new THREE.BoxGeometry(HEAD, HEAD, HEAD);
  remapBoxUVs(headGeo, 2);
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = HEAD / 2;
  head.castShadow = shadow;
  headPivot.add(head);

  // --- the SKULL FACE (dark boxes slightly proud of the head front) ------
  // vanilla 8px skull face: 2x2 sockets rows 2-3, 1px nose row 4,
  // a 3px mouth bar row 6 — plus tiny ghostly-cyan pupils inside.
  const glowMats: THREE.MeshBasicMaterial[] = [];
  const haloMats: THREE.SpriteMaterial[] = [];
  const faceZ = HEAD / 2 + 2;
  const addDark = (
    w: number,
    h: number,
    x: number,
    y: number
  ): THREE.Mesh => {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 5),
      socketMat
    );
    box.position.set(x, y, faceZ);
    headPivot.add(box);
    return box;
  };
  // big square sockets, a triangular nasal hole, and a grinning mouth
  addDark(16, 16, -2.1 * PX, HEAD / 2); // left socket
  addDark(16, 16, 2.1 * PX, HEAD / 2); // right socket
  addDark(4.6 * PX, 9, 0, 6); // mouth cavity
  // the nasal hole — a triangular prism pointing down, like the art
  const nose = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6, 5, 3),
    socketMat
  );
  nose.rotateX(Math.PI / 2);
  nose.position.set(0, 16.5, faceZ);
  headPivot.add(nose);
  // the grin — a row of square teeth over the dark cavity
  for (let i = 0; i < 6; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(4.2, 7, 4.5), teethMat);
    tooth.position.set(-13.5 + i * 5.4, 6, faceZ + 1.5);
    tooth.castShadow = shadow;
    headPivot.add(tooth);
  }
  // ghostly pupils — tiny unlit cyan slivers inside the sockets
  const addPupil = (x: number, y: number) => {
    const m = pupilMat.clone();
    glowMats.push(m);
    fadeMats.push(m);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9 * PX, 0.9 * PX, 6), m);
    box.position.set(x, y, faceZ + 1);
    headPivot.add(box);
  };
  addPupil(-2.1 * PX, HEAD / 2);
  addPupil(2.1 * PX, HEAD / 2);
  // faint additive halos — the ghost-light around the pupils
  const haloPos: [number, number, number][] = [
    [-2.1 * PX, HEAD / 2, faceZ + 6],
    [2.1 * PX, HEAD / 2, faceZ + 6],
  ];
  for (const [hx, hy, hz] of haloPos) {
    const hm = new THREE.SpriteMaterial({
      map: haloTex,
      color: '#9fe8ff',
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    haloMats.push(hm);
    fadeMats.push(hm);
    const s = new THREE.Sprite(hm);
    s.position.set(hx, hy, hz);
    s.scale.setScalar(2.4 * PX);
    headPivot.add(s);
  }

  // --- arms: upper arm | elbow wrap | forearm | hand -----------------------
  const armPivots: THREE.Group[] = [];
  const elbowPivots: THREE.Group[] = [];
  for (let i = 0; i < 2; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(
      (i === 0 ? -1 : 1) * (BODY_W / 2 + LIMB_W / 2),
      LIMB_H + BODY_H - PX,
      0
    );
    bonePart(LIMB_W, 34, LIMB_W, 0, -17, 0, limbMat, 1, pivot); // upper arm
    const elbow = new THREE.Group();
    elbow.position.y = -34;
    pivot.add(elbow);
    bonePart(LIMB_W + 3, 6, LIMB_W + 3, 0, -3, 0, limbMat, 1, elbow); // wrap
    bonePart(LIMB_W, 34, LIMB_W, 0, -23, 0, limbMat, 1, elbow); // forearm
    bonePart(LIMB_W + 1, 10, LIMB_W + 1, 0, -45, 0, limbMat, 1, elbow); // hand
    bodyGroup.add(pivot);
    armPivots.push(pivot);
    elbowPivots.push(elbow);
  }

  // --- the BOW (grip + curved limbs + a pullable string) ------------------
  const bow = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.BoxGeometry(5, 24, 5), woodDarkMat);
  grip.castShadow = !lowSpec;
  bow.add(grip);
  // two angled limbs — the classic Minecraft bow curve
  const limbU = new THREE.Mesh(new THREE.BoxGeometry(4.5, 26, 4.5), woodMat);
  limbU.position.set(0, 22, -2);
  limbU.rotation.x = 0.42;
  limbU.castShadow = !lowSpec;
  bow.add(limbU);
  const limbL = new THREE.Mesh(new THREE.BoxGeometry(4.5, 26, 4.5), woodMat);
  limbL.position.set(0, -22, -2);
  limbL.rotation.x = -0.42;
  limbL.castShadow = !lowSpec;
  bow.add(limbL);
  // the string — a hair-thin bright box that PULLS during the draw
  const stringMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 62, 1.1),
    stringMat
  );
  stringMesh.position.set(0, 0, -3.5);
  bow.add(stringMesh);
  // ride the right hand
  bow.position.set(0, -45, 2);
  elbowPivots[1].add(bow);

  return {
    root,
    bodyGroup,
    armPivots,
    elbowPivots,
    legPivots,
    kneePivots,
    headPivot,
    ribGroup,
    bow,
    stringMesh,
    glowMats,
    haloMats,
    fadeMats,
  };
}

// ---------------------------------------------------------------------------
// the manager
// ---------------------------------------------------------------------------

interface Skeleton extends SkeletonParts {
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
  vy: number; // knock hop
  airborne: boolean;
  kbX: number;
  kbZ: number;
  walkT: number; // gait phase
  moving: boolean;
  timer: number; // brain countdown
  targetX: number;
  targetZ: number;
  aggro: boolean;
  los: boolean;
  aimT: number; // draw progress
  aimDur: number; // draw length this cycle
  shootCd: number;
  strafeDir: number; // circle side
  strafeT: number; // flip timer
  stuckT: number; // retreat blocked for PANIC
  flinchT: number; // hit flinch
  dieT: number;
  burnT: number;
  scanSeed: number;
}

interface Arrow {
  mesh: THREE.Group;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  stuckT: number; // >0 = buried, counting to fade
  active: boolean;
}

export function createSkeletonMobs(
  scene: THREE.Scene,
  opts: SkeletonMobOptions
): Skeletons {
  const lowSpec = opts.lowSpec ?? false;
  const POOL = POP_TARGET + 2;

  // ---- shared assets ------------------------------------------------------
  const skin = paintSkinAtlas();
  const haloTex = paintBlob('rgba(160,230,255,0.9)', 'rgba(160,230,255,0)');
  const smokeTex = paintBlob('rgba(200,196,184,0.85)', 'rgba(200,196,184,0)');

  const group = new THREE.Group();
  group.name = 'skeletonMobs';
  scene.add(group);

  const skeletons: Skeleton[] = [];
  for (let i = 0; i < POOL; i++) {
    const parts = buildSkeleton(skin, haloTex, lowSpec);
    parts.root.visible = false;
    group.add(parts.root);
    skeletons.push({
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
      airborne: false,
      kbX: 0,
      kbZ: 0,
      walkT: 0,
      moving: false,
      timer: 0,
      targetX: 0,
      targetZ: 0,
      aggro: false,
      los: false,
      aimT: 0,
      aimDur: AIM_TIME,
      shootCd: 2,
      strafeDir: 1,
      strafeT: 1,
      stuckT: 0,
      flinchT: 0,
      dieT: 0,
      burnT: 0,
      scanSeed: i * 5.3,
    });
  }

  // ---- arrow pool -----------------------------------------------------------
  const ARROW_N = lowSpec ? 10 : 22;
  const arrows: Arrow[] = [];
  const shaftGeo = new THREE.BoxGeometry(4, 4, 72);
  const tipGeo = new THREE.BoxGeometry(5.5, 5.5, 14);
  const finGeo = new THREE.BoxGeometry(1.5, 16, 12);
  const shaftMat = new THREE.MeshLambertMaterial({ color: '#8a6a42' });
  const tipMat = new THREE.MeshLambertMaterial({ color: '#4a4a48' });
  const finMat = new THREE.MeshLambertMaterial({ color: '#d8d8d0' });
  for (let i = 0; i < ARROW_N; i++) {
    const mesh = new THREE.Group();
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    mesh.add(shaft);
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.z = 40;
    mesh.add(tip);
    const fin = new THREE.Mesh(finGeo, finMat);
    fin.position.z = -30;
    mesh.add(fin);
    const fin2 = new THREE.Mesh(finGeo, finMat);
    fin2.position.z = -30;
    fin2.rotation.z = Math.PI / 2;
    mesh.add(fin2);
    mesh.visible = false;
    scene.add(mesh);
    arrows.push({
      mesh,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      stuckT: 0,
      active: false,
    });
  }
  let arrowCursor = 0;

  // ---- burn smoke pool ------------------------------------------------------
  const SMOKE_N = lowSpec ? 5 : 9;
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
      color: '#cfcabb',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    scene.add(sprite);
    smokes.push({ sprite, mat, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 50 });
  }
  let smokeCursor = 0;

  // ---- bone debris pool -----------------------------------------------------
  const boneGeo = new THREE.BoxGeometry(9, 9, 9);
  const boneMats = [
    new THREE.MeshLambertMaterial({ color: '#d6d3c4' }),
    new THREE.MeshLambertMaterial({ color: '#a8a493' }),
    new THREE.MeshLambertMaterial({ color: '#6b4a2a' }),
  ];
  const BONE_N = lowSpec ? 14 : 26;
  const bones: {
    mesh: THREE.Mesh;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    spin: number;
  }[] = [];
  for (let i = 0; i < BONE_N; i++) {
    const mesh = new THREE.Mesh(boneGeo, boneMats[i % boneMats.length]);
    mesh.visible = false;
    scene.add(mesh);
    bones.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, spin: 0 });
  }
  let boneCursor = 0;

  // ---- stats + state --------------------------------------------------------
  const stats = { alive: 0, spawned: 0, shot: 0, hits: 0, killed: 0 };
  let spawnCd = 2.4;

  // scratch
  const playerPos = new THREE.Vector3();
  let playerYaw = 0;
  let nightF = 1;
  /** The player's SMOOTHED velocity — the archer's lead prediction fuel. */
  const prevPlayer = new THREE.Vector3();
  const playerVel = new THREE.Vector3();
  const tmpVel = new THREE.Vector3();
  let havePrev = false;
  /** Knock-hop gravity (the little hop when a bullet connects). */
  const HOP_G = 1500;

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

  /** Line of sight: sample the terrain along the eye->target ray; any
   *  sample where the ground pokes above the ray blocks the shot. */
  const hasLOS = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number
  ): boolean => {
    const steps = 10;
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      const lx = x0 + (x1 - x0) * k;
      const ly = y0 + (y1 - y0) * k;
      const lz = z0 + (z1 - z0) * k;
      if (opts.heightAt(lx, lz) + 26 > ly) return false;
    }
    return true;
  };

  const activate = (x: number, z: number, s: Skeleton): void => {
    s.active = true;
    s.phase = 'alive';
    s.brain = 'idle';
    s.hp = MAX_HP;
    s.x = x;
    s.z = z;
    s.y = opts.heightAt(x, z);
    s.yaw = Math.random() * Math.PI * 2;
    s.yawTarget = s.yaw;
    s.vy = 0;
    s.airborne = false;
    s.kbX = 0;
    s.kbZ = 0;
    s.walkT = 0;
    s.moving = false;
    s.timer = 1 + Math.random() * 2;
    s.aggro = false;
    s.los = false;
    s.aimT = 0;
    s.aimDur = AIM_TIME;
    s.shootCd = 2 + Math.random();
    s.strafeDir = Math.random() > 0.5 ? 1 : -1;
    s.strafeT = 1.5;
    s.stuckT = 0;
    s.flinchT = 0;
    s.dieT = 0;
    s.burnT = 0;
    for (const m of s.fadeMats) {
      m.transparent = false;
      m.opacity = 1;
    }
    s.root.visible = true;
    s.root.scale.setScalar(1);
    s.root.position.set(x, s.y, z);
    s.root.rotation.set(0, 0, 0);
    for (const p of [
      ...s.legPivots,
      ...s.armPivots,
      ...s.elbowPivots,
      ...s.kneePivots,
    ]) {
      p.rotation.set(0, 0, 0);
    }
    s.bodyGroup.position.y = LIMB_H;
    s.bodyGroup.rotation.set(0, 0, 0);
    s.ribGroup.scale.set(1, 1, 1);
    stats.spawned++;
  };

  const release = (s: Skeleton): void => {
    s.active = false;
    s.root.visible = false;
  };

  const spawnSkeleton = (x: number, z: number): Skeleton | null => {
    if (!isGrassland(x, z)) return null;
    if (!flatEnough(x, z)) return null;
    if (Math.hypot(x - playerPos.x, z - playerPos.z) < SPAWN_CLEARANCE)
      return null;
    for (const o of skeletons) {
      if (o.active && Math.hypot(x - o.x, z - o.z) < 150) return null;
    }
    const slot = skeletons.find((s) => !s.active);
    if (!slot) return null;
    activate(x, z, slot);
    return slot;
  };

  // ---- arrows ----------------------------------------------------------------
  const spawnPuff = (x: number, y: number, z: number, n: number): void => {
    for (let i = 0; i < n; i++) {
      const s = smokes[smokeCursor];
      smokeCursor = (smokeCursor + 1) % SMOKE_N;
      const a = Math.random() * Math.PI * 2;
      s.sprite.position.set(x + Math.sin(a) * 14, y + Math.random() * 30, z + Math.cos(a) * 14);
      s.sprite.visible = true;
      s.vx = (Math.random() - 0.5) * 40;
      s.vz = (Math.random() - 0.5) * 40;
      s.vy = 50 + Math.random() * 60;
      s.life = 0;
      s.max = 0.8 + Math.random() * 0.5;
      s.size = 26 + Math.random() * 20;
      s.mat.rotation = Math.random() * Math.PI * 2;
    }
  };

  const spawnBones = (x: number, y: number, z: number, n: number): void => {
    for (let i = 0; i < n; i++) {
      const b = bones[boneCursor];
      boneCursor = (boneCursor + 1) % BONE_N;
      const a = Math.random() * Math.PI * 2;
      const up = 150 + Math.random() * 380;
      const sp = 120 + Math.random() * 320;
      b.mesh.position.set(x, y + 60, z);
      b.mesh.visible = true;
      b.mesh.scale.setScalar(0.6 + Math.random() * 0.9);
      b.vx = Math.sin(a) * sp;
      b.vz = Math.cos(a) * sp;
      b.vy = up;
      b.life = 1 + Math.random() * 0.5;
      b.spin = (Math.random() - 0.5) * 14;
    }
  };

  const deactivateArrow = (a: Arrow): void => {
    a.active = false;
    a.mesh.visible = false;
  };

  const fireArrow = (s: Skeleton): void => {
    const a = arrows[arrowCursor];
    arrowCursor = (arrowCursor + 1) % ARROW_N;
    // muzzle: the bow hand, pushed forward along the facing
    const eyeY = s.y + LIMB_H + BODY_H * 0.85;
    const ox = s.x + Math.sin(s.yaw) * 30;
    const oz = s.z + Math.cos(s.yaw) * 30;
    const dy0 = playerPos.y + 95 - eyeY;
    const dist0 = Math.sqrt(
      (playerPos.x - ox) ** 2 + dy0 * dy0 + (playerPos.z - oz) ** 2
    );
    const T = Math.max(0.35, dist0 / ARROW_SPEED);
    // VELOCITY LEAD: aim where the player WILL be (imperfect on purpose)
    const spread = dist0 * AIM_SPREAD;
    const tx =
      playerPos.x + playerVel.x * T * LEAD_FRAC + (Math.random() - 0.5) * spread;
    const ty = playerPos.y + 95 + playerVel.y * T * 0.5 + (Math.random() - 0.5) * spread * 0.4;
    const tz =
      playerPos.z + playerVel.z * T * LEAD_FRAC + (Math.random() - 0.5) * spread;
    const dx = tx - ox;
    const dy = ty - eyeY;
    const dz = tz - oz;
    // ballistic solve: flat speed + gravity-compensated rise
    a.vx = dx / T;
    a.vz = dz / T;
    a.vy = dy / T + 0.5 * ARROW_G * T;
    a.mesh.position.set(ox, eyeY, oz);
    a.mesh.visible = true;
    a.life = ARROW_LIFE;
    a.stuckT = 0;
    a.active = true;
    a.mesh.lookAt(ox + a.vx, eyeY + a.vy, oz + a.vz);
    stats.shot++;
    opts.onShoot();
  };

  const tickArrows = (dt: number): void => {
    for (const a of arrows) {
      if (!a.active) continue;
      if (a.stuckT > 0) {
        // buried in the dirt — stand there a beat, then fade out
        a.stuckT += dt;
        if (a.stuckT > 2.2) {
          const k = (a.stuckT - 2.2) / 0.8;
          if (k >= 1) {
            deactivateArrow(a);
            continue;
          }
          a.mesh.scale.setScalar(Math.max(0.01, 1 - k));
        }
        continue;
      }
      a.life -= dt;
      if (a.life <= 0) {
        deactivateArrow(a);
        continue;
      }
      a.vy -= ARROW_G * dt;
      const p = a.mesh.position;
      // SUBSTEPPED integration + swept hit tests: at clamped dt a fast
      // arrow can jump 90+ units per tick — sample the flight segment so
      // it can neither tunnel through the player nor skip into a hillside
      const steps = Math.min(4, Math.max(1, Math.ceil((Math.hypot(a.vx, a.vz) + Math.abs(a.vy)) * dt / 40)));
      let consumed = false;
      for (let k = 1; k <= steps && !consumed; k++) {
        const f = (dt * k) / steps;
        const sx = p.x + a.vx * f;
        const sy = p.y + a.vy * f - 0.5 * ARROW_G * f * f;
        const sz = p.z + a.vz * f;
        // player capsule hit
        const dx = playerPos.x - sx;
        const dz = playerPos.z - sz;
        if (
          dx * dx + dz * dz < ARROW_HIT_R * ARROW_HIT_R &&
          sy > playerPos.y - 14 &&
          sy < playerPos.y + 210
        ) {
          opts.damagePlayer(ARROW_DAMAGE + ((Math.random() * 5) | 0));
          const d = Math.hypot(a.vx, a.vz) || 1;
          opts.launchPlayer(a.vx / d, a.vz / d, 130, 240);
          stats.hits++;
          opts.onArrowHit();
          deactivateArrow(a);
          consumed = true;
          break;
        }
        // terrain hit — bury and stick
        const gy = opts.heightAt(sx, sz);
        if (sy <= gy + 4) {
          p.set(sx, gy + 4, sz);
          a.vx = 0;
          a.vy = 0;
          a.vz = 0;
          a.stuckT = 0.0001;
          spawnPuff(p.x, p.y, p.z, 2);
          opts.onArrowHit();
          consumed = true;
          break;
        }
        if (k === steps) p.set(sx, sy, sz);
      }
      if (consumed) continue;
      a.mesh.lookAt(p.x + a.vx, p.y + a.vy, p.z + a.vz);
    }
  };

  // ---- damage ---------------------------------------------------------------
  const killSkeleton = (s: Skeleton): void => {
    s.phase = 'dying';
    s.dieT = 0;
    s.moving = false;
    stats.killed++;
    // the bones burst out of the falling body
    spawnBones(s.x, s.y, s.z, lowSpec ? 8 : 14);
  };

  // ---- per-frame helpers ------------------------------------------------------
  /** Minecraft mobs step up ONE block — the climb gate accepts a full step. */
  const STEP_UP = 108;
  const steerAhead = (s: Skeleton, dirX: number, dirZ: number): number => {
    const probe = (off: number): boolean => {
      const sin = Math.sin(off);
      const co = Math.cos(off);
      const rx = dirX * co - dirZ * sin;
      const rz = dirX * sin + dirZ * co;
      const h = opts.heightAt(s.x + rx * 60, s.z + rz * 60);
      return h - s.y < STEP_UP;
    };
    if (probe(0)) return 0;
    if (probe(0.7 * s.strafeDir)) return 0.7 * s.strafeDir;
    if (probe(-0.7 * s.strafeDir)) return -0.7 * s.strafeDir;
    if (probe(1.4 * s.strafeDir)) return 1.4 * s.strafeDir;
    if (probe(-1.4 * s.strafeDir)) return -1.4 * s.strafeDir;
    if (probe(2.1 * s.strafeDir)) return 2.1 * s.strafeDir;
    if (probe(-2.1 * s.strafeDir)) return -2.1 * s.strafeDir;
    return NaN; // walled in — hold position
  };

  const stepWalk = (
    s: Skeleton,
    dt: number,
    dirX: number,
    dirZ: number,
    speed: number
  ): void => {
    if (speed <= 0 || !Number.isFinite(dirX)) {
      s.moving = false;
      return;
    }
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;
    const off = steerAhead(s, nx, nz);
    if (Number.isNaN(off)) {
      s.moving = false;
      s.strafeDir = -s.strafeDir;
      return;
    }
    const sin = Math.sin(off);
    const co = Math.cos(off);
    const mx = (nx * co - nz * sin) * speed * dt;
    const mz = (nx * sin + nz * co) * speed * dt;
    s.x += mx + s.kbX * dt;
    s.z += mz + s.kbZ * dt;
    s.moving = true;
    // solid props (fruits + palms) push the skeleton out like the player
    if (opts.obstacleAt) {
      const push = opts.obstacleAt(s.x, s.z, BODY_RADIUS, s.y);
      if (push) {
        s.x = push.x;
        s.z = push.z;
      }
    }
  };

  /** The eye ray height for LOS — from the skull down to your chest. */
  const eyeYOf = (s: Skeleton): number => s.y + LIMB_H + BODY_H * 0.85;

  const brainTick = (s: Skeleton, dt: number): void => {
    const dx = playerPos.x - s.x;
    const dz = playerPos.z - s.z;
    const dy = playerPos.y - s.y;
    const distH = Math.hypot(dx, dz);
    const dist3 = Math.sqrt(distH * distH + dy * dy);
    const dirX = dx / (distH || 1);
    const dirZ = dz / (distH || 1);
    s.los = hasLOS(s.x, eyeYOf(s), s.z, playerPos.x, playerPos.y + 95, playerPos.z);

    // senses: close range always; vision needs the terrain ray clear
    if (!s.aggro) {
      if (dist3 < CLOSE_RADIUS || (dist3 < SEE_RADIUS && s.los)) {
        s.aggro = true;
        s.brain = 'stalk';
      }
    }

    s.shootCd = Math.max(0, s.shootCd - dt);
    s.strafeT -= dt;
    if (s.strafeT <= 0) {
      s.strafeDir = Math.random() > 0.5 ? 1 : -1;
      s.strafeT = 1.4 + Math.random() * 1.8;
    }

    switch (s.brain) {
      case 'idle': {
        s.moving = false;
        s.timer -= dt;
        if (s.timer <= 0) {
          s.timer = 2 + Math.random() * 3;
          s.targetX = s.x + (Math.random() - 0.5) * 500;
          s.targetZ = s.z + (Math.random() - 0.5) * 500;
          s.brain = 'wander';
        }
        break;
      }
      case 'wander': {
        s.timer -= dt;
        const tdx = s.targetX - s.x;
        const tdz = s.targetZ - s.z;
        const td = Math.hypot(tdx, tdz);
        if (td < 40 || s.timer <= 0) {
          s.brain = 'idle';
          s.timer = 1 + Math.random() * 3;
          s.moving = false;
        } else {
          stepWalk(s, dt, tdx / td, tdz / td, WALK_SPEED);
        }
        break;
      }
      case 'stalk': {
        if (!s.aggro) {
          s.brain = 'idle';
          break;
        }
        if (distH <= PREFERRED_LO && s.los) {
          s.brain = 'combat';
          break;
        }
        stepWalk(s, dt, dirX, dirZ, ADVANCE_SPEED);
        s.yawTarget = Math.atan2(dirX, dirZ);
        break;
      }
      case 'combat': {
        if (!s.aggro) {
          s.brain = 'idle';
          break;
        }
        if (distH > ENGAGE_MAX) {
          s.brain = 'stalk';
          break;
        }
        // THE KITE: retreat below the pocket, advance above it, otherwise
        // circle — the classic skeleton footwork
        let mvx: number;
        let mvz: number;
        let speed = STRAFE_SPEED;
        if (distH < ENGAGE_MIN) {
          // diagonal backpedal (retreat + strafe mixed)
          mvx = -dirX - dirZ * s.strafeDir * 0.55;
          mvz = -dirZ + dirX * s.strafeDir * 0.55;
          speed = RETREAT_SPEED;
        } else if (distH > PREFERRED_HI) {
          // diagonal advance
          mvx = dirX * 0.6 - dirZ * s.strafeDir * 0.8;
          mvz = dirZ * 0.6 + dirX * s.strafeDir * 0.8;
          speed = STRAFE_SPEED * 1.15;
        } else {
          mvx = -dirZ * s.strafeDir;
          mvz = dirX * s.strafeDir;
        }
        stepWalk(s, dt, mvx, mvz, speed);
        // face the player while circling
        s.yawTarget = Math.atan2(dirX, dirZ);
        // PANIC: retreat walled for ~1s at knife range — dump rapid shots
        if (!s.moving && distH < ENGAGE_MIN) {
          s.stuckT += dt;
          if (s.stuckT > 0.9) s.shootCd = Math.min(s.shootCd, 0.12);
        } else {
          s.stuckT = Math.max(0, s.stuckT - dt * 2);
        }
        // DRAW: LOS + range + cooldown → raise the bow
        if (
          s.shootCd <= 0 &&
          s.los &&
          dist3 < SHOOT_RANGE
        ) {
          s.brain = 'aim';
          s.aimT = 0;
          s.aimDur = AIM_TIME * (dist3 < 350 ? 0.7 : 1);
        }
        break;
      }
      case 'aim': {
        // the draw: hold mostly still (a slow drift), track hard, LOOSE
        s.aimT += dt;
        const drift = STRAFE_SPEED * AIM_MOVE_FRAC;
        stepWalk(
          s,
          dt,
          -dirZ * s.strafeDir,
          dirX * s.strafeDir,
          drift
        );
        s.yawTarget = Math.atan2(dirX, dirZ);
        if (!s.los && s.aimT > 0.25) {
          // the ray went dark mid-draw — hold fire, reposition
          s.brain = 'combat';
          s.shootCd = 0.5;
          break;
        }
        if (distH > ENGAGE_MAX + 160) {
          // the player fled the pocket mid-draw
          s.brain = 'stalk';
          break;
        }
        if (s.aimT >= s.aimDur) {
          fireArrow(s);
          if (dist3 < 380 && Math.random() < FLURRY_CHANCE) {
            // two-arrow flurry: a quick partial redraw
            s.aimT = s.aimDur * 0.55;
            s.aimDur = AIM_TIME * 0.5;
          } else {
            s.brain = 'combat';
            s.shootCd =
              (dist3 < 380 ? CLOSE_CD : SHOOT_CD) *
              (0.75 + Math.random() * 0.5);
          }
        }
        break;
      }
      default:
        s.brain = 'idle';
    }
  };

  // ---- animation ------------------------------------------------------------
  const tmpEuler = new THREE.Euler();

  const animate = (s: Skeleton, dt: number, time: number): void => {
    s.root.position.set(s.x, s.y, s.z);

    // yaw easing (root)
    let dyaw = s.yawTarget - s.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    s.yaw += dyaw * Math.min(1, 8 * dt);
    s.root.rotation.y = s.yaw;

    const t = time + s.scanSeed;

    if (s.phase === 'dying') {
      s.dieT += dt;
      // fall backward, arms flung, then sink + fade
      const fall = Math.min(1, s.dieT / 0.5);
      const ease = 1 - (1 - fall) * (1 - fall);
      s.root.rotation.x = -ease * 1.42;
      s.armPivots[0].rotation.z = ease * 0.9;
      s.armPivots[1].rotation.z = -ease * 0.9;
      s.armPivots[0].rotation.x *= Math.max(0, 1 - 5 * dt);
      s.armPivots[1].rotation.x *= Math.max(0, 1 - 5 * dt);
      s.headPivot.rotation.z = ease * 0.4;
      for (const p of s.legPivots) p.rotation.x *= Math.max(0, 1 - 4 * dt);
      // knees buckle and elbows go limp as it drops
      for (const k of s.kneePivots) {
        k.rotation.x += (0.9 * ease - k.rotation.x) * Math.min(1, 8 * dt);
      }
      for (const e of s.elbowPivots) e.rotation.x *= Math.max(0, 1 - 5 * dt);
      if (s.dieT > DEATH_HOLD) {
        const k = Math.min(1, (s.dieT - DEATH_HOLD) / SINK_TIME);
        s.root.position.y = s.y - k * 80;
        for (const m of s.fadeMats) {
          m.transparent = true;
          m.opacity = 1 - k;
        }
        if (k >= 1) release(s);
      }
      return;
    }
    if (s.phase === 'burning') {
      s.burnT += dt;
      const k = Math.min(1, s.burnT / BURN_TIME);
      s.root.position.y = s.y + k * 22;
      s.root.rotation.y += dt * 9 * k;
      s.root.scale.setScalar(1 - k * 0.3);
      for (const m of s.fadeMats) {
        m.transparent = true;
        m.opacity = 1 - k;
      }
      if (Math.random() < dt * 9) {
        spawnPuff(
          s.x + (Math.random() - 0.5) * 40,
          s.y + 40 + Math.random() * 140,
          s.z + (Math.random() - 0.5) * 40,
          1
        );
      }
      if (k >= 1) release(s);
      return;
    }

    // ---- alive ----
    // terrain ride
    const gy = opts.heightAt(s.x, s.z);
    s.y += (gy - s.y) * Math.min(1, 10 * dt);

    // gait — every joint eases toward its target pose (buttery motion)
    let lLeg = 0;
    let rLeg = 0;
    let lKnee = 0.05;
    let rKnee = 0.07;
    let lElbWalk = -0.08;
    let rElbWalk = -0.1;
    let lSwingWalk = 0;
    let rSwingWalk = 0;
    let bob = Math.sin(t * 1.6) * 1.2; // idle breath
    let sway = Math.sin(t * 0.8) * 0.02;
    let hunch = 0;
    let breathe = Math.sin(t * 1.6);
    if (s.moving) {
      s.walkT += dt * (s.brain === 'stalk' ? 9.5 : 7);
      const sin = Math.sin(s.walkT);
      lLeg = sin * 0.62;
      rLeg = -sin * 0.62;
      // knees fold as each leg swings through the air
      lKnee = 0.08 + Math.max(0, -sin) * 0.6;
      rKnee = 0.08 + Math.max(0, sin) * 0.6;
      lSwingWalk = -sin * 0.5;
      rSwingWalk = sin * 0.45;
      lElbWalk = -0.16;
      rElbWalk = -0.16;
      bob = Math.abs(sin) * 3;
      sway = sin * 0.045;
      hunch = s.brain === 'stalk' ? 0.08 : 0.03; // hunting lean
      breathe = 0;
    }
    const kPose = Math.min(1, 10 * dt);
    s.legPivots[0].rotation.x += (lLeg - s.legPivots[0].rotation.x) * kPose;
    s.legPivots[1].rotation.x += (rLeg - s.legPivots[1].rotation.x) * kPose;
    s.kneePivots[0].rotation.x += (lKnee - s.kneePivots[0].rotation.x) * kPose;
    s.kneePivots[1].rotation.x += (rKnee - s.kneePivots[1].rotation.x) * kPose;
    s.bodyGroup.position.y += (LIMB_H + bob - s.bodyGroup.position.y) * kPose;
    s.bodyGroup.rotation.z += (sway - s.bodyGroup.rotation.z) * kPose;
    s.bodyGroup.rotation.x +=
      (hunch - s.bodyGroup.rotation.x) * Math.min(1, 6 * dt);
    s.ribGroup.scale.y = 1 + breathe * 0.025;

    // the BOW POSE: how far into the aim are we (0 hang, 1 full draw)
    let aimK = 0;
    if (s.brain === 'aim') {
      aimK = Math.min(1, (s.aimT / s.aimDur) * 1.25);
    } else if (s.brain === 'combat' && s.aggro) {
      aimK = 0.45; // bow half-raised while circling — always menacing
    }
    // flinch adds a shudder
    if (s.flinchT > 0) {
      s.flinchT -= dt;
      s.bodyGroup.rotation.z += Math.sin(s.flinchT * 60) * 0.06;
    }

    // aim pitch: track the player's height
    const dy = playerPos.y + 95 - (s.y + LIMB_H + BODY_H * 0.85);
    const distH = Math.hypot(playerPos.x - s.x, playerPos.z - s.z);
    const pitch = THREE.MathUtils.clamp(Math.atan2(dy, distH || 1), -0.55, 0.55);
    // draw tremble grows near the release
    const tremble = aimK > 0.75 ? Math.sin(t * 55) * 0.02 : 0;
    const releaseRecoil = s.brain !== 'aim' && aimK > 0 ? -0.12 : 0;

    // right arm (bow arm): rises to point at the player
    const rArm = s.armPivots[1];
    tmpEuler.set(
      rSwingWalk * (1 - aimK) +
        (-Math.PI / 2 + pitch + tremble + releaseRecoil) * aimK,
      0,
      0
    );
    rArm.rotation.x += (tmpEuler.x - rArm.rotation.x) * Math.min(1, 12 * dt);
    rArm.rotation.z += (0 - rArm.rotation.z) * Math.min(1, 6 * dt);
    // left arm: swings free, then rises to grip the string
    const lArm = s.armPivots[0];
    tmpEuler.set(
      lSwingWalk * (1 - aimK) + (-1.25 + aimK * 0.25) * aimK,
      0,
      0.18 * aimK
    );
    lArm.rotation.x += (tmpEuler.x - lArm.rotation.x) * Math.min(1, 12 * dt);
    lArm.rotation.z += (tmpEuler.z - lArm.rotation.z) * Math.min(1, 8 * dt);
    lArm.rotation.y = 0;

    // elbows: gentle fold while walking — the left folds harder to draw
    const kElb = Math.min(1, 12 * dt);
    const rElbT = rElbWalk * (1 - aimK) + -0.1 * aimK;
    const lElbT = lElbWalk * (1 - aimK) + -0.55 * aimK;
    s.elbowPivots[1].rotation.x += (rElbT - s.elbowPivots[1].rotation.x) * kElb;
    s.elbowPivots[0].rotation.x += (lElbT - s.elbowPivots[0].rotation.x) * kElb;

    // the STRING pulls back with the draw and snaps forward on release
    const pull = 11 * aimK;
    s.stringMesh.position.z = -3.5 + (s.brain === 'aim' ? pull : -2.2);
    s.stringMesh.scale.y = 1 - aimK * 0.22;

    // head: idle scan, or locked on the player when aggro
    if (s.aggro) {
      const want = Math.atan2(playerPos.x - s.x, playerPos.z - s.z);
      let rel = want - s.yaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      s.headPivot.rotation.y +=
        (THREE.MathUtils.clamp(rel, -1.0, 1.0) - s.headPivot.rotation.y) *
        Math.min(1, 8 * dt);
      s.headPivot.rotation.x = THREE.MathUtils.clamp(
        (s.y + 190 - (playerPos.y + 95)) / 1000,
        -0.35,
        0.35
      );
    } else {
      const bobH = s.moving ? Math.sin(s.walkT * 2) * 0.06 : 0;
      s.headPivot.rotation.y = Math.sin(t * 0.5) * 0.55 + bobH;
      s.headPivot.rotation.x =
        Math.sin(t * 0.31) * 0.07 +
        (s.moving ? Math.abs(Math.sin(s.walkT)) * 0.04 : 0);
    }

    // pupil glow: dim by day, ghost-bright at night
    for (const m of s.glowMats) {
      m.color.setRGB(0.35 + 0.35 * nightF, 0.75 + 0.2 * nightF, 0.85 + 0.1 * nightF);
    }
    for (const m of s.haloMats) {
      m.opacity = 0.08 + 0.34 * nightF;
    }
  };

  // ---- update ----------------------------------------------------------------
  let elapsed = 0;
  const update = (
    dt: number,
    pPos: THREE.Vector3,
    pYaw: number,
    pNightF: number
  ): void => {
    elapsed += dt;
    playerPos.copy(pPos);
    playerYaw = pYaw;
    nightF = pNightF;

    // smoothed player velocity (teleport-safe: clamp the spike)
    if (havePrev && dt > 0.001) {
      const ivx = (pPos.x - prevPlayer.x) / dt;
      const ivy = (pPos.y - prevPlayer.y) / dt;
      const ivz = (pPos.z - prevPlayer.z) / dt;
      const sp = Math.sqrt(ivx * ivx + ivy * ivy + ivz * ivz);
      const clamp = sp > 1500 ? 1500 / sp : 1;
      playerVel.lerp(
        tmpVel.set(ivx * clamp, ivy * clamp, ivz * clamp),
        Math.min(1, 6 * dt)
      );
    }
    prevPlayer.copy(pPos);
    havePrev = true;

    // population
    let alive = 0;
    for (const s of skeletons) {
      if (s.active && s.phase === 'alive') alive++;
    }
    stats.alive = alive;

    // spawning: night + grassland only
    spawnCd -= dt;
    if (nightF >= 0.5 && alive < POP_TARGET && spawnCd <= 0) {
      spawnCd = SPAWN_COOLDOWN;
      tryNaturalSpawn();
    }

    for (const s of skeletons) {
      if (!s.active) continue;

      // dawn: the bone horde burns away
      if (s.phase === 'alive' && nightF < 0.5) {
        s.phase = 'burning';
        s.burnT = 0;
      }

      if (s.phase === 'alive') {
        // knockback decay + hop integration
        if (s.kbX !== 0 || s.kbZ !== 0) {
          s.x += s.kbX * dt;
          s.z += s.kbZ * dt;
          const dec = Math.exp(-HIT_TAU * 3 * dt);
          s.kbX *= dec;
          s.kbZ *= dec;
          if (Math.abs(s.kbX) + Math.abs(s.kbZ) < 4) {
            s.kbX = 0;
            s.kbZ = 0;
          }
        }
        if (s.airborne) {
          s.vy -= HOP_G * dt;
          s.y += s.vy * dt;
          const g = opts.heightAt(s.x, s.z);
          if (s.y <= g) {
            s.y = g;
            s.airborne = false;
            s.vy = 0;
          }
        } else {
          brainTick(s, dt);
        }
      }

      animate(s, dt, elapsed);
    }

    tickArrows(dt);
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
      if (spawnSkeleton(x, z)) return;
    }
  };

  const tickVfx = (dt: number): void => {
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
      s.sprite.scale.setScalar(s.size * (1 + k * 2.2));
      s.mat.opacity = 0.5 * (1 - k) * (0.5 + 0.5 * Math.min(1, k * 6));
      s.mat.rotation += dt * 0.5;
    }
    // bone debris
    for (const b of bones) {
      if (!b.mesh.visible) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.mesh.visible = false;
        continue;
      }
      b.vy -= 1500 * dt;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.z += b.vz * dt;
      b.mesh.rotation.x += b.spin * dt;
      b.mesh.rotation.y += b.spin * 0.7 * dt;
      const gy = opts.heightAt(b.mesh.position.x, b.mesh.position.z);
      if (b.mesh.position.y < gy + 5) {
        b.mesh.position.y = gy + 5;
        b.vy = -b.vy * 0.3;
        b.vx *= 0.6;
        b.vz *= 0.6;
        if (Math.abs(b.vy) < 60) b.life = Math.min(b.life, 0.25);
      }
      if (b.life < 0.3) b.mesh.scale.multiplyScalar(Math.max(0.01, 1 - dt * 4));
    }
  };

  // ---- public API --------------------------------------------------------------
  return {
    list() {
      return skeletons
        .filter((s) => s.active)
        .map(
          (s): SkeletonInfo => ({
            id: s.id,
            hp: Math.max(0, Math.round(s.hp)),
            maxHp: MAX_HP,
            state: s.phase !== 'alive' ? s.phase : s.brain,
            aggro: s.aggro,
            los: s.los,
            x: Math.round(s.x),
            y: Math.round(s.y),
            z: Math.round(s.z),
          })
        );
    },

    update,

    hitTest(p) {
      for (const s of skeletons) {
        if (!s.active || s.phase !== 'alive') continue;
        const dx = p.x - s.x;
        const dz = p.z - s.z;
        if (dx * dx + dz * dz > 36 * 36) continue;
        if (p.y < s.y - 6 || p.y > s.y + MOB_HEIGHT + 8) continue;
        return { id: s.id };
      }
      return null;
    },

    damage(id, amount, from) {
      const s = skeletons.find((o) => o.id === id && o.active);
      if (!s || s.phase !== 'alive') return false;
      s.hp -= amount;
      s.flinchT = 0.3;
      // shove away from the hit + a little hop
      if (from) {
        const dx = s.x - from.x;
        const dz = s.z - from.z;
        const d = Math.hypot(dx, dz) || 1;
        s.kbX += (dx / d) * HIT_IMPULSE;
        s.kbZ += (dz / d) * HIT_IMPULSE;
      }
      if (!s.airborne) {
        s.airborne = true;
        s.vy = 160;
      }
      if (s.hp <= 0) {
        killSkeleton(s);
        return true;
      }
      // wounded: snap aggro, straight into the killing pocket
      s.aggro = true;
      if (s.brain === 'idle' || s.brain === 'wander') s.brain = 'combat';
      return false;
    },

    blast(p, radius, maxDamage) {
      for (const s of skeletons) {
        if (!s.active || s.phase !== 'alive') continue;
        const cy = s.y + 110;
        const d = Math.sqrt(
          (s.x - p.x) ** 2 + (cy - p.y) ** 2 + (s.z - p.z) ** 2
        );
        if (d > radius) continue;
        const dmg = maxDamage * (1 - d / radius);
        if (dmg < 4) continue;
        this.damage(s.id, dmg, p);
      }
    },

    collide(x, z, radius) {
      let cx = x;
      let cz = z;
      let hit = false;
      for (const s of skeletons) {
        if (!s.active || s.phase !== 'alive') continue;
        const dx = cx - s.x;
        const dz = cz - s.z;
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
      for (const o of skeletons) {
        if (o.active && Math.hypot(x - o.x, z - o.z) < 140) return false;
      }
      const slot = skeletons.find((s) => !s.active);
      if (!slot) return false;
      activate(x, z, slot);
      // debug spawns come in aggro — ready to demonstrate the AI
      slot.aggro = true;
      slot.brain = 'stalk';
      return true;
    },

    stats,

    dispose() {
      for (const s of skeletons) release(s);
      for (const a of arrows) deactivateArrow(a);
      scene.remove(group);
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh || (obj as THREE.Sprite).isSprite) {
          const mat = (mesh as THREE.Mesh).material as
            | THREE.Material
            | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else if (mat) mat.dispose();
        }
      });
      for (const a of arrows) scene.remove(a.mesh);
      for (const s of smokes) {
        scene.remove(s.sprite);
        s.mat.dispose();
      }
      for (const b of bones) scene.remove(b.mesh);
      boneGeo.dispose();
      for (const m of boneMats) m.dispose();
      shaftGeo.dispose();
      tipGeo.dispose();
      finGeo.dispose();
      shaftMat.dispose();
      tipMat.dispose();
      finMat.dispose();
      skin.dispose();
      haloTex.dispose();
      smokeTex.dispose();
    },
  };
}
