/**
 * CITY LAYOUT — shared constants + pure helpers for the big city road-map
 * plateau (the user's reference map cloned 1:1 into the grassland).
 *
 * The city is a 1536x1024-BLOCK rectangle of dead-flat ground in open
 * grassland, far from every landmark (probed against every biome
 * hand-zone — see the CITY_GRID note below). Everything
 * here is PURE MATH (no three.js) so the terrain height field, the
 * decor blockers, the minimap and the city builder itself can all
 * agree on one truth:
 *
 *  - cityEdgeT(gx, gz)        0 = plateau core, 1 = untouched nature,
 *                             smoothstep skirt between (terrainChunks
 *                             blends the height field with it)
 *  - cityColumnBlocked(gx,gz) the plateau core rect — decor systems
 *                             (loot chests, ground puddles) are kept out
 *  - cityMinimapTint(gx, gz)  road/walkway tint for the minimap canvas
 */

import {
  CITY_ROUNDABOUTS,
  CITY_IMG_W,
  CITY_IMG_H,
} from './cityRoadmapData';
import { SMOOTHED_PATHS } from './cityRoadSmooth';
import { listFootpathEdits } from './cityFootpathStore';

/** The plateau core rect, INCLUSIVE grid blocks — THE 4X GIANT (the
 *  whole road map doubled AGAIN in each axis at the user's request, so
 *  every road, block and building plot along the streets grew 2x):
 *  1536 wide x 1024 deep (2x the doubled build in each axis, 4x the
 *  area) — 153,600 x 102,400 world units = ~14 km x ~9.4 km (~128 km²)
 *  of city at the game's own toM() scale. The SAME reference network
 *  stretches across it (CITY_UPP doubled to 100 world units per image
 *  pixel), so the map, its roads and the open plots between them all
 *  scale up as one coherent giant. The rect kept the old SOUTH edge
 *  (gz1 = -1498) and the old x-centre (702.5) and grew NORTH + WEST +
 *  EAST — the only open directions (south is blocked by the cherry-ESE
 *  hand zone 214 blocks away). Probed clear of EVERY biome hand-zone
 *  at the modules' own worst-case reach (radius * 1.16 + 9): cherry-ESE
 *  kisses the south edge exactly as before (the city override owns the
 *  ground there anyway), volcano-S still clears 27 blocks, every other
 *  zone 40+ blocks clear. Terrain forces grassland inside the rect, so
 *  any natural biome country rolling underneath still reads as clean
 *  city ground. */
export const CITY_GRID = {
  gx0: -65,
  gx1: 1470,
  gz0: -2521,
  gz1: -1498,
  /** Smooth skirt band around the core, in blocks. */
  blend: 7,
  /** Plateau level sample column (baseHeight here = the city's Y) —
   *  unchanged through every growth so the plateau datum never jumps. */
  cxgx: 703,
  cxgz: -1753,
} as const;

/** Linear scale factor vs the original traced mapping (1 image px now
 *  spans 64x more world than the flat map) — marking sizes, sidewalk
 *  extras and the roundabout pads multiply by this so the network
 *  grows as ONE giant coherent map. Doubled 16 → 32 together with the
 *  2x rect growth so markings/kerbs keep their exact proportions. */
export const CITY_SCALE = 32;
export const CITY_BLOCK = 100;
export const CITY_GRID_OFFSET = 64;

/** Extra road widening ON TOP of the 2x map doubling — the traced
 *  widths already grow 2x with the rect; this stretches every car-
 *  riageway a further 25% so the wider roads read unmistakably. */
export const CITY_ROAD_W_MULT = 1.25;

/** Road deck width in world units for a path of `pxW` reference-image
 *  pixels (traced width x UPP x the extra widening). ONE truth used by
 *  the physics raster, the minimap raster and the marking pass — the
 *  visible cube deck samples the same raster, so everything agrees. */
export function cityRoadWU(pxW: number): number {
  return pxW * CITY_UPP * CITY_ROAD_W_MULT;
}

/** World-space rect of the plateau core. */
export const CITY_WX0 = (CITY_GRID.gx0 - CITY_GRID_OFFSET) * CITY_BLOCK; // -12900
export const CITY_WX1 = (CITY_GRID.gx1 + 1 - CITY_GRID_OFFSET) * CITY_BLOCK; // 140700
export const CITY_WZ0 = (CITY_GRID.gz0 - CITY_GRID_OFFSET) * CITY_BLOCK; // -258500
export const CITY_WZ1 = (CITY_GRID.gz1 + 1 - CITY_GRID_OFFSET) * CITY_BLOCK; // -156100
export const CITY_WW = CITY_WX1 - CITY_WX0; // 153600
export const CITY_WD = CITY_WZ1 - CITY_WZ0; // 102400
export const CITY_WCX = (CITY_WX0 + CITY_WX1) / 2; // 63900
export const CITY_WCZ = (CITY_WZ0 + CITY_WZ1) / 2; // -207300

function smoothstep01(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/** Plateau blend factor at a grid column: 0 = fully flat city core,
 *  1 = natural terrain beyond the skirt. Cheap rect-distance math —
 *  this runs for every column the terrain builds. */
export function cityEdgeT(gx: number, gz: number): number {
  const dx =
    gx < CITY_GRID.gx0
      ? CITY_GRID.gx0 - gx
      : gx > CITY_GRID.gx1
        ? gx - CITY_GRID.gx1
        : 0;
  const dz =
    gz < CITY_GRID.gz0
      ? CITY_GRID.gz0 - gz
      : gz > CITY_GRID.gz1
        ? gz - CITY_GRID.gz1
        : 0;
  const d = Math.max(dx, dz);
  if (d <= 0) return 0;
  return smoothstep01(d / CITY_GRID.blend);
}

/** Decor blocker: true inside the plateau core (+1 block apron) —
 *  loot chests and ground puddles must not spawn on the roads. */
export function cityColumnBlocked(gx: number, gz: number): boolean {
  return (
    gx >= CITY_GRID.gx0 - 1 &&
    gx <= CITY_GRID.gx1 + 1 &&
    gz >= CITY_GRID.gz0 - 1 &&
    gz <= CITY_GRID.gz1 + 1
  );
}

/** Wild-mob spawn blocker, WORLD space: true anywhere on the city
 *  plateau or its grass skirt. The biome factors are zeroed under the
 *  city (wildBiomes.ts kill-switch), and this hard guard is the second
 *  line of defence at the spawn sites themselves — spiders and mushroom
 *  Bups spawn in their own biomes ONLY, never anywhere on the road map. */
export function citySpawnBlockedWorld(
  x: number,
  z: number,
  block: number,
  gridOffset: number
): boolean {
  return (
    cityEdgeT(
      Math.round(x / block) + gridOffset,
      Math.round(z / block) + gridOffset
    ) < 1
  );
}

/* ------------------------ minimap road raster ------------------------ */
/* Rasterize the vectorized road network once into a 4x-supersampled
 * grid over the plateau rect; three lazily-built Uint8 layers answer
 * per-block tint queries for the minimap canvas. Pure math, no DOM. */

const SUB = 1; // 1 sample per block centre — EXACTLY the cube-deck rule
const GW = (CITY_GRID.gx1 - CITY_GRID.gx0 + 1) * SUB; // 1536
const GH = (CITY_GRID.gz1 - CITY_GRID.gz0 + 1) * SUB; // 1024

let roadGrid: Uint8Array | null = null;
let walkGrid: Uint8Array | null = null;
/** Player-painted cells (minimap 3-colour editor): 1 = footpath,
 *  2 = asphalt road — checked FIRST by the tint, so painted ways show
 *  over the traced network and route over it. */
let userGrid: Uint8Array | null = null;

/** World units per reference image pixel. */
export const CITY_UPP = CITY_WW / CITY_IMG_W; // 100

function imageToWorld(px: number, py: number): [number, number] {
  return [
    CITY_WX0 + (px / CITY_IMG_W) * CITY_WW,
    CITY_WZ0 + (py / CITY_IMG_H) * CITY_WD,
  ];
}

/** Sidewalk (footpath) extra width each side of a road, world units —
 *  scaled with the giant build so the kerbed footpaths grow with it. */
export function citySidewalkExtra(cls: number): number {
  const base = cls === 2 ? 36 : cls === 1 ? 24 : 18;
  return base * CITY_SCALE;
}

function ensureGrids(): void {
  if (roadGrid) return;
  roadGrid = new Uint8Array(GW * GH);
  walkGrid = new Uint8Array(GW * GH);
  userGrid = new Uint8Array(GW * GH);
  // walkway = road dilated by its sidewalk extra — rasterize per path
  // into walk first, then roads into road (roads overwrite walk centre)
  const mark = (
    grid: Uint8Array,
    pts: number[],
    halfWu: number
  ): void => {
    // walk the polyline stamping discs of halfWu
    const half = halfWu / CITY_BLOCK * SUB; // subcells
    let pxw = 0;
    let pyw = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const [wx, wz] = imageToWorld(pts[i], pts[i + 1]);
      const cx = ((wx - CITY_WX0) / CITY_BLOCK) * SUB;
      const cy = ((wz - CITY_WZ0) / CITY_BLOCK) * SUB;
      if (i > 0) {
        const dx = cx - pxw;
        const dy = cy - pyw;
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
        for (let s = 0; s <= steps; s++) {
          const sx = pxw + (dx * s) / steps;
          const sy = pyw + (dy * s) / steps;
          const x0 = Math.max(0, Math.floor(sx - half));
          const x1 = Math.min(GW - 1, Math.ceil(sx + half));
          const y0 = Math.max(0, Math.floor(sy - half));
          const y1 = Math.min(GH - 1, Math.ceil(sy + half));
          const h2 = half * half;
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const ddx = x - sx;
              const ddy = y - sy;
              if (ddx * ddx + ddy * ddy <= h2) grid[y * GW + x] = 1;
            }
          }
        }
      }
      pxw = cx;
      pyw = cy;
    }
  };
  for (const p of SMOOTHED_PATHS) {
    mark(
      walkGrid,
      p.pts,
      cityRoadWU(p.w) / 2 + citySidewalkExtra(p.cls)
    );
  }
  for (const p of SMOOTHED_PATHS) {
    mark(roadGrid, p.pts, cityRoadWU(p.w) / 2);
  }
  for (const ra of CITY_ROUNDABOUTS) {
    const [wx, wz] = imageToWorld(ra[0], ra[1]);
    const cx = ((wx - CITY_WX0) / CITY_BLOCK) * SUB;
    const cy = ((wz - CITY_WZ0) / CITY_BLOCK) * SUB;
    const rr = (ra[2] * CITY_UPP * 1.6) / CITY_BLOCK * SUB;
    const rrW = (ra[2] * CITY_UPP) / CITY_BLOCK * SUB;
    const x0 = Math.max(0, Math.floor(cx - rr));
    const x1 = Math.min(GW - 1, Math.ceil(cx + rr));
    const y0 = Math.max(0, Math.floor(cy - rr));
    const y1 = Math.min(GH - 1, Math.ceil(cy + rr));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 <= rr * rr) walkGrid![y * GW + x] = 1;
        if (d2 <= rrW * rrW) roadGrid![y * GW + x] = 1;
      }
    }
  }

  // replay the persisted player paint edits (minimap 3-colour painter)
  // onto the fresh grids — the router and both maps read the live truth
  for (const e of listFootpathEdits()) {
    cityMinimapEditStrokeW(e.pts, e.r, e.cls);
  }
}

/** Minimap tint at a grid block: 'road' (dark asphalt), 'walk'
 *  (stone walkway) or null (keep the biome colour). */
export function cityMinimapTint(
  gx: number,
  gz: number
): 'road' | 'walk' | null {
  if (
    gx < CITY_GRID.gx0 ||
    gx > CITY_GRID.gx1 ||
    gz < CITY_GRID.gz0 ||
    gz > CITY_GRID.gz1
  ) {
    return null;
  }
  ensureGrids();
  const lx = gx - CITY_GRID.gx0;
  const lz = gz - CITY_GRID.gz0;
  // SUB=1: the block's centre sample — the exact rule the visible
  // cube deck uses, so the minimap always matches what is built
  const uidx = lz * GW + lx;
  const uv = userGrid![uidx];
  if (uv === 2) return 'road'; // player-painted asphalt wins
  if (uv === 1) return 'walk'; // player-painted path wins
  let roadN = 0;
  let walkN = 0;
  for (let sy = 0; sy < SUB; sy++) {
    for (let sx = 0; sx < SUB; sx++) {
      const idx = (lz * SUB + sy) * GW + (lx * SUB + sx);
      if (roadGrid![idx]) roadN++;
      if (walkGrid![idx]) walkN++;
    }
  }
  if (roadN >= SUB * SUB * 0.5) return 'road';
  if (walkN >= 1) return 'walk';
  return null;
}

/* ----------------- player paint edits (minimap 3-colour) ---------------- */

/** Mutate the minimap tint grids along a world-space capsule run —
 *  the map/router half of the 3-colour painter. cls=1 paints the user
 *  walk layer (tint 'walk', routable as a walkway); cls=2 paints the
 *  user ROAD layer (tint 'road', routable as asphalt — the A* router
 *  reads this exact tint, so painted roads are drivable instantly);
 *  cls=0 (erase) clears BOTH user layers and the traced footpath layer
 *  (traced asphalt stays). */
export function cityMinimapEditStrokeW(
  pts: number[],
  r: number,
  cls: 0 | 1 | 2
): void {
  if (pts.length < 4 || !(r > 0)) return;
  ensureGrids();
  const ug = userGrid as Uint8Array;
  const wg = walkGrid as Uint8Array;
  const stampAt = (wx: number, wz: number): void => {
    const gr = r / CITY_BLOCK; // SUB=1: one grid cell per block
    const gx = (wx - CITY_WX0) / CITY_BLOCK;
    const gz = (wz - CITY_WZ0) / CITY_BLOCK;
    const x0 = Math.max(0, Math.floor(gx - gr));
    const x1 = Math.min(GW - 1, Math.ceil(gx + gr));
    const z0 = Math.max(0, Math.floor(gz - gr));
    const z1 = Math.min(GH - 1, Math.ceil(gz + gr));
    const r2 = gr * gr;
    for (let z = z0; z <= z1; z++) {
      const dz = z - gz;
      for (let x = x0; x <= x1; x++) {
        const dx = x - gx;
        if (dx * dx + dz * dz > r2) continue;
        const idx = z * GW + x;
        if (cls === 0) {
          ug[idx] = 0;
          wg[idx] = 0;
        } else {
          ug[idx] = cls;
        }
      }
    }
  };
  const spacing = Math.max(4, Math.min(r * 0.5, CITY_BLOCK));
  let px = pts[0];
  let pz = pts[1];
  stampAt(px, pz);
  for (let i = 2; i < pts.length; i += 2) {
    const nx = pts[i];
    const nz = pts[i + 1];
    const len = Math.hypot(nx - px, nz - pz);
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let s = 1; s <= steps; s++) {
      stampAt(px + ((nx - px) * s) / steps, pz + ((nz - pz) * s) / steps);
    }
    px = nx;
    pz = nz;
  }
}

/** Wipe every player paint edit from the tint grids (the traced
 *  network stays) — the RESET button's map half. */
export function cityMinimapEditsReset(): void {
  if (!roadGrid) return;
  roadGrid = null;
  walkGrid = null;
  userGrid = null;
  ensureGrids();
}
