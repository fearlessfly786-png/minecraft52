/**
 * Ultradetail procedural PBR material kit for the treasure that fills the
 * RATFIRE loot chests — the coins, gold-bar ingots and cut gems revealed
 * when a chest swings open.
 *
 * Everything is generated at boot on offscreen canvases (zero network
 * cost, zero asset weight) and follows the chestPbr.ts recipe:
 *
 *  - COIN FACE  (256²): an embossed gold coin — radial-shaded disc,
 *    reeded rim ticks, twin embossed border rings, a central letter "R"
 *    mint mark with star flourishes, and metal-grain speckle. A Sobel
 *    normal map is derived from the same luminance so the relief catches
 *    the sunlight like real struck metal.
 *  - COIN SIDE  (64²): vertical reeding stripes (the milled coin edge),
 *    tiled around each coin's circumference.
 *  - GOLD INGOT (256²): brushed bullion — hundreds of anisotropic
 *    horizontal streaks, a struck stamp band ("RATFIRE · FINE 999.9")
 *    with hallmark dots, plus its own derived normal map for the die
 *    stamps and brush relief.
 *  - GEMS: three flat-shaded cut-gem materials (ruby, emerald, amethyst)
 *    — no texture needed: faceted octahedron geometry plus a strong
 *    procedural env reflection and a tinted emissive core reads as
 *    polished gemstone.
 *  - a tiny procedural equirect env map (same trick as chestPbr.ts) so
 *    every metal surface gets genuine reflections without touching the
 *    scene lighting.
 *
 * RAM/cost profile: one shared kit for the whole world (created with the
 * chest system, disposed with it) — 2 albedos + 2 derived normals + 1 env
 * map + 5 materials, all small canvases.
 */

import * as THREE from 'three';

export interface TreasurePbrKit {
  /** Embossed coin face (caps). */
  coinFace: THREE.MeshStandardMaterial;
  /** Reeded milled edge (coin sides). */
  coinSide: THREE.MeshStandardMaterial;
  /** Brushed + stamped bullion (ingots). */
  ingot: THREE.MeshStandardMaterial;
  /** Cut gems (flat-shaded, emissive core). */
  ruby: THREE.MeshStandardMaterial;
  emerald: THREE.MeshStandardMaterial;
  amethyst: THREE.MeshStandardMaterial;
  dispose(): void;
}

/** Sobel strength for the derived coin/ingot normal maps. */
const NORMAL_STRENGTH = 2.4;

/** Deterministic PRNG (mulberry32) so generated grain replays exactly. */
function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('treasurePbr: 2d canvas unavailable');
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Sobel normal map derived from a canvas' luminance (dark = recessed). */
function deriveNormal(src: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const size = src.width;
  const read = src
    .getContext('2d', { willReadFrequently: true })!
    .getImageData(0, 0, size, size);
  const s = read.data;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = size;
  outCanvas.height = size;
  const octx = outCanvas.getContext('2d')!;
  const out = octx.createImageData(size, size);
  const dst = out.data;
  const lum = (i: number) =>
    (s[i] * 0.299 + s[i + 1] * 0.587 + s[i + 2] * 0.114) / 255;
  for (let y = 0; y < size; y++) {
    const yu = ((y - 1 + size) % size) * size;
    const yc = y * size;
    const yd = ((y + 1) % size) * size;
    for (let x = 0; x < size; x++) {
      const xl = (x - 1 + size) % size;
      const xr = (x + 1) % size;
      const dx = lum((yc + xr) * 4) - lum((yc + xl) * 4);
      const dy = lum((yd + x) * 4) - lum((yu + x) * 4);
      const nx = -dx * strength;
      const ny = dy * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (yc + x) * 4;
      dst[i] = ((nx / len) * 0.5 + 0.5) * 255;
      dst[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      dst[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      dst[i + 3] = 255;
    }
  }
  octx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(outCanvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Tiny speckle grain over the whole canvas (metal micro-texture). */
function speckle(
  ctx: CanvasRenderingContext2D,
  size: number,
  seed: number,
  count: number,
  alpha: number
): void {
  const rng = rng32(seed);
  for (let i = 0; i < count; i++) {
    const x = rng() * size;
    const y = rng() * size;
    ctx.fillStyle =
      rng() < 0.5
        ? `rgba(255,248,214,${alpha})`
        : `rgba(74,46,4,${alpha})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
}

export function createTreasurePbr(): TreasurePbrKit {
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };

  // ---- procedural environment map (equirect) for metal/gem reflections ----
  const env = (() => {
    const w = 256;
    const h = 128;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#a9cdf6');
      sky.addColorStop(0.42, '#e8f2fc');
      sky.addColorStop(0.5, '#e6d9b8');
      sky.addColorStop(0.6, '#77603c');
      sky.addColorStop(1, '#413726');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      const sx = w * 0.22;
      const sy = h * 0.16;
      const sun = ctx.createRadialGradient(sx, sy, 2, sx, sy, 26);
      sun.addColorStop(0, 'rgba(255,255,250,1)');
      sun.addColorStop(0.4, 'rgba(255,240,190,0.85)');
      sun.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, h);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return track(tex);
  })();

  // ---------------- embossed coin face (256²) ----------------
  const coinFaceTex = (() => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);
    const c = size / 2;

    // shaded gold disc
    const disc = ctx.createRadialGradient(c - 22, c - 26, 8, c, c, c - 4);
    disc.addColorStop(0, '#fff6c8');
    disc.addColorStop(0.35, '#ffd75e');
    disc.addColorStop(0.72, '#e2a92c');
    disc.addColorStop(0.94, '#b97f14');
    disc.addColorStop(1, '#8a5a10');
    ctx.beginPath();
    ctx.arc(c, c, c - 3, 0, Math.PI * 2);
    ctx.fillStyle = disc;
    ctx.fill();
    ctx.save();
    ctx.clip();

    // reeded rim: 96 milled ticks just inside the edge
    const reeds = 96;
    for (let i = 0; i < reeds; i++) {
      const a = (i / reeds) * Math.PI * 2;
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(120,74,8,0.85)' : 'rgba(255,244,196,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * (c - 14), c + Math.sin(a) * (c - 14));
      ctx.lineTo(c + Math.cos(a) * (c - 22), c + Math.sin(a) * (c - 22));
      ctx.stroke();
    }

    // twin embossed border rings
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(122,77,10,0.9)';
    ctx.beginPath();
    ctx.arc(c, c, c - 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,246,200,0.85)';
    ctx.beginPath();
    ctx.arc(c, c, c - 35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(122,77,10,0.55)';
    ctx.beginPath();
    ctx.arc(c, c, c - 42, 0, Math.PI * 2);
    ctx.stroke();

    // central mint mark: embossed letter "R" (dark seat + light face)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 128px Georgia, serif';
    ctx.fillStyle = 'rgba(112,68,6,0.95)';
    ctx.fillText('R', c + 4, c + 42);
    ctx.fillStyle = 'rgba(255,248,214,0.95)';
    ctx.fillText('R', c, c + 38);
    ctx.fillStyle = 'rgba(226,169,44,1)';
    ctx.fillText('R', c - 1.5, c + 36.5);

    // star flourishes left + right of the mark
    for (const sx of [-1, 1]) {
      ctx.save();
      ctx.translate(c + sx * 74, c + 34);
      ctx.fillStyle = 'rgba(255,248,214,0.9)';
      ctx.beginPath();
      for (let p = 0; p < 10; p++) {
        const r = p % 2 === 0 ? 12 : 5;
        const a = (p / 10) * Math.PI * 2 - Math.PI / 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // laurel dots arcing under the mark
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.2 + (i / 6) * 0.6);
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * 78, c + Math.sin(a) * 40 + 44, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(122,77,10,0.75)';
      ctx.fill();
    }

    speckle(ctx, size, 0xc01a, 500, 0.07);
    ctx.restore();

    // dark surround (outside the disc) — cap UVs never sample it
    const tex = track(toTexture(canvas));
    const nrm = track(deriveNormal(canvas, NORMAL_STRENGTH));
    const mat = track(
      new THREE.MeshStandardMaterial({
        map: tex,
        normalMap: nrm,
        normalScale: new THREE.Vector2(1.4, 1.4),
        color: 0xffffff,
        roughness: 0.26,
        metalness: 0.92,
        envMap: env,
        envMapIntensity: 1.1,
      })
    );
    return mat;
  })();

  // ---------------- reeded coin edge (64²) ----------------
  const coinSideTex = (() => {
    const size = 64;
    const { canvas, ctx } = makeCanvas(size);
    const reeds = 8;
    const rw = size / reeds;
    for (let i = 0; i < reeds; i++) {
      const g = ctx.createLinearGradient(i * rw, 0, (i + 1) * rw, 0);
      g.addColorStop(0, '#8a5a10');
      g.addColorStop(0.35, '#ffd75e');
      g.addColorStop(0.55, '#fff3c4');
      g.addColorStop(0.8, '#d99f22');
      g.addColorStop(1, '#8a5a10');
      ctx.fillStyle = g;
      ctx.fillRect(i * rw, 0, rw + 1, size);
    }
    speckle(ctx, size, 0x51de, 160, 0.08);
    const tex = track(toTexture(canvas));
    const nrm = track(deriveNormal(canvas, 1.6));
    return track(
      new THREE.MeshStandardMaterial({
        map: tex,
        normalMap: nrm,
        normalScale: new THREE.Vector2(1.1, 1.1),
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.9,
        envMap: env,
        envMapIntensity: 1.0,
      })
    );
  })();

  // ---------------- brushed + stamped ingot (256²) ----------------
  const ingotTex = (() => {
    const size = 256;
    const { canvas, ctx } = makeCanvas(size);

    // brushed bullion base: horizontal anisotropic streaks
    ctx.fillStyle = '#e6b845';
    ctx.fillRect(0, 0, size, size);
    const rng = rng32(0x1970);
    for (let i = 0; i < 620; i++) {
      const y = rng() * size;
      const w = 30 + rng() * size;
      const x = rng() * size;
      const light = rng() < 0.5;
      ctx.strokeStyle = light
        ? `rgba(255,244,198,${0.05 + rng() * 0.1})`
        : `rgba(120,78,10,${0.05 + rng() * 0.1})`;
      ctx.lineWidth = 0.8 + rng() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.lineTo(x + w / 2, y);
      ctx.stroke();
    }
    // soft sheen bands across the brush
    for (const yy of [size * 0.18, size * 0.62]) {
      const sheen = ctx.createLinearGradient(0, yy - 22, 0, yy + 22);
      sheen.addColorStop(0, 'rgba(255,248,214,0)');
      sheen.addColorStop(0.5, 'rgba(255,248,214,0.16)');
      sheen.addColorStop(1, 'rgba(255,248,214,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, yy - 22, size, 44);
    }

    // struck stamp band across the middle (reads on the long faces)
    const bandY = size * 0.5;
    ctx.fillStyle = 'rgba(96,58,6,0.28)';
    ctx.fillRect(0, bandY - 30, size, 60);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 34px "Arial Black", sans-serif';
    const stamp = (text: string, x: number, y: number, size2: number) => {
      ctx.font = `900 ${size2}px "Arial Black", sans-serif`;
      ctx.fillStyle = 'rgba(70,42,2,0.95)'; // die seat shadow
      ctx.fillText(text, x, y + 2.5);
      ctx.fillStyle = 'rgba(255,246,204,0.92)'; // raised strike face
      ctx.fillText(text, x, y);
    };
    stamp('RATFIRE', size * 0.5, bandY - 14, 30);
    stamp('FINE 999.9', size * 0.5, bandY + 18, 22);

    // hallmark dots in the corners (assay marks)
    for (const [hx, hy] of [
      [18, 18],
      [size - 18, 18],
      [18, size - 18],
      [size - 18, size - 18],
    ]) {
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(90,54,4,0.5)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hx, hy - 1.4, 4.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,246,204,0.7)';
      ctx.fill();
    }

    speckle(ctx, size, 0xbee5, 420, 0.06);
    const tex = track(toTexture(canvas));
    const nrm = track(deriveNormal(canvas, 2.0));
    return track(
      new THREE.MeshStandardMaterial({
        map: tex,
        normalMap: nrm,
        normalScale: new THREE.Vector2(1.2, 1.2),
        color: 0xffffff,
        roughness: 0.22,
        metalness: 0.95,
        envMap: env,
        envMapIntensity: 1.2,
      })
    );
  })();

  // ---------------- cut gems ----------------
  function gemMaterial(
    color: number,
    emissive: number
  ): THREE.MeshStandardMaterial {
    return track(
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: 0.55,
        roughness: 0.12,
        metalness: 0.08,
        flatShading: true,
        envMap: env,
        envMapIntensity: 1.7,
      })
    );
  }
  const ruby = gemMaterial(0xd0143c, 0x40060e);
  const emerald = gemMaterial(0x0fa54a, 0x02290f);
  const amethyst = gemMaterial(0x8b2fd6, 0x1e0730);

  function dispose(): void {
    for (const d of disposables) d.dispose();
    disposables.length = 0;
  }

  return {
    coinFace: coinFaceTex,
    coinSide: coinSideTex,
    ingot: ingotTex,
    ruby,
    emerald,
    amethyst,
    dispose,
  };
}
