import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db } from "@/lib/db";
import { pixelizeIconPng } from "@/lib/icon-pixelizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FORGED-ICON UPLOAD — the forge panel's "paint it yourself" path.
 *
 * POST { dataUrl, recipeId? }:
 *   1. Decodes a data-URL image (png/jpeg/webp, ≤6 MB).
 *   2. Runs the SAME pixelizer as the generated candidates (background
 *      flood-fill removal → nearest-neighbour 16×16 → ×16 upscale), so an
 *      uploaded photo/screenshot becomes a vanilla-style sprite too.
 *   3. Saves it under public/ai-icons/ and — when recipeId is given —
 *      binds it to that forged recipe in the book.
 *
 * Returns { ok, iconPath }.
 */

const MAX_BYTES = 6 * 1024 * 1024;
const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,/;

export async function POST(request: NextRequest) {
  let body: { dataUrl?: unknown; recipeId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  const recipeId =
    typeof body.recipeId === "string" ? body.recipeId.trim() : "";

  if (!DATA_URL_RE.test(dataUrl)) {
    return NextResponse.json(
      { ok: false, error: "Send the image as a png/jpeg/webp data URL." },
      { status: 400 }
    );
  }
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  if (base64.length * 0.75 > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Image too large — keep it under 6 MB." },
      { status: 413 }
    );
  }

  try {
    const png = await pixelizeIconPng(Buffer.from(base64, "base64"));
    const iconsDir = path.join(process.cwd(), "public", "ai-icons");
    fs.mkdirSync(iconsDir, { recursive: true });
    const fileName = `ai_up_${Date.now()}_${crypto
      .randomBytes(3)
      .toString("hex")}.png`;
    await fs.promises.writeFile(path.join(iconsDir, fileName), png);
    const iconPath = `/ai-icons/${fileName}`;

    if (recipeId) {
      const updated = await db.customRecipe.updateMany({
        where: { recipeId },
        data: { iconPath },
      });
      if (updated.count === 0) {
        return NextResponse.json(
          { ok: false, error: "Recipe not found", iconPath },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ ok: true, iconPath });
  } catch (error) {
    console.error("[ai/forge/icon POST]", error);
    return NextResponse.json(
      { ok: false, error: "Could not process that image — try another one." },
      { status: 500 }
    );
  }
}
