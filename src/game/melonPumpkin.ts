import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createGrassField,
  type GrassStyle,
  type GrassTuftsHandle,
  type GrassTuftsOptions,
} from './grassTufts';

/**
 *  MINECRAFT-STYLE PUMPKIN + MELON PLANTS (blocky fruit on the vine)
 *  -----------------------------------------------------------------
 *  Hand-painted the way Minecraft does it (no downloaded assets —
 *  Mojang textures are copyrighted, so everything is pixel art at
 *  runtime). The plant is split in TWO rendered pieces:
 *
 *   1. THE FRUIT BODY (static, instanced through the shared
 *      createGrassField factory like every other plant layer):
 *      a SHARP vanilla voxel box (0.95 x 0.8 blocks pumpkin, 0.95 x
 *      0.7 melon) with real box normals + the stem box on top.
 *      Sides/top UV-mapped into one 64x64 atlas. SOLID: the page
 *      feeds createFruitCollisions() so the player can jump onto and
 *      stand on the fruit like on any block.
 *
 *   2. THE MAIN BRANCH (interactive, own instanced mesh per kind):
 *      one smooth CUBIC-BEZIER vine sprouting exactly at the stem
 *      tip, arcing over the fruit's shoulder, descending to the soil
 *      and rooting into the terrain (tip buried + two root nubs).
 *      Along it: big LOBED cucurbit leaves, a yellow bloom on a
 *      stalk and a curled tendril at the tip. Far branches render
 *      instanced + static; the branch NEAR THE PLAYER swaps to a
 *      CPU-deformable mesh: walking/running against it pulls it
 *      along smoothly (stem pinned, tip swings most, leaves ride
 *      their attach point), it springs back with a light wobble, and
 *      if the player KEEPS forcing it past maximum stretch it SNAPS
 *      (dust puff via onBreak) — and regrows after a while.
 *
 *  STATIC like the cane: nothing sways on its own — only the player
 *  moves the branch. RARE: one plant per 20th-block quincunx point.
 */

// ---- palettes (pre-darkened ~12% for the intensity-12 sun, like the
// sugar cane and grass ramps) ---------------------------------------------

const PUMPKIN = {
  ribLight: '#e89b2f', // lit flank of each rib
  body: '#cd7d1a', // rib body
  ribDark: '#a25a0e', // crease between ribs
  topBody: '#c9761a', // top ring body
  topLight: '#dd8f26', // top ring highlight
  topDark: '#a25a0e', // top outer ring
  stem: '#6b5527', // drying brown-green stem
  stemDark: '#54431f',
};

const MELON = {
  stripeDark: '#3f7d20', // rind base
  stripeLight: '#82b94f', // light band
  stripePale: '#9cc964', // rare pale fleck on the light band
  topBody: '#427f22', // top base
  topLight: '#7cb84e', // top blobs
  stem: '#5d8a2e', // fresh green stem
  stemDark: '#486e24',
};

const LEAF = {
  base: '#4d8a28',
  light: '#67a83a',
  dark: '#3a6c1e',
};

const FLOWER = {
  petal: '#f0c93a', // cucurbit bloom yellow
  petalLight: '#ffd95e', // sunlit upper-left petals
  petalEdge: '#c9961f', // rim shade
  centre: '#d98a20', // orange nectar centre
};

/** Fruit body heights as a fraction of one block (also the collision
 *  tops — keep in sync with the geometry below). */
export const PUMPKIN_FRUIT_H = 0.8;
export const MELON_FRUIT_H = 0.7;

/** Deterministic 0..1 hash — atlas pixels must be stable across
 *  reloads (one texture is painted and shared by every instance). */
function fruitFleck(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---- the 64x64 atlas: six 16px tiles -------------------------------------
//
//  ( 0, 0) fruit side   (16, 0) fruit top   (32, 0) vine leaf   (48, 0) stem/vine
//  ( 0,16) flower       (16,16) tendril curl

type FruitTile = [number, number, number, number]; // u0, v0, u1, v1

type FruitAtlas = {
  side: FruitTile;
  top: FruitTile;
  leaf: FruitTile;
  stem: FruitTile;
  flower: FruitTile;
  curl: FruitTile;
};

/** Canvas tile origin -> UV region (canvas y grows down, v grows up). */
function tileUV(tx: number, ty: number): FruitTile {
  return [tx / 64, 1 - (ty + 16) / 64, (tx + 16) / 64, 1 - ty / 64];
}

function paintFruitAtlas(
  kind: 'pumpkin' | 'melon'
): { texture: THREE.CanvasTexture; uv: FruitAtlas } {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  const px = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };
  const pal = kind === 'pumpkin' ? PUMPKIN : MELON;

  // ---- side tile (0,0)-(15,15): the fruit's vertical art ----------------
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let c: string;
      if (kind === 'pumpkin') {
        // vanilla ribs, one per 5px: crease | lit flank | body | body | body
        const rib = x % 5;
        c = rib === 0 ? pal.ribDark : rib === 1 ? pal.ribLight : pal.body;
        // subtle vertical fiber flecks inside the body columns
        if (rib > 1) {
          const f = fruitFleck(x, Math.floor(y / 3));
          if (f > 0.92) c = pal.ribLight;
          else if (f < 0.08) c = pal.ribDark;
        }
      } else {
        // vanilla vertical stripes: 2px light band every 4px over the
        // dark rind, with only the BOUNDARY pixels jagged (deterministic
        // per 2-row band) so the bands stay clearly vertical + rare
        // pale flecks on the light band
        const band = x % 4;
        const edge = fruitFleck(Math.floor(x / 4), Math.floor(y / 2));
        let isLight = band >= 2;
        if (band === 1 && edge > 0.62) isLight = true; // light bites in
        else if (band === 2 && edge > 0.72) isLight = false; // dark bites in
        c = isLight ? pal.stripeLight : pal.stripeDark;
        if (isLight && fruitFleck(x, y) > 0.88) c = pal.stripePale;
      }
      // top + bottom rows shade slightly — grounds the fruit
      if (y === 0 || y === 15) c = kind === 'pumpkin' ? pal.ribDark : pal.stripeDark;
      px(x, y, c);
    }
  }

  // ---- top tile (16,0)-(31,15): rings (pumpkin) / blobs (melon) ---------
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let c: string;
      if (kind === 'pumpkin') {
        // blocky concentric rings around the stem scar
        const ring = Math.min(Math.min(x, 15 - x), Math.min(y, 15 - y));
        c = ring >= 6 ? pal.topLight : ring >= 3 ? pal.topBody : pal.topDark;
      } else {
        // patchy swirl: dark base with light blobs (hash-clustered)
        const bx = Math.floor(x / 3);
        const by = Math.floor(y / 3);
        const blob = fruitFleck(bx * 7.3, by * 5.1) > 0.55;
        c = blob ? pal.topLight : pal.topBody;
        if (fruitFleck(x, y) > 0.9) c = pal.topLight;
      }
      // stem scar: dark 2x2 centre (where the stem box meets the fruit)
      if (x >= 7 && x <= 8 && y >= 7 && y <= 8) c = pal.stemDark;
      px(16 + x, y, c);
    }
  }

  // ---- leaf tile (32,0)-(47,15): LOBED cucurbit leaf, transparent bg ----
  // Blocky three-lobe silhouette: the half-width table pinches in twice
  // (rows 6 and 9) to notch the sides between the lobes, like a pumpkin
  // leaf. Midrib + sparse diagonal veins on the upper half.
  const LEAF_HW = [0, 2, 4, 5, 6, 6, 4, 6, 6, 4, 6, 5, 3, 2, 1, 0];
  for (let y = 1; y <= 14; y++) {
    const hw = LEAF_HW[y];
    for (let x = 8 - hw; x <= 7 + hw; x++) {
      let c = LEAF.base;
      if (y === 1 || y === 14 || x === 8 - hw || x === 7 + hw) c = LEAF.dark;
      else if (x === 8 && y <= 12) c = LEAF.light; // midrib
      else if (y >= 3 && y <= 8 && (x + y) % 4 === 0) c = LEAF.light; // veins
      else if (fruitFleck(x, y) > 0.87) c = LEAF.light;
      px(32 + x, y, c);
    }
  }
  // stem nub where the leaf joins the runner
  px(32 + 7, 15, LEAF.dark);
  px(32 + 8, 15, LEAF.dark);

  // ---- stem tile (48,0)-(63,15): solid vine/stem with pixel variation ---
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const f = fruitFleck(x, Math.floor(y / 2));
      let c = pal.stem;
      if (f > 0.88) c = kind === 'pumpkin' ? PUMPKIN.stemDark : MELON.stemDark;
      else if (f < 0.1) c = LEAF.light; // mossy highlight
      px(48 + x, y, c);
    }
  }

  // ---- flower tile (0,16)-(15,31): blocky yellow cucurbit bloom ---------
  for (let y = 2; y <= 9; y++) {
    for (let x = 4; x <= 11; x++) {
      const dx = x - 7.5;
      const dy = y - 5.5;
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      const man = Math.abs(dx) + Math.abs(dy);
      if (m > 3.5 || (m > 2.5 && man > 5.5)) continue; // cut-corner blocky disc
      let c = FLOWER.petal;
      if (m > 2.5) c = FLOWER.petalEdge; // rim
      else if (dx < 0 && dy < 0) c = FLOWER.petalLight; // lit upper-left
      px(x, 16 + y, c);
    }
  }
  // orange nectar centre, 2x2
  px(7, 16 + 5, FLOWER.centre);
  px(8, 16 + 5, FLOWER.centre);
  px(7, 16 + 6, FLOWER.centre);
  px(8, 16 + 6, FLOWER.centre);
  // short green stem under the bloom + two leaflet pixels
  for (let y = 10; y <= 15; y++) {
    px(7, 16 + y, LEAF.dark);
    px(8, 16 + y, LEAF.dark);
  }
  px(6, 16 + 13, LEAF.base);
  px(9, 16 + 12, LEAF.base);

  // ---- curl tile (16,16)-(31,31): curled tendril, transparent bg --------
  // A vine tip that rises, arcs over and spirals back on itself.
  const CURL: Array<[number, number]> = [
    [7, 15], [7, 14], [7, 13], [7, 12], [7, 11], [7, 10], [7, 9],
    [8, 8], [9, 7], [10, 7], [11, 7], [12, 8], [12, 9], [12, 10], [12, 11],
    [11, 12], [10, 12], [10, 11], [10, 10], [11, 10],
  ];
  CURL.forEach(([cx, cy], i) => {
    px(16 + cx, 16 + cy, i % 3 === 1 ? LEAF.dark : LEAF.base);
  });
  px(16 + 11, 16 + 10, LEAF.light); // spiral tip highlight

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; // crisp pixel-art, Minecraft style
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;

  const uv: FruitAtlas = {
    side: tileUV(0, 0),
    top: tileUV(16, 0),
    leaf: tileUV(32, 0),
    stem: tileUV(48, 0),
    flower: tileUV(0, 16),
    curl: tileUV(16, 16),
  };
  return { texture: tex, uv };
}

/** Remap a BoxGeometry's UVs: ±x/±z faces -> side tile, +y -> top tile,
 *  -y -> side art (barely seen). Box face order: +x, -x, +y, -y, +z, -z
 *  (4 verts each). */
function mapBoxUVs(geo: THREE.BufferGeometry, uv: FruitAtlas): void {
  const a = geo.getAttribute('uv') as THREE.BufferAttribute;
  const regions: FruitTile[] = [
    uv.side, uv.side, // +x, -x
    uv.top, uv.side, // +y, -y
    uv.side, uv.side, // +z, -z
  ];
  for (let v = 0; v < 24; v++) {
    const [u0, v0, u1, v1] = regions[Math.floor(v / 4)];
    a.setXY(v, u0 + a.getX(v) * (u1 - u0), v0 + a.getY(v) * (v1 - v0));
  }
  a.needsUpdate = true;
}

/** Map every UV of a geometry into one atlas region. */
function mapAllUVs(geo: THREE.BufferGeometry, r: FruitTile): void {
  const a = geo.getAttribute('uv') as THREE.BufferAttribute;
  const [u0, v0, u1, v1] = r;
  for (let v = 0; v < a.count; v++) {
    a.setXY(v, u0 + a.getX(v) * (u1 - u0), v0 + a.getY(v) * (v1 - v0));
  }
  a.needsUpdate = true;
}

// ---- vine branch layout ----------------------------------------------------

type Vec3 = [number, number, number];

/** Cubic bezier — one smooth S-curve from the stem tip to the soil. */
function bezier3(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
  ];
}

/**
 * One straight branch segment between two points: a thin box aimed
 * along the run (yaw from xz, pitch about its local x so the branch
 * arcs over the fruit's shoulder instead of stepping down in flats).
 */
function vineSegment(a: Vec3, b: Vec3, block: number, tile: FruitTile): THREE.BufferGeometry {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const flat = Math.hypot(dx, dz);
  const g = new THREE.BoxGeometry(block * 0.05, block * 0.045, Math.hypot(flat, dy) + block * 0.04);
  mapAllUVs(g, tile);
  g.rotateX(Math.atan2(-dy, flat)); // pitch first (local space)...
  g.rotateY(Math.atan2(dx, dz)); // ...then aim along the run
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}

/**
 * A big lobed leaf rising off the branch: quad lying back by `tilt`
 * (0 = flat on the ground), tip fanned `yaw` around the vine, lower
 * edge lifted just clear of the terrain.
 */
function vineLeaf(
  size: number,
  tilt: number,
  yaw: number,
  at: Vec3,
  block: number,
  tile: FruitTile
): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(size, size);
  mapAllUVs(g, tile);
  g.rotateX(-Math.PI / 2 + tilt); // lie back, tip raised by `tilt`
  g.rotateY(yaw);
  g.translate(at[0], at[1] + Math.sin(tilt) * size * 0.5 + block * 0.015, at[2]);
  return g;
}

/** Two crossed vertical quads (vanilla plant-sprite style) for the
 *  flower / tendril art, centred at (x, y, z). */
function spriteCross(
  w: number,
  h: number,
  tile: FruitTile,
  x: number,
  y: number,
  z: number
): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const a = new THREE.PlaneGeometry(w, h);
  mapAllUVs(a, tile);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  a.translate(x, y, z);
  b.translate(x, y, z);
  return [a, b];
}

interface VineLayout {
  /** × block — the stem TIP (sprouts exactly where the stem box ends). */
  p0: Vec3;
  /** × block — pulls the branch out over the fruit's shoulder. */
  c1: Vec3;
  /** × block — steers the descent down to the soil. */
  c2: Vec3;
  /** × block — tip on/below the ground (buried into the terrain). */
  p3: Vec3;
  /** Leaf stops along the branch: bezier t, tilt, fan (yaw offset from
   *  the branch heading), size (× block). */
  leaves: { t: number; tilt: number; fan: number; size: number }[];
  /** bezier t for the yellow bloom. */
  flowerT: number;
  /** Root nubs: offsets (× block) from the tip where little root
   *  spikes dive into the terrain. */
  roots: [number, number][];
}

const PUMPKIN_VINE: VineLayout = {
  // fruit top 0.8 + stem 0.2 → the stem tip sits at y 0.99
  p0: [0.05, 0.99, -0.04],
  c1: [0.42, 1.0, 0.26], // over the shoulder (fruit top 0.8, half-width 0.475)
  c2: [0.95, 0.25, 0.72],
  p3: [1.52, -0.05, 1.12], // tip buried into the soil
  leaves: [
    { t: 0.5, tilt: 0.6, fan: 1.05, size: 0.74 },
    { t: 0.7, tilt: 0.42, fan: -1.2, size: 0.8 },
    { t: 0.88, tilt: 0.16, fan: 0.1, size: 0.7 },
  ],
  flowerT: 0.93,
  roots: [
    [0.1, 0.06],
    [-0.04, 0.12],
  ],
};

const MELON_VINE: VineLayout = {
  // fruit top 0.7 + stem 0.2 → the stem tip sits at y 0.89
  p0: [0.05, 0.89, -0.04],
  c1: [-0.42, 0.94, -0.26], // over the shoulder (fruit top 0.7)
  c2: [-0.95, 0.25, -0.72],
  p3: [-1.52, -0.05, -1.12],
  leaves: [
    { t: 0.5, tilt: 0.58, fan: -1.1, size: 0.72 },
    { t: 0.7, tilt: 0.4, fan: 1.25, size: 0.78 },
    { t: 0.88, tilt: 0.14, fan: -0.15, size: 0.68 },
  ],
  flowerT: 0.93,
  roots: [
    [-0.1, -0.06],
    [0.04, -0.12],
  ],
};

/**
 * Everything one fruit KIND needs to render + interact: the painted
 * atlas, shared materials, the static body geometry (fruit + stem, fed
 * to the grass-field factory), and the interactive branch (merged
 * static geometry for far rendering + a deformable clone whose every
 * vertex carries its bezier attach-t, plus the contact-sampling curve).
 */
export interface FruitContext {
  kind: 'pumpkin' | 'melon';
  block: number;
  material: THREE.MeshLambertMaterial;
  depth: THREE.MeshDepthMaterial;
  bodyGeo: THREE.BufferGeometry;
  branchGeo: THREE.BufferGeometry; // static merged branch
  branchDynamicGeo: THREE.BufferGeometry; // clone with aT attribute
  branchBase: Float32Array; // dynamic base positions
  /** Vertex ranges per branch part: {start, count, t} in the dynamic
   *  geometry's vertex order — bend weight = t^1.6, computed once. */
  ranges: { start: number; count: number; shape: number }[];
  /** Local-space contact samples along the branch curve. */
  sampleP: Vec3[];
}

/**
 * The static fruit BODY: the sharp voxel fruit box + the stem box on
 * top (its tip is where the interactive branch sprouts). Authored in
 * world units around the origin, base at y=0.
 */
function buildFruitBodyGeometry(
  block: number,
  kind: 'pumpkin' | 'melon',
  uv: FruitAtlas
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // ---- the fruit: a SHARP vanilla voxel box -----------------------------
  const fw = block * 0.95; // footprint (vanilla block, hair narrower)
  const fh = block * (kind === 'pumpkin' ? PUMPKIN_FRUIT_H : MELON_FRUIT_H);
  const fruit = new THREE.BoxGeometry(fw, fh, fw);
  mapBoxUVs(fruit, uv);
  fruit.translate(0, fh / 2, 0); // sit on the ground
  parts.push(fruit);

  // ---- the stem: a small box on top, slightly off-centre ----------------
  const sw = block * 0.13;
  const sh = block * 0.2;
  const stem = new THREE.BoxGeometry(sw, sh, sw);
  mapAllUVs(stem, uv.stem);
  stem.translate(block * 0.05, fh + sh / 2 - block * 0.01, -block * 0.04);
  parts.push(stem);

  return mergeGeometries(parts, false) ?? fruit;
}

/**
 * The interactive branch: curved runner + root nubs + lobed leaves +
 * yellow bloom + curled tendril. Returns the merged geometry plus each
 * part's vertex range and bezier attach-t (0 = pinned at the stem, 1 =
 * free tip — the bend weight is t^1.6), and the local contact samples.
 */
function buildBranchParts(
  block: number,
  kind: 'pumpkin' | 'melon',
  uv: FruitAtlas
): {
  geo: THREE.BufferGeometry;
  ranges: { start: number; count: number; shape: number }[];
  sampleP: Vec3[];
} {
  const L = kind === 'pumpkin' ? PUMPKIN_VINE : MELON_VINE;
  const P = (v: Vec3): Vec3 => [v[0] * block, v[1] * block, v[2] * block];
  const p0 = P(L.p0);
  const c1 = P(L.c1);
  const c2 = P(L.c2);
  const p3 = P(L.p3);
  const parts: { geo: THREE.BufferGeometry; t: number }[] = [];

  // ---- the main branch: one smooth curve, stem tip -> terrain -----------
  const STEPS = 14; // smooth read: short overlapping boxes hug the curve
  let prev = bezier3(p0, c1, c2, p3, 0);
  for (let i = 1; i <= STEPS; i++) {
    const pt = bezier3(p0, c1, c2, p3, i / STEPS);
    parts.push({ geo: vineSegment(prev, pt, block, uv.stem), t: (i - 0.5) / STEPS });
    prev = pt;
  }
  // root nubs at the far end — the branch visibly grips the terrain
  // (pinned: t = 0 — roots stay glued while the tip swings)
  for (const [rx, rz] of L.roots) {
    const tip = bezier3(p0, c1, c2, p3, 0.96);
    parts.push({
      geo: vineSegment(
        tip,
        [tip[0] + rx * block, -block * 0.09, tip[2] + rz * block],
        block,
        uv.stem
      ),
      t: 0,
    });
  }
  // leaves fanned around the branch's heading (tipYaw = heading + fan + π,
  // because the leaf sprite points along local -z after lying back)
  const head = Math.atan2(p3[0] - p0[0], p3[2] - p0[2]);
  for (const lf of L.leaves) {
    const at = bezier3(p0, c1, c2, p3, lf.t);
    parts.push({
      geo: vineLeaf(lf.size * block, lf.tilt, head + lf.fan + Math.PI, at, block, uv.leaf),
      t: lf.t,
    });
  }
  // yellow cucurbit bloom on a tiny stalk rising off the branch
  const fp = bezier3(p0, c1, c2, p3, L.flowerT);
  const fs = block * 0.24;
  const stalk = new THREE.BoxGeometry(block * 0.03, block * 0.1, block * 0.03);
  mapAllUVs(stalk, uv.stem);
  stalk.translate(fp[0], fp[1] + block * 0.05, fp[2]);
  parts.push({ geo: stalk, t: L.flowerT });
  const [flowerA, flowerB] = spriteCross(fs, fs, uv.flower, fp[0], fp[1] + block * 0.1 + fs / 2, fp[2]);
  parts.push({ geo: flowerA, t: L.flowerT });
  parts.push({ geo: flowerB, t: L.flowerT });
  // curled tendril at the branch tip (fully free — t = 1)
  const cw = block * 0.2;
  const ch = block * 0.3;
  const [curlA, curlB] = spriteCross(cw, ch, uv.curl, p3[0], p3[1] + ch / 2 + block * 0.02, p3[2]);
  parts.push({ geo: curlA, t: 1 });
  parts.push({ geo: curlB, t: 1 });

  const merged =
    mergeGeometries(
      parts.map((p) => (p.geo.index ? p.geo : p.geo.toNonIndexed())),
      false
    ) ?? parts[0].geo;
  const ranges: { start: number; count: number; shape: number }[] = [];
  let start = 0;
  for (const p of parts) {
    const n = (p.geo.index ? p.geo : p.geo.toNonIndexed()).getAttribute('position')
      .count;
    ranges.push({ start, count: n, shape: Math.pow(p.t, 1.6) });
    start += n;
  }
  const sampleP: Vec3[] = [];
  for (let i = 0; i <= STEPS; i++) sampleP.push(bezier3(p0, c1, c2, p3, i / STEPS));
  return { geo: merged, ranges, sampleP };
}

/**
 * Paint the atlas once, build both geometries + shared materials for
 * one fruit kind. The page hands the SAME context to the plant layer
 * (body) and the branch system so everything shares one texture.
 */
export function createFruitContext(
  kind: 'pumpkin' | 'melon',
  block: number
): FruitContext {
  const { texture, uv } = paintFruitAtlas(kind);
  const material = new THREE.MeshLambertMaterial({
    map: texture,
    alphaTest: 0.5, // cutout leaf/flower/tendril sprites
    side: THREE.DoubleSide, // leaves + cross sprites visible from behind
  });
  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: texture,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  const bodyGeo = buildFruitBodyGeometry(block, kind, uv);
  const branch = buildBranchParts(block, kind, uv);
  // the deformable clone: merge part clones (order preserved) and keep
  // the base positions for the CPU bend reset
  const branchDynamicGeo = branch.geo.clone();
  return {
    kind,
    block,
    material,
    depth,
    bodyGeo,
    branchGeo: branch.geo,
    branchDynamicGeo,
    branchBase: (branchDynamicGeo.getAttribute('position').array as Float32Array).slice(),
    ranges: branch.ranges,
    sampleP: branch.sampleP,
  };
}

/** Shared style factory: static, rare, custom-geometry fruit layer. */
function fruitStyle(kind: 'pumpkin' | 'melon'): GrassStyle {
  return {
    tuftHeight: kind === 'pumpkin' ? 1.0 : 0.9, // fruit + stem, blocks
    tuftWidth: 0.95,
    gridStepBlocks: 20, // rare finds — ~88 plants across the field
    sway: 0, // fruit does not sway
    static: true, // no wind shader at all (like the sugar cane)
    custom: undefined, // assigned below (needs the block size)
  };
}

export type PumpkinPlantHandle = GrassTuftsHandle;
export type MelonPlantHandle = GrassTuftsHandle;

/** Build the pumpkin BODY layer — pass the shared context from
 *  createFruitContext('pumpkin', block) so the branch system can
 *  reuse the same atlas + materials. */
export function createPumpkinPlant(
  scene: THREE.Scene,
  options: GrassTuftsOptions & { context?: FruitContext }
): GrassTuftsHandle {
  const ctx = options.context ?? createFruitContext('pumpkin', options.block);
  const style = fruitStyle('pumpkin');
  style.custom = () => ({ geometry: ctx.bodyGeo, material: ctx.material });
  return createGrassField(scene, options, style);
}

/** Build the melon BODY layer — same shared-context option. */
export function createMelonPlant(
  scene: THREE.Scene,
  options: GrassTuftsOptions & { context?: FruitContext }
): GrassTuftsHandle {
  const ctx = options.context ?? createFruitContext('melon', options.block);
  const style = fruitStyle('melon');
  style.custom = () => ({ geometry: ctx.bodyGeo, material: ctx.material });
  return createGrassField(scene, options, style);
}

// ---- fruit collision (solid blocks you can jump onto and stand on) -------

export interface FruitSolidHandle {
  /** Capsule push-out against every fruit box (like palms.collide).
   *  `y` optional — a fruit GHOSTS once the caller's feet rise above
   *  its top face, so a jump carries the body over and onto it. */
  collide(
    x: number,
    z: number,
    radius: number,
    y?: number
  ): { x: number; z: number } | null;
  /** Highest fruit top acting as FLOOR under (x, z): among the fruits
   *  whose footprint covers the point (plus a small stand margin), the
   *  tallest top no higher than `maxY` — null over bare ground. The
   *  page max()es this with the terrain height so a jump lands ON the
   *  fruit and the player stands on it like on any block. */
  supportAt(x: number, z: number, maxY: number): number | null;
  /** Debug: how many fruit solids are registered. */
  stats(): { fruits: number };
}

/** Square push-out for one axis-aligned box footprint (same resolve the
 *  palm base blocks use): pushes the circle out along the nearest face
 *  normal; centres inside the box exit along the shallowest face. */
function pushOutBox(
  px: number,
  pz: number,
  radius: number,
  cx: number,
  cz: number,
  half: number
): { x: number; z: number } | null {
  const nx = Math.max(cx - half, Math.min(px, cx + half));
  const nz = Math.max(cz - half, Math.min(pz, cz + half));
  const dx = px - nx;
  const dz = pz - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 > radius * radius) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    return { x: nx + (dx / d) * radius, z: nz + (dz / d) * radius };
  }
  const exits = [
    { d: px - (cx - half) + radius, x: cx - half - radius, z: pz },
    { d: cx + half - px + radius, x: cx + half + radius, z: pz },
    { d: pz - (cz - half) + radius, x: px, z: cz - half - radius },
    { d: cz + half - pz + radius, x: px, z: cz + half + radius },
  ];
  exits.sort((a, b) => a.d - b.d);
  return { x: exits[0].x, z: exits[0].z };
}

/**
 * Build the solid-fruit collision layer from the pumpkin + melon plant
 * layers' authored seeds. Each fruit becomes one axis-aligned box:
 * footprint 0.95 blocks square (exactly the rendered body), top at the
 * column's terrain height + the fruit's height. Ghost-above-top keeps
 * jumping bodies free; supportAt turns the top face into floor.
 */
export function createFruitCollisions(
  entries: Array<{ layer: GrassTuftsHandle; heightBlocks: number }>,
  opts: { block: number; heightAt: (x: number, z: number) => number }
): FruitSolidHandle {
  const { block, heightAt } = opts;
  const half = block * 0.475; // 0.95-block footprint, matches the render
  const stand = block * 0.1; // stand margin — matches the visible top

  const fruits: { x: number; z: number; top: number }[] = [];
  for (const { layer, heightBlocks } of entries) {
    for (const s of layer.seeds()) {
      fruits.push({ x: s.x, z: s.z, top: heightAt(s.x, s.z) + heightBlocks * block });
    }
  }

  function collide(
    x: number,
    z: number,
    radius: number,
    y?: number
  ): { x: number; z: number } | null {
    let px = x;
    let pz = z;
    let hit = false;
    for (const f of fruits) {
      const bx = px - f.x;
      const bz = pz - f.z;
      const broad = half + radius + block;
      if (bx * bx + bz * bz > broad * broad) continue;
      if (y !== undefined && y >= f.top) continue; // feet above it — hop on
      const pushed = pushOutBox(px, pz, radius, f.x, f.z, half);
      if (pushed) {
        px = pushed.x;
        pz = pushed.z;
        hit = true;
      }
    }
    return hit ? { x: px, z: pz } : null;
  }

  function supportAt(x: number, z: number, maxY: number): number | null {
    let best: number | null = null;
    for (const f of fruits) {
      if (f.top > maxY) continue; // above the ceiling — not floor yet
      const dx = Math.abs(x - f.x);
      const dz = Math.abs(z - f.z);
      if (
        dx <= half + stand &&
        dz <= half + stand &&
        (best === null || f.top > best)
      ) {
        best = f.top;
      }
    }
    return best;
  }

  return { collide, supportAt, stats: () => ({ fruits: fruits.length }) };
}

// ---- the interactive branch system ----------------------------------------
//
//  Far branches render as plain static instances (one matrix per live
//  fruit, copied straight from the body layer's instance matrices so
//  branch and fruit stay perfectly in lockstep). The ONE branch nearest
//  the player swaps to a CPU-deformable mesh: walking or running
//  against it drags it along (stem pinned, tip swinging most), it
//  springs back when released, and forcing it past maximum stretch
//  while touching SNAPS it (puff + gone; regrows after a while).

export interface FruitBranchHandle {
  /** Per-frame tick: live-matrix sync, static buffer rebuild,
   *  player-interaction spring and the CPU bend. Pass dt. */
  update(dt: number): void;
  /** Debug: branch counts + interaction state. `nearDist` is the live
   *  closest branch-sample distance to the player body (-1 = none in
   *  range) — verification rigs read it to confirm contact. */
  stats(): {
    branches: number;
    broken: number;
    active: number;
    stretch: number;
    nearDist: number;
  };
  /** Debug: the fruit nearest (x, z) within 400u — its kind, world
  *  stem position, branch tip position and stem-to-tip walk bearing
  *  (verification rigs plan graze paths from this). */
  probe(
    x: number,
    z: number
  ): {
    kind: string;
    sx: number;
    sz: number;
    sy: number;
    tipX: number;
    tipY: number;
    tipZ: number;
    broken: boolean;
  } | null;
}

/** Interaction tuning (world units / seconds). */
const GRAZE = 48; // capsule+vine contact distance
const LEAN_DIST = 96; // light anticipatory lean inside this ring
const COUPLE = 0.16; // player velocity -> pull demand
const LEAN_COUPLE = 0.05; // velocity -> lean demand (not touching)
const ASIDE = 1.1; // overlap depth -> push-aside demand
const MAX_PULL = 72; // maximum tip displacement (the max stretch)
/** Break force: only the player's SPEED counts (the aside push just
 *  displaces). WALK 360*0.16 = 58 stretches; RUN 620*0.16 = 99 snaps. */
const BREAK_DEMAND = 80;
const BREAK_TIME = 0.18; // seconds of sustained over-force to snap
const REGROW = 40; // seconds before a snapped branch regrows
const TELEPORT_JUMP = 60; // per-frame player jump that reads as a teleport

interface BranchFruit {
  ctx: FruitContext;
  x: number;
  z: number;
  y: number;
  live: boolean;
  matrix: Float32Array | null; // cached body instance matrix (has the rot)
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  broken: boolean;
  brokenAt: number;
}

interface BranchEntry {
  layer: GrassTuftsHandle;
  ctx: FruitContext;
  fruits: BranchFruit[];
  byKey: Map<string, BranchFruit>;
  staticMesh: THREE.InstancedMesh;
  dynamicMesh: THREE.Mesh;
}

export function createFruitBranches(
  scene: THREE.Scene,
  entries: Array<{ layer: GrassTuftsHandle; ctx: FruitContext }>,
  opts: {
    heightAt: (x: number, z: number) => number;
    getPlayer: () => { x: number; y: number; z: number };
    onBreak?: (x: number, y: number, z: number) => void;
  }
): FruitBranchHandle {
  const m4 = new THREE.Matrix4();
  const scaleV = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const invQ = new THREE.Quaternion();
  const pull = new THREE.Vector3(); // current tip displacement (world)
  const pullTarget = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const lastPlayer = new THREE.Vector3();
  let haveLastPlayer = false;
  let now = 0;
  let overload = 0;
  let active: BranchFruit | null = null;
  let lastNearDist = -1; // debug view of the live contact distance

  const built: BranchEntry[] = entries.map(({ layer, ctx }) => {
    const fruits: BranchFruit[] = layer.seeds().map((s) => ({
      ctx,
      x: s.x,
      z: s.z,
      y: opts.heightAt(s.x, s.z),
      live: false,
      matrix: null,
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      broken: false,
      brokenAt: 0,
    }));
    // keys are ROUNDED coords: the body layer's instance matrices carry
    // float32 values while the seeds are float64 — exact string keys can
    // miss; 1-unit resolution can never collide (spacing is 2000)
    const byKey = new Map<string, BranchFruit>();
    for (const f of fruits)
      byKey.set(`${Math.round(f.x)}|${Math.round(f.z)}`, f);
    // static branch instances — one per fruit, matrices copied from the
    // body layer so fruit + branch never drift apart
    const staticMesh = new THREE.InstancedMesh(ctx.branchGeo, ctx.material, Math.max(1, fruits.length));
    staticMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    staticMesh.frustumCulled = false; // instances span the whole field
    staticMesh.castShadow = true;
    staticMesh.receiveShadow = true;
    staticMesh.customDepthMaterial = ctx.depth;
    staticMesh.visible = false;
    staticMesh.count = 0;
    scene.add(staticMesh);
    // the ONE deformable branch this entry can show near the player
    const dynamicMesh = new THREE.Mesh(ctx.branchDynamicGeo, ctx.material);
    dynamicMesh.frustumCulled = false; // vertices move under the bend
    dynamicMesh.castShadow = true;
    dynamicMesh.customDepthMaterial = ctx.depth;
    dynamicMesh.visible = false;
    scene.add(dynamicMesh);
    return { layer, ctx, fruits, byKey, staticMesh, dynamicMesh };
  });

  /** Copy every live body instance matrix into its fruit record. */
  function syncLive(): void {
    for (const e of built) {
      for (const f of e.fruits) f.live = false;
      const meshes = e.layer.meshes();
      for (const mesh of meshes) {
        if (!mesh || !mesh.visible || mesh.count === 0) continue;
        const a = mesh.instanceMatrix.array as Float32Array;
        for (let i = 0; i < mesh.count; i++) {
          const f = e.byKey.get(
            `${Math.round(a[i * 16 + 12])}|${Math.round(a[i * 16 + 14])}`
          );
          if (!f) continue;
          f.live = true;
          if (!f.matrix) f.matrix = new Float32Array(16);
          f.matrix.set(a.subarray(i * 16, i * 16 + 16));
          m4.fromArray(f.matrix).decompose(f.pos, f.quat, scaleV);
        }
      }
    }
  }

  /** Rebuild one entry's static instance buffer from its live records. */
  function rebuildStatic(e: BranchEntry): void {
    const buf = e.staticMesh.instanceMatrix.array as Float32Array;
    let slot = 0;
    for (const f of e.fruits) {
      if (!f.live || f.broken || f === active) continue;
      if (!f.matrix) continue;
      buf.set(f.matrix, slot * 16);
      slot++;
    }
    e.staticMesh.count = slot;
    e.staticMesh.instanceMatrix.needsUpdate = true;
    e.staticMesh.visible = slot > 0;
  }

  /** Reset the deformable geometry to its authored rest shape. */
  function resetDynamic(e: BranchEntry): void {
    const pos = e.dynamicMesh.geometry.getAttribute('position')
      .array as Float32Array;
    pos.set(e.ctx.branchBase);
    pos.needsUpdate = true;
  }

  /** Bend the deformable geometry by world-space pull `p` at fruit `f`. */
  function deform(e: BranchEntry, f: BranchFruit, p: THREE.Vector3): void {
    invQ.copy(f.quat).invert();
    const local = tmpV.copy(p).applyQuaternion(invQ);
    const pos = e.dynamicMesh.geometry.getAttribute('position')
      .array as Float32Array;
    const sag = p.length() * 0.25;
    for (const r of e.ctx.ranges) {
      const s = r.shape;
      const ox = local.x * s;
      const oy = -sag * s;
      const oz = local.z * s;
      for (let v = r.start; v < r.start + r.count; v++) {
        const i = v * 3;
        pos[i] = e.ctx.branchBase[i] + ox;
        pos[i + 1] = e.ctx.branchBase[i + 1] + oy;
        pos[i + 2] = e.ctx.branchBase[i + 2] + oz;
      }
    }
    pos.needsUpdate = true;
  }

  function snap(f: BranchFruit, at: THREE.Vector3): void {
    f.broken = true;
    f.brokenAt = now;
    opts.onBreak?.(at.x, at.y, at.z);
    if (active === f) {
      const e = built.find((en) => en.ctx === f.ctx)!;
      resetDynamic(e);
      e.dynamicMesh.visible = false;
      active = null;
      pull.set(0, 0, 0);
      overload = 0;
    }
  }

  function update(dt: number): void {
    now += dt;
    syncLive();

    // -- player motion (velocity from consecutive reads, teleport-safe) --
    const p = opts.getPlayer();
    if (!haveLastPlayer) {
      lastPlayer.set(p.x, p.y, p.z);
      haveLastPlayer = true;
    }
    tmpV.set(p.x - lastPlayer.x, p.y - lastPlayer.y, p.z - lastPlayer.z);
    lastPlayer.set(p.x, p.y, p.z);
    if (tmpV.length() > TELEPORT_JUMP) {
      vel.set(0, 0, 0); // teleport: no phantom force
    } else if (dt > 1e-4) {
      vel.copy(tmpV).divideScalar(dt);
    }

    // -- nearest live, unbroken branch around the player ------------------
    let near: BranchFruit | null = null;
    let nearDist = Infinity;
    const nearestWorld = new THREE.Vector3();
    for (const e of built) {
      for (const f of e.fruits) {
        if (!f.live || f.broken || !f.matrix) continue;
        const dx = f.pos.x - p.x;
        const dz = f.pos.z - p.z;
        if (dx * dx + dz * dz > 340 * 340) continue;
        // contact: closest point of this branch's curve to the body
        for (const s of e.ctx.sampleP) {
          tmpV.set(s[0], s[1], s[2]).applyQuaternion(f.quat).add(f.pos);
          const d = Math.hypot(
            tmpV.x - p.x,
            tmpV.y - (p.y + 40),
            tmpV.z - p.z
          );
          if (d < nearDist) {
            nearDist = d;
            near = f;
            nearestWorld.copy(tmpV);
          }
        }
      }
    }
    lastNearDist = nearDist;

    // -- demand: velocity drag + push-aside while grazing -----------------
    const flatVel = Math.hypot(vel.x, vel.z);
    if (near && nearDist < GRAZE) {
      // dragged along with the player's run + shoved aside by the body
      const ox = p.x - nearestWorld.x;
      const oz = p.z - nearestWorld.z;
      const ol = Math.hypot(ox, oz) || 1;
      const depth = GRAZE - nearDist;
      pullTarget.set(
        vel.x * COUPLE + (ox / ol) * depth * ASIDE,
        0,
        vel.z * COUPLE + (oz / ol) * depth * ASIDE
      );
      // BREAK force reads only the player's speed: a walk drags, a run
      // sustained against the branch snaps it
      if (flatVel * COUPLE > BREAK_DEMAND) {
        overload += dt;
        if (overload >= BREAK_TIME) {
          snap(near, nearestWorld);
          near = null;
          nearDist = Infinity;
        }
      } else {
        overload = Math.max(0, overload - dt * 2);
      }
    } else if (near && nearDist < LEAN_DIST) {
      // light anticipatory lean — the branch feels the player coming
      pullTarget.set(vel.x * LEAN_COUPLE, 0, vel.z * LEAN_COUPLE);
      overload = Math.max(0, overload - dt * 2);
    } else {
      pullTarget.set(0, 0, 0);
      overload = Math.max(0, overload - dt * 2);
    }
    if (pullTarget.length() > MAX_PULL) pullTarget.setLength(MAX_PULL);

    // -- spring the pull toward its target (smooth light movement) -------
    const stiff = pullTarget.lengthSq() > 1 ? 9 : 6.5; // snap back softer
    pull.x += (pullTarget.x - pull.x) * Math.min(1, stiff * dt);
    pull.y += (pullTarget.y - pull.y) * Math.min(1, stiff * dt);
    pull.z += (pullTarget.z - pull.z) * Math.min(1, stiff * dt);

    // -- activate / release the deformable mesh ---------------------------
    if (active && (active.broken || !active.live)) {
      const e = built.find((en) => en.ctx === active!.ctx)!;
      resetDynamic(e);
      e.dynamicMesh.visible = false;
      active = null;
    }
    if (!active && near && (nearDist < GRAZE || pull.length() > 0.5)) {
      active = near;
    }
    if (active && !near && pull.length() < 0.5) {
      const e = built.find((en) => en.ctx === active!.ctx)!;
      resetDynamic(e);
      e.dynamicMesh.visible = false;
      active = null;
    }

    // -- render + bend the active branch ----------------------------------
    for (const e of built) {
      if (active && active.ctx === e.ctx) {
        e.dynamicMesh.visible = true;
        e.dynamicMesh.position.copy(active.pos);
        e.dynamicMesh.quaternion.copy(active.quat);
        deform(e, active, pull);
      }
      rebuildStatic(e);
    }

    // -- regrow snapped branches ------------------------------------------
    for (const e of built) {
      for (const f of e.fruits) {
        if (f.broken && now - f.brokenAt > REGROW) f.broken = false;
      }
    }
  }

  return {
    update,
    stats: () => ({
      branches: built.reduce((s, e) => s + e.fruits.length, 0),
      broken: built.reduce(
        (s, e) => s + e.fruits.filter((f) => f.broken).length,
        0
      ),
      active: active ? 1 : 0,
      stretch: Math.round(pull.length()),
      nearDist: Number.isFinite(lastNearDist) ? Math.round(lastNearDist) : -1,
    }),
    probe: (x: number, z: number) => {
      let best: BranchFruit | null = null;
      let bestD = Infinity;
      for (const e of built) {
        for (const f of e.fruits) {
          if (!f.live || !f.matrix) continue;
          const d = Math.hypot(f.pos.x - x, f.pos.z - z);
          if (d < bestD) {
            bestD = d;
            best = f;
          }
        }
      }
      if (!best || bestD > 400) return null;
      const e = built.find((en) => en.ctx === best!.ctx)!;
      const tip = e.ctx.sampleP[e.ctx.sampleP.length - 1];
      tmpV.set(tip[0], tip[1], tip[2]).applyQuaternion(best.quat).add(best.pos);
      return {
        kind: best.ctx.kind,
        sx: Math.round(best.pos.x),
        sz: Math.round(best.pos.z),
        sy: Math.round(best.pos.y),
        tipX: Math.round(tmpV.x),
        tipY: Math.round(tmpV.y),
        tipZ: Math.round(tmpV.z),
        broken: best.broken,
      };
    },
  };
}
