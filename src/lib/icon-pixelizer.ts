import sharp from "sharp";

/**
 * AI ICON PIXELIZER — turns ANY raster image (AI-generated art or a player
 * upload) into a vanilla-style 16×16 Minecraft item sprite:
 *
 *   1. Chroma-key the border-connected background away (flood fill from the
 *      image edges — interior colours are never touched, so a green/magenta
 *      item in the middle survives even if its colour matches the backdrop).
 *   2. Nearest-neighbour downscale to 16×16 — no smoothing, hard pixels only.
 *   3. Alpha threshold so edges stay chunky and anti-aliasing is stripped.
 *   4. Nearest-neighbour upscale ×16 → 256×256 PNG. The UI renders sprites
 *      with [image-rendering:pixelated], so the result sits perfectly next
 *      to the vanilla wiki textures in the inventory and recipe book.
 */

const GRID = 16;
const SCALE = 16;
const WORK = 256;

/** Estimates the backdrop colour as the median of the border pixels. */
function findBackgroundColor(
  rgba: Buffer,
  width: number,
  height: number
): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    rs.push(rgba[i]);
    gs.push(rgba[i + 1]);
    bs.push(rgba[i + 2]);
  };
  for (let x = 0; x < width; x += 1) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    sample(0, y);
    sample(width - 1, y);
  }
  const med = (list: number[]) => {
    list.sort((a, b) => a - b);
    return list[list.length >> 1] ?? 0;
  };
  return [med(rs), med(gs), med(bs)];
}

/**
 * Removes the border-connected background colour in place.
 */
function stripBackground(
  rgba: Buffer,
  width: number,
  height: number,
  bg: [number, number, number]
): void {
  const alphaAt = (x: number, y: number) => rgba[(y * width + x) * 4 + 3];

  // Already-transparent border? The source has its own alpha — respect it.
  let opaqueBorder = 0;
  let borderCount = 0;
  const bump = (x: number, y: number) => {
    borderCount += 1;
    if (alphaAt(x, y) > 32) opaqueBorder += 1;
  };
  for (let x = 0; x < width; x += 1) {
    bump(x, 0);
    bump(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    bump(0, y);
    bump(width - 1, y);
  }
  if (opaqueBorder / Math.max(1, borderCount) < 0.5) return;

  const tol = 74; // per-channel tolerance vs the estimated backdrop colour
  const near = (p: number) => {
    const i = p * 4;
    return (
      Math.abs(rgba[i] - bg[0]) <= tol &&
      Math.abs(rgba[i + 1] - bg[1]) <= tol &&
      Math.abs(rgba[i + 2] - bg[2]) <= tol
    );
  };

  // BFS flood fill from every near-background border pixel.
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p] || !near(p)) return;
    visited[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length > 0) {
    const p = stack.pop() as number;
    rgba[p * 4 + 3] = 0;
    const x = p % width;
    const y = Math.floor(p / width);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
}

/**
 * Eats leftover background fragments the flood fill could not reach through
 * (anti-aliased edges can seal off pockets of chroma colour). A pixel dies
 * when it is strongly CHROMA-KEY coloured AND touches a transparent pixel —
 * repeated so chains dissolve. Genuine item colours never sit in the keyed
 * hue, and deliberate interior colours are shielded by opaque neighbours.
 */
function stripResidualChroma(
  rgba: Buffer,
  width: number,
  height: number,
  bg: [number, number, number]
): void {
  const isChroma = (p: number) => {
    const i = p * 4;
    if (rgba[i + 3] === 0) return false;
    const [r, g, b] = bg;
    // strongly near the keyed colour, and a saturated two-channel hue
    // (wide tolerance — muted violet #9B59B6-style AA residue must die too)
    return (
      Math.abs(rgba[i] - r) <= 120 &&
      Math.abs(rgba[i + 1] - g) <= 120 &&
      Math.abs(rgba[i + 2] - b) <= 120 &&
      Math.min(rgba[i], rgba[i + 2]) > 130 &&
      rgba[i + 1] < 110
    );
  };
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (!isChroma(p)) continue;
        const touchesTransparent =
          (x > 0 && rgba[(p - 1) * 4 + 3] === 0) ||
          (x < width - 1 && rgba[(p + 1) * 4 + 3] === 0) ||
          (y > 0 && rgba[(p - width) * 4 + 3] === 0) ||
          (y < height - 1 && rgba[(p + width) * 4 + 3] === 0);
        if (touchesTransparent) {
          rgba[p * 4 + 3] = 0;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

/** Image → 16×16 vanilla-style sprite → 256×256 crisp PNG. */
export async function pixelizeIconPng(input: Buffer): Promise<Buffer> {
  const base = await sharp(input, { failOn: "none" })
    .resize(WORK, WORK, { fit: "cover" })
    .ensureAlpha()
    .raw()
    .toBuffer();

  const bg = findBackgroundColor(base, WORK, WORK);
  stripBackground(base, WORK, WORK, bg);
  stripResidualChroma(base, WORK, WORK, bg);

  const small = await sharp(base, {
    raw: { width: WORK, height: WORK, channels: 4 },
  })
    .resize(GRID, GRID, { kernel: "nearest", fit: "fill" })
    .raw()
    .toBuffer();

  for (let i = 0; i < small.length; i += 4) {
    // chunky alpha edges + no dark halos when a cleared pixel is upscaled
    small[i + 3] = small[i + 3] < 128 ? 0 : 255;
    if (small[i + 3] === 0) {
      small[i] = 0;
      small[i + 1] = 0;
      small[i + 2] = 0;
    }
  }

  return sharp(small, {
    raw: { width: GRID, height: GRID, channels: 4 },
  })
    .resize(GRID * SCALE, GRID * SCALE, { kernel: "nearest" })
    .png()
    .toBuffer();
}
