/**
 * Procedural pixel-art COCONUT PALM textures for RATFIRE — drawn once
 * into canvases at boot (no asset files, deterministic), NearestFilter
 * so they read exactly like the hand-painted minecraft atlas the world
 * uses. The user supplied two references:
 *
 *  1. LEAVES — minecraft oak-leaf blocks seen from every side: a green
 *     pixel mosaic with a chunk of the pixels simply MISSING, so you
 *     see straight through the gaps to the BACK of the block (the
 *     material is an alpha-test cutout rendered double-sided). Painted
 *     as a 16x16 RGBA tile: ~72% green pixels, ~28% punched out —
 *     single pixels plus chunky 2x1 / 2x2 holes so the gaps cluster
 *     like the reference instead of fine TV static.
 *
 *  2. WOOD — a minecraft-style log block: warm mid-brown BARK with
 *     strong horizontal banding on the sides, and a lighter tan cut
 *     face with subtle rings on top. Painted as a 16x32 atlas (the
 *     project's zone-atlas convention): TOP half = ring top tile,
 *     BOTTOM half = banded bark side tile — trunk boxes sample the
 *     upper half on their +y face and the lower half everywhere else
 *     (see palmTrees.ts atlasBoxUVs).
 *
 *  3. COCONUTS — the user's voxel coconut reference (upload
 *     images.jpg): a chunky brown voxel cube whose husk is a BIG-PIXEL
 *     brown mosaic (2x2/3x2 patches — mid chocolate body, darker
 *     crevice patches, sparse tan flecks — deliberately NOT per-pixel
 *     static) with the classic THREE DARK PORES (the coconut "eyes")
 *     on the pole face. Painted as a 16x32 atlas in the same
 *     convention: TOP half = pore pole tile, BOTTOM half = husk side
 *     tile — nut boxes sample the upper half on BOTH pole faces (+y
 *     and -y, so the face reads from above AND from the ground looking
 *     up at hanging nuts — see palmTrees.ts nutBoxUVs).
 */

import * as THREE from 'three';

/** Deterministic PRNG (mulberry32) so every boot paints identical tiles. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nearestTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter; // crisp minecraft pixels
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/* ------------------------------------------------------------------ *
 * LEAF TILE — the cutout canopy (reference 1)
 * ------------------------------------------------------------------ */

/** Leaf greens, dark understory to sunlit tip — the reference's five
 *  dominant families, roughly by frequency. */
const LEAF_PALETTE = [
  '#2f4a1c', '#3a5c22', '#486f28', '#558230', // dark -> mid body
  '#63953a', '#6fa544', '#83b551', // lit pixels
  '#27401a', // rare deepest shadow pixels
];

/** 16x16 RGBA leaf tile: a speckled green mosaic with ~28% of the
 *  pixels PUNCHED OUT (alpha 0) — single pixels plus chunky 2x1/2x2
 *  holes, so the canopy reads lacy exactly like the reference blocks
 *  and the back faces show through every gap. */
export function paintLeafTile(ctx: CanvasRenderingContext2D, rand: () => number): void {
  const pick = (): string => {
    const r = rand();
    if (r < 0.22) return LEAF_PALETTE[(rand() * 2) | 0]; // deep greens
    if (r < 0.62) return LEAF_PALETTE[2 + ((rand() * 2) | 0)]; // mid body
    if (r < 0.9) return LEAF_PALETTE[4 + ((rand() * 2) | 0)]; // lit
    return LEAF_PALETTE[7]; // rare darkest
  };
  ctx.clearRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = pick();
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // punch the holes — chunky clusters, not per-pixel static:
  // 10 x 2x2 blocks, 12 x 2x1 slivers, 14 single pixels ≈ 28% open
  for (let h = 0; h < 10; h++) {
    ctx.clearRect((rand() * 14) | 0, (rand() * 14) | 0, 2, 2);
  }
  for (let h = 0; h < 12; h++) {
    ctx.clearRect((rand() * 14) | 0, (rand() * 16) | 0, 2, 1);
  }
  for (let h = 0; h < 14; h++) {
    ctx.clearRect((rand() * 16) | 0, (rand() * 16) | 0, 1, 1);
  }
}

/** The canopy texture: one 16x16 cutout tile. */
export function createPalmLeafTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx) paintLeafTile(ctx, mulberry32(0x1eaf00c5));
  return nearestTexture(canvas);
}

/* ------------------------------------------------------------------ *
 * LOG ATLAS — banded bark sides + ring top (reference 2)
 * ------------------------------------------------------------------ */

/** Bark browns for the horizontal bands — the reference's mid-brown
 *  body with darker seams and lighter sun-caught streaks. */
const BARK_DARK = ['#6e523a', '#755a3e', '#7d5f42'];
const BARK_MID = ['#8a6a46', '#93714c', '#9a7a52'];
const BARK_LIGHT = ['#a8875c', '#b0906a', '#a3835a'];

/** 16x16 bark side tile: strong HORIZONTAL banding — rows 1-3px tall
 *  alternating dark seam / mid body / light streak, with per-pixel
 *  jitter so the bands feel woody rather than drawn with a ruler. */
function paintBarkSide(ctx: CanvasRenderingContext2D, rand: () => number): void {
  let y = 0;
  while (y < 16) {
    const rowH = 1 + ((rand() * 3) | 0); // 1-3px band
    const r = rand();
    const family =
      r < 0.34 ? BARK_DARK : r < 0.72 ? BARK_MID : BARK_LIGHT;
    const base = family[(rand() * family.length) | 0];
    for (let dy = 0; dy < rowH && y + dy < 16; dy++) {
      for (let x = 0; x < 16; x++) {
        // per-pixel jitter: mostly the band colour, sometimes a
        // neighbouring shade — keeps the grain organic
        const j = rand();
        let col = base;
        if (j < 0.14) col = BARK_DARK[(rand() * BARK_DARK.length) | 0];
        else if (j < 0.26) col = BARK_LIGHT[(rand() * BARK_LIGHT.length) | 0];
        else if (j < 0.32) col = BARK_MID[(rand() * BARK_MID.length) | 0];
        ctx.fillStyle = col;
        ctx.fillRect(x, y + dy, 1, 1);
      }
    }
    y += rowH;
  }
  // a few dark knots scattered on the trunk
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = BARK_DARK[(rand() * 2) | 0];
    ctx.fillRect((rand() * 15) | 0, (rand() * 15) | 0, 1, 2);
  }
}

/** 16x16 log-cut top tile: pale tan face with two inset square rings
 *  and a dark centre dot — the classic minecraft log-end read. */
function paintLogTop(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.fillStyle = '#c19a63';
  ctx.fillRect(0, 0, 16, 16);
  // per-pixel warmth jitter
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (rand() < 0.3) {
        ctx.fillStyle = rand() < 0.5 ? '#b8935c' : '#c8a46c';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  // inset square rings
  ctx.strokeStyle = '#a8834f';
  ctx.lineWidth = 1;
  ctx.strokeRect(2.5, 2.5, 11, 11);
  ctx.strokeRect(5.5, 5.5, 5, 5);
  // centre dot + corner shade
  ctx.fillStyle = '#8a6a44';
  ctx.fillRect(7, 7, 2, 2);
  ctx.fillStyle = '#b08a55';
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillRect(15, 15, 1, 1);
}

/* ------------------------------------------------------------------ *
 * COCONUT ATLAS — voxel nut husk + pore pole (reference 3)
 * ------------------------------------------------------------------ */

/** Coconut husk browns — the reference's chocolate body: mid patches
 *  dominate, darker crevice patches shadow them, sparse tan flecks
 *  catch the sun. Deliberately warmer/darker than the trunk bark so
 *  nuts read against the log behind them. */
const NUT_DARK = ['#4f301a', '#5d3a20', '#6b4226'];
const NUT_MID = ['#7a4e2c', '#82552f', '#8a5a33'];
const NUT_LIGHT = ['#96683c', '#9c6f42', '#a97b4a'];

/** 16x16 coconut husk tile: the reference's BIG-PIXEL mosaic — chunky
 *  2x2 / 3x2 / 2x1 patches of husk brown over a mid base, plus a few
 *  1x2 dark crevice slivers. Patchy clusters, not per-pixel static. */
function paintNutHusk(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.fillStyle = NUT_MID[0];
  ctx.fillRect(0, 0, 16, 16);
  const patch = (w: number, h: number): void => {
    const r = rand();
    const fam = r < 0.44 ? NUT_MID : r < 0.76 ? NUT_DARK : NUT_LIGHT;
    ctx.fillStyle = fam[(rand() * fam.length) | 0];
    ctx.fillRect((rand() * 16) | 0, (rand() * 16) | 0, w, h);
  };
  for (let p = 0; p < 26; p++) patch(2, 2); // chunky body patches
  for (let p = 0; p < 10; p++) patch(3, 2); // wide streaks
  for (let p = 0; p < 6; p++) patch(2, 1); // fine slivers
  // dark crevices — deep 1x2 slivers like the reference's shadow pits
  for (let p = 0; p < 5; p++) {
    ctx.fillStyle = '#3a2414';
    ctx.fillRect((rand() * 15) | 0, (rand() * 15) | 0, 1, 2);
  }
}

/** 16x16 coconut POLE tile: the same husk mosaic + the three near-black
 *  pores (the coconut "eyes" from the reference) in a triangle — two
 *  small up top, one bigger below centre, each with a dark halo so they
 *  read at voxel scale. */
function paintNutPores(ctx: CanvasRenderingContext2D, rand: () => number): void {
  paintNutHusk(ctx, rand);
  const pore = (x: number, y: number, s: number): void => {
    ctx.fillStyle = '#3a2414'; // halo
    ctx.fillRect(x - 1, y - 1, s + 2, s + 2);
    ctx.fillStyle = '#221407'; // pore body
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = '#150b03'; // deepest pixel
    ctx.fillRect(x, y + s - 1, s, 1);
  };
  pore(3, 4, 2); // left eye
  pore(11, 4, 2); // right eye
  pore(6, 9, 3); // the bigger germinal pore below centre
}

/** The coconut atlas: 16 wide x 32 tall — TOP half = three-pore pole
 *  tile, BOTTOM half = husk mosaic side tile (the zone-atlas
 *  convention; palmTrees.ts nutBoxUVs samples the top half on BOTH
 *  pole faces so the pores show from above and from below). */
export function createCoconutTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    paintNutPores(ctx, mulberry32(0xc0c0a7 >>> 0));
    ctx.save();
    ctx.translate(0, 16);
    paintNutHusk(ctx, mulberry32(0x5eed11 >>> 0));
    ctx.restore();
  }
  return nearestTexture(canvas);
}

/** The trunk atlas: 16 wide x 32 tall — TOP half = log-cut top tile,
 *  BOTTOM half = banded bark side tile (the zone-atlas convention). */
export function createPalmBarkAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    paintLogTop(ctx, mulberry32(0x10c0001 >>> 0));
    ctx.save();
    ctx.translate(0, 16);
    paintBarkSide(ctx, mulberry32(0xb0d15eed >>> 0));
    ctx.restore();
  }
  return nearestTexture(canvas);
}
