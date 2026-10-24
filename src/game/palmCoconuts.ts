/**
 * FALLING COCONUTS — the palm grove's solid-body physics props, per the
 * user's "implement this falling feature to the coconut and make them
 * realisitcly fallable like a solid body" (the leaf-fall idea re-aimed
 * at the nuts).
 *
 *  - THE BODIES: every hanging nut is an individually tracked instance
 *    (see palmTrees.ts PalmNutInstance). A nut DETACHES from the merged
 *    hanging mesh the moment it falls and becomes a free rigid body:
 *    pooled voxel cubes (same coconut atlas, unit box scaled per nut)
 *    with full 3-axis tumble.
 *  - SOLID-BODY FALL: real gravity (1800 u/s², the page's constant),
 *    terminal tumble, and a bounce-on-impact solver — vertical
 *    restitution 0.38, horizontal friction 0.62 per hit, spin kick on
 *    every bounce, then end-over-end ROLLING (omega = |v|/r around the
 *    axis perpendicular to travel) that decays until the nut settles.
 *  - REAL SURFACES: the ground under a nut is max(terrain, palm block
 *    tops via supportAt) — nuts bounce and rest ON the stair rings and
 *    base blocks exactly where the player walks; lateral hits against
 *    trunks/stairs reflect through palms.collide. Water is a special
 *    surface: a nut that hits the pool SPLASHES (page callback -> real
 *    ripple ring) and then FLOATS — buoyant sit + the shared ambient
 *    swell bob (oasisWater.oasisSwell) + wind drift, like a real
 *    coconut.
 *  - SOLID TO THE WORLD: every free body is a physical obstacle — the
 *    player is pushed out of a body's column (collide, ghosts above the
 *    nut top so you can hop over one) and rounds that clip a fallen
 *    nut (bodyHitTest) KICK it rolling away (nudge) instead of passing
 *    through — the nut is a real solid, not a decal.
 *  - TRIGGERS: bullets (the page's airHitTest routes 'coconut' hits
 *    here — the nut is knocked loose along the shot direction) and an
 *    ambient drop timer (a nearby tree sheds a nut every so often).
 *    Nuts REGROW on their tree ~2-3 minutes after dropping, so the
 *    grove never strips bare.
 *  - CLEANUP: a settled nut rests ~20-28s, then shrinks away and its
 *    instance is free to regrow — the pool of falling bodies recycles.
 */

import * as THREE from 'three';
import {
  nutBoxUVs,
  type PalmNutInstance,
  type PalmTreesHandle,
} from './palmTrees';
import { createCoconutTexture } from './palmTextures';
import { oasisSwell } from './oasisWater';

/* ------------------------------ tuning ---------------------------------- */

/** Gravity, u/s² — matches the page's player GRAVITY so nuts fall at
 *  exactly the speed everything else in the world does. */
const NUT_GRAVITY = 1800;
/** Bounce: vertical restitution + horizontal surface friction. */
const BOUNCE_RESTITUTION = 0.38;
const BOUNCE_FRICTION = 0.62;
/** Below this bounce speed the nut stops hopping and starts rolling. */
const ROLL_SPEED = 70;
/** Rolling friction (per-second exponential decay) + rest threshold. */
const ROLL_DRAG = 1.8;
const REST_SPEED = 12;
/** Trunk/stair reflection restitution for lateral hits. */
const WALL_RESTITUTION = 0.45;
/** Buoyant sit height (fraction of radius above the waterline) + wind
 *  drift while floating + how long a floater lasts. */
const FLOAT_SIT = 0.45;
const FLOAT_WIND = { x: 9, z: 4 };
const FLOAT_LIFE_MIN = 9;
const FLOAT_LIFE_MAX = 14;
/** Ground-rest lifetime (seconds) before the nut shrinks away. */
const REST_LIFE_MIN = 20;
const REST_LIFE_MAX = 28;
/** Shrink-out duration at end of life. */
const DESPAWN_SHRINK = 0.55;
/** Ambient drop: interval bounds (low-spec doubles them) + how far a
 *  tree may be from the player to shed a nut. */
const DROP_MIN = 7;
const DROP_MAX = 15;
const DROP_TREE_RANGE = 1500;
/** Bullet hit-test extra reach beyond the nut's surface, world units. */
const HIT_PAD = 16;
/** Free-body hit pad for rounds (smaller than the hanging nut's — the
 *  body is already a generous sphere). */
const BODY_HIT_PAD = 6;
/** A round's kick on a free body: planar launch + hop-up speeds. */
const NUDGE_KICK = 120;
const NUDGE_KICK_VAR = 60;
const NUDGE_HOP = 45;
const NUDGE_HOP_VAR = 50;
/** Regrow delay after a nut detaches, seconds. */
const REGROW_MIN = 120;
const REGROW_MAX = 180;
/** Pool of simultaneous free bodies (low-spec halves it). */
const MAX_BODIES = 12;
const MAX_BODIES_LOWSPEC = 6;

/** Deterministic PRNG for the runtime physics variety (spins, drifts,
 *  drop picks — behaviour varies per session, PLACEMENT never does). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ types ----------------------------------- */

interface NutBody {
  id: number;
  /** Centre of the voxel cube. */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  /** Tumble orientation + angular velocity (axis-angle per second). */
  quat: THREE.Quaternion;
  wx: number;
  wy: number;
  wz: number;
  /** fall | roll | float | rest — roll/rest mean "supported". */
  mode: 'fall' | 'roll' | 'float' | 'rest';
  /** Support height under the body while supported. */
  groundY: number;
  onWater: boolean;
  /** Supported-life clock (roll/rest/float) and despawn shrink 0..1. */
  restT: number;
  restMax: number;
  shrink: number;
  mesh: THREE.Mesh;
}

export interface PalmCoconutsHandle {
  /** Advance the bodies (call once per frame with the player position —
   *  the ambient drop picks trees near the player). */
  update(dt: number, playerX: number, playerZ: number): void;
  /** Bullet hit-test: the id of a HANGING nut whose sphere (surface +
   *  pad) contains p, or -1. */
  hitTest(p: THREE.Vector3, pad?: number): number;
  /** Player push-out: circle-vs-column against every live free body —
   *  the corrected (x, z), or null when clear. Bodies ghost above
   *  their top face (feetY >= body top), so a nut can be hopped over
   *  exactly like the palm blocks ghost at their tops. */
  collide(
    x: number,
    z: number,
    radius: number,
    feetY: number
  ): { x: number; z: number } | null;
  /** Bullet hit-test against FREE bodies (falling / rolling / resting
   *  / floating): the body's pool index, or -1. */
  bodyHitTest(p: THREE.Vector3): number;
  /** Kick a free body away from a world point (the shot's muzzle):
   *  a resting nut is launched back into a roll, a floater skims off,
   *  a falling one is deflected. */
  nudge(index: number, originX: number, originY: number, originZ: number): boolean;
  /** Knock a hanging nut loose along a world-space direction (the
   *  shot's travel) — detaches it and launches the body. */
  knock(id: number, dirX: number, dirY: number, dirZ: number): boolean;
  /** Debug: force-drop a nut from a tree near the player. */
  dropNear(): boolean;
  /** Debug: live body counts. */
  stats(): {
    hanging: number;
    falling: number;
    resting: number;
    floating: number;
    dropped: number;
    regrown: number;
  };
  dispose(): void;
}

export function createPalmCoconuts(
  scene: THREE.Scene,
  palms: PalmTreesHandle,
  opts: {
    block: number;
    lowSpec?: boolean;
    /** Surface probe: ground height + whether the pool covers it. */
    surfaceAt(x: number, z: number): { y: number; water: boolean };
    /** Pool centre + waterline for the float bob (oasisWater.layout()). */
    water: { x: number; z: number; y: number };
    /** Water entry callback — the page throws the real splash/ripple. */
    onWaterEntry?(x: number, z: number, impactSpeed: number): void;
  }
): PalmCoconutsHandle {
  const block = opts.block;
  const lowSpec = opts.lowSpec ?? false;
  const rand = mulberry32(0xc0c0f41 >>> 0);
  const maxBodies = lowSpec ? MAX_BODIES_LOWSPEC : MAX_BODIES;

  /* --------------------------- body meshes --------------------------- */
  // pooled unit cubes wearing the coconut atlas, scaled per nut — the
  // hanging nuts and the free bodies are pixel-identical voxel cubes
  const unitNut = new THREE.BoxGeometry(1, 1, 1);
  nutBoxUVs(unitNut);
  const nutMaterial = new THREE.MeshLambertMaterial({
    map: createCoconutTexture(),
  });
  const bodies: NutBody[] = [];
  for (let i = 0; i < maxBodies; i++) {
    const mesh = new THREE.Mesh(unitNut, nutMaterial);
    mesh.castShadow = true;
    mesh.visible = false;
    mesh.position.set(0, -1e6, 0);
    scene.add(mesh);
    bodies.push({
      id: -1,
      x: 0,
      y: -1e6,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      radius: 1,
      quat: new THREE.Quaternion(),
      wx: 0,
      wy: 0,
      wz: 0,
      mode: 'rest',
      groundY: 0,
      onWater: false,
      restT: 0,
      restMax: 0,
      shrink: 0,
      mesh,
    });
  }

  /* --------------------------- regrow queue -------------------------- */
  const regrowQueue: Array<{ id: number; at: number }> = [];
  let time = 0;
  let dropped = 0;
  let regrown = 0;
  let dropTimer = 4 + rand() * 6; // first ambient drop lands quickly

  /* --------------------------- spawning ------------------------------ */

  const scratchV = new THREE.Vector3();

  function spawnBody(
    nut: PalmNutInstance,
    vx: number,
    vy: number,
    vz: number
  ): NutBody | null {
    const body = bodies.find((b) => !b.mesh.visible);
    if (!body) return null;
    body.id = nut.id;
    body.x = nut.x;
    body.y = nut.y;
    body.z = nut.z;
    body.vx = vx;
    body.vy = vy;
    body.vz = vz;
    body.radius = (nut.size * block) / 2;
    body.quat.identity();
    body.wx = (rand() - 0.5) * 6;
    body.wy = (rand() - 0.5) * 6;
    body.wz = (rand() - 0.5) * 6;
    body.mode = 'fall';
    body.onWater = false;
    body.restT = 0;
    body.restMax = 0;
    body.shrink = 0;
    body.mesh.visible = true;
    body.mesh.scale.setScalar(nut.size * block);
    body.mesh.position.set(body.x, body.y, body.z);
    body.mesh.quaternion.identity();
    return body;
  }

  /** Detach + launch: shared by bullets, the ambient drop and debug. */
  function detachAndDrop(
    nut: PalmNutInstance,
    vx: number,
    vy: number,
    vz: number
  ): boolean {
    if (!palms.setNutAlive(nut.id, false)) return false;
    const body = spawnBody(nut, vx, vy, vz);
    if (!body) {
      // pool exhausted — the nut just vanishes from the tree (rare);
      // it will still regrow on schedule
      return true;
    }
    regrowQueue.push({
      id: nut.id,
      at: time + REGROW_MIN + rand() * (REGROW_MAX - REGROW_MIN),
    });
    dropped++;
    return true;
  }

  /* --------------------------- public API ---------------------------- */

  function hitTest(p: THREE.Vector3, pad = HIT_PAD): number {
    for (const nut of palms.nuts()) {
      if (!nut.alive) continue;
      const r = (nut.size * block) / 2 + pad;
      const dx = p.x - nut.x;
      const dy = p.y - nut.y;
      const dz = p.z - nut.z;
      if (dx * dx + dy * dy + dz * dz <= r * r) return nut.id;
    }
    return -1;
  }

  function knock(
    id: number,
    dirX: number,
    dirY: number,
    dirZ: number
  ): boolean {
    const nut = palms.nuts().find((n) => n.id === id);
    if (!nut || !nut.alive) return false;
    // the shot punches the nut mostly along its travel, with the last
    // bit flung outward from the trunk — reads like a solid strike
    const outX = nut.x - nut.tx;
    const outZ = nut.z - nut.tz;
    const outLen = Math.hypot(outX, outZ) || 1;
    const vx = dirX * 150 + (outX / outLen) * (30 + rand() * 40);
    const vy = dirY * 90 - 30 - rand() * 30;
    const vz = dirZ * 150 + (outZ / outLen) * (30 + rand() * 40);
    return detachAndDrop(nut, vx, vy, vz);
  }

  function dropNear(): boolean {
    const alive = palms.nuts().filter((n) => n.alive);
    if (!alive.length) return false;
    // nearest tree to the last known player position, deterministic pick
    alive.sort(
      (a, b) =>
        (a.x - lastPX) * (a.x - lastPX) +
        (a.z - lastPZ) * (a.z - lastPZ) -
        ((b.x - lastPX) * (b.x - lastPX) + (b.z - lastPZ) * (b.z - lastPZ))
    );
    const nut = alive[0];
    const outX = nut.x - nut.tx;
    const outZ = nut.z - nut.tz;
    const outLen = Math.hypot(outX, outZ) || 1;
    return detachAndDrop(
      nut,
      (outX / outLen) * (20 + rand() * 30),
      -10,
      (outZ / outLen) * (20 + rand() * 30)
    );
  }

  /* --------------------------- world solidity ------------------------ */

  /** A body is a live physical obstacle unless it is despawning. */
  function bodySolid(body: NutBody): boolean {
    return body.mesh.visible && body.shrink === 0;
  }

  function collide(
    x: number,
    z: number,
    radius: number,
    feetY: number
  ): { x: number; z: number } | null {
    let px = x;
    let pz = z;
    let hit = false;
    for (const body of bodies) {
      if (!bodySolid(body)) continue;
      // ghost above the nut's top face — hop over it like a palm block
      if (feetY >= body.y + body.radius) continue;
      const minDist = radius + body.radius;
      const dx = px - body.x;
      const dz = pz - body.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minDist * minDist) continue;
      const d = Math.sqrt(d2);
      if (d > 1e-4) {
        px = body.x + (dx / d) * minDist;
        pz = body.z + (dz / d) * minDist;
      } else {
        // dead centre — shove along +x (any axis would do)
        px = body.x + minDist;
      }
      hit = true;
    }
    return hit ? { x: px, z: pz } : null;
  }

  function bodyHitTest(p: THREE.Vector3): number {
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (!bodySolid(body)) continue;
      const r = body.radius + BODY_HIT_PAD;
      const dx = p.x - body.x;
      const dy = p.y - body.y;
      const dz = p.z - body.z;
      if (dx * dx + dy * dy + dz * dz <= r * r) return i;
    }
    return -1;
  }

  function nudge(
    index: number,
    originX: number,
    originY: number,
    originZ: number
  ): boolean {
    const body = bodies[index];
    if (!body || !bodySolid(body)) return false;
    // launch away from the muzzle, mostly planar with a little hop
    const dx = body.x - originX;
    const dy = body.y - originY;
    const dz = body.z - originZ;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const kick = NUDGE_KICK + rand() * NUDGE_KICK_VAR;
    body.vx += ux * kick;
    body.vz += uz * kick;
    if (body.mode === 'rest' || body.mode === 'roll') {
      // knocked skipping — back into a roll with a fresh rest clock
      body.mode = 'roll';
      body.restT = 0;
      body.vy = Math.max(body.vy, NUDGE_HOP + rand() * NUDGE_HOP_VAR);
    } else if (body.mode === 'float') {
      // a floater skims across the surface from the shot
      body.vx += ux * 90;
      body.vz += uz * 90;
    } else {
      // in free flight: deflect along the shot, add the vertical bit
      body.vy += (dy / (len || 1)) * 60;
    }
    body.wy = (rand() - 0.5) * 9;
    body.wx = (rand() - 0.5) * 5;
    body.wz = (rand() - 0.5) * 5;
    return true;
  }

  /* --------------------------- physics ------------------------------- */

  let lastPX = 0;
  let lastPZ = 0;

  function update(dt: number, playerX: number, playerZ: number): void {
    time += dt;
    lastPX = playerX;
    lastPZ = playerZ;

    // ambient drop: a nearby tree sheds a nut every DROP_MIN..MAX
    dropTimer -= dt;
    if (dropTimer <= 0) {
      dropTimer = (lowSpec ? 2 : 1) * (DROP_MIN + rand() * (DROP_MAX - DROP_MIN));
      const candidates = palms
        .nuts()
        .filter(
          (n) =>
            n.alive &&
            (n.x - playerX) * (n.x - playerX) +
              (n.z - playerZ) * (n.z - playerZ) <
              DROP_TREE_RANGE * DROP_TREE_RANGE
        );
      if (candidates.length) {
        const nut = candidates[(rand() * candidates.length) | 0];
        const outX = nut.x - nut.tx;
        const outZ = nut.z - nut.tz;
        const outLen = Math.hypot(outX, outZ) || 1;
        detachAndDrop(
          nut,
          (outX / outLen) * (15 + rand() * 25),
          -10,
          (outZ / outLen) * (15 + rand() * 25)
        );
      }
    }

    // regrow queue — nuts reappear on their trees after a few minutes
    while (regrowQueue.length && regrowQueue[0].at <= time) {
      const job = regrowQueue.shift();
      if (job && palms.setNutAlive(job.id, true)) regrown++;
    }

    for (const body of bodies) {
      if (!body.mesh.visible) continue;

      if (body.shrink > 0) {
        // despawn shrink-out, then the pool slot recycles
        body.shrink += dt / DESPAWN_SHRINK;
        if (body.shrink >= 1) {
          body.mesh.visible = false;
          body.mesh.position.set(0, -1e6, 0);
          continue;
        }
        const s = 1 - body.shrink;
        body.mesh.scale.setScalar(Math.max(s * body.radius * 2, 1e-3));
        body.mesh.position.set(body.x, body.y, body.z);
        continue;
      }

      if (body.mode === 'fall') {
        // --- free flight: gravity + tumble + surface interactions ---
        body.vy -= NUT_GRAVITY * dt;
        body.x += body.vx * dt;
        body.y += body.vy * dt;
        body.z += body.vz * dt;

        // lateral hits against trunks / stair blocks: reflect
        const push = palms.collide(body.x, body.z, body.radius, body.y - body.radius);
        if (push) {
          const nx = push.x - body.x;
          const nz = push.z - body.z;
          body.x = push.x;
          body.z = push.z;
          const nLen = Math.hypot(nx, nz);
          if (nLen > 1e-4) {
            const ux = nx / nLen;
            const uz = nz / nLen;
            const vn = body.vx * ux + body.vz * uz;
            if (vn < 0) {
              body.vx -= (1 + WALL_RESTITUTION) * vn * ux;
              body.vz -= (1 + WALL_RESTITUTION) * vn * uz;
            }
          }
        }

        // what surface is under the body?
        const s = opts.surfaceAt(body.x, body.z);
        const palmTop = palms.supportAt(
          body.x,
          body.z,
          body.y - body.radius + 6
        );
        const solidY = palmTop !== null && palmTop > s.y ? palmTop : s.y;
        const onWaterHere = s.water && s.y > solidY;

        if (onWaterHere && body.y - body.radius <= s.y) {
          // WATER ENTRY: splash (page throws the real ripple ring) and
          // the buoyant body pops back up to a floating sit
          opts.onWaterEntry?.(
            body.x,
            body.z,
            Math.abs(body.vy) + Math.hypot(body.vx, body.vz)
          );
          body.mode = 'float';
          body.onWater = true;
          body.groundY = s.y;
          body.restT = 0;
          body.restMax = FLOAT_LIFE_MIN + rand() * (FLOAT_LIFE_MAX - FLOAT_LIFE_MIN);
          body.vy = 0;
          body.vx *= 0.3;
          body.vz *= 0.3;
        } else if (!onWaterHere && body.y - body.radius <= solidY) {
          // SOLID IMPACT: bounce with restitution + friction + spin kick
          body.y = solidY + body.radius;
          const impact = -body.vy;
          body.vy = impact > ROLL_SPEED ? impact * BOUNCE_RESTITUTION : 0;
          body.vx *= BOUNCE_FRICTION;
          body.vz *= BOUNCE_FRICTION;
          body.wx = (rand() - 0.5) * impact * 0.02;
          body.wz = (rand() - 0.5) * impact * 0.02;
          body.groundY = solidY;
          body.onWater = false;
          if (body.vy === 0) {
            body.mode = 'roll';
            body.restT = 0;
            body.restMax = REST_LIFE_MIN + rand() * (REST_LIFE_MAX - REST_LIFE_MIN);
          }
        }
      } else if (body.mode === 'roll') {
        // --- rolling on solid ground: friction decays the travel ---
        body.restT += dt;
        body.vy -= NUT_GRAVITY * dt;
        body.y += body.vy * dt;
        if (body.y - body.radius <= body.groundY) {
          body.y = body.groundY + body.radius;
          body.vy = 0;
        }
        const speed = Math.hypot(body.vx, body.vz);
        if (speed > 1e-3) {
          body.x += body.vx * dt;
          body.z += body.vz * dt;
          const drag = Math.exp(-ROLL_DRAG * dt);
          body.vx *= drag;
          body.vz *= drag;
        }
        // the pool shore can catch a rolling nut
        const s = opts.surfaceAt(body.x, body.z);
        const palmTop = palms.supportAt(body.x, body.z, body.y + 6);
        const solidY = palmTop !== null && palmTop > s.y ? palmTop : s.y;
        if (s.water && s.y > solidY) {
          body.mode = 'float';
          body.onWater = true;
          body.groundY = s.y;
          body.restT = 0;
          body.restMax =
            FLOAT_LIFE_MIN + rand() * (FLOAT_LIFE_MAX - FLOAT_LIFE_MIN);
        } else {
          body.groundY = solidY;
        }
        if (speed < REST_SPEED) {
          body.mode = 'rest';
          body.restT = 0;
        }
      } else if (body.mode === 'float') {
        // --- buoyant drift on the pool: swell bob + wind ---
        body.restT += dt;
        const swell = oasisSwell(body.x, body.z, time, opts.water.x, opts.water.z);
        body.y =
          body.groundY + body.radius * FLOAT_SIT + swell.y * 2.5;
        body.x += FLOAT_WIND.x * dt;
        body.z += FLOAT_WIND.z * dt;
        body.vx *= Math.exp(-2 * dt);
        body.vz *= Math.exp(-2 * dt);
      } else {
        // --- resting on solid ground: count down, then shrink away ---
        body.restT += dt;
      }

      // tumble integration — free flight uses the raw angular velocity,
      // rolling converts leftover travel into end-over-end spin
      if (body.mode === 'fall') {
        const wLen = Math.hypot(body.wx, body.wy, body.wz);
        if (wLen > 1e-4) {
          scratchV.set(body.wx / wLen, body.wy / wLen, body.wz / wLen);
          const dq = new THREE.Quaternion().setFromAxisAngle(
            scratchV,
            wLen * dt
          );
          body.quat.premultiply(dq);
        }
      } else if (body.mode === 'roll') {
        const speed = Math.hypot(body.vx, body.vz);
        if (speed > 1e-3) {
          // omega = v/r around the axis perpendicular to travel
          const ux = body.vz / speed;
          const uz = -body.vx / speed;
          scratchV.set(ux, 0, uz);
          const dq = new THREE.Quaternion().setFromAxisAngle(
            scratchV,
            (speed / body.radius) * dt
          );
          body.quat.premultiply(dq);
        }
      } else if (body.mode === 'float') {
        // floaters slowly settle flat-side down
        const dq = new THREE.Quaternion().setFromAxisAngle(
          scratchV.set(0, 1, 0),
          dt * 0.4
        );
        body.quat.premultiply(dq);
      }

      // supported-life expiry -> shrink phase
      if (
        (body.mode === 'rest' || body.mode === 'float' || body.mode === 'roll') &&
        body.restT >= body.restMax &&
        body.shrink === 0
      ) {
        body.shrink = 1e-4;
      }

      body.mesh.position.set(body.x, body.y, body.z);
      body.mesh.quaternion.copy(body.quat);
    }
  }

  function stats(): {
    hanging: number;
    falling: number;
    resting: number;
    floating: number;
    dropped: number;
    regrown: number;
  } {
    let falling = 0;
    let resting = 0;
    let floating = 0;
    for (const body of bodies) {
      if (!body.mesh.visible) continue;
      if (body.mode === 'fall') falling++;
      else if (body.mode === 'float') floating++;
      else resting++;
    }
    const hanging = palms.nuts().filter((n) => n.alive).length;
    return { hanging, falling, resting, floating, dropped, regrown };
  }

  function dispose(): void {
    for (const body of bodies) {
      body.mesh.removeFromParent();
    }
    unitNut.dispose();
    nutMaterial.map?.dispose();
    nutMaterial.dispose();
  }

  return { update, hitTest, collide, bodyHitTest, nudge, knock, dropNear, stats, dispose };
}
