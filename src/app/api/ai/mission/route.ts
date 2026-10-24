import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AI MISSION GENERATOR — the lobby's "AI MISSIONS" box. One click asks the
 * LLM to draft a fresh daily bounty for a RATFIRE zone. The model returns
 * STRICT JSON; the server validates every field and falls back to a
 * hand-written mission if the parse fails, so the button NEVER dead-ends.
 */

type Mission = {
  title: string;
  zone: string;
  difficulty: "RECRUIT" | "VETERAN" | "ELITE";
  objective: string;
  brief: string;
  hint: string;
  rewardCoins: number;
  rewardGems: number;
};

const ZONES = ["GRASSLANDS", "DESERT", "TUNDRA", "VOLCANO"];

const DIFFICULTIES = ["RECRUIT", "VETERAN", "ELITE"] as const;

/** Deterministic fallbacks keep the feature workable even offline. */
const FALLBACKS: Mission[] = [
  {
    title: "Operation Ember Veil",
    zone: "VOLCANO",
    difficulty: "ELITE",
    objective: "Destroy 12 lava-spawned patrols before the caldera erupts.",
    brief:
      "Seismic reads are spiking. Drop into VOLCANO, hold the ridge line and thin the patrol waves. BUZZ will paint targets.",
    hint: "Railgun one-shots the armored stalkers at range.",
    rewardCoins: 850,
    rewardGems: 6,
  },
  {
    title: "Dust Convoy Intercept",
    zone: "DESERT",
    difficulty: "VETERAN",
    objective: "Intercept the supply convoy and crack 3 loot chests.",
    brief:
      "A convoy is crawling through the dunes. Ambush it, grab the chests and exfil before reinforcements arrive.",
    hint: "Grenade Launcher pops the armored transport in two hits.",
    rewardCoins: 520,
    rewardGems: 3,
  },
  {
    title: "Frostline Sweep",
    zone: "TUNDRA",
    difficulty: "RECRUIT",
    objective: "Survive 5 minutes and gather 10 blocks of ice-covered stone.",
    brief:
      "Cold op, fresh blood. Sweep the glacier edge, mine what you can and keep your HP above 50.",
    hint: "Craft a stone shovel before you drop — ice digs slow with fists.",
    rewardCoins: 260,
    rewardGems: 1,
  },
];

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Pull the first balanced {...} JSON object out of a chatty reply. */
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

function buildFallback(seed: number): Mission {
  return FALLBACKS[seed % FALLBACKS.length];
}

export async function POST(request: NextRequest) {
  // Optional zone bias from the client ({ zone?: string }) — kept loose so
  // the generator can also be fired with an empty body.
  let zoneBias = "";
  try {
    const body = (await request.json()) as { zone?: unknown };
    if (typeof body?.zone === "string") zoneBias = body.zone.trim().slice(0, 24);
  } catch {
    zoneBias = "";
  }

  const seed = Math.floor(Math.random() * 1e9);
  const fallback = buildFallback(seed);
  const zone = zoneBias || ZONES[seed % ZONES.length];

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content: [
            "You are the mission computer of RATFIRE, a voxel arena shooter.",
            "Draft ONE daily bounty mission. Reply with STRICT JSON only — no prose, no code fences.",
            "Schema: {\"title\":string(max 40),\"zone\":one of GRASSLANDS|DESERT|TUNDRA|VOLCANO,\"difficulty\":one of RECRUIT|VETERAN|ELITE,\"objective\":string(max 90),\"brief\":string(max 200),\"hint\":string(max 90),\"rewardCoins\":int 100-900,\"rewardGems\":int 0-8}",
            "The objective must be playable in this game: survive/patrol waves, loot chests, mine/craft N blocks or items, defend a point, escort BUZZ the drone, hunt AI patrols.",
            "Flavor: military radio, gritty but fun.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Generate bounty #${seed}. Zone bias: ${zone}.`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const data = extractJson(raw);

    const title =
      typeof data?.title === "string" && data.title.trim().length > 2
        ? data.title.trim().slice(0, 48)
        : fallback.title;
    const missionZone =
      typeof data?.zone === "string" &&
      ZONES.includes(data.zone.trim().toUpperCase())
        ? data.zone.trim().toUpperCase()
        : fallback.zone;
    const difficultyRaw =
      typeof data?.difficulty === "string"
        ? (data.difficulty.trim().toUpperCase() as string)
        : "";
    const difficulty = (DIFFICULTIES as readonly string[]).includes(
      difficultyRaw
    )
      ? (difficultyRaw as Mission["difficulty"])
      : fallback.difficulty;
    const objective =
      typeof data?.objective === "string" && data.objective.trim().length > 8
        ? data.objective.trim().slice(0, 120)
        : fallback.objective;
    const brief =
      typeof data?.brief === "string" && data.brief.trim().length > 10
        ? data.brief.trim().slice(0, 260)
        : fallback.brief;
    const hint =
      typeof data?.hint === "string" && data.hint.trim().length > 3
        ? data.hint.trim().slice(0, 120)
        : fallback.hint;
    const rewardCoins = clampInt(
      data?.rewardCoins,
      100,
      900,
      fallback.rewardCoins
    );
    const rewardGems = clampInt(data?.rewardGems, 0, 8, fallback.rewardGems);

    return NextResponse.json({
      ok: true,
      mission: {
        title,
        zone: missionZone,
        difficulty,
        objective,
        brief,
        hint,
        rewardCoins,
        rewardGems,
      } satisfies Mission,
    });
  } catch (error) {
    console.error("[ai/mission POST]", error);
    // Never dead-end the button — serve a curated fallback mission.
    return NextResponse.json({ ok: true, mission: fallback });
  }
}
