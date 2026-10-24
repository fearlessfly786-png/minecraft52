import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CUSTOM AI RECIPES — persistence for the crafting panel's recipe book.
 *
 * GET                     → every AI-forged recipe (newest first), raw DB rows.
 * POST { recipeId, iconPath } → swap a forged recipe's icon (the forge panel
 *                               lets the player pick one of three generated
 *                               candidates).
 * DELETE ?recipeId        → remove one forged recipe from the book.
 *
 * The client assembles the rows into CraftRecipe-shaped objects (pattern/
 * keyMap/ins are JSON-encoded strings in SQLite).
 */

/** Only files the forge/pixelizer pipeline writes may be referenced. */
const ICON_PATH_RE = /^\/ai-icons\/[A-Za-z0-9_-]+\.png$/;

export async function GET() {
  try {
    const recipes = await db.customRecipe.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ ok: true, recipes });
  } catch (error) {
    console.error("[recipes/custom GET]", error);
    return NextResponse.json(
      { ok: false, error: "Could not load forged recipes" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: { recipeId?: unknown; iconPath?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
  const recipeId =
    typeof body.recipeId === "string" ? body.recipeId.trim() : "";
  const iconPath =
    typeof body.iconPath === "string" ? body.iconPath.trim() : "";
  if (!recipeId || !ICON_PATH_RE.test(iconPath)) {
    return NextResponse.json(
      { ok: false, error: "recipeId and a valid /ai-icons/ iconPath required" },
      { status: 400 }
    );
  }
  try {
    const updated = await db.customRecipe.updateMany({
      where: { recipeId },
      data: { iconPath },
    });
    if (updated.count === 0) {
      return NextResponse.json(
        { ok: false, error: "Recipe not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[recipes/custom POST]", error);
    return NextResponse.json(
      { ok: false, error: "Could not update recipe icon" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const recipeId = request.nextUrl.searchParams.get("recipeId")?.trim() ?? "";
  if (!recipeId) {
    return NextResponse.json(
      { ok: false, error: "recipeId required" },
      { status: 400 }
    );
  }
  try {
    await db.customRecipe.deleteMany({ where: { recipeId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[recipes/custom DELETE]", error);
    return NextResponse.json(
      { ok: false, error: "Could not remove recipe" },
      { status: 500 }
    );
  }
}
