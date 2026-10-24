/**
 * Global game-mute bus — the single source of truth behind the HUD's sound
 * on/off button (right edge, vertically centred) and the M key.
 *
 * audio.ts owns the main Web Audio graph's master gain, but a few producers
 * run their OWN private AudioContexts (rainSystem's filtered-noise rainfall
 * bed is wired straight to ctx.destination). Subscribing here lets every one
 * of them fall silent in the same instant the button is pressed — one click
 * mutes the ENTIRE game, clicking again restores everything.
 *
 * Flow: button/M key -> audio.ts setMuted() -> setGlobalMuted() -> every
 * subscriber (rain bed, ...). audio.ts also seeds the bus with the persisted
 * localStorage preference at creation so late subscribers start in sync.
 *
 * ---- the LOBBY HOLD (game-SFX suspend bus) ----
 * A second, independent one-way switch rides beside the mute bus: the full
 * screen LOBBY holds it TRUE for exactly as long as it is mounted. The hold
 * means "the player is in the lobby — every GAME sound must stop so only
 * the lobby soundtrack plays". It is deliberately separate from mute so the
 * two never fight: the user can unmute inside the lobby (music returns) and
 * the game SFX stay held silent, while releasing the hold restores whatever
 * the mute state says. Every producer that has its own AudioContext (rain /
 * snow / ice beds, the drone's combat-sound ctx) subscribes here too, and
 * audio.ts pulls its master gain to 0 for the whole graph.
 *
 * Flow: LobbyScreen mount -> setGameSuspended(true) -> every subscriber;
 * LobbyScreen unmount -> setGameSuspended(false) -> everything resumes.
 */

let muted = false;
const listeners = new Set<(muted: boolean) => void>();

/** Current global mute state. */
export function getGlobalMuted(): boolean {
  return muted;
}

/** Flip the global mute. audio.ts's setMuted is the ONE writer — everything
 *  else listens. Unknown no-op when the state doesn't change. */
export function setGlobalMuted(next: boolean): void {
  if (next === muted) return;
  muted = next;
  for (const notify of listeners) {
    try {
      notify(muted);
    } catch {
      // a broken listener must never break the mute flow
    }
  }
}

/** Subscribe to mute flips. The callback fires IMMEDIATELY with the current
 *  state (so late subscribers sync up), then on every change. Returns an
 *  unsubscribe function — call it from dispose(). */
export function onMuteChange(callback: (muted: boolean) => void): () => void {
  listeners.add(callback);
  callback(muted);
  return () => {
    listeners.delete(callback);
  };
}

// ---------------------------------------------------------------------------
// LOBBY HOLD — game-SFX suspend (see header). The LobbyScreen is the ONE
// writer; every sound producer (audio.ts graph, private-context beds, the
// page's HTMLAudioElement loops via audio.ts's isSuspended) listens.
// ---------------------------------------------------------------------------

let suspended = false;
const suspendListeners = new Set<(suspended: boolean) => void>();

/** True while the lobby screen is holding every game SFX silent. */
export function getGameSuspended(): boolean {
  return suspended;
}

/** Lobby opens (true) / closes (false). No-op when unchanged. */
export function setGameSuspended(next: boolean): void {
  if (next === suspended) return;
  suspended = next;
  for (const notify of suspendListeners) {
    try {
      notify(suspended);
    } catch {
      // a broken listener must never break the hold flow
    }
  }
}

/** Subscribe to lobby holds. Fires IMMEDIATELY with the current state (so
 *  late subscribers sync up), then on every change. Returns an unsubscribe
 *  function — call it from dispose(). */
export function onGameSuspend(
  callback: (suspended: boolean) => void
): () => void {
  suspendListeners.add(callback);
  callback(suspended);
  return () => {
    suspendListeners.delete(callback);
  };
}
