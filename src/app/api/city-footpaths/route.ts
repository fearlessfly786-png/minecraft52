import { NextRequest, NextResponse } from "next/server";
import { promises as fsp } from "fs";
import path from "path";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CITY FOOTPATH PAINTER — the PERMANENT save, in TWO durable places:
 *
 * 1. THE GAME SOURCE TREE — every SAVE rewrites
 *    src/game/cityFootpathSavedData.json, a real file sitting next to
 *    the other game data (cityRoadmapData.ts & co). The saved road map
 *    literally becomes part of the game's code/files: it shows up in
 *    the project, survives server restarts AND a wiped database.
 * 2. THE SQLite SNAPSHOT (CityFootpathSave singleton) — the runtime
 *    copy the running game reads for instant cross-browser sync.
 *
 * GET  → whichever copy is newer (they are written together; the file
 *        wins when the DB row is missing or the DB is unreachable).
 *        Response: { ok, strokes, savedAt, source: 'db'|'file'|'none' }.
 * PUT  → write BOTH copies wholesale. Deliberately NO version history:
 *        the new save REPLACES the old one and the previous version
 *        cannot be restored (by design — "permanently").
 */

const SAVE_ID = "city";
/** The saved-painting file INSIDE the game source tree. */
const SAVE_FILE = path.join(
  process.cwd(),
  "src",
  "game",
  "cityFootpathSavedData.json"
);
/** Mirrors cityFootpathStore MAX_EDITS — the store drops the oldest
 *  strokes past this, so a bigger server list could never replay 1:1. */
const MAX_STROKES = 800;
/** Sanity cap on the JSON payload (a pathological 800-stroke list of
 *  huge polylines). Realistic lists are tens of KB. */
const MAX_BYTES = 4_000_000;

interface SavedStroke {
  pts: number[];
  r: number;
  add: boolean;
  cls: 0 | 1 | 2;
  gid?: number;
}

interface Snapshot {
  savedAt: string | null;
  strokes: SavedStroke[];
}

/** One saved stroke, sanitized. Same shape the game store persists:
 *  flat world-space spine + brush radius + add/erase + colour class
 *  (+ optional undo group id). */
function parseStroke(e: unknown): SavedStroke | null {
  if (typeof e !== "object" || e === null) return null;
  const ed = e as {
    pts?: unknown;
    r?: unknown;
    add?: unknown;
    cls?: unknown;
    gid?: unknown;
  };
  if (
    !Array.isArray(ed.pts) ||
    ed.pts.length < 4 ||
    ed.pts.length % 2 !== 0 ||
    typeof ed.r !== "number" ||
    !Number.isFinite(ed.r) ||
    ed.r <= 0 ||
    typeof ed.add !== "boolean"
  ) {
    return null;
  }
  const pts: number[] = [];
  for (const v of ed.pts) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    pts.push(v);
  }
  const cls =
    ed.cls === 0 || ed.cls === 1 || ed.cls === 2
      ? ed.cls
      : ed.add
        ? 1
        : 0;
  const rec: SavedStroke = { pts, r: ed.r, add: ed.add, cls };
  if (typeof ed.gid === "number" && Number.isFinite(ed.gid)) {
    rec.gid = ed.gid;
  }
  return rec;
}

function parseStrokes(raw: unknown): SavedStroke[] {
  const strokes: SavedStroke[] = [];
  if (Array.isArray(raw)) {
    for (const e of raw) {
      const rec = parseStroke(e);
      if (rec) strokes.push(rec);
      if (strokes.length >= MAX_STROKES) break;
    }
  }
  return strokes;
}

/** Read the game-source copy of the save (null when missing/corrupt). */
async function readSaveFile(): Promise<Snapshot | null> {
  try {
    const raw = await fsp.readFile(SAVE_FILE, "utf8");
    const parsed = JSON.parse(raw) as {
      savedAt?: unknown;
      strokes?: unknown;
    };
    return {
      savedAt:
        typeof parsed.savedAt === "string" ? parsed.savedAt : null,
      strokes: parseStrokes(parsed.strokes),
    };
  } catch {
    return null;
  }
}

/** Rewrite the game-source copy. One compact line per stroke so the
 *  file diffs cleanly in the codebase. */
async function writeSaveFile(
  strokes: SavedStroke[],
  savedAt: string
): Promise<boolean> {
  try {
    const lines = strokes
      .map((s) => "    " + JSON.stringify(s))
      .join(",\n");
    const body =
      '{\n  "savedAt": ' +
      JSON.stringify(savedAt) +
      ",\n  \"strokes\": [\n" +
      lines +
      (strokes.length ? "\n" : "") +
      "  ]\n}\n";
    await fsp.writeFile(SAVE_FILE, body, "utf8");
    return true;
  } catch (error) {
    console.error("[city-footpaths game-file write]", error);
    return false;
  }
}

/** ISO-8601 UTC stamps compare chronologically as plain strings. */
const stampOf = (s: string | null): string => s ?? "";

export async function GET() {
  // copy 1: the SQLite snapshot
  let dbSnap: Snapshot | null = null;
  try {
    const row = await db.cityFootpathSave.findUnique({
      where: { id: SAVE_ID },
    });
    if (row) {
      let parsed: unknown = [];
      try {
        parsed = JSON.parse(row.strokes);
      } catch {
        parsed = [];
      }
      dbSnap = {
        savedAt: row.savedAt.toISOString(),
        strokes: parseStrokes(parsed),
      };
    }
  } catch (error) {
    console.error("[city-footpaths GET db]", error);
  }
  // copy 2: the file in the game source tree — the save lives in the
  // game's code/files even when the DB row is gone or the DB is down
  const fileSnap = await readSaveFile();

  const snap =
    stampOf(dbSnap?.savedAt ?? null) >= stampOf(fileSnap?.savedAt ?? null)
      ? dbSnap
      : fileSnap;
  if (!snap) {
    return NextResponse.json({
      ok: true,
      strokes: [],
      savedAt: null,
      source: "none",
    });
  }
  return NextResponse.json({
    ok: true,
    strokes: snap.strokes,
    savedAt: snap.savedAt,
    source: snap === dbSnap ? "db" : "file",
  });
}

export async function PUT(request: NextRequest) {
  let body: { strokes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
  if (!Array.isArray(body.strokes)) {
    return NextResponse.json(
      { ok: false, error: "strokes must be an array" },
      { status: 400 }
    );
  }
  const strokes = parseStrokes(body.strokes);
  const payload = JSON.stringify(strokes);
  if (payload.length > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Save too large" },
      { status: 413 }
    );
  }
  const savedAt = new Date().toISOString();

  // THE GAME-CODE COPY first: the saved version becomes part of the
  // game's own files, so it survives restarts, wiped DBs — everything.
  const fileSaved = await writeSaveFile(strokes, savedAt);

  // the runtime snapshot: wholesale overwrite — no history, no rollback
  let dbSaved = false;
  try {
    await db.cityFootpathSave.upsert({
      where: { id: SAVE_ID },
      update: { strokes: payload },
      create: { id: SAVE_ID, strokes: payload },
    });
    dbSaved = true;
  } catch (error) {
    console.error("[city-footpaths PUT db]", error);
  }

  if (!fileSaved && !dbSaved) {
    return NextResponse.json(
      { ok: false, error: "Could not save the painting" },
      { status: 500 }
    );
  }
  return NextResponse.json({
    ok: true,
    savedAt,
    fileSaved,
    dbSaved,
    count: strokes.length,
  });
}
