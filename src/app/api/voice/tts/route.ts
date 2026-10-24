import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BUZZ's VOICE — text-to-speech for the drone's radio replies.
 * POST { text } → audio/wav binary.
 * The page plays it through a band-pass "radio" filter so BUZZ answers
 * OUT LOUD, not just in the HUD chip. Replies are short (≤ 12 words) so
 * one request per line is cheap; identical lines are served from a small
 * in-memory cache (the greetings/acks repeat a lot).
 */

// MALE VOICE: xiaochen (沉稳专业 — calm, steady professional). Measured
// median F0 ≈ 122 Hz, decisively male — the old "jam" voice measured
// ≈ 312 Hz (female range), which is why it was replaced. Pitch-verified
// against the other stock voices; xiaochen is the deepest of the set.
const VOICE = "xiaochen";
// xiaochen reads ~24% brisker than the old voice at speed 1.0, so a hair
// under normal restores the calm radio-operator cadence.
const SPEED = 0.95;

const cache = new Map<string, Buffer>();
const CACHE_MAX = 32;
// Cache key is voice-prefixed so a voice change never serves stale audio
// synthesized with the previous (female-range) voice.
const cacheKey = (text: string): string => `${VOICE}:${SPEED}:${text}`;

// CIRCUIT BREAKER — the upstream quota is small and SHARED with ASR and
// the LLM. When TTS 429s we stop retrying for a cooldown window (a missed
// line just stays text in the HUD chip) so speech never starves the ears
// and the brain of their quota.
let cooldownUntil = 0;
const COOLDOWN_MS = 12_000;

export async function POST(req: NextRequest) {
  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    if (typeof body?.text === "string") text = body.text;
  } catch {
    text = "";
  }
  text = text.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!text) {
    return NextResponse.json({ error: "no text" }, { status: 400 });
  }

  const key = cacheKey(text);
  const hit = cache.get(key);
  if (hit) {
    return new NextResponse(new Uint8Array(hit), {
      status: 200,
      headers: { "Content-Type": "audio/wav", "X-Cache": "hit" },
    });
  }
  // breaker open → fail fast (cached lines still play — only new synthesis
  // is refused, and the chip already carries the words)
  if (Date.now() < cooldownUntil) {
    return NextResponse.json(
      { error: "tts failed", reason: "busy" },
      { status: 503 }
    );
  }

  try {
    const zai = await ZAI.create();
    // wider backoff ladder — the TTS API occasionally 429s under bursts
    // (or an upstream quota window); a miss just means BUZZ stays silent
    // for that one line, the HUD chip still shows the text
    const waits = [0, 2500, 5000];
    let lastErr: unknown = null;
    for (const w of waits) {
      if (w) await new Promise((r) => setTimeout(r, w));
      try {
        const res = await zai.audio.tts.create({
          input: text,
          voice: VOICE,
          speed: SPEED,
          response_format: "wav",
          stream: false,
        });
        const buf = Buffer.from(new Uint8Array(await res.arrayBuffer()));
        if (buf.length < 100) throw new Error("tts empty");
        cache.set(key, buf);
        if (cache.size > CACHE_MAX) {
          cache.delete(cache.keys().next().value as string);
        }
        cooldownUntil = 0; // quota alive — reopen the channel
        return new NextResponse(new Uint8Array(buf), {
          status: 200,
          headers: { "Content-Type": "audio/wav" },
        });
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("tts failed");
  } catch (err) {
    console.error("[voice/tts]", err);
    const busy = err instanceof Error && /429|too many/i.test(err.message);
    if (busy) cooldownUntil = Date.now() + COOLDOWN_MS;
    return NextResponse.json(
      { error: "tts failed", ...(busy ? { reason: "busy" } : {}) },
      { status: busy ? 503 : 502 }
    );
  }
}
