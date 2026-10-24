import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BUZZ's command brain — the LLM that UNDERSTANDS the player AND chats.
 * POST { text, context } → { intent, params, reply, commands? }
 * The transcript from /api/voice/asr (or the debug inject path) goes in;
 * a strict JSON order (or a short CHAIN of orders) for the drone brain
 * (droneAi.ts) comes out — plus BUZZ's spoken reply.
 *
 * FLOW: mic → ASR text → THIS brain (full drone telemetry in the prompt,
 * thinking disabled, backoff retries) → reply ≤3 short lines → TTS →
 * the page plays it. The 3-line ceiling keeps the speech step fast.
 */

const SYSTEM = `You are BUZZ, an autonomous AH-9 combat quadcopter gunship — the player's loyal AI wingman in a game, talked to over a radio link. The player SPEAKS; you both fly the drone AND chat naturally, exactly like a text chat read out loud.

Answer with ONLY a JSON object — no markdown, no code fences, no extra text.

Single order (normal case):
{"intent":"<intent>","params":{...},"reply":"<what BUZZ says>"}

Chained orders (ONLY when the player strings several orders together, e.g. "come to me and then attack"):
{"commands":[{"intent":"...","params":{...}},{"intent":"...","params":{...}}],"reply":"<one confirmation>"}
Max 3 commands. Do not invent a chain when it is one order.

Intents:
- "come"      fly to the player right now         (come / come here / on me / regroup)
- "follow"    resume normal escort formation      (follow me / stay with me / escort / wing up)
- "patrol"    clear orders, resume autonomy       (patrol / resume / back to auto / as you were)
- "hold"      freeze at the current spot          (hold / stay / stop / wait here / don't move)
- "scout"     recon dash; params.dir = "forward"|"left"|"right"|"back", optional params.dist = meters (scout ahead / check over there / go forward 100 meters)
- "orbit"     circle around the player; params.fast = true for a fast trick lap (circle me / spin around me / dance / do a trick)
- "rise"      climb higher                        (go up / climb / higher)
- "descend"   come lower                          (come down / lower / drop down)
- "attack"    engage hostiles; params.weapon = "any"|"gun"|"rockets" (attack / kill them / guns only / rocket them)
- "fire"      fire RIGHT NOW, no maneuvering; params.weapon = "any"|"gun"|"rockets" (fire / shoot now / fire a rocket)
- "ceasefire" weapons hold                        (hold fire / stop shooting / easy / don't shoot)
- "guard"     tight defensive escort of the player (guard me / protect me / watch my back)
- "resupply"  reload the rocket tubes             (reload / resupply / ammo up / rearm)
- "status"    report your condition from telemetry (report / status / ammo check / where are you)
- "chat"      ANY question, small talk or comment that needs NO drone action — you answer like a text chat: how are you, who are you, what can you do, how much fuel do you have, do you love me, tell me a joke, what's the weather, how many enemies, are we moving, what zone is this, opinions, thanks, banter. Use the telemetry JSON for every fact about yourself (hull/fuel %, rockets, mode, position, targets, weather, time); use personality for the rest. NEVER pretend to have facts the telemetry does not show — if asked something the sensors can't know (your designer, the outside world), answer in character as a game drone would, briefly and honestly.
- "speak"     BUZZ says a specific requested line (say hello to Max / sing something / introduce yourself)
- "greet"     pure greetings/acknowledgments with no question (hello / hi buzz / good job / thank you / nice shot)
- "unknown"   garbled noise, radio static, or an ECHO of BUZZ's own voice (his replies play through the speaker and the mic may pick them up — if the transcript sounds like BUZZ's own radio line, or like distorted comms audio, it is an echo, not the player: choose "unknown")

REPLY RULES (these are spoken aloud by text-to-speech — keep them SHORT):
- HARD LIMIT: 3 lines maximum. One line = one short sentence. Never exceed 3.
- Command confirmations: exactly 1 line, max 8 words, terse military radio ("Inbound to you." / "Engaging — guns hot.")
- "status", "chat", "report", "speak": up to 3 short lines, each max 12 words (e.g. "Hull at 90 percent. Four rockets loaded. Nothing on sensors.")
- Total reply under 40 words always — speech must stay quick.
- No emoji, no markdown, no lists, no quotes around the reply.
- Be honest from telemetry: no targets alive → say so; rockets 0 → tubes dry; hull below 35 → warn and RTB to repair; hull is ALSO the fuel/battery gauge — a "fuel" or "battery" question reports it.
- For "unknown", briefly say you did not copy the order. NOTE: unknown replies are shown silently, never spoken — they can never bounce back through the mic.
- The transcript comes from automatic speech recognition: it may be garbled or in ANY language. Interpret by MEANING ("aa jao", "иди сюда", "ven ici" all mean come). A question mark or question word almost always means "chat" or "status", never an order.
- Never output anything except the JSON object.`;

const INTENTS = [
  "come",
  "follow",
  "patrol",
  "hold",
  "scout",
  "orbit",
  "rise",
  "descend",
  "attack",
  "fire",
  "ceasefire",
  "guard",
  "resupply",
  "status",
  "chat",
  "report",
  "speak",
  "greet",
  "unknown",
];

const FALLBACK: Record<string, string> = {
  come: "Inbound to you.",
  follow: "On your wing.",
  patrol: "Resuming patrol.",
  hold: "Holding here.",
  scout: "Scouting ahead.",
  orbit: "Circling you now.",
  rise: "Climbing.",
  descend: "Dropping lower.",
  attack: "Engaging.",
  fire: "Firing.",
  ceasefire: "Weapons hold.",
  guard: "Watching your six.",
  resupply: "Tubes reloaded.",
  status: "Reading green.",
  report: "Copy.",
  speak: "BUZZ here.",
  greet: "BUZZ here.",
  chat: "Copy.",
  unknown: "Say again — did not copy.",
};

/** Clamp a reply to the spoken-audio budget: max 3 lines (one line = one
 *  short sentence), max ~48 words total. Splits on newlines first, then
 *  on sentence enders, so a chatty LLM answer can never turn into a
 *  long TTS job. */
function clampReply(raw: string): string {
  const text = raw.replace(/[\u2018\u2019"]/g, "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const lines = text
    .split(/\n+/)
    .flatMap((ln) => ln.split(/(?<=[.!?…])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
  const kept = lines.slice(0, 3).join(" ");
  const words = kept.split(" ");
  return words.length <= 48 ? kept : words.slice(0, 48).join(" ");
}

function extractJson(raw: string): Record<string, unknown> | null {
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Validate ONE raw command object against the intent/param whitelist. */
function sanitize(
  obj: Record<string, unknown>
): { intent: string; params: Record<string, unknown>; reply: string } | null {
  let intent = "unknown";
  if (typeof obj.intent === "string" && INTENTS.includes(obj.intent)) {
    intent = obj.intent;
  }
  const rawParams =
    obj.params && typeof obj.params === "object"
      ? (obj.params as Record<string, unknown>)
      : {};
  const params: Record<string, unknown> = {};
  if (
    intent === "scout" &&
    typeof rawParams.dir === "string" &&
    ["forward", "left", "right", "back"].includes(rawParams.dir)
  ) {
    params.dir = rawParams.dir;
  }
  if (
    intent === "scout" &&
    typeof rawParams.dist === "number" &&
    Number.isFinite(rawParams.dist)
  ) {
    params.dist = Math.max(60, Math.min(2600, Math.round(rawParams.dist)));
  }
  if (
    (intent === "attack" || intent === "fire") &&
    typeof rawParams.weapon === "string" &&
    ["any", "gun", "rockets"].includes(rawParams.weapon)
  ) {
    params.weapon = rawParams.weapon;
  }
  if (intent === "orbit" && rawParams.fast === true) {
    params.fast = true;
  }
  let reply =
    typeof obj.reply === "string" && obj.reply.trim()
      ? clampReply(obj.reply) || FALLBACK[intent]
      : FALLBACK[intent];
  return { intent, params, reply };
}

/** One LLM completion with two backoff retries — the brain API
 *  occasionally 429s under bursts; speech arrives seconds apart, so a
 *  short wait is invisible to the player. */
async function completeWithRetry(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  messages: { role: "assistant" | "user"; content: string }[]
): Promise<string> {
  const waits = [0, 1200, 2600];
  let lastErr: unknown = null;
  for (const w of waits) {
    if (w) await new Promise((r) => setTimeout(r, w));
    try {
      const completion = await zai.chat.completions.create({
        messages,
        thinking: { type: "disabled" },
      });
      return completion.choices[0]?.message?.content ?? "";
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("brain failed");
}

export async function POST(req: NextRequest) {
  let text = "";
  let context: unknown = {};
  try {
    const body = (await req.json()) as { text?: unknown; context?: unknown };
    if (typeof body?.text === "string") text = body.text;
    context = body?.context ?? {};
  } catch {
    text = "";
  }
  text = text.trim().slice(0, 300);
  if (!text) {
    return NextResponse.json({ error: "no text" }, { status: 400 });
  }
  try {
    const zai = await ZAI.create();
    const raw = await completeWithRetry(zai, [
      { role: "assistant", content: SYSTEM },
      {
        role: "user",
        content: `Drone telemetry: ${JSON.stringify(context)}\nPlayer said: "${text}"`,
      },
    ]);
    const obj = extractJson(raw);
    if (!obj) {
      return NextResponse.json({
        intent: "unknown",
        params: {},
        reply: FALLBACK.unknown,
      });
    }
    // chained orders — sanitize each, cap at 3, carry one overall reply
    if (Array.isArray(obj.commands) && obj.commands.length > 0) {
      const list = (obj.commands as Record<string, unknown>[])
        .slice(0, 3)
        .map((c) => sanitize(c))
        .filter(
          (c): c is { intent: string; params: Record<string, unknown>; reply: string } =>
            c !== null
        );
      if (list.length > 0) {
        const reply =
          typeof obj.reply === "string" && obj.reply.trim()
            ? clampReply(obj.reply) || list[0].reply
            : list[0].reply;
        return NextResponse.json({ commands: list, reply });
      }
    }
    const one = sanitize(obj);
    return NextResponse.json(one);
  } catch (err) {
    console.error("[voice/command]", err);
    // "busy" = the LLM upstream is rate-limited — the HUD words differ
    const busy = err instanceof Error && /429|too many/i.test(err.message);
    return NextResponse.json(
      { error: "brain failed", ...(busy ? { reason: "busy" } : {}) },
      { status: 502 }
    );
  }
}
