import * as THREE from 'three';
import {
  createGrassField,
  type GrassStyle,
  type GrassTuftsHandle,
  type GrassTuftsOptions,
} from './grassTufts';

/**
 *  MINECRAFT-STYLE SUGAR CANE (vanilla crossed-sprite look, STATIC)
 *  -------------------------------------------------------------
 *  Hand-painted the way Minecraft does it (no downloaded assets —
 *  Mojang textures are copyrighted, so the cane is drawn as pixel
 *  art at runtime):
 *    - CLASSIC CROSS SPRITE: two crossed quads, exactly like vanilla's
 *      sugar cane / plant sprites.
 *    - The art is a 16x48 canvas (three block-segments tall ≈ mature
 *      cane) with FOUR DEAD-STRAIGHT vertical stalks — every column
 *      plumb from root to tip, no lean anywhere: light left edge,
 *      shaded right edge, pale joint collars at each segment's
 *      midline (rows 8/24/40, like three stacked vanilla tiles) with
 *      tiny leaf-sheath nubs, dark seam rings where the segments
 *      meet, tapered single-pixel bright tips — the vanilla
 *      sugar_cane silhouette, enhanced and PERFECTLY UPRIGHT.
 *    - LIGHT DETAIL PASS: stalks shade as 3-tone cylinders (light
 *      edge / lit body / dark edge), short vertical fiber flecks run
 *      down the body (deterministic 3px striations, a few sun-kissed
 *      gleams), each sheath nub grows a 1px angled tip and the roots
 *      flare into tiny spikes — richer texture, same silhouette.
 *    - ~3 BLOCKS TALL (a mature full-grown cane), near full-block width.
 *    - NO WIND AT ALL: style.static = true — this layer never gets
 *      the wind vertex shader, so the cane cannot move a vertex while
 *      the grass around it sways. Sugar cane is stiff and upright.
 *    - Streams, pools, casts blade-shaped shadows and tints per
 *      instance through the shared createGrassField() factory
 *      (custom path). Purely decorative: no collision, no support.
 */

// ---- vanilla-style palette (sugar-cane greens) ---------------------------
// Pre-darkened ~12% vs raw vanilla hues: the scene sun is VERY intense
// (intensity 12) and the up-normal plant lighting hits the cross quads
// at full ground brightness, so uncorrected colours wash out pale —
// same correction the shared grass ramp applies.
const CANE_HIGHLIGHT = '#93c153'; // left edge of each stalk
const CANE_BASE = '#6ba83c'; // body column of 3-wide stalks
const CANE_SHADE = '#4f8a2c'; // right edge
const CANE_EDGE = '#3a6420'; // dark outer line on 3-wide stalks
const CANE_JOINT = '#c6dd90'; // pale joint collar band (green, not white)
const CANE_JOINT_SHADE = '#48742c'; // dark line under a collar / seam ring
const CANE_TIP = '#b5dc7a'; // lightest tip pixels
const CANE_FIBER = '#456f28'; // dark vertical-fiber fleck (subtle striation)
const CANE_GLEAM = '#a5d97a'; // rare sun-kissed fleck, lighter than highlight

/** Deterministic 0..1 hash for the fiber flecks — the sprite is painted
 *  ONCE and shared by every cane instance, so the pattern must be stable
 *  across reloads (no Math.random). */
function caneFleck(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** How many block-segments tall the mature cane stands (the sprite is
 *  16px per segment, so 3 segments -> a 16x48 canvas and a 3-block
 *  cross quad). Single source of truth for style + geometry. */
const CANE_BLOCKS = 3;

/** A stalk column: left px, width (2-3), top row. DEAD STRAIGHT —
 *  every stalk rises plumb from its root row to its tip, no lean. */
const CANE_STALKS: { x: number; w: number; top: number }[] = [
  { x: 2, w: 2, top: 12 }, // mid cane, left (~2.25 blocks)
  { x: 6, w: 3, top: 1 }, // tallest cane, centre — full three-block stalk
  { x: 11, w: 2, top: 6 }, // tall cane, right (~2.6 blocks)
  { x: 14, w: 2, top: 18 }, // young sapling at the edge (fuller clump)
];

/** Joint rows (canvas y, top-down) — pale collars where leaves were
 *  attached. Three stacked 16px vanilla tiles put a collar at each
 *  segment's midline: rows 8, 24 and 40. */
const CANE_JOINTS = [8, 24, 40];
/** Dark seam rings at the block boundaries between stacked segments. */
const CANE_SEAMS = [16, 32];

/**
 * Paint the 16x48 cane sprite: four straight vertical stalks with
 * 3-tone cylinder shading, vertical fiber flecks, pale joint collars
 * (+ dark line under each + leaf-sheath nubs with angled tips), dark
 * seam rings at the block boundaries, tapered bright tips and flared
 * root spikes — vanilla sugar cane, upright, crisp and lightly
 * detailed. Fully deterministic.
 */
function drawCaneTexture(): THREE.CanvasTexture {
  const W = 16;
  const H = 16 * CANE_BLOCKS; // 48 — three stacked vanilla tiles
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  const px = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };

  for (const stalk of CANE_STALKS) {
    // the tip row narrows to the stalk's centre pixel (w=2 -> left px,
    // w=3 -> middle px) — a tapered, pointed top like vanilla's
    const centreIdx = Math.floor((stalk.w - 1) / 2);
    for (let y = stalk.top; y < H; y++) {
      for (let i = 0; i < stalk.w; i++) {
        if (y === stalk.top && i !== centreIdx) continue; // 1px tip
        const x = stalk.x + i;
        let c: string;
        if (i === 0) c = CANE_HIGHLIGHT;
        else if (stalk.w > 2 && i === stalk.w - 1) c = CANE_EDGE;
        else if (stalk.w > 2) c = CANE_BASE; // lit body between the edges
        else c = CANE_SHADE;
        const isCollar = CANE_JOINTS.includes(y);
        const isShadeRow = CANE_JOINTS.includes(y - 1);
        const isSeam =
          CANE_SEAMS.includes(y) && y > stalk.top + 2;
        const isTipRow = y === stalk.top || y === stalk.top + 1;
        const isRoot = y >= H - 2;
        // pale joint collar + dark shade line right under it
        if (isCollar) c = CANE_JOINT;
        else if (isShadeRow || isSeam) c = CANE_JOINT_SHADE;
        // tapered, lighter tip: top row is the bright point pixel,
        // second row runs light across the stalk
        if (y === stalk.top) c = CANE_TIP;
        else if (y === stalk.top + 1) c = CANE_HIGHLIGHT;
        // roots read a touch darker
        if (isRoot && c !== CANE_JOINT && c !== CANE_JOINT_SHADE)
          c = CANE_SHADE;
        // LIGHT DETAIL: vertical fiber flecks on steady-state body
        // pixels only. Hashing (x, y/3) makes each fleck a short 3px
        // vertical run — striated cane fibers, not TV static. ~20%
        // of body pixels shift one tone step (dark fiber / light gleam).
        if (!isCollar && !isShadeRow && !isSeam && !isTipRow && !isRoot) {
          const f = caneFleck(x, Math.floor(y / 3));
          if (f > 0.9) c = CANE_GLEAM;
          else if (f < 0.1) c = CANE_FIBER;
        }
        px(x, y, c);
      }
      // leaf-sheath nubs: on collar rows the stalk bulges 1px on each
      // side — the little sheath collar real cane shows at its nodes —
      // each topped with a 1px angled tip so the nub reads as a bud
      if (CANE_JOINTS.includes(y) && y > stalk.top + 1) {
        if (stalk.x - 1 >= 0) {
          px(stalk.x - 1, y, CANE_JOINT);
          px(stalk.x - 1, y - 1, CANE_HIGHLIGHT);
        }
        if (stalk.x + stalk.w < W) {
          px(stalk.x + stalk.w, y, CANE_HIGHLIGHT);
          px(stalk.x + stalk.w, y - 1, CANE_JOINT);
        }
      }
    }
    // root spikes: the base row flares 1px outward on each side —
    // tiny dark anchor points where the cane enters the ground
    if (stalk.x - 1 >= 0) px(stalk.x - 1, H - 1, CANE_JOINT_SHADE);
    if (stalk.x + stalk.w < W)
      px(stalk.x + stalk.w, H - 1, CANE_JOINT_SHADE);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; // crisp pixel-art, Minecraft style
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The classic vanilla crossed-sprite geometry: two quads (4 triangles),
 * up-normals (lit like the ground), base at y=0, CANE_BLOCKS tall.
 */
function buildCaneCross(block: number): THREE.BufferGeometry {
  const h = block * CANE_BLOCKS;
  const hw = (block * 0.95) / 2;
  const geo = new THREE.BufferGeometry();
  // quad A faces +z, quad B faces +x — the classic crossed pair
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -hw, 0, 0, hw, 0, 0, hw, h, 0, -hw, h, 0, // A
        0, 0, -hw, 0, 0, hw, 0, h, hw, 0, h, -hw, // B: rotated 90°
      ],
      3
    )
  );
  geo.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1],
      2
    )
  );
  geo.setAttribute(
    'normal',
    // up-normals — vanilla plant lighting, matches the grass layers
    new THREE.Float32BufferAttribute(
      [
        0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
        0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
      ],
      3
    )
  );
  geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return geo;
}

/** The SUGAR CANE style: vanilla crossed sprite, ~3 blocks tall, sparse
 *  clumps — and PERFECTLY STILL. sway 0 + static true means the shared
 *  factory never injects the wind shader: the cane stands dead straight
 *  and never animates, whatever the gust field is doing to the grass. */
const SUGAR_CANE_STYLE: GrassStyle = {
  tuftHeight: CANE_BLOCKS, // mature cane: three block-segments tall
  tuftWidth: 0.95,
  gridStepBlocks: 14,
  sway: 0, // dead straight — zero wind lean
  static: true, // skip the wind shader entirely: the cane NEVER moves
  custom: undefined, // assigned below (needs the block size)
};

export type SugarPlantHandle = GrassTuftsHandle;

/** Build the sugar-cane layer. Same world options as the grass layers —
 *  anchor, block size, terrain sampler, low-spec flag — so page.tsx
 *  points it at the same meadow. */
export function createSugarPlant(
  scene: THREE.Scene,
  options: GrassTuftsOptions
): GrassTuftsHandle {
  const style: GrassStyle = {
    ...SUGAR_CANE_STYLE,
    custom: () => ({
      geometry: buildCaneCross(options.block),
      material: new THREE.MeshLambertMaterial({
        map: drawCaneTexture(),
        alphaTest: 0.5,
        side: THREE.DoubleSide,
      }),
    }),
  };
  return createGrassField(scene, options, style);
}
