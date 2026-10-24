import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BUZZ's ears — backend speech-to-text.
 * POST { audio: base64(WAV) } → { text }
 * The client voice link (src/game/voiceControl.ts) captures mic audio,
 * WAV-encodes each spoken segment and posts it here; the z-ai-web-dev-sdk
 * ASR model returns the transcript. The SDK must stay server-side.
 *
 * CIRCUIT BREAKER: the upstream quota is small and shared — when it 429s
 * we reject INSTANTLY (zero upstream calls) for a cooldown window so the
 * quota can actually recover. The client hears "busy" and flips to its
 * onboard browser ears, so the player's voice never dead-ends.
 */

// module scope — instant-reject deadline (Date.now ms) after a 429
let cooldownUntil = 0;
const COOLDOWN_MS = 18_000;

export async function POST(req: NextRequest) {
  let audio = "";
  try {
    const body = (await req.json()) as { audio?: unknown };
    if (typeof body?.audio === "string") audio = body.audio;
  } catch {
    audio = "";
  }
  if (!audio || audio.length > 14_000_000) {
    return NextResponse.json({ error: "no audio" }, { status: 400 });
  }
  if (Date.now() < cooldownUntil) {
    return NextResponse.json(
      {
        error: "asr failed",
        reason: "busy",
        retryAfter: Math.ceil((cooldownUntil - Date.now()) / 1000),
      },
      { status: 503 }
    );
  }
  try {
    const zai = await ZAI.create();
    // three WIDELY spaced backoff attempts — tight retry storms only feed
    // the throttle (each attempt burns quota). Wide spacing rides out a
    // throttle window instead.
    const waits = [0, 1500, 3500];
    let lastErr: unknown = null;
    for (const w of waits) {
      if (w) await new Promise((r) => setTimeout(r, w));
      try {
        const res = await zai.audio.asr.create({ file_base64: audio });
        cooldownUntil = 0; // quota is alive again — reopen the channel
        return NextResponse.json({ text: String(res?.text ?? "").trim() });
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("asr failed");
  } catch (err) {
    console.error("[voice/asr]", err);
    // "busy" = upstream rate-limited: arm the breaker and tell the client
    // to switch to its onboard ears — anything else is a real failure
    const busy = err instanceof Error && /429|too many/i.test(err.message);
    if (busy) cooldownUntil = Date.now() + COOLDOWN_MS;
    return NextResponse.json(
      { error: "asr failed", ...(busy ? { reason: "busy" } : {}) },
      { status: busy ? 503 : 502 }
    );
  }
}
