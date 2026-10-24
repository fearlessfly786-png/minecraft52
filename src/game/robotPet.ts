/**
 * SPARK — RATFIRE's third pet: the expressive GROUND robot.
 *
 * Model: RobotExpressive.glb (three.js examples — Tomás Laulhé, CC0;
 * modifications by Don McCurdy) loaded from /models/gltf/RobotExpressive/.
 * The GLB ships 14 skinned clips; this pet installs the six the pet panel
 * advertises — Idle, Walking, Running, Jump, Punch, Death — and drives
 * them from a small state machine so it reads as a living companion:
 *
 *   - LOCOMOTION  the follow brain: formation slot behind the player,
 *                 walks when close, runs when left behind, idles on
 *                 arrival and turns to face you while parked.
 *   - JUMP        one-shot, fired when the PLAYER jumps (actionJump).
 *   - PUNCH       one-shot, fired while the PLAYER attacks (actionFire) —
 *                 internally rate-limited so holding F = a punch flurry.
 *   - DEATH       one-shot with clampWhenFinished — plays when the player
 *                 dies and holds the fallen pose until revive() (respawn).
 *
 * The robot sticks to the terrain through the same `heightAt` query the
 * other pets use (surfaceYAt from terrainChunks) and teleports into slot
 * if the player gets too far (respawn / jeep getaway).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applySparkCostume } from '@/game/sparkCostume';

const MODEL_URL = '/models/gltf/RobotExpressive/RobotExpressive.glb';

/** In-game height (world units) — the player stands 190 tall, so the
 *  robot reads as a compact 1.1-block companion that reaches your chest. */
const ROBOT_HEIGHT = 112;

/** Crossfade seconds between clips (the classic skinned-blend ramp). */
const FADE = 0.22;

/** Formation slot: this far behind the facing + this far to its right.
 *  The side offset also keeps the robot out of the chase camera's line. */
const FOLLOW_BACK = 120;
const FOLLOW_SIDE = 115;

/** Horizontal distance under which the robot considers itself parked. */
const ARRIVE_DIST = 26;
/** Clip switch: at/below this move speed it walks, above it runs. */
const WALK_MAX = 400;
/** Flat-out chase speed when the player (jeep) is getting away. */
const RUN_CAP = 760;
/** Beyond this distance the robot stops running and just teleports into
 *  slot (respawns, jeep getaways) — nobody wants a 30s catch-up story. */
const TELEPORT_DIST = 1500;

export interface RobotPetOptions {
  /** Low-end devices: no shadow casting. */
  lowSpec?: boolean;
  /** Terrain height query — the robot walks the same ground you do. */
  heightAt: (x: number, z: number) => number;
}

export interface RobotPet {
  /** Root group — already added to the scene you passed in. */
  group: THREE.Group;
  /** Drive one tick: follow the player + run the animation mixer. */
  update(
    dt: number,
    playerPos: THREE.Vector3,
    playerYaw: number
  ): void;
  /** One-shot Jump clip (player jumped). */
  playJump(): void;
  /** One-shot Punch clip (player attacked). Rate-limited while playing. */
  playPunch(): void;
  /** Death clip — plays once and HOLDS the fallen pose (player died). */
  playDeath(): void;
  /** Back on your feet after a death hold (player respawned). */
  revive(): void;
  /** Live state probe (debug surfaces + automated verification):
   *  which clip owns the pose, active one-shot, dead flag. */
  debug(): { clip: string; oneShot: string | null; dead: boolean };
  /** Build stats for debug surfaces. */
  stats: { animations: string[]; triangles: number };
  /** Free geometries, materials and textures. */
  dispose(): void;
}

type LocoClip = 'Idle' | 'Walking' | 'Running';
type OneShotClip = 'Jump' | 'Punch' | 'Death';

export function createRobotPet(
  scene: THREE.Scene,
  opts: RobotPetOptions
): Promise<RobotPet> {
  const loader = new GLTFLoader();
  return loader.loadAsync(MODEL_URL).then((gltf) => {
    const model = gltf.scene;

    // ---- scale to game size: measure, rescale, drop feet onto y=0 ----
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = ROBOT_HEIGHT / Math.max(0.0001, size.y);
    model.scale.setScalar(scale);
    box.setFromObject(model);
    model.position.y -= box.min.y; // feet exactly on the ground plane

    const root = new THREE.Group();
    root.name = 'robotPet';
    root.add(model);
    scene.add(root);

    // shadows: the robot casts like every other world prop (skipped on
    // low-spec devices to keep the fill rate happy)
    if (!opts.lowSpec) {
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.castShadow = true;
      });
    }

    // ---- the MAGMA VANGUARD costume: repaint + armour kit ----
    // Runs after scale/ground/shadow setup — the kit measures world part
    // boxes and Object3D.attach-es onto the animated bones, so every
    // plate rides the rig through walk/run/jump/punch/death.
    const costume = applySparkCostume(model, { lowSpec: opts.lowSpec });

    // ---- animation rig: looping locomotion + clamped one-shots ----
    const mixer = new THREE.AnimationMixer(model);
    const find = (name: string) => {
      const clip = gltf.animations.find((c) => c.name === name);
      if (!clip) throw new Error(`robotPet: missing clip "${name}"`);
      return clip;
    };
    const loco: Record<LocoClip, THREE.AnimationAction> = {
      Idle: mixer.clipAction(find('Idle')),
      Walking: mixer.clipAction(find('Walking')),
      Running: mixer.clipAction(find('Running')),
    };
    const shots: Record<OneShotClip, THREE.AnimationAction> = {
      Jump: mixer.clipAction(find('Jump')),
      Punch: mixer.clipAction(find('Punch')),
      Death: mixer.clipAction(find('Death')),
    };
    for (const action of [...Object.values(loco), ...Object.values(shots)]) {
      action.enabled = true;
    }
    // loops: smooth repeating locomotion
    for (const action of Object.values(loco)) {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
    // one-shots: play once and HOLD the final pose (Death stays fallen,
    // Jump lands and stands, Punch returns to guard)
    for (const action of Object.values(shots)) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }

    let current: THREE.AnimationAction = loco.Idle;
    current.play();
    /** Active one-shot clip name, or null while pure locomotion runs. */
    let oneShot: OneShotClip | null = null;
    let dead = false;
    /** While true a one-shot was just triggered — next mixer update
     *  applies the fade before the brain may fade back out. */
    let shotStarted = false;

    /** Crossfade the looping layer onto another locomotion clip. */
    function setLoco(name: LocoClip): void {
      const next = loco[name];
      if (next === current) return;
      next.reset().fadeIn(FADE).play();
      current.fadeOut(FADE);
      current = next;
    }

    /** Fire a one-shot: blends over the current pose, holds on end.
     *  (Dead-state gating lives in the playJump/playPunch/playDeath
     *  wrappers — playShot itself must stay unconditional so the Death
     *  clip can start while the dead flag is already raised.) */
    function playShot(name: OneShotClip): void {
      if (oneShot === name && !shotFinished(name)) return; // rate limit
      const action = shots[name];
      if (oneShot) {
        shots[oneShot].fadeOut(FADE * 0.6);
        shots[oneShot].stopFading();
      } else {
        current.fadeOut(FADE * 0.6);
      }
      action.reset().fadeIn(FADE * 0.6).play();
      oneShot = name;
      shotStarted = true;
    }

    /** Has the given one-shot already run past its clip length? Reads
     *  the action clock so re-triggers land right after the previous
     *  punch/jump finished instead of cutting it off mid-swing. */
    function shotFinished(name: OneShotClip): boolean {
      const action = shots[name];
      return action.time >= action.getClip().duration - 0.001;
    }

    mixer.addEventListener('finished', () => {
      // Death holds via clampWhenFinished; Jump/Punch hand back to the
      // locomotion layer on the very next update tick.
      if (oneShot && oneShot !== 'Death') {
        shotStarted = false;
      }
    });

    // ---- follow brain scratch ----
    const target = new THREE.Vector3();
    const toTarget = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    let yawSm = 0;

    function update(
      dt: number,
      playerPos: THREE.Vector3,
      playerYaw: number
    ): void {
      if (!root.visible) return;
      mixer.update(dt);

      // Death (or a just-triggered shot) freezes the brain — the clip
      // owns the pose; locomotion resumes on revive / shot handback.
      if (dead) return;
      if (oneShot) {
        if (shotStarted) {
          shotStarted = false; // the fade-in applied this frame
          return;
        }
        if (!shotFinished(oneShot)) return;
        // shot over: hand the pose back to locomotion next tick
        shots[oneShot].fadeOut(FADE * 0.8);
        oneShot = null;
      }

      // formation slot: behind the facing, off its right shoulder
      forward.set(Math.sin(playerYaw), 0, Math.cos(playerYaw));
      right.set(Math.cos(playerYaw), 0, -Math.sin(playerYaw));
      target
        .copy(playerPos)
        .addScaledVector(forward, -FOLLOW_BACK)
        .addScaledVector(right, FOLLOW_SIDE);

      const dx = target.x - root.position.x;
      const dz = target.z - root.position.z;
      const dist = Math.hypot(dx, dz);

      // teleport into slot when the gap is hopeless (respawn/jeep)
      if (
        root.position.distanceTo(playerPos) > TELEPORT_DIST ||
        !Number.isFinite(root.position.x)
      ) {
        root.position.set(target.x, 0, target.z);
      }

      // stick to the terrain
      root.position.y = opts.heightAt(root.position.x, root.position.z);

      if (dist > ARRIVE_DIST) {
        // chase speed: proportional near, capped far — reads as a walk
        // while you stroll and a flat-out run when left behind
        const cap = dist > 420 ? RUN_CAP : WALK_MAX + 60;
        const speed = Math.min(cap, dist * 2.6);
        const step = Math.min(speed * dt, dist);
        toTarget.set(dx, 0, dz).normalize();
        root.position.x += toTarget.x * step;
        root.position.z += toTarget.z * step;
        // face the run direction (shortest-arc smoothing)
        const desired = Math.atan2(toTarget.x, toTarget.z);
        let delta = desired - yawSm;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        yawSm += delta * Math.min(1, 10 * dt);
        root.rotation.y = yawSm;
        setLoco(speed > WALK_MAX ? 'Running' : 'Walking');
      } else {
        // parked: face the player like a good companion
        const desired = Math.atan2(
          playerPos.x - root.position.x,
          playerPos.z - root.position.z
        );
        let delta = desired - yawSm;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        yawSm += delta * Math.min(1, 6 * dt);
        root.rotation.y = yawSm;
        setLoco('Idle');
      }
    }

    function playJump(): void {
      if (root.visible && !dead) playShot('Jump');
    }
    function playPunch(): void {
      if (root.visible && !dead) playShot('Punch');
    }
    function playDeath(): void {
      if (dead) return;
      dead = true;
      playShot('Death');
    }
    function revive(): void {
      if (!dead) return;
      dead = false;
      shots.Death.fadeOut(FADE);
      current.reset().fadeIn(FADE).play();
      oneShot = null;
    }

    function debug(): {
      clip: string;
      oneShot: string | null;
      dead: boolean;
    } {
      const locoName =
        (Object.entries(loco).find(([, a]) => a === current)?.[0] as
          | LocoClip
          | undefined) ?? 'Idle';
      return { clip: oneShot ?? locoName, oneShot, dead };
    }

    // ---- stats + teardown ----
    let triangles = 0;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const g = m.geometry as THREE.BufferGeometry;
        triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
      }
    });

    function dispose(): void {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      costume.dispose();
      scene.remove(root);
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) mat.dispose();
        }
      });
    }

    return {
      group: root,
      update,
      playJump,
      playPunch,
      playDeath,
      revive,
      debug,
      stats: {
        animations: gltf.animations.map((c) => c.name),
        triangles: Math.round(triangles),
      },
      dispose,
    };
  });
}
