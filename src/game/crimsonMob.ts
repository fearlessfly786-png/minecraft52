/**
 * THE BUP — RATFIRE's crimson-field critter: the little mushroom mob that
 * lives ONLY inside the CRIMSON FIELDS biome.
 *
 * Model: mushroom_bup_minecraft_mob.glb (user upload, Sketchfab export)
 * streamed from /models/mobs/. The GLB ships exactly the four clips the
 * mob needs, already named for the state machine:
 *
 *   idle  (1.04s)  looping parked shuffle
 *   walk  (1.04s)  looping waddle
 *   hit   (0.52s)  one-shot damage flinch
 *   death (0.72s)  one-shot top-over collapse (holds the fallen pose)
 *
 * BEHAVIOUR
 *   - SPAWN GATE   mobs materialise only where crimsonFactorWorld says the
 *                  ground is truly red (>= 0.7), on a ring around the
 *                  player; they despawn when the player leaves them far
 *                  behind. No crimson ground -> zero mobs, guaranteed.
 *   - WANDER BRAIN idle <-> walk state machine; every walk target is
 *                  validated to stay inside the red so the critters never
 *                  stray out of their biome (a mob pushed out by knockback
 *                  turns around and marches back to its home zone).
 *   - DAMAGE       bullets/rockets land through the page's airHitTest ->
 *                  damage(): the hit clip plays with a small knockback,
 *                  and enough damage tips the mob into the death clip,
 *                  then a grave-style sink below the turf and recycle.
 *   - COLLISION    solid to bullets (hit-sphere test), mobs keep their
 *                  spacing so they never stack into one blob. Against the
 *                  player the Bup YIELDS to force: walk into one and it is
 *                  carried along with your motion while it sidesteps out
 *                  of your frontal path. Stand still and it is a solid
 *                  body again.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CRIMSON_ZONES, crimsonFactorWorld } from './wildBiomes';
import { citySpawnBlockedWorld } from './cityLayout';

const MODEL_URL = '/models/mobs/mushroom_bup_minecraft_mob.glb';

/** In-game height (world units) — the player stands 190 tall, so the Bup
 *  reads as a knee-to-chest critter, big enough to shoot, small enough to
 *  feel like fauna rather than a boss. */
const MOB_HEIGHT = 118;

/** Which way the authored model faces at rotation.y = 0 (radians added
 *  on top of the movement heading so it walks face-first, not moonwalking). */
const MODEL_YAW_OFFSET = Math.PI;

/** Crossfade seconds between clips. */
const FADE = 0.16;

/* ------------------------------ population ------------------------------ */

/** Desired alive Bups while the player camps inside the crimson fields. */
const POP_TARGET = 5;
/** Spawn ring around the player (world units) — far enough not to pop in
 *  the camera's lap, close enough to walk to. */
const SPAWN_MIN = 480;
const SPAWN_MAX = 1250;
/** Minimum crimson factor to accept a spawn point (deep red only). */
const SPAWN_FACTOR = 0.7;
/** Player factor under which spawning pauses (player left the biome). */
const SPAWN_PLAYER_FACTOR = 0.35;
/** Beyond this distance from the player a mob quietly despawns. */
const DESPAWN_DIST = 2200;
/** Seconds between spawn attempts (a gentle trickle, not a pop-in wave). */
const SPAWN_COOLDOWN = 0.45;

/* ------------------------------ locomotion ------------------------------ */

const WALK_SPEED = 95;
/** Heading ease (rad/s) — the waddle turns smoothly, never snaps. */
const TURN_RATE = 3.4;
/** Walk-target pick: this far, validated to stay deep in the red. */
const WANDER_MIN = 120;
const WANDER_MAX = 520;
/** A walk target must be at least this crimson. */
const WANDER_FACTOR = 0.6;
/** Parked time range (s) before the next stroll. */
const IDLE_TIME_MIN = 1.4;
const IDLE_TIME_MAX = 4.2;
/** Walk time cap (s) — even a valid target is abandoned after this. */
const WALK_TIME_MAX = 6.0;
/** Mobs never stroll closer than this to the player. */
const PLAYER_CLEARANCE = 110;

/* ------------------------------ combat ---------------------------------- */

/** Bullet hit-sphere: horizontal radius + vertical band around the body.
 *  The band tops out ABOVE the model (the shots fly flat from the gun
 *  muzzle at roughly shoulder height of the 190-tall player — same
 *  generous over-band the air combatants use, so aimed body shots land). */
const HIT_RADIUS = 60;
const HIT_TOP = 178; // above the feet
/** Player push-out circle (the mob's solid footprint). */
const BODY_RADIUS = 44;
/** Min spacing between mobs (they waddle apart, never stack). */
const MOB_SEPARATION = 95;

/* --------------------- player force (shove + dodge) --------------------- */

/** Contact circle for the player's push: mob footprint + player body. */
const SHOVE_RADIUS = BODY_RADIUS + 22;
/** Player speed (u/s) above which contact counts as real force. */
const SHOVE_MIN_SPEED = 30;
/** Fraction of the player's motion a contacted mob is carried along with. */
const SHOVE_CARRY = 0.9;
/** Carried-speed cap — shoves feel weighty, never like teleports (u/s). */
const SHOVE_CARRY_MAX = 320;
/** Sidestep speed while dodging out of the player's frontal path (u/s). */
const DODGE_SPEED = 140;
/** Radial separation while overlapped, per unit of overlap (u/s, capped). */
const SHOVE_SEPARATE = 8;
const SHOVE_SEPARATE_MAX = 200;
/** How long the scramble (walk) pose persists after contact ends (s). */
const SHOVE_POSE_T = 0.25;

/** Hit points — sized so the default pistol (dmg mult 3) needs three
 *  body hits, the machinegun a short burst, a rocket + its blast two. */
const MOB_MAX_HP = 150;
/** Knockback impulse (world units/s) applied away from the hit point. */
const HIT_IMPULSE = 175;
const HIT_IMPULSE_TAU = 0.3; // exponential decay of the shove

/* ------------------------------ death ----------------------------------- */

/** Hold the fallen death pose before the grave-sink starts (s). */
const DEATH_HOLD = 1.35;
/** Sink speed below the turf (world units/s). */
const SINK_SPEED = 75;

/** Pool size: enough live Bups + a couple of corpses mid-sink. */
const POOL_SIZE = POP_TARGET + 3;

type ClipName = 'idle' | 'walk' | 'hit' | 'death';
type Phase = 'alive' | 'fallen' | 'sinking';

export interface CrimsonMobOptions {
  /** Low-end devices: no shadow casting. */
  lowSpec?: boolean;
  /** Terrain height query — the Bup walks the same ground you do. */
  heightAt: (x: number, z: number) => number;
  /** Grid->world conversion for the crimson factor (page constants). */
  block: number;
  gridOffset: number;
}

export interface CrimsonMobInfo {
  id: number;
  hp: number;
  maxHp: number;
  /** Combined state label: 'idle' | 'walk' | 'hit' | 'dying' | 'sinking'. */
  state: string;
  /** Clip currently owning the pose. */
  clip: string;
  x: number;
  y: number;
  z: number;
}

export interface CrimsonMobs {
  /** Live per-mob snapshots for debug surfaces / verification. */
  list(): CrimsonMobInfo[];
  /** Advance brains, animation and spawning. */
  update(dt: number, playerPos: THREE.Vector3): void;
  /** Bullet test: is the world point inside any alive Bup? */
  hitTest(p: THREE.Vector3): { id: number } | null;
  /** Damage one mob; true if this blow was the killing one. */
  damage(id: number, amount: number, from?: THREE.Vector3): boolean;
  /** Explosion splash: every alive Bup in radius takes falloff damage. */
  blast(p: THREE.Vector3, radius: number, maxDamage: number): void;
  /** Player push-out — returns the corrected position or null if clear. */
  collide(x: number, z: number, radius: number): { x: number; z: number } | null;
  /** Debug/verification spawn at an explicit crimson world point. */
  spawnAt(x: number, z: number): boolean;
  /** Counters for debug surfaces. */
  stats: { alive: number; spawned: number; killed: number };
  /** Free geometries, materials and textures. */
  dispose(): void;
}

interface Mob {
  id: number;
  root: THREE.Group; // feet-positioned, added to the pool group
  mixer: THREE.AnimationMixer;
  act: Record<ClipName, THREE.AnimationAction>;
  active: boolean;
  phase: Phase;
  brain: 'idle' | 'walk';
  oneShot: 'hit' | null;
  current: THREE.AnimationAction;
  target: THREE.Vector3; // wander goal (xz used)
  timer: number; // brain countdown
  hp: number;
  yaw: number; // smoothed heading
  yawTarget: number;
  kb: THREE.Vector3; // knockback velocity (xz)
  dieT: number; // death phase timer
  shoveT: number; // player-force grace timer (scramble pose)
  dodge: number; // sidestep side while dodging (-1 | 0 | +1)
}

export function createCrimsonMobs(
  scene: THREE.Scene,
  opts: CrimsonMobOptions
): Promise<CrimsonMobs> {
  const loader = new GLTFLoader();
  return loader.loadAsync(MODEL_URL).then((gltf) => {
    const proto = gltf.scene; // cloned per pool slot (plain node rig, no skins)

    const group = new THREE.Group();
    group.name = 'crimsonMobs';
    scene.add(group);

    /* ---------------- shared clip set (AnimationClips are reusable) ---- */
    const find = (name: string): THREE.AnimationClip => {
      const clip = gltf.animations.find((c) => c.name === name);
      if (!clip) throw new Error(`crimsonMob: missing clip "${name}"`);
      return clip;
    };
    const clips: Record<ClipName, THREE.AnimationClip> = {
      idle: find('idle'),
      walk: find('walk'),
      hit: find('hit'),
      death: find('death'),
    };

    /* ---------------- build the pool ----------------------------------- */
    const mobs: Mob[] = [];
    let nextId = 1;

    for (let i = 0; i < POOL_SIZE; i++) {
      const model = proto.clone(true);

      // scale to game size: measure, rescale, drop feet onto y=0
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scale = MOB_HEIGHT / Math.max(0.0001, size.y);
      model.scale.setScalar(scale);
      box.setFromObject(model);
      model.position.y -= box.min.y; // feet exactly on the ground plane

      if (opts.lowSpec !== true) {
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) mesh.castShadow = true;
        });
      }

      const root = new THREE.Group();
      root.name = `bup_${i}`;
      root.add(model);
      root.visible = false;
      group.add(root);

      const mixer = new THREE.AnimationMixer(model);
      const act = {
        idle: mixer.clipAction(clips.idle),
        walk: mixer.clipAction(clips.walk),
        hit: mixer.clipAction(clips.hit),
        death: mixer.clipAction(clips.death),
      };
      act.idle.setLoop(THREE.LoopRepeat, Infinity);
      act.walk.setLoop(THREE.LoopRepeat, Infinity);
      act.hit.setLoop(THREE.LoopOnce, 1);
      act.hit.clampWhenFinished = true;
      act.death.setLoop(THREE.LoopOnce, 1);
      act.death.clampWhenFinished = true;

      const mob: Mob = {
        id: i,
        root,
        mixer,
        act,
        active: false,
        phase: 'alive',
        brain: 'idle',
        oneShot: null,
        current: act.idle,
        target: new THREE.Vector3(),
        timer: 0,
        hp: MOB_MAX_HP,
        yaw: 0,
        yawTarget: 0,
        kb: new THREE.Vector3(),
        dieT: 0,
        shoveT: 0,
        dodge: 0,
      };
      // hit clip hands the pose back to locomotion when it ends
      mixer.addEventListener('finished', () => {
        if (mob.oneShot === 'hit') {
          const back = mob.act[mob.brain === 'walk' ? 'walk' : 'idle'];
          mob.oneShot = null;
          back.reset().fadeIn(FADE * 0.5).play();
          mob.act.hit.fadeOut(FADE * 0.5);
          mob.current = back;
        }
      });
      mobs.push(mob);
    }

    /* ---------------- spawn / despawn ---------------------------------- */

    const stats = { alive: 0, spawned: 0, killed: 0 };
    let spawnCd = 0;
    let spawnSeq = 0; // stable ids across recycles

    // smoothed player velocity — how hard the player is currently pushing.
    // Teleports (huge single-frame jumps) read as "still", not force.
    let lastPX = 0;
    let lastPZ = 0;
    let playerVelX = 0;
    let playerVelZ = 0;
    let playerSpeed = 0;
    let haveLastP = false;

    const factorAt = (x: number, z: number): number =>
      crimsonFactorWorld(x, z, opts.block, opts.gridOffset);

    function spawnMob(x: number, z: number): Mob | null {
      const mob = mobs.find((m) => !m.active);
      if (!mob) return null;
      mob.active = true;
      mob.phase = 'alive';
      mob.brain = 'idle';
      mob.oneShot = null;
      mob.timer = 0.4 + Math.random() * 1.2; // brief arrive-and-look pause
      mob.hp = MOB_MAX_HP;
      mob.kb.set(0, 0, 0);
      mob.dieT = 0;
      mob.shoveT = 0;
      mob.dodge = 0;
      mob.id = spawnSeq++;
      mob.yaw = Math.random() * Math.PI * 2;
      mob.yawTarget = mob.yaw;
      mob.root.position.set(x, opts.heightAt(x, z), z);
      mob.root.rotation.y = mob.yaw + MODEL_YAW_OFFSET;
      mob.root.visible = true;
      mob.mixer.stopAllAction();
      mob.current = mob.act.idle;
      mob.current.reset().play();
      stats.spawned += 1;
      return mob;
    }

    function despawn(mob: Mob): void {
      mob.active = false;
      mob.phase = 'alive';
      mob.oneShot = null;
      mob.root.visible = false;
      mob.mixer.stopAllAction();
    }

    /** Nearest crimson hand-zone centre (world coords) — the "go home"
     *  beacon for a mob knocked out of the red. */
    function homeToward(x: number, z: number, out: THREE.Vector3): void {
      let best = Infinity;
      for (const zone of CRIMSON_ZONES) {
        const wx = (zone.cx - opts.gridOffset) * opts.block;
        const wz = (zone.cz - opts.gridOffset) * opts.block;
        const d = (wx - x) * (wx - x) + (wz - z) * (wz - z);
        if (d < best) {
          best = d;
          out.set(wx, 0, wz);
        }
      }
    }

    function trySpawnAround(playerPos: THREE.Vector3): boolean {
      for (let attempt = 0; attempt < 4; attempt++) {
        const a = Math.random() * Math.PI * 2;
        const r = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
        const x = playerPos.x + Math.cos(a) * r;
        const z = playerPos.z + Math.sin(a) * r;
        if (factorAt(x, z) < SPAWN_FACTOR) continue;
        // HARD CITY GUARD: never materialise a Bup on the road map —
        // the city plateau is grassland, the mushroom mobs spawn in
        // the crimson fields ONLY (second line of defence behind the
        // zeroed crimson factor under the city).
        if (citySpawnBlockedWorld(x, z, opts.block, opts.gridOffset)) continue;
        // keep the herd spread out
        let crowded = false;
        for (const m of mobs) {
          if (!m.active) continue;
          const dx = m.root.position.x - x;
          const dz = m.root.position.z - z;
          if (dx * dx + dz * dz < MOB_SEPARATION * MOB_SEPARATION) {
            crowded = true;
            break;
          }
        }
        if (crowded) continue;
        return spawnMob(x, z) !== null;
      }
      return false;
    }

    /* ---------------- wander brain ------------------------------------- */

    const scratch = new THREE.Vector3();

    function pickWanderTarget(mob: Mob): void {
      for (let attempt = 0; attempt < 8; attempt++) {
        const a = Math.random() * Math.PI * 2;
        const r = WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN);
        const x = mob.root.position.x + Math.cos(a) * r;
        const z = mob.root.position.z + Math.sin(a) * r;
        if (factorAt(x, z) < WANDER_FACTOR) continue;
        mob.target.set(x, 0, z);
        mob.brain = 'walk';
        mob.timer = WALK_TIME_MAX;
        return;
      }
      // no red ground in reach — park longer and try again next cycle
      mob.brain = 'idle';
      mob.timer = IDLE_TIME_MAX;
    }

    /* ---------------- damage ------------------------------------------- */

    function kill(mob: Mob): void {
      mob.phase = 'fallen';
      mob.dieT = 0;
      mob.oneShot = null;
      stats.killed += 1;
      mob.mixer.stopAllAction();
      mob.current = mob.act.death;
      mob.current.reset().play();
    }

    /* ---------------- public handle ------------------------------------ */

    const handle: CrimsonMobs = {
      list(): CrimsonMobInfo[] {
        const out: CrimsonMobInfo[] = [];
        for (const m of mobs) {
          if (!m.active) continue;
          out.push({
            id: m.id,
            hp: Math.max(0, Math.round(m.hp)),
            maxHp: MOB_MAX_HP,
            state:
              m.phase === 'sinking'
                ? 'sinking'
                : m.phase === 'fallen'
                  ? 'dying'
                  : m.oneShot === 'hit'
                    ? 'hit'
                    : m.brain,
            clip: m.current.getClip().name,
            x: m.root.position.x,
            y: m.root.position.y,
            z: m.root.position.z,
          });
        }
        return out;
      },

      update(dt, playerPos) {
        const playerFactor = factorAt(playerPos.x, playerPos.z);

        // --- player motion tracking (drives the shove) ----------------
        if (haveLastP && dt > 0.0001) {
          const ivx = (playerPos.x - lastPX) / dt;
          const ivz = (playerPos.z - lastPZ) / dt;
          if (ivx * ivx + ivz * ivz > 1500 * 1500) {
            // discontinuity — a teleport, not force
            playerVelX = 0;
            playerVelZ = 0;
            playerSpeed = 0;
          } else {
            const k = Math.min(1, dt * 14);
            playerVelX += (ivx - playerVelX) * k;
            playerVelZ += (ivz - playerVelZ) * k;
            playerSpeed = Math.sqrt(
              playerVelX * playerVelX + playerVelZ * playerVelZ
            );
          }
        } else {
          playerVelX = 0;
          playerVelZ = 0;
          playerSpeed = 0;
        }
        lastPX = playerPos.x;
        lastPZ = playerPos.z;
        haveLastP = true;

        // spawning: a gentle trickle while the player camps the red
        spawnCd -= dt;
        let aliveCount = 0;
        for (const m of mobs) if (m.active && m.phase === 'alive') aliveCount++;
        if (
          aliveCount < POP_TARGET &&
          spawnCd <= 0 &&
          playerFactor > SPAWN_PLAYER_FACTOR
        ) {
          spawnCd = SPAWN_COOLDOWN;
          trySpawnAround(playerPos);
        }

        for (const mob of mobs) {
          if (!mob.active) continue;
          const p = mob.root.position;

          // leave-the-country despawn: far behind the player, or somehow
          // off the red entirely (knockback edge case) — quietly recycle
          const dxp = p.x - playerPos.x;
          const dzp = p.z - playerPos.z;
          const distPlayer = Math.sqrt(dxp * dxp + dzp * dzp);
          if (mob.phase !== 'sinking') {
            if (
              distPlayer > DESPAWN_DIST ||
              (mob.phase === 'alive' && factorAt(p.x, p.z) < 0.35)
            ) {
              despawn(mob);
              continue;
            }
          }

          if (mob.shoveT > 0) mob.shoveT = Math.max(0, mob.shoveT - dt);

          // player force: a moving player who contacts a Bup shoves it —
          // the mob is carried along with the push while it sidesteps out
          // of the player's frontal path (dead/dying mobs are ghosted)
          if (
            mob.phase === 'alive' &&
            playerSpeed > SHOVE_MIN_SPEED &&
            distPlayer < SHOVE_RADIUS
          ) {
            const d = Math.max(1, distPlayer);
            const nx = dxp / d;
            const nz = dzp / d;
            const overlap = SHOVE_RADIUS - distPlayer;
            const sep = Math.min(overlap * SHOVE_SEPARATE, SHOVE_SEPARATE_MAX);
            let mvx = nx * sep;
            let mvz = nz * sep;
            const vlen = Math.max(1, playerSpeed);
            const pvx = playerVelX / vlen;
            const pvz = playerVelZ / vlen;
            // only when the mob is actually in the player's path (ahead of
            // the motion) does it get carried and dodge out of the way
            if (pvx * nx + pvz * nz > 0.1) {
              const carry =
                Math.min(playerSpeed, SHOVE_CARRY_MAX) * SHOVE_CARRY;
              // dodge along the motion's perpendicular, on the side the
              // mob already leans toward (stable, no centre-line jitter)
              const lat = pvx * nz - pvz * nx;
              if (Math.abs(lat) > 0.12) mob.dodge = lat >= 0 ? 1 : -1;
              const side = mob.dodge === 0 ? 1 : mob.dodge;
              mvx += pvx * carry - pvz * side * DODGE_SPEED;
              mvz += pvz * carry + pvx * side * DODGE_SPEED;
            }
            p.x += mvx * dt;
            p.z += mvz * dt;
            mob.shoveT = SHOVE_POSE_T;
            if (mvx * mvx + mvz * mvz > 1) {
              mob.yawTarget = Math.atan2(mvx, mvz); // face where force takes it
            }
          }

          // knockback shove (decays exponentially)
          if (mob.kb.lengthSq() > 1) {
            p.x += mob.kb.x * dt;
            p.z += mob.kb.z * dt;
            const decay = Math.exp(-dt / HIT_IMPULSE_TAU);
            mob.kb.multiplyScalar(decay);
          }

          if (mob.phase === 'fallen') {
            // death clip holds the fallen pose; then start the sink
            mob.dieT += dt;
            if (mob.dieT >= clips.death.duration + DEATH_HOLD) {
              mob.phase = 'sinking';
              mob.dieT = 0;
            }
          } else if (mob.phase === 'sinking') {
            mob.dieT += dt;
            p.y -= SINK_SPEED * dt;
            if (mob.dieT > 2.4) {
              despawn(mob);
              continue;
            }
          } else if (mob.oneShot === null && mob.shoveT <= 0) {
            // ----- brain (paused while the hit flinch or a shove plays) -----
            mob.timer -= dt;
            if (mob.brain === 'idle') {
              if (mob.timer <= 0) pickWanderTarget(mob);
            } else {
              // walk toward the target, face-first, terrain-hugging
              const dx = mob.target.x - p.x;
              const dz = mob.target.z - p.z;
              const dist = Math.sqrt(dx * dx + dz * dz);
              // a mob never strolls into the player's personal space
              const tooCloseToPlayer =
                distPlayer < PLAYER_CLEARANCE + BODY_RADIUS;
              if (dist < 22 || mob.timer <= 0 || tooCloseToPlayer) {
                mob.brain = 'idle';
                mob.timer =
                  IDLE_TIME_MIN +
                  Math.random() * (IDLE_TIME_MAX - IDLE_TIME_MIN);
              } else {
                mob.yawTarget = Math.atan2(dx, dz);
                const step = Math.min(WALK_SPEED * dt, dist);
                p.x += Math.sin(mob.yaw) * step;
                p.z += Math.cos(mob.yaw) * step;
              }
            }

            // knocked out of the red? turn around and march home
            if (mob.brain === 'idle' && factorAt(p.x, p.z) < 0.55) {
              homeToward(p.x, p.z, scratch);
              mob.target.copy(scratch);
              mob.brain = 'walk';
              mob.timer = WALK_TIME_MAX * 2;
            }
          }

          // heading ease + pose
          if (mob.phase === 'alive') {
            let dy = mob.yawTarget - mob.yaw;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            mob.yaw += THREE.MathUtils.clamp(dy, -TURN_RATE * dt, TURN_RATE * dt);
            mob.root.rotation.y = mob.yaw + MODEL_YAW_OFFSET;

            // a mob being shoved scrambles (walk pose) even while parked
            const want =
              mob.brain === 'walk' || mob.shoveT > 0
                ? mob.act.walk
                : mob.act.idle;
            if (mob.oneShot === null && mob.current !== want) {
              want.reset().fadeIn(FADE).play();
              mob.current.fadeOut(FADE);
              mob.current = want;
            }
          }

          // ride the terrain (except while sinking below it)
          if (mob.phase !== 'sinking') {
            const gy = opts.heightAt(p.x, p.z);
            p.y += (gy - p.y) * Math.min(1, 10 * dt);
          }

          mob.mixer.update(dt);
        }

        // herd spacing: gentle pairwise push-apart (alive mobs only)
        for (let i = 0; i < mobs.length; i++) {
          const a = mobs[i];
          if (!a.active || a.phase !== 'alive') continue;
          for (let k = i + 1; k < mobs.length; k++) {
            const b = mobs[k];
            if (!b.active || b.phase !== 'alive') continue;
            const dx = b.root.position.x - a.root.position.x;
            const dz = b.root.position.z - a.root.position.z;
            const d2 = dx * dx + dz * dz;
            const min = MOB_SEPARATION;
            if (d2 > min * min || d2 < 0.0001) continue;
            const d = Math.sqrt(d2);
            const push = ((min - d) / 2) * 0.5;
            const nx = dx / d;
            const nz = dz / d;
            a.root.position.x -= nx * push;
            a.root.position.z -= nz * push;
            b.root.position.x += nx * push;
            b.root.position.z += nz * push;
          }
        }

        stats.alive = mobs.filter((m) => m.active).length;
      },

      hitTest(p) {
        for (const mob of mobs) {
          if (!mob.active || mob.phase !== 'alive') continue;
          const c = mob.root.position;
          const dx = p.x - c.x;
          const dz = p.z - c.z;
          if (dx * dx + dz * dz > HIT_RADIUS * HIT_RADIUS) continue;
          if (p.y < c.y - 10 || p.y > c.y + HIT_TOP) continue;
          return { id: mob.id };
        }
        return null;
      },

      damage(id, amount, from) {
        const mob = mobs.find((m) => m.active && m.id === id);
        if (!mob || mob.phase !== 'alive' || amount <= 0) return false;
        mob.hp -= amount;
        if (mob.hp <= 0) {
          kill(mob);
          return true;
        }
        // flinch: one-shot hit clip + a shove away from the impact
        mob.oneShot = 'hit';
        mob.mixer.stopAllAction();
        mob.current = mob.act.hit;
        mob.current.reset().play();
        if (from) {
          const dx = mob.root.position.x - from.x;
          const dz = mob.root.position.z - from.z;
          const d = Math.max(1, Math.sqrt(dx * dx + dz * dz));
          mob.kb.set((dx / d) * HIT_IMPULSE, 0, (dz / d) * HIT_IMPULSE);
        }
        return false;
      },

      blast(p, radius, maxDamage) {
        for (const mob of mobs) {
          if (!mob.active || mob.phase !== 'alive') continue;
          const c = mob.root.position;
          const dx = c.x - p.x;
          const dz = c.z - p.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > radius) continue;
          const dmg = maxDamage * (1 - d / radius);
          if (dmg < 4) continue;
          handle.damage(mob.id, dmg, p);
        }
      },

      collide(x, z, radius) {
        // Solid body — but a player who is pushing (moving into the herd)
        // meets yielding mobs: update() carries them aside, so the
        // player-side push-out softens instead of acting like a wall.
        // Standing still keeps the full solid-body response.
        const soft = playerSpeed > SHOVE_MIN_SPEED ? 0.35 : 1;
        let cx = x;
        let cz = z;
        let hit = false;
        for (const mob of mobs) {
          if (!mob.active || mob.phase !== 'alive') continue;
          const c = mob.root.position;
          const dx = cx - c.x;
          const dz = cz - c.z;
          const min = BODY_RADIUS + radius;
          const d2 = dx * dx + dz * dz;
          if (d2 > min * min || d2 < 0.0001) continue;
          const d = Math.sqrt(d2);
          const push = (min - d) * soft;
          cx += (dx / d) * push;
          cz += (dz / d) * push;
          hit = true;
        }
        return hit ? { x: cx, z: cz } : null;
      },

      spawnAt(x, z) {
        // debug/verification hook — still crimson-gated so the spawn rule
        // ("Bups live only in the red") can never be broken from tooling
        if (factorAt(x, z) < 0.5) return false;
        return spawnMob(x, z) !== null;
      },

      stats,

      dispose() {
        for (const mob of mobs) {
          mob.mixer.stopAllAction();
          mob.mixer.uncacheRoot(mob.mixer.getRoot() as THREE.Object3D);
        }
        group.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry.dispose();
          }
        });
        scene.remove(group);
      },
    };

    return handle;
  });
}
