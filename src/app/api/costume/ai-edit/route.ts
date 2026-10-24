import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * AI COSTUME FORGE — the CHARACTER panel's image-editing pipeline.
 *
 * POST { sourceFile, prompt, name? }:
 *   1. Reads the source skin PNG from public/models/md2/ratamahatta/skins/
 *      (file name is strictly whitelist-validated — no path traversal).
 *   2. Sends it through the z-ai image EDIT model with the player's prompt
 *      wrapped in UV-atlas-preservation instructions, so the AI repaints the
 *      costume WITHOUT breaking the MD2 model's texture mapping.
 *   3. Normalizes the result to a 512×512 PNG (matching the original skins)
 *      and extracts a dominant swatch color via sharp for the rack UI.
 *   4. Persists the new costume (SQLite via Prisma) and returns its rack row.
 *
 * GET: lists every forged costume (rack order — oldest first).
 */

const SKINS_DIR = path.join(
  process.cwd(),
  "public",
  "models",
  "md2",
  "ratamahatta",
  "skins"
);

/** Base game skins shipped with the repo — legit AI sources. */
const BASE_SKIN_FILES = new Set([
  "ratamahatta.png",
  "skin_crimson.png",
  "ctf_b.png",
  "ctf_r.png",
  "dead.png",
  "gearwhore.png",
  "skin_gold.png",
  "skin_toxin.png",
  "skin_shadow.png",
  "skin_frost.png",
  "skin_magma.png",
]);

/** Generated skins live in the same dir with this prefix — also legit sources
 *  (chaining: forge a new costume FROM a forged costume). */
const AI_SKIN_PREFIX = "ai_";

const MAX_PROMPT = 400;
const MAX_NAME = 24;
const TEXTURE_SIZE = 512;

function isValidSourceFile(file: string): boolean {
  if (!/^[a-z0-9_]+\.png$/i.test(file)) return false;
  if (BASE_SKIN_FILES.has(file)) return true;
  return file.startsWith(AI_SKIN_PREFIX);
}

/** Turn the player's prompt into an edit instruction that protects the MD2
 *  UV mapping — the #1 failure mode would be the model "rearranging" the
 *  atlas, which would smear the costume across the wrong body parts. */
function buildEditPrompt(playerPrompt: string): string {
  return [
    playerPrompt.trim(),
    "This is a Quake-2 style low-poly game character SKIN TEXTURE ATLAS (UV map).",
    "Keep the EXACT same atlas layout: every body-part region (head, face, torso,",
    "arms, hands, legs, boots, small detail patches) must stay in its current",
    "position, size and orientation — only repaint/restyle the pixels INSIDE each",
    "region. Preserve the region boundaries, silhouette shapes and the dark gaps",
    "between regions. Sharp seamless game-texture look.",
  ].join(" ");
}

/** Derive a rack-friendly costume name from the prompt when the player does
 *  not type one ("molten lava armor" → "Molten Lava Armor"). */
function deriveName(prompt: string): string {
  const words = prompt
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  const name = words.join(" ").slice(0, MAX_NAME).trim();
  return name.length > 0 ? name : "AI Costume";
}

/** Swatch color (hex) for the costume-rack dot. A plain dominant-color pick
 *  lands on the atlas' dark gap pixels, so this averages a 32×32 thumb while
 *  IGNORING near-black gap pixels — the result reads as the costume's tone. */
async function dominantColor(png: Buffer): Promise<string> {
  try {
    const { data, info } = await sharp(png)
      .resize(32, 32, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const cr = data[i];
      const cg = data[i + 1];
      const cb = data[i + 2];
      if (Math.max(cr, cg, cb) < 40) continue; // atlas gap / background
      r += cr;
      g += cg;
      b += cb;
      n += 1;
    }
    if (n === 0) return "#fbbf24"; // amber fallback — always readable
    const toHex = (v: number) =>
      Math.round(v / n)
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch (error) {
    console.error("[costume/ai-edit dominantColor]", error);
    return "#fbbf24"; // amber fallback — always readable on the rack
  }
}

/** SELF-HEALING RECOVERY — if the SQLite file is ever lost/reset (sandbox
 *  resets, manual wipes), the generated PNGs survive on disk but their DB
 *  rows vanish, and the whole wardrobe would silently disappear. This pass
 *  re-registers any forged texture that has no DB row yet, so GET always
 *  returns the FULL wardrobe. Files younger than 2 min are skipped — that
 *  window covers an in-flight forge (its POST writes the file a moment
 *  before the row, so recovery must not race it). */
const RECOVERY_MIN_AGE_MS = 2 * 60 * 1000;

async function recoverOrphanCostumes(): Promise<void> {
  const rows = await db.customSkin.findMany({
    select: { texturePath: true },
  });
  const known = new Set(
    rows.map((row) => row.texturePath.split("/").pop() ?? "")
  );
  const files = await fs.promises.readdir(SKINS_DIR);
  let recovered = 0;
  for (const file of files) {
    if (!file.startsWith(AI_SKIN_PREFIX) || !file.endsWith(".png")) continue;
    if (known.has(file)) continue;
    // ai_<epoch-ms>_<hex>.png — parse the stamp for the in-flight guard
    const stamp = Number(file.slice(AI_SKIN_PREFIX.length).split("_")[0]);
    if (Number.isFinite(stamp) && Date.now() - stamp < RECOVERY_MIN_AGE_MS) {
      continue;
    }
    const png = await fs.promises.readFile(path.join(SKINS_DIR, file));
    const color = await dominantColor(png);
    recovered += 1;
    await db.customSkin.create({
      data: {
        name: `Recovered Costume ${recovered}`,
        color,
        texturePath: `/models/md2/ratamahatta/skins/${file}`,
        prompt: "Recovered from a previous session",
        sourceSkin: "unknown",
      },
    });
  }
  if (recovered > 0) {
    console.log(`[costume/ai-edit] recovered ${recovered} orphan costume(s)`);
  }
}

export async function GET() {
  try {
    await recoverOrphanCostumes();
    const skins = await db.customSkin.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ ok: true, skins });
  } catch (error) {
    console.error("[costume/ai-edit GET]", error);
    return NextResponse.json(
      { ok: false, error: "Could not load forged costumes" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: { sourceFile?: string; prompt?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  // Accept both a bare file name and a full public URL — keep only the last
  // path segment. The strict whitelist regex below still guards traversal
  // (no slashes/backslashes survive this, and the regex rejects anything
  // beyond [a-z0-9_].png).
  const sourceFile = (body.sourceFile ?? "").trim().split("/").pop() ?? "";
  const prompt = (body.prompt ?? "").trim();
  const customName = (body.name ?? "").trim().slice(0, MAX_NAME);

  if (!isValidSourceFile(sourceFile)) {
    return NextResponse.json(
      { ok: false, error: "Unknown source costume" },
      { status: 400 }
    );
  }
  if (prompt.length < 2 || prompt.length > MAX_PROMPT) {
    return NextResponse.json(
      { ok: false, error: `Prompt must be 2-${MAX_PROMPT} characters` },
      { status: 400 }
    );
  }

  const sourcePath = path.join(SKINS_DIR, sourceFile);
  if (!fs.existsSync(sourcePath)) {
    return NextResponse.json(
      { ok: false, error: "Source skin file is missing" },
      { status: 400 }
    );
  }

  try {
    // 1) source skin → base64 data URL (SDK requires { url } objects)
    const sourceBuf = await fs.promises.readFile(sourcePath);
    const dataUrl = `data:image/png;base64,${sourceBuf.toString("base64")}`;

    // 2) AI edit (~15 s typical) — wrapped prompt protects the UV layout
    const zai = await ZAI.create();
    const response = await zai.images.generations.edit({
      prompt: buildEditPrompt(prompt),
      images: [{ url: dataUrl }],
      size: "1024x1024",
    });
    const base64 = response.data?.[0]?.base64;
    if (!base64) {
      throw new Error("Editor returned no image");
    }

    // 3) normalize → 512×512 PNG + swatch color
    const editedPng = await sharp(Buffer.from(base64, "base64"))
      .resize(TEXTURE_SIZE, TEXTURE_SIZE, { fit: "fill" })
      .png()
      .toBuffer();
    const color = await dominantColor(editedPng);

    // 4) persist file + DB row
    const fileName = `${AI_SKIN_PREFIX}${Date.now()}_${crypto
      .randomBytes(3)
      .toString("hex")}.png`;
    await fs.promises.writeFile(path.join(SKINS_DIR, fileName), editedPng);

    const skin = await db.customSkin.create({
      data: {
        name: customName.length > 0 ? customName : deriveName(prompt),
        color,
        texturePath: `/models/md2/ratamahatta/skins/${fileName}`,
        prompt,
        sourceSkin: sourceFile,
      },
    });

    return NextResponse.json({ ok: true, skin });
  } catch (error) {
    console.error("[costume/ai-edit POST]", error);
    const message =
      error instanceof Error && error.message.length > 0
        ? error.message
        : "AI forge failed — try again";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
