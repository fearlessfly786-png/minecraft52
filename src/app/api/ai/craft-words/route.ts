import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AI CRAFT-BY-WORDS — the crafting panel's natural-language loader.
 *
 * POST { prompt, recipes: [{ id, out, ingredients, type }] } →
 *   { ok, recipeId, note }. The client then loads that recipe straight into
 *   the 3x3 grid at the exact Minecraft pattern positions (shaped rows map
 *   to grid rows — pickaxe = 3 material on top, sticks down the middle).
 *
 * Matching is two-layered for reliability:
 *   1. Deterministic local matcher — normalizes the phrase and matches it
 *      against recipe ids / output labels (whole-word, longest wins).
 *      "make me a diamond pickaxe" resolves instantly, no LLM round-trip.
 *   2. LLM fallback for vague phrases ("best tool for mining") — the model
 *      picks ONE id from the catalog; reply parsing also accepts the item
 *      name, not just the id.
 */

type RecipeRef = { id: string; out: string; ingredients: string; type: string };

/** "Diamond_Pickaxe!" → "diamond pickaxe" */
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeRe = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word containment so "stone" doesn't fire inside "sandstone". */
const wordContains = (haystack: string, needle: string) =>
  new RegExp(`(^| )${escapeRe(needle)}( |$)`).test(haystack);

/** Deterministic match — best recipe or null. Longest name wins
 *  ("diamond pickaxe" beats "stone" inside "stone pickaxe"); short generic
 *  names (<5 chars, e.g. "bow") only match when they ARE the whole request. */
function localMatch(prompt: string, recipes: RecipeRef[]): RecipeRef | null {
  const q = normalize(prompt);
  if (!q) return null;
  let best: RecipeRef | null = null;
  let bestLen = 0;
  for (const recipe of recipes) {
    const candidates = [
      normalize(recipe.id.replace(/_/g, " ")),
      normalize(recipe.out),
    ];
    for (const name of candidates) {
      if (name.length < 2) continue;
      const exact = q === name;
      if (!exact && !wordContains(q, name)) continue;
      if (name.length < 5 && !exact) continue;
      if (name.length > bestLen) {
        best = recipe;
        bestLen = name.length;
      }
    }
  }
  return best;
}

export async function POST(request: NextRequest) {
  let prompt = "";
  let recipes: RecipeRef[] = [];
  try {
    const body = (await request.json()) as {
      prompt?: unknown;
      recipes?: unknown;
    };
    if (typeof body?.prompt === "string") {
      prompt = body.prompt.trim().slice(0, 300);
    }
    if (Array.isArray(body?.recipes)) {
      recipes = (body.recipes as RecipeRef[])
        .filter(
          (r): r is RecipeRef =>
            !!r &&
            typeof r === "object" &&
            typeof r.id === "string" &&
            typeof r.out === "string"
        )
        .slice(0, 500);
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
  if (prompt.length < 2) {
    return NextResponse.json(
      { ok: false, note: "Type what you want to craft first." },
      { status: 400 }
    );
  }
  if (recipes.length === 0) {
    return NextResponse.json(
      { ok: false, note: "Recipe list unavailable — reload the lobby." },
      { status: 400 }
    );
  }

  // Layer 1 — deterministic, instant, zero cost.
  const local = localMatch(prompt, recipes);
  if (local) {
    return NextResponse.json({
      ok: true,
      recipeId: local.id,
      note: `${local.out} — recipe matched`,
    });
  }

  // Layer 2 — LLM fallback for vague phrasing.
  /** Compact one-line-per-recipe catalog for the model (ids are stable). */
  const catalog = recipes
    .map((r) => `${r.id} | ${r.out} | ${r.ingredients} | ${r.type}`)
    .join("\n");

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content: [
            "You map a player's crafting request to EXACTLY ONE recipe id from a catalog.",
            "Rules:",
            "1. Reply with ONLY the recipe id (the token before the first |), nothing else.",
            "2. If nothing reasonably matches, reply with NONE.",
            "3. Prefer exact item matches over partial ones (diamond pickaxe > iron pickaxe when asked for diamond).",
            "4. Ignore flavor words (make me a, I want, please, best).",
            "Catalog format: id | output | ingredients | type",
            "CATALOG START",
            catalog,
            "CATALOG END",
          ].join("\n"),
        },
        { role: "user", content: prompt },
      ],
      thinking: { type: "disabled" },
    });

    const raw = (completion.choices[0]?.message?.content ?? "").trim();
    const rawNorm = normalize(raw);
    // The model may wrap the id in prose/backticks — extract the id, or the
    // output name it echoed, longest match wins.
    const byId = recipes.find((r) => raw.includes(r.id));
    const byName = byId
      ? undefined
      : recipes
          .map((r) => ({ r, n: normalize(r.out) }))
          .filter(
            (e) =>
              e.n.length >= 5 &&
              (rawNorm === e.n || wordContains(rawNorm, e.n))
          )
          .sort((a, b) => b.n.length - a.n.length)[0]?.r;
    const found = byId ?? byName;
    if (found) {
      return NextResponse.json({
        ok: true,
        recipeId: found.id,
        note: `${found.out} — recipe matched`,
      });
    }
    return NextResponse.json({
      ok: false,
      note:
        "No recipe matches that — try naming the item (e.g. “craft a golden apple”), or use the AI Recipe Forge to invent it.",
    });
  } catch (error) {
    console.error("[ai/craft-words POST]", error);
    return NextResponse.json(
      { ok: false, note: "AI link failed — try again in a moment." },
      { status: 500 }
    );
  }
}
