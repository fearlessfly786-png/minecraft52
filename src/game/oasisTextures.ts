/**
 * Procedural pixel-art OASIS MUD texture for the RATFIRE terrain — the
 * wet twin of desertTextures.ts. Drawn once into a canvas at boot (no
 * asset files, deterministic), then sampled with NearestFilter so it
 * reads exactly like the hand-painted minecraft atlas the grass world
 * uses.
 *
 * The user asked for a "mud or clay block" mixed into the grass collar
 * around the oasis and supplied a reference texture: Minecraft-style
 * PACKED MUD — a uniform speckle mosaic of warm browns (mid chocolate
 * body, darker damp clumps, lighter dry crumbs and a few rare grey
 * grit pixels). This module paints exactly that:
 *  - MUD ATLAS: top half = packed-mud top tile, bottom half = mud side
 *    tile (same 32x64 top/side layout every biome atlas follows — the
 *    terrain UV scheme samples the TOP HALF for up-facing quads and
 *    the BOTTOM HALF for side quads, see terrainChunks.ts).
 *
 * Lighting calibration (same story as the sand atlas): oasis tops face
 * the hot desert sun straight on and the game's daylight lifts top
 * faces ~1.5-1.9x in linear light, so the TOP tile is painted a step
 * darker than the reference body while the SIDE tile sits near the
 * reference tone — landing the on-screen block in the reference's
 * mid-brown band instead of blowing out to orange.
 */

import * as THREE from 'three';

/** Grid-pixel size of one half — 16 px, exactly matching the grass
 *  world's atlas (public/textures/minecraft/atlas.png is 16x32: a
 *  16x16 top tile over a 16x16 side tile). Same pixel density = mud
 *  texels read the same size as grass texels on screen. */
const HALF = 16;

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

/** Reference palette (user's packed-mud image), shifted by `shade`:
 *  1 = the raw reference body, <1 darkened for sun-lifted faces. */
function mudPalette(shade: number): string[] {
  const mix = (hex: string): string => {
    const r = Math.round(parseInt(hex.slice(1, 3), 16) * shade);
    const g = Math.round(parseInt(hex.slice(3, 5), 16) * shade);
    const b = Math.round(parseInt(hex.slice(5, 7), 16) * shade);
    return `rgb(${Math.min(r, 255)},${Math.min(g, 255)},${Math.min(b, 255)})`;
  };
  // mid chocolate body, damp dark clumps, dry light crumbs — the four
  // dominant families of the reference texture, roughly by frequency
  const body = ['#8a6746', '#96744e', '#93714c', '#84603e'];
  const damp = ['#6e4f33', '#5f4429', '#6a4a2c', '#54391f'];
  const dry = ['#a8835a', '#b28a58', '#c09a64', '#9c7a52'];
  const grit = ['#8a8578', '#75726a']; // the rare grey grit pixels
  return [...body, ...damp, ...dry, ...grit].map(mix);
}

/** One packed-mud tile: every pixel draws from the mud palette with
 *  damp-dark and dry-light weighting, plus 2x2 damp clumps and rare
 *  grey grit specks — the reference's uniform speckle-mosaic look,
 *  drawn at the grass atlas's own 16x16 resolution. */
function paintMudTile(ctx: Ctx, rand: () => number, shade: number): void {
  const body = mudPalette(shade);
  // weighted family picks: body 50%, damp 26%, dry 20%, grit 4%
  const pick = (): string => {
    const r = rand();
    if (r < 0.5) return body[(rand() * 4) | 0];
    if (r < 0.76) return body[4 + ((rand() * 4) | 0)];
    if (r < 0.96) return body[8 + ((rand() * 4) | 0)];
    return body[12 + ((rand() * 2) | 0)];
  };
  for (let y = 0; y < HALF; y++) {
    for (let x = 0; x < HALF; x++) {
      px(ctx, x, y, 1, 1, pick());
    }
  }
  // damp clumps: 2x2 blocks of the darkest damp tones (wet patches)
  for (let c = 0; c < 3; c++) {
    const x = (rand() * (HALF - 2)) | 0;
    const y = (rand() * (HALF - 2)) | 0;
    px(ctx, x, y, 2, 2, body[4 + ((rand() * 3) | 0)]);
  }
  // dry crumbs: 2x1 highlights of the lightest dry tones
  for (let c = 0; c < 3; c++) {
    const x = (rand() * (HALF - 2)) | 0;
    const y = (rand() * HALF) | 0;
    px(ctx, x, y, 2, 1, body[10 + ((rand() * 2) | 0)]);
  }
}

/** Mud side tile — the packed-mud body slightly shaded, with faint
 *  horizontal damp seams near the top edge (water oozing out of a
 *  fresh mud wall) so exposed collar walls read as wet earth. */
function paintMudSide(ctx: Ctx, rand: () => number): void {
  paintMudTile(ctx, rand, 0.82);
  // ooze seams: short dark runs just below the top edge
  for (let r = 0; r < 3; r++) {
    const y = 1 + ((rand() * 4) | 0);
    const x0 = (rand() * HALF) | 0;
    const len = 2 + ((rand() * 4) | 0);
    px(ctx, x0, y, Math.min(len, HALF - x0), 1, mudPalette(0.55)[5]);
  }
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

/** Oasis mud atlas: packed-mud top / damp mud side. */
export function createMudAtlas(): THREE.CanvasTexture {
  return buildAtlas(
    (ctx, rand) => paintMudTile(ctx, rand, 0.66),
    paintMudSide,
    0x6d0d1337
  );
}
