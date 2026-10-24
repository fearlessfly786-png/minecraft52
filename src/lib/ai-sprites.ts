import sharp from "sharp";

/**
 * AI-FORGED ITEM SPRITES — procedural 16×16 pixel-art painter.
 *
 * The image-generation model paints painterly scenes with the background
 * baked in — unusable as an inventory sprite next to the crisp wiki
 * textures. So the forge NEVER calls it: the LLM only picks a SHAPE
 * (template) and a material PALETTE, and this module paints a true
 * vanilla-style 16×16 sprite in code — chunky pixels, thick outline,
 * flat shading — then blows it up to 256px with hard edges.
 *
 * Deterministic: the same template + palette always yields the same icon.
 */

export const SPRITE_TEMPLATES = [
  "sword",
  "pickaxe",
  "axe",
  "shovel",
  "gem",
  "ingot",
  "orb",
  "potion",
  "wand",
  "helmet",
  "shield",
  "book",
  "bomb",
  "star",
  "coin",
] as const;

export type SpriteTemplate = (typeof SPRITE_TEMPLATES)[number];

export interface SpritePalette {
  /** Main material — blade, gem body, armor plate. */
  primary?: string;
  /** Handle / base material — usually wood or leather. */
  secondary?: string;
  /** Glow / emblem — runes, potion liquid, sparkles. */
  accent?: string;
}

const SIZE = 16;
type RGBA = [number, number, number, number];

const TRANSPARENT: RGBA = [0, 0, 0, 0];
const WHITE: RGBA = [255, 255, 255, 255];
const DARK: RGBA = [24, 20, 30, 255];

function hexToRgba(raw: string | undefined, fallback: RGBA): RGBA {
  if (!raw) return fallback;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(raw.trim());
  if (!m) return fallback;
  let hex = m[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

function mul(c: RGBA, f: number): RGBA {
  return [
    Math.max(0, Math.min(255, Math.round(c[0] * f))),
    Math.max(0, Math.min(255, Math.round(c[1] * f))),
    Math.max(0, Math.min(255, Math.round(c[2] * f))),
    255,
  ];
}

function mix(c: RGBA, t: RGBA, f: number): RGBA {
  return [
    Math.round(c[0] + (t[0] - c[0]) * f),
    Math.round(c[1] + (t[1] - c[1]) * f),
    Math.round(c[2] + (t[2] - c[2]) * f),
    255,
  ];
}

/** Tiny 16×16 RGBA canvas with vanilla-sprite helpers. */
class Pix {
  readonly px: RGBA = [] as unknown as RGBA;
  data: RGBA[] = Array.from({ length: SIZE * SIZE }, () => TRANSPARENT);

  set(x: number, y: number, c: RGBA): void {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    this.data[y * SIZE + x] = c;
  }

  get(x: number, y: number): RGBA {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return TRANSPARENT;
    return this.data[y * SIZE + x];
  }

  filled(x: number, y: number): boolean {
    return this.get(x, y)[3] > 0;
  }

  /** Thick diagonal band used by tools: path point steps (dx,dy) per step;
   *  side -1 = up-left (light edge), +1 = down-right (dark edge). */
  band(
    x0: number,
    y0: number,
    steps: number,
    colors: { main: RGBA; light?: RGBA; dark?: RGBA },
    dir: 1 | -1 = 1
  ): void {
    for (let t = 0; t < steps; t++) {
      const x = x0 - dir * t;
      const y = y0 + dir * t;
      this.set(x, y, colors.main);
      if (colors.light) this.set(x - 1, y - 1, colors.light);
      if (colors.dark) this.set(x + 1, y + 1, colors.dark);
    }
  }

  /** Outline every transparent pixel that touches a filled one. */
  outline(color: RGBA): void {
    const out: Array<[number, number]> = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (this.filled(x, y)) continue;
        if (
          this.filled(x - 1, y) ||
          this.filled(x + 1, y) ||
          this.filled(x, y - 1) ||
          this.filled(x, y + 1)
        ) {
          out.push([x, y]);
        }
      }
    }
    for (const [x, y] of out) this.set(x, y, color);
  }

  /** 8-bit disc (radius r at cx,cy) with auto top-left light + bottom dark. */
  disc(cx: number, cy: number, r: number, base: RGBA): void {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d <= r * r) {
          const edge = d > (r - 1.2) * (r - 1.2);
          let c = base;
          if (x + y < cx + cy - r * 0.5) c = mix(base, WHITE, 0.3);
          else if (x + y > cx + cy + r * 0.5) c = mul(base, 0.72);
          else if (edge) c = mul(base, 0.88);
          this.set(x, y, c);
        }
      }
    }
  }

  shine(x: number, y: number): void {
    this.set(x, y, WHITE);
    this.set(x + 1, y, WHITE);
    this.set(x, y + 1, WHITE);
  }
}

type C = {
  p: RGBA; // primary
  pl: RGBA; // primary light
  pd: RGBA; // primary dark
  s: RGBA; // secondary
  sd: RGBA; // secondary dark
  a: RGBA; // accent
  ad: RGBA; // accent dark
  o: RGBA; // outline
};

function ctxt(primary: RGBA, secondary: RGBA, accent: RGBA): C {
  return {
    p: primary,
    pl: mix(primary, WHITE, 0.42),
    pd: mul(primary, 0.6),
    s: secondary,
    sd: mul(secondary, 0.62),
    a: accent,
    ad: mul(accent, 0.6),
    o: mix(mul(primary, 0.4), DARK, 0.75),
  };
}

/* ==== the templates — each paints a vanilla-style 16×16 item ============ */

function sword(c: C, k: Pix): void {
  // Blade: 3-wide anti-diagonal band, tip at (14,1).
  k.band(13, 2, 8, { main: c.p, light: c.pl, dark: c.pd });
  k.set(14, 1, c.pl); // tip
  k.set(14, 2, c.p);
  k.set(5, 11, c.pd); // blade foot
  // Cross-guard (perpendicular short band).
  k.set(2, 8, c.a);
  k.set(3, 9, c.a);
  k.set(4, 10, c.a);
  k.set(5, 11, c.ad);
  k.set(3, 8, c.ad);
  k.set(4, 9, c.ad);
  k.set(5, 10, c.a);
  k.set(6, 11, c.ad);
  k.set(7, 12, c.ad);
  // Handle + pommel continuing the same diagonal.
  k.set(4, 11, c.sd);
  k.set(3, 12, c.s);
  k.set(2, 13, c.s);
  k.set(1, 14, c.a);
}

function pickaxe(c: C, k: Pix): void {
  // Handle: bottom-left up to the head center.
  k.band(2, 13, 7, { main: c.s, dark: c.sd }, -1);
  // Head: arc bowing over the top, perpendicular to the handle.
  const arc: Array<[number, number]> = [
    [1, 9], [1, 8], [2, 7],
    [2, 6], [3, 5], [3, 4], [4, 3],
    [5, 2], [6, 2], [7, 1], [8, 1], [9, 1], [10, 1],
    [11, 2], [12, 2],
    [12, 3], [13, 4], [13, 5], [14, 6], [14, 7], [14, 8],
  ];
  for (const [x, y] of arc) k.set(x, y, c.pd);
  // Light top edge + fill the band downward.
  const top: Array<[number, number]> = [
    [2, 7], [3, 4], [4, 3], [5, 2], [6, 2],
    [7, 1], [8, 1], [9, 1], [10, 1], [11, 2], [12, 3], [13, 4],
  ];
  for (const [x, y] of top) k.set(x, y, c.pl);
  const mid: Array<[number, number]> = [
    [1, 8], [2, 6], [3, 5], [5, 3], [6, 3], [7, 2], [8, 2],
    [9, 2], [10, 2], [11, 3], [12, 4], [13, 5], [14, 6], [14, 7],
  ];
  for (const [x, y] of mid) k.set(x, y, c.p);
  k.set(14, 8, c.pd);
}

function axe(c: C, k: Pix): void {
  // Handle: bottom-left up to the head.
  k.band(2, 13, 6, { main: c.s, dark: c.sd }, -1);
  // Head: blade wedge attached at the handle top, edge facing right.
  const rows: Array<[number, number, number]> = [
    [1, 6, 10],
    [2, 5, 12],
    [3, 4, 12],
    [4, 4, 11],
    [5, 5, 10],
    [6, 7, 9],
  ];
  for (const [y, xa, xb] of rows) {
    for (let x = xa; x <= xb; x++) k.set(x, y, c.p);
  }
  // Cutting edge (right) + spine shading (left/bottom).
  k.set(11, 2, c.pl);
  k.set(12, 2, c.pl);
  k.set(12, 3, c.pl);
  k.set(11, 3, c.pl);
  k.set(4, 3, c.pd);
  k.set(4, 4, c.pd);
  k.set(5, 5, c.pd);
  k.set(8, 6, c.pd);
  k.set(9, 5, c.pd);
  k.set(6, 1, c.pl);
  k.set(7, 1, c.pl);
}

function shovel(c: C, k: Pix): void {
  // Handle: bottom-left up to the head neck.
  k.band(1, 14, 8, { main: c.s, dark: c.sd }, -1);
  // Head: spade at the top-right end.
  const rows: Array<[number, number, number]> = [
    [1, 11, 12],
    [2, 10, 13],
    [3, 10, 14],
    [4, 10, 14],
    [5, 10, 13],
    [6, 9, 10],
  ];
  for (const [y, xa, xb] of rows) {
    for (let x = xa; x <= xb; x++) k.set(x, y, c.p);
  }
  k.set(11, 1, c.pl);
  k.set(12, 1, c.pl);
  k.set(10, 2, c.pl);
  k.set(10, 3, c.pl);
  k.set(14, 3, c.pd);
  k.set(14, 4, c.pd);
  k.set(13, 5, c.pd);
  k.set(12, 5, c.pd);
  k.set(10, 6, c.pd);
}

function gem(c: C, k: Pix): void {
  // Faceted diamond |x-8| + |y-8| <= 5.
  for (let y = 3; y <= 13; y++) {
    const w = 5 - Math.abs(8 - y);
    for (let x = 8 - w; x <= 8 + w; x++) {
      const tone = x + y < 10 ? c.pl : x + y > 17 ? c.pd : c.p;
      k.set(x, y, tone);
    }
  }
  // Table facet + girdle + shine.
  for (let x = 5; x <= 11; x++) k.set(x, 8, c.p);
  k.set(7, 3, c.pl);
  k.set(8, 3, c.pl);
  k.set(9, 4, c.pl);
  k.set(6, 5, WHITE);
  k.set(7, 5, WHITE);
  k.set(8, 13, c.pd);
  k.set(8, 12, c.ad);
  k.set(4, 9, c.pd);
  k.set(12, 9, c.pd);
}

function ingot(c: C, k: Pix): void {
  // Single 3D bar — elongated hexagon, vanilla-style.
  const rows: Array<[number, number, number, RGBA]> = [
    [5, 7, 12, c.pl],
    [6, 5, 13, c.pl],
    [7, 4, 13, c.p],
    [8, 3, 13, c.p],
    [9, 3, 13, c.pd],
    [10, 4, 12, c.pd],
  ];
  for (const [y, xa, xb, tone] of rows) {
    for (let x = xa; x <= xb; x++) k.set(x, y, tone);
  }
  // Left end cap slant + glint.
  k.set(3, 8, c.pd);
  k.set(4, 7, c.pd);
  k.set(6, 6, WHITE);
  k.set(7, 6, WHITE);
}

function orb(c: C, k: Pix): void {
  k.disc(8, 8, 5.2, c.p);
  // Glow ring + core shine.
  k.set(6, 6, WHITE);
  k.set(7, 6, WHITE);
  k.set(6, 7, WHITE);
  k.set(9, 11, c.pd);
  k.set(8, 12, c.ad);
  k.set(2, 3, c.a);
  k.set(13, 4, c.a);
  k.set(12, 13, c.a);
}

function potion(c: C, k: Pix): void {
  // Cork + neck.
  k.set(7, 1, c.sd);
  k.set(8, 1, c.sd);
  for (let y = 2; y <= 5; y++) {
    k.set(7, y, c.s);
    k.set(8, y, c.s);
  }
  // Flask body.
  k.disc(8, 10, 4.6, c.pl);
  // Liquid (bottom 60%) + bubbles.
  for (let y = 9; y <= 14; y++) {
    for (let x = 3; x <= 13; x++) {
      if (k.filled(x, y) && k.get(x, y)[1] < 255 && y >= 9) {
        if ((x - 8) * (x - 8) + (y - 10) * (y - 10) <= 20) k.set(x, y, c.a);
      }
    }
  }
  k.set(7, 10, c.ad);
  k.set(9, 12, WHITE);
  k.set(6, 8, WHITE);
}

function wand(c: C, k: Pix): void {
  // Stick: bottom-left up to the tip.
  k.band(2, 13, 8, { main: c.s, dark: c.sd }, -1);
  // Glowing tip orb + sparkles.
  k.disc(11, 4, 2.4, c.a);
  k.set(10, 3, WHITE);
  k.set(14, 1, c.a);
  k.set(12, 8, c.a);
  k.set(14, 10, c.ad);
}

function helmet(c: C, k: Pix): void {
  // Solid rounded dome.
  const rows: Array<[number, number, number]> = [
    [3, 5, 10],
    [4, 4, 11],
    [5, 3, 12],
    [6, 3, 12],
    [7, 3, 12],
    [8, 3, 12],
    [9, 3, 12],
    [10, 3, 12],
    [11, 4, 11],
  ];
  for (const [y, xa, xb] of rows) {
    for (let x = xa; x <= xb; x++) {
      k.set(x, y, y <= 4 ? c.pl : c.p);
    }
  }
  // Dark visor slit across the face.
  for (let x = 5; x <= 10; x++) {
    k.set(x, 7, c.pd);
    k.set(x, 8, c.pd);
  }
  // Bottom shadow + accent crest ridge.
  for (const [, xa, xb] of [rows[7]]) k.set(xa, 10, c.pd);
  k.set(7, 3, c.a);
  k.set(8, 3, c.a);
  k.set(6, 4, c.ad);
  k.set(9, 4, c.ad);
  k.set(3, 9, c.pd);
  k.set(12, 9, c.pd);
}

function shield(c: C, k: Pix): void {
  for (let y = 2; y <= 13; y++) {
    const t = y - 2;
    const half = 5 - Math.max(0, Math.floor((t - 6) * 0.9));
    for (let x = 8 - half; x <= 8 + half; x++) {
      k.set(x, y, x === 8 - half || x === 8 + half ? c.sd : c.p);
    }
  }
  for (let x = 4; x <= 12; x++) k.set(x, 2, c.s); // rim
  for (let y = 3; y <= 12; y++) k.set(8, y, c.ad); // emblem stripe
  k.set(7, 5, c.a);
  k.set(9, 5, c.a);
  k.set(8, 4, c.a);
  k.set(8, 6, c.a);
  k.set(7, 13, c.pd);
  k.set(9, 13, c.pd);
}

function book(c: C, k: Pix): void {
  for (let y = 3; y <= 12; y++) {
    for (let x = 3; x <= 12; x++) {
      const corner =
        (y === 3 || y === 12) && (x === 3 || x === 12);
      if (corner) continue;
      k.set(x, y, x === 3 ? c.sd : c.p);
    }
  }
  for (let x = 4; x <= 12; x++) k.set(x, 3, c.pl);
  // Pages edge + clasp.
  for (let y = 4; y <= 11; y++) k.set(12, y, y % 2 === 0 ? WHITE : c.pl);
  k.set(8, 7, c.a);
  k.set(7, 7, c.a);
  k.set(9, 7, c.a);
  k.set(8, 8, c.a);
  k.set(8, 6, c.a);
}

function bomb(c: C, k: Pix): void {
  k.disc(8, 9, 4.8, c.p);
  // Cap + fuse.
  k.set(7, 3, c.sd);
  k.set(8, 3, c.sd);
  k.set(7, 4, c.sd);
  k.set(8, 4, c.sd);
  k.set(9, 2, c.s);
  k.set(10, 2, c.s);
  k.set(11, 1, c.a);
  k.set(12, 1, c.a);
  k.set(11, 2, c.a);
  // Highlight + band.
  k.set(6, 7, WHITE);
  k.set(7, 7, WHITE);
  k.set(5, 10, c.pd);
}

function star(c: C, k: Pix): void {
  // 4-point sparkle.
  for (let t = 0; t <= 5; t++) {
    k.set(8 + t, 8, t > 2 ? c.ad : c.a);
    k.set(8 - t, 8, t > 2 ? c.ad : c.a);
    k.set(8, 8 + t, t > 2 ? c.ad : c.a);
    k.set(8, 8 - t, t > 2 ? c.ad : c.a);
  }
  k.set(7, 7, WHITE);
  k.set(8, 7, WHITE);
  k.set(7, 8, WHITE);
  k.set(9, 6, c.a);
  k.set(10, 5, c.ad);
  k.set(6, 9, c.a);
  k.set(5, 10, c.ad);
  k.set(10, 10, c.a);
  k.set(11, 11, c.ad);
  k.set(5, 5, c.a);
  k.set(4, 4, c.ad);
}

function coin(c: C, k: Pix): void {
  k.disc(8, 8, 4.8, c.p);
  // Inner ring + stamp.
  for (let t = 0; t < 360; t += 30) {
    const x = Math.round(8 + 3 * Math.cos((t * Math.PI) / 180));
    const y = Math.round(8 + 3 * Math.sin((t * Math.PI) / 180));
    k.set(x, y, c.pd);
  }
  k.set(8, 6, c.a);
  k.set(7, 7, c.a);
  k.set(9, 7, c.a);
  k.set(8, 8, c.a);
  k.set(6, 6, WHITE);
}

const PAINTERS: Record<SpriteTemplate, (c: C, k: Pix) => void> = {
  sword,
  pickaxe,
  axe,
  shovel,
  gem,
  ingot,
  orb,
  potion,
  wand,
  helmet,
  shield,
  book,
  bomb,
  star,
  coin,
};

/** Deterministic palette when the LLM omits/ botches colors. */
export function fallbackPalette(seed: string): Required<SpritePalette> {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const sat = 0.62 + ((h >> 8) % 30) / 100;
  const hex = hslToHex(hue, sat, 0.56);
  return {
    primary: hex,
    secondary: "#7a5230",
    accent: hslToHex((hue + 40) % 360, 0.85, 0.62),
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Paint the sprite and render a crisp 256px PNG (transparent background). */
export async function renderSpritePng(
  template: string | undefined,
  palette: SpritePalette | undefined,
  seed: string
): Promise<Buffer> {
  const tpl: SpriteTemplate = (SPRITE_TEMPLATES as readonly string[]).includes(
    template ?? ""
  )
    ? (template as SpriteTemplate)
    : "gem";
  const fb = fallbackPalette(seed);
  const c = ctxt(
    hexToRgba(palette?.primary, hexToRgba(fb.primary, [0, 0, 0, 255])),
    hexToRgba(palette?.secondary, hexToRgba(fb.secondary, [0, 0, 0, 255])),
    hexToRgba(palette?.accent, hexToRgba(fb.accent, [0, 0, 0, 255]))
  );
  const k = new Pix();
  PAINTERS[tpl](c, k);
  k.outline(c.o);

  const raw = Buffer.alloc(SIZE * SIZE * 4);
  k.data.forEach((px, i) => {
    raw[i * 4] = px[0];
    raw[i * 4 + 1] = px[1];
    raw[i * 4 + 2] = px[2];
    raw[i * 4 + 3] = px[3];
  });
  return sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .resize(256, 256, { kernel: "nearest" })
    .png({ palette: true, colours: 64, compressionLevel: 9 })
    .toBuffer();
}
