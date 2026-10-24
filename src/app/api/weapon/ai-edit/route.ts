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
 * AI WEAPON FORGE — the WEAPONS panel's image-editing pipeline (the weapon
 * sibling of the CHARACTER panel's /api/costume/ai-edit).
 *
 * POST { sourceFile, prompt, weaponIndex, name? }:
 *   1. Reads the source weapon texture PNG from
 *      public/models/md2/ratamahatta/skins/ (file name strictly whitelist-
 *      validated — no path traversal).
 *   2. Sends it through the z-ai image EDIT model with the player's prompt
 *      wrapped in UV-atlas-preservation instructions, so the AI repaints the
 *      weapon WITHOUT breaking the MD2 model's texture mapping.
 *   3. Normalizes the result to a 512×512 PNG and extracts a dominant swatch
 *      color via sharp for the rack UI.
 *   4. Persists the forged weapon texture (SQLite via Prisma) and returns
 *      its rack row.
 *
 * GET: lists every forged weapon texture (rack order — oldest first).
 */

const SKINS_DIR = path.join(
  process.cwd(),
  "public",
  "models",
  "md2",
  "ratamahatta",
  "skins"
);

/** Base weapon textures shipped with the repo — legit AI sources. Order
 *  mirrors the WEAPONS rack (index 0-10, the full 11-weapon MD2 arsenal);
 *  the trailing Unarmed entry has no texture and is never forgeable. */
const BASE_WEAPON_FILES = new Set([
  "weapon.png",
  "w_shotgun.png",
  "w_chaingun.png",
  "w_railgun.png",
  "w_bfg.png",
  "w_blaster.png",
  "w_glauncher.png",
  "w_hyperblaster.png",
  "w_machinegun.png",
  "w_rlauncher.png",
  "w_sshotgun.png",
]);

/** Highest valid base weapon rack index (BASE_WEAPON_FILES.size - 1). */
const MAX_WEAPON_INDEX = BASE_WEAPON_FILES.size - 1;

/** Generated weapon textures live in the same dir with this prefix — also
 *  legit sources (chaining: forge a new weapon FROM a forged weapon). */
const AI_WEAPON_PREFIX = "wai_";

const MAX_PROMPT = 400;
const MAX_NAME = 24;
const TEXTURE_SIZE = 512;

function isValidSourceFile(file: string): boolean {
  if (!/^[a-z0-9_]+\.png$/i.test(file)) return false;
  if (BASE_WEAPON_FILES.has(file)) return true;
  return file.startsWith(AI_WEAPON_PREFIX);
}

/** Turn the player's prompt into an edit instruction that protects the MD2
 *  UV mapping — the weapon atlas must keep every part (barrel, body, grip,
 *  stock, small detail patches) in place or the repaint smears across the
 *  wrong geometry. */
function buildEditPrompt(playerPrompt: string): string {
  return [
    playerPrompt.trim(),
    "This is a Quake-2 style low-poly game WEAPON TEXTURE ATLAS (UV map).",
    "Keep the EXACT same atlas layout: every part region (barrel, muzzle,",
    "receiver/body, grip, stock, sights, small detail patches) must stay in",
    "its current position, size and orientation — only repaint/restyle the",
    "pixels INSIDE each region. Preserve the region boundaries, silhouette",
    "shapes and the dark gaps between regions. Sharp seamless game-texture",
    "look with crisp metallic edges.",
  ].join(" ");
}

/** Derive a rack-friendly weapon name from the prompt when the player does
 *  not type one ("neon cyberpunk shotgun" → "Neon Cyberpunk Shotgun"). */
function deriveName(prompt: string): string {
  const words = prompt
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  const name = words.join(" ").slice(0, MAX_NAME).trim();
  return name.length > 0 ? name : "AI Weapon";
}

/** Swatch color (hex) for the weapon-rack dot. Same approach as the costume
 *  forge: average a 32×32 thumb while IGNORING near-black gap pixels. */
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
    console.error("[weapon/ai-edit dominantColor]", error);
    return "#fbbf24"; // amber fallback — always readable on the rack
  }
}

/** SELF-HEALING RECOVERY — same idea as the costume route: if the SQLite
 *  file is lost/reset, forged weapon PNGs survive on disk but lose their
 *  rows (name, weaponIndex…). This pass re-registers every orphan. The one
 *  field that cannot be read off the file is weaponIndex, so it is INFERRED
 *  structurally: an AI repaint keeps the source weapon's exact atlas layout,
 *  therefore the base weapon texture with the closest grayscale profile is
 *  (with very high probability) the weapon the repaint belongs to. */
const RECOVERY_MIN_AGE_MS = 2 * 60 * 1000;
const PROFILE_SIZE = 48;

/** Normalized grayscale fingerprint of a texture (48×48, alpha stripped). */
async function grayscaleProfile(png: Buffer): Promise<Float32Array> {
  const { data } = await sharp(png)
    .resize(PROFILE_SIZE, PROFILE_SIZE, { fit: "fill" })
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return Float32Array.from(data);
}

/** Mean absolute difference between two same-size profiles (0 = identical). */
function profileDistance(a: Float32Array, b: Float32Array): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

async function recoverOrphanWeapons(): Promise<void> {
  const rows = await db.customWeaponSkin.findMany({
    select: { texturePath: true },
  });
  const known = new Set(
    rows.map((row) => row.texturePath.split("/").pop() ?? "")
  );
  const files = (await fs.promises.readdir(SKINS_DIR)).filter(
    (file) =>
      file.startsWith(AI_WEAPON_PREFIX) &&
      file.endsWith(".png") &&
      !known.has(file) &&
      (() => {
        const stamp = Number(
          file.slice(AI_WEAPON_PREFIX.length).split("_")[0]
        );
        return (
          !Number.isFinite(stamp) ||
          Date.now() - stamp >= RECOVERY_MIN_AGE_MS
        );
      })()
  );
  if (files.length === 0) return;

  // fingerprint every base weapon texture once per recovery pass
  const baseProfiles = new Map<string, Float32Array>();
  for (const baseFile of BASE_WEAPON_FILES) {
    try {
      baseProfiles.set(
        baseFile,
        await grayscaleProfile(
          await fs.promises.readFile(path.join(SKINS_DIR, baseFile))
        )
      );
    } catch {
      // a missing base texture just drops out of the candidate set
    }
  }
  /** Rack order is BASE_WEAPON_FILES order — look up by name so a skipped
   *  (unreadable) base can never shift the inferred slot index. */
  const baseFileToIndex = new Map(
    [...BASE_WEAPON_FILES].map((file, index) => [file, index])
  );

  let recovered = 0;
  for (const file of files) {
    let color = "#fbbf24";
    let bestFile = "weapon.png";
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    try {
      const png = await fs.promises.readFile(path.join(SKINS_DIR, file));
      color = await dominantColor(png);
      const profile = await grayscaleProfile(png);
      for (const [baseFile, baseProfile] of baseProfiles) {
        const distance = profileDistance(profile, baseProfile);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestFile = baseFile;
          bestIndex = baseFileToIndex.get(baseFile) ?? 0;
        }
      }
    } catch (error) {
      console.error(`[weapon/ai-edit] recovery read failed: ${file}`, error);
      continue;
    }
    recovered += 1;
    await db.customWeaponSkin.create({
      data: {
        name: `Recovered Weapon ${recovered}`,
        color,
        texturePath: `/models/md2/ratamahatta/skins/${file}`,
        prompt: "Recovered from a previous session",
        sourceSkin: bestFile,
        weaponIndex: bestIndex,
      },
    });
  }
  if (recovered > 0) {
    console.log(`[weapon/ai-edit] recovered ${recovered} orphan weapon(s)`);
  }
}

export async function GET() {
  try {
    await recoverOrphanWeapons();
    const weapons = await db.customWeaponSkin.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ ok: true, weapons });
  } catch (error) {
    console.error("[weapon/ai-edit GET]", error);
    return NextResponse.json(
      { ok: false, error: "Could not load forged weapons" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: {
    sourceFile?: string;
    prompt?: string;
    weaponIndex?: number;
    name?: string;
  };
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
  const weaponIndex = Number.isInteger(body.weaponIndex)
    ? (body.weaponIndex as number)
    : -1;

  if (weaponIndex < 0 || weaponIndex > MAX_WEAPON_INDEX) {
    return NextResponse.json(
      { ok: false, error: "Unknown weapon slot" },
      { status: 400 }
    );
  }
  if (!isValidSourceFile(sourceFile)) {
    return NextResponse.json(
      { ok: false, error: "Unknown source weapon" },
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
      { ok: false, error: "Source weapon file is missing" },
      { status: 400 }
    );
  }

  try {
    // 1) source texture → base64 data URL (SDK requires { url } objects)
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
    const fileName = `${AI_WEAPON_PREFIX}${Date.now()}_${crypto
      .randomBytes(3)
      .toString("hex")}.png`;
    await fs.promises.writeFile(path.join(SKINS_DIR, fileName), editedPng);

    const weapon = await db.customWeaponSkin.create({
      data: {
        name: customName.length > 0 ? customName : deriveName(prompt),
        color,
        texturePath: `/models/md2/ratamahatta/skins/${fileName}`,
        prompt,
        sourceSkin: sourceFile,
        weaponIndex,
      },
    });

    return NextResponse.json({ ok: true, weapon });
  } catch (error) {
    console.error("[weapon/ai-edit POST]", error);
    const message =
      error instanceof Error && error.message.length > 0
        ? error.message
        : "AI forge failed — try again";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
