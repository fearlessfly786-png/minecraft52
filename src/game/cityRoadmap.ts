/**
 * CITY ROADMAP — the user's reference city map cloned 1:1 into the
 * grassland (see src/game/cityLayout.ts for the plateau rect and
 * src/game/cityRoadmapData.ts for the vectorized network).
 *
 *  - THE PLATEAU: terrainChunks blends a 1536x1024-block rectangle of
 *    dead flat grass into the height field (cityEdgeT skirt) — 153,600 x
 *    102,400 world units (~14 km x ~9.4 km, ~128 km² at the game's own
 *    toM() scale) carrying ONE giant painted base quad (grass + water
 *    between the blocks) — a single draw call.
 *  - THE CUBE ROAD DECK: the whole road map is built from REAL CUBE
 *    BLOCKS — the same 100u voxel cubes as every terrain block, in
 *    THREE different textures: ASPHALT cubes form the road decks (one
 *    block above the ground), ROCK cubes form the kerbed footpaths
 *    (ONE BLOCK HIGHER than the road cubes, like real raised
 *    sidewalks), GRASS cubes fill the roundabout islands — plain,
 *    unmarked decks (no white paint anywhere). Footpath blocks ON the
 *    true walk boundary are CUT into wedge
 *    pieces along the validated edge line (the just-outside blocks gain
 *    the matching fill wedge), so the footpath border reads STRAIGHT
 *    along diagonal roads and smooth around roundabouts. Every
 *    remaining deck corner is SMOOTHED as well — protruding block
 *    corners are MINED off at 45° and notch corners gain a matching
 *    filler wedge — so curved roads, junction mouths and kerb lines
 *    read as clean diagonals instead of 100u stair-steps.
 *    The cube field is sampled from the same block raster the physics
 *    answers from (cityRoadSurface.ts) — what you see is EXACTLY what
 *    you stand on. One merged geometry per material — 3 draw calls.
 *  - THE BAKE: a 3840x2560 canvas (1920x1280 on low-spec) paints, in
 *    order: the GRASS BASE (the real minecraft atlas top tile, so the
 *    quad blends seamlessly with the surrounding biome) and the blue
 *    water rects traced from the reference — everything else on the
 *    map is REAL CUBES (the bake is deliberately light: the deck's
 *    blocks carry all roads/walks now).
 *  - THE TEXTURES: three deterministic 16x16 voxel tiles (grass / rock
 *    / asphalt) are upscaled to one block (100u) and used as repeating
 *    canvas patterns — every road is textured with the asphalt tile,
 *    every footpath with the rock tile.
 *  - ZERO PER-FRAME COST: the whole city is one static mesh; nothing
 *    updates. The atlas image loads asynchronously and re-bakes the
 *    grass base once, so the base is pixel-identical to the terrain.
 */

import * as THREE from 'three';
import {
  CITY_ROUNDABOUTS,
  CITY_WATER,
  CITY_IMG_W,
  CITY_IMG_H,
} from './cityRoadmapData';
import { SMOOTHED_PATHS } from './cityRoadSmooth';
import {
  CITY_BLOCK,
  CITY_GRID,
  CITY_GRID_OFFSET,
  CITY_WX0,
  CITY_WZ0,
  CITY_WW,
  CITY_WD,
  CITY_WCX,
  CITY_WCZ,
  CITY_UPP,
} from './cityLayout';
import {
  CITY_ISLAND_RISE,
  CITY_QUAD_LIFT,
  CITY_ROAD_RISE,
  CITY_WALK_RISE,
  cityRoadClassAt,
  citySurfaceStats,
  cityUserWalkLowAt,
  cityWalkCutAtW,
  type CityRoadClass,
} from './cityRoadSurface';

/* ------------------------------ tuning ---------------------------------- */

/** Bake canvas width in px (height follows the 3:2 map aspect). */
const BAKE_W = 3840;
const BAKE_W_LOWSPEC = 1920;

/** Deterministic PRNG so every boot paints identical tiles. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 * THE THREE 16x16 VOXEL TILES (painted dark — the world's sun +
 * ambient lift ~1.9x, same convention as the terrain atlases)
 * ------------------------------------------------------------------ */

function makeTile(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

function paintNoise(
  ctx: CanvasRenderingContext2D,
  rand: () => number,
  base: [number, number, number],
  jitter: number,
  flecks: Array<{ col: string; n: number }>
): void {
  const [r, g, b] = base;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const j = Math.round((rand() - 0.5) * 2 * jitter);
      ctx.fillStyle = `rgb(${r + j},${g + j},${b + j})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  for (const f of flecks) {
    for (let i = 0; i < f.n; i++) {
      ctx.fillStyle = f.col;
      ctx.fillRect((rand() * 16) | 0, (rand() * 16) | 0, 1, 1);
    }
  }
}

/** ASPHALT — dark speckled road surface. */
function paintAsphalt(ctx: CanvasRenderingContext2D): void {
  const rand = mulberry32(0xc17c0ad >>> 0);
  paintNoise(ctx, rand, [35, 35, 40], 5, [
    { col: '#43434b', n: 12 },
    { col: '#26262c', n: 12 },
    { col: '#4c4c55', n: 4 },
  ]);
}

/** ROCK — minecraft-style cobblestone footpath tile: stone blobs with
 *  darker mortar seams and per-texel shade jitter. */
function paintRock(ctx: CanvasRenderingContext2D): void {
  const rand = mulberry32(0x5c17705 >>> 0);
  // mortar base
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const j = Math.round((rand() - 0.5) * 8);
      ctx.fillStyle = `rgb(${44 + j},${44 + j},${46 + j})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // stones: rounded blobs of 2x2..4x3 with a shade per stone + noise
  const stones: Array<[number, number, number, number]> = [
    [0, 0, 5, 4], [6, 0, 5, 3], [12, 0, 4, 4],
    [0, 5, 4, 4], [5, 4, 6, 5], [12, 5, 4, 3],
    [0, 10, 6, 3], [7, 10, 4, 3], [12, 9, 4, 4],
    [0, 14, 4, 2], [5, 14, 6, 2], [12, 14, 4, 2],
  ];
  for (const [sx, sy, sw, sh] of stones) {
    const shade = 74 + Math.round(rand() * 18);
    for (let y = sy; y < sy + sh; y++) {
      for (let x = sx; x < sx + sw; x++) {
        // rounded corners stay mortar
        const cx = x - sx - (sw - 1) / 2;
        const cy = y - sy - (sh - 1) / 2;
        if (Math.abs(cx) > sw / 2 - 0.7 && Math.abs(cy) > sh / 2 - 0.7) {
          continue;
        }
        const j = Math.round((rand() - 0.5) * 14);
        ctx.fillStyle = `rgb(${shade + j},${shade + j},${shade + 2 + j})`;
        ctx.fillRect(x & 15, y & 15, 1, 1);
      }
    }
    // top-left highlight
    ctx.fillStyle = 'rgba(160,160,164,0.5)';
    ctx.fillRect(sx & 15, sy & 15, Math.min(sw, 3), 1);
  }
}

/** GRASS fallback — close replica of the atlas top tile palette, used
 *  until the real atlas image loads (then the base is re-baked from it
 *  so the blend with the biome is pixel-perfect). */
function paintGrassFallback(ctx: CanvasRenderingContext2D): void {
  const rand = mulberry32(0x6ea55e5 >>> 0);
  const palette = [
    '#507208', '#396202', '#255401', '#496d03',
    '#2a5600', '#224e01', '#5f7e0b', '#396202',
  ];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = palette[(rand() * palette.length) | 0];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** Paint the REAL atlas grass top tile (16x16 top half of the 16x32
 *  atlas the terrain chunks use — pixel-identical ground). */
function paintGrassFromAtlas(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement
): void {
  ctx.clearRect(0, 0, 16, 16);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, 16, 16, 0, 0, 16, 16);
}

/** Nearest-neighbour upscale of a 16x16 tile to `px` (one block). */
function upscaleTile(src: HTMLCanvasElement, px: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, 16, 16, 0, 0, px, px);
  return c;
}

/* ------------------------------------------------------------------ *
 * THE DECK GEOMETRY BUILDER — a minimal world-space accumulator that
 * merges every slab/wall/disc into ONE BufferGeometry per material.
 * Corner orders at the call sites are pre-verified windings: quad()
 * derives its flat normal from (b-a)x(c-a), so callers pass corners
 * counter-clockwise seen from the visible side.
 * ------------------------------------------------------------------ */

class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];
  private v = 0;

  get tris(): number {
    return this.idx.length / 3;
  }

  /** One flat triangle with an explicit normal. */
  tri(
    a: number[],
    ua: number[],
    b: number[],
    ub: number[],
    c: number[],
    uc: number[],
    n: number[]
  ): void {
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) this.nor.push(n[0], n[1], n[2]);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    const v = this.v;
    this.idx.push(v, v + 1, v + 2);
    this.v += 3;
  }

  /** Planar quad a-b-c-d (consistent winding) — emits two triangles
   *  sharing one flat normal. FOUR shared vertices + 6 indices (half
   *  the vertex memory of the naive 6-vertex emit — the doubled city
   *  builds ~4x the cubes of the giant build). */
  quad(
    a: number[],
    ua: number[],
    b: number[],
    ub: number[],
    c: number[],
    uc: number[],
    d: number[],
    ud: number[]
  ): void {
    const e1x = b[0] - a[0];
    const e1y = b[1] - a[1];
    const e1z = b[2] - a[2];
    const e2x = c[0] - a[0];
    const e2y = c[1] - a[1];
    const e2z = c[2] - a[2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    for (let i = 0; i < 4; i++) this.nor.push(nx, ny, nz);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1], ud[0], ud[1]);
    const v = this.v;
    this.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    this.v += 4;
  }

  /** Merged BufferGeometry (or null when nothing was pushed). */
  build(): THREE.BufferGeometry | null {
    if (this.v === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}

/* ------------------------------ types ----------------------------------- */

export interface CityRoadmapHandle {
  /** City centre + quad top Y (debug handle). */
  layout(): { x: number; z: number; topY: number; w: number; d: number };
  /** Surface class under a world point — 0 plain plateau, 1 kerbed
   *  walkway, 2 asphalt deck, 3 roundabout grass island (the same
   *  truth the physics lift in cityRoadSurface.ts answers from). */
  roadClassAt(x: number, z: number): CityRoadClass;
  /** Bake + deck summary (debug handle). */
  stats(): {
    paths: number;
    roundabouts: number;
    canvas: string;
    /** 3D cube deck: merged triangles, cubes, wedges. */
    tris3d: number;
    cubes3d: number;
    cuts3d: number;
    /** 45° corner smoothing: mined tips + added notch wedges. */
    smoothTips: number;
    smoothFills: number;
    deckTiles: number;
    surface: ReturnType<typeof citySurfaceStats>;
  };
  /** Rebuild the deck tiles overlapping a world rect — the footpath
   *  editor calls this right after mutating the class raster. */
  rebuildDeckRegion(
    wx0: number,
    wz0: number,
    wx1: number,
    wz1: number
  ): number;
  dispose(): void;
}

/* ------------------------------ builder --------------------------------- */

export function createCityRoadmap(
  scene: THREE.Scene,
  opts: {
    block: number;
    lowSpec?: boolean;
    /** Top-face Y of the flattened plateau (terrain.cityTopY()). */
    plateauTopY: number;
  }
): CityRoadmapHandle {
  const block = opts.block;
  const bakeW = opts.lowSpec ? BAKE_W_LOWSPEC : BAKE_W;
  const bakeH = Math.round((bakeW * CITY_WD) / CITY_WW);
  const S = bakeW / CITY_WW; // canvas px per world unit
  const tilePx = Math.max(8, Math.round(block * S)); // one block per tile

  /* -------- world <-> canvas helpers -------- */
  // image pixel -> world
  const uppZ = CITY_WD / CITY_IMG_H;
  const iw = (px: number): number => CITY_WX0 + px * CITY_UPP;
  const iz = (py: number): number => CITY_WZ0 + py * uppZ;
  // world -> canvas
  const cx = (wx: number): number => (wx - CITY_WX0) * S;
  const cy = (wz: number): number => (wz - CITY_WZ0) * S;

  /* -------- the grass tile + pattern -------- */
  const [grassTile, grassCtx] = makeTile();
  paintGrassFallback(grassCtx);

  const bake = document.createElement('canvas');
  bake.width = bakeW;
  bake.height = bakeH;
  const ctx = bake.getContext('2d') as CanvasRenderingContext2D;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  let grassPattern: CanvasPattern;

  /* ============================ THE BAKE ============================ */

  function rebake(): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bakeW, bakeH);

    // tile pattern (rebuilt each bake so the grass tile can swap)
    grassPattern = ctx.createPattern(
      upscaleTile(grassTile, tilePx),
      'repeat'
    ) as CanvasPattern;

    // 1 — GRASS BASE (blends with the surrounding biome). The roads
    // and footpaths are REAL 3D CUBES on top of this — the bake only
    // carries the ground between the blocks + the water.
    ctx.fillStyle = grassPattern;
    ctx.fillRect(0, 0, bakeW, bakeH);

    // 2 — WATER rects traced from the reference (drawn last, on top)
    for (const [wxp, wyp, ww, wh] of CITY_WATER) {
      const x0 = cx(iw(wxp));
      const z0 = cy(iz(wyp));
      ctx.fillStyle = '#1d3f7c';
      ctx.fillRect(x0, z0, ww * CITY_UPP * S, wh * uppZ * S);
      ctx.strokeStyle = '#142c56';
      ctx.lineWidth = 4;
      ctx.strokeRect(x0, z0, ww * CITY_UPP * S, wh * uppZ * S);
    }
  }

  /* -------- texture + mesh -------- */
  const texture = new THREE.CanvasTexture(bake);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter; // crisp voxel texels up close
  texture.minFilter = THREE.LinearMipmapLinearFilter; // calm at distance
  texture.generateMipmaps = true;
  texture.anisotropy = 4;

  rebake();
  texture.needsUpdate = true;

  let disposed = false;

  // A plain plane, painted with the same baked texture, mapped to the
  // world (u = +x, v = 1 at the north edge, like PlaneGeometry).
  const quadShape = new THREE.Shape();
  quadShape.moveTo(-CITY_WW / 2, -CITY_WD / 2);
  quadShape.lineTo(-CITY_WW / 2, CITY_WD / 2);
  quadShape.lineTo(CITY_WW / 2, CITY_WD / 2);
  quadShape.lineTo(CITY_WW / 2, -CITY_WD / 2);
  quadShape.closePath();
  const geometry = new THREE.ShapeGeometry(quadShape);
  {
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(
        i,
        (pos.getX(i) + CITY_WW / 2) / CITY_WW,
        (pos.getY(i) + CITY_WD / 2) / CITY_WD
      );
    }
  }
  geometry.rotateX(-Math.PI / 2); // lie flat, facing up (oasis-water convention)
  const material = new THREE.MeshLambertMaterial({ map: texture });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(CITY_WCX, opts.plateauTopY + CITY_QUAD_LIFT, CITY_WCZ);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  scene.add(mesh);

  /* ================== THE CUBE ROAD DECK (real block city) ==================
   * The whole road map is built from REAL CUBE BLOCKS — the same 100u
   * voxel cubes as every terrain block, in THREE different textures:
   *   ASPHALT cubes — the road decks, one block above the ground;
   *   ROCK cubes    — the kerbed footpaths, ONE BLOCK ABOVE the road;
   *   GRASS cubes   — the roundabout islands, at ring level;
   * plain unmarked decks (no white paint anywhere). The cube field is
   * sampled from the same block raster the physics answers from
   * (cityRoadSurface.ts) — what you see is EXACTLY what you stand on.
   * One merged geometry per material — 3 draw calls, zero per-frame
   * cost. */

  const quadBase = opts.plateauTopY + CITY_QUAD_LIFT;
  const roadTop = opts.plateauTopY + CITY_ROAD_RISE;
  const walkTopY = opts.plateauTopY + CITY_WALK_RISE;
  const islandTopY = opts.plateauTopY + CITY_ISLAND_RISE;
  const T3 = CITY_BLOCK; // ONE 16x16 texture per cube face (terrain-style)

  // cube block tiles: the paint tiles + a seam lip so every cube face
  // reads as an individual voxel block (the same aesthetic as terrain)
  const seamify = (c: CanvasRenderingContext2D): void => {
    c.fillStyle = 'rgba(0,0,0,0.38)';
    c.fillRect(15, 0, 1, 16);
    c.fillRect(0, 15, 16, 1);
    c.fillStyle = 'rgba(255,255,255,0.16)';
    c.fillRect(0, 0, 1, 16);
    c.fillRect(0, 0, 16, 1);
  };
  const makeBlockTile = (
    paint: (c: CanvasRenderingContext2D) => void
  ): HTMLCanvasElement => {
    const [tile, tctx] = makeTile();
    paint(tctx);
    seamify(tctx);
    return tile;
  };
  const makeBlockTexture = (tile: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(tile);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    return t;
  };

  const [grass3DTile, grass3DCtx] = makeTile();
  paintGrassFallback(grass3DCtx);
  seamify(grass3DCtx);
  const asphalt3DTex = makeBlockTexture(makeBlockTile(paintAsphalt));
  const rock3DTex = makeBlockTexture(makeBlockTile(paintRock));
  const grass3DTex = makeBlockTexture(grass3DTile);

  // deck geometry accumulators — SWAPPED per tile build (the deck is
  // cut into tiles so an edit rebuilds only the tiles it touched; the
  // push* builders below always write the CURRENT tile's builders)
  let bAsphalt = new GeoBuilder();
  let bWalk = new GeoBuilder();
  let bGrass = new GeoBuilder();

  const uvw = (x: number, z: number): [number, number] => [x / T3, z / T3];
  const uvy = (h: number, y: number): [number, number] => [h / T3, y / T3];

  /** One terrain-style cube: top face + side walls ONLY where the
   *  neighbouring cube is lower or absent (interior faces are skipped;
   *  a wall's bottom sits at the neighbour's top so no two faces are
   *  ever coplanar). nNX/nPX/nNZ/nPZ = neighbour cube tops. */
  const pushCube = (
    b: GeoBuilder,
    x0: number,
    z0: number,
    y1: number,
    nNX: number,
    nPX: number,
    nNZ: number,
    nPZ: number
  ): void => {
    const x1 = x0 + CITY_BLOCK;
    const z1 = z0 + CITY_BLOCK;
    b.quad(
      [x0, y1, z0], uvw(x0, z0),
      [x0, y1, z1], uvw(x0, z1),
      [x1, y1, z1], uvw(x1, z1),
      [x1, y1, z0], uvw(x1, z0)
    );
    if (nNX < y1 - 2) {
      b.quad(
        [x0, y1, z0], uvy(z0, y1),
        [x0, nNX, z0], uvy(z0, nNX),
        [x0, nNX, z1], uvy(z1, nNX),
        [x0, y1, z1], uvy(z1, y1)
      );
    }
    if (nPX < y1 - 2) {
      b.quad(
        [x1, y1, z1], uvy(z1, y1),
        [x1, nPX, z1], uvy(z1, nPX),
        [x1, nPX, z0], uvy(z0, nPX),
        [x1, y1, z0], uvy(z0, y1)
      );
    }
    if (nNZ < y1 - 2) {
      b.quad(
        [x1, y1, z0], uvy(x1, y1),
        [x1, nNZ, z0], uvy(x1, nNZ),
        [x0, nNZ, z0], uvy(x0, nNZ),
        [x0, y1, z0], uvy(x0, y1)
      );
    }
    if (nPZ < y1 - 2) {
      b.quad(
        [x0, y1, z1], uvy(x0, y1),
        [x0, nPZ, z1], uvy(x0, nPZ),
        [x1, nPZ, z1], uvy(x1, nPZ),
        [x1, y1, z1], uvy(x1, y1)
      );
    }
  };

  let roadCubes = 0;
  let walkCubes = 0;
  let islandCubes = 0;
  let cutPieces = 0;
  let smoothTips = 0;
  let smoothFills = 0;

  /** Deck top for a surface class (matches the cube-field heights). */
  const classTopY = (c: number): number =>
    c === 1 ? walkTopY : c === 2 ? roadTop : c === 3 ? islandTopY : quadBase - 5;

  /** Deck top at a LIVE-raster sample point — low-aware for class 1:
   *  a player-painted footpath on plain ground tops ONE BLOCK above
   *  the grass (the road level), not at the traced-walkway height. */
  const sampleTopY = (sx: number, sz: number): number => {
    const c = cityRoadClassAt(sx, sz);
    return c === 1 && cityUserWalkLowAt(sx, sz) ? roadTop : classTopY(c);
  };

  /** Material bucket for a surface class (matches the cube field). */
  const clsBuilder = (c: number): GeoBuilder =>
    c === 1 ? bWalk : c === 3 ? bGrass : bAsphalt;

  /** Deck top at a NEIGHBOUR sample point — the sample sits 6u inside
   *  the neighbour across a shared block edge, so a cut wedge neighbour
   *  answers with its trimmed truth (road/grass beyond the cut line)
   *  and the walls of the surrounding full cubes close flush against
   *  the wedges. Uniform neighbours answer exactly like the old
   *  centre-sample rule. */
  const neighTop = (gx: number, gz: number, sx: number, sz: number): number => {
    if (
      gx < CITY_GRID.gx0 ||
      gx > CITY_GRID.gx1 ||
      gz < CITY_GRID.gz0 ||
      gz > CITY_GRID.gz1
    ) {
      return quadBase - 5;
    }
    return sampleTopY(sx, sz);
  };

  /** One vertical wall quad (top edge t0→t1, flat bottom at yB) with
   *  the winding auto-oriented to face the outward direction (ox,oz) —
   *  generalized to any material builder. */
  const pushOrientedWallB = (
    b: GeoBuilder,
    t0: number[],
    t1: number[],
    yB: number,
    ox: number,
    oz: number,
    u0: number,
    u1: number
  ): void => {
    const b0 = [t0[0], yB, t0[2]];
    const b1 = [t1[0], yB, t1[2]];
    const e1x = t1[0] - t0[0];
    const e1z = t1[2] - t0[2];
    // horizontal normal of the (t0,t1,b1) corner order ∝ (e1z, -e1x)
    if (e1z * ox - e1x * oz >= 0) {
      b.quad(
        t0, uvy(u0, t0[1]),
        t1, uvy(u1, t1[1]),
        b1, uvy(u1, yB),
        b0, uvy(u0, yB)
      );
    } else {
      b.quad(
        t1, uvy(u1, t1[1]),
        t0, uvy(u0, t0[1]),
        b0, uvy(u0, yB),
        b1, uvy(u1, yB)
      );
    }
  };

  /** bWalk-bound convenience wrapper (cut wedge kerbs). */
  const pushOrientedWall = (
    t0: number[],
    t1: number[],
    yB: number,
    ox: number,
    oz: number,
    u0: number,
    u1: number
  ): void => pushOrientedWallB(bWalk, t0, t1, yB, ox, oz, u0, u1);

  /** One vertical wall in an ARBITRARY (45°) plan direction with a
   *  possibly sloped bottom edge (yB0 at the t0 end, yB1 at the t1
   *  end), wound to face the outward direction (ox,oz). Used for the
   *  exposed kerb faces across chamfer chords and notch fills. */
  const pushDiagWall = (
    b: GeoBuilder,
    x0: number,
    z0: number,
    yT0: number,
    yB0: number,
    x1: number,
    z1: number,
    yT1: number,
    yB1: number,
    ox: number,
    oz: number
  ): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const t0 = [x0, yT0, z0];
    const t1 = [x1, yT1, z1];
    const b0 = [x0, yB0, z0];
    const b1 = [x1, yB1, z1];
    const e1x = x1 - x0;
    const e1z = z1 - z0;
    if (e1z * ox - e1x * oz >= 0) {
      b.quad(
        t0, uvy(0, yT0),
        t1, uvy(len, yT1),
        b1, uvy(len, yB1),
        b0, uvy(0, yB0)
      );
    } else {
      b.quad(
        t1, uvy(len, yT1),
        t0, uvy(0, yT0),
        b0, uvy(0, yB0),
        b1, uvy(len, yB1)
      );
    }
  };

  const UP_N = [0, 1, 0];

  /** One CHAMFERED cube — pushCube plus up to four 45° corner cuts
   *  (the "mine the block corner" half of the deck edge smoothing).
   *  Each flagged corner loses its half-block triangle: the top face
   *  becomes a pentagon/hexagon/octagon, the two side walls at that
   *  corner are trimmed in plan, and an exposed diagonal kerb wall
   *  closes the cut down to the neighbour tops (sloped when they
   *  differ). Straight edges never set flags — they stay EXACTLY as
   *  pushCube built them. */
  const pushCubeCh = (
    b: GeoBuilder,
    x0: number,
    z0: number,
    y1: number,
    nNX: number,
    nPX: number,
    nNZ: number,
    nPZ: number,
    chSw: boolean,
    chNw: boolean,
    chNe: boolean,
    chSe: boolean
  ): void => {
    const x1 = x0 + CITY_BLOCK;
    const z1 = z0 + CITY_BLOCK;
    const M = CITY_BLOCK / 2;
    // top polygon (CCW from above; cut corners swapped for chords)
    const pxs: number[] = [];
    const pzs: number[] = [];
    if (chSw) { pxs.push(x0 + M, x0); pzs.push(z0, z0 + M); }
    else { pxs.push(x0); pzs.push(z0); }
    if (chNw) { pxs.push(x0, x0 + M); pzs.push(z1 - M, z1); }
    else { pxs.push(x0); pzs.push(z1); }
    if (chNe) { pxs.push(x1 - M, x1); pzs.push(z1, z1 - M); }
    else { pxs.push(x1); pzs.push(z1); }
    if (chSe) { pxs.push(x1, x1 - M); pzs.push(z0 + M, z0); }
    else { pxs.push(x1); pzs.push(z0); }
    const n = pxs.length;
    for (let i = 1; i < n - 1; i++) {
      b.tri(
        [pxs[0], y1, pzs[0]], uvw(pxs[0], pzs[0]),
        [pxs[i], y1, pzs[i]], uvw(pxs[i], pzs[i]),
        [pxs[i + 1], y1, pzs[i + 1]], uvw(pxs[i + 1], pzs[i + 1]),
        UP_N
      );
    }
    // side walls, trimmed in plan where a chamfer takes the corner
    const wLoZ = chSw ? z0 + M : z0;
    const wHiZ = chNw ? z1 - M : z1;
    if (nNX < y1 - 2 && wHiZ - wLoZ > 0.5) {
      b.quad(
        [x0, y1, wLoZ], uvy(wLoZ, y1),
        [x0, nNX, wLoZ], uvy(wLoZ, nNX),
        [x0, nNX, wHiZ], uvy(wHiZ, nNX),
        [x0, y1, wHiZ], uvy(wHiZ, y1)
      );
    }
    const eLoZ = chSe ? z0 + M : z0;
    const eHiZ = chNe ? z1 - M : z1;
    if (nPX < y1 - 2 && eHiZ - eLoZ > 0.5) {
      b.quad(
        [x1, y1, eHiZ], uvy(eHiZ, y1),
        [x1, nPX, eHiZ], uvy(eHiZ, nPX),
        [x1, nPX, eLoZ], uvy(eLoZ, nPX),
        [x1, y1, eLoZ], uvy(eLoZ, y1)
      );
    }
    const sLoX = chSw ? x0 + M : x0;
    const sHiX = chSe ? x1 - M : x1;
    if (nNZ < y1 - 2 && sHiX - sLoX > 0.5) {
      b.quad(
        [sHiX, y1, z0], uvy(sHiX, y1),
        [sHiX, nNZ, z0], uvy(sHiX, nNZ),
        [sLoX, nNZ, z0], uvy(sLoX, nNZ),
        [sLoX, y1, z0], uvy(sLoX, y1)
      );
    }
    const nLoX = chNw ? x0 + M : x0;
    const nHiX = chNe ? x1 - M : x1;
    if (nPZ < y1 - 2 && nHiX - nLoX > 0.5) {
      b.quad(
        [nLoX, y1, z1], uvy(nLoX, y1),
        [nLoX, nPZ, z1], uvy(nLoX, nPZ),
        [nHiX, nPZ, z1], uvy(nHiX, nPZ),
        [nHiX, y1, z1], uvy(nHiX, y1)
      );
    }
    // diagonal kerb walls across each cut corner
    const D = 0.70710678;
    if (chSw) pushDiagWall(b, x0 + M, z0, y1, nNZ, x0, z0 + M, y1, nNX, -D, -D);
    if (chNw) pushDiagWall(b, x0, z1 - M, y1, nNX, x0 + M, z1, y1, nPZ, -D, D);
    if (chNe) pushDiagWall(b, x1 - M, z1, y1, nPZ, x1, z1 - M, y1, nPX, D, D);
    if (chSe) pushDiagWall(b, x1, z0 + M, y1, nPX, x1 - M, z0, y1, nNZ, D, -D);
  };

  /** One notch FILLER — the "add the block wedge" half of the edge
   *  smoothing: a triangular prism grown into a lower cell's corner
   *  when the three cells around that corner all stand higher, so the
   *  kerb line bridges the corner with one straight 45° chord instead
   *  of a square stair-step notch. Sits flush on this cell's own
   *  surface (myTop); the chord drops to it; the legs close against
   *  the raised neighbours (with a band where one is lower). */
  const pushNotchFill = (
    x0: number,
    z0: number,
    cx: number,
    cz: number,
    fTop: number,
    myTop: number,
    aTop: number,
    bTop: number,
    b: GeoBuilder
  ): void => {
    const px = x0 + cx * CITY_BLOCK;
    const pz = z0 + cz * CITY_BLOCK;
    const sx = cx ? -1 : 1;
    const sz = cz ? -1 : 1;
    const M = CITY_BLOCK / 2;
    const pxx = px + sx * M; // chord end on the z = pz edge
    const pzz = pz + sz * M; // chord end on the x = px edge
    // top triangle (order verified facing UP for all four corners)
    b.tri(
      [px, fTop, pz], uvw(px, pz),
      [px, fTop, pzz], uvw(px, pzz),
      [pxx, fTop, pz], uvw(pxx, pz),
      UP_N
    );
    // exposed kerb face along the chord
    if (fTop > myTop + 2) {
      pushDiagWall(
        b, pxx, pz, fTop, myTop, px, pzz, fTop, myTop,
        sx * 0.70710678, sz * 0.70710678
      );
    }
    // band above a lower raised neighbour across each leg
    if (fTop > bTop + 2) {
      pushOrientedWallB(
        b, [px, fTop, pz], [pxx, fTop, pz], bTop, 0, -sz, px, pxx
      );
    }
    if (fTop > aTop + 2) {
      pushOrientedWallB(
        b, [px, fTop, pz], [px, fTop, pzz], aTop, -sx, 0, pz, pzz
      );
    }
  };

  /** ONE CUT FOOTPATH WEDGE — the user's "cut the footpath block" piece.
   *  A walk cube clipped by its validated boundary half-plane: along a
   *  diagonal road the full cubes stair-step, so every block the true
   *  footpath edge crosses is trimmed (or, just outside it, filled in)
   *  to a wedge whose chord sits ON the boundary line. Consecutive
   *  chords are collinear — the footpath border reads as ONE STRAIGHT
   *  edge. Top = the clipped polygon (world-space UVs, so the cobble
   *  texture continues seamlessly from the neighbouring cubes); walls
   *  along the square edges close against the neighbours; the chord
   *  gets an exposed kerb face down to the surface beyond the edge. */
  const pushCutPiece = (
    cut: [number, number, number],
    wx: number,
    wz: number,
    gx: number,
    gz: number
  ): void => {
    const cnx = cut[0];
    const cnz = cut[1];
    const cd0 = cut[2];
    const top = walkTopY;
    const x1 = wx + CITY_BLOCK;
    const z1 = wz + CITY_BLOCK;
    // block square CCW seen from above (pushCube's top-face order)
    const pxs = [wx, wx, x1, x1];
    const pzs = [wz, z1, z1, wz];
    // Sutherland–Hodgman clip against cnx*x + cnz*z <= cd0
    const poly: number[] = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) & 3;
      const ax = pxs[i];
      const az = pzs[i];
      const bx = pxs[j];
      const bz = pzs[j];
      const sa = cnx * ax + cnz * az - cd0;
      const sb = cnx * bx + cnz * bz - cd0;
      if (sa <= 0) poly.push(ax, az);
      if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
        const t = sa / (sa - sb);
        poly.push(ax + (bx - ax) * t, az + (bz - az) * t);
      }
    }
    const n = poly.length >> 1;
    if (n < 3) return;
    // sliver guard — a fill wedge smaller than ~2% of a block is noise
    let area2 = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area2 += poly[i * 2] * poly[j * 2 + 1] - poly[j * 2] * poly[i * 2 + 1];
    }
    if ((Math.abs(area2) * 0.5) < CITY_BLOCK * CITY_BLOCK * 0.02) return;
    // top face — CCW fan (the clip preserves the winding)
    for (let i = 1; i < n - 1; i++) {
      const ax = poly[0];
      const az = poly[1];
      const bx = poly[i * 2];
      const bz = poly[i * 2 + 1];
      const cx2 = poly[i * 2 + 2];
      const cz2 = poly[i * 2 + 3];
      bWalk.tri(
        [ax, top, az], uvw(ax, az),
        [bx, top, bz], uvw(bx, bz),
        [cx2, top, cz2], uvw(cx2, cz2),
        UP_N
      );
    }
    // walls: the chord = exposed kerb face; square spans = side walls
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = poly[i * 2];
      const az = poly[i * 2 + 1];
      const bx = poly[j * 2];
      const bz = poly[j * 2 + 1];
      if (Math.hypot(bx - ax, bz - az) < 0.5) continue;
      const da = Math.abs(cnx * ax + cnz * az - cd0);
      const db = Math.abs(cnx * bx + cnz * bz - cd0);
      if (da < 0.05 && db < 0.05) {
        // THE KERB FACE along the cut line — drops to whatever lies
        // beyond the footpath edge (grass quad / road deck)
        const mx = (ax + bx) * 0.5 + cnx * 12;
        const mz = (az + bz) * 0.5 + cnz * 12;
        const below = sampleTopY(mx, mz);
        if (below < top - 2) {
          pushOrientedWall(
            [ax, top, az], [bx, top, bz], below, cnx, cnz,
            0, Math.hypot(bx - ax, bz - az)
          );
        }
      } else if (Math.abs(bx - ax) < 0.05) {
        // span along a vertical square edge — neighbour across x
        const onX0 = Math.abs(ax - wx) < 0.05;
        const nT = neighTop(
          onX0 ? gx - 1 : gx + 1,
          gz,
          onX0 ? ax - 6 : ax + 6,
          (az + bz) * 0.5
        );
        if (nT < top - 2) {
          pushOrientedWall(
            [ax, top, az], [bx, top, bz], nT, onX0 ? -1 : 1, 0, az, bz
          );
        }
      } else {
        // span along a horizontal square edge — neighbour across z
        const onZ0 = Math.abs(az - wz) < 0.05;
        const nT = neighTop(
          gx,
          onZ0 ? gz - 1 : gz + 1,
          (ax + bx) * 0.5,
          onZ0 ? az - 6 : az + 6
        );
        if (nT < top - 2) {
          pushOrientedWall(
            [ax, top, az], [bx, top, bz], nT, 0, onZ0 ? -1 : 1, ax, bx
          );
        }
      }
    }
  };

  // — THE CUBE FIELD, TILED. The deck is cut into DECK_TILE²-block
  // tiles; each tile rasterizes its own class grid (one-block apron —
  // the corner smoothing looks one block across tile edges) and emits
  // the same per-block geometry the monolithic build always made:
  // class-heighted cubes, cut WEDGE pieces along the validated
  // footpath edges (straight borders on diagonal roads), 45° corner
  // chamfers and notch fills. Tiling changes nothing visually — but a
  // footpath edit rebuilds ONLY the tiles it touched
  // (rebuildDeckRegion) instead of re-sweeping all 1.5M blocks, which
  // is what makes the minimap path editor feel instant. Neighbour
  // wall heights always probe the LIVE class raster (neighTop →
  // cityRoadClassAt), so a rebuilt tile closes flush against its
  // untouched neighbours. —

  // shared deck materials (created once, used by every tile)
  const asphalt3DMat = new THREE.MeshLambertMaterial({ map: asphalt3DTex });
  const walk3DMat = new THREE.MeshLambertMaterial({ map: rock3DTex });
  const grass3DMat = new THREE.MeshLambertMaterial({ map: grass3DTex });
  const deckMats = [asphalt3DMat, walk3DMat, grass3DMat];
  const deckTexs = [asphalt3DTex, rock3DTex, grass3DTex];

  /** Every live deck mesh across all tiles — dispose iterates this. */
  const deckMeshes = new Set<THREE.Mesh>();
  interface DeckTileStat {
    meshes: THREE.Mesh[];
    road: number;
    walk: number;
    island: number;
    cuts: number;
    tips: number;
    fills: number;
    tris: number;
  }
  const deckTiles = new Map<number, DeckTileStat>();

  const GRID_W = CITY_GRID.gx1 - CITY_GRID.gx0 + 1;
  const GRID_H = CITY_GRID.gz1 - CITY_GRID.gz0 + 1;
  const DECK_TILE = 128;
  const TIL_W = Math.ceil(GRID_W / DECK_TILE);
  const TIL_H = Math.ceil(GRID_H / DECK_TILE);

  /** (Re)build one deck tile: local class raster + the per-block pass,
   *  then swap its three meshes. */
  function buildTile(tx: number, tz: number): void {
    const gx0 = CITY_GRID.gx0 + tx * DECK_TILE;
    const gz0 = CITY_GRID.gz0 + tz * DECK_TILE;
    const gx1 = Math.min(CITY_GRID.gx1, gx0 + DECK_TILE - 1);
    const gz1 = Math.min(CITY_GRID.gz1, gz0 + DECK_TILE - 1);
    // local class raster with a one-block apron (the corner smoothing
    // inspects the 8-neighbourhood, even across the tile edges)
    const AX0 = Math.max(CITY_GRID.gx0, gx0 - 1);
    const AZ0 = Math.max(CITY_GRID.gz0, gz0 - 1);
    const AX1 = Math.min(CITY_GRID.gx1, gx1 + 1);
    const AZ1 = Math.min(CITY_GRID.gz1, gz1 + 1);
    const LW = AX1 - AX0 + 1;
    const clsGrid = new Uint8Array(LW * (AZ1 - AZ0 + 1));
    const lowGrid = new Uint8Array(LW * (AZ1 - AZ0 + 1));
    for (let gz = AZ0; gz <= AZ1; gz++) {
      const row = (gz - AZ0) * LW;
      for (let gx = AX0; gx <= AX1; gx++) {
        const sx = (gx - CITY_GRID_OFFSET) * CITY_BLOCK + CITY_BLOCK / 2;
        const sz = (gz - CITY_GRID_OFFSET) * CITY_BLOCK + CITY_BLOCK / 2;
        clsGrid[row + gx - AX0] = cityRoadClassAt(sx, sz);
        lowGrid[row + gx - AX0] = cityUserWalkLowAt(sx, sz) ? 1 : 0;
      }
    }
    const gridCls = (gx: number, gz: number): number =>
      gx < CITY_GRID.gx0 ||
      gx > CITY_GRID.gx1 ||
      gz < CITY_GRID.gz0 ||
      gz > CITY_GRID.gz1
        ? 0
        : clsGrid[(gz - AZ0) * LW + gx - AX0];
    /** Low-kerb tag of a grid cell (player-painted path on plain
     *  ground — tops one block above the grass). */
    const gridLow = (gx: number, gz: number): boolean =>
      gx >= CITY_GRID.gx0 &&
      gx <= CITY_GRID.gx1 &&
      gz >= CITY_GRID.gz0 &&
      gz <= CITY_GRID.gz1 &&
      lowGrid[(gz - AZ0) * LW + gx - AX0] === 1;
    /** Deck top of a grid cell — low-aware for painted footpaths. */
    const gridTop = (gx: number, gz: number): number => {
      const c = gridCls(gx, gz);
      return c === 1 && gridLow(gx, gz) ? roadTop : classTopY(c);
    };

    const tAsphalt = new GeoBuilder();
    const tWalk = new GeoBuilder();
    const tGrass = new GeoBuilder();
    bAsphalt = tAsphalt;
    bWalk = tWalk;
    bGrass = tGrass;
    let tRoadC = 0;
    let tWalkC = 0;
    let tIslandC = 0;
    let tCuts = 0;
    let tTips = 0;
    let tFills = 0;

    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const wx = (gx - CITY_GRID_OFFSET) * CITY_BLOCK;
        const wz = (gz - CITY_GRID_OFFSET) * CITY_BLOCK;
        const cls = gridCls(gx, gz);
        const cut = cityWalkCutAtW(wx + CITY_BLOCK / 2, wz + CITY_BLOCK / 2);
        if (cls === 0) {
          if (cut) {
            // plain block gaining the footpath wedge that completes the
            // straight edge
            tCuts++;
            pushCutPiece(cut, wx, wz, gx, gz);
            continue;
          }
          // notch fills — grow a wedge into every corner whose three
          // surrounding blocks all stand above this plain block
          for (let c = 0; c < 4; c++) {
            const cx = c & 1;
            const cz = c >> 1;
            const ax = gx + (cx ? 1 : -1);
            const az = gz + (cz ? 1 : -1);
            const aT = gridTop(ax, gz);
            const bT = gridTop(gx, az);
            const dT = gridTop(ax, az);
            const myT = quadBase - 5;
            if (aT > myT + 2 && bT > myT + 2 && dT > myT + 2) {
              const fTop = Math.max(aT, bT, dT);
              tFills++;
              pushNotchFill(
                wx, wz, cx, cz, fTop, myT, aT, bT,
                clsBuilder(
                  aT === fTop
                    ? gridCls(ax, gz)
                    : bT === fTop
                      ? gridCls(gx, az)
                      : gridCls(ax, az)
                )
              );
            }
          }
          continue;
        }
        if (cls === 1 && cut) {
          // kerbed footpath block trimmed to the true edge
          tWalkC++;
          tCuts++;
          pushCutPiece(cut, wx, wz, gx, gz);
          continue;
        }
        const top =
          cls === 1 && gridLow(gx, gz)
            ? roadTop // painted path on plain ground: ONE block up
            : cls === 1
              ? walkTopY
              : cls === 3
                ? islandTopY
                : roadTop;
        const bucket = cls === 1 ? bWalk : cls === 3 ? bGrass : bAsphalt;
        const nNX = neighTop(gx - 1, gz, wx - 6, wz + CITY_BLOCK / 2);
        const nPX = neighTop(gx + 1, gz, wx + CITY_BLOCK + 6, wz + CITY_BLOCK / 2);
        const nNZ = neighTop(gx, gz - 1, wx + CITY_BLOCK / 2, wz - 6);
        const nPZ = neighTop(gx, gz + 1, wx + CITY_BLOCK / 2, wz + CITY_BLOCK + 6);
        // corner smoothing — mine protruding tips, fill notches
        let chSw = false;
        let chNw = false;
        let chNe = false;
        let chSe = false;
        for (let c = 0; c < 4; c++) {
          const cx = c & 1;
          const cz = c >> 1;
          const aT = gridTop(gx + (cx ? 1 : -1), gz);
          const bT = gridTop(gx, gz + (cz ? 1 : -1));
          const dT = gridTop(gx + (cx ? 1 : -1), gz + (cz ? 1 : -1));
          if (top > aT + 2 && top > bT + 2 && top > dT + 2) {
            // TIP — mine this corner off at 45°
            if (cz === 0) {
              if (cx === 0) chSw = true;
              else chSe = true;
            } else {
              if (cx === 0) chNw = true;
              else chNe = true;
            }
            tTips++;
          } else if (aT > top + 2 && bT > top + 2 && dT > top + 2) {
            // NOTCH — add a wedge bridging the raised neighbours
            const aC = gridCls(gx + (cx ? 1 : -1), gz);
            const bC = gridCls(gx, gz + (cz ? 1 : -1));
            const dC = gridCls(gx + (cx ? 1 : -1), gz + (cz ? 1 : -1));
            const fTop = Math.max(aT, bT, dT);
            tFills++;
            pushNotchFill(
              wx, wz, cx, cz, fTop, top, aT, bT,
              clsBuilder(aT === fTop ? aC : bT === fTop ? bC : dC)
            );
          }
        }
        if (chSw || chNw || chNe || chSe) {
          pushCubeCh(bucket, wx, wz, top, nNX, nPX, nNZ, nPZ, chSw, chNw, chNe, chSe);
        } else {
          pushCube(bucket, wx, wz, top, nNX, nPX, nNZ, nPZ);
        }
        if (cls === 1) tWalkC++;
        else if (cls === 3) tIslandC++;
        else tRoadC++;
      }
    }

    // swap the tile's three meshes (dispose the previous ones)
    const key = tz * TIL_W + tx;
    const prev = deckTiles.get(key);
    if (prev) {
      for (const m of prev.meshes) {
        m.removeFromParent();
        m.geometry.dispose();
        deckMeshes.delete(m);
      }
    }
    const meshes: THREE.Mesh[] = [];
    const addTileMesh = (b: GeoBuilder, mat: THREE.Material): void => {
      const geo = b.build();
      if (!geo) return;
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      scene.add(m);
      meshes.push(m);
      deckMeshes.add(m);
    };
    addTileMesh(tWalk, walk3DMat);
    addTileMesh(tAsphalt, asphalt3DMat);
    addTileMesh(tGrass, grass3DMat);
    deckTiles.set(key, {
      meshes,
      road: tRoadC,
      walk: tWalkC,
      island: tIslandC,
      cuts: tCuts,
      tips: tTips,
      fills: tFills,
      tris: tAsphalt.tris + tWalk.tris + tGrass.tris,
    });
  }

  // the initial sweep — every tile, in raster order
  for (let tz = 0; tz < TIL_H; tz++) {
    for (let tx = 0; tx < TIL_W; tx++) {
      buildTile(tx, tz);
    }
  }

  /** Rebuild every deck tile overlapping the world rect (+ one block
   *  of margin so the ±1 corner lookups re-evaluate). The class raster
   *  must already be mutated — this only re-runs the geometry. */
  function rebuildDeckRegion(
    wx0: number,
    wz0: number,
    wx1: number,
    wz1: number
  ): number {
    const loX = Math.min(wx0, wx1);
    const hiX = Math.max(wx0, wx1);
    const loZ = Math.min(wz0, wz1);
    const hiZ = Math.max(wz0, wz1);
    const gxLo = Math.max(
      CITY_GRID.gx0,
      Math.floor(loX / CITY_BLOCK) + CITY_GRID_OFFSET - 1
    );
    const gxHi = Math.min(
      CITY_GRID.gx1,
      Math.ceil(hiX / CITY_BLOCK) + CITY_GRID_OFFSET + 1
    );
    const gzLo = Math.max(
      CITY_GRID.gz0,
      Math.floor(loZ / CITY_BLOCK) + CITY_GRID_OFFSET - 1
    );
    const gzHi = Math.min(
      CITY_GRID.gz1,
      Math.ceil(hiZ / CITY_BLOCK) + CITY_GRID_OFFSET + 1
    );
    if (gxHi < gxLo || gzHi < gzLo) return 0;
    const tx0 = Math.max(0, Math.floor((gxLo - CITY_GRID.gx0) / DECK_TILE));
    const tx1 = Math.min(TIL_W - 1, Math.floor((gxHi - CITY_GRID.gx0) / DECK_TILE));
    const tz0 = Math.max(0, Math.floor((gzLo - CITY_GRID.gz0) / DECK_TILE));
    const tz1 = Math.min(TIL_H - 1, Math.floor((gzHi - CITY_GRID.gz0) / DECK_TILE));
    let n = 0;
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        buildTile(tx, tz);
        n++;
      }
    }
    return n;
  }

  // swap the deck grass + the bake base to the REAL atlas tile once it
  // streams in (pixel-identical ground everywhere)
  const atlasImg = new Image();
  atlasImg.onload = () => {
    if (disposed) return;
    paintGrassFromAtlas(grassCtx, atlasImg);
    paintGrassFromAtlas(grass3DCtx, atlasImg);
    seamify(grass3DCtx);
    grass3DTex.needsUpdate = true;
    rebake();
    texture.needsUpdate = true;
  };
  atlasImg.src = '/textures/minecraft/atlas.png';

  /* -------- handle -------- */
  function layout(): {
    x: number;
    z: number;
    topY: number;
    w: number;
    d: number;
  } {
    return {
      x: CITY_WCX,
      z: CITY_WCZ,
      topY: opts.plateauTopY,
      w: CITY_WW,
      d: CITY_WD,
    };
  }

  function roadClassAt(x: number, z: number): CityRoadClass {
    return cityRoadClassAt(x, z);
  }

  function stats(): {
    paths: number;
    roundabouts: number;
    canvas: string;
    tris3d: number;
    cubes3d: number;
    cuts3d: number;
    smoothTips: number;
    smoothFills: number;
    deckTiles: number;
    surface: ReturnType<typeof citySurfaceStats>;
  } {
    let tris3d = 0;
    let cubes3d = 0;
    let cuts3d = 0;
    let tips = 0;
    let fills = 0;
    for (const t of deckTiles.values()) {
      tris3d += t.tris;
      cubes3d += t.road + t.walk + t.island;
      cuts3d += t.cuts;
      tips += t.tips;
      fills += t.fills;
    }
    return {
      paths: SMOOTHED_PATHS.length,
      roundabouts: CITY_ROUNDABOUTS.length,
      canvas: `${bakeW}x${bakeH}`,
      tris3d,
      cubes3d,
      cuts3d,
      smoothTips: tips,
      smoothFills: fills,
      deckTiles: deckTiles.size,
      surface: citySurfaceStats(),
    };
  }

  function dispose(): void {
    disposed = true;
    mesh.removeFromParent();
    geometry.dispose();
    material.map?.dispose();
    material.dispose();
    for (const m of deckMeshes) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    deckMeshes.clear();
    deckTiles.clear();
    for (const mat of deckMats) mat.dispose();
    for (const t of deckTexs) t.dispose();
  }

  return { layout, roadClassAt, stats, rebuildDeckRegion, dispose };
}
