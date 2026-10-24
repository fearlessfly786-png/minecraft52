/**
 * RATFIRE LOBBY MUSIC — the uploaded "video game music" track, looping as
 * the lobby soundtrack (user request: the procedural synth this replaces was
 * swapped for their own pick).
 *
 * Asset: /music/lobby-theme.mp3 — the user-uploaded
 * apalonbeats-roblox-minecraft-fortnite-video-game-music track, compressed
 * from 256 kbps / 3.5 MB to 96 kbps / 1.3 MB and levelled from a slammed
 * -10.2 LUFS / 0 dBFS master down to -18.4 LUFS (static -7.8 dB trim) so it
 * sits as a gentle background bed under the lobby UI.
 *
 * Playback: ONE reused HTMLAudioElement (loop = true, preload = auto) —
 * the browser caches it, so reopening the lobby restarts instantly with
 * zero network. Fades are a 60 ms volume-ramp timer (fade in ~1.6 s, out
 * ~1.2 s); stopping pauses the element only after the fade-out lands, and
 * a start() during a fade-out cancels it and ramps back up (fast open/
 * close cycles never leave dead air or a stuck timer).
 *
 * Lifecycle: start() on lobby mount, stop() on unmount — the same effect
 * that holds every game SFX silent while the screen is up (the LOBBY HOLD
 * in page.tsx), so the soundtrack plays ALONE in the lobby.
 *
 * Mute: wired to the global mute bus — the HUD sound toggle / M key
 * silences the music the same instant it silences every other cue.
 * (Deliberately NO volume control of its own, per design.)
 *
 * Autoplay policy: play() is called from the lobby-open click (a real
 * gesture) in the normal flow; if the browser still refuses, a one-time
 * pointerdown/keydown kick retries until it goes through.
 */

import { getGlobalMuted, onMuteChange } from './muteState';

const TRACK_URL = '/music/lobby-theme.mp3';
/** Final element volume — the asset is pre-levelled to -18.4 LUFS, so this
 *  can sit high and still read as a background bed (old synth peaked ~0.5). */
const BASE_VOLUME = 0.9;
const FADE_IN_S = 1.6;
const FADE_OUT_S = 1.2;
const TICK_MS = 60;

class LobbyMusic {
  private audio: HTMLAudioElement | null = null;
  private fadeTimer: number | null = null;
  /** 0..1 fade level toward BASE_VOLUME (1 = fully in). */
  private level = 0;
  /** +1 fading in, -1 fading out, 0 idle. */
  private fadeDir = 0;
  /** Wall-clock anchors so throttled timers still land the exact level —
   *  hidden/occluded tabs clamp setInterval to ~1 s, so each tick derives
   *  the level from ELAPSED time instead of assuming even 60 ms steps. */
  private fadeStart = 0;
  private fadeFrom = 0;
  private playing = false;
  private muted = getGlobalMuted();
  private unsubMute: (() => void) | null = null;
  private kick: (() => void) | null = null;

  /** Current effective element volume for the two active switches. */
  private targetVolume(): number {
    return this.muted ? 0 : this.level * BASE_VOLUME;
  }

  private applyVolume(): void {
    const audio = this.audio;
    if (!audio) return;
    try {
      const v = this.targetVolume();
      audio.volume = Math.min(1, Math.max(0, v));
    } catch {
      /* some engines throw on rapid writes — decorative, ignore */
    }
  }

  /** One ramp tick: derive the level from elapsed wall-clock time, so a
   *  throttled (hidden-tab) timer still lands the correct fade. A fade-out
   *  that completes pauses the element and disarms the timer. */
  private fadeTick(): void {
    if (this.fadeDir === 0) {
      this.stopFadeTimer();
      return;
    }
    const dur = this.fadeDir > 0 ? FADE_IN_S : FADE_OUT_S;
    const progress = (performance.now() - this.fadeStart) / 1000 / dur;
    if (this.fadeDir > 0) {
      if (progress >= 1) {
        this.level = 1;
        this.fadeDir = 0;
      } else {
        this.level = this.fadeFrom + (1 - this.fadeFrom) * progress;
      }
    } else {
      this.level = this.fadeFrom * (1 - progress);
      if (progress >= 1 || this.level <= 0) {
        this.level = 0;
        this.fadeDir = 0;
        try {
          this.audio?.pause();
        } catch {
          /* decorative */
        }
      }
    }
    this.applyVolume();
    if (this.fadeDir === 0) this.stopFadeTimer();
  }

  private stopFadeTimer(): void {
    if (this.fadeTimer !== null) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  /** Start ramping `level` in the given direction (cancels any running
   *  fade — a start during a fade-out simply turns the ramp around). */
  private fade(dir: 1 | -1): void {
    this.fadeFrom = this.level;
    this.fadeStart = performance.now();
    this.fadeDir = dir;
    if (this.fadeTimer === null) {
      this.fadeTimer = window.setInterval(() => this.fadeTick(), TICK_MS);
    }
  }

  /** Arm a one-shot gesture retry (autoplay refusal fallback). */
  private armKick(): void {
    if (this.kick) return;
    this.kick = () => {
      const audio = this.audio;
      if (!this.playing || !audio || !audio.paused) {
        this.disarmKick();
        return;
      }
      void audio
        .play()
        .then(() => this.fade(1))
        .catch(() => {
          /* keep the kick armed — next gesture retries */
        });
    };
    window.addEventListener('pointerdown', this.kick, { once: false });
    window.addEventListener('keydown', this.kick, { once: false });
  }

  private disarmKick(): void {
    if (this.kick) {
      window.removeEventListener('pointerdown', this.kick);
      window.removeEventListener('keydown', this.kick);
      this.kick = null;
    }
  }

  /** Tab woke up (visibility flip): run one fade tick immediately — the
   *  time-based math snaps the level (and a pending fade-out pause) to its
   *  correct value even if setInterval was frozen the whole time. */
  private onWake = (): void => {
    if (this.fadeDir !== 0) this.fadeTick();
  };

  /** Boot playback — safe to call repeatedly (idempotent while playing). */
  start(): void {
    // page-lifetime wake listener (module singleton) — a no-op unless a
    // fade is mid-flight, but it guarantees throttled tabs catch up the
    // instant they become visible again
    document.addEventListener('visibilitychange', this.onWake);
    if (this.playing) {
      this.fade(1); // already running: just make sure it is fading back in
      return;
    }
    this.playing = true;
    this.muted = getGlobalMuted();
    this.unsubMute = onMuteChange((muted) => {
      this.muted = muted;
      this.applyVolume();
    });

    try {
      // reuse the element across open/close cycles — cached, instant restart
      const audio = this.audio ?? new Audio(TRACK_URL);
      this.audio = audio;
      audio.loop = true;
      audio.preload = 'auto';
      this.level = 0;
      this.fadeDir = 0;
      this.applyVolume();
      void audio
        .play()
        .then(() => {
          if (!this.playing) {
            // stop() landed while the play promise was in flight — do not
            // resurrect playback; the fade-out will pause the element
            try {
              audio.pause();
            } catch {
              /* decorative */
            }
            return;
          }
          this.fade(1);
        })
        .catch(() => {
          if (!this.playing) return;
          // autoplay refused (no gesture credit yet) — pull the ramp back
          // down and retry on the next interaction
          this.fade(-1);
          this.armKick();
        });
      this.fade(1);
    } catch {
      // audio must never break the lobby
      this.stop();
    }
  }

  /** Fade out, then pause. The element itself is kept for the next mount.
   *  A deadline backstop hard-pauses even if timer throttling (hidden tab)
   *  ever prevents the ramp ticks from landing. */
  stop(): void {
    this.playing = false;
    this.disarmKick();
    if (this.unsubMute) {
      this.unsubMute();
      this.unsubMute = null;
    }
    if (this.audio) {
      this.fade(-1);
      // deadline backstop: after the fade window (+margin) the element MUST
      // be silent — a throttled-tab safety net against leaked playback
      window.setTimeout(() => {
        if (!this.playing && this.audio && !this.audio.paused) {
          try {
            this.audio.pause();
          } catch {
            /* decorative */
          }
          this.level = 0;
          this.fadeDir = 0;
          this.applyVolume();
          this.stopFadeTimer();
        }
      }, FADE_OUT_S * 1000 + 250);
    }
  }

  isPlaying(): boolean {
    return this.playing;
  }

  /** Debug/tooling: current fade level + element volume. */
  volume(): number {
    return this.audio ? this.audio.volume : 0;
  }

  /** Debug/tooling: element playback state (paused + position). */
  media(): { paused: boolean; time: number } {
    return this.audio
      ? { paused: this.audio.paused, time: this.audio.currentTime }
      : { paused: true, time: 0 };
  }
}

/** Lobby-wide singleton — the lobby screen mounts/unmounts it. */
let singleton: LobbyMusic | null = null;

/** Debug/tooling handle (mirrors the __sfx pattern in page.tsx). */
if (typeof window !== 'undefined') {
  (window as unknown as { __lobbyMusic?: unknown }).__lobbyMusic = {
    isPlaying: () => singleton?.isPlaying() ?? false,
    volume: () => singleton?.volume() ?? 0,
    media: () =>
      singleton?.media() ?? { paused: true, time: 0 },
  };
}

/** Start the lobby music (safe to call repeatedly). */
export function startLobbyMusic(): void {
  if (!singleton) singleton = new LobbyMusic();
  singleton.start();
}

/** Fade the lobby music out and pause it. */
export function stopLobbyMusic(): void {
  singleton?.stop();
}

/** True while the lobby loop is running. */
export function isLobbyMusicPlaying(): boolean {
  return singleton?.isPlaying() ?? false;
}
