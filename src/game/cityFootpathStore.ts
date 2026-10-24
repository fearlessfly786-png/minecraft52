/**
 * CITY FOOTPATH EDIT STORE — the footpath strokes the player paints on
 * the city road map, persisted so painted paths survive a reload.
 *
 * A stroke is a flat WORLD-space polyline spine (the dragged map line),
 * a brush radius in world units, and add/erase intent. The game layers
 * replay the whole list in order onto their rasters whenever they build
 * (cityRoadSurface.ensureGrid, cityLayout.ensureGrids), so erase-then-
 * paint sequences reproduce the exact live result after a reload.
 *
 * Pure data + localStorage; no three.js, no DOM beyond the store.
 */

export interface FootpathEdit {
  /** Flat world-space polyline [x0,z0,x1,z1,...] of the stroke spine. */
  pts: number[];
  /** Brush radius in world units (half the painted path width). */
  r: number;
  /** true = paint, false = erase (kept for v1 store compatibility). */
  add: boolean;
  /** What the stroke paints: 1 = stone footpath, 2 = asphalt road,
   *  0 = erase. Missing on pre-3-colour strokes — derived from `add`. */
  cls: 0 | 1 | 2;
  /** Optional commit-group id — strokes committed TOGETHER (a curve
   *  road + its two flanking footpaths) share one id so UNDO pops the
   *  whole commit as a unit. Missing on old strokes: singleton group. */
  gid?: number;
}

const KEY = 'ratfire-city-footpath-edits-v1';
export const MAX_EDITS = 800;

let cache: FootpathEdit[] | null = null;

/** Validate + normalize one stored/transported stroke (the same shape
 *  localStorage and the permanent server save both carry). Returns null
 *  for anything malformed so corrupt entries drop silently instead of
 *  poisoning the replay. Legacy strokes carry no cls — derive it from
 *  the add/erase intent flag. */
export function parseFootpathEdit(e: unknown): FootpathEdit | null {
  if (typeof e !== 'object' || e === null) return null;
  const ed = e as {
    pts?: unknown;
    r?: unknown;
    add?: unknown;
    cls?: unknown;
    gid?: unknown;
  };
  if (
    Array.isArray(ed.pts) &&
    ed.pts.length >= 4 &&
    ed.pts.length % 2 === 0 &&
    typeof ed.r === 'number' &&
    Number.isFinite(ed.r) &&
    typeof ed.add === 'boolean'
  ) {
    for (const v of ed.pts) {
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    }
    const cls =
      ed.cls === 0 || ed.cls === 1 || ed.cls === 2
        ? ed.cls
        : ed.add
          ? 1
          : 0;
    const rec: FootpathEdit = {
      pts: ed.pts as number[],
      r: ed.r,
      add: ed.add,
      cls: cls as 0 | 1 | 2,
    };
    if (typeof ed.gid === 'number' && Number.isFinite(ed.gid)) {
      rec.gid = ed.gid;
    }
    return rec;
  }
  return null;
}

function load(): FootpathEdit[] {
  if (cache) return cache;
  cache = [];
  if (typeof window === 'undefined') return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return cache;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return cache;
    for (const e of parsed) {
      const rec = parseFootpathEdit(e);
      if (rec) cache.push(rec);
    }
  } catch {
    /* private mode / corrupt store — session-only edits */
  }
  return cache;
}

function save(list: FootpathEdit[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota exceeded — keep the session list in memory only */
  }
}

/** Every persisted edit, oldest first (replay order). */
export function listFootpathEdits(): FootpathEdit[] {
  return load();
}

/** Append one edit (and persist). Caps the list so the store can never
 *  balloon — the oldest strokes drop off, exactly like paint layers. */
export function addFootpathEdit(e: FootpathEdit): void {
  const list = load();
  list.push(e);
  if (list.length > MAX_EDITS) list.splice(0, list.length - MAX_EDITS);
  save(list);
}

/** Drop every persisted edit (the RESET button). */
export function clearFootpathEdits(): void {
  cache = [];
  save(cache);
}

/** Replace the WHOLE persisted list in one write (the permanent server
 *  save adoption): the boot restore swaps the local store for the saved
 *  snapshot and the rasters replay it. Caps at MAX_EDITS like an append
 *  would, so an oversized snapshot can never balloon the store. */
export function setFootpathEdits(list: FootpathEdit[]): void {
  cache = list.slice(-MAX_EDITS);
  save(cache);
}

/** Remove and return the most recent COMMIT GROUP (the UNDO button):
 *  every trailing stroke sharing the newest stroke's gid — a lone
 *  gid-less stroke pops alone — or an empty list when nothing is
 *  stored. The remaining list stays persisted so the layer replay
 *  after the pop reproduces the pre-commit world. */
export function popLastFootpathEditGroup(): FootpathEdit[] {
  const list = load();
  if (list.length === 0) return [];
  const gid = list[list.length - 1].gid;
  const popped: FootpathEdit[] = [];
  if (gid != null) {
    while (list.length > 0 && list[list.length - 1].gid === gid) {
      popped.push(list.pop() as FootpathEdit);
    }
  } else {
    popped.push(list.pop() as FootpathEdit);
  }
  save(list);
  return popped;
}
