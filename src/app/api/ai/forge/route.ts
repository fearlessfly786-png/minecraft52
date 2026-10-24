import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db } from "@/lib/db";
import { renderSpritePng, SPRITE_TEMPLATES } from "@/lib/ai-sprites";
import { pixelizeIconPng } from "@/lib/icon-pixelizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * AI RECIPE FORGE — the crafting panel's crown feature. ASYNC JOB API:
 *
 * POST { prompt, catalog: [{ id, label }] } → { ok, jobId } AT ONCE
 * GET  ?jobId=… → { ok, status, stage, recipe?, candidates?, error? }
 *
 * Why async: designing the recipe + painting THREE image-model candidates
 * takes 30-60 s — past the preview gateway's ~30 s proxy cut. The old
 * synchronous single-request version was heading for the same "502 Bad
 * Gateway" trap the GitHub export hit. The browser now polls for the job.
 *
 * Pipeline (runForgeJob):
 *   1. DESIGN — the LLM invents a BALANCED custom recipe for the described
 *      item ("lava sword") using ONLY ingredient ids from the player's real
 *      catalog, plus a short visual `icon` description. One corrective
 *      retry when it invents unknown ids.
 *   2. ICONS — three image-model renders of the item in strict 16×16
 *      Minecraft pixel-art style on a solid magenta backdrop. Each render
 *      is pixelized (src/lib/icon-pixelizer.ts): background flood-fill
 *      removed, nearest-neighbour downscale to 16×16, upscale ×16 → a
 *      chunky vanilla-style sprite that sits crisply next to the wiki
 *      textures. If every generation fails the PROCEDURAL painter
 *      (src/lib/ai-sprites.ts) still delivers an icon — forging never dies.
 *   3. SAVE — the recipe persists in SQLite (CustomRecipe) with candidate
 *      #1 as the icon; all three paths return so the player can swap.
 *
 * The client can later POST /api/recipes/custom { recipeId, iconPath } to
 * switch the icon, or POST /api/ai/forge/icon { dataUrl, recipeId } to
 * upload a custom PNG (pixelized the same way).
 */

const MAX_PROMPT = 300;
const MAX_NAME = 28;
const ICONS_DIR = path.join(process.cwd(), "public", "ai-icons");
const CANDIDATES = 3;

type CatalogEntry = { id: string; label: string };

type ForgedRecipe = {
  name: string;
  type: "shaped" | "shapeless";
  pattern: string[];
  key: Record<string, string>;
  ins: string[];
  outId: string;
  outCount: number;
  mode: 2 | 3;
  flavor: string;
  iconDesc: string;
  sprite?: {
    template?: string;
    primary?: string;
    secondary?: string;
    accent?: string;
  };
};

type ForgeStage = "design" | "icons" | "save";

interface ForgeJob {
  id: string;
  status: "working" | "done" | "error";
  stage: ForgeStage;
  recipe: Record<string, unknown> | null;
  candidates: string[];
  error: string;
  createdAt: number;
  finishedAt: number | null;
}

const JOB_TTL_MS = 15 * 60_000;
const MAX_JOBS = 40;

/** Survives dev-server HMR recompiles — module scope would not. */
const globalStore = globalThis as unknown as {
  __aiForgeJobs?: Map<string, ForgeJob>;
};
const jobs: Map<string, ForgeJob> =
  globalStore.__aiForgeJobs ?? (globalStore.__aiForgeJobs = new Map());

function pruneJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) jobs.delete(id);
  }
  if (jobs.size <= MAX_JOBS) return;
  const finished = [...jobs.values()]
    .filter((job) => job.finishedAt)
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
  while (jobs.size > MAX_JOBS && finished.length > 0) {
    const oldest = finished.shift();
    if (oldest) jobs.delete(oldest.id);
  }
}

function extractJson(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Best-effort map of an invented ingredient id to the closest real catalog
 *  id (token overlap, then short Levenshtein). null when nothing is close. */
function closestCatalogId(
  raw: string,
  catalog: Map<string, string>
): string | null {
  const want = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (catalog.has(want)) return want;
  const wantTokens = new Set(want.split("_"));
  let best: string | null = null;
  let bestScore = 0;
  for (const id of catalog.keys()) {
    const idTokens = id.split("_");
    let score = 0;
    for (const token of idTokens) {
      if (wantTokens.has(token)) score += 2;
    }
    // crude levenshtein bonus for near-misses (blaze_rod vs blaze_rods)
    if (Math.abs(id.length - want.length) <= 2) {
      let shared = 0;
      for (let i = 0; i < Math.min(id.length, want.length); i++) {
        if (id[i] === want[i]) shared += 1;
      }
      score += shared / Math.max(id.length, want.length);
    }
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return bestScore >= 2 ? best : null;
}

/** Validate + normalize the model's recipe draft. Returns [forged, reason] —
 *  reason is null on success, otherwise WHY the draft was rejected (logged
 *  server-side so forge failures are debuggable). */
function normalizeForge(
  data: Record<string, unknown>,
  catalog: Map<string, string>
): [ForgedRecipe | null, string | null] {
  /** Auto-repair: accept "Stick", "STICK", "stick " … and map to the real
   *  catalog id — models often fix casing or echo labels instead of ids. */
  const catalogByLabel = new Map(
    [...catalog.entries()].map(([id, label]) => [label.toLowerCase(), id])
  );
  const resolveIngredient = (rawId: string): string | null => {
    const cleaned = rawId.trim().toLowerCase().replace(/\s+/g, "_");
    if (catalog.has(cleaned)) return cleaned;
    return catalogByLabel.get(rawId.trim().toLowerCase()) ?? null;
  };

  const name =
    typeof data.name === "string" && data.name.trim().length >= 2
      ? data.name.trim().slice(0, MAX_NAME)
      : "";
  if (!name) return [null, "missing/invalid name"];

  const type = data.type === "shapeless" ? "shapeless" : "shaped";

  // --- outId: derive a stable snake_case id from the name
  const outId =
    typeof data.outId === "string" &&
    /^[a-z0-9_]{3,40}$/.test(data.outId.trim())
      ? data.outId.trim()
      : `ai_${name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 32)}`;
  if (outId.length < 3) return [null, "outId too short"];

  // --- ingredients: every referenced id must exist in the catalog
  const key: Record<string, string> = {};
  if (data.key && typeof data.key === "object") {
    for (const [rawCh, value] of Object.entries(
      data.key as Record<string, unknown>
    )) {
      const ch = typeof rawCh === "string" ? rawCh.trim() : "";
      if (ch.length !== 1) continue;
      if (typeof value !== "string") continue;
      const id = resolveIngredient(value) ?? closestCatalogId(value, catalog);
      if (id) {
        key[ch] = id; // keep the model's own char (case fixed below)
      }
      // unresolvable: leave no key entry — the pattern char is blanked later
    }
  }
  const ins: string[] = [];
  if (Array.isArray(data.ins)) {
    for (const raw of data.ins.slice(0, 9)) {
      if (typeof raw !== "string") return [null, "ins entry not a string"];
      const id = resolveIngredient(raw) ?? closestCatalogId(raw, catalog);
      if (!id) {
        return [null, `ins uses unknown ingredient "${raw}"`];
      }
      ins.push(id);
    }
  }

  let pattern: string[] = [];
  if (type === "shaped") {
    if (!Array.isArray(data.pattern) || data.pattern.length === 0) {
      return [null, "shaped recipe without a pattern"];
    }
    pattern = (data.pattern as unknown[])
      .map((row) => (typeof row === "string" ? row : ""))
      .slice(0, 3);
    if (pattern.some((row) => row.length > 3)) {
      return [null, `pattern row too wide: ${JSON.stringify(pattern)}`];
    }
    // Trim to the content bounding box — the engine compares the pattern's
    // box to the placed cells' bounding box, so decorative padding columns
    // (" S " instead of "S") would never match. Models love vanilla-JSON
    // padding, so mirror the vanilla behavior of storing recipes trimmed.
    let minCol = 3;
    let maxCol = -1;
    for (let x = 0; x < 3; x++) {
      const hasContent = pattern.some((row) => (row[x] ?? " ") !== " ");
      if (hasContent) {
        if (x < minCol) minCol = x;
        if (x > maxCol) maxCol = x;
      }
    }
    if (maxCol === -1) {
      return [null, "pattern has no filled cells"];
    }
    pattern = pattern
      .filter((row) => row.trim().length > 0)
      .map((row) => row.slice(minCol, maxCol + 1));
    // every non-space char must have a key entry (case-insensitive — when
    // the pattern says "b" but the key says "B", unify on the pattern's char)
    const used = new Set(pattern.join("").split("").filter((c) => c !== " "));
    if (used.size === 0) return [null, "pattern has no filled cells"];
    for (const ch of used) {
      const mapped =
        key[ch] ??
        key[ch.toUpperCase()] ??
        key[ch.toLowerCase()];
      if (!mapped) {
        // No mapping at all — blank the char out of every row and continue
        // with a (smaller) legal recipe instead of failing the whole forge.
        pattern = pattern.map((row) =>
          row
            .split("")
            .map((c) => (c === ch ? " " : c))
            .join("")
        );
        delete key[ch.toUpperCase()];
        delete key[ch.toLowerCase()];
        continue;
      }
      delete key[ch.toUpperCase()];
      delete key[ch.toLowerCase()];
      key[ch] = mapped;
    }
    // blanking may have emptied rows/columns — re-trim to the content box
    {
      let minC = 3;
      let maxC = -1;
      for (let x = 0; x < 3; x++) {
        const has = pattern.some((row) => (row[x] ?? " ") !== " ");
        if (has) {
          if (x < minC) minC = x;
          if (x > maxC) maxC = x;
        }
      }
      if (maxC === -1) {
        return [null, "pattern empty after ingredient repair"];
      }
      pattern = pattern
        .filter((row) => row.trim().length > 0)
        .map((row) => row.slice(minC, maxC + 1));
    }
    if (Object.keys(key).length !== used.size) {
      // drop unused key entries
      for (const ch of Object.keys(key)) if (!used.has(ch)) delete key[ch];
    }
  } else if (ins.length < 1 || ins.length > 9) {
    return [null, `shapeless needs 1-9 ingredients, got ${ins.length}`];
  }

  const outCount = Math.min(
    8,
    Math.max(1, Math.round(Number(data.outCount)) || 1)
  );

  // --- minimum grid size: fits 2x2 only when every dimension ≤2 and at
  //  most 4 non-empty cells (shapeless ≤4 ingredients)
  let mode: 2 | 3 = 3;
  if (type === "shaped") {
    const rows = pattern.filter((row) => row.trim().length > 0);
    const cols = Math.max(...rows.map((row) => row.length));
    const filled = pattern
      .join("")
      .split("")
      .filter((c) => c !== " ").length;
    if (rows.length <= 2 && cols <= 2 && filled <= 4) mode = 2;
  } else if (ins.length <= 4) {
    mode = 2;
  }

  const flavor =
    typeof data.flavor === "string" && data.flavor.trim().length > 3
      ? data.flavor.trim().slice(0, 180)
      : "";

  // Short VISUAL description for the pixel-art generator.
  const iconDesc =
    typeof data.icon === "string" && data.icon.trim().length >= 3
      ? data.icon.trim().slice(0, 90)
      : name;

  // Sprite spec (shape + palette for the fallback procedural painter).
  let sprite: ForgedRecipe["sprite"];
  if (data.sprite && typeof data.sprite === "object") {
    const s = data.sprite as Record<string, unknown>;
    const str = (v: unknown, max: number) =>
      typeof v === "string" && /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v.trim())
        ? v.trim().slice(0, max)
        : undefined;
    sprite = {
      template:
        typeof s.template === "string" &&
        (SPRITE_TEMPLATES as readonly string[]).includes(s.template.trim())
          ? s.template.trim()
          : undefined,
      primary: str(s.primary, 9),
      secondary: str(s.secondary, 9),
      accent: str(s.accent, 9),
    };
  }

  return [
    {
      name,
      type,
      pattern,
      key,
      ins,
      outId,
      outCount,
      mode,
      flavor,
      iconDesc,
      sprite,
    },
    null,
  ];
}

/** Saves one processed icon; returns its public path or null. */
async function saveIcon(png: Buffer): Promise<string | null> {
  try {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
    const fileName = `ai_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.png`;
    await fs.promises.writeFile(path.join(ICONS_DIR, fileName), png);
    return `/ai-icons/${fileName}`;
  } catch (error) {
    console.error("[ai/forge saveIcon]", error);
    return null;
  }
}

/** Generates + pixelizes ONE candidate; null on any failure. */
async function paintCandidate(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  iconDesc: string,
  variant: string
): Promise<string | null> {
  const prompt = [
    `Minecraft inventory item icon: ${iconDesc}.`,
    "16x16 pixel art sprite, chunky blocky square pixels, flat colors, simple shading, vanilla Minecraft item texture style.",
    "ONE single item, centered with empty margin around it.",
    "Plain solid bright magenta background #FF00FF covering the entire backdrop.",
    "No text, no watermark, no border, no scenery, no hands, no table.",
    variant,
  ]
    .filter(Boolean)
    .join(" ");
  try {
    const response = await zai.images.generations.create({
      prompt,
      size: "1024x1024",
    });
    const base64 = response.data?.[0]?.base64;
    if (!base64) return null;
    const png = await pixelizeIconPng(Buffer.from(base64, "base64"));
    return await saveIcon(png);
  } catch (error) {
    console.error("[ai/forge paintCandidate]", error);
    return null;
  }
}

/** The full forge pipeline — runs in the background, never blocks a request. */
async function runForgeJob(
  job: ForgeJob,
  prompt: string,
  catalog: CatalogEntry[]
): Promise<void> {
  const catalogMap = new Map(catalog.map((c) => [c.id, c.label]));
  const catalogLines = catalog
    .slice(0, 400)
    .map((c) => `${c.id} | ${c.label}`)
    .join("\n");

  try {
    const zai = await ZAI.create();

    // ---------- 1) design the recipe (with corrective retries) ----------
    job.stage = "design";
    const designMessages: { role: "assistant" | "user"; content: string }[] = [
      {
        role: "assistant",
        content: [
          "You are the RECIPE FORGE of RATFIRE — you invent Minecraft-style crafting recipes for custom items.",
          "Given a player's item description, reply with STRICT JSON only (no prose, no code fences):",
          '{"name":"<display name, max 24 chars>","type":"shaped"|"shapeless","pattern":["<up to 3 rows, each 1-3 chars, space = empty>"],"key":{"<char>":"<ingredient id from catalog>"},"ins":["<ingredient id>"],"outId":"<snake_case_item_id>","outCount":1-8,"flavor":"<one-line lore, max 140 chars>","icon":"<3-8 word VISUAL description of the item for a pixel artist, e.g. glowing orange lava sword with molten cracks>","sprite":{"template":"<one of: sword pickaxe axe shovel gem ingot orb potion wand helmet shield book bomb star coin>","primary":"#rrggbb material color","secondary":"#rrggbb handle/base color","accent":"#rrggbb glow/emblem color"}}',
          "- Pick the sprite template that matches the item's SHAPE (sword for blades, pickaxe for tools, gem/crystal, ingot for metals, orb for magical spheres, potion for brews, wand/staff, armor pieces, shield, book, bomb, star for sparkly charms, coin for currency). Choose palette hex colors from the item's theme (lava → orange/red, ice → pale blue, poison → green).",
          "- icon: describe how the item LOOKS (shape + colors + glow), NOT its lore or powers.",
          "HARD RULES:",
          "- shaped → use pattern+key, leave ins []; shapeless → use ins only (1-9 ids), pattern [], key {}.",
          "- Ingredients MUST be ids copied VERBATIM from the catalog (CATALOG format: id | label). NEVER invent ids.",
          "- If the item implies an ingredient that is NOT in the catalog (blaze rod, lava bucket, feather...), SUBSTITUTE the closest available id that IS in the catalog. Examples of good substitutions: fire/lava/magma -> obsidian or netherite_ingot; crystal/gem -> diamond or emerald; wing/jet -> redstone + iron_ingot; magic -> emerald + redstone.",
          "- WORKED EXAMPLE (do not copy verbatim, learn the shape): a sword = blade material stacked over a stick. For \"lava sword\" with no lava items in the catalog, a correct answer is {\"name\":\"Lava Sword\",\"type\":\"shaped\",\"pattern\":[\"O\",\"O\",\"S\"],\"key\":{\"O\":\"obsidian\",\"S\":\"stick\"},\"ins\":[],\"outId\":\"ai_lava_sword\",\"outCount\":1,\"flavor\":\"...\",\"icon\":\"glowing orange lava sword with molten cracks\",\"sprite\":{\"template\":\"sword\",\"primary\":\"#ff7a1f\",\"secondary\":\"#6e4a25\",\"accent\":\"#ffd75e\"}} (obsidian = mined block in the catalog).",
          "- Balance like vanilla: tools need planks/sticks/ingots; strong items need rarer materials (diamond, netherite, blaze rod).",
          "- Recipes must fit a 3x3 grid (max 3 rows x 3 cols).",
          "- outId: lowercase snake_case, unique-ish (prefix ai_ optional).",
          "CATALOG START",
          catalogLines,
          "CATALOG END",
        ].join("\n"),
      },
    ];

    let forged: ForgedRecipe | null = null;
    let lastReason = "";
    for (let attempt = 0; attempt < 3 && !forged; attempt++) {
      const round: { role: "assistant" | "user"; content: string }[] = [
        ...designMessages,
        { role: "user", content: `Forge this: ${prompt}` },
      ];
      if (attempt > 0) {
        const suggestions = catalog
          .slice()
          .sort(() => Math.random() - 0.5)
          .slice(0, 30)
          .map((c) => c.id)
          .join(", ");
        round.push({
          role: "user",
          content: `Previous attempt was rejected: ${lastReason}. Fix it — use ONLY ingredient ids that appear in the catalog (copy them exactly) and a legal pattern (≤3 rows x ≤3 chars). Valid id examples: ${suggestions}. Return STRICT JSON.`,
        });
      }
      const completion = await zai.chat.completions.create({
        messages: round,
        thinking: { type: "disabled" },
      });
      const raw = completion.choices[0]?.message?.content ?? "";
      const data = extractJson(raw);
      if (!data) {
        console.error(
          "[ai/forge] attempt failed to return JSON:",
          raw.slice(0, 400)
        );
        continue;
      }
      const [candidate, reason] = normalizeForge(data, catalogMap);
      if (!candidate) {
        lastReason = reason ?? "invalid recipe";
        console.error(`[ai/forge] draft rejected: ${lastReason}`, data);
        continue;
      }
      forged = candidate;
    }
    if (!forged) {
      throw new Error(
        "The forge couldn't design a valid recipe — try describing the item differently."
      );
    }

    // ---------- 2) paint the icons (3 pixel-art candidates) ----------
    job.stage = "icons";
    const variants = [
      "",
      "Slightly brighter saturated palette.",
      "Slightly darker moody palette.",
    ];
    let candidates = (
      await Promise.all(
        variants
          .slice(0, CANDIDATES)
          .map((variant) => paintCandidate(zai, forged.iconDesc, variant))
      )
    ).filter((p): p is string => !!p);
    if (candidates.length === 0) {
      // One sequential retry (parallel burst may have been rate-limited)…
      const retry = await paintCandidate(zai, forged.iconDesc, "");
      if (retry) candidates = [retry];
    }
    if (candidates.length === 0) {
      // …and if the image model is entirely unavailable, the PROCEDURAL
      // painter still delivers a vanilla-style sprite — forging never dies.
      try {
        const png = await renderSpritePng(
          forged.sprite?.template,
          forged.sprite,
          `${forged.name}:${forged.outId}`
        );
        const fallback = await saveIcon(png);
        if (fallback) candidates = [fallback];
      } catch (iconError) {
        console.error("[ai/forge fallback icon]", iconError);
      }
    }

    // ---------- 3) persist ----------
    job.stage = "save";
    const recipeId = `ai_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    await db.customRecipe.create({
      data: {
        recipeId,
        name: forged.name,
        type: forged.type,
        mode: forged.mode,
        pattern: JSON.stringify(forged.pattern),
        keyMap: JSON.stringify(forged.key),
        ins: JSON.stringify(forged.ins),
        outId: forged.outId,
        outCount: forged.outCount,
        cat: "tech",
        iconPath: candidates[0] ?? null,
        flavor: forged.flavor || null,
        prompt,
      },
    });

    job.recipe = {
      recipeId,
      name: forged.name,
      type: forged.type,
      mode: forged.mode,
      pattern: forged.pattern,
      key: forged.key,
      ins: forged.ins,
      outId: forged.outId,
      outCount: forged.outCount,
      cat: "tech",
      iconPath: candidates[0] ?? null,
      flavor: forged.flavor || null,
    };
    job.candidates = candidates;
    job.status = "done";
  } catch (error) {
    job.status = "error";
    job.error =
      error instanceof Error
        ? error.message
        : "Forge overloaded — give it another shot.";
  } finally {
    job.finishedAt = Date.now();
  }
}

export async function POST(request: NextRequest) {
  let prompt = "";
  let catalog: CatalogEntry[] = [];
  try {
    const body = (await request.json()) as {
      prompt?: unknown;
      catalog?: unknown;
    };
    if (typeof body?.prompt === "string") {
      prompt = body.prompt.trim().slice(0, MAX_PROMPT);
    }
    if (Array.isArray(body?.catalog)) {
      catalog = (body.catalog as CatalogEntry[])
        .filter(
          (c): c is CatalogEntry =>
            !!c &&
            typeof c === "object" &&
            typeof c.id === "string" &&
            typeof c.label === "string"
        )
        .slice(0, 600);
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
  if (prompt.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Describe the item you want to forge." },
      { status: 400 }
    );
  }
  if (catalog.length < 5) {
    return NextResponse.json(
      { ok: false, error: "Ingredient catalog unavailable — reload the lobby." },
      { status: 400 }
    );
  }

  pruneJobs();

  const job: ForgeJob = {
    id: crypto.randomUUID(),
    status: "working",
    stage: "design",
    recipe: null,
    candidates: [],
    error: "",
    createdAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(job.id, job);
  void runForgeJob(job, prompt, catalog).catch(() => {
    // runForgeJob captures everything into job.error — belt & braces.
  });

  // Answer IMMEDIATELY — the gateway can no longer sever a 50-s forge.
  return NextResponse.json({ ok: true, jobId: job.id });
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId") ?? "";
  const job = jobId ? jobs.get(jobId) : undefined;
  if (!job) {
    return NextResponse.json(
      { ok: false, error: "Unknown or expired forge job — please start again." },
      { status: 404 }
    );
  }
  return NextResponse.json({
    ok: true,
    status: job.status,
    stage: job.stage,
    recipe: job.recipe,
    candidates: job.candidates,
    error: job.error,
  });
}
