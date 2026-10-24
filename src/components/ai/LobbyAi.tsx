'use client';

/**
 * LOBBY AI — the two AI boxes on the lobby command deck:
 *
 *   <AiCommandBox />  — "AI COMMAND": chat with SARGE, the game-aware
 *                       command AI (POST /api/ai/assistant). Grounded in a
 *                       LIVE PLAYER SNAPSHOT (inventory/crafting grid/forged
 *                       items) and talkable: mic button records a question,
 *                       /api/voice/asr transcribes it and /api/voice/tts
 *                       speaks SARGE's reply out loud.
 *   <AiMissionBox />  — "AI MISSIONS": one-click daily bounty generator
 *                       (POST /api/ai/mission) with accept + history.
 *
 * Both are self-contained (fetch + local state) and render INSIDE a
 * LobbyBox crate, so they only ship content — the crate chrome lives in
 * the lobby screen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Coins,
  Dices,
  Gem,
  LoaderCircle,
  Mic,
  Send,
  Square,
  Target,
  Volume2,
} from 'lucide-react';

/** Live snapshot of what the player holds — rendered into SARGE's system
 *  prompt by /api/ai/assistant so advice matches the actual inventory. */
export type SargeContext = {
  /** "Oak Log ×12" style labels (already capped by the caller). */
  inventory?: string[];
  craftingGrid?: string[];
  forgedItems?: string[];
};

type ChatMsg = { role: 'user' | 'assistant'; content: string };

const QUICK_ASKS = [
  'How do I win?',
  'What should I craft next?',
  'Best weapon?',
  'Crafting basics?',
] as const;

const SARGE_GREETING: ChatMsg = {
  role: 'assistant',
  content:
    'SARGE on the line. I see your inventory — ask what to craft, mine or forge next. Keep it short, soldier.',
};

/** Mic capture → 16 kHz mono WAV → base64 (same wire format as the
 *  battlefield BUZZ voice link uses with /api/voice/asr). */
const ASR_RATE = 16000;
const MAX_RECORD_S = 10;

function encodeWavBase64(pcm: Float32Array, rate: number): string {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buf);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i += 1) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function resampleTo16k(pcm: Float32Array, srcRate: number): Float32Array {
  if (srcRate === ASR_RATE) return pcm;
  const ratio = srcRate / ASR_RATE;
  const outLen = Math.floor(pcm.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, pcm.length - 1);
    const frac = x - i0;
    out[i] = pcm[i0] * (1 - frac) + pcm[i1] * frac;
  }
  return out;
}

interface MicSession {
  ctx: AudioContext;
  stream: MediaStream;
  processor: ScriptProcessorNode;
  chunks: Float32Array[];
  length: number;
}

/** ==== AI COMMAND — SARGE chat ========================================= */
export function AiCommandBox({ context }: { context?: SargeContext }) {
  const [messages, setMessages] = useState<ChatMsg[]>([SARGE_GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /** Voice link: idle → recording → transcribing → speaking → idle. */
  const [voice, setVoice] = useState<
    'idle' | 'recording' | 'transcribing' | 'speaking'
  >('idle');
  const [voiceNote, setVoiceNote] = useState('');
  const micRef = useRef<MicSession | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  /** Keep the newest message in view. */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  /** Send one message; resolves with SARGE's reply (for the TTS link). */
  const send = useCallback(
    async (raw: string): Promise<string | null> => {
      const text = raw.trim().slice(0, 300);
      if (!text || busy) return null;
      const nextMessages: ChatMsg[] = [
        ...messages,
        { role: 'user', content: text },
      ];
      setMessages(nextMessages);
      setInput('');
      setBusy(true);
      try {
        const res = await fetch('/api/ai/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: nextMessages.slice(-10),
            context,
          }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          reply?: string;
          error?: string;
        };
        const reply = data.ok && data.reply ? data.reply : null;
        setMessages((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            content: reply ?? (data.error ?? 'Radio static — say that again?'),
          },
        ]);
        return reply;
      } catch {
        setMessages((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            content: 'Uplink failed — check the connection and try again.',
          },
        ]);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, context]
  );

  /** Stop + close the mic session, mixing everything down to 16k mono. */
  const stopRecording = useCallback(async (): Promise<Float32Array | null> => {
    const session = micRef.current;
    micRef.current = null;
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (!session) return null;
    try {
      session.processor.onaudioprocess = null;
      session.processor.disconnect();
      session.stream.getTracks().forEach((track) => track.stop());
      const mixed = new Float32Array(session.length || 1);
      let offset = 0;
      for (const chunk of session.chunks) {
        mixed.set(chunk, offset);
        offset += chunk.length;
      }
      await session.ctx.close().catch(() => {});
      return resampleTo16k(mixed, session.ctx.sampleRate);
    } catch {
      return null;
    }
  }, []);

  const speakReply = useCallback(async (text: string) => {
    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return; // quota/busy — the transcript stays on screen
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setVoice('idle');
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setVoice('idle');
      };
      setVoice('speaking');
      await audio.play();
    } catch {
      setVoice('idle');
    }
  }, []);

  const finishRecording = useCallback(async () => {
    setVoice('transcribing');
    const pcm = await stopRecording();
    if (!pcm || pcm.length < ASR_RATE / 4) {
      setVoiceNote('Heard nothing — try that again.');
      setVoice('idle');
      return;
    }
    try {
      const res = await fetch('/api/voice/asr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: encodeWavBase64(pcm, ASR_RATE) }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      const heard = (data.text ?? '').trim();
      if (!heard) {
        setVoiceNote('Static on the line — say that again.');
        setVoice('idle');
        return;
      }
      const reply = await send(heard);
      if (reply) {
        void speakReply(reply);
      } else {
        setVoice('idle');
      }
    } catch {
      setVoiceNote('Voice uplink failed — type it instead.');
      setVoice('idle');
    }
  }, [stopRecording, send, speakReply]);

  const startRecording = useCallback(async () => {
    if (micRef.current || busy) return;
    setVoiceNote('');
    // cut any reply still playing
    audioRef.current?.pause();
    audioRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const session: MicSession = {
        ctx,
        stream,
        processor,
        chunks: [],
        length: 0,
      };
      processor.onaudioprocess = (event) => {
        const active = micRef.current;
        if (!active) return;
        const chunk = new Float32Array(event.inputBuffer.getChannelData(0));
        active.chunks.push(chunk);
        active.length += chunk.length;
        if (active.length >= ASR_RATE * MAX_RECORD_S) {
          void finishRecording();
        }
      };
      source.connect(processor);
      processor.connect(ctx.destination);
      micRef.current = session;
      setVoice('recording');
      stopTimerRef.current = window.setTimeout(() => {
        void finishRecording();
      }, MAX_RECORD_S * 1000);
    } catch {
      setVoiceNote('Mic unavailable — check browser permissions.');
      setVoice('idle');
    }
  }, [busy, finishRecording]);

  /** Cut playback mid-sentence. */
  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setVoice('idle');
  }, []);

  // release mic + audio on unmount
  useEffect(() => {
    return () => {
      const session = micRef.current;
      if (session) {
        session.processor.onaudioprocess = null;
        session.stream.getTracks().forEach((track) => track.stop());
        void session.ctx.close().catch(() => {});
      }
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
      audioRef.current?.pause();
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* transcript */}
      <div
        ref={scrollRef}
        role="log"
        aria-label="SARGE conversation"
        aria-live="polite"
        className="ratfire-scroll flex max-h-56 min-h-40 flex-col gap-1.5 overflow-y-auto pr-1"
      >
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex items-start gap-1.5 ${
              msg.role === 'user' ? 'flex-row-reverse' : ''
            }`}
          >
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center border ${
                msg.role === 'user'
                  ? 'border-amber-400/50 bg-amber-400/10'
                  : 'border-emerald-400/50 bg-emerald-400/10'
              }`}
            >
              {msg.role === 'user' ? (
                <Target className="h-3 w-3 text-amber-300" aria-hidden />
              ) : (
                <Bot className="h-3 w-3 text-emerald-300" aria-hidden />
              )}
            </span>
            <p
              className={`max-w-[85%] border px-2 py-1 text-[10px] font-semibold leading-snug ${
                msg.role === 'user'
                  ? 'border-amber-400/30 bg-amber-400/5 text-amber-100'
                  : 'border-zinc-700/70 bg-zinc-950/70 text-zinc-200'
              }`}
            >
              {msg.content}
            </p>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.25em] text-emerald-300">
            <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden />
            SARGE is typing…
          </div>
        )}
      </div>

      {/* quick asks */}
      <div className="flex flex-wrap gap-1">
        {QUICK_ASKS.map((ask) => (
          <button
            key={ask}
            type="button"
            disabled={busy || voice === 'recording'}
            onClick={() => void send(ask)}
            className="border border-zinc-700/70 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-zinc-400 transition-colors hover:border-emerald-400/60 hover:text-emerald-300 disabled:opacity-40"
          >
            {ask}
          </button>
        ))}
      </div>

      {voiceNote && (
        <p
          role="status"
          className="border border-amber-400/40 bg-amber-400/5 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-amber-300"
        >
          {voiceNote}
        </p>
      )}

      {/* composer + voice link */}
      <form
        className="mt-auto flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask SARGE — tactics, weapons, crafting…"
          aria-label="Message SARGE"
          maxLength={300}
          className="min-w-0 flex-1 border border-zinc-700 bg-zinc-900/80 px-2 py-1.5 text-[11px] font-semibold text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-400/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            if (voice === 'recording') {
              void finishRecording();
            } else if (voice === 'speaking') {
              stopSpeaking();
            } else if (voice === 'idle') {
              void startRecording();
            }
          }}
          disabled={busy || voice === 'transcribing'}
          aria-label={
            voice === 'recording'
              ? 'Stop recording and send'
              : voice === 'speaking'
                ? 'Stop SARGE speaking'
                : 'Record a voice question for SARGE'
          }
          title={
            voice === 'recording'
              ? 'Recording — tap to send'
              : 'Ask with your voice'
          }
          className={`grid h-8 w-8 shrink-0 place-items-center border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            voice === 'recording'
              ? 'animate-pulse border-red-500/70 bg-red-500/20 text-red-300'
              : voice === 'speaking'
                ? 'border-emerald-400/70 bg-emerald-400/20 text-emerald-200'
                : 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/25'
          }`}
        >
          {voice === 'transcribing' ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : voice === 'recording' ? (
            <Square className="h-3 w-3" aria-hidden />
          ) : voice === 'speaking' ? (
            <Volume2 className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Mic className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        <button
          type="submit"
          disabled={busy || input.trim().length === 0}
          aria-label="Send message to SARGE"
          className="grid h-8 w-8 shrink-0 place-items-center border border-emerald-400/50 bg-emerald-400/10 text-emerald-300 transition-colors hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
        </button>
      </form>
    </div>
  );
}

/** ==== AI MISSIONS — one-click bounty generator ======================== */
type Mission = {
  title: string;
  zone: string;
  difficulty: string;
  objective: string;
  brief: string;
  hint: string;
  rewardCoins: number;
  rewardGems: number;
};

const DIFF_STYLES: Record<string, string> = {
  RECRUIT: 'border-emerald-400/50 text-emerald-300',
  VETERAN: 'border-amber-400/50 text-amber-300',
  ELITE: 'border-red-500/60 text-red-400',
};

export function AiMissionBox({
  showToast,
}: {
  showToast: (message: string) => void;
}) {
  const [mission, setMission] = useState<Mission | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const generate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/ai/mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { ok: boolean; mission?: Mission };
      if (data.ok && data.mission) {
        setMission(data.mission);
        setAccepted(false);
        setHistory((list) => [data.mission!.title, ...list].slice(0, 4));
      } else {
        showToast('MISSION UPLINK FAILED — try again');
      }
    } catch {
      showToast('MISSION UPLINK FAILED — try again');
    } finally {
      setBusy(false);
    }
  }, [busy, showToast]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy}
        className="flex h-9 items-center justify-center gap-2 border border-emerald-400/70 bg-gradient-to-b from-emerald-400/25 to-teal-600/25 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-100 transition-colors hover:from-emerald-400/40 hover:to-teal-600/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Dices className="h-4 w-4" aria-hidden />
        )}
        {busy ? 'Drafting the bounty…' : 'Generate AI mission'}
      </button>

      {mission ? (
        <div
          className={`ratfire-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto border p-2 ${
            accepted
              ? 'border-emerald-400/60 bg-emerald-400/5'
              : 'border-zinc-800 bg-zinc-950/50'
          }`}
          role="article"
          aria-label={`Mission ${mission.title}`}
        >
          <div className="flex items-center gap-1.5">
            <span
              className={`border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] ${
                DIFF_STYLES[mission.difficulty] ??
                'border-zinc-600 text-zinc-300'
              }`}
            >
              {mission.difficulty}
            </span>
            <span className="border border-zinc-600 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.2em] text-zinc-300">
              {mission.zone}
            </span>
            {accepted && (
              <span className="ml-auto flex items-center gap-1 text-[8px] font-black uppercase tracking-[0.2em] text-emerald-300">
                <span
                  className="h-1 w-1 animate-pulse rounded-full bg-emerald-400"
                  aria-hidden
                />
                Active
              </span>
            )}
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.15em] text-zinc-100">
            {mission.title}
          </p>
          <p className="text-[10px] font-bold leading-snug text-amber-200/90">
            {mission.objective}
          </p>
          <p className="text-[10px] font-semibold leading-snug text-zinc-400">
            {mission.brief}
          </p>
          <p className="border-t border-zinc-800 pt-1.5 text-[9px] font-semibold italic leading-snug text-zinc-500">
            Intel: {mission.hint}
          </p>
          <div className="flex items-center gap-3 pt-0.5">
            <span className="flex items-center gap-1 text-[10px] font-black tabular-nums text-amber-300">
              <Coins className="h-3.5 w-3.5" aria-hidden />+{mission.rewardCoins}
            </span>
            <span className="flex items-center gap-1 text-[10px] font-black tabular-nums text-emerald-300">
              <Gem className="h-3.5 w-3.5" aria-hidden />+{mission.rewardGems}
            </span>
            <button
              type="button"
              disabled={accepted}
              onClick={() => {
                setAccepted(true);
                showToast(`MISSION ACCEPTED · ${mission.title.toUpperCase()}`);
              }}
              className="ml-auto border border-amber-400/60 bg-amber-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-amber-300 transition-colors hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:border-emerald-400/40 disabled:bg-transparent disabled:text-emerald-300"
            >
              {accepted ? 'In the log' : 'Accept'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-24 flex-1 flex-col items-center justify-center border border-dashed border-zinc-800 p-2 text-center">
          <Bot className="mb-1 h-4 w-4 text-zinc-600" aria-hidden />
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-zinc-600">
            No bounty yet — roll one
          </p>
        </div>
      )}

      {history.length > 1 && (
        <p className="truncate text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-600">
          Earlier rolls: {history.slice(1).join(' · ')}
        </p>
      )}
    </div>
  );
}
