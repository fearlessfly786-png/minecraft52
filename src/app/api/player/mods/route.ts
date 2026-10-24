import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MODS PERSISTENCE — the mod loader's save slot.
 *
 * The MODS panel lets the player toggle gameplay mods and tune them; this
 * route stores that configuration in the ModsState singleton so the mod
 * setup survives reloads exactly like the equipped loadout does.
 *
 * GET  → the saved mod configuration (or null when nothing was saved yet —
 *        the client then boots with the shipped defaults).
 * PUT  → upsert the singleton "player" row. The client fires this debounced
 *        after every panel change (toggle, time jump, speed, weather).
 *
 * Currently persisted: the Chronos time & weather mod.
 */

const PLAYER_ID = "player";

const WEATHERS = new Set(["natural", "clear", "storm"]);
const SPEEDS = new Set([0, 1, 8, 30]);

/** Hours are quantised to 15-minute steps inside 00:00..23:45. */
function clampHour(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 12;
  return Math.min(23.75, Math.max(0, Math.round(n * 4) / 4));
}

export async function GET() {
  try {
    const row = await db.modsState.findUnique({
      where: { id: PLAYER_ID },
    });
    return NextResponse.json({ ok: true, mods: row ?? null });
  } catch (error) {
    console.error("[player/mods GET]", error);
    return NextResponse.json(
      { ok: false, error: "Could not load saved mods" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  let body: { chronos?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  // The panel always sends the Chronos mod in one PUT.
  const existing = await db.modsState
    .findUnique({ where: { id: PLAYER_ID } })
    .catch(() => null);

  const row = {
    chronosOn: existing?.chronosOn ?? false,
    chronosHour: existing?.chronosHour ?? 12,
    chronosSpeed: existing?.chronosSpeed ?? 1,
    chronosWeather: existing?.chronosWeather ?? "natural",
  };

  if (typeof body.chronos === "object" && body.chronos !== null) {
    const c = body.chronos as Record<string, unknown>;
    const speed = Number(c.cycleSpeed);
    const weather = String(c.weather ?? "natural");
    row.chronosOn = c.enabled === true;
    row.chronosHour = clampHour(c.hour);
    row.chronosSpeed = SPEEDS.has(speed) ? speed : 1;
    row.chronosWeather = WEATHERS.has(weather) ? weather : "natural";
  }

  try {
    await db.modsState.upsert({
      where: { id: PLAYER_ID },
      update: row,
      create: { id: PLAYER_ID, ...row },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[player/mods PUT]", error);
    return NextResponse.json(
      { ok: false, error: "Could not save mods" },
      { status: 500 }
    );
  }
}
