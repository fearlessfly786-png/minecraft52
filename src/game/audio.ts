/**
 * RATFIRE game audio — Web Audio sound manager.
 *
 * The suite is the user's pick plus their uploaded gun cues:
 *   rain-loop   "Heavy storm rain loop" (mixkit #2400)      /public/sfx/
 *   night-loop  "Wind blowing ambience" (mixkit #2658 WAV)  /public/sfx/
 *              — the NIGHT ambience channel, faded in with the moon
 *   shoot       user-uploaded gun SHOOTING sfx       /public/sfx/shoot.mp3
 *   reload      user-uploaded gun RELOAD sfx         /public/sfx/reload.mp3
 *   jump        user-uploaded ATHLETIC JUMP sfx      /public/sfx/jump.mp3
 *   roar        "Giant monster roar" (mixkit #1972 WAV) — the 5-key emote
 *   ignition    user-uploaded CAR IGNITION sfx (mixkit #1535 WAV) — the
 *              jeep's engine start (key turn + starter crank + catch),
 *              fired by enterJeep on every mount path
 *   chest       user-uploaded CHEST OPEN sfx — plays the INSTANT a loot
 *              chest / treasure box starts opening (the unlock cinematic:
 *              latch flip 0.38s + lid swing 0.67s finish in ~1s, so the
 *              sound accompanies the whole one-second opening); the SAME
 *              file played BACKWARDS (a sample-flipped copy, built once
 *              in the graph) rides the closing cinematic; the
 *              synthesized coin chime still stamps the loot burst
 * (the pre-existing /sounds/running-forest.wav footstep loop lives in
 * page.tsx as a plain HTMLAudioElement; the mute toggle covers ALL.)
 *
 * Autoplay-policy-proof architecture: the AudioContext is created LAZILY
 * inside the FIRST user gesture (any click / key press — the F fire key
 * qualifies). A context born during a gesture starts 'running' in every
 * browser — no resume() gamble. The raw file data is fetched lazily on
 * that same first gesture (fetch itself needs no gesture, but deferring
 * the download keeps ~14MB of audio bytes out of RAM while the player
 * idles in the lobby — decode timing relative to the consuming context
 * is unchanged). One-shots fired before the graph is ready only warm the
 * init — the next press plays. A missing file only silences its own cue;
 * audio can never break the game.
 */

import {
  getGameSuspended,
  onGameSuspend,
  setGlobalMuted,
} from './muteState';

export interface GameAudioHandle {
  /** Storm intensity 0..1 — drives the rain loop. */
  setRain(intensity: number): void;
  /** Night factor 0..1 (moon height) — fades the night wind loop in/out. */
  setNight(intensity: number): void;
  /** Ensure the context exists + is running (called from user gestures). */
  resume(): void;
  /** One-shot cues: gun fire per attack clip, gun draw on weapon switch,
   *  the F-key fire cycle (shot -> reload) on every attack press, the
   *  Space-key jump, and the 5-key monster roar. shootThenReload schedules
   *  the reload `reloadDelaySeconds` after the bang so BOTH cues live
   *  inside one attack-clip duration. roar(fitSeconds) trims the long roar
   *  file so it ends exactly with the flip animation. */
  shoot(): void;
  reload(): void;
  jump(): void;
  roar(fitSeconds?: number): void;
  /** Jeep engine start (user-uploaded mixkit ignition WAV) — fires when
   *  the player mounts the vehicle (E key, touch button, any path). */
  ignition(): void;
  shootThenReload(reloadDelaySeconds?: number): void;
  /** Loot chest UNLOCK started: the user-uploaded chest-open creak-and-pop
   *  sfx (/sfx/chest-open.mp3) plays the INSTANT the unlock cinematic
   *  begins — latch flip (0.38s) + lid swing (0.67s) complete in ~1s, so
   *  the sound rides the whole one-second opening. Covered by the mute
   *  toggle; a missing file only silences this cue (the loot chime below
   *  still stamps the burst). */
  chestOpen(): void;
  /** Loot chest CLOSE: the SAME uploaded sfx played BACKWARDS — a
   *  sample-flipped copy of the decoded chest-open.mp3 (built once,
   *  lazily, inside the graph) so the closing cinematic (lid shut 0.67s
   *  then hasp + padlock lock 0.38s, the mirror of the opening) gets the
   *  exact mirror of the opening cue. Same gain + slight pitch jitter as
   *  the open cue; covered by the mute toggle; a missing/undecodable file
   *  only silences this cue. */
  chestClose(): void;
  /** Loot burst: a short synthesized two-note coin chime (B5 -> E6) that
   *  stamps the moment the lid rests open and the coins bank. */
  pickup(): void;
  /** Lightning thunder: a synthesized rolling rumble (filtered noise,
   *  three slow swells over ~3s) scheduled `delaySeconds` from now —
   *  distance-proportional so far bolts thunder later. No audio file;
   *  covered by the master mute like every other cue. */
  thunder(delaySeconds?: number): void;
  /** Missile lock-on radar cue, synthesized: `final=false` is the short
   *  pinging blip the HUD repeats with an accelerating rate while the
   *  reticle is tightening; `final=true` is the higher solid tone that
   *  stamps the launch. No audio file; covered by the master mute. */
  lockBlip(final?: boolean): void;
  /** WIDOW web shot: a synthesized "thwip" — a band-passed noise sweep
   *  (silk hiss, 3.4kHz→750Hz over 140ms) plus a descending triangle
   *  pluck (the strand snapping taut). No audio file; covered by the
   *  master mute like every other cue. */
  webShot(): void;
  /** Silk anchor splat: a soft low noise puff when a web strand sticks
   *  to the world. No audio file; covered by the master mute. */
  webStick(): void;
  /** Orb-web weave shimmer: five soft rising sine pings + an airy
   *  high-swish while the anchor blooms into its radial web. No audio
   *  file; covered by the master mute. */
  webWeave(): void;
  /** DART's piston engine, synthesized live (no audio file): a pair of
   *  detuned sawtooths + a sub sine through a lowpass. `on=true` ramps
   *  the drone in, `throttle` (0..1) rides EVERY frame while the player
   *  flies — pitch and volume follow the lever like a real piston engine.
   *  Covered by the master mute like every other cue. */
  setPlaneEngine(on: boolean, throttle: number): void;
  /** Classic dual-tone car horn, synthesized: ~400 Hz + ~500 Hz through
   *  one shared lowpass (~1200 Hz), ~0.45s — 15ms attack, hold, ~120ms
   *  release. No audio file; covered by the master mute like every cue. */
  horn(): void;
  /** Soft low-fuel warning beep, synthesized: a single ~740 Hz sine
   *  blip (~0.14s) with a gentle decay — distinctly quieter than the
   *  horn. No audio file; covered by the master mute. */
  lowFuel(): void;
  /** CREEPER FUSE hiss, synthesized: a band-passed white-noise sweep
   *  (≈500 Hz → 2.8 kHz over ~1.45 s, the classic rising SSSSS) plus
   *  a gritty low-passed crackle layer underneath. Fires when a
   *  creeper starts its detonation fuse. No audio file; covered by
   *  the master mute like every other cue. */
  creeperHiss(): void;
  /** CREEPER detonation boom, synthesized: a sharp high-passed crack
   *  (first 60 ms) slamming into a deep low-passed noise burst + a
   *  sub-bass sine drop (60 Hz → 26 Hz) — a hollow, concussive blast
   *  distinctly meaner than the rocket thunder. No audio file;
   *  covered by the master mute. */
  creeperBoom(): void;
  /** Dash radio — a procedural lo-fi synthwave loop synthesized live
   *  (no audio file): ~82 BPM, Am7 -> Fmaj7 -> Cmaj7 -> G (one ~2.9s
   *  bar per chord) — detuned saw pad pairs through a lowpass,
   *  triangle/sine bass on beats 1+3, soft kick every beat, offbeat
   *  hats and a very soft snare on 2+4, run by a lookahead scheduler.
   *  Rides the master mute (KeyM) and the lobby hold like every other
   *  cue; `true` while already on is a no-op. */
  setRadio(on: boolean): void;
  /** True while the dash radio loop is playing. */
  isRadioOn(): boolean;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  /** True while the LOBBY HOLD is on: the full-screen lobby is mounted and
   *  every game sound is silenced so only the lobby soundtrack plays. The
   *  page's plain HTMLAudioElement loops (footsteps, snow, screech) read
   *  this every frame — they are outside this Web Audio graph. */
  isSuspended(): boolean;
  /** Debug/verification snapshot (surfaced on window.__sfx). */
  debug(): {
    ctxState: string;
    loaded: string[];
    muted: boolean;
    /** Lobby hold state + the master gain it forces (0 while held). */
    suspended: boolean;
    masterGain: number;
    gains: Record<string, number>;
    oneshots: Record<string, number>;
    resumeError: string | null;
    rainTarget: number;
    nightTarget: number;
    /** Delay (s) scheduled between the last shot and its chained reload. */
    reloadDelay: number;
    /** Portion (s) of the roar file the last 5-press played (fit to flip). */
    roarFit: number;
    /** DART engine synth state (on + last throttle request). */
    planeEngine: { on: boolean; throttle: number };
    /** Dash radio state + the synthesized horn/low-fuel cue counters,
     *  so automated browser tests can assert the firings. */
    radioOn: boolean;
    hornCount: number;
    lowFuelCount: number;
    /** Radio beats booked by the lookahead scheduler (loop is alive). */
    radioBeats: number;
  };
}

const RAIN_FILE = 'rain-loop.mp3';
const RAIN_GAIN = 0.75;
const NIGHT_FILE = 'night-loop.wav';
const NIGHT_GAIN = 0.38; // lightly reduced per user (was 0.45)
const ONE_SHOTS = {
  shoot: { file: 'shoot.mp3', gain: 0.6 },
  reload: { file: 'reload.mp3', gain: 0.7 },
  jump: { file: 'jump.mp3', gain: 0.55 },
  roar: { file: 'roar.wav', gain: 0.7 },
  ignition: { file: 'car-ignition.wav', gain: 0.8 },
  chest: { file: 'chest-open.mp3', gain: 0.8 },
} as const;

/** Fallback gap between the shot and its follow-up reload cue. page.tsx
 *  overrides this per fire cycle with attackClipDuration * 0.4 (the attack
 *  clip is 0.8s -> 0.32s), which lands the reload's audible clicks (first
 *  ~0.41s of the file) BEFORE the attack animation finishes — both cues
 *  start AND finish inside one shooting animation. */
const DEFAULT_RELOAD_DELAY = 0.4;

const MUTE_PREF_KEY = 'ratfire-muted';

/** Dash-radio loop constants: ~82 BPM, one 4/4 bar per chord (~2.93s),
 *  Am7 -> Fmaj7 -> Cmaj7 -> G. Pad tones sit mid-register under the
 *  detuned-saw bed; `root` drives the triangle/sine bass. */
const RADIO_BPM = 82;
const RADIO_BEAT = 60 / RADIO_BPM; // one beat (~0.73s)
const RADIO_BAR = RADIO_BEAT * 4; // one chord per bar (~2.93s)
const RADIO_GAIN = 0.16; // background bed — well below the one-shots
const RADIO_AHEAD = 0.3; // scheduler booking horizon (s)
const RADIO_TICK_MS = 100; // scheduler wakeup interval (ms)
const RADIO_CHORDS: Array<{ pad: number[]; root: number }> = [
  { pad: [220.0, 261.63, 329.63, 392.0], root: 110.0 }, // Am7
  { pad: [174.61, 220.0, 261.63, 329.63], root: 87.31 }, // Fmaj7
  { pad: [261.63, 329.63, 392.0, 493.88], root: 130.81 }, // Cmaj7
  { pad: [196.0, 246.94, 293.66, 392.0], root: 98.0 }, // G
];

let singleton: GameAudioHandle | null = null;
let creating: Promise<GameAudioHandle> | null = null;

/** Lazily create (once) the game audio manager. Safe to call anywhere. */
export function getGameAudio(): Promise<GameAudioHandle> {
  if (singleton) return Promise.resolve(singleton);
  if (!creating) creating = createGameAudio();
  return creating;
}

async function createGameAudio(): Promise<GameAudioHandle> {
  // ---- raw file data, fetched lazily on the FIRST user gesture ----
  // (fetch needs no gesture, but starting the downloads here instead of
  // at manager creation keeps the compressed bytes out of RAM while the
  // player hangs out in the lobby; every consumer below awaits the same
  // promises as before, so decode order and behavior are identical)
  let prefetch: Map<string, Promise<ArrayBuffer | null>> | null = null;
  const files: Array<[string, string]> = [
    ['rain-loop', RAIN_FILE],
    ['night-loop', NIGHT_FILE],
    ['shoot', ONE_SHOTS.shoot.file],
    ['reload', ONE_SHOTS.reload.file],
    ['jump', ONE_SHOTS.jump.file],
    ['roar', ONE_SHOTS.roar.file],
    ['ignition', ONE_SHOTS.ignition.file],
    ['chest', ONE_SHOTS.chest.file],
  ];
  function startPrefetch(): Map<string, Promise<ArrayBuffer | null>> {
    if (!prefetch) {
      prefetch = new Map();
      for (const [key, file] of files) {
        prefetch.set(
          key,
          fetch(`/sfx/${file}`)
            .then((res) => (res.ok ? res.arrayBuffer() : null))
            .catch(() => null)
        );
      }
    }
    return prefetch;
  }

  // ---- live audio graph (built inside the first user gesture) ----
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let rainGain: GainNode | null = null;
  let nightGain: GainNode | null = null;
  const oneShotBuffers = new Map<string, AudioBuffer>();
  let lastRainTarget = -1;
  let rainTarget = 0;
  let lastNightTarget = -1;
  let nightTarget = 0;
  const oneshotCounts: Record<string, number> = {};
  let resumeError: string | null = null;
  let initPromise: Promise<void> | null = null;

  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_PREF_KEY) === '1';
  } catch {
    /* private mode etc. */
  }
  // seed the global bus with the persisted preference so every subscriber
  // (current and future) starts in the same state as this master gain
  setGlobalMuted(muted);
  // the LOBBY HOLD: while the full-screen lobby is mounted every game sound
  // stays silent (only the lobby soundtrack plays). The hold and the mute
  // are independent switches — master gain follows `muted || suspended`.
  let suspended = getGameSuspended();

  /** Write the master gain the two switches demand. Kept in ONE place so
   *  mute flips, lobby holds and graph creation can never disagree. */
  function applyMaster(): void {
    if (!master || !ctx) return;
    try {
      master.gain.setTargetAtTime(
        muted || suspended ? 0 : 1,
        ctx.currentTime,
        0.08
      );
    } catch {
      /* never let audio throw into the game loop */
    }
  }
  // page-lifetime subscription — audio.ts has no dispose, so the unsubscribe
  // handle is intentionally dropped
  onGameSuspend((next) => {
    suspended = next;
    applyMaster();
  });

  /** Build the AudioContext + graph. MUST first be called from a gesture —
   *  a context born mid-gesture starts 'running' in every browser. */
  function init(): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        // kick off (or reuse) the raw-data downloads for this gesture
        const prefetch = startPrefetch();
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        const theCtx = new Ctx(); // born running (gesture-driven)
        ctx = theCtx;

        master = theCtx.createGain();
        master.gain.value = muted || suspended ? 0 : 1;
        master.connect(theCtx.destination);

        // decode rain (loop) from the prefetched data — the raw file
        // bytes are released right after so they never stay pinned
        const rainData = await prefetch.get('rain-loop');
        prefetch.delete('rain-loop');
        if (rainData) {
          const buf = await theCtx.decodeAudioData(rainData);
          const src = theCtx.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          rainGain = theCtx.createGain();
          rainGain.gain.value = 0;
          src.connect(rainGain).connect(master);
          src.start();
        }

        // decode the night wind (loop) — faded in by the moon, not the storm
        const nightData = await prefetch.get('night-loop');
        prefetch.delete('night-loop');
        if (nightData) {
          const buf = await theCtx.decodeAudioData(nightData);
          const src = theCtx.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          nightGain = theCtx.createGain();
          nightGain.gain.value = 0;
          src.connect(nightGain).connect(master);
          src.start();
        }

        // decode the gun one-shots (each raw buffer is consumed exactly
        // once — decodeAudioData detaches it, so no slice copy needed
        // and no compressed bytes linger after decode)
        for (const name of Object.keys(ONE_SHOTS) as Array<
          keyof typeof ONE_SHOTS
        >) {
          const data = await prefetch.get(name);
          prefetch.delete(name);
          if (data) {
            oneShotBuffers.set(
              name,
              await theCtx.decodeAudioData(data)
            );
          }
        }
        // drop whatever is left (failed fetches resolved to null) so
        // no raw audio bytes outlive their decoded AudioBuffers
        prefetch.clear();
      } catch (err) {
        resumeError = err instanceof Error ? err.message : String(err);
      }
    })();
    return initPromise;
  }

  /** Create + schedule one cue at `when` seconds from now (sample-accurate
   *  on real hardware; counted for the debug snapshot). */
  function playOneShot(name: keyof typeof ONE_SHOTS, when = 0): void {
    const buf = oneShotBuffers.get(name);
    if (!ctx || !buf || !master) return;
    oneshotCounts[name] = (oneshotCounts[name] ?? 0) + 1;
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.12;
      const gain = ctx.createGain();
      gain.gain.value = ONE_SHOTS[name].gain;
      src.connect(gain).connect(master);
      src.start(ctx.currentTime + when);
      src.onended = () => {
        src.disconnect();
        gain.disconnect();
      };
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** Ready-check shared by the cue entry points; warms the init if the
   *  graph is still building (the NEXT press then plays). */
  function graphReady(): boolean {
    const buf = oneShotBuffers.get('shoot');
    if (!ctx || !buf || !master) {
      void init();
      return false;
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    return true;
  }

  /** Fire a single one-shot cue. */
  function fire(name: keyof typeof ONE_SHOTS): void {
    if (!graphReady()) return;
    playOneShot(name);
  }

  /** F-key fire cycle (user request): the shooting SFX plays first and the
   *  reload SFX follows within the SAME attack-clip duration — the reload
   *  starts at `reloadDelaySeconds` (page.tsx derives it from the real
   *  attack clip length) so its clicks finish before the animation ends. */
  let lastReloadDelay = DEFAULT_RELOAD_DELAY;
  function shootThenReload(reloadDelaySeconds?: number): void {
    if (!graphReady()) return;
    const delay = Math.max(
      0,
      reloadDelaySeconds ?? DEFAULT_RELOAD_DELAY
    );
    lastReloadDelay = delay;
    playOneShot('shoot');
    if (oneShotBuffers.has('reload')) {
      playOneShot('reload', delay);
    }
  }

  /** 5-key monster roar, TRIMMED to `fitSeconds` (the flip clip's length):
   *  src.start's third arg plays only the first `fit` seconds of the file
   *  and a linear gain ease-out over the last 0.15s makes the cut inaudible
   *  — the roar ends exactly with the animation. Playback rate stays 1.0 so
   *  the fit is exact (no chipmunk speed-up). */
  let lastRoarFit = 0;
  function roar(fitSeconds?: number): void {
    if (!graphReady()) return;
    const buf = oneShotBuffers.get('roar');
    if (!ctx || !buf || !master) return;
    oneshotCounts.roar = (oneshotCounts.roar ?? 0) + 1;
    const fit =
      fitSeconds && fitSeconds > 0.2
        ? Math.min(fitSeconds, buf.duration)
        : buf.duration;
    lastRoarFit = Number(fit.toFixed(3));
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      const g = ONE_SHOTS.roar.gain;
      const t0 = ctx.currentTime;
      if (fit < buf.duration - 0.05) {
        gain.gain.setValueAtTime(g, t0);
        gain.gain.setValueAtTime(g, t0 + fit - 0.15);
        gain.gain.linearRampToValueAtTime(0.0001, t0 + fit);
      } else {
        gain.gain.value = g;
      }
      src.connect(gain).connect(master);
      src.start(t0, 0, fit);
      src.onended = () => {
        src.disconnect();
        gain.disconnect();
      };
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** Loot-chest UNLOCK cue: the user-uploaded chest-open sfx (creak + lid
   *  pop) plays through the standard one-shot path the INSTANT the unlock
   *  cinematic starts — latch flip (0.38s) then lid swing (0.67s) finish
   *  in ~1.05s, so the sound accompanies the entire one-second opening.
   *  Slight pitch jitter, master mute covers it like every other cue.
   *  A missing/undecoded file only silences this cue — the loot chime
   *  still stamps the burst a second later. */
  function chestOpen(): void {
    if (!ctx || !master) {
      void init();
      return;
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    if (oneShotBuffers.has('chest')) {
      playOneShot('chest');
    }
  }

  /** Sample-flipped mirror of the decoded chest buffer, built LAZILY on
   *  the first close and cached for the session (the ~1.2s mono file is
   *  ~54k samples, so the flip is a sub-millisecond one-time cost; no
   *  extra download — it reuses the bytes already fetched for opening). */
  let chestReversed: AudioBuffer | null = null;
  function reversedChestBuffer(): AudioBuffer | null {
    const buf = oneShotBuffers.get('chest');
    if (!ctx || !buf) return null;
    if (!chestReversed) {
      try {
        const rev = ctx.createBuffer(
          buf.numberOfChannels,
          buf.length,
          buf.sampleRate
        );
        // copy every channel end-to-start: playing this copy reproduces
        // the original waveform in exact reverse — a true "played backwards"
        for (let ch = 0; ch < buf.numberOfChannels; ch++) {
          const from = buf.getChannelData(ch);
          const to = rev.getChannelData(ch);
          for (let i = 0, n = from.length; i < n; i++) {
            to[i] = from[n - 1 - i];
          }
        }
        chestReversed = rev;
      } catch {
        chestReversed = null; // never let audio throw into the game loop
      }
    }
    return chestReversed;
  }

  /** Loot-chest CLOSE cue: the user's chest-open sfx played BACKWARDS —
   *  the exact mirror of the opening sound, riding the closing cinematic
   *  (lid swing shut 0.67s, then hasp + padlock lock 0.38s — the same
   *  ~1.05s the opening takes). Same gain + slight pitch jitter as the
   *  open cue; master mute covers it like every other cue; a missing/
   *  undecodable file only silences this cue. */
  function chestClose(): void {
    if (!ctx || !master) {
      void init();
      return;
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    const rev = reversedChestBuffer();
    if (!rev) return;
    oneshotCounts.chestClose = (oneshotCounts.chestClose ?? 0) + 1;
    try {
      const src = ctx.createBufferSource();
      src.buffer = rev;
      src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.12;
      const gain = ctx.createGain();
      gain.gain.value = ONE_SHOTS.chest.gain;
      src.connect(gain).connect(master);
      src.start(ctx.currentTime);
      src.onended = () => {
        src.disconnect();
        gain.disconnect();
      };
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** Loot-burst coin chime: two quick sine notes (B5 -> E6) with fast
   *  exponential decays — the classic "coin pickup" arc, synthesized in
   *  the graph (no asset) so it always exists and the master mute covers
   *  it like every other cue. Fires when the lid rests open and the
   *  coins bank — right after the chest-open sfx rode the unlocking. */
  function pickup(): void {
    if (!ctx || !master) {
      void init();
      return;
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    oneshotCounts.pickup = (oneshotCounts.pickup ?? 0) + 1;
    try {
      const t0 = ctx.currentTime;
      const note = (
        freq: number,
        start: number,
        dur: number,
        peak: number
      ) => {
        const osc = ctx!.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx!.createGain();
        gain.gain.setValueAtTime(0.0001, t0 + start);
        gain.gain.exponentialRampToValueAtTime(peak, t0 + start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        osc.connect(gain).connect(master!);
        osc.start(t0 + start);
        osc.stop(t0 + start + dur + 0.02);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      };
      note(987.77, 0, 0.11, 0.32); // B5
      note(1318.51, 0.075, 0.38, 0.3); // E6
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** Shared white-noise buffer (built lazily once the ctx exists) — the
   *  raw material for every synthesized storm cue (thunder). */
  let noiseBuf: AudioBuffer | null = null;
  function noise(): AudioBuffer {
    if (noiseBuf && ctx) return noiseBuf;
    const len = ctx!.sampleRate * 1.2;
    noiseBuf = ctx!.createBuffer(1, len, ctx!.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  /** Rolling thunder, synthesized: slowed white noise through a deep
   *  lowpass, shaped into three overlapping swells (~3s) — reads as a
   *  distant rumble rolling over the hills rather than a single bang. */
  function thunder(delaySeconds?: number): void {
    if (!ctx || !master) {
      void init();
      return;
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    oneshotCounts.thunder = (oneshotCounts.thunder ?? 0) + 1;
    try {
      const t0 = ctx.currentTime + Math.max(0, delaySeconds ?? 0);
      const src = ctx.createBufferSource();
      src.buffer = noise();
      src.loop = true;
      src.playbackRate.value = 0.32; // stretched -> deep rumble
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 95;
      lp.Q.value = 0.4;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      // three rolling swells, each softer than the last peak
      gain.gain.linearRampToValueAtTime(0.5, t0 + 0.14);
      gain.gain.linearRampToValueAtTime(0.16, t0 + 0.65);
      gain.gain.linearRampToValueAtTime(0.46, t0 + 1.15);
      gain.gain.linearRampToValueAtTime(0.14, t0 + 1.95);
      gain.gain.linearRampToValueAtTime(0.3, t0 + 2.5);
      gain.gain.linearRampToValueAtTime(0.0001, t0 + 3.2);
      src.connect(lp).connect(gain).connect(master);
      src.start(t0);
      src.stop(t0 + 3.3);
      src.onended = () => {
        src.disconnect();
        lp.disconnect();
        gain.disconnect();
      };
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** CREEPER FUSE hiss: two noise layers — a band-pass sweep that
   *  climbs 500 Hz → 2.8 kHz across the whole fuse (the rising SSSSS)
   *  and a quiet gritty low-pass crackle under it. Synthesized after
   *  the thunder/lockBlip pattern; never throws into the game loop. */
  function creeperHiss(): void {
    if (!ctx || !master) {
      void init();
      return;
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    oneshotCounts.creeperHiss = (oneshotCounts.creeperHiss ?? 0) + 1;
    try {
      const t0 = ctx.currentTime;
      const dur = 1.45;
      // layer 1: the classic rising ssss — band-pass opens as it rises
      const src = ctx.createBufferSource();
      src.buffer = noise();
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(500, t0);
      bp.frequency.exponentialRampToValueAtTime(2800, t0 + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.34, t0 + 0.1);
      gain.gain.linearRampToValueAtTime(0.42, t0 + dur * 0.85);
      gain.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      src.connect(bp).connect(gain).connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
      src.onended = () => {
        src.disconnect();
        bp.disconnect();
        gain.disconnect();
      };
      // layer 2: gritty crackle — slow noise through a dark low-pass
      const src2 = ctx.createBufferSource();
      src2.buffer = noise();
      src2.loop = true;
      src2.playbackRate.value = 0.55;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const gain2 = ctx.createGain();
      gain2.gain.setValueAtTime(0.0001, t0);
      gain2.gain.linearRampToValueAtTime(0.1, t0 + 0.2);
      gain2.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      src2.connect(lp).connect(gain2).connect(master);
      src2.start(t0);
      src2.stop(t0 + dur + 0.02);
      src2.onended = () => {
        src2.disconnect();
        lp.disconnect();
        gain2.disconnect();
      };
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** CREEPER detonation: crack + blast + sub drop, synthesized. The
   *  crack is a 60 ms high-passed noise snap, the blast a 0.55 s
   *  low-passed (220 Hz) noise burst, and a sine drops 60 Hz → 26 Hz
   *  underneath for the concussive body. Never throws. */
  function creeperBoom(): void {
    if (!ctx || !master) {
      void init();
      return;
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    oneshotCounts.creeperBoom = (oneshotCounts.creeperBoom ?? 0) + 1;
    try {
      const t0 = ctx.currentTime;
      // 1) the crack — instant bright snap
      const crack = ctx.createBufferSource();
      crack.buffer = noise();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1400;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.55, t0);
      cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
      crack.connect(hp).connect(cg).connect(master);
      crack.start(t0);
      crack.stop(t0 + 0.08);
      crack.onended = () => {
        crack.disconnect();
        hp.disconnect();
        cg.disconnect();
      };
      // 2) the blast body — deep filtered noise
      const blast = ctx.createBufferSource();
      blast.buffer = noise();
      blast.loop = true;
      blast.playbackRate.value = 0.5;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t0);
      lp.frequency.exponentialRampToValueAtTime(90, t0 + 0.5);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.linearRampToValueAtTime(0.85, t0 + 0.015);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      blast.connect(lp).connect(bg).connect(master);
      blast.start(t0);
      blast.stop(t0 + 0.65);
      blast.onended = () => {
        blast.disconnect();
        lp.disconnect();
        bg.disconnect();
      };
      // 3) the sub drop — hollow concussive body
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(60, t0);
      sub.frequency.exponentialRampToValueAtTime(26, t0 + 0.45);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t0);
      sg.gain.linearRampToValueAtTime(0.6, t0 + 0.02);
      sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
      sub.connect(sg).connect(master);
      sub.start(t0);
      sub.stop(t0 + 0.6);
      sub.onended = () => {
        sub.disconnect();
        sg.disconnect();
      };
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** Lock-on blip: a hard radar ping (square wave through a narrow
   *  bandpass feel via two stacked sines) — `final` raises the pitch and
   *  stretches it into the solid tone that rides the launch. */
  function lockBlip(final?: boolean): void {
    if (!ctx || !master) {
      void init();
      return;
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    oneshotCounts.lockblip = (oneshotCounts.lockblip ?? 0) + 1;
    try {
      const t0 = ctx.currentTime;
      const freq = final ? 1244.5 : 830;
      const dur = final ? 0.3 : 0.07;
      const peak = final ? 0.3 : 0.17;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t0);
      if (!final) osc.frequency.exponentialRampToValueAtTime(freq * 1.18, t0 + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  // ---- DART's piston engine (persistent synth, built lazily) ----
  // Two detuned sawtooths beat against each other for the rough piston
  // texture, a sub sine carries the body, and one lowpass tames the buzz.
  // The gain stays connected to master, so the speaker mute covers it.
  let engineA: OscillatorNode | null = null;
  let engineB: OscillatorNode | null = null;
  let engineSub: OscillatorNode | null = null;
  let engineFilter: BiquadFilterNode | null = null;
  let engineGain: GainNode | null = null;
  let engineOn = false;
  let engineThr = 0;
  let lastEngineKey = '';
  function buildEngine(): void {
    if (!ctx || !master || engineA) return;
    try {
      engineA = ctx.createOscillator();
      engineA.type = 'sawtooth';
      engineB = ctx.createOscillator();
      engineB.type = 'sawtooth';
      engineSub = ctx.createOscillator();
      engineSub.type = 'sine';
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 260;
      engineFilter.Q.value = 0.6;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineA.connect(engineFilter);
      engineB.connect(engineFilter);
      engineSub.connect(engineFilter);
      engineFilter.connect(engineGain).connect(master);
      engineA.start();
      engineB.start();
      engineSub.start();
    } catch {
      engineA = null; // synth failed — the game stays silent, never breaks
    }
  }
  function setPlaneEngine(on: boolean, throttle: number): void {
    engineOn = on;
    engineThr = Math.min(1, Math.max(0, throttle));
    if (!ctx || !master) {
      void init(); // warm the graph; the next frame's call lands
      return;
    }
    if (on && !engineA) buildEngine();
    if (!engineA || !engineGain || !engineFilter) return;
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    // throttle -> engine note: idle ~46 Hz, full boost ~104 Hz (the classic
    // piston drone rising with the lever); skip identical writes per frame
    const thr = engineThr;
    const key = `${on ? 1 : 0}:${Math.round(thr * 50)}`;
    if (key === lastEngineKey) return;
    lastEngineKey = key;
    try {
      const t = ctx.currentTime;
      const base = 46 + thr * 58;
      engineA!.frequency.setTargetAtTime(base, t, 0.12);
      engineB!.frequency.setTargetAtTime(base * 1.008, t, 0.12); // slow beat
      engineSub!.frequency.setTargetAtTime(base * 0.5, t, 0.12);
      engineFilter!.frequency.setTargetAtTime(240 + thr * 520, t, 0.15);
      engineGain!.gain.setTargetAtTime(
        on ? 0.05 + thr * 0.075 : 0.0001,
        t,
        on ? 0.35 : 0.25 // spool up / spin down — never a click
      );
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** WIDOW's THWIP, synthesized: a fast band-passed noise sweep reads as
   *  silk hissing out of the spinneret while a triangle pluck falling
   *  1.5kHz→320Hz stamps the strand going taut. */
  function webShot(): void {
    if (!ctx || !master) {
      void init();
      return;
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    oneshotCounts.webshot = (oneshotCounts.webshot ?? 0) + 1;
    try {
      const t0 = ctx.currentTime;
      // silk hiss: band-passed noise sweeping down
      const src = ctx.createBufferSource();
      src.buffer = noise();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2.2;
      bp.frequency.setValueAtTime(3400, t0);
      bp.frequency.exponentialRampToValueAtTime(750, t0 + 0.14);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.42, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      src.connect(bp).connect(gain).connect(master);
      src.start(t0);
      src.stop(t0 + 0.18);
      src.onended = () => {
        src.disconnect();
        bp.disconnect();
        gain.disconnect();
      };
      // taut-strand pluck: falling triangle
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1500, t0 + 0.02);
      osc.frequency.exponentialRampToValueAtTime(320, t0 + 0.13);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t0 + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.16, t0 + 0.035);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      osc.connect(g2).connect(master);
      osc.start(t0 + 0.02);
      osc.stop(t0 + 0.22);
      osc.onended = () => {
        osc.disconnect();
        g2.disconnect();
      };
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** Soft splat when a strand anchors: a short low-passed noise puff. */
  function webStick(): void {
    if (!ctx || !master) {
      void init();
      return;
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    oneshotCounts.webstick = (oneshotCounts.webstick ?? 0) + 1;
    try {
      const t0 = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
      src.connect(lp).connect(gain).connect(master);
      src.start(t0);
      src.stop(t0 + 0.13);
      src.onended = () => {
        src.disconnect();
        lp.disconnect();
        gain.disconnect();
      };
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** Orb-web weave shimmer: soft rising sine pings (the spokes/rings
   *  rippling out) over one airy band-passed swish. */
  function webWeave(): void {
    if (!ctx || !master) {
      void init();
      return;
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    oneshotCounts.webweave = (oneshotCounts.webweave ?? 0) + 1;
    try {
      const t0 = ctx.currentTime;
      // airy swish as the silk stretches across the spokes
      const src = ctx.createBufferSource();
      src.buffer = noise();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(900, t0);
      bp.frequency.exponentialRampToValueAtTime(3800, t0 + 0.5);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.1, t0 + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
      src.connect(bp).connect(gain).connect(master);
      src.start(t0);
      src.stop(t0 + 0.6);
      src.onended = () => {
        src.disconnect();
        bp.disconnect();
        gain.disconnect();
      };
      // rising pings — one per ring of the spiral weaving in
      const pings = [880, 1175, 1568, 2093, 2637];
      for (let i = 0; i < pings.length; i++) {
        const at = t0 + 0.1 + i * 0.16;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = pings[i];
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.0001, at);
        g2.gain.exponentialRampToValueAtTime(0.07, at + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
        osc.connect(g2).connect(master);
        osc.start(at);
        osc.stop(at + 0.2);
        osc.onended = () => {
          osc.disconnect();
          g2.disconnect();
        };
      }
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** Classic dual-tone car horn, synthesized: a square ~400 Hz under a
   *  saw ~500 Hz (the slightly flat major-third blend every car horn
   *  uses) through one shared ~1200 Hz lowpass, held ~0.45s with a 15ms
   *  attack and a ~120ms release — loudness that sits with the other
   *  one-shot cues, not above them. No audio file; covered by the
   *  master mute like every other cue. */
  function horn(): void {
    if (!ctx || !master) {
      void init();
      return;
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    oneshotCounts.horn = (oneshotCounts.horn ?? 0) + 1;
    try {
      const t0 = ctx.currentTime;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1200;
      lp.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.3, t0 + 0.015); // quick honk attack
      gain.gain.setValueAtTime(0.3, t0 + 0.33); // held like a real press
      gain.gain.linearRampToValueAtTime(0.0001, t0 + 0.45); // ~120ms release
      lp.connect(gain).connect(master);
      const oscA = ctx.createOscillator();
      oscA.type = 'square';
      oscA.frequency.value = 400;
      const gA = ctx.createGain();
      gA.gain.value = 0.55;
      oscA.connect(gA).connect(lp);
      const oscB = ctx.createOscillator();
      oscB.type = 'sawtooth';
      oscB.frequency.value = 500;
      const gB = ctx.createGain();
      gB.gain.value = 0.4;
      oscB.connect(gB).connect(lp);
      oscA.start(t0);
      oscB.start(t0);
      oscA.stop(t0 + 0.47);
      oscB.stop(t0 + 0.47);
      oscB.onended = () => {
        oscB.disconnect();
        gB.disconnect();
      };
      // oscA shares oscB's stop time, so its teardown also drops the
      // shared filter + envelope once both tones are done
      oscA.onended = () => {
        oscA.disconnect();
        gA.disconnect();
        lp.disconnect();
        gain.disconnect();
      };
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** Soft low-fuel warning beep, synthesized: a single ~740 Hz sine
   *  blip (~0.14s) with a gentle exponential decay — distinctly quieter
   *  and softer than the horn. No audio file; covered by the master
   *  mute like every other cue. */
  function lowFuel(): void {
    if (!ctx || !master) {
      void init();
      return;
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    oneshotCounts.lowfuel = (oneshotCounts.lowfuel ?? 0) + 1;
    try {
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 740;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      osc.connect(gain).connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.16);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  // ---- Dash radio: a procedural lo-fi synthwave loop (persistent) ----
  // Everything hangs off one radioGain into master, so the speaker mute
  // (KeyM) and the lobby hold silence it exactly like every other cue.
  // A setInterval lookahead scheduler (100ms wakeups, 0.3s horizon)
  // books one 4/4 bar per chord: detuned saw pairs -> lowpass pad, a
  // triangle/sine bass on beats 1+3, a soft kick every beat, hats on
  // the offbeat 8ths and a very soft snare on 2+4. All envelopes are
  // automated on PERSISTENT gain nodes (nothing per-note to leak) —
  // only the oscillator/noise sources are per-note, and each one is
  // tracked + self-pruning so setRadio(false) can hard-stop them.
  let radioGain: GainNode | null = null;
  let padFilter: BiquadFilterNode | null = null;
  let padEnv: GainNode | null = null;
  let bassEnv: GainNode | null = null;
  let kickEnv: GainNode | null = null;
  let hatFilter: BiquadFilterNode | null = null;
  let hatEnv: GainNode | null = null;
  let snareFilter: BiquadFilterNode | null = null;
  let snareEnv: GainNode | null = null;
  let radioOn = false;
  let radioTimer: number | null = null;
  let radioNodes: AudioScheduledSourceNode[] = [];
  let radioGen = 0;
  let nextBeatTime = 0;
  let beatIndex = 0;
  let radioBeats = 0;

  /** Keep a scheduled radio source killable + self-cleaning: it joins
   *  the kill list until it ends, then disconnects itself and leaves. */
  function track(src: AudioScheduledSourceNode): void {
    radioNodes.push(src);
    src.onended = () => {
      const i = radioNodes.indexOf(src);
      if (i >= 0) radioNodes.splice(i, 1);
      try {
        src.disconnect();
      } catch {
        /* never let audio throw into the game loop */
      }
    };
  }

  /** Build the radio bus once (first setRadio(true) on a live graph):
   *  shared pad lowpass, per-part envelope gains, one radioGain into
   *  master. Nothing here is per-note, so it lives for the page. */
  function buildRadio(): void {
    if (!ctx || !master || radioGain) return;
    try {
      radioGain = ctx.createGain();
      radioGain.gain.value = 0;
      padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 900;
      padFilter.Q.value = 0.7;
      padEnv = ctx.createGain();
      padEnv.gain.value = 0.0001;
      padFilter.connect(padEnv).connect(radioGain);
      bassEnv = ctx.createGain();
      bassEnv.gain.value = 0.0001;
      bassEnv.connect(radioGain);
      kickEnv = ctx.createGain();
      kickEnv.gain.value = 0.0001;
      kickEnv.connect(radioGain);
      hatFilter = ctx.createBiquadFilter();
      hatFilter.type = 'bandpass';
      hatFilter.frequency.value = 6800;
      hatFilter.Q.value = 1;
      hatEnv = ctx.createGain();
      hatEnv.gain.value = 0.0001;
      hatFilter.connect(hatEnv).connect(radioGain);
      snareFilter = ctx.createBiquadFilter();
      snareFilter.type = 'bandpass';
      snareFilter.frequency.value = 1900;
      snareFilter.Q.value = 0.8;
      snareEnv = ctx.createGain();
      snareEnv.gain.value = 0.0001;
      snareFilter.connect(snareEnv).connect(radioGain);
      radioGain.connect(master);
    } catch {
      // synth failed — the game stays silent, never breaks
      radioGain = null;
      padFilter = null;
      padEnv = null;
      bassEnv = null;
      kickEnv = null;
      hatFilter = null;
      hatEnv = null;
      snareFilter = null;
      snareEnv = null;
    }
  }

  /** One chord of the pad bed: ±7-cent detuned saw pairs per chord tone
   *  booked straight into the persistent lowpass, while the SHARED pad
   *  envelope swells in, holds and settles before the next chord. */
  function schedulePad(
    chord: { pad: number[] },
    t: number,
    dur: number
  ): void {
    if (!ctx || !padFilter || !padEnv) return;
    try {
      const g = padEnv.gain;
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(0.045, t + 0.5); // gentle swell in
      g.setValueAtTime(0.045, t + dur - 0.35);
      g.linearRampToValueAtTime(0.0001, t + dur); // settle before the next
      for (const freq of chord.pad) {
        for (const cents of [-7, 7]) {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = freq;
          osc.detune.value = cents;
          osc.connect(padFilter);
          track(osc);
          osc.start(t);
          osc.stop(t + dur + 0.05);
        }
      }
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** One bass note: a triangle on the chord root plus a sine sub an
   *  octave under it, both shaped by the shared bass envelope. */
  function scheduleBass(freq: number, t: number, dur: number): void {
    if (!ctx || !bassEnv) return;
    try {
      const g = bassEnv.gain;
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(0.3, t + 0.015);
      g.exponentialRampToValueAtTime(0.0001, t + dur);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.connect(bassEnv);
      track(osc);
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = freq * 0.5; // sine sub an octave down
      sub.connect(bassEnv);
      track(sub);
      osc.start(t);
      sub.start(t);
      osc.stop(t + dur + 0.03);
      sub.stop(t + dur + 0.03);
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** Soft kick: a sine pitch drop 120→45 Hz with a fast thump and a
   *  mellow ~0.2s decay on the shared kick envelope. */
  function scheduleKick(t: number): void {
    if (!ctx || !kickEnv) return;
    try {
      const g = kickEnv.gain;
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(0.5, t + 0.006);
      g.exponentialRampToValueAtTime(0.0001, t + 0.2);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      osc.connect(kickEnv);
      track(osc);
      osc.start(t);
      osc.stop(t + 0.22);
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** Hi-hat: a short band-passed noise burst on the shared hat chain. */
  function scheduleHat(t: number): void {
    if (!ctx || !hatFilter || !hatEnv) return;
    try {
      const g = hatEnv.gain;
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(0.09, t + 0.004);
      g.exponentialRampToValueAtTime(0.0001, t + 0.05);
      const src = ctx.createBufferSource();
      src.buffer = noise();
      src.connect(hatFilter);
      track(src);
      src.start(t);
      src.stop(t + 0.06);
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** Very soft snare: a low band-passed noise puff on beats 2+4. */
  function scheduleSnare(t: number): void {
    if (!ctx || !snareFilter || !snareEnv) return;
    try {
      const g = snareEnv.gain;
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(0.075, t + 0.008);
      g.exponentialRampToValueAtTime(0.0001, t + 0.12);
      const src = ctx.createBufferSource();
      src.buffer = noise();
      src.connect(snareFilter);
      track(src);
      src.start(t);
      src.stop(t + 0.14);
    } catch {
      /* never let audio throw into the game loop */
    }
  }

  /** Book one beat of the loop at absolute context time `t`. The beat
   *  index drives the bar grid: the chord pad rides each bar's downbeat,
   *  the bass hits beats 1+3 (with the occasional octave/fifth accent
   *  an 8th later), the kick pulses every beat, hats flutter on the
   *  offbeat 8ths and a very soft snare snaps on beats 2+4. */
  function scheduleBeat(i: number, t: number): void {
    const inBar = i % 4;
    const chord = RADIO_CHORDS[Math.floor(i / 4) % RADIO_CHORDS.length];
    if (inBar === 0) schedulePad(chord, t, RADIO_BAR);
    scheduleKick(t);
    scheduleHat(t + RADIO_BEAT / 2);
    if (inBar === 1 || inBar === 3) scheduleSnare(t);
    if (inBar === 0 || inBar === 2) {
      scheduleBass(chord.root, t, RADIO_BEAT * 0.45);
      // occasional octave/fifth accent on the offbeat — keeps the
      // two-note-per-bar bassline from turning hypnotic
      if (Math.random() < 0.3) {
        scheduleBass(
          chord.root * (Math.random() < 0.5 ? 2 : 1.5),
          t + RADIO_BEAT / 2,
          RADIO_BEAT * 0.35
        );
      }
    }
    radioBeats++;
  }

  /** The lookahead scheduler: wake every RADIO_TICK_MS and book every
   *  beat that fits inside the RADIO_AHEAD horizon. If the tab slept
   *  past the horizon, skip forward instead of machine-gunning every
   *  beat that "should" have fired while frozen. */
  function radioTick(): void {
    if (!ctx || !radioOn) return;
    if (nextBeatTime < ctx.currentTime - 0.1) {
      nextBeatTime = ctx.currentTime + 0.05;
    }
    const horizon = ctx.currentTime + RADIO_AHEAD;
    while (nextBeatTime < horizon) {
      scheduleBeat(beatIndex, nextBeatTime);
      nextBeatTime += RADIO_BEAT;
      beatIndex++;
    }
  }

  /** Hard-stop every still-booked radio source (runs after the fade so
   *  tails ring out well under half a second). */
  function killRadioNodes(): void {
    const pending = radioNodes;
    radioNodes = [];
    for (const node of pending) {
      try {
        node.stop();
      } catch {
        /* already ended */
      }
      try {
        node.disconnect();
      } catch {
        /* never let audio throw into the game loop */
      }
    }
  }

  /** Dash radio power switch. `true` starts the loop (resume the
   *  context first so a suspended tab can play); `false` stops the
   *  scheduler, fades the bus out over 0.3s and hard-stops the booked
   *  sources after it — clean silence, tails ≤0.5s. A generation token
   *  keeps a quick re-arm immune to the stale cleanup timer. */
  function setRadio(on: boolean): void {
    if (on) {
      if (radioOn) return; // already playing — no-op
      if (!ctx || !master) {
        void init(); // warm the graph; the next call lands
        return;
      }
      if (ctx.state !== 'running') void ctx.resume().catch(() => {});
      radioOn = true;
      radioGen++;
      killRadioNodes(); // clear any leftovers from a previous session
      buildRadio();
      if (!radioGain) return; // synth failed — stay silent, never break
      try {
        const t = ctx.currentTime;
        radioGain.gain.cancelScheduledValues(t);
        radioGain.gain.setValueAtTime(
          Math.max(radioGain.gain.value, 0.0001),
          t
        );
        radioGain.gain.setTargetAtTime(RADIO_GAIN, t, 0.25); // fade-in
      } catch {
        /* never let audio throw into the game loop */
      }
      nextBeatTime = ctx.currentTime + 0.15;
      beatIndex = 0;
      radioTick();
      if (radioTimer === null) {
        radioTimer = window.setInterval(radioTick, RADIO_TICK_MS);
      }
    } else {
      if (!radioOn) return; // already off — no-op
      radioOn = false;
      if (radioTimer !== null) {
        clearInterval(radioTimer);
        radioTimer = null;
      }
      const gen = ++radioGen;
      if (radioGain && ctx) {
        try {
          const t = ctx.currentTime;
          radioGain.gain.cancelScheduledValues(t);
          radioGain.gain.setValueAtTime(radioGain.gain.value, t);
          radioGain.gain.linearRampToValueAtTime(0.0001, t + 0.3); // fade-out
          // drop any env automation the killed session still had booked
          for (const env of [padEnv, bassEnv, kickEnv, hatEnv, snareEnv]) {
            env?.gain.cancelScheduledValues(t);
          }
        } catch {
          /* never let audio throw into the game loop */
        }
      }
      // after the fade-out, hard-stop the still-booked sources — tails
      // ring out in well under half a second
      setTimeout(() => {
        if (gen === radioGen) killRadioNodes();
      }, 400);
    }
  }

  // ---- ANY first interaction builds the context (born running) ----
  window.addEventListener('pointerdown', () => void init());
  window.addEventListener('keydown', () => void init());

  singleton = {
    resume() {
      void init();
    },
    setRain(intensity) {
      const target = RAIN_GAIN * Math.min(1, Math.max(0, intensity));
      rainTarget = Number(target.toFixed(3));
      if (!rainGain || Math.abs(lastRainTarget - target) < 0.004) return;
      lastRainTarget = target;
      rainGain.gain.setTargetAtTime(target, ctx!.currentTime, 0.5);
    },
    setNight(intensity) {
      const target = NIGHT_GAIN * Math.min(1, Math.max(0, intensity));
      nightTarget = Number(target.toFixed(3));
      if (!nightGain || Math.abs(lastNightTarget - target) < 0.004) return;
      lastNightTarget = target;
      // slow ~1s ambience fade so dusk/dawn crossfades feel natural
      nightGain.gain.setTargetAtTime(target, ctx!.currentTime, 1.0);
    },
    shoot: () => fire('shoot'),
    reload: () => fire('reload'),
    jump: () => fire('jump'),
    ignition: () => fire('ignition'),
    roar: (fitSeconds?: number) => roar(fitSeconds),
    // forward the delay — an argless arrow here would silently drop it
    shootThenReload: (delay?: number) => shootThenReload(delay),
    pickup: () => pickup(),
    chestOpen: () => chestOpen(),
    chestClose: () => chestClose(),
    thunder: (delaySeconds?: number) => thunder(delaySeconds),
    lockBlip: (final?: boolean) => lockBlip(final),
    webShot: () => webShot(),
    webStick: () => webStick(),
    webWeave: () => webWeave(),
    setPlaneEngine: (on: boolean, throttle: number) =>
      setPlaneEngine(on, throttle),
    horn: () => horn(),
    lowFuel: () => lowFuel(),
    creeperHiss: () => creeperHiss(),
    creeperBoom: () => creeperBoom(),
    // forward the flag — an argless arrow here would silently drop it
    setRadio: (on: boolean) => setRadio(on),
    isRadioOn: () => radioOn,
    setMuted(next) {
      muted = next;
      // one flip silences EVERY producer — including the ones with their
      // own AudioContexts (rain bed) that this master gain can't reach
      setGlobalMuted(next);
      try {
        localStorage.setItem(MUTE_PREF_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      // the lobby hold keeps its say: an unmute inside the lobby returns
      // the MUSIC (own context) but the game graph stays held at 0 until
      // the lobby screen unmounts
      applyMaster();
    },
    isMuted: () => muted,
    isSuspended: () => suspended,
    debug() {
      return {
        ctxState: ctx ? ctx.state : 'uncreated',
        loaded: [
          ...(rainGain ? ['rain-loop'] : []),
          ...(nightGain ? ['night-loop'] : []),
          ...[...oneShotBuffers.keys()],
          ...(chestReversed ? ['chest-reversed'] : []),
        ],
        muted,
        suspended,
        masterGain: master ? Number(master.gain.value.toFixed(3)) : 0,
        gains:
          rainGain && nightGain && ctx
            ? {
                'rain-loop': Number(rainGain.gain.value.toFixed(3)),
                'night-loop': Number(nightGain.gain.value.toFixed(3)),
              }
            : {},
        oneshots: { ...oneshotCounts },
        resumeError,
        rainTarget,
        nightTarget,
        reloadDelay: lastReloadDelay,
        roarFit: lastRoarFit,
        planeEngine: { on: engineOn, throttle: Number(engineThr.toFixed(2)) },
        radioOn,
        hornCount: oneshotCounts.horn ?? 0,
        lowFuelCount: oneshotCounts.lowfuel ?? 0,
        radioBeats,
      };
    },
  };

  return singleton;
}
