/**
 * CITY FOOTPATH EDIT ORCHESTRATOR — one call applies minimap-painted
 * strokes to EVERY layer of the city so the painted path simply exists:
 *
 *   1. the physics raster (cityRoadSurface) — the very frame after the
 *      stroke, surfaceYAt / the jeep / the camera / the mobs ride it;
 *   2. the minimap tint + A* router layers (cityLayout) — the dial, the
 *      big map and the route planner see the new pathway instantly;
 *   3. the strokes join the persisted store (cityFootpathStore) so a
 *      reload replays them onto the fresh rasters;
 *   4. the returned world rect tells the caller which slice of the 3D
 *      deck to rebuild (cityRoadmapHandle.rebuildDeckRegion) — only the
 *      touched tiles re-sweep, so the blocks mine/place within a beat.
 *
 * A commit may carry SEVERAL strokes under one group id (the CURVE
 * tool's road + its two flanking footpaths): they land together and
 * UNDO pops the whole group as a unit.
 *
 * Pure orchestration: no three.js, no DOM.
 */

import {
  cityFootpathEditStrokeW,
  cityFootpathEditReset,
} from './cityRoadSurface';
import {
  cityMinimapEditStrokeW,
  cityMinimapEditsReset,
} from './cityLayout';
import {
  addFootpathEdit,
  clearFootpathEdits,
  listFootpathEdits,
  popLastFootpathEditGroup,
  setFootpathEdits,
  type FootpathEdit,
} from './cityFootpathStore';

/** The world rect a stroke (or a reset) touched — the deck-rebuild and
 *  map-repaint footprint. */
export interface FootpathEditRect {
  wx0: number;
  wz0: number;
  wx1: number;
  wz1: number;
}

/** One stroke of a commit: flat WORLD-space spine, brush radius in
 *  world units, and the paint class (1 = stone footpath, 2 = asphalt
 *  road, 0 = erase). */
export interface FootpathEditStroke {
  pts: number[];
  r: number;
  cls: 0 | 1 | 2;
}

/** Growing union-of-footprints accumulator. */
interface RectAcc {
  rect: FootpathEditRect | null;
}

/** Union a stroke's world footprint into the accumulator. */
function growRect(acc: RectAcc, e: FootpathEdit): void {
  for (let i = 0; i + 1 < e.pts.length; i += 2) {
    const x0 = e.pts[i] - e.r;
    const z0 = e.pts[i + 1] - e.r;
    const x1 = e.pts[i] + e.r;
    const z1 = e.pts[i + 1] + e.r;
    if (!acc.rect) {
      acc.rect = { wx0: x0, wz0: z0, wx1: x1, wz1: z1 };
    } else {
      acc.rect.wx0 = Math.min(acc.rect.wx0, x0);
      acc.rect.wz0 = Math.min(acc.rect.wz0, z0);
      acc.rect.wx1 = Math.max(acc.rect.wx1, x1);
      acc.rect.wz1 = Math.max(acc.rect.wz1, z1);
    }
  }
}

/** Monotonic group-id sequence — combined with Date.now() the ids stay
 *  unique across sessions without any persistence of their own. */
let gidSeq = 0;

/** Apply a COMMIT — one or more strokes sharing one undo group — in
 *  the chosen colours: physics raster + map/router layers + persistence
 *  in one go. Returns the touched world rect (null when nothing was
 *  painted). A road stroke plus its flanking footpaths (the CURVE
 *  tool) goes through here as three strokes, one gid. */
export function applyFootpathEdits(
  strokes: FootpathEditStroke[]
): FootpathEditRect | null {
  if (strokes.length === 0) return null;
  const gid = Date.now() * 1000 + (gidSeq = (gidSeq + 1) % 1000);
  const acc: { rect: FootpathEditRect | null } = { rect: null };
  for (const s of strokes) {
    if (
      s.pts.length < 4 ||
      s.pts.length % 2 !== 0 ||
      !(s.r > 0)
    ) {
      continue;
    }
    const rasterRect = cityFootpathEditStrokeW(s.pts, s.r, s.cls);
    cityMinimapEditStrokeW(s.pts, s.r, s.cls);
    addFootpathEdit({
      pts: s.pts.slice(),
      r: s.r,
      add: s.cls !== 0,
      cls: s.cls,
      gid,
    });
    if (rasterRect) {
      growRect(
        acc,
        {
          pts: [
            rasterRect.wx0,
            rasterRect.wz0,
            rasterRect.wx1,
            rasterRect.wz1,
          ],
          r: 0,
          add: true,
          cls: s.cls,
        }
      );
    }
  }
  return acc.rect;
}

/** Drop every player paint edit (RESET): physics raster, map/router
 *  layers and the persisted store all return to the traced network.
 *  Returns the union rect the edits ever touched so the caller can
 *  rebuild just those deck tiles (null when there were no edits). */
export function resetFootpathEdits(): FootpathEditRect | null {
  const list = listFootpathEdits();
  if (list.length === 0) return null;
  const acc: RectAcc = { rect: null };
  for (const e of list) growRect(acc, e);
  clearFootpathEdits();
  cityFootpathEditReset();
  cityMinimapEditsReset();
  return acc.rect;
}

/** Undo the most recent COMMIT (one stroke or a whole curve group):
 *  pop it from the store, replay the remaining strokes onto both
 *  rasters (cityRoadSurface + cityLayout) and return the popped
 *  strokes' world footprint so the caller can rebuild just those deck
 *  tiles + repaint that slice of the map cache (null when there was
 *  nothing to undo). */
export function undoLastFootpathEdit(): FootpathEditRect | null {
  const popped = popLastFootpathEditGroup();
  if (popped.length === 0) return null;
  const acc: RectAcc = { rect: null };
  for (const e of popped) growRect(acc, e);
  cityFootpathEditReset();
  cityMinimapEditsReset();
  return acc.rect;
}

/** ADOPT the permanent server save (the boot restore): replace the
 *  whole local stroke list with the saved snapshot, replay both
 *  rasters from scratch and return the union footprint of old + new
 *  strokes so the caller can rebuild the affected deck tiles + repaint
 *  that slice of the map cache. Before the city builds this still just
 *  swaps the store (the resets no-op while their rasters are unbuilt
 *  and the replay happens naturally at build time). */
export function adoptServerFootpathEdits(
  strokes: FootpathEdit[]
): FootpathEditRect | null {
  const acc: RectAcc = { rect: null };
  for (const e of listFootpathEdits()) growRect(acc, e);
  for (const e of strokes) growRect(acc, e);
  setFootpathEdits(strokes);
  cityFootpathEditReset();
  cityMinimapEditsReset();
  return acc.rect;
}
