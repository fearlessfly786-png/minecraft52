'use client';

/**
 * Top-down exploration minimap for RATFIRE — top-LEFT corner of the
 * gameplay view, rendered as a CIRCULAR dial with the curved vitals
 * ring (see HealthBar.tsx) wrapped around it.
 *
 * North-up canvas map of the INFINITE world around the player:
 *  - TERRAIN TILE: an offscreen 64x64-block tile (4px per block) is painted
 *    from the same deterministic height function the terrain meshes use
 *    (injected through the bridge ref — the game loop owns the terrain), so
 *    the map always matches the world under your feet. It re-paints when
 *    the player walks >REFRESH_BLOCKS from the tile centre; between repaints
 *    the visible 44x44-block window scrolls SUB-PIXEL smoothly across it.
 *  - HEIGHT PALETTE: valley slate -> grass greens -> hill browns -> rock
 *    grey -> pale peaks, with a deterministic per-cell brightness jitter
 *    for a textured, hand-drawn look instead of flat bands.
 *  - MARKERS: gold dots for live, unopened loot chests (rare chests are
 *    brighter with a soft pulse), injected per-frame via the bridge.
 *  - PLAYER: an amber arrow at the exact (fractional) centre, rotated by
 *    the character's yaw, over a translucent view cone; "N" labels the top.
 *
 *  - CITY MAP: while the player stands anywhere inside the road-map
 *    city rect, the dial lights up amber and becomes CLICKABLE —
 *    tapping it opens a full city-map overlay (the whole traced
 *    network painted 1 px per block: asphalt roads, stone walkways,
 *    grass, water) with a live pulsing "you are here" arrow. Outside
 *    the city the dial is inert, exactly as before. Clicking anywhere
 *    on the overlay plans a GOOGLE-MAPS-STYLE ROUTE: an A* search over
 *    the street raster (src/game/cityRoute.ts) draws the shortest road
 *    path as an amber line with a red destination pin and a distance
 *    readout. The plan is deliberately STABLE — the world arrows never
 *    move while you drive; the route only changes when you click a new
 *    destination or press CLEAR ROUTE.
 *
 *  - ZOOM + PAINT: the overlay zooms (wheel at the cursor, +/- buttons,
 *    fit chip; right-drag pans) and the EDIT PATHS toolbar paints THREE
 *    colours straight onto the world — asphalt roads, stone footpaths
 *    or the eraser — with an adjustable brush scale (slider or [ / ]
 *    keys, live ring preview). FIVE shape tools cover every job: FREE
 *    drag (freehand), LINE drag (perfectly straight strokes), POLYLINE
 *    (click vertices, Enter/double-click commits, Backspace undoes a
 *    vertex), RECT drag (filled rectangles) and CURVE — click the
 *    start, click the end, SWEEP THE MOUSE TO BEND the road live and
 *    click again to lay it; a road curve raises its two flanking kerb
 *    footpaths automatically and one Ctrl+Z pops the whole commit —
 *    plus click-to-stamp, Ctrl+Z / button UNDO and 1/2/3/F/L/P/R/C
 *    hotkeys.
 *    A finished stroke builds in the 3D city, the physics raster, the
 *    router and both maps in the same beat.
 *
 * The game loop pushes position every frame through the imperative
 * {@link MinimapHandle.update} handle — plain canvas 2D ops, zero React
 * re-renders per frame, same pattern as the HealthBar HUD.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  Car,
  Eraser,
  Footprints,
  Map as MapIcon,
  Minus,
  Pencil,
  PenTool,
  RotateCcw,
  Save,
  Scissors,
  Spline,
  Square,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { iceFactor, winterFactor } from '@/game/winterBiomes';
import { desertFactor } from '@/game/desertBiomes';
import {
  oasisFactor,
  oasisWaterCover,
  oasisBrimRing,
  oasisMudAt,
} from '@/game/oasisTerrain';
import { palmAt } from '@/game/palmTrees';
import { redFactor, mesaFactor, volcanoFactor } from '@/game/extraBiomes';
import { cherryFactor, shroomFactor, crimsonFactor, goldenFactor } from '@/game/wildBiomes';
import { volcanoLavaWeight } from '@/game/volcanoTerrain';
import {
  CITY_GRID,
  CITY_WD,
  CITY_WX0,
  CITY_WZ0,
  CITY_UPP,
  cityMinimapTint,
} from '@/game/cityLayout';
import { CITY_IMG_H, CITY_WATER } from '@/game/cityRoadmapData';
import {
  CITY_M_PER_BLOCK,
  cityRouteRefreshRegion,
  ensureCityRouteGrid,
  findCityRoute,
} from '@/game/cityRoute';
import { setCityRouteGuide } from '@/game/cityRouteGuide';
import {
  applyFootpathEdits,
  resetFootpathEdits,
  undoLastFootpathEdit,
  type FootpathEditRect,
} from '@/game/cityFootpathEdit';
import { listFootpathEdits } from '@/game/cityFootpathStore';
import {
  fetchServerFootpathEdits,
  footpathEditsEqual,
  pushServerFootpathEdits,
} from '@/game/cityFootpathServer';
import { offsetPolyline, quadBezierThrough } from '@/game/strokeCurve';

/** Live chest markers the game loop exposes to the map. */
export interface MinimapMarker {
  x: number;
  z: number;
  rare: boolean;
}

/** Stable bridge the page effect fills with game-side data providers. */
export interface MinimapBridge {
  /** Deterministic integer block height at grid coordinates. */
  heightAt?: (gx: number, gz: number) => number;
  /** Live unopened chest markers. */
  getMarkers?: () => MinimapMarker[];
  /** Rebuild the 3D city deck tiles overlapping a world rect — the
   *  footpath editor fires it right after a stroke is applied. */
  rebuildCityDeck?: (
    wx0: number,
    wz0: number,
    wx1: number,
    wz1: number
  ) => void;
  /** Repaint the slice of the big-map cache + dial tile that a boot-
   *  time adoption of the permanent server save touched — the map
   *  shows the restored painting without a full rebuild. */
  repaintFootpathRegion?: (rect: FootpathEditRect) => void;
}

export interface MinimapHandle {
  /** Push the player state; draws straight to the canvas. */
  update(x: number, z: number, yaw: number): void;
}

interface MinimapProps {
  /** World units per voxel block edge (100). */
  block: number;
  /** Grid origin offset — gx = x / block + gridOffset. */
  gridOffset: number;
  /** Game-loop data providers, filled once by the page effect. */
  bridge: RefObject<MinimapBridge>;
}

/* ---------------- tuning ---------------- */
const TILE_BLOCKS = 64; // offscreen tile span, in blocks
const TILE_PX = 256; // offscreen tile resolution (4 px per block)
const PX_PER_BLOCK = TILE_PX / TILE_BLOCKS;
const MAP_BLOCKS = 44; // visible window span, in blocks (±22 around player)
const REFRESH_BLOCKS = 6; // re-paint the tile after drifting this far
const SRC_SPAN = MAP_BLOCKS * PX_PER_BLOCK; // visible source span in tile px

/* height palette bands [maxHeightExclusive, rgb] — valley -> peak */
const BANDS: Array<[number, [number, number, number]]> = [
  [-10, [96, 106, 122]], // deep valley slate
  [-4, [92, 138, 88]], // dark lowland grass
  [1, [124, 178, 88]], // grass green
  [7, [146, 190, 92]], // light grass
  [14, [168, 156, 96]], // dry hill brown
  [22, [146, 138, 118]], // rock grey-brown
  [32, [172, 172, 168]], // rock grey
  [Infinity, [222, 224, 220]], // pale peaks
];

const MINIMAP_BG = '#10131a';

/* city-map painter + zoom tuning */
const BRUSH_MIN = 1; // brush width range, in blocks
const BRUSH_MAX = 24;
const ZOOM_MIN = 1; // city map overlay zoom range
const ZOOM_MAX = 10;
const ZOOM_STEP = 1.6; // per + / - / wheel notch

function heightColor(h: number, gx: number, gz: number): string {
  // CITY PLATEAU — the road-map city overrides every biome tint inside
  // its rect: dark asphalt where the traced roads run, pale stone on
  // the walkways, untouched biome colour on the city's grass blocks
  const cityTint = cityMinimapTint(gx, gz);
  if (cityTint) {
    return cityTint === 'road' ? '#34353b' : '#8f9094';
  }
  let rgb = BANDS[BANDS.length - 1][1];
  for (const [max, col] of BANDS) {
    if (h < max) {
      rgb = col;
      break;
    }
  }
  // deterministic per-cell brightness jitter (hash of grid coords)
  const j =
    (((gx * 73856093) ^ (gz * 19349663)) >>> 0) % 1000 / 1000;
  const k = 0.88 + j * 0.24;
  // winter biomes frost the map: the snow field bleaches toward white,
  // the glacier core toward pale ice blue (same fields the terrain uses,
  // so the map always agrees with the world under your feet)
  const w = winterFactor(gx, gz);
  if (w > 0.01) {
    const ice = iceFactor(gx, gz) * w;
    const frost = [
      226 + (198 - 226) * ice,
      238 + (228 - 238) * ice,
      246 + (244 - 246) * ice,
    ];
    const t = 0.55 + 0.45 * w;
    rgb = [
      rgb[0] + (frost[0] - rgb[0]) * t,
      rgb[1] + (frost[1] - rgb[1]) * t,
      rgb[2] + (frost[2] - rgb[2]) * t,
    ];
  }
  // desert biomes bake the map toward warm sand (checked after winter so
  // sand wins the blend exactly like it wins the terrain bucket priority)
  const d = desertFactor(gx, gz);
  if (d > 0.01) {
    const sand = [226, 202, 148];
    const t = 0.55 + 0.45 * d;
    rgb = [
      rgb[0] + (sand[0] - rgb[0]) * t,
      rgb[1] + (sand[1] - rgb[1]) * t,
      rgb[2] + (sand[2] - rgb[2]) * t,
    ];
  }
  // the OASIS base — the smooth circular sand pan sunk into the due-north
  // dune sea (see src/game/oasisTerrain.ts) — bakes the map toward its
  // deeper pan tone so the bare circle reads from above (checked after
  // the desert blend: the pan wins exactly where the carve owns the
  // ground, same priority the height field gives it)
  const oa = oasisFactor(gx, gz);
  if (oa > 0.01) {
    const pan = [200, 168, 118];
    const t = 0.55 + 0.45 * oa;
    rgb = [
      rgb[0] + (pan[0] - rgb[0]) * t,
      rgb[1] + (pan[1] - rgb[1]) * t,
      rgb[2] + (pan[2] - rgb[2]) * t,
    ];
  }
  // the OASIS GRASS COLLAR — the oasis's outer six-block circular shore
  // ring plus the rough meadow carry the grass block textures in the
  // world (see oasisBrimRing), so the map bakes the same green collar
  // between the sand pan and the waterline — the map always agrees with
  // the ground under your feet (painted after the sand pan, before the
  // pool). The meadow's PACKED-MUD blocks (oasisMudAt, beyond the
  // pure-grass brim) bake as brown mottle inside the green so the map
  // shows the muddy meadow margin exactly where the world has it.
  if (oasisBrimRing(gx, gz)) {
    const brim = oasisMudAt(gx, gz) ? [122, 88, 58] : [110, 162, 84];
    const t = 0.85;
    rgb = [
      rgb[0] + (brim[0] - rgb[0]) * t,
      rgb[1] + (brim[1] - rgb[1]) * t,
      rgb[2] + (brim[2] - rgb[2]) * t,
    ];
  }
  // COCONUT PALMS — the grove ringed around the collar bakes as deep
  // frond-green dots on the meadow, exactly where palmAt stands a tree
  // in the world (same deterministic predicate — map matches ground)
  if (palmAt(gx, gz)) {
    const frond = [44, 92, 46];
    const t = 0.9;
    rgb = [
      rgb[0] + (frond[0] - rgb[0]) * t,
      rgb[1] + (frond[1] - rgb[1]) * t,
      rgb[2] + (frond[2] - rgb[2]) * t,
    ];
  }
  // the OASIS POOL — the turquoise water circle at the cone's heart
  // (see src/game/oasisWater.ts) — paints after the sand pan so the map
  // reads water over sand exactly like the world renders it
  const ow = oasisWaterCover(gx, gz);
  if (ow > 0.01) {
    const pool = [56, 199, 214];
    const t = 0.55 + 0.45 * ow;
    rgb = [
      rgb[0] + (pool[0] - rgb[0]) * t,
      rgb[1] + (pool[1] - rgb[1]) * t,
      rgb[2] + (pool[2] - rgb[2]) * t,
    ];
  }
  // the temperate wild biomes — cherry grove, mushroom fields
  // — blend in after the golden sand (wild beats sand in the terrain
  // priority: a wild country inside the dune sea reads as an oasis
  // pocket) but before the hard hot landmarks
  const c = cherryFactor(gx, gz);
  if (c > 0.01) {
    const blossom = [232, 160, 200];
    const t = 0.55 + 0.45 * c;
    rgb = [
      rgb[0] + (blossom[0] - rgb[0]) * t,
      rgb[1] + (blossom[1] - rgb[1]) * t,
      rgb[2] + (blossom[2] - rgb[2]) * t,
    ];
  }
  const sh = shroomFactor(gx, gz);
  if (sh > 0.01) {
    const myc = [185, 168, 201];
    const t = 0.55 + 0.45 * sh;
    rgb = [
      rgb[0] + (myc[0] - rgb[0]) * t,
      rgb[1] + (myc[1] - rgb[1]) * t,
      rgb[2] + (myc[2] - rgb[2]) * t,
    ];
  }
  const cr = crimsonFactor(gx, gz);
  if (cr > 0.01) {
    const crimson = [206, 92, 88];
    const t = 0.55 + 0.45 * cr;
    rgb = [
      rgb[0] + (crimson[0] - rgb[0]) * t,
      rgb[1] + (crimson[1] - rgb[1]) * t,
      rgb[2] + (crimson[2] - rgb[2]) * t,
    ];
  }
  // the golden fields — the yellow-tinted grassland — bake in the same
  // wild-biome slot (golden beats sand in the terrain priority, and the
  // map always agrees with the ground under your feet)
  const gd = goldenFactor(gx, gz);
  if (gd > 0.01) {
    const golden = [218, 180, 92];
    const t = 0.55 + 0.45 * gd;
    rgb = [
      rgb[0] + (golden[0] - rgb[0]) * t,
      rgb[1] + (golden[1] - rgb[1]) * t,
      rgb[2] + (golden[2] - rgb[2]) * t,
    ];
  }
  // the three extra biomes — red desert, badlands, volcano — blend in
  // LAST and in terrain-priority order (volcano > mesa > red > wild >
  // sand), so the map always agrees with the ground under your feet
  const r = redFactor(gx, gz);
  if (r > 0.01) {
    const red = [214, 122, 76];
    const t = 0.55 + 0.45 * r;
    rgb = [
      rgb[0] + (red[0] - rgb[0]) * t,
      rgb[1] + (red[1] - rgb[1]) * t,
      rgb[2] + (red[2] - rgb[2]) * t,
    ];
  }
  const m = mesaFactor(gx, gz);
  if (m > 0.01) {
    const mesa = [204, 142, 92];
    const t = 0.55 + 0.45 * m;
    rgb = [
      rgb[0] + (mesa[0] - rgb[0]) * t,
      rgb[1] + (mesa[1] - rgb[1]) * t,
      rgb[2] + (mesa[2] - rgb[2]) * t,
    ];
  }
  const v = volcanoFactor(gx, gz);
  if (v > 0.01) {
    const basalt = [56, 48, 46];
    const t = 0.55 + 0.45 * v;
    rgb = [
      rgb[0] + (basalt[0] - rgb[0]) * t,
      rgb[1] + (basalt[1] - rgb[1]) * t,
      rgb[2] + (basalt[2] - rgb[2]) * t,
    ];
  }
  // molten lava burns through last: the caldera lake + flank flows glow
  // hot orange out of the black basalt (same field the terrain bucket
  // uses, so the map always shows the real molten ground)
  const lv = volcanoLavaWeight(gx, gz);
  if (lv > 0.05) {
    const lava = [255, 132, 40];
    const t = 0.3 + 0.7 * Math.min(1, lv * 1.35);
    rgb = [
      rgb[0] + (lava[0] - rgb[0]) * t,
      rgb[1] + (lava[1] - rgb[1]) * t,
      rgb[2] + (lava[2] - rgb[2]) * t,
    ];
  }
  return `rgb(${Math.min(255, (rgb[0] * k) | 0)},${Math.min(255, (rgb[1] * k) | 0)},${Math.min(255, (rgb[2] * k) | 0)})`;
}

/** Google-Maps-style teardrop destination pin (red with a white eye),
 *  tip anchored exactly on the clicked map position. */
function drawDestPin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number
): void {
  const cy = y - r * 1.55;
  ctx.fillStyle = '#e5484d';
  ctx.strokeStyle = 'rgba(28, 8, 10, 0.85)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - r * 0.62, cy + r * 0.72);
  ctx.lineTo(x + r * 0.62, cy + r * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, cy, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
}

const Minimap = forwardRef<MinimapHandle, MinimapProps>(function Minimap(
  { block, gridOffset, bridge },
  api
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tileRef = useRef<HTMLCanvasElement | null>(null);
  const tileBaseRef = useRef<{ gx: number; gz: number } | null>(null);
  const sizeRef = useRef(150); // css px, re-measured on mount/resize

  // ---- city map overlay (imperative-friendly state mirrors) ----
  const bigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapCacheRef = useRef<HTMLCanvasElement | null>(null);
  const bigSizeRef = useRef<{ w: number; h: number } | null>(null);
  const coordsRef = useRef<HTMLSpanElement | null>(null);
  const posRef = useRef({ x: 0, z: 0, yaw: 0 });
  const inCityRef = useRef(false);
  const openRef = useRef(false);
  const [inCity, setInCity] = useState(false);
  const [open, setOpen] = useState(false);

  // ---- 3-colour map painter (asphalt road / stone footpath / erase) ----
  const editCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [editOn, setEditOn] = useState(false);
  const [editTool, setEditTool] = useState<'road' | 'walk' | 'erase'>('walk');
  const [editBrush, setEditBrush] = useState(2);
  /** Stroke SHAPE: freehand drag, straight line drag, clicked polyline,
   *  filled rectangle drag or the click-place + live-bend CURVE — the
   *  easy + advanced painter controls. */
  const [editShape, setEditShape] = useState<
    'free' | 'line' | 'poly' | 'rect' | 'curve'
  >('free');
  const editOnRef = useRef(false);
  const editToolRef = useRef<'road' | 'walk' | 'erase'>('walk');
  const editBrushRef = useRef(2);
  const editShapeRef = useRef<
    'free' | 'line' | 'poly' | 'rect' | 'curve'
  >('free');
  const drawingRef = useRef(false);
  const drawPtsRef = useRef<number[]>([]);
  /** Line/rect drag anchor + live cursor (cache px) and the committed
   *  polyline vertices so far (cache px, [fx,fz,...]). */
  const shapeAnchorRef = useRef<{ fx: number; fz: number } | null>(null);
  const shapeCurRef = useRef<{ fx: number; fz: number } | null>(null);
  const polyPtsRef = useRef<number[]>([]);
  /** CURVE tool state: the placed endpoints so far (cache px,
   *  [x0,z0] then [x0,z0,x1,z1]); while both are down the LIVE cursor
   *  is the bend midpoint and the third click lays the curve. */
  const curvePtsRef = useRef<number[]>([]);
  /** Timestamp of the last curve commit — a double-click's trailing
   *  click starts a stray fresh curve right after committing a bend. */
  const lastCurveCommitRef = useRef(0);
  // ---- PERMANENT SAVE (the SAVE button): pushes the WHOLE stroke list
  // to the server snapshot — overwrite-only, no previous version kept
  // anywhere. dirty = the working strokes differ from that snapshot. ----
  const saveBusyRef = useRef(false);
  const serverInfoRef = useRef(false);
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [paintDirty, setPaintDirty] = useState(false);
  // ---- zoom / pan (pure imperative — the overlay redraws every frame
  // through the game loop, so these never touch React state) ----
  const zoomRef = useRef(1);
  /** View centre in cache px (1 cache px = 1 block). */
  const viewRef = useRef<{ x: number; z: number } | null>(null);
  /** Active right-drag / middle-drag pan (client-px anchor). */
  const panRef = useRef<{ cx: number; cz: number } | null>(null);
  /** Cache-px point under the cursor — drives the live brush ring. */
  const pointerRef = useRef<{ fx: number; fz: number } | null>(null);
  const zoomChipRef = useRef<HTMLButtonElement | null>(null);
  // mirror the editor state into the imperative handlers (effects, not
  // render — refs must not be written while rendering)
  useEffect(() => {
    editOnRef.current = editOn;
    if (!editOn) {
      drawingRef.current = false;
      drawPtsRef.current = [];
      polyPtsRef.current = [];
      curvePtsRef.current = [];
      shapeAnchorRef.current = null;
      shapeCurRef.current = null;
      pointerRef.current = null;
    }
  }, [editOn]);
  useEffect(() => {
    editToolRef.current = editTool;
  }, [editTool]);
  useEffect(() => {
    editBrushRef.current = editBrush;
  }, [editBrush]);
  useEffect(() => {
    editShapeRef.current = editShape;
  }, [editShape]);
  // First time the painter opens: learn the permanent snapshot's state
  // (when it was last saved + whether the working strokes differ) so
  // the SAVE button can show an honest "unsaved changes" dot.
  useEffect(() => {
    if (!editOn || serverInfoRef.current) return;
    serverInfoRef.current = true;
    void (async () => {
      const srv = await fetchServerFootpathEdits();
      setSavedAt(srv.savedAt);
      setPaintDirty(!footpathEditsEqual(listFootpathEdits(), srv.strokes));
    })();
  }, [editOn]);
  // The page's boot restore adopts the permanent server save when this
  // browser has never painted — this repaints the touched slice of the
  // map cache + dial tile so the map shows the restored painting.
  useEffect(() => {
    bridge.current.repaintFootpathRegion = (rect) => {
      repaintCacheRegion(rect);
      tileBaseRef.current = null;
      if (openRef.current) drawBigMap();
    };
    return () => {
      delete bridge.current.repaintFootpathRegion;
    };
  }, []);

  // ---- route planning (Google-style click-to-route on the city map) ----
  const routeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const routeMetaRef = useRef<{
    destFx: number;
    destFz: number;
    startFx: number;
    startFz: number;
    blocks: number;
  } | null>(null);
  const routeMsgTimerRef = useRef<number | null>(null);
  const distRef = useRef<HTMLSpanElement | null>(null);
  const routeMsgRef = useRef<HTMLSpanElement | null>(null);
  const clearBtnRef = useRef<HTMLSpanElement | null>(null);

  // ---- offscreen tile painting (terrain) ----
  function ensureTile(px: number, pz: number) {
    const heightAt = bridge.current?.heightAt;
    if (!heightAt) return;
    const pgx = px / block + gridOffset;
    const pgz = pz / block + gridOffset;

    let tile = tileRef.current;
    if (!tile) {
      tile = document.createElement('canvas');
      tile.width = TILE_PX;
      tile.height = TILE_PX;
      tileRef.current = tile;
      tileBaseRef.current = null;
    }

    const base = tileBaseRef.current;
    const baseGx = Math.round(pgx) - TILE_BLOCKS / 2;
    const baseGz = Math.round(pgz) - TILE_BLOCKS / 2;
    const drifted =
      base === null ||
      Math.abs(base.gx + TILE_BLOCKS / 2 - pgx) > REFRESH_BLOCKS ||
      Math.abs(base.gz + TILE_BLOCKS / 2 - pgz) > REFRESH_BLOCKS;
    if (!drifted) return;

    const ctx = tile.getContext('2d');
    if (!ctx) return;
    const cell = PX_PER_BLOCK;
    for (let lz = 0; lz < TILE_BLOCKS; lz++) {
      for (let lx = 0; lx < TILE_BLOCKS; lx++) {
        const gx = baseGx + lx;
        const gz = baseGz + lz;
        ctx.fillStyle = heightColor(heightAt(gx, gz), gx, gz);
        ctx.fillRect(lx * cell, lz * cell, cell, cell);
      }
    }
    tileBaseRef.current = { gx: baseGx, gz: baseGz };
  }

  // ---- per-frame draw ----
  function draw(px: number, pz: number, yaw: number) {
    const canvas = canvasRef.current;
    const tile = tileRef.current;
    const base = tileBaseRef.current;
    if (!canvas || !tile || !base) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const S = sizeRef.current;
    const pgx = px / block + gridOffset;
    const pgz = pz / block + gridOffset;
    const scale = S / SRC_SPAN; // tile px -> css px

    // crop the visible window centred on the (fractional) player position
    const srcCenterX = (pgx - base.gx) * PX_PER_BLOCK;
    const srcCenterZ = (pgz - base.gz) * PX_PER_BLOCK;
    const half = SRC_SPAN / 2;
    const sx = Math.max(0, Math.min(TILE_PX - SRC_SPAN, srcCenterX - half));
    const sz = Math.max(0, Math.min(TILE_PX - SRC_SPAN, srcCenterZ - half));

    ctx.fillStyle = MINIMAP_BG;
    ctx.fillRect(0, 0, S, S);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tile, sx, sz, SRC_SPAN, SRC_SPAN, 0, 0, S, S);

    // --- chest markers: world -> screen (player-centred, north-up) ---
    const markers = bridge.current?.getMarkers?.() ?? [];
    const blocksToPx = S / MAP_BLOCKS;
    const now = performance.now();
    for (const m of markers) {
      const dx = (m.x - px) / block;
      const dz = (m.z - pz) / block;
      if (Math.abs(dx) > MAP_BLOCKS / 2 + 1 || Math.abs(dz) > MAP_BLOCKS / 2 + 1) {
        continue;
      }
      const mx = S / 2 + dx * blocksToPx;
      const mz = S / 2 + dz * blocksToPx;
      if (m.rare) {
        const pulse = 2.6 + 1.1 * Math.sin(now / 220);
        ctx.fillStyle = 'rgba(255, 214, 90, 0.35)';
        ctx.beginPath();
        ctx.arc(mx, mz, pulse + 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd24a';
      } else {
        ctx.fillStyle = '#e8912d';
      }
      ctx.beginPath();
      ctx.arc(mx, mz, m.rare ? 2.8 : 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // --- view cone + player arrow (yaw 0 faces +z = screen down) ---
    const angle = Math.atan2(Math.cos(yaw), Math.sin(yaw));
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(angle);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, S * 0.34, -0.5, 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffb020';
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.9)';
    ctx.lineWidth = 1.5;
    const r = Math.max(5, S * 0.075);
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.65, r * 0.62);
    ctx.lineTo(-r * 0.3, 0);
    ctx.lineTo(-r * 0.65, -r * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // --- north label (screen up = -z); nudged down a touch to clear the
    // circular bezel ring at the dial's top
    ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 3;
    ctx.fillText('N', S / 2, 6);
    ctx.shadowBlur = 0;
  }

  // ---- CITY MAP CACHE — the whole road map painted ONCE at 1 px per
  // block (asphalt / walkway from the same tint rule the dial uses,
  // city grass with a deterministic jitter, water rects on top) — then
  // reused for every open, so the overlay costs nothing after first
  // paint. ----
  /** City-map cache pixel colour at a grid block — shared by the full
   *  bake and the regional repaint after a footpath edit. */
  function cityCachePixel(gx: number, gz: number): [number, number, number] {
    const tint = cityMinimapTint(gx, gz);
    if (tint === 'road') return [52, 53, 59]; // dark asphalt (dial tone)
    if (tint === 'walk') return [143, 144, 148]; // stone walkway
    const j = ((((gx * 73856093) ^ (gz * 19349663)) >>> 0) % 1000) / 1000;
    const k = 0.86 + j * 0.28;
    return [(70 * k) | 0, (118 * k) | 0, (46 * k) | 0]; // city grass
  }

  /** The reference water rects, mapped image-px -> block-px of the
   *  cache and clipped to a region (the full bake passes the whole
   *  map; the regional repaint passes the edited rect). */
  function paintWaterRects(
    ctx: CanvasRenderingContext2D,
    lx0: number,
    lz0: number,
    w: number,
    h: number
  ): void {
    const uppZ = CITY_WD / CITY_IMG_H;
    ctx.fillStyle = '#27508f';
    for (const [wxp, wyp, ww, wh] of CITY_WATER) {
      const bx =
        (CITY_WX0 + wxp * CITY_UPP) / block + gridOffset - CITY_GRID.gx0;
      const bz =
        (CITY_WZ0 + wyp * uppZ) / block + gridOffset - CITY_GRID.gz0;
      const bw = (ww * CITY_UPP) / block;
      const bh = (wh * uppZ) / block;
      const x0 = Math.max(bx, lx0);
      const z0 = Math.max(bz, lz0);
      const x1 = Math.min(bx + bw, lx0 + w);
      const z1 = Math.min(bz + bh, lz0 + h);
      if (x1 <= x0 || z1 <= z0) continue;
      ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
    }
  }

  function ensureCityMap(): HTMLCanvasElement | null {
    const cached = mapCacheRef.current;
    if (cached) return cached;
    const MW = CITY_GRID.gx1 - CITY_GRID.gx0 + 1;
    const MH = CITY_GRID.gz1 - CITY_GRID.gz0 + 1;
    const cv = document.createElement('canvas');
    cv.width = MW;
    cv.height = MH;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(MW, MH);
    const data = img.data;
    for (let lz = 0; lz < MH; lz++) {
      const gz = CITY_GRID.gz0 + lz;
      for (let lx = 0; lx < MW; lx++) {
        const gx = CITY_GRID.gx0 + lx;
        const [r, g, b] = cityCachePixel(gx, gz);
        const o = (lz * MW + lx) * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // water rects traced from the reference (the same rects the deck's
    // base bake paints) — mapped image-px -> block-px of this cache
    paintWaterRects(ctx, 0, 0, MW, MH);
    mapCacheRef.current = cv;
    // warm the router's cost layers now (one-time, same street raster
    // the loop above just painted) so the first click plans instantly
    ensureCityRouteGrid();
    return cv;
  }

  // ---- zoom / pan view math — every layer of the overlay (map cache,
  // paint preview, route bake, pins, player marker, brush ring) is
  // composited through this ONE transform, so zoom never desyncs ----
  /** Visible cache-px span at the current zoom. */
  function viewSpan(): { vw: number; vh: number } {
    const cache = mapCacheRef.current;
    const zoom = zoomRef.current;
    if (!cache) return { vw: 0, vh: 0 };
    return { vw: cache.width / zoom, vh: cache.height / zoom };
  }

  /** Keep the view rect fully inside the map (centre-locked at fit). */
  function clampView(): void {
    const cache = mapCacheRef.current;
    const view = viewRef.current;
    if (!cache || !view) return;
    const { vw, vh } = viewSpan();
    view.x =
      vw >= cache.width
        ? cache.width / 2
        : Math.min(cache.width - vw / 2, Math.max(vw / 2, view.x));
    view.z =
      vh >= cache.height
        ? cache.height / 2
        : Math.min(cache.height - vh / 2, Math.max(vh / 2, view.z));
  }

  /** Zoom by factor `f`, pinning the cache point under the fractional
   *  screen position (wheel zooms at the cursor, buttons at centre). */
  function zoomAt(f: number, mxFrac = 0.5, mzFrac = 0.5): void {
    const cache = mapCacheRef.current;
    if (!cache) return;
    const z0 = zoomRef.current;
    const z1 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z0 * f));
    if (z1 === z0) return;
    if (!viewRef.current) {
      viewRef.current = { x: cache.width / 2, z: cache.height / 2 };
    }
    const view = viewRef.current;
    const fx = view.x + (mxFrac - 0.5) * (cache.width / z0);
    const fz = view.z + (mzFrac - 0.5) * (cache.height / z0);
    view.x = fx - (mxFrac - 0.5) * (cache.width / z1);
    view.z = fz - (mzFrac - 0.5) * (cache.height / z1);
    zoomRef.current = z1;
    clampView();
  }

  /** Back to the whole-map fit view (the chip under the zoom buttons). */
  function resetZoom(): void {
    zoomRef.current = 1;
    viewRef.current = null;
  }

  /** Pointer event -> cache-px map point through the current view —
   *  THE one transform every route click, stroke and ring goes through. */
  function mapPointFromEvent(e: {
    clientX: number;
    clientY: number;
    currentTarget: HTMLCanvasElement;
  }): { fx: number; fz: number } | null {
    const cache = mapCacheRef.current;
    if (!cache) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    if (!viewRef.current) {
      viewRef.current = { x: cache.width / 2, z: cache.height / 2 };
    }
    const { vw, vh } = viewSpan();
    return {
      fx:
        viewRef.current.x +
        ((e.clientX - rect.left) / rect.width - 0.5) * vw,
      fz:
        viewRef.current.z +
        ((e.clientY - rect.top) / rect.height - 0.5) * vh,
    };
  }

  // ---- the OPEN overlay draw: cache + live player marker + coords ----
  function drawBigMap(): void {
    const cv = bigCanvasRef.current;
    if (!cv) return;
    const cache = ensureCityMap();
    if (!cache) return;
    let size = bigSizeRef.current;
    if (!size) {
      const rect = cv.getBoundingClientRect();
      size = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
      bigSizeRef.current = size;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(size.w);
    const H = Math.round(size.h);
    const bw = Math.round(W * dpr);
    const bh = Math.round(H * dpr);
    if (cv.width !== bw || cv.height !== bh) {
      cv.width = bw;
      cv.height = bh;
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = MINIMAP_BG;
    ctx.fillRect(0, 0, W, H);
    if (!viewRef.current) {
      viewRef.current = { x: cache.width / 2, z: cache.height / 2 };
    }
    clampView();
    const { vw, vh } = viewSpan();
    const view = viewRef.current;
    const sx = view.x - vw / 2;
    const sz = view.z - vh / 2;
    // cache px -> screen px through the zoom/pan view
    const toX = (fx: number): number => ((fx - sx) / vw) * W;
    const toY = (fz: number): number => ((fz - sz) / vh) * H;
    ctx.drawImage(cache, sx, sz, vw, vh, 0, 0, W, H);

    // painted strokes — the live editor preview (cache px, same view)
    const editCv = editCanvasRef.current;
    if (editCv) {
      ctx.drawImage(editCv, sx, sz, vw, vh, 0, 0, W, H);
    }

    // ---- planned route (Google-style): baked amber line, white start
    // dot on the player's kerb, red teardrop pin on the clicked spot ----
    const routeCv = routeCanvasRef.current;
    const routeMeta = routeMetaRef.current;
    if (routeCv && routeMeta) {
      ctx.drawImage(routeCv, sx, sz, vw, vh, 0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(10, 10, 14, 0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(
        toX(routeMeta.startFx),
        toY(routeMeta.startFz),
        3.4,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.stroke();
      drawDestPin(
        ctx,
        toX(routeMeta.destFx),
        toY(routeMeta.destFz),
        Math.max(10, W * 0.016)
      );
    }
    const p = posRef.current;
    const fx = p.x / block + gridOffset - CITY_GRID.gx0;
    const fz = p.z / block + gridOffset - CITY_GRID.gz0;
    const mx = toX(fx);
    const mz = toY(fz);
    const onScreen = mx > -60 && mx < W + 60 && mz > -60 && mz < H + 60;
    const pulse = 7 + 2.2 * Math.sin(performance.now() / 300);
    if (onScreen) {
      ctx.strokeStyle = 'rgba(255, 176, 32, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, mz, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (onScreen) {
      const angle = Math.atan2(Math.cos(p.yaw), Math.sin(p.yaw));
      ctx.save();
      ctx.translate(mx, mz);
      ctx.rotate(angle);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, Math.max(26, W * 0.045), -0.5, 0.5);
      ctx.closePath();
      ctx.fill();
      const r = Math.max(7, W * 0.011);
      ctx.fillStyle = '#ffb020';
      ctx.strokeStyle = 'rgba(20, 20, 20, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.65, r * 0.62);
      ctx.lineTo(-r * 0.3, 0);
      ctx.lineTo(-r * 0.65, -r * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // the adjustable brush ring — the "scale" the painter drags over
    // the map, in the colour of the active tool
    const ptr = pointerRef.current;
    if (editOnRef.current && ptr) {
      const bx = toX(ptr.fx);
      const by = toY(ptr.fz);
      const brad = Math.max(2.5, (editBrushRef.current / 2) * (W / vw));
      const ringCol =
        editToolRef.current === 'erase'
          ? 'rgba(255, 82, 82, 0.9)'
          : editToolRef.current === 'road'
            ? 'rgba(235, 238, 245, 0.9)'
            : 'rgba(255, 176, 32, 0.9)';
      ctx.strokeStyle = ringCol;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bx, by, brad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ringCol;
      ctx.beginPath();
      ctx.arc(bx, by, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // zoom readout chip (imperative textContent — zero re-renders)
    if (zoomChipRef.current) {
      zoomChipRef.current.textContent =
        zoomRef.current > 1.02 ? `×${zoomRef.current.toFixed(1)}` : 'fit';
    }

    // north label (screen up = -z, same convention as the dial)
    ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 3;
    ctx.fillText('N', W / 2, 8);
    ctx.shadowBlur = 0;

    // live grid coordinates (textContent only — zero re-renders)
    if (coordsRef.current) {
      coordsRef.current.textContent = `GX ${Math.round(p.x / block + gridOffset)} · GZ ${Math.round(p.z / block + gridOffset)}`;
    }
  }

  // ---- ROUTE PLANNING (Google-style): click -> A* over the street
  // raster -> a polyline canvas baked ONCE at 1 px per block (the same
  // space as the map cache) + pin metadata, composited every frame in
  // drawBigMap under the live player marker. ----
  function showRouteMsg(msg: string): void {
    const el = routeMsgRef.current;
    if (!el) return;
    el.textContent = msg;
    el.style.display = '';
    if (routeMsgTimerRef.current !== null) {
      window.clearTimeout(routeMsgTimerRef.current);
    }
    routeMsgTimerRef.current = window.setTimeout(() => {
      routeMsgTimerRef.current = null;
      if (routeMsgRef.current) routeMsgRef.current.style.display = 'none';
    }, 2600);
  }

  function bakeRoute(destFx: number, destFz: number): void {
    const cache = mapCacheRef.current;
    if (!cache) return;
    const p = posRef.current;
    const route = findCityRoute(
      p.x / block + gridOffset,
      p.z / block + gridOffset,
      CITY_GRID.gx0 + destFx,
      CITY_GRID.gz0 + destFz
    );
    if (!route || route.pts.length < 2) {
      showRouteMsg('no road route there');
      return;
    }
    // bake the polyline once at 1 px per block (cache px == grid px)
    let rc = routeCanvasRef.current;
    if (!rc) {
      rc = document.createElement('canvas');
      routeCanvasRef.current = rc;
    }
    rc.width = cache.width;
    rc.height = cache.height;
    const rctx = rc.getContext('2d');
    if (!rctx) return;
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    rctx.clearRect(0, 0, rc.width, rc.height);
    rctx.lineJoin = 'round';
    rctx.lineCap = 'round';
    const trace = () => {
      rctx.beginPath();
      rctx.moveTo(
        route.pts[0] - CITY_GRID.gx0 + 0.5,
        route.pts[1] - CITY_GRID.gz0 + 0.5
      );
      for (let k = 2; k < route.pts.length; k += 2) {
        rctx.lineTo(
          route.pts[k] - CITY_GRID.gx0 + 0.5,
          route.pts[k + 1] - CITY_GRID.gz0 + 0.5
        );
      }
    };
    trace(); // dark casing under a bright amber core — the Google look
    rctx.strokeStyle = 'rgba(10, 10, 14, 0.55)';
    rctx.lineWidth = 6;
    rctx.stroke();
    trace();
    rctx.strokeStyle = '#ffc23d';
    rctx.lineWidth = 3.2;
    rctx.stroke();

    const p2 = posRef.current;
    routeMetaRef.current = {
      destFx,
      destFz,
      startFx: p2.x / block + gridOffset - CITY_GRID.gx0,
      startFz: p2.z / block + gridOffset - CITY_GRID.gz0,
      blocks: route.blocks,
    };
    if (clearBtnRef.current) clearBtnRef.current.style.display = '';
    // push the plan INTO THE WORLD: GPS chevrons on the real road decks
    // + destination light pillar (see src/game/cityRouteGuide.ts)
    setCityRouteGuide(route.pts, block);
    if (distRef.current) {
      const m = route.blocks * CITY_M_PER_BLOCK;
      distRef.current.textContent =
        m < 950 ? `≈ ${Math.round(m)} m` : `≈ ${(m / 1000).toFixed(1)} km`;
      distRef.current.style.display = '';
    }
    if (routeMsgRef.current) routeMsgRef.current.style.display = 'none';
  }

  function clearRoute(): void {
    routeCanvasRef.current = null;
    routeMetaRef.current = null;
    setCityRouteGuide(null, block);
    syncRouteUi();
  }

  /** The overlay REMOUNTS every open — re-apply the imperative nav UI
   *  (clear button + distance chip) for a route planned earlier. */
  function syncRouteUi(): void {
    const meta = routeMetaRef.current;
    if (clearBtnRef.current) {
      clearBtnRef.current.style.display = meta ? '' : 'none';
    }
    if (distRef.current) {
      if (meta) {
        const m = meta.blocks * CITY_M_PER_BLOCK;
        distRef.current.textContent =
          m < 950 ? `≈ ${Math.round(m)} m` : `≈ ${(m / 1000).toFixed(1)} km`;
        distRef.current.style.display = '';
      } else {
        distRef.current.style.display = 'none';
      }
    }
    if (routeMsgRef.current) routeMsgRef.current.style.display = 'none';
  }

  function onMapClick(e: ReactMouseEvent<HTMLCanvasElement>): void {
    if (editOnRef.current) return; // the painter owns the clicks
    const pt = mapPointFromEvent(e);
    const cache = mapCacheRef.current;
    if (!pt || !cache) return;
    if (
      pt.fx < 0 ||
      pt.fz < 0 ||
      pt.fx >= cache.width ||
      pt.fz >= cache.height
    ) {
      return;
    }
    bakeRoute(pt.fx, pt.fz);
  }

  // ---- MAP PAINTER (3 colours × 4 shapes): FREE drag (freehand),
  // LINE drag (perfectly straight strokes), POLYLINE (click vertices,
  // Enter/double-click commits, Backspace pops one) and RECT drag
  // (filled rectangle); a plain click STAMPS one brush disc. On commit
  // the stroke hits every layer at once (physics raster, map + router
  // grids, persistence) and only the touched deck tiles rebuild. Wheel
  // zooms, right-drag pans, [ ] resize the brush scale, Ctrl+Z undoes
  // the last stroke. ----
  function toggleEdit(): void {
    setEditOn(!editOn);
    drawingRef.current = false;
    drawPtsRef.current = [];
    polyPtsRef.current = [];
    curvePtsRef.current = [];
    shapeAnchorRef.current = null;
    shapeCurRef.current = null;
    drawEditPreview();
  }

  /** Switch the stroke shape tool (buttons or F/L/P/R/C keys) — any
   *  pending freehand / polyline / curve / drag state clears with it. */
  function pickShape(
    shape: 'free' | 'line' | 'poly' | 'rect' | 'curve'
  ): void {
    setEditShape(shape);
    drawingRef.current = false;
    drawPtsRef.current = [];
    polyPtsRef.current = [];
    curvePtsRef.current = [];
    shapeAnchorRef.current = null;
    shapeCurRef.current = null;
    drawEditPreview();
  }

  /** Pointer event -> cache-px map point, or null outside the map. */
  function eventPoint(
    e: ReactPointerEvent<HTMLCanvasElement>
  ): { fx: number; fz: number } | null {
    const cache = mapCacheRef.current;
    const pt = mapPointFromEvent(e);
    if (!cache || !pt) return null;
    if (
      pt.fx < 0 ||
      pt.fz < 0 ||
      pt.fx >= cache.width ||
      pt.fz >= cache.height
    ) {
      return null;
    }
    return pt;
  }

  /** Add a deduped point to the freehand stroke. */
  function appendDrawPoint(pt: { fx: number; fz: number }): void {
    const pts = drawPtsRef.current;
    const n = pts.length;
    if (n >= 2 && Math.hypot(pt.fx - pts[n - 2], pt.fz - pts[n - 1]) < 0.8) {
      return;
    }
    pts.push(pt.fx, pt.fz);
    drawEditPreview();
  }

  /** The preview layer: the ACTIVE shape — freehand polyline, line
   *  rubber-band, rect outline, or the polyline chain + dashed rubber
   *  band to the cursor — in the tool's colour at the brush width. */
  function drawEditPreview(): void {
    const cache = mapCacheRef.current;
    if (!cache) return;
    let cv = editCanvasRef.current;
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = cache.width;
      cv.height = cache.height;
      editCanvasRef.current = cv;
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle =
      editToolRef.current === 'erase'
        ? 'rgba(255, 82, 82, 0.95)'
        : editToolRef.current === 'road'
          ? 'rgba(235, 238, 245, 0.95)'
          : 'rgba(255, 176, 32, 0.95)';
    ctx.lineWidth = Math.max(1, editBrushRef.current);
    const shape = editShapeRef.current;
    if (shape === 'free') {
      const pts = drawPtsRef.current;
      if (pts.length < 4) return;
      ctx.beginPath();
      ctx.moveTo(pts[0] + 0.5, pts[1] + 0.5);
      for (let i = 2; i < pts.length; i += 2) {
        ctx.lineTo(pts[i] + 0.5, pts[i + 1] + 0.5);
      }
      ctx.stroke();
      return;
    }
    if (shape === 'line' || shape === 'rect') {
      const a = shapeAnchorRef.current;
      const c = shapeCurRef.current;
      if (!a || !c) return;
      if (shape === 'line') {
        ctx.beginPath();
        ctx.moveTo(a.fx + 0.5, a.fz + 0.5);
        ctx.lineTo(c.fx + 0.5, c.fz + 0.5);
        ctx.stroke();
      } else {
        ctx.strokeRect(
          Math.min(a.fx, c.fx) + 0.5,
          Math.min(a.fz, c.fz) + 0.5,
          Math.abs(c.fx - a.fx),
          Math.abs(c.fz - a.fz)
        );
      }
      return;
    }
    if (shape === 'curve') {
      const cur = curvePtsRef.current;
      const stage = cur.length / 2; // 0 none · 1 start placed · 2 bending
      const m = shapeCurRef.current ?? pointerRef.current;
      if (stage === 0 || !m) return;
      // placed endpoint markers
      ctx.fillStyle = ctx.strokeStyle;
      for (let i = 0; i < cur.length; i += 2) {
        ctx.beginPath();
        ctx.arc(cur[i] + 0.5, cur[i + 1] + 0.5, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (stage === 1) {
        // dashed rubber band start -> cursor
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(cur[0] + 0.5, cur[1] + 0.5);
        ctx.lineTo(m.fx + 0.5, m.fz + 0.5);
        ctx.stroke();
        ctx.restore();
        return;
      }
      // stage 2 — faint chord for reference + bend handle ring + the
      // LIVE curve sweeping through the cursor
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = Math.max(1, Math.min(3, editBrushRef.current));
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(cur[0] + 0.5, cur[1] + 0.5);
      ctx.lineTo(cur[2] + 0.5, cur[3] + 0.5);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(m.fx + 0.5, m.fz + 0.5, 3.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      const pts = quadBezierThrough(
        cur[0],
        cur[1],
        m.fx,
        m.fz,
        cur[2],
        cur[3]
      );
      ctx.beginPath();
      ctx.moveTo(pts[0] + 0.5, pts[1] + 0.5);
      for (let i = 2; i < pts.length; i += 2) {
        ctx.lineTo(pts[i] + 0.5, pts[i + 1] + 0.5);
      }
      ctx.stroke();
      return;
    }
    // poly — committed chain, then the dashed rubber band to the cursor
    const poly = polyPtsRef.current;
    const cur = shapeCurRef.current ?? pointerRef.current;
    if (poly.length >= 4) {
      ctx.beginPath();
      ctx.moveTo(poly[0] + 0.5, poly[1] + 0.5);
      for (let i = 2; i < poly.length; i += 2) {
        ctx.lineTo(poly[i] + 0.5, poly[i + 1] + 0.5);
      }
      ctx.stroke();
    }
    if (poly.length >= 2 && cur) {
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(poly[poly.length - 2] + 0.5, poly[poly.length - 1] + 0.5);
      ctx.lineTo(cur.fx + 0.5, cur.fz + 0.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Repaint the map cache over a world rect (the stroke's footprint):
   *  fresh tints + the water rects clipped to the region. */
  function repaintCacheRegion(rect: FootpathEditRect): void {
    const cache = mapCacheRef.current;
    if (!cache) return;
    const ctx = cache.getContext('2d');
    if (!ctx) return;
    const MW = cache.width;
    const MH = cache.height;
    const lx0 = Math.max(
      0,
      Math.floor(rect.wx0 / block + gridOffset - CITY_GRID.gx0)
    );
    const lz0 = Math.max(
      0,
      Math.floor(rect.wz0 / block + gridOffset - CITY_GRID.gz0)
    );
    const lx1 = Math.min(
      MW - 1,
      Math.ceil(rect.wx1 / block + gridOffset - CITY_GRID.gx0)
    );
    const lz1 = Math.min(
      MH - 1,
      Math.ceil(rect.wz1 / block + gridOffset - CITY_GRID.gz0)
    );
    if (lx1 < lx0 || lz1 < lz0) return;
    const w = lx1 - lx0 + 1;
    const h = lz1 - lz0 + 1;
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let lz = 0; lz < h; lz++) {
      for (let lx = 0; lx < w; lx++) {
        const [r, g, b] = cityCachePixel(
          CITY_GRID.gx0 + lx0 + lx,
          CITY_GRID.gz0 + lz0 + lz
        );
        const o = (lz * w + lx) * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, lx0, lz0);
    paintWaterRects(ctx, lx0, lz0, w, h);
  }

  /** One shared finisher for every committed stroke: re-sample the A*
   *  cost layers, rebuild only the touched 3D deck tiles, repaint that
   *  slice of the map cache and mark the dial tile stale. */
  function refreshEditedRegion(rect: FootpathEditRect): void {
    cityRouteRefreshRegion(rect.wx0, rect.wz0, rect.wx1, rect.wz1);
    bridge.current?.rebuildCityDeck?.(
      rect.wx0,
      rect.wz0,
      rect.wx1,
      rect.wz1
    );
    repaintCacheRegion(rect);
    tileBaseRef.current = null;
  }

  /** Serpentine spine covering a rectangle — the capsule stamper fills
   *  it solid because the run spacing stays under the brush diameter. */
  function rectSpine(
    ax: number,
    az: number,
    bx: number,
    bz: number
  ): number[] {
    const x0 = Math.min(ax, bx);
    const x1 = Math.max(ax, bx);
    const z0 = Math.min(az, bz);
    const z1 = Math.max(az, bz);
    const step = Math.max(0.6, editBrushRef.current * 0.7);
    const rows = Math.max(2, Math.ceil((z1 - z0) / step) + 1);
    const pts: number[] = [];
    for (let i = 0; i < rows; i++) {
      const z = z0 + ((z1 - z0) * i) / (rows - 1);
      if (i % 2 === 0) pts.push(x0, z, x1, z);
      else pts.push(x1, z, x0, z);
    }
    return pts;
  }

  /** Commit a cache-px stroke in the active colour: convert to world,
   *  apply to every layer, refresh the touched region. */
  function commitPts(pts: number[]): void {
    if (pts.length < 4) return;
    const cls: 0 | 1 | 2 =
      editToolRef.current === 'road'
        ? 2
        : editToolRef.current === 'walk'
          ? 1
          : 0;
    const rect = commitGroup([
      { pts, brush: editBrushRef.current, cls },
    ]);
    showRouteMsg(
      rect
        ? cls === 2
          ? 'road built'
          : cls === 1
            ? 'footpath built'
            : 'cut'
        : 'nothing painted there'
    );
    drawEditPreview();
  }

  /** Commit one or more cache-px strokes as ONE undo group: convert to
   *  world, apply to every layer, refresh the touched region. */
  function commitGroup(
    strokes: Array<{ pts: number[]; brush: number; cls: 0 | 1 | 2 }>
  ): FootpathEditRect | null {
    const world: Array<{ pts: number[]; r: number; cls: 0 | 1 | 2 }> = [];
    for (const s of strokes) {
      if (s.pts.length < 4) continue;
      const wpts: number[] = [];
      // cache px == grid px: spine -> world, brush -> world radius
      for (let i = 0; i < s.pts.length; i += 2) {
        wpts.push(
          (s.pts[i] + CITY_GRID.gx0 - gridOffset) * block,
          (s.pts[i + 1] + CITY_GRID.gz0 - gridOffset) * block
        );
      }
      world.push({ pts: wpts, r: (s.brush * block) / 2, cls: s.cls });
    }
    const rect = applyFootpathEdits(world);
    if (world.length > 0) setPaintDirty(true); // differs from the saved snapshot now
    if (rect) refreshEditedRegion(rect);
    return rect;
  }

  /** CURVE tool, third click / Enter: sample the bezier through the
   *  current bend and lay the road. A road curve commits its spine
   *  FIRST then the two flanking kerb footpath spines — the road arrives
   *  WITH its footpaths in the same beat, one Ctrl+Z pops all three. */
  function commitCurve(): void {
    const cur = curvePtsRef.current;
    if (cur.length < 4) return; // nothing placed yet — keep the pending curve
    const m = shapeCurRef.current ?? pointerRef.current;
    const mx = m ? m.fx : (cur[0] + cur[2]) / 2;
    const mz = m ? m.fz : (cur[1] + cur[3]) / 2;
    curvePtsRef.current = [];
    shapeCurRef.current = null;
    lastCurveCommitRef.current = performance.now();
    const pts = quadBezierThrough(cur[0], cur[1], mx, mz, cur[2], cur[3]);
    const brush = editBrushRef.current;
    if (editToolRef.current === 'road') {
      // kerb footpaths flank the road: same-ish width, centres just
      // touching the road edge (0.35 blk overlap keeps curvy gaps shut).
      // ORDER MATTERS: flanks stamp FIRST, the road spine LAST — the
      // road disc then re-covers the spine cells the overlapping flank
      // discs reach, so the roadbody stays pure asphalt (no stray kerb
      // bumps mid-road) and the replay after a reload reproduces it.
      const fBrush = Math.max(2, brush);
      const d = brush / 2 + fBrush / 2 - 0.35;
      const [left, right] = offsetPolyline(pts, d);
      const rect = commitGroup([
        { pts: left, brush: fBrush, cls: 1 },
        { pts: right, brush: fBrush, cls: 1 },
        { pts, brush, cls: 2 },
      ]);
      showRouteMsg(
        rect ? 'road + kerbed footpaths built' : 'nothing painted there'
      );
    } else {
      const cls: 0 | 1 | 2 = editToolRef.current === 'walk' ? 1 : 0;
      const rect = commitGroup([{ pts, brush, cls }]);
      showRouteMsg(
        rect ? (cls === 1 ? 'footpath built' : 'cut') : 'nothing painted there'
      );
    }
    drawEditPreview();
  }

  /** Commit / discard the pending shape (Enter or double-click commits
   *  a polyline, Enter or the third click lays a bent curve, Escape
   *  clears, Backspace pops a vertex). */
  function commitPoly(): void {
    if (editShapeRef.current === 'curve') {
      commitCurve();
      return;
    }
    const poly = polyPtsRef.current;
    polyPtsRef.current = [];
    if (poly.length >= 4) commitPts(poly);
    else drawEditPreview();
  }

  /** UNDO: pop the newest commit (one stroke or a whole curve group
   *  with its flanking footpaths) from the store, replay the rest onto
   *  both rasters and rebuild just the popped footprint. */
  function onUndoFootpathEdit(): void {
    const rect = undoLastFootpathEdit();
    if (!rect) {
      showRouteMsg('nothing to undo');
      return;
    }
    setPaintDirty(true);
    refreshEditedRegion(rect);
    drawEditPreview();
    showRouteMsg('undone');
  }

  function onMapPointerDown(e: ReactPointerEvent<HTMLCanvasElement>): void {
    // right / middle button pans the zoomed map in BOTH modes
    if (e.button === 2 || e.button === 1) {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture refused — window dragging still works */
      }
      panRef.current = { cx: e.clientX, cz: e.clientY };
      return;
    }
    if (e.button !== 0 || !editOnRef.current) return; // left = route click
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture refused — window dragging still works */
    }
    const shape = editShapeRef.current;
    if (shape === 'poly') {
      // polyline: every click drops a vertex; Enter/double-click commits
      const pt = eventPoint(e);
      if (!pt) return;
      const poly = polyPtsRef.current;
      const n = poly.length;
      if (
        n >= 2 &&
        Math.hypot(pt.fx - poly[n - 2], pt.fz - poly[n - 1]) < 0.8
      ) {
        return;
      }
      poly.push(pt.fx, pt.fz);
      shapeCurRef.current = pt;
      drawEditPreview();
      return;
    }
    if (shape === 'curve') {
      // curve: click 1 = start, click 2 = end (line placed), then the
      // cursor BENDS it live and click 3 lays it at the current bend
      const pt = eventPoint(e);
      if (!pt) return;
      const cur = curvePtsRef.current;
      const stage = cur.length / 2;
      if (stage < 2) {
        if (
          stage === 1 &&
          Math.hypot(pt.fx - cur[0], pt.fz - cur[1]) < 0.8
        ) {
          return;
        }
        cur.push(pt.fx, pt.fz);
        shapeCurRef.current = pt;
        drawEditPreview();
        return;
      }
      commitCurve();
      return;
    }
    drawingRef.current = true;
    if (shape === 'line' || shape === 'rect') {
      const pt = eventPoint(e);
      if (pt) {
        shapeAnchorRef.current = pt;
        shapeCurRef.current = pt;
      }
      drawEditPreview();
      return;
    }
    // freehand
    drawPtsRef.current = [];
    const pt = eventPoint(e);
    if (pt) appendDrawPoint(pt);
  }

  function onMapPointerMove(e: ReactPointerEvent<HTMLCanvasElement>): void {
    if (panRef.current) {
      const cache = mapCacheRef.current;
      const rect = e.currentTarget.getBoundingClientRect();
      if (cache && viewRef.current && rect.width > 1 && rect.height > 1) {
        const { vw, vh } = viewSpan();
        viewRef.current.x -=
          ((e.clientX - panRef.current.cx) / rect.width) * vw;
        viewRef.current.z -=
          ((e.clientY - panRef.current.cz) / rect.height) * vh;
        clampView();
      }
      panRef.current = { cx: e.clientX, cz: e.clientY };
      return;
    }
    pointerRef.current = mapPointFromEvent(e);
    if (!drawingRef.current) {
      // a pending polyline or curve drags its rubber band / bend with
      // the cursor
      if (
        polyPtsRef.current.length > 0 ||
        curvePtsRef.current.length > 0
      ) {
        shapeCurRef.current = pointerRef.current;
        drawEditPreview();
      }
      return;
    }
    const shape = editShapeRef.current;
    if (shape === 'line' || shape === 'rect') {
      shapeCurRef.current = pointerRef.current;
      drawEditPreview();
      return;
    }
    if (shape === 'free' && pointerRef.current) {
      appendDrawPoint(pointerRef.current);
    }
  }

  function onMapPointerUp(e: ReactPointerEvent<HTMLCanvasElement>): void {
    if (panRef.current) {
      panRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    const shape = editShapeRef.current;
    if (shape === 'line' || shape === 'rect') {
      const a = shapeAnchorRef.current;
      const c = shapeCurRef.current;
      shapeAnchorRef.current = null;
      shapeCurRef.current = null;
      if (a && c && Math.hypot(c.fx - a.fx, c.fz - a.fz) >= 0.5) {
        commitPts(
          shape === 'line'
            ? [a.fx, a.fz, c.fx, c.fz]
            : rectSpine(a.fx, a.fz, c.fx, c.fz)
        );
      } else {
        drawEditPreview();
      }
      return;
    }
    // freehand — a plain click (one point) STAMPS a single brush disc
    const pts = drawPtsRef.current;
    drawPtsRef.current = [];
    if (pts.length === 2) pts.push(pts[0], pts[1]);
    commitPts(pts);
  }

  /** Double-click finishes a pending polyline (the classic CAD-style
   *  commit alongside Enter); for the curve tool it only sweeps away
   *  the stray fresh start that a double-click's second click made
   *  right after committing a bend. */
  function onMapDoubleClick(): void {
    if (!editOnRef.current) return;
    if (editShapeRef.current === 'poly') {
      commitPoly();
    } else if (
      editShapeRef.current === 'curve' &&
      curvePtsRef.current.length === 2 &&
      performance.now() - lastCurveCommitRef.current < 400
    ) {
      curvePtsRef.current = [];
      shapeCurRef.current = null;
      drawEditPreview();
    }
  }

  function onResetFootpathEdits(): void {
    const rect = resetFootpathEdits();
    editCanvasRef.current = null;
    drawPtsRef.current = [];
    polyPtsRef.current = [];
    curvePtsRef.current = [];
    shapeAnchorRef.current = null;
    shapeCurRef.current = null;
    drawEditPreview();
    if (rect) {
      refreshEditedRegion(rect);
    }
    setPaintDirty(true); // the snapshot still holds the pre-reset strokes
    showRouteMsg('footpath edits reset — save to make it permanent');
  }

  /** SAVE: push the WHOLE stroke list to the permanent server snapshot
   *  (overwrite-only — the previous version is gone the moment this
   *  lands, by design). The working copy keeps living in localStorage
   *  exactly as before; the snapshot is what every browser restores
   *  when its local store is empty. */
  function onSaveFootpathEdits(): void {
    if (saveBusyRef.current) return;
    saveBusyRef.current = true;
    setSaveState('saving');
    void (async () => {
      try {
        const res = await pushServerFootpathEdits(listFootpathEdits());
        if (res.ok) {
          setSavedAt(res.savedAt ?? new Date().toISOString());
          setPaintDirty(false);
          setSaveState('saved');
          showRouteMsg(
            res.fileSaved === false
              ? 'saved to server — game file write failed'
              : 'saved permanently · baked into the game files'
          );
        } else {
          setSaveState('error');
          showRouteMsg('save failed — try again');
        }
      } catch {
        setSaveState('error');
        showRouteMsg('save failed — try again');
      } finally {
        saveBusyRef.current = false;
        window.setTimeout(() => {
          setSaveState((s) => (s === 'saved' || s === 'error' ? 'idle' : s));
        }, 2400);
      }
    })();
  }

  // ---- painter hotkeys (declared AFTER the handlers above so the
  // effect closure captures them in declaration order): [ and ] (or
  // - / +) resize the brush WHILE painting, 1/2/3 pick the colour,
  // F/L/P/R the shape tool, Ctrl+Z undoes the last stroke, Enter
  // commits a pending polyline, Backspace pops its last vertex ----
  useEffect(() => {
    if (!editOn) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        onSaveFootpathEdits();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        onUndoFootpathEdit();
        return;
      }
      if (e.key === '[' || e.key === '-') {
        e.preventDefault();
        setEditBrush((b) => Math.max(BRUSH_MIN, b - 1));
      } else if (e.key === ']' || e.key === '=' || e.key === '+') {
        e.preventDefault();
        setEditBrush((b) => Math.min(BRUSH_MAX, b + 1));
      } else if (e.key === '1') {
        setEditTool('road');
      } else if (e.key === '2') {
        setEditTool('walk');
      } else if (e.key === '3') {
        setEditTool('erase');
      } else if (e.key === 'f' || e.key === 'F') {
        pickShape('free');
      } else if (e.key === 'l' || e.key === 'L') {
        pickShape('line');
      } else if (e.key === 'p' || e.key === 'P') {
        pickShape('poly');
      } else if (e.key === 'r' || e.key === 'R') {
        pickShape('rect');
      } else if (e.key === 'c' || e.key === 'C') {
        pickShape('curve');
      } else if (e.key === 'Enter') {
        commitPoly();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        if (polyPtsRef.current.length >= 2) {
          polyPtsRef.current.splice(-2, 2);
          drawEditPreview();
        } else if (curvePtsRef.current.length === 4) {
          // curve: drop the end point — back to placing it
          curvePtsRef.current.splice(-2, 2);
          drawEditPreview();
        } else if (curvePtsRef.current.length === 2) {
          // curve: drop the start point entirely
          curvePtsRef.current = [];
          shapeCurRef.current = null;
          drawEditPreview();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editOn]);

  useImperativeHandle(api, () => ({
    update(x, z, yaw) {
      ensureTile(x, z);
      draw(x, z, yaw);
      // city-map bookkeeping: remember the pose, flip the "in city"
      // state only on change (React bails out otherwise) and redraw the
      // open overlay's live marker in the same pass
      posRef.current = { x, z, yaw };
      const gx = x / block + gridOffset;
      const gz = z / block + gridOffset;
      const inNow =
        gx >= CITY_GRID.gx0 &&
        gx <= CITY_GRID.gx1 &&
        gz >= CITY_GRID.gz0 &&
        gz <= CITY_GRID.gz1;
      if (inNow !== inCityRef.current) {
        inCityRef.current = inNow;
        setInCity(inNow);
      }
      if (openRef.current) drawBigMap();
      // NOTE: the plan is deliberately STABLE (user request) — once the
      // chevrons are down they NEVER move while you drive. The route
      // only changes when a new destination is clicked on the map or
      // CLEAR ROUTE is pressed.
    },
  }));

  // ---- canvas backing store sizing (crisp on HiDPI) ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      const css = rect.width || 150;
      sizeRef.current = css;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(css * dpr);
      canvas.height = Math.round(css * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      tileRef.current = null;
      tileBaseRef.current = null;
    };
  }, []);

  // ---- overlay lifecycle: keep the imperative open flag in sync,
  // close on ESC, wheel-zoom the map, and paint the big map the moment
  // it opens (always at the fit view — no stale zoom from last time) ----
  useEffect(() => {
    openRef.current = open;
    if (!open) {
      bigSizeRef.current = null;
      resetZoom();
      panRef.current = null;
      pointerRef.current = null;
      // NOTE: the plan itself SURVIVES closing — the world guide keeps
      // navigating (arrows on the road + beacon) Google-style; clear it
      // via the map's CLEAR ROUTE button or by planning a new one.
      return;
    }
    resetZoom();
    // CAPTURE phase + stopImmediatePropagation — the same pattern the
    // lobby's book/forge panels use — so the game's own Escape handler
    // (Esc returns to the lobby) never fires while the city map is open.
    // The remount also wiped the imperative nav UI — restore it for any
    // route that is still being navigated in the world.
    syncRouteUi();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        // a pending polyline or curve eats the first Escape — cancel it,
        // keep the map open; a second Escape then closes the map as usual
        if (
          editOnRef.current &&
          (polyPtsRef.current.length > 0 || curvePtsRef.current.length > 0)
        ) {
          polyPtsRef.current = [];
          curvePtsRef.current = [];
          shapeCurRef.current = null;
          drawEditPreview();
          showRouteMsg(
            editShapeRef.current === 'curve'
              ? 'curve cancelled'
              : 'polyline cancelled'
          );
          return;
        }
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    // wheel zoom — NATIVE listener (React's onWheel is passive) with
    // preventDefault so the page never scrolls while zooming the map
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const c = bigCanvasRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      zoomAt(
        e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP,
        (e.clientX - rect.left) / rect.width,
        (e.clientY - rect.top) / rect.height
      );
    };
    const cv = bigCanvasRef.current;
    let ro: ResizeObserver | null = null;
    if (cv) {
      cv.addEventListener('wheel', onWheel, { passive: false });
      const measure = () => {
        const rect = cv.getBoundingClientRect();
        bigSizeRef.current = {
          w: Math.max(1, rect.width),
          h: Math.max(1, rect.height),
        };
      };
      measure();
      ro = new ResizeObserver(measure);
      ro.observe(cv);
    }
    const raf = requestAnimationFrame(() => drawBigMap());
    return () => {
      window.removeEventListener(
        'keydown',
        onKey,
        { capture: true } as EventListenerOptions
      );
      cv?.removeEventListener('wheel', onWheel);
      ro?.disconnect();
      cancelAnimationFrame(raf);
      bigSizeRef.current = null;
      resetZoom();
      panRef.current = null;
      pointerRef.current = null;
    };
  }, [open]);

  return (
    <>
      <div
        role={inCity ? 'button' : undefined}
        tabIndex={inCity ? 0 : undefined}
        aria-label={inCity ? 'Open the city road map' : undefined}
        aria-hidden={inCity ? undefined : true}
        onClick={inCity ? () => setOpen(true) : undefined}
        onKeyDown={
          inCity
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen(true);
                }
              }
            : undefined
        }
        className={`relative overflow-hidden rounded-full bg-zinc-950/60 shadow-xl backdrop-blur-sm ${
          inCity
            ? 'pointer-events-auto cursor-pointer border border-amber-300/80 shadow-[0_0_20px_rgba(251,191,36,0.4)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300'
            : 'pointer-events-none border border-amber-400/40'
        }`}
        style={{
          // lightly reduced (~13% smaller than the original 112/16vw/172):
          // the curved vitals ring (133% of this box, see HealthBar.tsx)
          // scales down with it and keeps its exact fit
          width: 'clamp(98px, 14vw, 150px)',
          aspectRatio: '1 / 1',
        }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
        {/* circular bezel: dark inner shading painted OVER the canvas so the
            square map crop reads as a recessed round dial */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            boxShadow:
              'inset 0 0 14px rgba(0,0,0,0.62), inset 0 0 3px rgba(0,0,0,0.85)',
          }}
        />
        {/* city affordance: only while the player is inside the road map */}
        {inCity && (
          <span className="pointer-events-none absolute inset-x-0 bottom-[6%] flex justify-center">
            <span className="flex animate-pulse items-center gap-1 rounded-full border border-amber-400/60 bg-zinc-950/85 px-1.5 py-[2px] text-[8px] font-black uppercase tracking-[0.14em] text-amber-300">
              <MapIcon className="h-2.5 w-2.5" aria-hidden />
              city map
            </span>
          </span>
        )}
      </div>

      {/* ===== the CITY ROAD MAP overlay (open only via the in-city dial) ===== */}
      {open && (
        <div
          className="fixed inset-0 z-[72] flex items-center justify-center bg-zinc-950/85 p-3 backdrop-blur-md sm:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="City road map"
        >
          <div
            className="pointer-events-auto relative flex w-full max-w-3xl flex-col gap-3 border border-amber-400/40 bg-zinc-950/95 p-4 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9)] sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <MapIcon className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                <h2 className="truncate text-xs font-black uppercase tracking-[0.22em] text-amber-300 sm:text-sm">
                  City Road Map
                </h2>
                <span
                  ref={coordsRef}
                  className="hidden rounded-full border border-zinc-700 bg-zinc-900/80 px-2 py-0.5 text-[10px] font-bold tabular-nums text-zinc-300 sm:inline"
                />
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close the city road map"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/80 text-zinc-300 transition hover:border-amber-400/60 hover:text-amber-300"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {/* ---- footpath editor toolbar (paint paths onto the world) ---- */}
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
              <button
                onClick={toggleEdit}
                aria-pressed={editOn}
                aria-label="Toggle the footpath editor"
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition ${
                  editOn
                    ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                    : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-amber-400/60 hover:text-amber-300'
                }`}
              >
                <Scissors className="h-3.5 w-3.5" aria-hidden />
                {editOn ? 'editing paths' : 'edit paths'}
              </button>
              {editOn && (
                <>
                  <button
                    onClick={() => setEditTool('road')}
                    aria-pressed={editTool === 'road'}
                    aria-label="Paint asphalt roads"
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition ${
                      editTool === 'road'
                        ? 'border-zinc-100 bg-zinc-100/10 text-zinc-100'
                        : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-zinc-400/60'
                    }`}
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-sm border border-zinc-500"
                      style={{ background: '#34353b' }}
                    />
                    <Car className="h-3.5 w-3.5" aria-hidden />
                    road
                  </button>
                  <button
                    onClick={() => setEditTool('walk')}
                    aria-pressed={editTool === 'walk'}
                    aria-label="Paint stone footpaths"
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition ${
                      editTool === 'walk'
                        ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                        : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-amber-400/60'
                    }`}
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-sm border border-zinc-500"
                      style={{ background: '#8f9094' }}
                    />
                    <Footprints className="h-3.5 w-3.5" aria-hidden />
                    path
                  </button>
                  <button
                    onClick={() => setEditTool('erase')}
                    aria-pressed={editTool === 'erase'}
                    aria-label="Erase painted ways back to grass"
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition ${
                      editTool === 'erase'
                        ? 'border-red-400 bg-red-400/15 text-red-300'
                        : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-red-400/60'
                    }`}
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-sm border border-zinc-500"
                      style={{ background: '#467629' }}
                    />
                    <Eraser className="h-3.5 w-3.5" aria-hidden />
                    erase
                  </button>
                  <span className="mx-0.5 h-5 w-px bg-zinc-700" aria-hidden />
                  <button
                    onClick={() => pickShape('free')}
                    aria-pressed={editShape === 'free'}
                    aria-label="Freehand drawing tool (F)"
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition ${
                      editShape === 'free'
                        ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                        : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-amber-400/60'
                    }`}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    free
                  </button>
                  <button
                    onClick={() => pickShape('line')}
                    aria-pressed={editShape === 'line'}
                    aria-label="Straight line tool — drag from start to end (L)"
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition ${
                      editShape === 'line'
                        ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                        : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-amber-400/60'
                    }`}
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden />
                    line
                  </button>
                  <button
                    onClick={() => pickShape('poly')}
                    aria-pressed={editShape === 'poly'}
                    aria-label="Polyline tool — click vertices, Enter or double-click commits (P)"
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition ${
                      editShape === 'poly'
                        ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                        : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-amber-400/60'
                    }`}
                  >
                    <Spline className="h-3.5 w-3.5" aria-hidden />
                    polyline
                  </button>
                  <button
                    onClick={() => pickShape('curve')}
                    aria-pressed={editShape === 'curve'}
                    aria-label="Curve tool — click the start, click the end, move the mouse to bend the road, click again to lay it with kerbed footpaths (C)"
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition ${
                      editShape === 'curve'
                        ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                        : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-amber-400/60'
                    }`}
                  >
                    <PenTool className="h-3.5 w-3.5" aria-hidden />
                    curve
                  </button>
                  <button
                    onClick={() => pickShape('rect')}
                    aria-pressed={editShape === 'rect'}
                    aria-label="Filled rectangle tool — drag corner to corner (R)"
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition ${
                      editShape === 'rect'
                        ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                        : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-amber-400/60'
                    }`}
                  >
                    <Square className="h-3.5 w-3.5" aria-hidden />
                    rect
                  </button>
                  <span className="mx-0.5 h-5 w-px bg-zinc-700" aria-hidden />
                  <label className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-zinc-300">
                    brush
                    <input
                      type="range"
                      min={BRUSH_MIN}
                      max={BRUSH_MAX}
                      step={1}
                      value={editBrush}
                      onChange={(e) => setEditBrush(Number(e.target.value))}
                      aria-label="Brush scale in blocks — adjustable while painting"
                      className="h-1 w-24 accent-amber-400"
                    />
                    <span className="tabular-nums text-amber-300">
                      {editBrush} bl
                    </span>
                    <span className="hidden text-zinc-500 sm:inline">[ ]</span>
                  </label>
                  <button
                    onClick={onUndoFootpathEdit}
                    aria-label="Undo the last painted stroke (Ctrl+Z)"
                    className="flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-zinc-300 transition hover:border-amber-400/60 hover:text-amber-300"
                  >
                    <Undo2 className="h-3.5 w-3.5" aria-hidden />
                    undo
                  </button>
                  <button
                    onClick={onSaveFootpathEdits}
                    disabled={saveState === 'saving'}
                    aria-label="Save all painted paths permanently into the game's own files — overwrites the saved copy and the previous version cannot be restored (Ctrl+S)"
                    className={`relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition disabled:cursor-wait disabled:opacity-70 ${
                      saveState === 'saved'
                        ? 'border-emerald-400 bg-emerald-400/15 text-emerald-300'
                        : saveState === 'error'
                          ? 'border-red-400 bg-red-400/15 text-red-300'
                          : 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400 hover:bg-emerald-400/20'
                    }`}
                  >
                    {paintDirty && saveState === 'idle' && (
                      <span
                        aria-hidden
                        className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400"
                      />
                    )}
                    <Save className="h-3.5 w-3.5" aria-hidden />
                    {saveState === 'saving'
                      ? 'saving…'
                      : saveState === 'saved'
                        ? 'saved'
                        : saveState === 'error'
                          ? 'retry save'
                          : 'save'}
                  </button>
                  {savedAt && (
                    <span
                      role="status"
                      className="rounded-full border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400"
                    >
                      permanent · saved{' '}
                      {new Date(savedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                  <button
                    onClick={onResetFootpathEdits}
                    aria-label="Reset all painted footpath edits"
                    className="flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-zinc-300 transition hover:border-red-400/60 hover:text-red-300"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    reset
                  </button>
                </>
              )}
            </div>
            <div className="relative overflow-hidden rounded-md border border-zinc-700/80 bg-[#10131a]">
              <canvas
                ref={bigCanvasRef}
                onClick={onMapClick}
                onDoubleClick={onMapDoubleClick}
                onPointerDown={onMapPointerDown}
                onPointerMove={onMapPointerMove}
                onPointerUp={onMapPointerUp}
                onPointerCancel={onMapPointerUp}
                onPointerLeave={() => {
                  pointerRef.current = null;
                }}
                onContextMenu={(e) => e.preventDefault()}
                aria-label={
                  editOn
                    ? 'City road map painter — freehand, line, polyline, curve or rectangle in road, path or erase colours; click stamps, Enter commits a polyline or lays a bent curve, Ctrl+Z undoes, right-drag pans, wheel zooms, bracket keys resize the brush'
                    : 'City road map — click to plan a route, wheel zooms, right-drag pans'
                }
                style={{ touchAction: editOn ? 'none' : undefined }}
                className="block aspect-[1536/1024] w-full cursor-crosshair"
              />
              {/* zoom stack — the wheel works anywhere over the map too */}
              <div className="absolute right-2 top-2 flex flex-col gap-1">
                <button
                  onClick={() => {
                    zoomAt(ZOOM_STEP);
                    drawBigMap();
                  }}
                  aria-label="Zoom the map in"
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-600 bg-zinc-950/85 text-zinc-200 transition hover:border-amber-400/70 hover:text-amber-300"
                >
                  <ZoomIn className="h-4 w-4" aria-hidden />
                </button>
                <button
                  ref={zoomChipRef}
                  onClick={() => {
                    resetZoom();
                    drawBigMap();
                  }}
                  aria-label="Reset the map zoom to fit the whole city"
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-600 bg-zinc-950/85 text-[9px] font-black tabular-nums text-zinc-200 transition hover:border-amber-400/70 hover:text-amber-300"
                >
                  fit
                </button>
                <button
                  onClick={() => {
                    zoomAt(1 / ZOOM_STEP);
                    drawBigMap();
                  }}
                  aria-label="Zoom the map out"
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-600 bg-zinc-950/85 text-zinc-200 transition hover:border-amber-400/70 hover:text-amber-300"
                >
                  <ZoomOut className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: '#34353b' }}
                />
                asphalt
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: '#8f9094' }}
                />
                footpath
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: '#467629' }}
                />
                grass
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: '#27508f' }}
                />
                water
              </span>
              <span className="flex items-center gap-1.5 text-amber-300">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5"
                  style={{
                    background: '#ffb020',
                    clipPath: 'polygon(50% 0, 100% 100%, 0 100%)',
                  }}
                />
                you
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-[3px] w-4 rounded-full"
                  style={{ background: '#ffc23d' }}
                />
                route
              </span>
              <span ref={clearBtnRef} style={{ display: 'none' }} className="contents">
                <button
                  onClick={clearRoute}
                  className="rounded-full border border-zinc-700 bg-zinc-900/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300 transition hover:border-amber-400/60 hover:text-amber-300"
                >
                  clear route
                </button>
              </span>
              <span
                ref={distRef}
                style={{ display: 'none' }}
                className="rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black tabular-nums text-amber-200"
              />
              <span
                ref={routeMsgRef}
                role="status"
                style={{ display: 'none' }}
                className="text-[10px] font-bold uppercase tracking-wider text-rose-300"
              />
              <span className="ml-auto hidden text-zinc-500 md:inline">
                {editOn
                  ? 'free/line/rect drag · polyline: click + enter · curve: click, click, bend, click · click stamps · 1/2/3 colour · f l p r c tool · [ ] brush · ctrl+z undo · ctrl+s save · wheel zooms · right-drag pans'
                  : 'north is up · click to route · wheel zooms · right-drag pans · esc closes'}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default Minimap;
