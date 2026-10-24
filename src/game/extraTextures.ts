/**
 * Procedural pixel-art textures for the three extra RATFIRE biomes —
 * the siblings of desertTextures.ts. Drawn once into canvases at boot
 * (no asset files, deterministic), then sampled with NearestFilter so
 * they read exactly like the hand-painted minecraft atlas.
 *
 * The terrain UV scheme samples the TOP HALF of an atlas for up-facing
 * quads and the BOTTOM HALF for side quads (see terrainChunks.ts), so
 * every atlas keeps that layout:
 *  - RED SAND ATLAS: rust-red windswept dune tops + layered red
 *    sandstone sides with a loose fringe (Mars-like red desert).
 *  - BADLANDS ATLAS: pale terracotta cap + side tile painted as one
 *    full sedimentary STRATA cycle (orange/red/tan/cream bands) — each
 *    block face is one stratum, so the stacked terrace walls (see the
 *    wall-fill in terrainChunks.ts) read as striped canyon rock.
 *  - BASALT ATLAS: near-black speckled tops + columnar sides with
 *    bright LAVA CRACKS. The basalt material also uses this canvas as
 *    its emissive map, so the crack pixels glow orange out of the dark
 *    rock — day and especially night (see terrainChunks.ts).
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

/* ------------------------- RED DESERT ------------------------- */

/** Windswept rust-red dune cap: dark warm reds (tops face the sun and
 *  the game's hot daylight lifts them ~1.9x — same dark-paint trick as
 *  the calibrated sand tops in desertTextures.ts; the first boot came
 *  out neon under the lift, so the palette sits DEEP and desaturated). */
function paintRedSandTop(ctx: Ctx, rand: () => number): void {
  const sand = ['#6f2d1f', '#682a1c', '#78331f', '#622719'];
  for (let y = 0; y < HALF; y++) {
    for (let x = 0; x < HALF; x++) {
      px(ctx, x, y, 1, 1, sand[(rand() * sand.length) | 0]);
    }
  }
  // wind-combed ripple runs, one step darker
  for (let r = 0; r < 6; r++) {
    const y = (rand() * HALF) | 0;
    const x0 = (rand() * HALF) | 0;
    const len = 3 + ((rand() * 8) | 0);
    px(ctx, x0, y, Math.min(len, HALF - x0), 1, '#571f12');
  }
  speckle(ctx, rand, 0, 0, HALF, HALF, ['#4f1c10', '#7e3423', '#5a2214'], 0.06);
}

/** Layered red sandstone body with a ragged loose-red-sand fringe. */
function paintRedSandstoneSide(ctx: Ctx, rand: () => number): void {
  const stone = ['#8a3a26', '#7f341f', '#94422c', '#752d1b', '#99472f'];
  for (let y = 0; y < HALF; y++) {
    for (let x = 0; x < HALF; x++) {
      px(ctx, x, y, 1, 1, stone[(rand() * stone.length) | 0]);
    }
  }
  // faint wind-strata seams
  let y = 4 + ((rand() * 4) | 0);
  while (y < HALF) {
    const seam = ['#6b2917', '#75301c', '#612414'][(rand() * 3) | 0];
    let x = (rand() * 6) | 0;
    while (x < HALF) {
      const run = 2 + ((rand() * 7) | 0);
      px(ctx, x, y, Math.min(run, HALF - x), 1, seam);
      x += run + 1 + ((rand() * 5) | 0);
    }
    y += 5 + ((rand() * 5) | 0);
  }
  speckle(ctx, rand, 0, 0, HALF, HALF, ['#712c1a', '#a8503a', '#5d2313'], 0.06);
  // loose top fringe
  for (let x = 0; x < HALF; x++) {
    const depth = 4 + ((rand() * 3) | 0);
    for (let y = 0; y < depth; y++) {
      const sand = y < depth - 1 ? ['#a85236', '#9f4a30', '#b25a3c'] : ['#7c311e', '#732c1a'];
      px(ctx, x, y, 1, 1, sand[(rand() * sand.length) | 0]);
    }
  }
}

/* ------------------------- BADLANDS ------------------------- */

/** Pale hard terracotta cap — sun-baked mesa top. */
function paintMesaTop(ctx: Ctx, rand: () => number): void {
  const cap = ['#96683c', '#8d6036', '#a07142', '#885931'];
  for (let y = 0; y < HALF; y++) {
    for (let x = 0; x < HALF; x++) {
      px(ctx, x, y, 1, 1, cap[(rand() * cap.length) | 0]);
    }
  }
  // cracked-earth seams on the baked cap
  for (let c = 0; c < 5; c++) {
    let x = (rand() * HALF) | 0;
    let y = (rand() * HALF) | 0;
    const steps = 4 + ((rand() * 6) | 0);
    for (let s = 0; s < steps; s++) {
      px(ctx, x, y, 1, 1, '#6f4a26');
      x = (x + ((rand() * 3) | 0) - 1 + HALF) % HALF;
      y = (y + 1) % HALF;
    }
  }
  speckle(ctx, rand, 0, 0, HALF, HALF, ['#7a5228', '#ab7b4c', '#6a4522'], 0.07);
}

/** ONE FULL SEDIMENTARY STRATA CYCLE: horizontal terracotta bands
 *  (orange / red / tan / cream) with thin dark seams between them.
 *  Every block face shows the same cycle, so stacked wall-fill faces
 *  read as repeating layered canyon rock. */
function paintMesaSide(ctx: Ctx, rand: () => number): void {
  const bands = [
    ['#b3623c', '#aa5a34', '#bc6a44'], // burnt orange
    ['#8f4028', '#863a23', '#9a4830'], // deep red
    ['#c98d55', '#c0834c', '#d4975f'], // tan
    ['#a34e30', '#99462a', '#ad5738'], // red-orange
    ['#d8b184', '#cfa678', '#e0bb8f'], // cream
    ['#b3623c', '#aa5a34', '#bc6a44'], // burnt orange
    ['#7c3a24', '#74331f', '#86422a'], // dark red-brown
  ];
  let y = 0;
  let b = (rand() * bands.length) | 0;
  while (y < HALF) {
    const thickness = 3 + ((rand() * 4) | 0); // 3-6 px strata
    const band = bands[b % bands.length];
    const y1 = Math.min(y + thickness, HALF);
    for (let yy = y; yy < y1; yy++) {
      for (let x = 0; x < HALF; x++) {
        px(ctx, x, yy, 1, 1, band[(rand() * band.length) | 0]);
      }
    }
    // thin dark seam between strata
    if (y1 < HALF) {
      for (let x = 0; x < HALF; x++) {
        if (rand() < 0.85) px(ctx, x, y1, 1, 1, '#5f2f1c');
      }
    }
    y = y1 + 1;
    b++;
  }
  speckle(ctx, rand, 0, 0, HALF, HALF, ['#6d3a24', '#c49264', '#82462a'], 0.05);
}

/* ------------------------- VOLCANO ------------------------- */

/** Near-black basalt cap with faint grey speckle and a couple of tiny
 *  ember dots (the only top-face glow the emissive map picks up). */
function paintBasaltTop(ctx: Ctx, rand: () => number): void {
  const rock = ['#1f2226', '#24282d', '#1a1d21', '#2a2f35'];
  for (let y = 0; y < HALF; y++) {
    for (let x = 0; x < HALF; x++) {
      px(ctx, x, y, 1, 1, rock[(rand() * rock.length) | 0]);
    }
  }
  speckle(ctx, rand, 0, 0, HALF, HALF, ['#3a4048', '#15171a', '#454c55'], 0.08);
  // rare ember pinpricks where the crust has thinned
  const dots = 2 + ((rand() * 2) | 0);
  for (let d = 0; d < dots; d++) {
    px(ctx, (rand() * HALF) | 0, (rand() * HALF) | 0, 1, 1, ['#ff6a22', '#ff8c3a'][d % 2]);
  }
}

/** Columnar basalt body: vertical striations + 3-4 jagged bright LAVA
 *  CRACKS (1 px wide with forked branches). With this canvas as the
 *  material's emissiveMap the cracks glow orange out of the dark rock. */
function paintBasaltSide(ctx: Ctx, rand: () => number): void {
  const rock = ['#191c20', '#1e2226', '#141619', '#23272c'];
  for (let y = 0; y < HALF; y++) {
    for (let x = 0; x < HALF; x++) {
      px(ctx, x, y, 1, 1, rock[(rand() * rock.length) | 0]);
    }
  }
  // vertical column striations, one step lighter
  let x = 2 + ((rand() * 3) | 0);
  while (x < HALF) {
    const w = 1 + ((rand() * 2) | 0);
    const shade = rand() < 0.5 ? '#2c3138' : '#262b31';
    px(ctx, x, 0, Math.min(w, HALF - x), HALF, shade);
    x += w + 2 + ((rand() * 3) | 0);
  }
  speckle(ctx, rand, 0, 0, HALF, HALF, ['#31363d', '#101214'], 0.06);
  // LAVA CRACKS: jagged descending runs with occasional forks
  const cracks = 3 + ((rand() * 2) | 0);
  for (let c = 0; c < cracks; c++) {
    let cx = 2 + ((rand() * (HALF - 4)) | 0);
    let cy = (rand() * 4) | 0;
    const core = rand() < 0.5 ? '#ff7a2e' : '#ff5a1f';
    const hot = '#ffb35e';
    while (cy < HALF) {
      px(ctx, cx, cy, 1, 1, core);
      if (rand() < 0.3) px(ctx, cx, cy, 1, 1, hot); // hot core flicker px
      // fork
      if (rand() < 0.22 && cy + 1 < HALF) {
        const fx = cx + (rand() < 0.5 ? -1 : 1);
        if (fx >= 0 && fx < HALF) px(ctx, fx, cy + 1, 1, 1, core);
      }
      cx += ((rand() * 3) | 0) - 1;
      cx = Math.max(0, Math.min(HALF - 1, cx));
      cy += 1 + ((rand() * 2) | 0);
    }
  }
}

/* ------------- LAVA — glowing crust plates (smooth, not pixel art) -----
 *
 * The look: molten rock skin — irregular orange-brown crust PLATES
 * locked together like a dried mud flat, separated by a web of GLOWING
 * golden cracks that breathe and boil. Smooth and continuous: the tile
 * is rendered at full 128x128 resolution with soft anti-aliased crack
 * edges and LINEAR filtering — no pixelation anywhere.
 *
 * How it works:
 *
 *  - A 4x4 grid of jittered crust sites on a torus builds a seamless
 *    tileable Voronoi field: each plate is one cell and the crack web
 *    runs along the cell boundaries (the F2 - F1 edge distance).
 *  - Cracks glow through a hot gradient — deep orange rim → golden
 *    body → white-hot core — and the heat bleeds softly into the
 *    plates beside every crack; plate centres cool darker and sparse
 *    dark pores bubble in roughly a third of the plates. The rock is
 *    deep burnt orange-brown, and the web is ORGANIC: noise bends the
 *    crack paths and pinches them thin / swells them wide so the glow
 *    varies naturally along every crack.
 *  - The soup LIVES: every site drifts on its own slow orbit while the
 *    crack width pulses, so the glowing web wiggles and breathes
 *    forever (repainted at 10 fps — plenty for a slow molten boil).
 *  - The whole crust ALSO GLIDES across the face: each soup carries a
 *    horizontal + vertical flow velocity, so the pattern visibly
 *    FLOWS IN 2D (the rivers' pour adds a continuous downward glide
 *    on top of it).
 *  - The 128x128 soup paints 1:1 into the atlas tiles (top-face tile
 *    + side-face tile — every face of a lava block samples the same
 *    animated texture); mipmaps keep distant lava glassy smooth.
 *
 * The materials that sample it (terrainChunks.ts caldera + lavaFlow.ts
 * rivers) are UNLIT MeshBasic — lava is fullbright, so the painted
 * colours ARE the on-screen colours, day and night.
 */

const LAVA_SIM_SIZE = 128; // the smooth high-res soup, painted 1:1
const LAVA_TILE = 128; // the atlas tile (canvas is 128x256)
const LAVA_TICK_MS = 50; // the soup lives on the 20 fps game clock
const LAVA_PAINT_EVERY = 2; // repaint at 10 fps — plenty for a slow boil
const LAVA_GRID = 4; // 4x4 crust plates per tile (~32 px each)

/** Smooth toroidal value noise (8x8 lattice over the tile) — the organic
 *  irregularity source: crack wobble, pinch points and glow variation. */
function lavaNoiseField(seed: number): Float32Array {
  const rand = mulberry32(seed);
  const g = 8;
  const lat = new Float32Array(g * g);
  for (let i = 0; i < lat.length; i++) lat[i] = rand();
  const n = LAVA_SIM_SIZE;
  const out = new Float32Array(n * n);
  const fade = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < n; y++) {
    const fy = (y / n) * g;
    const y0 = Math.floor(fy);
    const v = fade(fy - y0);
    const y1 = (y0 + 1) % g;
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * g;
      const x0 = Math.floor(fx);
      const u = fade(fx - x0);
      const x1 = (x0 + 1) % g;
      const a = lat[y0 * g + x0] * (1 - u) + lat[y0 * g + x1] * u;
      const b = lat[y1 * g + x0] * (1 - u) + lat[y1 * g + x1] * u;
      out[y * n + x] = a * (1 - v) + b * v;
    }
  }
  return out;
}

/** One crust-plate soup — a seamless, living Voronoi crack field.
 *  Site layout per plate: [bx, by, ph1, sp1, ph2, sp2, shade,
 *  poreDx, poreDy, poreR] (poreR = 0 when this plate has no pore). */
export class LavaSoup {
  private sites: Float32Array;
  private warpX: Float32Array; // domain warp — bends the crack paths
  private warpY: Float32Array;
  private pinch: Float32Array; // crack width varies along its length
  private ticks = 0;
  /** RGBA bytes of the last paint (128x128), ready for an ImageData copy. */
  readonly pixels = new Uint8ClampedArray(LAVA_SIM_SIZE * LAVA_SIM_SIZE * 4);

  constructor(
    seed = 0x1a1a7a17,
    private flowX = 6, // pattern drift, px/s — horizontal flow
    private flowY = 3.5 // pattern drift, px/s — vertical flow
  ) {
    const rand = mulberry32(seed);
    const g = LAVA_GRID;
    const s = LAVA_SIM_SIZE / g;
    this.sites = new Float32Array(g * g * 10);
    for (let j = 0; j < g; j++) {
      for (let i = 0; i < g; i++) {
        const o = (j * g + i) * 10;
        this.sites[o] = (i + 0.15 + rand() * 0.7) * s; // base x
        this.sites[o + 1] = (j + 0.15 + rand() * 0.7) * s; // base y
        this.sites[o + 2] = rand() * Math.PI * 2; // drift phase 1
        this.sites[o + 3] = 0.25 + rand() * 0.4; // drift speed 1
        this.sites[o + 4] = rand() * Math.PI * 2; // drift phase 2
        this.sites[o + 5] = 0.25 + rand() * 0.4; // drift speed 2
        this.sites[o + 6] = rand(); // plate shade variation
        if (rand() < 0.34) {
          // a dark pore bubbles in this plate
          this.sites[o + 7] = (rand() - 0.5) * s * 0.7;
          this.sites[o + 8] = (rand() - 0.5) * s * 0.7;
          this.sites[o + 9] = 2 + rand() * 2.2;
        }
      }
    }
    // organic irregularity: smooth toroidal noise fields — two bend the
    // crack paths (domain warp), one pinches them thin and wide, so the
    // web reads like real cooled lava instead of ruler-straight Voronoi
    this.warpX = lavaNoiseField((seed ^ 0x51ab3c17) >>> 0);
    this.warpY = lavaNoiseField((seed ^ 0x2545f491) >>> 0);
    this.pinch = lavaNoiseField((seed ^ 0x2b1c9d43) >>> 0);
    this.paint(); // the very first frame is ready immediately
  }

  /** Advances the simulation ONE Minecraft tick (50 ms). */
  tick(): void {
    this.ticks++;
    if (this.ticks % LAVA_PAINT_EVERY === 0) this.paint();
  }

  private paint(): void {
    const g = LAVA_GRID;
    const n = LAVA_SIM_SIZE;
    const s = n / g;
    const t = (this.ticks * LAVA_TICK_MS) / 1000;
    const px = this.pixels;

    // every crust site drifts on its own slow orbit (wrapped on the torus)
    const sx = new Float32Array(g * g);
    const sy = new Float32Array(g * g);
    const amp = s * 0.09;
    for (let i = 0; i < g * g; i++) {
      const o = i * 10;
      let x =
        this.sites[o] +
        amp * Math.sin(t * this.sites[o + 3] + this.sites[o + 2]);
      let y =
        this.sites[o + 1] +
        amp * Math.cos(t * this.sites[o + 5] + this.sites[o + 4]);
      x -= Math.floor(x / n) * n;
      y -= Math.floor(y / n) * n;
      sx[i] = x;
      sy[i] = y;
    }
    // the crack web breathes: its half-width pulses slowly
    const crackW = s * 0.14 * (1 + 0.2 * Math.sin(t * 0.8));

    // 2D flow: the whole crust glides across the tile — horizontal AND
    // vertical — while everything above keeps boiling in place
    const ox = (t * this.flowX) % n;
    const oy = (t * this.flowY) % n;

    const warpAmp = s * 0.22; // how far the noise bends the crack paths
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        // the field is evaluated at the scrolled point (wrapped on the
        // torus) so plates, cracks, pores and mottle all drift together
        let fx = x - ox;
        let fy = y - oy;
        fx -= Math.floor(fx / n) * n;
        fy -= Math.floor(fy / n) * n;
        const ni = (fy | 0) * n + (fx | 0);
        // domain warp: sample the field through the noise so plate
        // boundaries wobble organically instead of running dead straight
        const wx = fx + (this.warpX[ni] - 0.5) * warpAmp;
        const wy = fy + (this.warpY[ni] - 0.5) * warpAmp;
        // nearest + second-nearest crust sites (toroidal 3x3 ring)
        const cx = Math.floor(wx / s);
        const cy = Math.floor(wy / s);
        let f1 = 1e9;
        let f2 = 1e9;
        let best = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const rj = (((cy + dj) % g) + g) % g;
          for (let di = -1; di <= 1; di++) {
            const ri = (((cx + di) % g) + g) % g;
            const si = rj * g + ri;
            let dx = wx - sx[si];
            let dy = wy - sy[si];
            dx -= Math.round(dx / n) * n;
            dy -= Math.round(dy / n) * n;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < f1) {
              f2 = f1;
              f1 = d;
              best = si;
            } else if (d < f2) {
              f2 = d;
            }
          }
        }
        const e = f2 - f1; // 0 exactly on a plate boundary
        const o = (y * n + x) * 4;

        // --- the crust plate: darker rock, cooled core, heated rim ---
        const shade = this.sites[best * 10 + 6];
        let r = 146 + shade * 30;
        let gr = 62 + shade * 20;
        let bl = 17 + shade * 8;
        const core = Math.min(f1 / (s * 0.95), 1);
        const cool = core * core * 0.3;
        r *= 1 - cool;
        gr *= 1 - cool;
        bl *= 1 - cool;
        // faint cloudy mottle so the rock is not flat plastic
        const mot = (this.warpX[ni] - 0.5) * 0.12 + 1;
        r *= mot;
        gr *= mot;
        bl *= mot;
        const bleed = 1 - Math.min(e / (crackW * 3), 1);
        const heat = bleed * bleed * 0.4;
        r += (255 - r) * heat * 0.5;
        gr += (130 - gr) * heat * 0.5;
        bl += (24 - bl) * heat * 0.5;

        // --- the glowing crack web: orange rim → gold → white-hot core ---
        // natural width: cracks pinch thin and swell wide along their
        // length (pinch noise), so the glow varies organically too
        const wLocal = crackW * (0.45 + 1.1 * this.pinch[ni]);
        const crackT = Math.max(0, 1 - e / wLocal);
        if (crackT > 0) {
          const mid = Math.min(crackT / 0.62, 1);
          const hot = Math.max(0, (crackT - 0.62) / 0.38);
          const cr = 255;
          const cg = 132 + mid * 76; // golden body
          const cb = 22 + mid * 44;
          const cgf = cg + (246 - cg) * hot; // white-hot core overlay
          const cbf = cb + (188 - cb) * hot;
          const w = Math.min(
            (crackT / 0.22) * (0.85 + 0.3 * this.pinch[ni]),
            1
          ); // soft anti-aliased edge, brighter where the crack is wide
          r += (cr - r) * w;
          gr += (cgf - gr) * w;
          bl += (cbf - bl) * w;
        } else {
          // dark pores bubble in roughly a third of the plates
          const po = best * 10;
          const pr = this.sites[po + 9];
          if (pr > 0) {
            let pdx = fx - (sx[best] + this.sites[po + 7]);
            let pdy = fy - (sy[best] + this.sites[po + 8]);
            pdx -= Math.round(pdx / n) * n;
            pdy -= Math.round(pdy / n) * n;
            const pd = Math.sqrt(pdx * pdx + pdy * pdy);
            if (pd < pr) {
              const k = 1 - (pd / pr) * 0.45;
              r *= k;
              gr *= k;
              bl *= k;
            }
          }
        }

        px[o] = r;
        px[o + 1] = gr;
        px[o + 2] = bl;
        px[o + 3] = 255;
      }
    }
  }
}

/** One registered animated texture: a soup + the canvas tiles it paints. */
interface LavaAnim {
  soup: LavaSoup;
  off: HTMLCanvasElement; // 16x16 scratch the sim blits through
  offCtx: Ctx;
  img: ImageData;
  targets: Array<{
    tex: THREE.CanvasTexture;
    ctx: Ctx;
    tiles: Array<{ dx: number; dy: number }>;
  }>;
}

const lavaAnims: LavaAnim[] = [];
let lavaClock: number | null = null;
let lavaAcc = 0;

/** Registers an animated lava texture (the soup starts hot + painted). */
function registerLavaAnim(
  seed: number,
  targets: LavaAnim['targets'],
  flowX = 6,
  flowY = 3.5
): LavaAnim {
  const soup = new LavaSoup(seed, flowX, flowY);
  const off = document.createElement('canvas');
  off.width = LAVA_SIM_SIZE;
  off.height = LAVA_SIM_SIZE;
  const offCtx = off.getContext('2d') as Ctx;
  const img = offCtx.createImageData(LAVA_SIM_SIZE, LAVA_SIM_SIZE);
  const anim: LavaAnim = { soup, off, offCtx, img, targets };
  lavaAnims.push(anim);
  paintLavaAnim(anim); // the very first frame is on screen immediately
  return anim;
}

/** Blits the soup into every registered tile and flags the upload. */
function paintLavaAnim(anim: LavaAnim): void {
  anim.img.data.set(anim.soup.pixels);
  anim.offCtx.putImageData(anim.img, 0, 0);
  for (const t of anim.targets) {
    for (const tile of t.tiles) {
      t.ctx.drawImage(anim.off, tile.dx, tile.dy, LAVA_TILE, LAVA_TILE);
    }
    t.tex.needsUpdate = true;
  }
}

/** Advances every lava soup at the fixed Minecraft rate (20 fps) and
 *  repaints its tiles — called once per frame by terrainChunks.update(). */
export function tickLavaTextures(): void {
  const now = performance.now();
  if (lavaClock === null) {
    lavaClock = now;
    return;
  }
  lavaAcc += now - lavaClock;
  lavaClock = now;
  if (lavaAcc > 250) lavaAcc = 250; // cap catch-up after tab switches
  let stepped = false;
  while (lavaAcc >= LAVA_TICK_MS) {
    lavaAcc -= LAVA_TICK_MS;
    for (const anim of lavaAnims) anim.soup.tick();
    stepped = true;
  }
  if (!stepped) return;
  for (const anim of lavaAnims) paintLavaAnim(anim);
}

/** Detaches a texture created by this module (its soup stops ticking). */
export function releaseLavaTexture(tex: THREE.Texture): void {
  for (let i = lavaAnims.length - 1; i >= 0; i--) {
    if (lavaAnims[i].targets.some((t) => t.tex === tex)) {
      lavaAnims.splice(i, 1);
    }
  }
}

/** Caldera lava atlas: ONE modern molten soup painted into both the
 *  top-face tile and the side-face tile (like the game, every lava face
 *  samples the same animated texture) — the lava material is UNLIT
 *  (MeshBasic in terrainChunks.ts), so this canvas burns bright day and
 *  night exactly as painted. */
export function createLavaAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = LAVA_TILE;
  canvas.height = LAVA_TILE * 2;
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.imageSmoothingEnabled = false;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; // smooth, NOT pixelated
  texture.minFilter = THREE.LinearMipmapLinearFilter; // glassy far away
  texture.generateMipmaps = true;
  registerLavaAnim(
    0x1a1a7a17,
    [
      { tex: texture, ctx, tiles: [{ dx: 0, dy: 0 }, { dx: 0, dy: LAVA_TILE }] },
    ],
    7,
    4 // the lake slowly drifts diagonally — flow in BOTH axes
  );
  return texture;
}

/* ---------------- flowing-lava feeds (lavaFlow.ts) ---------------- */

export interface LavaFlowFeed {
  /** 32x64 animated atlas (top-half tile + side tile) for flat faces. */
  atlas: THREE.CanvasTexture;
  /** 32x32 animated soup tile with RepeatWrapping — the material whose
   *  offset.y lavaFlow.ts scrolls 1 texel every 3 ticks, the vanilla
   *  "flowing texture pours down the face" animation. */
  side: THREE.CanvasTexture;
  dispose(): void;
}

/** Independent soup + textures for the DYNAMIC flow rivers (their own
 *  random state, like vanilla's separate still/flow texture pools). */
export function createLavaFlowFeed(): LavaFlowFeed {
  // atlas canvas: 32x64, top tile + side tile (flat flow faces)
  const aCanvas = document.createElement('canvas');
  aCanvas.width = LAVA_TILE;
  aCanvas.height = LAVA_TILE * 2;
  const aCtx = aCanvas.getContext('2d') as Ctx;
  aCtx.imageSmoothingEnabled = false;
  const atlas = new THREE.CanvasTexture(aCanvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = THREE.LinearFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.generateMipmaps = true;

  // side canvas: 32x32 soup tile only, wrapping so the scroll loops
  const sCanvas = document.createElement('canvas');
  sCanvas.width = LAVA_TILE;
  sCanvas.height = LAVA_TILE;
  const sCtx = sCanvas.getContext('2d') as Ctx;
  sCtx.imageSmoothingEnabled = false;
  const side = new THREE.CanvasTexture(sCanvas);
  side.colorSpace = THREE.SRGBColorSpace;
  side.magFilter = THREE.LinearFilter;
  side.minFilter = THREE.LinearMipmapLinearFilter;
  side.generateMipmaps = true;
  side.wrapS = THREE.RepeatWrapping;
  side.wrapT = THREE.RepeatWrapping;

  const anim = registerLavaAnim(
    0x7a1a2b17,
    [
      {
        tex: atlas,
        ctx: aCtx,
        tiles: [{ dx: 0, dy: 0 }, { dx: 0, dy: LAVA_TILE }],
      },
      { tex: side, ctx: sCtx, tiles: [{ dx: 0, dy: 0 }] },
    ],
    12,
    7 // the current glides along the channel — flow in BOTH axes
  );

  return {
    atlas,
    side,
    dispose() {
      const i = lavaAnims.indexOf(anim);
      if (i >= 0) lavaAnims.splice(i, 1);
      atlas.dispose();
      side.dispose();
    },
  };
}

/* ---------------- caldera surface tile (calderaLava.ts) ---------------- */

export interface LavaSurfaceTile {
  /** ONE wrapping 128x128 crust tile (its own soup instance). */
  tile: THREE.CanvasTexture;
  dispose(): void;
}

/** The caldera's 3D molten body samples this single WRAPPING tile on
 *  absolute world coordinates (u = x, v = z), so the crust runs
 *  seamlessly across the whole lake and its skirts alike — like
 *  vanilla's separate texture pools, the lake boils on its own soup. */
export function createLavaSurfaceTile(): LavaSurfaceTile {
  const canvas = document.createElement('canvas');
  canvas.width = LAVA_TILE;
  canvas.height = LAVA_TILE;
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.imageSmoothingEnabled = false;
  const tile = new THREE.CanvasTexture(canvas);
  tile.colorSpace = THREE.SRGBColorSpace;
  tile.magFilter = THREE.LinearFilter; // smooth, NOT pixelated
  tile.minFilter = THREE.LinearMipmapLinearFilter;
  tile.generateMipmaps = true;
  tile.wrapS = THREE.RepeatWrapping;
  tile.wrapT = THREE.RepeatWrapping;
  const anim = registerLavaAnim(
    0x5a1a7a11,
    [{ tex: tile, ctx, tiles: [{ dx: 0, dy: 0 }] }],
    7,
    4 // the lake crust drifts slowly in BOTH axes
  );
  return {
    tile,
    dispose() {
      const i = lavaAnims.indexOf(anim);
      if (i >= 0) lavaAnims.splice(i, 1);
      tile.dispose();
    },
  };
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

/** Red-desert atlas: rust dune cap / layered red sandstone-with-fringe. */
export function createRedSandAtlas(): THREE.CanvasTexture {
  return buildAtlas(paintRedSandTop, paintRedSandstoneSide, 0xbedead21);
}

/** Badlands atlas: baked terracotta cap / full strata cycle side. */
export function createMesaAtlas(): THREE.CanvasTexture {
  return buildAtlas(paintMesaTop, paintMesaSide, 0x0badcafe2);
}

/** Volcano atlas: speckled basalt cap / columnar side with lava cracks
 *  (doubles as the material's emissive map — see terrainChunks.ts). */
export function createBasaltAtlas(): THREE.CanvasTexture {
  return buildAtlas(paintBasaltTop, paintBasaltSide, 0xc0c0a017);
}
