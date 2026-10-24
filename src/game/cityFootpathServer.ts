/**
 * CITY FOOTPATH SERVER SAVE — the transport half of the painter's
 * PERMANENT save. The SAVE button in the EDIT PATHS toolbar pushes the
 * whole stroke list to /api/city-footpaths (SQLite, one snapshot row,
 * overwrite-only — no version history is kept anywhere, so a saved road
 * map can never be rolled back to a previous version); the boot restore
 * pulls it back onto any browser whose local store is empty.
 *
 * localStorage stays the working copy: it keeps replaying on every
 * raster build exactly as before, and local work always wins over the
 * server snapshot until the player explicitly SAVES.
 *
 * Pure fetch + data — no three.js, no DOM.
 */

import { parseFootpathEdit, type FootpathEdit } from './cityFootpathStore';

/** Result of the boot GET: the snapshot strokes (empty when never
 *  saved / unreachable) and when it was saved (null = never). */
export interface FootpathServerState {
  strokes: FootpathEdit[];
  savedAt: string | null;
}

/** Result of the SAVE PUT. ok = at least one durable copy landed;
 *  fileSaved = the copy INSIDE the game source tree
 *  (src/game/cityFootpathSavedData.json) was rewritten. */
export interface FootpathSaveResult {
  ok: boolean;
  savedAt?: string;
  fileSaved?: boolean;
  error?: string;
}

/** Pull the permanent snapshot. Network/DB failures degrade to "nothing
 *  saved" — the local store keeps the world alive either way. */
export async function fetchServerFootpathEdits(): Promise<FootpathServerState> {
  if (typeof window === 'undefined') {
    return { strokes: [], savedAt: null };
  }
  try {
    const res = await fetch('/api/city-footpaths', { cache: 'no-store' });
    if (!res.ok) return { strokes: [], savedAt: null };
    const data = (await res.json()) as {
      ok?: unknown;
      strokes?: unknown;
      savedAt?: unknown;
    };
    const strokes: FootpathEdit[] = [];
    if (Array.isArray(data.strokes)) {
      for (const e of data.strokes) {
        const rec = parseFootpathEdit(e);
        if (rec) strokes.push(rec);
      }
    }
    return {
      strokes,
      savedAt: typeof data.savedAt === 'string' ? data.savedAt : null,
    };
  } catch {
    return { strokes: [], savedAt: null };
  }
}

/** Push a FULL snapshot (wholesale overwrite — the previous version is
 *  gone the moment this lands; that is the point of the button). */
export async function pushServerFootpathEdits(
  strokes: FootpathEdit[]
): Promise<FootpathSaveResult> {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'no window' };
  }
  try {
    const res = await fetch('/api/city-footpaths', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strokes }),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      ok?: unknown;
      savedAt?: unknown;
      fileSaved?: unknown;
    };
    return {
      ok: data.ok === true,
      savedAt: typeof data.savedAt === 'string' ? data.savedAt : undefined,
      fileSaved: data.fileSaved === true,
    };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** True when two stroke lists would replay the exact same world —
 *  field-for-field, point-for-point, in order. Used to keep the SAVE
 *  button honest (no "unsaved changes" dot when nothing differs). */
export function footpathEditsEqual(
  a: FootpathEdit[],
  b: FootpathEdit[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.cls !== y.cls ||
      x.add !== y.add ||
      x.r !== y.r ||
      x.pts.length !== y.pts.length
    ) {
      return false;
    }
    for (let j = 0; j < x.pts.length; j++) {
      if (x.pts[j] !== y.pts[j]) return false;
    }
  }
  return true;
}
