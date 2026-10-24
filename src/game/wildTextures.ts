/**
 * Textures for the TEMPERATE wild RATFIRE biomes — the siblings of
 * winterTextures.ts / desertTextures.ts / extraTextures.ts.
 *
 * These atlases are NOT separately painted: each one is the REAL grassland
 * atlas (public/textures/minecraft/atlas.png — the exact pixels the grass
 * heartland walks on) with ONLY its green pixels recoloured,
 * Minecraft-biome-tint style. Every dirt pixel, every dirt-blend edge and
 * the ragged grass fringe of the side tile are shared verbatim with the
 * grasslands, so the wild biomes read as the same world under a different
 * climate — just hue-swapped:
 *   - CHERRY GROVE:      greens -> blossom pinks (meadow in full flower)
 *   - MUSHROOM FIELDS:   greens -> lavender mycelium greys
 *   - CRIMSON FIELDS:    greens -> crimson reds (the red-themed meadow)
 *   - GOLDEN FIELDS:     greens -> golden yellows (the sun-bleached
 *                        wheat-meadow — the grassland itself, yellowed)
 *
 * How the tint works (2 passes over the loaded atlas pixels):
 *   pass 1 finds the luminance span of the green-dominant pixels
 *   (g > r && g > b — exactly the family the vanilla grass palette lives
 *   in; browns, blues and the olive dirt-blend pixels all fail the test
 *   and pass through untouched);
 *   pass 2 remaps each green pixel's luminance through a 3-stop biome
 *   ramp (deep shade -> body -> highlight), preserving the vanilla noise
 *   pattern 1:1 — same speckle, new climate.
 *
 * Layout matches every zone atlas: top half = top-face tile, bottom half
 * = side-face tile. The source is kept at its native 16x32 so the wild
 * ground has the exact pixel chunkiness of the grasslands (UVs are
 * normalised, so tile resolution is free — see terrainChunks.ts).
 */

import * as THREE from 'three';

/** Native geometry of the baked grassland atlas (public/textures/minecraft/). */
const GRASS_ATLAS_W = 16;
const GRASS_ATLAS_H = 32;

/** Deep shade -> body -> highlight, sampled by green-pixel luminance.
 *  All hues are lifted from the original hand-painted wild palettes so
 *  the sky tints, zone signs and minimap colours stay coherent. */
type Ramp = readonly [string, string, string];
const CHERRY_RAMP: Ramp = ['#bd6f9b', '#d88ab8', '#fbe3ef'];
const SHROOM_RAMP: Ramp = ['#7a6890', '#b4a2c6', '#e0d6ea'];
const CRIMSON_RAMP: Ramp = ['#8a2b2e', '#c44540', '#e8755e'];
const GOLDEN_RAMP: Ramp = ['#a8801f', '#d2ac38', '#f4e69e'];

type Ctx = CanvasRenderingContext2D;

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The baked grassland atlas, requested once — every wild biome tints
 *  the same pixels, so all three share one image request. */
let grassPixels: Promise<HTMLImageElement | null> | null = null;
function loadGrassPixels(): Promise<HTMLImageElement | null> {
  grassPixels ??= new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = '/textures/minecraft/atlas.png';
  });
  return grassPixels;
}

/** Recolour only the green (grass) pixels of the drawn atlas in place:
 *  their luminance, renormalised across the tile, picks a colour on the
 *  biome ramp — the vanilla speckle pattern survives untouched. */
function paintTintedGrass(ctx: Ctx, img: HTMLImageElement, ramp: Ramp): void {
  ctx.imageSmoothingEnabled = false; // 1:1 draw — keep the pixels square
  ctx.drawImage(img, 0, 0, GRASS_ATLAS_W, GRASS_ATLAS_H);
  const frame = ctx.getImageData(0, 0, GRASS_ATLAS_W, GRASS_ATLAS_H);
  const d = frame.data;

  // pass 1: luminance span of the green-dominant pixels
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (g > r && g > b) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (l < lo) lo = l;
      if (l > hi) hi = l;
    }
  }
  if (!(hi > lo)) return; // no grass pixels found — leave the atlas as-is

  // pass 2: remap every green pixel through the 3-stop biome ramp
  const [r0, g0, b0] = hexRgb(ramp[0]);
  const [r1, g1, b1] = hexRgb(ramp[1]);
  const [r2, g2, b2] = hexRgb(ramp[2]);
  const span = hi - lo;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (!(g > r && g > b)) continue; // dirt / blends keep their colour
    const t = Math.min(
      1,
      Math.max(0, (0.2126 * r + 0.7152 * g + 0.0722 * b - lo) / span)
    );
    let rr: number;
    let gg: number;
    let bb: number;
    if (t < 0.5) {
      const k = t * 2;
      rr = r0 + (r1 - r0) * k;
      gg = g0 + (g1 - g0) * k;
      bb = b0 + (b1 - b0) * k;
    } else {
      const k = t * 2 - 1;
      rr = r1 + (r2 - r1) * k;
      gg = g1 + (g2 - g1) * k;
      bb = b1 + (b2 - b1) * k;
    }
    d[i] = rr;
    d[i + 1] = gg;
    d[i + 2] = bb; // alpha untouched — the baked atlas is opaque
  }
  ctx.putImageData(frame, 0, 0);
}

/** Build a wild-biome atlas: the real grassland pixels with their greens
 *  re-ramped to `ramp`. The canvas starts as a flat ramp-body fill so the
 *  ground never flashes black while the shared atlas request is in
 *  flight; the true tinted pixels land a moment later (the wild zones
 *  stream in far from spawn, so the swap is invisible in practice). If
 *  the request ever failed the flat fill simply stays — an intentionally
 *  calm, patternless ground rather than a broken one. */
function tintedGrassAtlas(ramp: Ramp): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = GRASS_ATLAS_W;
  canvas.height = GRASS_ATLAS_H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = ramp[1];
    ctx.fillRect(0, 0, GRASS_ATLAS_W, GRASS_ATLAS_H);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter; // crisp minecraft pixels
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  void loadGrassPixels().then((img) => {
    if (!img || !ctx) return;
    paintTintedGrass(ctx, img, ramp);
    texture.needsUpdate = true;
  });
  return texture;
}

/** Cherry-grove atlas: the real grass tile, greens -> blossom pinks. */
export function createCherryAtlas(): THREE.CanvasTexture {
  return tintedGrassAtlas(CHERRY_RAMP);
}

/** Mushroom-field atlas: the real grass tile, greens -> lavender mycelium. */
export function createShroomAtlas(): THREE.CanvasTexture {
  return tintedGrassAtlas(SHROOM_RAMP);
}

/** Crimson-field atlas: the real grass tile, greens -> crimson reds. */
export function createCrimsonAtlas(): THREE.CanvasTexture {
  return tintedGrassAtlas(CRIMSON_RAMP);
}

/** Golden-field atlas: the real grass tile, greens -> golden yellows. */
export function createGoldenAtlas(): THREE.CanvasTexture {
  return tintedGrassAtlas(GOLDEN_RAMP);
}
