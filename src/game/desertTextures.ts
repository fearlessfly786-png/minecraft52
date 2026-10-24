/**
 * Procedural pixel-art desert textures for the RATFIRE terrain — the hot
 * twin of winterTextures.ts. Drawn once into canvases at boot (no asset
 * files, deterministic), then sampled with NearestFilter so they read
 * exactly like the hand-painted minecraft atlas the grass world uses.
 *
 * The terrain UV scheme samples the TOP HALF of an atlas for up-facing
 * quads and the BOTTOM HALF for side quads (see terrainChunks.ts), so the
 * atlas here keeps that layout:
 *  - SAND ATLAS: top half = windswept PALE KHAKI sand with fine grain
 *    speckles, bottom half = lightly stratified sand with a loose sand
 *    fringe hanging from the top edge (the desert twin of the classic
 *    grass-side tile). Palette matched to the user's reference
 *    screenshot: soft cream-khaki dune sand, no orange cast.
 */

import * as THREE from 'three';

/** Grid-pixel size of one half — 32 px keeps the chunky minecraft look. */
const HALF = 32;

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

type Ctx = CanvasRenderingContext2D;

function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Speckle a rect with a palette, ~1-in-`density` pixels per pass. */
function speckle(
  ctx: Ctx,
  rand: () => number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  colors: string[],
  density: number
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (rand() < density) {
        px(ctx, x, y, 1, 1, colors[(rand() * colors.length) | 0]);
      }
    }
  }
}

/** Layered sand body with a ragged loose-sand fringe hanging from the
 *  top edge — the desert twin of the classic grass-side tile. The palette
 *  is pixel-calibrated against the user's reference screenshot: warm
 *  tan-gold dune sand (sunlit faces ~#e5be67, shade faces ~#996d45 on
 *  screen). The tiles sit below those targets on purpose — the game's
 *  hot daylight (strong sun + ambient) does the rest of the lift. */
function paintSandstoneSide(ctx: Ctx, rand: () => number): void {
  // pixel-calibrated against the reference screenshot: sunlit faces read
  // ~#e5be67 golden cream, shade faces ~#996d45 warm tan — this mid palette
  // + the game's hot daylight lands exactly in that band
  const stone = ['#b99455', '#ae894c', '#c39e5e', '#a37f44', '#b58e50'];
  for (let y = 0; y < HALF; y++) {
    for (let x = 0; x < HALF; x++) {
      px(ctx, x, y, 1, 1, stone[(rand() * stone.length) | 0]);
    }
  }
  // horizontal wind-strata bands: FAINT seams every few pixels — the
  // reference terrain's sides are nearly uniform, so the seams stay just
  // one step darker than the body (readable layering, no strong bands)
  let y = 4 + ((rand() * 4) | 0);
  while (y < HALF) {
    const seam = ['#8f6f3a', '#997a41', '#86693a'][(rand() * 3) | 0];
    let x = (rand() * 6) | 0;
    while (x < HALF) {
      const run = 2 + ((rand() * 7) | 0);
      px(ctx, x, y, Math.min(run, HALF - x), 1, seam);
      x += run + 1 + ((rand() * 5) | 0);
    }
    y += 5 + ((rand() * 5) | 0);
  }
  speckle(ctx, rand, 0, 0, HALF, HALF, ['#96753e', '#cfa96a', '#846636'], 0.06);
  // fringe: 4-6 px of loose top sand with a 1-2 px ragged bottom edge
  for (let x = 0; x < HALF; x++) {
    const depth = 4 + ((rand() * 3) | 0);
    for (let y = 0; y < depth; y++) {
      const sand = y < depth - 1 ? ['#cfa86c', '#c69e62', '#d8b278'] : ['#a5814a', '#9c7942'];
      px(ctx, x, y, 1, 1, sand[(rand() * sand.length) | 0]);
    }
  }
}

/** Windswept sand cap with fine grain speckles and faint ripple runs —
 *  warm tan-gold base, pixel-calibrated to the reference screenshot (see
 *  the lighting note on paintSandstoneSide: the hot daylight lifts this
 *  onto the reference's sunlit top tone instead of washing it out). */
function paintSandTop(ctx: Ctx, rand: () => number): void {
  // tops face the sun straight on (Lambert ~full direct + ambient), so
  // this tile is calibrated DARK: browser-measured iteration showed the
  // daylight lifts tops ~1.9x in linear light, so the tile is painted at
  // target x (0.64, 0.40, 0.43) — landing the screen tone on the
  // reference's warm tan top (~#cba06c) instead of blowing out to cream
  const sand = ['#8a6841', '#84643a', '#906f45', '#845e35'];
  for (let y = 0; y < HALF; y++) {
    for (let x = 0; x < HALF; x++) {
      px(ctx, x, y, 1, 1, sand[(rand() * sand.length) | 0]);
    }
  }
  // ripple runs: short horizontal runs of slightly darker wind-combed sand
  for (let r = 0; r < 6; r++) {
    const y = (rand() * HALF) | 0;
    const x0 = (rand() * HALF) | 0;
    const len = 3 + ((rand() * 8) | 0);
    px(ctx, x0, y, Math.min(len, HALF - x0), 1, '#714a29');
  }
  speckle(ctx, rand, 0, 0, HALF, HALF, ['#6c4629', '#987555', '#603e25'], 0.06);
}

/** Paints a 32x64 atlas: top half = top-face tile, bottom half = side tile. */
function buildAtlas(
  top: (ctx: Ctx, rand: () => number) => void,
  side: (ctx: Ctx, rand: () => number) => void,
  seed: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = HALF;
  canvas.height = HALF * 2;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    top(ctx, mulberry32(seed));
    ctx.save();
    ctx.translate(0, HALF);
    side(ctx, mulberry32(seed ^ 0x9e3779b9));
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter; // crisp minecraft pixels
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** Desert world atlas: windswept sand / layered sandstone-with-fringe. */
export function createSandAtlas(): THREE.CanvasTexture {
  return buildAtlas(paintSandTop, paintSandstoneSide, 0xc0ffee13);
}
