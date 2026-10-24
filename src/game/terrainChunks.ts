/**
 * Infinite chunked voxel terrain for RATFIRE.
 *
 * The original map was a single 128x128 merged voxel mesh; this module turns
 * the exact same generator into an endless streaming world:
 *
 *  - DETERMINISTIC HEIGHT FIELD: `blockHeight(gx, gz)` reproduces the original
 *    4-octave ImprovedNoise sum per block (quality 2/8/32/128, `*0.15 | 0`)
 *    using a per-session seed. The grid origin keeps its +64 offset, so the
 *    spawn area is IDENTICAL to the old fixed map — the world simply no
 *    longer ends at the old borders.
 *  - CHUNKS: the plane is cut into CHUNK_BLOCKS x CHUNK_BLOCKS block chunks,
 *    each merged into its own mesh (one draw call, frustum-culled). Side
 *    faces are generated from the global height function, so chunk seams are
 *    invisible and the streaming frontier never shows holes.
 *  - STREAMING: `update(playerX, playerZ)` keeps every chunk within
 *    `viewRadius` (Chebyshev distance) of the player loaded, builds missing
 *    ones nearest-first with a per-frame budget (no hitching), and disposes
 *    chunks that fall more than one ring behind — the terrain behind you is
 *    freed as new terrain materialises ahead of you.
 *  - COLLISION: `surfaceYAt(worldX, worldZ)` answers from the deterministic
 *    height function, so walking, gravity, fall damage and the camera work
 *    at any distance from the origin, even over not-yet-meshed ground.
 *  - FLATTEN PADS: decor systems (dungeon caves) can register rectangular
 *    pads that level the terrain inside them to one height — the chunk
 *    meshes overlapping a pad are rebuilt silently so the ground under a
 *    placed prop is perfectly plane.
 */

import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { iceFactor, winterFactor } from './winterBiomes';
import { desertFactor } from './desertBiomes';
import {
  OASIS,
  oasisRingOffset,
  oasisBrimRing,
  oasisRiserFactor,
  oasisMudAt,
} from './oasisTerrain';
import { createMudAtlas } from './oasisTextures';
import { redFactor, mesaFactor, volcanoFactor } from './extraBiomes';
import { cherryFactor, shroomFactor, crimsonFactor, goldenFactor } from './wildBiomes';
import { createIceAtlas, createSnowAtlas } from './winterTextures';
import { createSandAtlas } from './desertTextures';
import {
  createRedSandAtlas,
  createMesaAtlas,
  createBasaltAtlas,
  createLavaAtlas,
  tickLavaTextures,
  releaseLavaTexture,
} from './extraTextures';
import {
  createCherryAtlas,
  createShroomAtlas,
  createCrimsonAtlas,
  createGoldenAtlas,
} from './wildTextures';
import { volcanoSampleAt } from './volcanoTerrain';
import { cityEdgeT, CITY_GRID } from './cityLayout';

/** Zone ids that can be re-skinned by the in-game AI ZONE STUDIO (page.tsx).
 *  One id per terrain material bucket — a zone re-skin swaps that bucket's
 *  atlas texture, which instantly repaints every loaded chunk using it. */
export type ZoneSkinId =
  | 'grass'
  | 'snow'
  | 'ice'
  | 'sand'
  | 'red'
  | 'mesa'
  | 'basalt'
  | 'lava'
  | 'shroom'
  | 'cherry'
  | 'crimson'
  | 'golden';

export const ZONE_SKIN_IDS: ZoneSkinId[] = [
  'grass',
  'snow',
  'ice',
  'sand',
  'red',
  'mesa',
  'basalt',
  'lava',
  'shroom',
  'cherry',
  'crimson',
  'golden',
];

/** Atlas pixel geometry shared by every zone atlas (see desertTextures.ts):
 *  top half = top-face tile, bottom half = side-face tile. */
export const ZONE_ATLAS_TILE = 32;

export interface TerrainChunksOptions {
  /** World units per voxel block edge (100). */
  block: number;
  /** Grid origin offset (64) — keeps spawn-area terrain identical to the
   *  original fixed 128x128 map (world x = (gx - gridOffset) * block). */
  gridOffset: number;
  /** Blocks per chunk side. */
  chunkBlocks?: number;
  /** Loaded-chunk radius around the player, in chunks (Chebyshev distance). */
  viewRadius?: number;
  /** ImprovedNoise z coordinate — the per-session terrain seed. */
  seedZ: number;
  /** Mobile LOW tier: smaller radius + build budget. */
  lowSpec?: boolean;
  /** Optional decor hook: fired right after a chunk mesh is built (used by
   *  the dungeon cave system to stream map props with the terrain). */
  onChunkBuilt?(cx: number, cz: number): void;
  /** Optional decor hook: fired when a chunk mesh is unloaded. */
  onChunkUnloaded?(cx: number, cz: number): void;
}

/** A flat pad of terrain: every block inside the inclusive grid bounds is
 *  levelled to `height` (the dungeon caves use this to give each ruin a
 *  plane, straight patch of ground that smoothly touches its bottom). */
export interface FlattenRect {
  id: string;
  /** Inclusive grid-block bounds of the pad. */
  gx0: number;
  gx1: number;
  gz0: number;
  gz1: number;
  /** Integer blockHeight-grid value the whole pad is levelled to. */
  height: number;
}

export interface TerrainChunksHandle {
  /** Stream around the player: build ahead, unload behind. Call per frame. */
  update(playerX: number, playerZ: number): void;
  /** Immediately (sync=true) or prioritised (sync=false) load the chunks
   *  within `radius` chunks of the point — used for spawn + respawn. */
  ensureAround(playerX: number, playerZ: number, radius: number, sync: boolean): void;
  /** Deterministic integer block height at grid coordinates. */
  blockHeight(gx: number, gz: number): number;
  /** Terrain surface height (top of the block) at a world-space position. */
  surfaceYAt(worldX: number, worldZ: number): number;
  /** World Y of the CITY PLATEAU's walkable surface (top face) — the
   *  datum the giant city road quad is laid against (cityRoadmap.ts). */
  cityTopY(): number;
  /** Loaded chunk count + build-queue length (debug handle). */
  stats(): { chunks: number; pending: number };
  /** Level a pad of terrain flat and silently rebuild the loaded chunk
   *  meshes that overlap it (decor hooks stay silent — pad edits are NOT
   *  streaming events and must not re-trigger prop placement). */
  addFlattenRect(rect: FlattenRect): void;
  /** Remove a pad and silently rebuild its chunks back to natural terrain. */
  removeFlattenRect(id: string): void;
  /** AI ZONE STUDIO: swap a zone's block atlas (top half = top-face tile,
   *  bottom half = side-face tile). `source` may be a loaded image/canvas or
   *  a URL/data-URL (loaded internally). Every loaded chunk of that zone is
   *  repainted instantly — chunks share one material per zone. */
  applyZoneSkin(
    zone: ZoneSkinId,
    source: string | HTMLCanvasElement | HTMLImageElement
  ): Promise<boolean>;
  /** AI ZONE STUDIO: put a zone's original procedural atlas back. */
  restoreZoneSkin(zone: ZoneSkinId): boolean;
  /** AI ZONE STUDIO: draw the zone's CURRENT atlas pixels (any source —
   *  baked file, procedural canvas or a previous AI skin) into `out`,
   *  normalised to 32x64 (top half top-tile, bottom half side-tile). Used
   *  for the studio previews and as the edit-mode source image. */
  getZoneAtlas(zone: ZoneSkinId, out: HTMLCanvasElement): boolean;
  /** AI ZONE STUDIO: draw the zone's ORIGINAL (vanilla) atlas pixels into
   *  `out`, normalised to 32x64 (top half top-tile, bottom half side-tile).
   *  Always the born-with texture — never the currently-worn skin — so
   *  colour skins can composite their side fringe over a clean base. */
  getZoneBaseAtlas(zone: ZoneSkinId, out: HTMLCanvasElement): boolean;
  dispose(): void;
}

/** Height-cache cap: beyond this many memoised blocks the cache resets
 *  (a cache miss is only four ImprovedNoise calls, so this is invisible). */
const HEIGHT_CACHE_CAP = 250_000;

/** Height-cache key: packs the integer grid pair into ONE number
 *  (safe for |gx|,|gz| < 2^20 — a million blocks is 100M world units of
 *  walking, far beyond any session). Number keys cost ~8 bytes vs ~80+
 *  for the old `gx + ',' + gz` string keys, so the same capped cache
 *  holds ~10x more entries per byte of RAM. Hit/miss behavior identical. */
const GRID_KEY_OFFSET = 1 << 20;
const GRID_KEY_STRIDE = 1 << 21;
function gridKey(gx: number, gz: number): number {
  return (gx + GRID_KEY_OFFSET) * GRID_KEY_STRIDE + (gz + GRID_KEY_OFFSET);
}

/** 0..1 smoothstep for an already-normalised t (clamped) — used by the
 *  dune-swell weight to feather the swell in/out without any cliffs. */
function smoothstep01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** Winter-zone material buckets: a block joins the snow mesh once its
 *  winter factor crosses SNOW_THRESH, and the glacier (blue-ice) mesh once
 *  its ice factor crosses ICE_THRESH — both biome fields feather smoothly,
 *  and the wobbled snow line makes the crossings wander organically.
 *  DESERT_THRESH does the same for the dune sea (see desertBiomes.ts);
 *  where sand and snow overlap, sand wins (desert is checked first). */
const SNOW_THRESH = 0.5;
const ICE_THRESH = 0.5;
const DESERT_THRESH = 0.5;
const RED_THRESH = 0.5;
const MESA_THRESH = 0.5;
const VOLCANO_THRESH = 0.5;
const SHROOM_THRESH = 0.5;
const CHERRY_THRESH = 0.5;
const CRIMSON_THRESH = 0.5;
const GOLDEN_THRESH = 0.5;

export function createTerrainChunks(
  scene: THREE.Scene,
  options: TerrainChunksOptions
): TerrainChunksHandle {
  const block = options.block;
  const gridOffset = options.gridOffset;
  const chunkBlocks = options.chunkBlocks ?? 16;
  const viewRadius = Math.max(2, options.viewRadius ?? 6);
  const buildBudget = options.lowSpec ? 1 : 2; // chunk meshes built per frame

  // ---------------- deterministic height field ----------------
  const perlin = new ImprovedNoise();
  const seedZ = options.seedZ;
  const heightCache = new Map<number, number>();

  /** The pure perlin base (original demo octave stack) — the city
   *  plateau levels itself to this at its centre. */
  function baseHeight(gx: number, gz: number): number {
    let h = 0;
    let quality = 2;
    for (let o = 0; o < 4; o++) {
      h += perlin.noise(gx / quality, gz / quality, seedZ) * quality;
      quality *= 4;
    }
    return (h * 0.15) | 0;
  }

  /** Shared floor of the OASIS bowl (see src/game/oasisTerrain.ts),
   *  SUNK BELOW THE GROUND: the LOWEST raw desert height found around
   *  the oasis mouth (64 angles × two sample radii just outside the
   *  brim, plus the centre) minus OASIS.depth. Anchoring the brim to
   *  the lowest surrounding sand — instead of the dune height at the
   *  centre — guarantees every column the oasis touches stands AT or
   *  ABOVE the brim, so the whole bowl always reads as dug into the
   *  desert floor: surrounding dunes rise from its rim, never a raised
   *  platform edge. Each sample runs the exact ops naturalHeight runs
   *  for a desert column (base perlin + golden dune swell at its desert
   *  weight); the oasis core is deep inside the dune sea, so no other
   *  biome swell can reach the samples. Computed lazily once, then
   *  cached — fully deterministic like the rest. */
  let oasisFloorDatumCache: number | null = null;
  function oasisFloorDatum(): number {
    if (oasisFloorDatumCache === null) {
      let low = Infinity;
      const sample = (gx: number, gz: number) => {
        const w =
          smoothstep01((desertFactor(gx, gz) - DESERT_THRESH) / 0.25);
        let h = baseHeight(gx, gz);
        if (w > 0) {
          h +=
            (perlin.noise(gx / 56, gz / 56, seedZ + 37.31) * 5.5 +
              perlin.noise(gx / 21, gz / 21, seedZ + 91.17) * 1.5) *
            w;
        }
        if (h < low) low = h;
      };
      sample(OASIS.cx, OASIS.cz);
      for (let a = 0; a < 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        for (const rr of [OASIS.outerR + 1, OASIS.outerR + 4]) {
          sample(
            Math.round(OASIS.cx + Math.cos(ang) * rr),
            Math.round(OASIS.cz + Math.sin(ang) * rr)
          );
        }
      }
      oasisFloorDatumCache = Math.round(low) - OASIS.depth;
    }
    return oasisFloorDatumCache;
  }

  /** CITY PLATEAU datum — the base perlin height at the city's centre
 *  column, lazily computed once and cached. The whole city rectangle
 *  levels to this constant (like the oasis rings level to their shared
 *  datum), so the giant road quad always sits flush on the ground no
 *  matter what the session seed rolled for that patch of grassland. */
  let cityPlateauCache: number | null = null;
  function cityPlateauY(): number {
    if (cityPlateauCache === null) {
      cityPlateauCache = baseHeight(CITY_GRID.cxgx, CITY_GRID.cxgz);
    }
    return cityPlateauCache;
  }

  /** The FULL natural height (base + every biome swell, city excluded)
   *  — shared with the city builder so neighbour-dependent structures
   *  (palm crowns, river banks) agree with the terrain exactly. */
  function naturalHeight(gx: number, gz: number): number {
    let height = baseHeight(gx, gz);

    // CLIMATE SWELLS: inside the hot/wild biomes the base terrain rises
    // into its signature landforms — golden dunes (broad swell), red
    // dunes (same language, own salts), terraced MESA plateaus (the
    // swell is quantised to 3-block steps so the striped strata walls
    // read like layered canyon rock) and jagged VOLCANO rock (two
    // higher-frequency octaves, rough black terrain). The TEMPERATE wild
    // biomes get their own gentler signatures: CHERRY GROVE rolls soft
    // hills and MUSHROOM FIELDS lumps small frequent hillocks.
    // Ownership follows the bucket priority: red/mesa (hard landmarks)
    // outrank the wild biomes, the wild biomes outrank the golden dune
    // sea, the glacier owns everything. Each swell feathers to zero
    // across its soft border ring and is deterministic like everything
    // else here, so collision, decor placement, the minimap and the
    // meshes agree.
    const ifc = iceFactor(gx, gz);
    const iceKill =
      ifc > ICE_THRESH ? 1 - smoothstep01((ifc - ICE_THRESH) / 0.25) : 1;

    // HARD hot-climate swell weights (red dunes, mesa terraces) — these
    // landmarks outrank the temperate wild biomes, whose swells fade
    // under them (the bucket chain gives red/mesa the ground there too).
    const rf = redFactor(gx, gz);
    const rfW =
      rf > RED_THRESH ? smoothstep01((rf - RED_THRESH) / 0.25) * iceKill : 0;
    const mf = mesaFactor(gx, gz);
    const mfW =
      mf > MESA_THRESH ? smoothstep01((mf - MESA_THRESH) / 0.25) * iceKill : 0;
    const hotHardW = Math.max(rfW, mfW);

    // TEMPERATE WILD SWELLS — soft rolling hills (cherry), lumpy
    // hillocks (mushroom) and long low swells (crimson). Weighted in by
    // their biome factor like every biome, full on the cores, feathering
    // to zero across the soft border ring. They outrank the golden dune
    // sea's swell (wild beats sand in the bucket chain — a wild country
    // overlapping a natural desert reads as an oasis pocket) and yield
    // to the hard hot landmarks + the glacier (hotHardW / iceKill).
    const wildBase = (1 - hotHardW) * iceKill;
    let wildW = 0;

    const cf = cherryFactor(gx, gz);
    if (cf > CHERRY_THRESH && wildBase > 0) {
      const w = smoothstep01((cf - CHERRY_THRESH) / 0.25) * wildBase;
      if (w > wildW) wildW = w;
      if (w > 0) {
        // soft rolling hills — broad and gentle, no mid-frequency bite
        const broad = perlin.noise(gx / 70, gz / 70, seedZ + 411.3) * 3.5;
        const mid = perlin.noise(gx / 26, gz / 26, seedZ + 431.7) * 1.2;
        height += Math.round((broad + mid) * w);
      }
    }

    const sf = shroomFactor(gx, gz);
    if (sf > SHROOM_THRESH && wildBase > 0) {
      const w = smoothstep01((sf - SHROOM_THRESH) / 0.25) * wildBase;
      if (w > wildW) wildW = w;
      if (w > 0) {
        // lumpy hillocks: small, frequent bumps (short wavelengths)
        const broad = perlin.noise(gx / 34, gz / 34, seedZ + 451.9) * 2.2;
        const mid = perlin.noise(gx / 13, gz / 13, seedZ + 471.1) * 1.4;
        height += Math.round((broad + mid) * w);
      }
    }

    const crf = crimsonFactor(gx, gz);
    if (crf > CRIMSON_THRESH && wildBase > 0) {
      const w = smoothstep01((crf - CRIMSON_THRESH) / 0.25) * wildBase;
      if (w > wildW) wildW = w;
      if (w > 0) {
        // long low swells: the broadest wavelength of the wild trio,
        // a slow red ocean-moor roll (own perlin salts)
        const broad = perlin.noise(gx / 90, gz / 90, seedZ + 491.3) * 3.2;
        const mid = perlin.noise(gx / 21, gz / 21, seedZ + 511.7) * 0.9;
        height += Math.round((broad + mid) * w);
      }
    }

    // strongest remaining hot swell weight — the wild swells above fade
    // the golden dune sea's broad swell out (wild > sand in the bucket
    // chain), so overlap seams never stack two conflicting landforms
    // into one column. Red/mesa swells below stay FULL: they outrank the
    // wild biomes and own their ground wherever they reach.
    const df = desertFactor(gx, gz);
    if (df > DESERT_THRESH) {
      const w =
        smoothstep01((df - DESERT_THRESH) / 0.25) * iceKill * (1 - wildW);
      if (w > 0) {
        const broad = perlin.noise(gx / 56, gz / 56, seedZ + 37.31) * 5.5;
        const mid = perlin.noise(gx / 21, gz / 21, seedZ + 91.17) * 1.5;
        height += Math.round((broad + mid) * w);
      }
    }

    // OASIS POOL BOWL — the due-north dune sea carries one engineered
    // circular basin (see src/game/oasisTerrain.ts): a flat brim ring
    // at the old dune datum, then 5 terraced rings stepping down one
    // 3-block cliff per ring to a small round bottom pan — and the
    // whole bowl is FILLED TO THE BRIM with turquoise water (see
    // src/game/oasisWater.ts). Every column inside the mouth takes its
    // ring's SHARED CONSTANT level (oasisRingOffset): no noise, no
    // min-guard — interior dune troughs are filled and crests cut so
    // each terrace is perfectly flat and exactly circular. That is
    // what lets the pool's waterline meet every wall in an exact
    // circle with zero leaks; the brim ring stays dry as the shore
    // walkway. Ring boundaries seal as clean 3-block cliffs via the
    // wall-fill below (mesa-terrace style).
    const ringOff = oasisRingOffset(gx, gz);
    if (ringOff !== null) {
      height = Math.round(oasisFloorDatum() + ringOff);
    }

    if (rfW > 0) {
      const broad = perlin.noise(gx / 48, gz / 48, seedZ + 143.77) * 5.0;
      const mid = perlin.noise(gx / 19, gz / 19, seedZ + 167.29) * 1.5;
      height += Math.round((broad + mid) * rfW);
    }

    if (mfW > 0) {
      const broad = perlin.noise(gx / 64, gz / 64, seedZ + 211.7) * 7.0;
      const mid = perlin.noise(gx / 23, gz / 23, seedZ + 263.9) * 2.0;
      // quantise to 3-block terraces: flat-topped buttes with steep
      // striped strata walls (the wall-fill stacks the side faces)
      height += Math.round(((broad + mid) * mfW) / 3) * 3;
    }

    // VOLCANO CONES: every volcano zone raises a real stratovolcano (see
    // src/game/volcanoTerrain.ts) — the sample is taken against the base
    // height so the caldera lava pool can be set as a flat molten surface
    // relative to the ground the cone grows from
    const baseH = height; // pre-volcano datum (base perlin + dune/mesa swells)
    const vc = volcanoSampleAt(gx, gz);
    const vf = volcanoFactor(gx, gz);
    if (vf > VOLCANO_THRESH) {
      const w = smoothstep01((vf - VOLCANO_THRESH) / 0.25) * iceKill;
      if (w > 0) {
        const jaggedMask = 1 - 0.75 * vc.mask; // the cone smooths the rock
        const jagged =
          (perlin.noise(gx / 30, gz / 30, seedZ + 317.41) * 4.5 +
            perlin.noise(gx / 11, gz / 11, seedZ + 373.13) * 1.8) *
          jaggedMask;
        height += Math.round(jagged * w);
      }
    }
    if (vc.add > 0 && iceKill > 0) {
      // the stratovolcano flank + caldera bowl (concave profile, jagged
      // rim, ~28 blocks of mountain — see volcanoTerrain.ts)
      height += Math.round(vc.add * iceKill);
    }
    if (
      vc.hasPool &&
      vc.lava > 0.55 &&
      iceKill > 0.5 &&
      vf > VOLCANO_THRESH
    ) {
      // the caldera lava lake: a flat molten surface a touch below the
      // local bowl (the surrounding ring walls rise from it naturally)
      height = Math.round(baseH + vc.lavaDatum * iceKill);
    }

    // OASIS MOUNTAIN RISER — outside the mouth the surrounding dunes
    // used to stand at whatever raw height the perlin field gave them,
    // so tall dunes slammed straight against the grass ring like one
    // wall (the user's complaint). The riser re-anchors the profile:
    // every column beyond the brim blends from the BRIM's exact level
    // at the rim (oasisFloorDatum + depth — the same constant the
    // ring-0 carve rides, so the joint is flush with zero step) up to
    // its full natural height across OASIS.riserR blocks. The
    // mountains now START at the oasis and climb smoothly outward.
    // Mouth columns (ringOff !== null) are the engineered carve and
    // never touched; volcano country is skipped wholesale so a cone
    // can never be half-dissolved by the blend.
    const riserT = oasisRiserFactor(gx, gz);
    if (riserT < 1 && ringOff === null && vf <= VOLCANO_THRESH) {
      const brim = oasisFloorDatum() + OASIS.depth;
      height = Math.round(brim + (height - brim) * riserT);
    }

    // CITY PLATEAU — the big road-map city (see src/game/cityLayout.ts)
    // levels a 1536x1024-block grassland rectangle to ONE shared constant
    // (the base height at its centre), with a 7-block smoothstep skirt
    // blending back into the natural terrain. The blend owns the FINAL
    // word on height (after every biome swell, the oasis and the
    // volcano) — a paved city reads as engineered ground that overrides
    // whatever nature rolled underneath it. Deterministic + integer
    // like every other answer in this field, so the height cache, the
    // collision, the decor placement and the minimap all agree.
    const cityT = cityEdgeT(gx, gz);
    if (cityT < 1) {
      const cy = cityPlateauY();
      height = Math.round(cy + (height - cy) * cityT);
    }

    return height;
  }

  /** World Y of the CITY PLATEAU's walkable surface (top face of the
   *  flat block) — the datum the city road quad is laid against. */
  function cityTopY(): number {
    return cityPlateauY() * block + block / 2;
  }

  function blockHeight(gx: number, gz: number): number {
    // flatten pads are answered BEFORE the cache: padded blocks never enter
    // the cache, so adding/removing a pad can never leave stale entries
    for (const rect of flattenRects.values()) {
      if (gx >= rect.gx0 && gx <= rect.gx1 && gz >= rect.gz0 && gz <= rect.gz1) {
        return rect.height;
      }
    }

    const key = gridKey(gx, gz);
    const cached = heightCache.get(key);
    if (cached !== undefined) return cached;

    // natural terrain (base perlin + every biome swell)
    const height = naturalHeight(gx, gz);

    if (heightCache.size > HEIGHT_CACHE_CAP) heightCache.clear();
    heightCache.set(key, height);
    return height;
  }

  /** Terrain surface height (top of the block) at a world-space position. */
  function surfaceYAt(worldX: number, worldZ: number): number {
    const gx = Math.round(worldX / block) + gridOffset;
    const gz = Math.round(worldZ / block) + gridOffset;
    return blockHeight(gx, gz) * block + block / 2;
  }

  /** World Y of the OASIS bottom pan's walkable surface (the top face
   *  of the floor block) — the datum the pool's waterline is measured
   *  from (see src/game/oasisWater.ts; lazily builds the shared floor
   *  datum exactly like the carve does). */
  function oasisFloorY(): number {
    return oasisFloorDatum() * block + block / 2;
  }

  // ---------------- shared voxel face prototypes ----------------
  // Same geometry + UV tweaks as the original demo (atlas-mapped textures).
  const matrix = new THREE.Matrix4();
  // second matrix for the stacked wall-fill faces below (the shared
  // `matrix` must stay untouched while one block's faces are emitted)
  const wallMatrix = new THREE.Matrix4();

  const pxGeometry = new THREE.PlaneGeometry(block, block);
  pxGeometry.attributes.uv.array[1] = 0.5;
  pxGeometry.attributes.uv.array[3] = 0.5;
  pxGeometry.rotateY(Math.PI / 2);
  pxGeometry.translate(block / 2, 0, 0);

  const nxGeometry = new THREE.PlaneGeometry(block, block);
  nxGeometry.attributes.uv.array[1] = 0.5;
  nxGeometry.attributes.uv.array[3] = 0.5;
  nxGeometry.rotateY(-Math.PI / 2);
  nxGeometry.translate(-block / 2, 0, 0);

  const pyGeometry = new THREE.PlaneGeometry(block, block);
  pyGeometry.attributes.uv.array[5] = 0.5;
  pyGeometry.attributes.uv.array[7] = 0.5;
  pyGeometry.rotateX(-Math.PI / 2);
  pyGeometry.translate(0, block / 2, 0);

  const pzGeometry = new THREE.PlaneGeometry(block, block);
  pzGeometry.attributes.uv.array[1] = 0.5;
  pzGeometry.attributes.uv.array[3] = 0.5;
  pzGeometry.translate(0, 0, block / 2);

  const nzGeometry = new THREE.PlaneGeometry(block, block);
  nzGeometry.attributes.uv.array[1] = 0.5;
  nzGeometry.attributes.uv.array[3] = 0.5;
  nzGeometry.rotateY(Math.PI);
  nzGeometry.translate(0, 0, -block / 2);

  const texture = new THREE.TextureLoader().load(
    '/textures/minecraft/atlas.png'
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;

  const material = new THREE.MeshLambertMaterial({
    map: texture,
    side: THREE.DoubleSide,
  });

  // winter biomes share every vertex prototype with the grass world but
  // sample their own pixel-art atlases (snow cap + dirt-with-snow-fringe,
  // cracked blue glacier ice) — see src/game/winterTextures.ts
  const snowMaterial = new THREE.MeshLambertMaterial({
    map: createSnowAtlas(),
    side: THREE.DoubleSide,
  });
  const iceMaterial = new THREE.MeshLambertMaterial({
    map: createIceAtlas(),
    side: THREE.DoubleSide,
  });

  // desert biomes share every vertex prototype too — they sample a
  // procedural pixel-art sand atlas (windswept sand top + layered
  // sandstone side with a loose fringe), see src/game/desertTextures.ts
  const sandMaterial = new THREE.MeshLambertMaterial({
    map: createSandAtlas(),
    side: THREE.DoubleSide,
  });
  // final reference calibration: the hot daylight pushes the warm sand
  // texture a touch too orange, so the whole sand mesh is cooled ~7% in
  // linear light (R cut hardest) — landing the screen tone on the soft
  // khaki-tan of the user's reference desert instead of vivid orange
  sandMaterial.color.setRGB(0.93, 0.97, 1.0);

  // OASIS MUD: packed-mud blocks mixed into the grass collar beyond the
  // pure-grass brim — procedural pixel-art atlas (packed-mud top + damp
  // mud side, palette matched to the user's reference texture), see
  // src/game/oasisTextures.ts. Same top-half/bottom-half UV scheme as
  // every other biome atlas.
  const mudMaterial = new THREE.MeshLambertMaterial({
    map: createMudAtlas(),
    side: THREE.DoubleSide,
  });

  // RED DESERT: rust-red Mars-like dunes — own red sand atlas, same
  // UV scheme, neutral tint (palette painted final)
  const redMaterial = new THREE.MeshLambertMaterial({
    map: createRedSandAtlas(),
    side: THREE.DoubleSide,
  });

  // BADLANDS: baked terracotta cap + ONE full sedimentary strata cycle
  // on the side tile — stacked wall-fill faces read as striped canyon
  // rock (see the mesa terrace swell in blockHeight)
  const mesaMaterial = new THREE.MeshLambertMaterial({
    map: createMesaAtlas(),
    side: THREE.DoubleSide,
  });

  // VOLCANO: near-black columnar basalt with lava cracks — the atlas
  // doubles as the emissive map, so the bright crack pixels GLOW orange
  // out of the dark rock while the black body stays matte
  const basaltMaterial = new THREE.MeshLambertMaterial({
    map: createBasaltAtlas(),
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: null, // wired to the same atlas right below
    emissiveIntensity: 0.9,
  });
  basaltMaterial.emissiveMap = basaltMaterial.map;
  basaltMaterial.needsUpdate = true;

  // VOLCANO LAVA: the caldera lake + flank flows — vanilla lava is
  // FULLBRIGHT (light level 15), so it renders UNLIT (MeshBasic): the
  // animated modern molten canvas (extraTextures.ts) shows its exact
  // painted colours day and night, and no scene light can wash it out
  const lavaMaterial = new THREE.MeshBasicMaterial({
    map: createLavaAtlas(),
    side: THREE.DoubleSide,
  });

  // TEMPERATE WILD BIOMES: share every vertex prototype too — each
  // samples the REAL grassland atlas with only its green pixels
  // recoloured, Minecraft-biome-tint style (see wildTextures.ts).
  // CHERRY: the grass tile hue-swapped to blossom pink;
  // SHROOM: the grass tile hue-swapped to lavender mycelium;
  // CRIMSON: the grass tile hue-swapped to crimson reds;
  // GOLDEN: the grass tile hue-swapped to golden yellows.
  const cherryMaterial = new THREE.MeshLambertMaterial({
    map: createCherryAtlas(),
    side: THREE.DoubleSide,
  });
  const shroomMaterial = new THREE.MeshLambertMaterial({
    map: createShroomAtlas(),
    side: THREE.DoubleSide,
  });
  const crimsonMaterial = new THREE.MeshLambertMaterial({
    map: createCrimsonAtlas(),
    side: THREE.DoubleSide,
  });
  const goldenMaterial = new THREE.MeshLambertMaterial({
    map: createGoldenAtlas(),
    side: THREE.DoubleSide,
  });

  // ---------------- zone re-skin registry (AI ZONE STUDIO) -------------
  // Every skinnable bucket with the atlas it was born with: applying a
  // studio skin swaps `mat.map` (and the emissive map for the volcano
  // zones, which glow through their atlas) and remembers the swap so it
  // can be disposed on restore/teardown. Chunk meshes share these
  // materials, so one map swap repaints the whole zone instantly —
  // already-streamed chunks included, no rebuilds.
  const zoneSkins = new Map<
    ZoneSkinId,
    {
      mat: THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;
      original: THREE.Texture;
      override: THREE.Texture | null;
    }
  >();
  function registerZoneSkin(
    zone: ZoneSkinId,
    mat: THREE.MeshLambertMaterial | THREE.MeshBasicMaterial
  ): void {
    if (mat.map) zoneSkins.set(zone, { mat, original: mat.map, override: null });
  }
  registerZoneSkin('grass', material);
  registerZoneSkin('snow', snowMaterial);
  registerZoneSkin('ice', iceMaterial);
  registerZoneSkin('sand', sandMaterial);
  registerZoneSkin('red', redMaterial);
  registerZoneSkin('mesa', mesaMaterial);
  registerZoneSkin('basalt', basaltMaterial);
  registerZoneSkin('lava', lavaMaterial);
  registerZoneSkin('cherry', cherryMaterial);
  registerZoneSkin('shroom', shroomMaterial);
  registerZoneSkin('crimson', crimsonMaterial);
  registerZoneSkin('golden', goldenMaterial);

  // ---------------- chunk store ----------------
  interface Chunk {
    cx: number;
    cz: number;
    /** 1-13 merged meshes: grass + oasis mud + (winter chunks) snow +
     *  glacier ice + (desert chunks) sand + mesa sandstone + (extra
     *  biomes) red sand / mesa / basalt / caldera lava + (wild biomes)
     *  mycelium / blossom. */
    meshes: THREE.Mesh[];
  }
  const chunks = new Map<string, Chunk>();

  function chunkKey(cx: number, cz: number): string {
    return cx + ',' + cz;
  }

  /** Builds one chunk mesh (merged voxel faces) and adds it to the scene. */
  function buildChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (chunks.has(key)) return;

    const baseX = cx * chunkBlocks;
    const baseZ = cz * chunkBlocks;
    // biome buckets: every block lands in exactly one material group so a
    // winter chunk becomes 2-3 merged meshes (grass / snow / glacier) and
    // a desert chunk adds its own sand mesh — ice keeps priority over both
    // (a glacier heart never melts into sand), then desert beats snow so
    // the dune sea stays sandy wherever the two climates ever touch.
    const grassParts: THREE.BufferGeometry[] = [];
    const mudParts: THREE.BufferGeometry[] = [];
    const snowParts: THREE.BufferGeometry[] = [];
    const iceParts: THREE.BufferGeometry[] = [];
    const sandParts: THREE.BufferGeometry[] = [];
    const redParts: THREE.BufferGeometry[] = [];
    const mesaParts: THREE.BufferGeometry[] = [];
    const volcanoParts: THREE.BufferGeometry[] = [];
    const lavaParts: THREE.BufferGeometry[] = [];
    const shroomParts: THREE.BufferGeometry[] = [];
    const cherryParts: THREE.BufferGeometry[] = [];
    const crimsonParts: THREE.BufferGeometry[] = [];
    const goldenParts: THREE.BufferGeometry[] = [];

    for ( let lz = 0; lz < chunkBlocks; lz++ ) {
      for ( let lx = 0; lx < chunkBlocks; lx++ ) {
        const gx = baseX + lx;
        const gz = baseZ + lz;
        const h = blockHeight(gx, gz);

        matrix.makeTranslation(
          (gx - gridOffset) * block,
          h * block,
          (gz - gridOffset) * block
        );

        // neighbour heights come from the global function, so faces at
        // chunk borders match the adjacent chunk exactly (no seams; the
        // wall-fill below is symmetric in the global height field, so
        // 2+ steps are sealed identically from either side of a border)
        const px = blockHeight(gx + 1, gz);
        const nx = blockHeight(gx - 1, gz);
        const pz = blockHeight(gx, gz + 1);
        const nz = blockHeight(gx, gz - 1);

        // biome: glacier core -> caldera lava -> volcano ash -> mesa
        // country -> red dune sea ->
        // mushroom field -> crimson field -> golden field -> cherry grove
        // -> golden dune
        // sea -> snow field
        // -> normal grass, feathered by the wobbled climate fields (see
        // winterBiomes.ts + desertBiomes.ts +
        // extraBiomes.ts + wildBiomes.ts + volcanoTerrain.ts)
        const bucket =
          // CITY GRASS OVERRIDE: the whole city plateau (core + skirt)
          // reads as plain grassland no matter what biome rolls
          // underneath — the doubled rect sits in open procedural
          // country where natural snow/desert/red countries can reach,
          // and a sand or snow patch on the flat city ground would
          // look like a glitch. Leads the chain with the oasis collar.
          cityEdgeT(gx, gz) < 1
            ? grassParts
            : // OASIS GRASS COLLAR: the oasis's outer six-block circular
          // shore ring PLUS the rough meadow beyond it (wobbling edge
          // + scattered merge patches dissolving into the desert) —
          // all of it carries BOTH grass textures — green grass top +
          // grass sides on every exposed wall — per the user's
          // requests, while the bowl interior (every submerged terrace
          // + the pan) stays sand (see oasisTerrain.ts oasisBrimRing).
          // Per the latest request the meadow's grass blocks are MIXED
          // with PACKED-MUD blocks (oasisMudAt: a per-block sprinkle —
          // every mud block stands in the grass, ~4-5 grass blocks
          // between them on average, starting beyond the pure-grass
          // brim rings — never solid clumps).
          // The override leads the chain so the collar always wins
          // inside its own footprint.
          oasisBrimRing(gx, gz)
            ? oasisMudAt(gx, gz)
              ? mudParts
              : grassParts
            : iceFactor(gx, gz) > ICE_THRESH
          ? iceParts
          : iceFactor(gx, gz) > ICE_THRESH
          ? iceParts
          : volcanoSampleAt(gx, gz).lava > 0.55
            ? lavaParts
            : volcanoFactor(gx, gz) > VOLCANO_THRESH
              ? volcanoParts
              : mesaFactor(gx, gz) > MESA_THRESH
                ? mesaParts
                : redFactor(gx, gz) > RED_THRESH
                  ? redParts
                  : shroomFactor(gx, gz) > SHROOM_THRESH
                    ? shroomParts
                    : crimsonFactor(gx, gz) > CRIMSON_THRESH
                      ? crimsonParts
                      : goldenFactor(gx, gz) > GOLDEN_THRESH
                        ? goldenParts
                        : cherryFactor(gx, gz) > CHERRY_THRESH
                          ? cherryParts
                          : desertFactor(gx, gz) > DESERT_THRESH
                            ? sandParts
                            : winterFactor(gx, gz) > SNOW_THRESH
                              ? snowParts
                              : grassParts;

        bucket.push(pyGeometry.clone().applyMatrix4(matrix));

        // SIDE FACES + WALL FILL. The original demo draws one 1-block side
        // face per side, which seals the 1-step cases perfectly — but where
        // the height jumps by 2+ between neighbouring columns the wall
        // between the two tops is 2+ blocks tall while only its topmost
        // face existed, leaving a 1-block-tall SEE-THROUGH SLIT mid-wall
        // (the "missing blocks" the dune country showed: the swell
        // regularly terraces by 2-3 blocks). The LOWER column now stacks
        // extra faces up towards its higher neighbour (levels h+1..hn-1),
        // the higher column still draws its own face (level hn) — every
        // wall is then tiled exactly once: no holes, no z-fighting.
        if (px !== h && px !== h + 1) {
          const basePx = pxGeometry.clone().applyMatrix4(matrix);
          bucket.push(basePx);
          for (let k = h + 1; k < px; k++) {
            wallMatrix.makeTranslation(
              (gx - gridOffset) * block,
              k * block,
              (gz - gridOffset) * block
            );
            const fillPx = pxGeometry.clone().applyMatrix4(wallMatrix);
            bucket.push(fillPx);
          }
        }
        if (nx !== h && nx !== h + 1) {
          const baseNx = nxGeometry.clone().applyMatrix4(matrix);
          bucket.push(baseNx);
          for (let k = h + 1; k < nx; k++) {
            wallMatrix.makeTranslation(
              (gx - gridOffset) * block,
              k * block,
              (gz - gridOffset) * block
            );
            const fillNx = nxGeometry.clone().applyMatrix4(wallMatrix);
            bucket.push(fillNx);
          }
        }
        if (pz !== h && pz !== h + 1) {
          const basePz = pzGeometry.clone().applyMatrix4(matrix);
          bucket.push(basePz);
          for (let k = h + 1; k < pz; k++) {
            wallMatrix.makeTranslation(
              (gx - gridOffset) * block,
              k * block,
              (gz - gridOffset) * block
            );
            const fillPz = pzGeometry.clone().applyMatrix4(wallMatrix);
            bucket.push(fillPz);
          }
        }
        if (nz !== h && nz !== h + 1) {
          const baseNz = nzGeometry.clone().applyMatrix4(matrix);
          bucket.push(baseNz);
          for (let k = h + 1; k < nz; k++) {
            wallMatrix.makeTranslation(
              (gx - gridOffset) * block,
              k * block,
              (gz - gridOffset) * block
            );
            const fillNz = nzGeometry.clone().applyMatrix4(wallMatrix);
            bucket.push(fillNz);
          }
        }
      }
    }

    // merge each non-empty bucket into its own one-draw-call mesh
    const meshes: THREE.Mesh[] = [];
    const buckets: Array<{ parts: THREE.BufferGeometry[]; mat: THREE.Material }> = [
      { parts: grassParts, mat: material },
      { parts: mudParts, mat: mudMaterial },
      { parts: snowParts, mat: snowMaterial },
      { parts: iceParts, mat: iceMaterial },
      { parts: sandParts, mat: sandMaterial },
      { parts: redParts, mat: redMaterial },
      { parts: mesaParts, mat: mesaMaterial },
      { parts: volcanoParts, mat: basaltMaterial },
      { parts: lavaParts, mat: lavaMaterial },
      { parts: shroomParts, mat: shroomMaterial },
      { parts: cherryParts, mat: cherryMaterial },
      { parts: crimsonParts, mat: crimsonMaterial },
      { parts: goldenParts, mat: goldenMaterial },
    ];
    for (const { parts, mat } of buckets) {
      if (parts.length === 0) continue;
      const merged = BufferGeometryUtils.mergeGeometries(parts);
      for (const part of parts) part.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();

      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true; // hills cast shadows into valleys
      mesh.receiveShadow = true; // player shadow lands here
      mesh.matrixAutoUpdate = false; // static geometry, world-space vertices
      scene.add(mesh);
      meshes.push(mesh);
    }
    if (meshes.length === 0) return;

    chunks.set(key, { cx, cz, meshes });
    if (!silentRebuild) options.onChunkBuilt?.(cx, cz);
  }

  function unloadChunk(key: string, chunk: Chunk): void {
    for (const mesh of chunk.meshes) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    chunks.delete(key);
    if (!silentRebuild) options.onChunkUnloaded?.(chunk.cx, chunk.cz);
  }

  /** Player chunk coordinates from a world position. */
  function playerChunk(playerX: number, playerZ: number): { cx: number; cz: number } {
    const gx = playerX / block + gridOffset;
    const gz = playerZ / block + gridOffset;
    return {
      cx: Math.floor(gx / chunkBlocks),
      cz: Math.floor(gz / chunkBlocks),
    };
  }

  /**
   * Streams the world around (pcx, pcz): builds up to `budget` missing
   * chunks (nearest first), unloads everything beyond viewRadius + 1.
   */
  let pendingCount = 0;
  // Reused scratch for the per-frame missing-chunk scan — the old code
  // allocated an array + one object per missing chunk EVERY frame (pure
  // GC churn; the pool recycles the objects, values are identical).
  const missing: Array<{ cx: number; cz: number; d: number }> = [];
  const missingPool: Array<{ cx: number; cz: number; d: number }> = [];

  function stream(pcx: number, pcz: number, budget: number): void {
    // --- collect missing chunks inside the view radius, nearest first ---
    while (missing.length > 0) missingPool.push(missing.pop()!);
    for (let dz = -viewRadius; dz <= viewRadius; dz++) {
      for (let dx = -viewRadius; dx <= viewRadius; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (!chunks.has(chunkKey(cx, cz))) {
          const slot = missingPool.pop() ?? { cx, cz, d: 0 };
          slot.cx = cx;
          slot.cz = cz;
          slot.d = Math.max(Math.abs(dx), Math.abs(dz));
          missing.push(slot);
        }
      }
    }
    pendingCount = missing.length;
    if (missing.length > 0) {
      missing.sort((a, b) => a.d - b.d);
      for (let i = 0; i < Math.min(budget, missing.length); i++) {
        buildChunk(missing[i].cx, missing[i].cz);
      }
      while (missing.length > 0) missingPool.push(missing.pop()!);
    }

    // --- unload terrain that fell out of the keep-radius behind the player ---
    const keep = viewRadius + 1;
    for (const [key, chunk] of chunks) {
      const d = Math.max(
        Math.abs(chunk.cx - pcx),
        Math.abs(chunk.cz - pcz)
      );
      if (d > keep) unloadChunk(key, chunk);
    }
  }

  // ---------------- flatten pads (dungeon-cave building sites) -------------
  const flattenRects = new Map<string, FlattenRect>();
  /** While true, chunk build/unload fires NO decor hooks — pad rebuilds are
   *  internal terrain edits, not streaming events. */
  let silentRebuild = false;

  /** Rebuild every LOADED chunk mesh overlapping the pad (unloaded ones will
   *  pick the pad up naturally the next time they stream in). */
  function rebuildPadChunks(rect: FlattenRect): void {
    const minCx = Math.floor(rect.gx0 / chunkBlocks);
    const maxCx = Math.floor(rect.gx1 / chunkBlocks);
    const minCz = Math.floor(rect.gz0 / chunkBlocks);
    const maxCz = Math.floor(rect.gz1 / chunkBlocks);
    const prev = silentRebuild;
    silentRebuild = true;
    try {
      for (let cz = minCz; cz <= maxCz; cz++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          const key = chunkKey(cx, cz);
          const chunk = chunks.get(key);
          if (!chunk) continue;
          unloadChunk(key, chunk);
          buildChunk(cx, cz);
        }
      }
    } finally {
      silentRebuild = prev;
    }
  }

  function addFlattenRect(rect: FlattenRect): void {
    flattenRects.set(rect.id, rect);
    rebuildPadChunks(rect);
  }

  function removeFlattenRect(id: string): void {
    const rect = flattenRects.get(id);
    if (!rect) return;
    flattenRects.delete(id);
    rebuildPadChunks(rect);
  }

  // ---------------- AI ZONE STUDIO (texture forge hooks) ----------------

  /** Pixel-art atlas texture from any loaded image/canvas — crisp
   *  NearestFilter sampling, no mipmaps (matches every baked atlas). */
  function atlasTextureFrom(
    image: HTMLCanvasElement | HTMLImageElement
  ): THREE.Texture {
    const tex = new THREE.Texture(image);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  async function applyZoneSkin(
    zone: ZoneSkinId,
    source: string | HTMLCanvasElement | HTMLImageElement
  ): Promise<boolean> {
    const entry = zoneSkins.get(zone);
    if (!entry) return false;

    let image: HTMLCanvasElement | HTMLImageElement;
    if (typeof source === 'string') {
      image = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = source;
      });
      if (!image) return false;
    } else {
      image = source;
    }

    const tex = atlasTextureFrom(image);
    const prev = entry.override;
    entry.mat.map = tex;
    // volcano zones glow through their atlas — the emissive map must ride
    // along or a new skin would render unlit-dark in the caldera
    if ('emissiveMap' in entry.mat && entry.mat.emissiveMap) {
      entry.mat.emissiveMap = tex;
    }
    entry.mat.needsUpdate = true;
    entry.override = tex;
    prev?.dispose();
    return true;
  }

  function restoreZoneSkin(zone: ZoneSkinId): boolean {
    const entry = zoneSkins.get(zone);
    if (!entry) return false;
    if (entry.override) {
      entry.mat.map = entry.original;
      if ('emissiveMap' in entry.mat && entry.mat.emissiveMap) {
        entry.mat.emissiveMap = entry.original;
      }
      entry.mat.needsUpdate = true;
      entry.override.dispose();
      entry.override = null;
    }
    return true;
  }

  function getZoneAtlas(zone: ZoneSkinId, out: HTMLCanvasElement): boolean {
    const entry = zoneSkins.get(zone);
    const image = entry?.mat.map?.image as
      | HTMLCanvasElement
      | HTMLImageElement
      | undefined;
    if (!image || image.width <= 0 || image.height <= 0) return false;
    out.width = ZONE_ATLAS_TILE;
    out.height = ZONE_ATLAS_TILE * 2;
    const ctx = out.getContext('2d');
    if (!ctx) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, out.width, out.height);
    ctx.drawImage(image, 0, 0, out.width, out.height);
    return true;
  }

  /** Same as getZoneAtlas but always reads `entry.original` — the vanilla
   *  atlas the zone was born with — even while a studio skin is worn. */
  function getZoneBaseAtlas(zone: ZoneSkinId, out: HTMLCanvasElement): boolean {
    const entry = zoneSkins.get(zone);
    const image = entry?.original.image as
      | HTMLCanvasElement
      | HTMLImageElement
      | undefined;
    if (!image || image.width <= 0 || image.height <= 0) return false;
    out.width = ZONE_ATLAS_TILE;
    out.height = ZONE_ATLAS_TILE * 2;
    const ctx = out.getContext('2d');
    if (!ctx) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, out.width, out.height);
    ctx.drawImage(image, 0, 0, out.width, out.height);
    return true;
  }

  // ---------------- public API ----------------

  function update(playerX: number, playerZ: number): void {
    // animate the Minecraft lava soup (fixed 20 fps steps inside)
    tickLavaTextures();
    const { cx, cz } = playerChunk(playerX, playerZ);
    // Runs EVERY frame on purpose: the per-frame build budget is what lets
    // the frontier catch up after a chunk crossing adds a whole new row of
    // missing chunks (the scan itself is only ~a hundred map lookups).
    stream(cx, cz, buildBudget);
  }

  function ensureAround(
    playerX: number,
    playerZ: number,
    radius: number,
    sync: boolean
  ): void {
    const { cx, cz } = playerChunk(playerX, playerZ);
    if (!sync) return; // non-sync is covered by the per-frame update()
    // synchronous: every missing chunk in the radius is built right now,
    // guaranteeing ground under the player (spawn, respawn, teleports)
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        buildChunk(cx + dx, cz + dz);
      }
    }
  }

  function stats(): { chunks: number; pending: number } {
    return { chunks: chunks.size, pending: pendingCount };
  }

  function dispose(): void {
    for (const chunk of chunks.values()) {
      for (const mesh of chunk.meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    chunks.clear();
    heightCache.clear();
    for (const entry of zoneSkins.values()) entry.override?.dispose();
    zoneSkins.clear();
    material.dispose();
    texture.dispose();
    snowMaterial.dispose();
    (snowMaterial.map as THREE.Texture | null)?.dispose();
    iceMaterial.dispose();
    (iceMaterial.map as THREE.Texture | null)?.dispose();
    sandMaterial.dispose();
    (sandMaterial.map as THREE.Texture | null)?.dispose();
    redMaterial.dispose();
    (redMaterial.map as THREE.Texture | null)?.dispose();
    mesaMaterial.dispose();
    (mesaMaterial.map as THREE.Texture | null)?.dispose();
    basaltMaterial.dispose();
    (basaltMaterial.map as THREE.Texture | null)?.dispose();
    (basaltMaterial.emissiveMap as THREE.Texture | null)?.dispose();
    // the lava atlas is an ANIMATED soup texture — unregister its ticker
    // before disposing so the sim stops painting the dead canvas
    if (lavaMaterial.map) releaseLavaTexture(lavaMaterial.map);
    lavaMaterial.dispose();
    (lavaMaterial.map as THREE.Texture | null)?.dispose();
    cherryMaterial.dispose();
    (cherryMaterial.map as THREE.Texture | null)?.dispose();
    shroomMaterial.dispose();
    (shroomMaterial.map as THREE.Texture | null)?.dispose();
    crimsonMaterial.dispose();
    (crimsonMaterial.map as THREE.Texture | null)?.dispose();
    goldenMaterial.dispose();
    (goldenMaterial.map as THREE.Texture | null)?.dispose();
  }

  return {
    update,
    ensureAround,
    blockHeight,
    surfaceYAt,
    oasisFloorY,
    cityTopY,
    stats,
    addFlattenRect,
    removeFlattenRect,
    applyZoneSkin,
    restoreZoneSkin,
    getZoneAtlas,
    getZoneBaseAtlas,
    dispose,
  };
}
