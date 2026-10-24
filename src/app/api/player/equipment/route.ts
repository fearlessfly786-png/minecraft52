import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * EQUIPPED LOADOUT PERSISTENCE — the third leg of the costume database.
 *
 * CustomSkin / CustomWeaponSkin store every forged costume & weapon texture;
 * this route stores WHICH of them the hero is currently wearing, so the
 * loadout survives reloads exactly like the rack rows do.
 *
 * GET  → the saved equipment (or safe defaults when nothing was saved yet).
 * PUT  → upsert the singleton "player" row. The client fires this debounced
 *        after every equip (rack click, forge auto-equip, in-game cycling).
 *
 * An equip ref is either:
 *   { kind: "base",   index: number }        — a stock rack slot, or
 *   { kind: "forged", texturePath: string }  — an AI-forged texture (stable
 *                                              even if rack order shifts).
 */

const PLAYER_ID = "player";

interface EquipRef {
  kind: "base" | "forged";
  index?: number;
  texturePath?: string;
}

/** Forged texture paths are always inside the MD2 skins dir — the same
 *  strict shape the forge routes write. Base indices are small ints. */
function isValidRef(ref: unknown): ref is EquipRef {
  if (typeof ref !== "object" || ref === null) return false;
  const r = ref as EquipRef;
  if (r.kind === "base") {
    return Number.isInteger(r.index) && (r.index as number) >= 0;
  }
  if (r.kind === "forged") {
    return (
      typeof r.texturePath === "string" &&
      /^\/models\/md2\/ratamahatta\/skins\/[a-z0-9_]+\.png$/.test(
        r.texturePath
      )
    );
  }
  return false;
}

async function readEquipment() {
  const row = await db.equippedState.findUnique({
    where: { id: PLAYER_ID },
  });
  return {
    skin:
      row && row.skinTexturePath
        ? { kind: "forged" as const, texturePath: row.skinTexturePath }
        : row && row.skinRack !== null
          ? { kind: "base" as const, index: row.skinRack }
          : null,
    weapon:
      row && row.weaponTexturePath
        ? { kind: "forged" as const, texturePath: row.weaponTexturePath }
        : row && row.weaponRack !== null
          ? { kind: "base" as const, index: row.weaponRack }
          : null,
  };
}

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      equipment: await readEquipment(),
    });
  } catch (error) {
    console.error("[player/equipment GET]", error);
    return NextResponse.json(
      { ok: false, error: "Could not load saved equipment" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  let body: { skin?: unknown; weapon?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const skin = body.skin ?? null;
  const weapon = body.weapon ?? null;
  if (skin !== null && !isValidRef(skin)) {
    return NextResponse.json(
      { ok: false, error: "Invalid skin reference" },
      { status: 400 }
    );
  }
  if (weapon !== null && !isValidRef(weapon)) {
    return NextResponse.json(
      { ok: false, error: "Invalid weapon reference" },
      { status: 400 }
    );
  }

  const skinRow =
    skin && skin.kind === "forged"
      ? {
          skinRack: null,
          skinTexturePath: skin.texturePath as string,
        }
      : {
          skinRack: skin ? (skin.index as number) : null,
          skinTexturePath: null,
        };
  const weaponRow =
    weapon && weapon.kind === "forged"
      ? {
          weaponRack: null,
          weaponTexturePath: weapon.texturePath as string,
        }
      : {
          weaponRack: weapon ? (weapon.index as number) : null,
          weaponTexturePath: null,
        };

  try {
    await db.equippedState.upsert({
      where: { id: PLAYER_ID },
      update: { ...skinRow, ...weaponRow },
      create: { id: PLAYER_ID, ...skinRow, ...weaponRow },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[player/equipment PUT]", error);
    return NextResponse.json(
      { ok: false, error: "Could not save equipment" },
      { status: 500 }
    );
  }
}
