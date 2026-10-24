/**
 * THE END SPIDER — RATFIRE's cherry-grove stalker: a Minecraft-style
 * hunter that lives ONLY in the pink CHERRY GROVE biome.
 *
 * Model: end_spider.glb (user upload, "End spider" by kingillager,
 * Sketchfab pipeline) streamed from /models/mobs/. A 35-part rigid-node
 * rig (no skins — scene.clone(true) per pool slot is safe) with EIGHT
 * clips, every single one wired into the AI:
 *
 *   hatch/summon            (1.00s) one-shot spawn-in (bursts out of the turf)
 *   look at other creatures (2.00s) looping idle — head looks around
 *   walking                 (0.50s) looping skitter (playback scales with speed)
 *   bite                    (0.25s) one-shot claw strike (damage at the beat)
 *   death                   (0.50s) one-shot curl-and-collapse (holds the pose)
 *   rocket                  (1.00s) easter egg — rocket-pack pose
 *   proffesor >:)           (0.50s) easter egg — professor-with-zapper pose
 *   angel                   (0.50s) easter egg — halo pose
 *
 * BEHAVIOUR (the advanced brain)
 *   - SPAWN GATE   spiders materialise only where cherryFactorWorld says
 *                  the ground is truly pink (>= 0.7), on a ring around the
 *                  player; they despawn when left far behind. No cherry
 *                  ground -> zero spiders, guaranteed.
 *   - WANDER BRAIN idle <-> walk state machine; every walk target is
 *                  validated to stay inside the pink so they never stray
 *                  out of their biome (one pushed out turns around and
 *                  marches home).
 *   - SENSES       vision cone (player inside the frontal arc within
 *                  DETECT_RADIUS) OR anything that crowds it within
 *                  CLOSE_DETECT — plus every wound — flips the lock-on.
 *   - HUNT         locked-on spiders CHASE (fast skitter), then circle
 *                  strafe around the player while the bite cools down,
 *                  and lunge-bite when in claw reach: the bite clip bites
 *                  the player's HP at the strike beat.
 *   - WEB CAST     prey pulling away? the spider channels a three-clip
 *                  ritual — rocket -> proffesor >:) -> angel — and slings
 *                  a silk glob in the angel clip's final beats. A caught
 *                  hero is WEBBED (heavy movement slow + cocoon shell on
 *                  the page side) so the pack can close in for the kill.
 *                  Wounds break the channel; the glob leads the flee.
 *   - HORN SCARE   scare(origin, radius, duration): every alive spider in
 *                  range panics — it bolts straight away from the origin
 *                  (faster than the chase) while chase, bite and web-cast
 *                  are all suspended; the hunt resumes when fear drains.
 *   - EASTER EGGS  a spider parked idle for a long while may bust out its
 *                  rocket pack, professor zapper or angel halo — pure
 *                  flavour, all three unused-elsewhere clips get used.
 *   - DAMAGE       bullets/rockets land through the page's airHitTest ->
 *                  damage(): knockback + instant aggro, and enough damage
 *                  tips it into the death clip, then a grave-style sink
 *                  below the turf and recycle.
 *   - COLLISION    solid to bullets (hit-sphere test), spiders keep their
 *                  spacing so they never stack into one blob. Against the
 *                  player the spider YIELDS to force: walk into one and it
 *                  is carried along with your motion while it sidesteps
 *                  out of your frontal path. Stand still and it is a solid
 *                  body again.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHERRY_ZONES, cherryFactorWorld } from './wildBiomes';
import { citySpawnBlockedWorld } from './cityLayout';
import { getGameAudio } from './audio';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MODEL_URL = '/models/mobs/end_spider.glb';

/** In-game height (world units) — the player stands 190 tall, so the
 *  spider reads as a knee-to-waist-high skitterer with a wide legspan. */
const MOB_HEIGHT = 72;

/** Which way the authored model faces at rotation.y = 0 (radians added
 *  on top of the movement heading so it walks face-first). The GLB probe
 *  is unambiguous: the rig nodes are literally named head_1 (world z
 *  -0.19, and the `bite` clip animates it) and butt_33 (world z +0.19,
 *  with the big abdomen mesh parented under it) — the head faces -Z,
 *  the butt faces +Z, so the heading math (which points local +Z along
 *  the movement direction) needs a half-turn. */
const MODEL_YAW_OFFSET = Math.PI;

/** Crossfade seconds between clips. */
const FADE = 0.16;

/* ------------------------------ population ------------------------------ */

/** Desired alive spiders while the player camps the cherry groves.
 *  Density tuned DOWN at user request (was 4 — the groves felt crawled
 *  over; 2 keeps the stalker feel without the swarm). */
const POP_TARGET = 2;
/** Spawn ring around the player (world units). */
const SPAWN_MIN = 460;
const SPAWN_MAX = 1200;
/** Minimum cherry factor to accept a spawn point (deep pink only). */
const SPAWN_FACTOR = 0.7;
/** Player factor under which spawning pauses (player left the biome). */
const SPAWN_PLAYER_FACTOR = 0.35;
/** Beyond this distance from the player a spider quietly despawns. */
const DESPAWN_DIST = 2200;
/** Seconds between spawn attempts (a gentle trickle). */
const SPAWN_COOLDOWN = 0.6;

/* ------------------------------ locomotion ------------------------------ */

/** Casual skitter speed while wandering (u/s). */
const WALK_SPEED = 110;
/** The walk clip is authored at ~0.5s per cycle; playback scales so the
 *  legs ripple at the speed the body actually moves (reference = this). */
const WALK_REF_SPEED = 110;
/** Heading ease (rad/s) — spiders turn quickly, never snap. */
const TURN_RATE = 4.0;
/** Walk-target pick: this far, validated to stay deep in the pink. */
const WANDER_MIN = 100;
const WANDER_MAX = 460;
/** A walk target must be at least this cherry. */
const WANDER_FACTOR = 0.6;
/** Parked time range (s) before the next stroll. */
const IDLE_TIME_MIN = 1.6;
const IDLE_TIME_MAX = 4.4;
/** Walk time cap (s) — even a valid target is abandoned after this. */
const WALK_TIME_MAX = 6.0;
/** Wandering spiders never stroll closer than this to the player. */
const PLAYER_CLEARANCE = 120;

/* ------------------------------ aggression ------------------------------ */

/** Sensing range (u) — how far the spider's eight eyes reach. */
const DETECT_RADIUS = 420;
/** The player must be inside the frontal cone to be spotted at range
 *  (dot of spider facing vs to-player). */
const DETECT_DOT = 0.25;
/** ...but anything THIS close is felt regardless of facing. */
const CLOSE_DETECT = 150;
/** Beyond this the spider loses interest and returns to its brain. */
const DEAGGRO_DIST = 950;
/** Chase speed while locked on (u/s) — fast, still outrunnable (360). */
const CHASE_SPEED = 250;
/** Circle-strafe speed while waiting for the bite cooldown (u/s). */
const CIRCLE_SPEED = 130;
/** Circle direction re-roll range (s). */
const CIRCLE_FLIP_MIN = 1.3;
const CIRCLE_FLIP_MAX = 2.6;
/** Claw strike lands when the player is inside this circle (u). */
const ATTACK_RANGE = 90;
/** The strike bites a little beyond the starting range (lunge reach). */
const ATTACK_HIT_RANGE = 130;
/** HP removed from the player per landed bite. */
const STRIKE_DAMAGE = 12;
/** Strike lands at this fraction of the bite clip's duration. */
const STRIKE_FRAC = 0.4;
/** Lunge impulse toward the player at the start of a bite (u/s). */
const LUNGE_IMPULSE = 130;
/** Pause after a bite clip before the next decision (s). */
const ATTACK_RECOVER = 0.35;
/** Cooldown between bites (s, counted after the recover pause). */
const ATTACK_COOLDOWN = 0.85;
/** Wound stagger: brain pause after taking damage (s) — no dedicated
 *  flinch clip exists, so the pose just hiccups via knockback. */
const STAGGER_TIME = 0.28;

/* ----------------------------- horn scare ------------------------------- */

/** Scared bolt speed — pure panic, faster than the hunt chase (u/s). */
const FLEE_SPEED = 300;
/** Instant knockback shove when the horn lands (u/s, decays like a hit). */
const SCARE_IMPULSE = 140;

/* ------------------------------ web cast -------------------------------- */

/** When the prey pulls away, the spider channels a three-clip ritual —
 *  rocket -> professor -> angel — and slings its silk glob in the final
 *  beats of the halo pose. A caught hero is webbed: heavy movement slow
 *  while the cocoon holds, which is exactly the window the pack needs to
 *  close the gap and finish the hunt. */

/** Ritual may channel only while the fleeing prey is inside this band (u). */
const WEB_RANGE_MIN = 130;
const WEB_RANGE_MAX = 820;
/** Prey speed (u/s) that reads as "getting away" — walk speed (360)
 *  already outruns the chase, so simply holding W can bait the web. */
const WEB_TRIGGER_SPEED = 300;
/** The cast sequence — the three easter-egg clips, in order. */
const RITUAL_STEPS = ['rocket', 'proffesor >:)', 'angel'] as const;
type RitualStep = (typeof RITUAL_STEPS)[number];
/** The web launches this many seconds BEFORE the angel clip ends. */
const WEB_THROW_LEAD = 0.1;
/** Projectile ballistics + reach. */
const WEB_SPEED = 620;
const WEB_GRAVITY = 340;
const WEB_LIFETIME = 2.4;
/** Catch radius around the hero's centre column (u). */
const WEB_HIT_RADIUS = 85;
/** Seconds the caught hero stays webbed (slow). */
const WEB_SNARE_TIME = 3.2;
/** Seconds before the spider may channel the ritual again. */
const WEB_COOLDOWN = 6.5;
/** Channel aborts if the prey somehow gets this far (u). */
const WEB_CANCEL_DIST = 1150;
/** Projectile pool (parallel throws from the pack). */
const WEB_POOL = 4;

/* ------------------------- silk ball visuals ---------------------------- */

// The silk-cage look shared by the thrown glob AND the page-side cocoon:
// latitude rings + meridian great circles forming a hollow round wall.
// Both are drawn with the same additive light-blue silk so the catch
// matches the projectile's light exactly — one look, everywhere.

const WEB_BALL_R = 30; // reference ball radius (u)

/** Soft radial halo texture behind a silk ball (a fresh instance). */
export const makeWebGlowTexture = (): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(190,214,255,0.34)');
  grad.addColorStop(1, 'rgba(160,195,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
};

/** A HOLLOW spherical silk cage — the shared look of the thrown web ball
 *  and the catch cocoon: latitude rings plus meridian great circles form
 *  a round wall on every side with nothing inside. Thread thickness stays
 *  FINE (absolute, not scaled by the radius), so both the small flying
 *  ball and the big capture sphere read as the same delicate silk. */
export const buildWebSphere = (
  mat: THREE.MeshBasicMaterial,
  radius: number
): THREE.Mesh => {
  const geos: THREE.BufferGeometry[] = [];
  // latitude rings — the horizontal hoops of the cage (±60°, ±45°, ±30°,
  // equator): one extra band per hemisphere keeps the ball evenly dense
  for (const latDeg of [-60, -45, -30, 0, 30, 45, 60]) {
    const lat = (latDeg * Math.PI) / 180;
    const ring = new THREE.TorusGeometry(
      Math.cos(lat) * radius,
      1.4,
      6,
      64
    );
    ring.rotateX(Math.PI / 2); // lay the hoop flat
    ring.translate(0, Math.sin(lat) * radius, 0);
    geos.push(ring);
  }
  // meridian great circles — 5 full vertical hoops evenly spread (36°
  // steps), so the wall wraps the sphere from every side and closes over
  // both poles
  for (let i = 0; i < 5; i++) {
    const meridian = new THREE.TorusGeometry(radius, 1.15, 6, 72);
    meridian.rotateY((i * Math.PI) / 5);
    geos.push(meridian);
  }
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  return new THREE.Mesh(merged ?? new THREE.BufferGeometry(), mat);
};

/* ------------------------------ easter eggs ----------------------------- */

/** Idle seconds before a flavour one-shot may fire (re-armed each time). */
const EGG_ARM_MIN = 18;
const EGG_ARM_MAX = 42;

/* ------------------------------ combat ---------------------------------- */

/** Bullet hit-sphere: horizontal radius + vertical band around the body
 *  (generous over-band like every other combatant so flat shots land). */
const HIT_RADIUS = 62;
/** The band tops out ABOVE the model (the shots fly flat from the gun
 *  muzzle at roughly ~150 world units — the same generous over-band the
 *  Bup uses, so aimed body shots land). */
const HIT_TOP = 165; // above the feet
/** Player push-out circle (the spider's solid footprint). */
const BODY_RADIUS = 50;
/** Min spacing between spiders (never stack into one blob). */
const SPIDER_SEPARATION = 100;

/** Hit points — three default-pistol body hits (20 x dmg mult 3 = 60). */
const SPIDER_MAX_HP = 140;
/** Knockback impulse (world units/s) applied away from the hit point. */
const HIT_IMPULSE = 170;
const HIT_IMPULSE_TAU = 0.3; // exponential decay of the shove

/* ------------------------------ death ----------------------------------- */

/** Hold the fallen death pose before the grave-sink starts (s). */
const DEATH_HOLD = 1.2;
/** Sink speed below the turf (world units/s). */
const SINK_SPEED = 75;

/* --------------------- player force (shove + dodge) --------------------- */

/** Contact circle for the player's push: body footprint + player body. */
const SHOVE_RADIUS = BODY_RADIUS + 22;
/** Player speed (u/s) above which contact counts as real force. */
const SHOVE_MIN_SPEED = 30;
/** Fraction of the player's motion a contacted spider is carried with. */
const SHOVE_CARRY = 0.9;
/** Carried-speed cap — weighty shoves, never like teleports (u/s). */
const SHOVE_CARRY_MAX = 320;
/** Sidestep speed while dodging out of the player's frontal path (u/s). */
const DODGE_SPEED = 140;
/** Radial separation while overlapped, per unit of overlap (u/s, capped). */
const SHOVE_SEPARATE = 8;
const SHOVE_SEPARATE_MAX = 200;
/** How long the scramble (walk) pose persists after contact ends (s). */
const SHOVE_POSE_T = 0.25;

/** Pool size: the hunting pack + a couple of corpses mid-sink. */
const POOL_SIZE = POP_TARGET + 3;

type LocoClip = 'idle' | 'walk';
type OneShotClip = 'spawn' | 'bite' | 'rocket' | 'proffesor >:)' | 'angel';
type Phase = 'alive' | 'fallen' | 'sinking';
type Brain = 'idle' | 'walk' | 'chase' | 'circle' | 'flee';

export interface CherrySpiderOptions {
  /** Low-end devices: no shadow casting. */
  lowSpec?: boolean;
  /** Terrain height query — the spider walks the same ground you do. */
  heightAt: (x: number, z: number) => number;
  /** Grid->world conversion for the cherry factor (page constants). */
  block: number;
  gridOffset: number;
  /** The bite lands here — wired to the page's applyDamage. */
  damagePlayer: (amount: number) => void;
  /** A landed web calls this — the page webs the hero (movement slow +
   *  cocoon shell) for the given number of seconds. */
  snarePlayer: (duration: number) => void;
}

export interface CherrySpiderInfo {
  id: number;
  hp: number;
  maxHp: number;
  /** Combined state label: 'idle' | 'walk' | 'chase' | 'circle' | 'scared' | 'bite' | 'spawn' | 'flavor' | 'web-cast' | 'dying' | 'sinking'. */
  state: string;
  /** Clip currently owning the pose. */
  clip: string;
  /** True while locked on the player. */
  aggro: boolean;
  x: number;
  y: number;
  z: number;
}

export interface CherrySpiders {
  /** Live per-spider snapshots for debug surfaces / verification. */
  list(): CherrySpiderInfo[];
  /** Advance brains, animation and spawning. */
  update(dt: number, playerPos: THREE.Vector3): void;
  /** Bullet test: is the world point inside any alive spider? */
  hitTest(p: THREE.Vector3): { id: number } | null;
  /** Damage one spider; true if this blow was the killing one. */
  damage(id: number, amount: number, from?: THREE.Vector3): boolean;
  /** Explosion splash: every alive spider in radius takes falloff damage. */
  blast(p: THREE.Vector3, radius: number, maxDamage: number): void;
  /** Player push-out — returns the corrected position or null if clear. */
  collide(x: number, z: number, radius: number): { x: number; z: number } | null;
  /** Debug/verification spawn at an explicit cherry world point. */
  spawnAt(x: number, z: number): boolean;
  /** Daylight silk dimming: 1 = full luminous glow (night), ~0.4 = noon. */
  setWebDayLight(v: number): void;
  /** Horn scare: every alive spider within radius of origin panics — it
   *  bolts straight away from origin for duration seconds while chase,
   *  bite and web-cast are all suspended. Cheap + safe to call anytime. */
  scare(origin: THREE.Vector3, radius: number, duration: number): void;
  /** Counters for debug surfaces. */
  stats: { alive: number; spawned: number; killed: number; aggro: number };
  /** Free geometries, materials and textures. */
  dispose(): void;
}

interface Spider {
  id: number;
  root: THREE.Group; // feet-positioned, added to the pool group
  mixer: THREE.AnimationMixer;
  act: Record<
    LocoClip | OneShotClip | 'death',
    THREE.AnimationAction
  >;
  active: boolean;
  phase: Phase;
  brain: Brain;
  oneShot: OneShotClip | null;
  current: THREE.AnimationAction;
  target: THREE.Vector3; // wander goal (xz used)
  timer: number; // brain countdown
  hp: number;
  yaw: number; // smoothed heading
  yawTarget: number;
  kb: THREE.Vector3; // knockback / lunge velocity (xz)
  dieT: number; // death phase timer
  aggro: boolean; // locked on the player
  staggerT: number; // wound pause (brain held)
  attackT: number; // bite clip progress
  attackCd: number; // seconds until the next bite may start
  struck: boolean; // this bite already bit the player
  strafeDir: number; // circle-strafe side (-1 | +1)
  strafeT: number; // circle direction re-roll timer
  eggT: number; // idle seconds until a flavour one-shot may fire
  shoveT: number; // player-force grace timer (scramble pose)
  dodge: number; // sidestep side while dodging (-1 | 0 | +1)
  ritual: RitualStep | null; // web-cast channel step (null = not casting)
  ritualT: number; // seconds left in the current ritual step
  webThrown: boolean; // angel step already launched the silk glob
  webCd: number; // seconds until the next ritual may channel
  fleeT: number; // seconds of horn-scare panic left (0 = unafraid)
  fleeFrom: THREE.Vector3; // world point the panic bolted from
}

export function createCherrySpiders(
  scene: THREE.Scene,
  opts: CherrySpiderOptions
): Promise<CherrySpiders> {
  const loader = new GLTFLoader();
  return loader.loadAsync(MODEL_URL).then((gltf) => {
    const proto = gltf.scene; // cloned per pool slot (plain node rig, no skins)

    const group = new THREE.Group();
    group.name = 'cherrySpiders';
    scene.add(group);

    /* ---------------- shared clip set (AnimationClips are reusable) ---- */
    const find = (name: string): THREE.AnimationClip => {
      const clip = gltf.animations.find((c) => c.name === name);
      if (!clip) throw new Error(`cherrySpider: missing clip "${name}"`);
      return clip;
    };
    const clips: Record<LocoClip | OneShotClip | 'death', THREE.AnimationClip> =
      {
        idle: find('look at other creatures'),
        walk: find('walking'),
        spawn: find('hatch/summon'),
        bite: find('bite'),
        death: find('death'),
        rocket: find('rocket'),
        'proffesor >:)': find('proffesor >:)'),
        angel: find('angel'),
      };
    const EGGS: OneShotClip[] = ['rocket', 'proffesor >:)', 'angel'];

    /* ---------------- build the pool ----------------------------------- */
    const spiders: Spider[] = [];
    let spawnSeq = 0; // stable ids across recycles

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
      root.name = `cherrySpider_${i}`;
      root.add(model);
      root.visible = false;
      group.add(root);

      const mixer = new THREE.AnimationMixer(model);
      const act = {
        idle: mixer.clipAction(clips.idle),
        walk: mixer.clipAction(clips.walk),
        spawn: mixer.clipAction(clips.spawn),
        bite: mixer.clipAction(clips.bite),
        death: mixer.clipAction(clips.death),
        rocket: mixer.clipAction(clips.rocket),
        'proffesor >:)': mixer.clipAction(clips['proffesor >:)']),
        angel: mixer.clipAction(clips.angel),
      };
      act.idle.setLoop(THREE.LoopRepeat, Infinity);
      act.walk.setLoop(THREE.LoopRepeat, Infinity);
      for (const name of [...EGGS, 'spawn', 'bite'] as OneShotClip[]) {
        act[name].setLoop(THREE.LoopOnce, 1);
        act[name].clampWhenFinished = true;
      }
      act.death.setLoop(THREE.LoopOnce, 1);
      act.death.clampWhenFinished = true;

      const spider: Spider = {
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
        hp: SPIDER_MAX_HP,
        yaw: 0,
        yawTarget: 0,
        kb: new THREE.Vector3(),
        dieT: 0,
        aggro: false,
        staggerT: 0,
        attackT: 0,
        attackCd: 0,
        struck: false,
        strafeDir: 1,
        strafeT: 0,
        eggT: 0,
        shoveT: 0,
        dodge: 0,
        ritual: null,
        ritualT: 0,
        webThrown: false,
        webCd: 0,
        fleeT: 0,
        fleeFrom: new THREE.Vector3(),
      };
      // one-shot clips (spawn/bite/flavour) hand the pose back to
      // locomotion when they finish
      mixer.addEventListener('finished', () => {
        if (spider.oneShot === null || spider.phase !== 'alive') return;
        const done = spider.oneShot;
        spider.oneShot = null;
        if (done === 'bite') {
          spider.attackCd = ATTACK_COOLDOWN;
          spider.brain = spider.aggro ? 'chase' : 'idle';
        }
        if (done === 'spawn') spider.eggT = armEgg();
        const back =
          spider.brain === 'walk' ||
          spider.brain === 'chase' ||
          spider.brain === 'circle' ||
          spider.brain === 'flee' ||
          spider.shoveT > 0
            ? spider.act.walk
            : spider.act.idle;
        back.reset().fadeIn(FADE * 0.5).play();
        spider.act[done].fadeOut(FADE * 0.5);
        spider.current = back;
      });
      spiders.push(spider);
    }

    /* ---------------- spawn / despawn ---------------------------------- */

    const stats = { alive: 0, spawned: 0, killed: 0, aggro: 0 };
    let spawnCd = 0;

    // smoothed player velocity — how hard the player is currently pushing.
    // Teleports (huge single-frame jumps) read as "still", not force.
    let lastPX = 0;
    let lastPZ = 0;
    let playerVelX = 0;
    let playerVelZ = 0;
    let playerSpeed = 0;
    let haveLastP = false;

    const factorAt = (x: number, z: number): number =>
      cherryFactorWorld(x, z, opts.block, opts.gridOffset);

    const armEgg = (): number =>
      EGG_ARM_MIN + Math.random() * (EGG_ARM_MAX - EGG_ARM_MIN);

    function spawnSpider(x: number, z: number): Spider | null {
      const spider = spiders.find((s) => !s.active);
      if (!spider) return null;
      spider.active = true;
      spider.phase = 'alive';
      spider.brain = 'idle';
      spider.oneShot = null;
      spider.timer = 0;
      spider.hp = SPIDER_MAX_HP;
      spider.kb.set(0, 0, 0);
      spider.dieT = 0;
      spider.aggro = false;
      spider.staggerT = 0;
      spider.attackT = 0;
      spider.attackCd = 0;
      spider.struck = false;
      spider.strafeDir = Math.random() < 0.5 ? -1 : 1;
      spider.strafeT = 0;
      spider.eggT = armEgg();
      spider.shoveT = 0;
      spider.dodge = 0;
      spider.ritual = null;
      spider.ritualT = 0;
      spider.webThrown = false;
      spider.webCd = 0;
      spider.fleeT = 0;
      spider.fleeFrom.set(0, 0, 0);
      spider.id = spawnSeq++;
      spider.yaw = Math.random() * Math.PI * 2;
      spider.yawTarget = spider.yaw;
      spider.root.position.set(x, opts.heightAt(x, z), z);
      spider.root.rotation.y = spider.yaw + MODEL_YAW_OFFSET;
      spider.root.visible = true;
      spider.mixer.stopAllAction();
      // burst out of the turf: the hatch one-shot owns the first second
      spider.oneShot = 'spawn';
      spider.current = spider.act.spawn;
      spider.current.reset().play();
      stats.spawned += 1;
      return spider;
    }

    function despawn(spider: Spider): void {
      spider.active = false;
      spider.phase = 'alive';
      spider.oneShot = null;
      spider.ritual = null;
      spider.fleeT = 0;
      spider.root.visible = false;
      spider.mixer.stopAllAction();
    }

    /** Nearest cherry hand-zone centre (world coords) — the "go home"
     *  beacon for a spider knocked out of the pink. */
    function homeToward(x: number, z: number, out: THREE.Vector3): void {
      let best = Infinity;
      for (const zone of CHERRY_ZONES) {
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
        // HARD CITY GUARD: never materialise a spider on the road map —
        // the city plateau is grassland, spiders spawn in the cherry
        // groves ONLY (second line of defence behind the zeroed
        // cherry factor under the city).
        if (citySpawnBlockedWorld(x, z, opts.block, opts.gridOffset)) continue;
        // keep the pack spread out
        let crowded = false;
        for (const s of spiders) {
          if (!s.active) continue;
          const dx = s.root.position.x - x;
          const dz = s.root.position.z - z;
          if (dx * dx + dz * dz < SPIDER_SEPARATION * SPIDER_SEPARATION) {
            crowded = true;
            break;
          }
        }
        if (crowded) continue;
        return spawnSpider(x, z) !== null;
      }
      return false;
    }

    /* ---------------- wander brain ------------------------------------- */

    const scratch = new THREE.Vector3();

    function pickWanderTarget(spider: Spider): void {
      for (let attempt = 0; attempt < 8; attempt++) {
        const a = Math.random() * Math.PI * 2;
        const r = WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN);
        const x = spider.root.position.x + Math.cos(a) * r;
        const z = spider.root.position.z + Math.sin(a) * r;
        if (factorAt(x, z) < WANDER_FACTOR) continue;
        spider.target.set(x, 0, z);
        spider.brain = 'walk';
        spider.timer = WALK_TIME_MAX;
        return;
      }
      // no pink ground in reach — park longer and try again next cycle
      spider.brain = 'idle';
      spider.timer = IDLE_TIME_MAX;
    }

    /* ---------------- attacks ------------------------------------------ */

    function startBite(spider: Spider, dxp: number, dzp: number): void {
      spider.oneShot = 'bite';
      spider.attackT = 0;
      spider.struck = false;
      spider.mixer.stopAllAction();
      spider.current = spider.act.bite;
      spider.current.reset().play();
      // a small lunge toward the prey sells the strike
      const d = Math.max(1, Math.sqrt(dxp * dxp + dzp * dzp));
      spider.kb.set((-dxp / d) * LUNGE_IMPULSE, 0, (-dzp / d) * LUNGE_IMPULSE);
    }

    /* ---------------- web cast (rocket -> professor -> angel) ---------- */

    /* ---------------- the web glob — a glowing silk cage ball ---------- */
    // The projectile is the module-level silk cage at WEB_BALL_R: a hollow
    // latitude rings + meridian great circles of fine glowing silk plus a
    // soft halo, all additive so the ball reads luminous in flight.
    // Purely visual — flight, catch and cooldown are untouched.

    const WEB_POP_TIME = 0.3; // hit: swell + fade, then back to the pool
    const WEB_STRAND_OP = 0.95;
    const WEB_GLOW_OP = 0.55;
    // Daylight silk dimming: additive glow reads blown-out against a bright
    // noon sky, so page.tsx feeds the current daylight factor every frame
    // (1 = night/dusk, ~0.4 = full sun) and every opacity scales with it.
    let webDayLight = 1;
    const webOp = (base: number) => base * webDayLight;

    interface WebGlob {
      root: THREE.Group;
      strandMat: THREE.MeshBasicMaterial; // shared by every silk tube
      glowMat: THREE.SpriteMaterial;
      active: boolean;
      splat: boolean; // hit something — swelling off
      t: number; // age (s)
      vel: THREE.Vector3;
    }

    /** Halo texture instance for the thrown globs. */
    const glowTex = makeWebGlowTexture();

    const webPool: WebGlob[] = [];
    for (let i = 0; i < WEB_POOL; i++) {
      const root = new THREE.Group();
      const strandMat = new THREE.MeshBasicMaterial({
        color: 0xdde9ff,
        transparent: true,
        opacity: WEB_STRAND_OP,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      // one hollow spherical cage — the thrown ball matches the catch
      // cocoon: circular silk wall on every side, nothing inside
      root.add(buildWebSphere(strandMat, WEB_BALL_R));
      // soft luminous halo (a sprite always faces the camera)
      const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xbfd8ff,
        transparent: true,
        opacity: WEB_GLOW_OP,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(WEB_BALL_R * 3.0);
      root.add(glow);
      root.visible = false;
      group.add(root);
      webPool.push({
        root,
        strandMat,
        glowMat,
        active: false,
        splat: false,
        t: 0,
        vel: new THREE.Vector3(),
      });
    }

    function startWebRitual(spider: Spider): void {
      spider.ritual = 'rocket';
      spider.ritualT = clips.rocket.duration;
      spider.webThrown = false;
      spider.brain = 'chase';
      spider.timer = WALK_TIME_MAX;
      spider.mixer.stopAllAction();
      spider.current = spider.act.rocket;
      spider.current.reset().fadeIn(0.06).play();
    }

    function advanceRitual(
      spider: Spider,
      dt: number,
      dxp: number,
      dzp: number,
      distPlayer: number,
      playerPos: THREE.Vector3
    ): void {
      // keep facing the prey while channeling
      spider.yawTarget = Math.atan2(-dxp, -dzp);
      // prey truly fled the county — break the channel
      if (distPlayer > WEB_CANCEL_DIST) {
        spider.ritual = null;
        spider.webCd = WEB_COOLDOWN * 0.5;
        spider.mixer.stopAllAction();
        spider.current = spider.act.walk;
        spider.current.reset().fadeIn(FADE).play();
        return;
      }
      spider.ritualT -= dt;
      if (spider.ritual === 'angel') {
        // the halo pose is closing — sling the silk in its final beats
        if (!spider.webThrown && spider.ritualT <= WEB_THROW_LEAD) {
          spider.webThrown = true;
          launchWeb(spider, playerPos);
        }
        if (spider.ritualT > 0) return;
        // cast complete — back to the hunt
        spider.ritual = null;
        spider.webCd = WEB_COOLDOWN;
        spider.brain = 'chase';
        spider.timer = WALK_TIME_MAX;
        spider.mixer.stopAllAction();
        spider.current = spider.act.walk;
        spider.current.reset().fadeIn(FADE * 0.5).play();
        return;
      }
      if (spider.ritualT > 0) return;
      // next step of the sequence
      const next = RITUAL_STEPS[RITUAL_STEPS.indexOf(spider.ritual) + 1];
      spider.ritual = next;
      spider.ritualT = clips[next].duration;
      spider.mixer.stopAllAction();
      spider.current = spider.act[next];
      spider.current.reset().fadeIn(0.06).play();
    }

    function launchWeb(spider: Spider, playerPos: THREE.Vector3): void {
      const glob = webPool.find((g) => !g.active);
      if (!glob) return; // pool busy — the show still played out
      const p = spider.root.position;
      // mouth: front of the head at chest height
      const mx = p.x + Math.sin(spider.yaw) * 40;
      const mz = p.z + Math.cos(spider.yaw) * 40;
      const my = p.y + 52;
      // ballistic solve toward the PREDICTED centre (lead the flee) —
      // two iterations so the lead uses the flight time, not the range
      let tx = playerPos.x + playerVelX * 0.5;
      let tz = playerPos.z + playerVelZ * 0.5;
      let t = THREE.MathUtils.clamp(
        Math.hypot(tx - mx, tz - mz) / WEB_SPEED,
        0.3,
        1.3
      );
      tx = playerPos.x + playerVelX * t * 0.85;
      tz = playerPos.z + playerVelZ * t * 0.85;
      const ty = playerPos.y + 95; // centre of the 190-tall hero
      t = THREE.MathUtils.clamp(
        Math.hypot(tx - mx, tz - mz) / WEB_SPEED,
        0.3,
        1.3
      );
      glob.vel.set(
        (tx - mx) / t,
        (ty - my) / t + 0.5 * WEB_GRAVITY * t,
        (tz - mz) / t
      );
      glob.root.position.set(mx, my, mz);
      glob.root.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      glob.root.scale.setScalar(1);
      glob.strandMat.opacity = webOp(WEB_STRAND_OP);
      glob.glowMat.opacity = webOp(WEB_GLOW_OP);
      glob.active = true;
      glob.splat = false;
      glob.t = 0;
      glob.root.visible = true;
      void getGameAudio().then((sfx) => sfx.webShot());
    }

    /** The web found its mark — swell off and return to the pool. */
    function startSplat(glob: WebGlob): void {
      glob.splat = true;
      glob.t = 0;
      glob.vel.set(0, 0, 0);
    }

    function updateWebs(dt: number, playerPos: THREE.Vector3): void {
      for (const glob of webPool) {
        if (!glob.active) continue;
        glob.t += dt;
        const pos = glob.root.position;
        if (!glob.splat) {
          glob.vel.y -= WEB_GRAVITY * dt;
          pos.addScaledVector(glob.vel, dt);
          // the silk ball tumbles gently as it flies
          glob.root.rotation.x += 2.1 * dt;
          glob.root.rotation.y += 1.5 * dt;
          // track the daylight dim while the silk flies
          glob.strandMat.opacity = webOp(WEB_STRAND_OP);
          glob.glowMat.opacity = webOp(WEB_GLOW_OP);
          // CATCH: inside the hero's centre column (brief arm delay so a
          // point-blank throw doesn't instantly self-collide)
          const dx = pos.x - playerPos.x;
          const dz = pos.z - playerPos.z;
          const dy = pos.y - (playerPos.y + 95);
          if (
            glob.t > 0.08 &&
            dx * dx + dz * dz < WEB_HIT_RADIUS * WEB_HIT_RADIUS &&
            Math.abs(dy) < 150
          ) {
            opts.snarePlayer(WEB_SNARE_TIME);
            void getGameAudio().then((sfx) => sfx.webStick());
            startSplat(glob);
            continue;
          }
          // ground splat / end of flight
          if (pos.y < opts.heightAt(pos.x, pos.z) + 10) {
            startSplat(glob);
          } else if (glob.t > WEB_LIFETIME) {
            startSplat(glob);
          }
        } else {
          // simple pop: swell a touch, fade out, back to the pool
          const k = Math.min(1, glob.t / WEB_POP_TIME);
          glob.root.scale.setScalar(1 + k * 0.35);
          glob.strandMat.opacity = webOp(WEB_STRAND_OP) * (1 - k);
          glob.glowMat.opacity = webOp(WEB_GLOW_OP) * (1 - k);
          if (k >= 1) {
            glob.active = false;
            glob.root.visible = false;
          }
        }
      }
    }

    /* ---------------- damage ------------------------------------------- */

    function kill(spider: Spider): void {
      spider.phase = 'fallen';
      spider.dieT = 0;
      spider.oneShot = null;
      spider.ritual = null;
      spider.fleeT = 0;
      stats.killed += 1;
      spider.mixer.stopAllAction();
      spider.current = spider.act.death;
      spider.current.reset().play();
    }

    /* ---------------- public handle ------------------------------------ */

    const handle: CherrySpiders = {
      list(): CherrySpiderInfo[] {
        const out: CherrySpiderInfo[] = [];
        for (const s of spiders) {
          if (!s.active) continue;
          out.push({
            id: s.id,
            hp: Math.max(0, Math.round(s.hp)),
            maxHp: SPIDER_MAX_HP,
            state:
              s.phase === 'sinking'
                ? 'sinking'
                : s.phase === 'fallen'
                  ? 'dying'
                  : s.fleeT > 0
                    ? 'scared'
                    : s.ritual !== null
                      ? 'web-cast'
                      : s.oneShot !== null
                        ? s.oneShot === 'bite'
                          ? 'bite'
                          : s.oneShot === 'spawn'
                            ? 'spawn'
                            : 'flavor'
                        : s.brain,
            clip: s.current.getClip().name,
            aggro: s.aggro,
            x: s.root.position.x,
            y: s.root.position.y,
            z: s.root.position.z,
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

        // spawning: a gentle trickle while the player camps the pink
        spawnCd -= dt;
        let aliveCount = 0;
        for (const s of spiders)
          if (s.active && s.phase === 'alive') aliveCount++;
        if (
          aliveCount < POP_TARGET &&
          spawnCd <= 0 &&
          playerFactor > SPAWN_PLAYER_FACTOR
        ) {
          spawnCd = SPAWN_COOLDOWN;
          trySpawnAround(playerPos);
        }

        for (const spider of spiders) {
          if (!spider.active) continue;
          const p = spider.root.position;

          // leave-the-country despawn: far behind the player, or somehow
          // off the pink entirely (knockback edge case) — quietly recycle
          const dxp = p.x - playerPos.x;
          const dzp = p.z - playerPos.z;
          const distPlayer = Math.sqrt(dxp * dxp + dzp * dzp);
          if (spider.phase !== 'sinking') {
            if (
              distPlayer > DESPAWN_DIST ||
              (spider.phase === 'alive' && factorAt(p.x, p.z) < 0.35)
            ) {
              despawn(spider);
              continue;
            }
          }

          if (spider.shoveT > 0)
            spider.shoveT = Math.max(0, spider.shoveT - dt);
          if (spider.staggerT > 0)
            spider.staggerT = Math.max(0, spider.staggerT - dt);
          if (spider.attackCd > 0)
            spider.attackCd = Math.max(0, spider.attackCd - dt);
          if (spider.webCd > 0)
            spider.webCd = Math.max(0, spider.webCd - dt);

          // player force: a moving player who contacts a spider shoves it
          // — carried along with the push while it sidesteps out of the
          // player's frontal path (dead/dying spiders are ghosted)
          if (
            spider.phase === 'alive' &&
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
            // only when the spider is actually in the player's path
            // (ahead of the motion) does it get carried and dodge
            if (pvx * nx + pvz * nz > 0.1) {
              const carry =
                Math.min(playerSpeed, SHOVE_CARRY_MAX) * SHOVE_CARRY;
              const lat = pvx * nz - pvz * nx;
              if (Math.abs(lat) > 0.12)
                spider.dodge = lat >= 0 ? 1 : -1;
              const side = spider.dodge === 0 ? 1 : spider.dodge;
              mvx += pvx * carry - pvz * side * DODGE_SPEED;
              mvz += pvz * carry + pvx * side * DODGE_SPEED;
            }
            p.x += mvx * dt;
            p.z += mvz * dt;
            spider.shoveT = SHOVE_POSE_T;
            if (mvx * mvx + mvz * mvz > 1) {
              spider.yawTarget = Math.atan2(mvx, mvz);
            }
          }

          // knockback / lunge shove (decays exponentially)
          if (spider.kb.lengthSq() > 1) {
            p.x += spider.kb.x * dt;
            p.z += spider.kb.z * dt;
            const decay = Math.exp(-dt / HIT_IMPULSE_TAU);
            spider.kb.multiplyScalar(decay);
          }

          if (spider.phase === 'fallen') {
            // death clip holds the curled pose; then start the sink
            spider.dieT += dt;
            if (spider.dieT >= clips.death.duration + DEATH_HOLD) {
              spider.phase = 'sinking';
              spider.dieT = 0;
            }
          } else if (spider.phase === 'sinking') {
            spider.dieT += dt;
            p.y -= SINK_SPEED * dt;
            if (spider.dieT > 2.4) {
              despawn(spider);
              continue;
            }
          } else {
            // ----- alive: senses, brain, attack sequencing -----

            // HORN SCARE: a panicked spider blind-bolts straight away
            // from the scare origin — the senses below and every attack
            // behaviour hold their breath until the fear drains
            if (spider.fleeT > 0) {
              spider.fleeT = Math.max(0, spider.fleeT - dt);
              const dxs = p.x - spider.fleeFrom.x;
              const dzs = p.z - spider.fleeFrom.z;
              const d = Math.max(1, Math.sqrt(dxs * dxs + dzs * dzs));
              spider.yawTarget = Math.atan2(dxs, dzs); // face away...
              p.x += (dxs / d) * FLEE_SPEED * dt; // ...and run away —
              p.z += (dzs / d) * FLEE_SPEED * dt; // no standoff cap here
              if (spider.fleeT <= 0) {
                // fear spent — back to the hunt if the lock-on held
                if (spider.aggro) {
                  spider.brain = 'chase';
                  spider.timer = WALK_TIME_MAX;
                } else {
                  spider.brain = 'idle';
                  spider.timer =
                    IDLE_TIME_MIN +
                    Math.random() * (IDLE_TIME_MAX - IDLE_TIME_MIN);
                }
              }
            }

            // SENSES: the player in the vision cone (or crowding it)
            // flips the lock-on; outrunning the leash drops it again
            if (
              spider.fleeT <= 0 &&
              !spider.aggro &&
              spider.staggerT <= 0 &&
              spider.oneShot !== 'spawn' &&
              distPlayer < DETECT_RADIUS
            ) {
              const fx = Math.sin(spider.yaw);
              const fz = Math.cos(spider.yaw);
              const dot =
                distPlayer > 1
                  ? (dxp / distPlayer) * -fx + (dzp / distPlayer) * -fz
                  : 1;
              if (dot > DETECT_DOT || distPlayer < CLOSE_DETECT) {
                spider.aggro = true;
                spider.brain = 'chase';
                spider.timer = WALK_TIME_MAX;
              }
            } else if (
              spider.fleeT <= 0 &&
              spider.aggro &&
              spider.ritual === null &&
              distPlayer > DEAGGRO_DIST
            ) {
              spider.aggro = false;
              spider.brain = 'idle';
              spider.timer = IDLE_TIME_MIN;
              spider.eggT = armEgg();
            }

            // ATTACK sequencing: while locked on and in claw reach
            if (spider.fleeT > 0) {
              // the horn scare owns the body — chase, circle, bite,
              // web-cast and the wander brains all hold their breath
            } else if (spider.ritual !== null) {
              // the web cast owns the pose until the halo clip is done
              advanceRitual(spider, dt, dxp, dzp, distPlayer, playerPos);
            } else if (spider.oneShot === 'bite') {
              // a strike is playing — deliver the bite at the beat
              spider.attackT += dt;
              if (
                !spider.struck &&
                spider.attackT >= clips.bite.duration * STRIKE_FRAC
              ) {
                spider.struck = true;
                if (distPlayer < ATTACK_HIT_RANGE)
                  opts.damagePlayer(STRIKE_DAMAGE);
              }
            } else if (spider.staggerT <= 0 && spider.oneShot === null) {
              // WEB CAST trigger: the prey is pulling away out of claw
              // reach — channel rocket -> professor -> angel and catch it
              if (
                spider.aggro &&
                spider.webCd <= 0 &&
                distPlayer > WEB_RANGE_MIN &&
                distPlayer < WEB_RANGE_MAX &&
                playerSpeed > WEB_TRIGGER_SPEED
              ) {
                startWebRitual(spider);
              } else {
              // face the threat while locked on
              if (spider.aggro) {
                spider.yawTarget = Math.atan2(-dxp, -dzp);
              }

              if (
                spider.aggro &&
                distPlayer <= ATTACK_RANGE &&
                spider.attackCd <= 0
              ) {
                startBite(spider, dxp, dzp);
              } else {
                // ----- brain (paused while staggered) -----
                spider.timer -= dt;

                if (spider.brain === 'chase' && spider.aggro) {
                  if (distPlayer > ATTACK_RANGE * 0.85) {
                    // close the distance to claw reach
                    const step = Math.min(
                      CHASE_SPEED * dt,
                      distPlayer - ATTACK_RANGE * 0.7
                    );
                    if (step > 0) {
                      p.x += (-dxp / distPlayer) * step;
                      p.z += (-dzp / distPlayer) * step;
                    }
                  }
                  // in mid range with the bite on cooldown: CIRCLE STRAFE
                  // around the prey — a moving target is harder to hit
                  if (spider.attackCd > 0 && distPlayer < ATTACK_RANGE * 2.2) {
                    spider.brain = 'circle';
                    spider.strafeT =
                      CIRCLE_FLIP_MIN +
                      Math.random() * (CIRCLE_FLIP_MAX - CIRCLE_FLIP_MIN);
                  }
                  spider.timer = WALK_TIME_MAX; // never time out mid-hunt
                } else if (spider.brain === 'circle' && spider.aggro) {
                  // orbit the player at claw-ish range
                  spider.strafeT -= dt;
                  if (spider.strafeT <= 0) {
                    spider.strafeDir *= -1;
                    spider.strafeT =
                      CIRCLE_FLIP_MIN +
                      Math.random() * (CIRCLE_FLIP_MAX - CIRCLE_FLIP_MIN);
                  }
                  if (distPlayer > ATTACK_RANGE * 2.4) {
                    // prey escaped the orbit — resume the chase
                    spider.brain = 'chase';
                  } else {
                    const rx = -dzp / Math.max(1, distPlayer);
                    const rz = dxp / Math.max(1, distPlayer);
                    p.x += rx * spider.strafeDir * CIRCLE_SPEED * dt;
                    p.z += rz * spider.strafeDir * CIRCLE_SPEED * dt;
                    // keep the orbit radius honest
                    if (distPlayer < ATTACK_RANGE * 0.8) {
                      p.x += (dxp / Math.max(1, distPlayer)) * 40 * dt;
                      p.z += (dzp / Math.max(1, distPlayer)) * 40 * dt;
                    } else if (distPlayer > ATTACK_RANGE * 1.5) {
                      p.x += (-dxp / Math.max(1, distPlayer)) * 60 * dt;
                      p.z += (-dzp / Math.max(1, distPlayer)) * 60 * dt;
                    }
                  }
                  spider.timer = WALK_TIME_MAX;
                } else if (spider.brain === 'idle') {
                  // flavour: a long-parked spider may bust a move
                  spider.eggT -= dt;
                  if (spider.eggT <= 0 && spider.oneShot === null) {
                    spider.eggT = armEgg();
                    const egg = EGGS[Math.floor(Math.random() * EGGS.length)];
                    spider.oneShot = egg;
                    spider.mixer.stopAllAction();
                    spider.current = spider.act[egg];
                    spider.current.reset().play();
                  } else if (spider.timer <= 0 && spider.oneShot === null) {
                    pickWanderTarget(spider);
                  }
                } else {
                  // wander toward the target, face-first, terrain-hugging
                  const dx = spider.target.x - p.x;
                  const dz = spider.target.z - p.z;
                  const dist = Math.sqrt(dx * dx + dz * dz);
                  // a wandering spider never strolls into your shadow
                  const tooCloseToPlayer =
                    !spider.aggro && distPlayer < PLAYER_CLEARANCE + BODY_RADIUS;
                  if (dist < 22 || spider.timer <= 0 || tooCloseToPlayer) {
                    spider.brain = 'idle';
                    spider.timer =
                      IDLE_TIME_MIN +
                      Math.random() * (IDLE_TIME_MAX - IDLE_TIME_MIN);
                  } else {
                    spider.yawTarget = Math.atan2(dx, dz);
                    const step = Math.min(WALK_SPEED * dt, dist);
                    p.x += Math.sin(spider.yaw) * step;
                    p.z += Math.cos(spider.yaw) * step;
                  }
                }

                // knocked out of the pink? turn around and march home
                if (
                  !spider.aggro &&
                  spider.brain === 'idle' &&
                  spider.oneShot === null &&
                  factorAt(p.x, p.z) < 0.55
                ) {
                  homeToward(p.x, p.z, scratch);
                  spider.target.copy(scratch);
                  spider.brain = 'walk';
                  spider.timer = WALK_TIME_MAX * 2;
                }
              }
              }
            }
          }

          // heading ease + pose
          if (spider.phase === 'alive') {
            let dy = spider.yawTarget - spider.yaw;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            spider.yaw += THREE.MathUtils.clamp(
              dy,
              -TURN_RATE * dt,
              TURN_RATE * dt
            );
            spider.root.rotation.y = spider.yaw + MODEL_YAW_OFFSET;

            // the walk clip ripples at the speed the body actually moves
            const moving =
              spider.brain === 'walk' ||
              spider.brain === 'chase' ||
              spider.brain === 'circle' ||
              spider.brain === 'flee' ||
              spider.shoveT > 0;
            spider.act.walk.timeScale = moving
              ? THREE.MathUtils.clamp(
                  (spider.brain === 'chase'
                    ? CHASE_SPEED
                    : spider.brain === 'flee'
                      ? FLEE_SPEED
                      : WALK_SPEED) / WALK_REF_SPEED,
                  0.8,
                  2.4
                )
              : 1;

            const want = moving ? spider.act.walk : spider.act.idle;
            if (
              spider.ritual === null &&
              spider.oneShot === null &&
              spider.current !== want
            ) {
              want.reset().fadeIn(FADE).play();
              spider.current.fadeOut(FADE);
              spider.current = want;
            }
          }

          // ride the terrain (except while sinking below it)
          if (spider.phase !== 'sinking') {
            const gy = opts.heightAt(p.x, p.z);
            p.y += (gy - p.y) * Math.min(1, 10 * dt);
          }

          spider.mixer.update(dt);
        }

        // pack spacing: gentle pairwise push-apart (alive spiders only)
        for (let i = 0; i < spiders.length; i++) {
          const a = spiders[i];
          if (!a.active || a.phase !== 'alive') continue;
          for (let k = i + 1; k < spiders.length; k++) {
            const b = spiders[k];
            if (!b.active || b.phase !== 'alive') continue;
            const dx = b.root.position.x - a.root.position.x;
            const dz = b.root.position.z - a.root.position.z;
            const d2 = dx * dx + dz * dz;
            const min = SPIDER_SEPARATION;
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

        // web projectiles: fly, catch, splat
        updateWebs(dt, playerPos);

        stats.alive = spiders.filter((s) => s.active).length;
        stats.aggro = spiders.filter((s) => s.active && s.aggro).length;
      },

      hitTest(p) {
        for (const spider of spiders) {
          if (!spider.active || spider.phase !== 'alive') continue;
          const c = spider.root.position;
          const dx = p.x - c.x;
          const dz = p.z - c.z;
          if (dx * dx + dz * dz > HIT_RADIUS * HIT_RADIUS) continue;
          if (p.y < c.y - 10 || p.y > c.y + HIT_TOP) continue;
          return { id: spider.id };
        }
        return null;
      },

      damage(id, amount, from) {
        const spider = spiders.find((s) => s.active && s.id === id);
        if (!spider || spider.phase !== 'alive' || amount <= 0) return false;
        spider.hp -= amount;
        // every wound flips the lock-on — shoot a spider and it answers
        if (spider.oneShot === null || spider.oneShot === 'spawn') {
          spider.aggro = true;
          // a horn scare outranks the wound — the panic keeps the body
          if (spider.fleeT <= 0) spider.brain = 'chase';
        }
        if (spider.hp <= 0) {
          kill(spider);
          return true;
        }
        // wound stagger: brain pause + a shove away from the impact
        // (no dedicated flinch clip — the knockback sells the hit)
        spider.staggerT = STAGGER_TIME;
        spider.oneShot = null;
        spider.ritual = null; // a wound breaks the web-cast concentration
        spider.mixer.stopAllAction();
        const back =
          spider.brain === 'walk' ||
          spider.brain === 'chase' ||
          spider.brain === 'circle' ||
          spider.brain === 'flee'
            ? spider.act.walk
            : spider.act.idle;
        back.reset().fadeIn(FADE * 0.5).play();
        spider.current = back;
        if (from) {
          const dx = spider.root.position.x - from.x;
          const dz = spider.root.position.z - from.z;
          const d = Math.max(1, Math.sqrt(dx * dx + dz * dz));
          spider.kb.set((dx / d) * HIT_IMPULSE, 0, (dz / d) * HIT_IMPULSE);
        }
        return false;
      },

      blast(p, radius, maxDamage) {
        for (const spider of spiders) {
          if (!spider.active || spider.phase !== 'alive') continue;
          const c = spider.root.position;
          const dx = c.x - p.x;
          const dz = c.z - p.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > radius) continue;
          const dmg = maxDamage * (1 - d / radius);
          if (dmg < 4) continue;
          handle.damage(spider.id, dmg, p);
        }
      },

      collide(x, z, radius) {
        // Solid body — but a player who is pushing (moving into the pack)
        // meets yielding spiders: update() carries them aside, so the
        // player-side push-out softens instead of acting like a wall.
        // Standing still keeps the full solid-body response.
        const soft = playerSpeed > SHOVE_MIN_SPEED ? 0.35 : 1;
        let cx = x;
        let cz = z;
        let hit = false;
        for (const spider of spiders) {
          if (!spider.active || spider.phase !== 'alive') continue;
          const c = spider.root.position;
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
        // debug/verification hook — still cherry-gated so the spawn rule
        // ("spiders live only in the pink") can never be broken from tooling
        if (factorAt(x, z) < 0.5) return false;
        return spawnSpider(x, z) !== null;
      },

      setWebDayLight(v) {
        webDayLight = THREE.MathUtils.clamp(v, 0, 1);
      },

      scare(origin, radius, duration) {
        if (duration <= 0) return;
        for (const spider of spiders) {
          if (!spider.active || spider.phase !== 'alive') continue;
          const c = spider.root.position;
          const dx = c.x - origin.x;
          const dz = c.z - origin.z;
          if (dx * dx + dz * dz > radius * radius) continue;
          // the horn owns this body: drop the cast, bolt from the origin
          spider.fleeT = duration;
          spider.fleeFrom.copy(origin);
          spider.brain = 'flee';
          spider.ritual = null; // the scare breaks the web-cast focus
          spider.webThrown = false;
          spider.oneShot = null; // no bite / flavour pose outranks panic
          const d = Math.max(1, Math.sqrt(dx * dx + dz * dz));
          spider.kb.set((dx / d) * SCARE_IMPULSE, 0, (dz / d) * SCARE_IMPULSE);
        }
      },

      stats,

      dispose() {
        for (const spider of spiders) {
          spider.mixer.stopAllAction();
          spider.mixer.uncacheRoot(spider.mixer.getRoot() as THREE.Object3D);
        }
        group.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry.dispose();
          }
        });
        // web glob materials + the shared glow sprite texture
        for (const g of webPool) {
          g.strandMat.dispose();
          g.glowMat.dispose();
        }
        glowTex.dispose();
        scene.remove(group);
      },
    };

    return handle;
  });
}
