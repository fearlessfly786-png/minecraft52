import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ZONE STUDIO persistence — the in-game terrain colour-skin store (see the
 * SKINS button left of the Lobby button in page.tsx).
 *
 * The panel paints a zone's 32×64 atlas (top half = top-face tile, bottom
 * half = side-face tile — the layout every terrain material samples, see
 * terrainChunks.ts / desertTextures.ts) straight from the player's colour
 * code on the CLIENT, then persists it here. No AI generation, no editing
 * of existing pixels — the colour IS the skin.
 *
 * PUT { zone, prompt, mode, atlas }  → persists the applied colour skin
 *                                      (SQLite, one row per zone — survives
 *                                      reloads). `prompt` stores the hex
 *                                      colour code, `mode` is "color".
 * GET                                → lists every persisted zone skin.
 * DELETE ?zone=<id>                  → removes a zone's skin (reset to
 *                                      the original procedural texture).
 */

const VALID_ZONES = new Set([
  "grass",
  "snow",
  "ice",
  "sand",
  "red",
  "mesa",
  "basalt",
  "lava",
  "cherry",
  "shroom",
  "crimson",
  "golden",
]);

const MAX_PROMPT = 400;
/** Persisted-atlas safety cap (a 32×64 PNG is ~2 KB; 256 KB is generous). */
const MAX_ATLAS_BYTES = 256 * 1024;
/** Modes the store accepts — "color" is what the panel saves these days;
 *  older "generate"/"edit" rows (from the retired AI forge) still load. */
const VALID_MODES = new Set(["color", "generate", "edit"]);

function isValidAtlasDataUrl(value: string): boolean {
  if (!/^data:image\/png;base64,/.test(value)) return false;
  const base64 = value.slice(value.indexOf(",") + 1);
  return base64.length > 0 && base64.length * 0.75 <= MAX_ATLAS_BYTES;
}

// ---------------------------------------------------------------- GET
export async function GET() {
  try {
    const skins = await db.zoneSkin.findMany({
      orderBy: { updatedAt: "asc" },
      select: {
        zone: true,
        prompt: true,
        mode: true,
        atlasData: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ ok: true, skins });
  } catch (error) {
    console.error("[terrain/ai-texture GET]", error);
    return NextResponse.json(
      { ok: false, error: "Could not load saved zone skins" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------- PUT
export async function PUT(request: NextRequest) {
  let body: {
    zone?: string;
    prompt?: string;
    mode?: string;
    atlas?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const zone = (body.zone ?? "").trim();
  const prompt = (body.prompt ?? "").trim().slice(0, MAX_PROMPT);
  const mode = VALID_MODES.has(body.mode ?? "") ? body.mode! : "color";
  const atlas = (body.atlas ?? "").trim();

  if (!VALID_ZONES.has(zone)) {
    return NextResponse.json({ ok: false, error: "Unknown zone" }, { status: 400 });
  }
  if (!isValidAtlasDataUrl(atlas)) {
    return NextResponse.json(
      { ok: false, error: "Invalid atlas image" },
      { status: 400 }
    );
  }

  try {
    const skin = await db.zoneSkin.upsert({
      where: { zone },
      update: { prompt, mode, atlasData: atlas },
      create: { zone, prompt, mode, atlasData: atlas },
    });
    return NextResponse.json({ ok: true, skin });
  } catch (error) {
    console.error("[terrain/ai-texture PUT]", error);
    return NextResponse.json(
      { ok: false, error: "Could not save the zone skin" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------- DELETE
export async function DELETE(request: NextRequest) {
  const zone = (request.nextUrl.searchParams.get("zone") ?? "").trim();
  if (!VALID_ZONES.has(zone)) {
    return NextResponse.json(
      { ok: false, error: "Unknown zone" },
      { status: 400 }
    );
  }
  try {
    await db.zoneSkin.deleteMany({ where: { zone } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[terrain/ai-texture DELETE]", error);
    return NextResponse.json(
      { ok: false, error: "Could not reset the zone skin" },
      { status: 500 }
    );
  }
}
