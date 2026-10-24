/* ==========================================================================
 * NASCAR STOCK CAR — the player's second drivable vehicle (GLB upload).
 * ("[FREE] Nascar Hyperest [Black]" by Hyperest Studios, Sketchfab,
 *  CC-BY-4.0 — streamed from /models/nascar-black.glb)
 *
 * WHAT THIS IS
 *   A full drivable car that mirrors the jeep prop's interface 1:1 so the
 *   page can drive either vehicle through the SAME arcade controller:
 *   place / collide / updateDrive / updateFx / smokeBurst / setSurface /
 *   setOverheat / vfxStats / stats / suspension / dispose.
 *
 * MODEL PIPELINE (the upload is a Sketchfab export: 789 tiny meshes on
 * 1618 nodes — 789 draw calls would melt a software rasteriser, so the
 * loader REBUILDS the car into ~12 draw calls):
 *   1. find the named rig nodes (front_left_759, front_right_725,
 *      backwheels_main_824 + 4 speedometer needles) and the shared material
 *   2. auto-ORIENT: front axle vs rear axle world positions give the true
 *      forward axis -> the model is yawed so the car faces +Z (game convention)
 *   3. auto-SCALE to ~5.4 m (540u) and ground-offset so the tyres kiss y=0
 *   4. MERGE: every static mesh -> ONE body draw call; each wheel rig's
 *      meshes merge INTO its own node (wheels stay animatable); the needle
 *      meshes stay unmerged so the dash can sweep
 *   5. WHEELS ROLL via the model's own baked "drive" animation, split into
 *      two auto-calibrated subclips: a wheels-only clip whose timeScale is
 *      driven by ground speed (negative in reverse) and a dash clip whose
 *      timeScale tracks speed/maxSpeed — the speedometer needles sweep with
 *      actual velocity, exactly like the original animation intends
 *   6. STEERING: the two front wheel nodes are re-parented under pivot
 *      groups; the pivots yaw with the smoothed steer input (visible front-
 *      wheel lock) while the clip keeps them rolling
 *
 * DRIVING (arcade model — same family as the jeep, tuned for a stock car):
 *   analog-eased throttle/steer, speed-sensitive steering authority with
 *   high-speed fade, Space handbrake, terrain-following sprung suspension,
 *   squat/dive/lean, tyre smoke + skid marks on every sliding wheel.
 *
 * THE DRIFT (the request): brake + steer at speed = a SMOOTH power slide
 *   built as a REAL pivot, not a side-slide. The velocity vector is
 *   inertial — it keeps pointing where the car is GOING while the body
 *   yaws underneath it. Grip is what bends the velocity toward the nose:
 *   cruising, hard grip (velocity follows the body, no slide); handbrake
 *   + steer at speed, the nose pivots in while the tail sweeps around it
 *   (slip angle grows continuously, ~3x the front's swing), then bleeds
 *   away smoothly. Holding throttle keeps the slide alive (power
 *   oversteer), counter-steer tames it, sliding tyres scrub speed.
 *
 * COLLISION:
 *   - collide(): player capsule push-out of the oriented bounding box
 *   - setObstacles(): vehicle-vs-vehicle bumps — the drive step resolves
 *     the car out of each obstacle OBB, scrubs the closing speed and adds
 *     a small lateral bounce (the page feeds the parked jeep in)
 *
 * FLEET MODE: the SAME factory builds additional rides from any GLB via
 *   opts.modelUrl (the Hot Wheels Acceleracers uploads). Those models have
 *   no named rig and no baked clips, so buildGenericModel() auto-orients
 *   (longest horizontal axis -> +Z, the named steering wheel picks the
 *   front), auto-scales to the stock-car footprint and GEOMETRICALLY
 *   clusters low side meshes into up to four wheel pivots that roll with
 *   ground speed (fronts steer). Controls stay byte-identical.
 * ==========================================================================*/

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { JeepDriveInput, JeepDriveState } from './jeepProp';
import { applyCarShine } from './carEnv';
import {
  resolveVehicleFootpath,
  updateFootpathSparks,
} from './vehicleFootpath';
import {
  emitVehicleSmoke,
  liveVehicleSmoke,
  updateVehicleSmoke,
} from './vehicleSmoke';

const MODEL_URL = '/models/nascar-black.glb';

/* ------------------------------ dimensions ------------------------------- */
const TARGET_LEN = 540; // ~5.4 m stock car (game: 100u per metre)
// collision footprint (scaled model: ~2.1 m wide, ~5.6 m long incl. splitter)
const COLLIDE_HW = 108;
const COLLIDE_HL = 288;
/** Circle radius standing in for the car during obstacle bumps. */
const BUMP_R = 165;

/* ------------------------- driving tuning (stock car) --------------------- */
const MAX_FWD = 2800; // u/s — HUD reads speed*0.09 km/h => ~252 km/h top
const MAX_REV = 480;
const ACCEL = 1850; // u/s² full throttle — a V8 punches
const REV_ACCEL = 340;
const BRAKE_DECEL = 1900; // Space handbrake straight-line — race pads
const BRAKE_DRIFT = 460; // handbrake mid-drift: rear locked, car keeps rolling
const DRAG_K = 0.5; // proportional drag while coasting
const ROLL_RESIST = 45; // constant coast-down
const STEER_RATE = 1.9; // rad/s at full lock (before high-speed fade)
const STEER_SPEED_REF = 240; // u/s at which steering gains full authority
const STEER_ATTEN = 1000; // u/s — beyond this the lock progressively fades
const WHEEL_STEER_MAX = 0.5; // rad — visual front-wheel angle
/* suspension (stiffer than the jeep — a race car rides flat) */
const SUS_STIFFNESS = 175; // spring rate 1/s²
const SUS_DAMPING = 30; // damper 1/s — overdamped, no bounce
const WHEEL_TRAVEL = 3; // max wheel stroke vs the sprung body (u)
/* drift — inertial pivot model. `lateral` is the tail-out slide velocity
 *  (car frame, + = toward the car's right); grip bleeds it away, the
 *  body yaw keeps feeding it in while the velocity stays put. */
const GRIP = 9.0; // lateral velocity decay 1/s (race tyres — grippy)
const GRIP_DRIFT = 2.4; // sustained slide — the car hangs sideways
const GRIP_HANDBRAKE = 1.5; // Space loosens the rear -> the drift trigger
const DRIFT_MIN = 55; // u/s of slide before marks + smoke kick in
const DRIFT_MIN_EXIT = 30; // slide must die below this to regain grip
const DRIFT_SCRUB = 0.28; // sliding tyres scrub off forward speed
const SLIP_MAX = 0.82; // max slide = 0.82 x forward speed (~39° slip)
const SLIP_BRAKE = 240; // u/s — braking harder than this locks the fronts
const SLIP_LAUNCH = 170; // u/s — full-throttle launch spins the rears
/** THE REQUEST: brake + steer at speed swings the rear ~3x the front's
 *  turn rate. The boost eases in/out (DRIFT_YAW_EASE) so the slide feels
 *  silky, never snappy — and because the velocity is inertial the tail
 *  sweeps around the nose instead of the car skating sideways. */
const DRIFT_YAW_BOOST = 2.3;
const DRIFT_YAW_EASE = 2.8; // 1/s blend rate (≈0.36 s to full lock)
const DRIFT_SPEED_MIN = 240; // u/s — need real speed before the rear steps out

/* -------------------------------- types ---------------------------------- */

interface NascarObstacle {
  x: number;
  z: number;
  rotY: number;
  hw: number;
  hl: number;
  /** The obstacle's own ground speed (u/s) along its heading — traffic
   *  cars report their AI speed; the parked jeep is 0. */
  speed?: number;
  /** Called when the player RAMS this obstacle: (dirX, dirZ) is the unit
   *  impact direction (the player's travel direction), vel the shove
   *  speed (u/s) the other car should slide with. */
  onPush?: (dirX: number, dirZ: number, vel: number) => void;
}

export interface NascarCarHandle {
  /** Root group — already added to the scene. */
  group: THREE.Group;
  /** True once the GLB finished building (placeholder swapped out). */
  ready(): boolean;
  /** Park the car at a world position (y = ground height under it). */
  place(x: number, z: number, y: number, rotationY?: number): void;
  /**
   * Push a circle (player capsule footprint) out of the car's oriented
   * bounding box in the XZ plane. Returns the corrected world position, or
   * null when the point is clear of the car.
   */
  collide(
    px: number,
    pz: number,
    radius: number
  ): { x: number; z: number } | null;
  /**
   * Obstacle OBBs (e.g. the parked jeep) the DRIVE step must bump against.
   * Cheap — safe to call every frame with a fresh array.
   */
  setObstacles(list: NascarObstacle[]): void;
  /**
   * Advance the vehicle for one frame: physics, terrain follow, wheels,
   * drift VFX and obstacle bumps. Call ONLY while driven.
   */
  updateDrive(dt: number, input: JeepDriveInput): JeepDriveState;
  /**
   * Advance the pooled effects between drive ticks (call every frame;
   * cheap no-op when nothing is alive): tyre smoke keeps fading and skid
   * marks keep wearing away.
   */
  updateFx(dt: number): void;
  /** Short burst of start-up puffs (engine ignition on enter). */
  smokeBurst(count: number): void;
  /** True while the engine is running (between enter/exit). */
  isDriving(): boolean;
  /** Interface parity with the jeep (tyre VFX are never biome-gated). */
  setSurface(desert: boolean): void;
  /** Interface parity with the jeep (no hood steam on this car). */
  setOverheat(level: number): void;
  /** Live VFX counts for tests/debug. */
  vfxStats(): { steam: number; dust: number; skids: number };
  /** Build stats: draw calls + triangles of the assembled model. */
  stats(): { shapes: number; meshes: number; triangles: number };
  /** Suspension debug snapshot: sprung-body spring state + wheel strokes. */
  suspension(): {
    bodyY: number;
    heaveVel: number;
    pitch: number;
    roll: number;
    strokes: number[];
  };
  /** Free every geometry/material/texture and remove it from the scene. */
  dispose(): void;
}

/* ================================ module ================================== */

export function createNascarCar(
  scene: THREE.Scene,
  opts: {
    lowSpec?: boolean;
    heightAt?: (x: number, z: number) => number;
    /** Lazy renderer getter — enables the light paint shine once the
     *  GLB builds (the renderer exists by then even though this factory
     *  runs earlier in the page's synchronous init). */
    getRenderer?: () => THREE.WebGLRenderer | null;
    /** Alternate GLB for fleet rides — driven by the exact same
     *  controller; the generic builder handles un-rigged models. */
    modelUrl?: string;
  } = {}
): NascarCarHandle {
  const heightAt = opts.heightAt ?? ((x: number, z: number) => 0);
  /* per-instance running gear — measured from whichever model builds here
   * (was module-level; the Hot Wheels fleet made that cross-talk) */
  /** Rolling radius used for the wheel-spin rate — re-measured from the
   *  scaled wheel clusters once the model builds (fallback below). */
  let wheelRadius = 52;
  let TRACK_X = 88; // wheel center |x|
  let AXLE_F = 172; // front wheel center z
  let AXLE_R = -172; // rear wheel center z
  const group = new THREE.Group();
  scene.add(group);

  /* --------------------------- placeholder body --------------------------- */
  // A boxy black coupe so the car exists (collidable + visible) during the
  // ~1-2 s the GLB takes to stream + build. Swapped out on load.
  const placeholder = new THREE.Group();
  {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0c0d10,
      roughness: 0.42,
      metalness: 0.55,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c20,
      roughness: 0.9,
    });
    const mk = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material
    ): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      return m;
    };
    placeholder.add(mk(200, 74, 500, 0, 96, 0, bodyMat));
    placeholder.add(mk(176, 62, 220, 0, 164, -20, bodyMat));
    placeholder.add(mk(210, 16, 60, 0, 210, -235, bodyMat)); // spoiler
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const w = mk(26, 52, 52, sx * 92, 26, sz * 168, trimMat);
      placeholder.add(w);
    }
  }
  group.add(placeholder);

  /* ------------------------------ tyre smoke ------------------------------ */
  // ULTRA-REALISTIC SMOKE: one shared pooled billboard mesh serves every
  // vehicle (see vehicleSmoke.ts). This car emits burnout strain smoke
  // (throttle held while blocked — the cloud BUILDS slowly), drift tyre
  // smoke (rate ∝ slip) and ignition puffs through the shared pool.
  const TINT_TYRE: [number, number, number] = [0.87, 0.87, 0.9];
  function spawnSmoke(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    life: number,
    power = 0.45
  ): void {
    emitVehicleSmoke(scene, {
      x,
      y,
      z,
      vx,
      vy,
      vz,
      size,
      life,
      power,
      tint: TINT_TYRE,
      grow: 2.2,
    });
  }
  /** Ignition puffs rise from the hood in CAR-LOCAL space. */
  function smokeBurst(count: number): void {
    const cos = Math.cos(group.rotation.y);
    const sin = Math.sin(group.rotation.y);
    for (let i = 0; i < count; i++) {
      const lx = (Math.random() - 0.5) * 90;
      const lz = 150 + Math.random() * 90;
      const wx = group.position.x + lx * cos + lz * sin;
      const wz = group.position.z - lx * sin + lz * cos;
      spawnSmoke(
        wx,
        group.position.y + 120 + Math.random() * 30,
        wz,
        (Math.random() - 0.5) * 20,
        26 + Math.random() * 22,
        (Math.random() - 0.5) * 20,
        40 + Math.random() * 30,
        0.9 + Math.random() * 0.5,
        0.3
      );
    }
  }

  /* ------------------------------ skid marks ------------------------------ */
  // Pooled dark quads laid on the ground under each sliding wheel, fading
  // out over their life. Two ribbons per wheel would need tracking; a
  // segment-per-drop pool keeps it simple and just as readable at speed.
  const SKID_N = 72;
  const SKID_LIFE = 7; // seconds a mark lingers
  const SKID_SEG = 46; // world units between drops
  const skidGeo = new THREE.PlaneGeometry(1, 1);
  skidGeo.rotateX(-Math.PI / 2);
  const skidMat = new THREE.MeshBasicMaterial({
    color: 0x0a0a0c,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  interface Skid {
    mesh: THREE.Mesh;
    life: number;
  }
  const skids: Skid[] = [];
  for (let i = 0; i < SKID_N; i++) {
    // per-skid material clone: each mark fades on its own clock
    const mesh = new THREE.Mesh(skidGeo, skidMat.clone());
    mesh.visible = false;
    scene.add(mesh); // ground quads are world-space
    skids.push({ mesh, life: 0 });
  }
  let skidCursor = 0;
  function dropSkid(
    x: number,
    z: number,
    y: number,
    dirX: number,
    dirZ: number,
    slip: number
  ): void {
    const s = skids[skidCursor];
    skidCursor = (skidCursor + 1) % SKID_N;
    s.mesh.visible = true;
    s.mesh.position.set(x, y + 1.2, z);
    s.mesh.rotation.y = Math.atan2(dirX, dirZ);
    s.mesh.scale.set(26 + slip * 10, 1, SKID_SEG * 1.15);
    s.life = SKID_LIFE;
    (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.34 + slip * 0.2;
  }

  /* ------------------------------ drive state ----------------------------- */
  let ready = false;
  let driving = false;
  let speed = 0;
  let lateral = 0;
  let drifting = false;
  let steerSmooth = 0;
  let throttleSmooth = 0;
  let steerVis = 0;
  let driftBoost = 1; // eased rear-swing multiplier (1 = grip, 3 = full drift)
  let bodyY = 0;
  let bodyYVel = 0;
  let bodyPitch = 0;
  let bodyPitchVel = 0;
  let bodyRoll = 0;
  let bodyRollVel = 0;
  let obstacles: NascarObstacle[] = [];

  /* ------------------------------- the model ------------------------------ */
  let carMeshes = 0;
  let carTriangles = 0;
  const wheelSpin: { mixer: THREE.AnimationMixer; action: THREE.AnimationAction; rate: number }[] =
    [];
  let dashMixer: THREE.AnimationMixer | null = null;
  /** Front-wheel steering rig: each entry steers about the CAR's up axis
   *  expressed in the wheel node's PARENT frame — applied as a pre-rotation
   *  on top of the baked roll animation (NO re-parenting, so the clip's
   *  authored frames stay exact and wheels can never flip into the body). */
  const steerWheels: {
    node: THREE.Object3D;
    axis: THREE.Vector3;
  }[] = [];
  /** Every wheel rig node + its rest quaternion (for place() resets). */
  const allWheels: { node: THREE.Object3D; restQ: THREE.Quaternion }[] = [];
  /** Fleet wheels: geometric pivots (no baked rig) — they roll by an
   *  absolute spin angle driven from ground speed; fronts also carry the
   *  steer yaw. Reset by place() via allWheels like the rig nodes. */
  const spinPivots: { node: THREE.Object3D; front: boolean }[] = [];
  let spinAccum = 0;
  const qSteerTmp = new THREE.Quaternion();

  /** Manual geometry concat shared by both builders (all glTF prims here
   *  share position/normal/uv + index). */
  function mergeGeos(
    geos: THREE.BufferGeometry[]
  ): THREE.BufferGeometry | null {
    if (geos.length === 0) return null;
    if (geos.length === 1) return geos[0];
    let vTotal = 0;
    let iTotal = 0;
    for (const g of geos) {
      vTotal += g.getAttribute('position').count;
      iTotal += g.getIndex()?.count ?? 0;
    }
    const out = new THREE.BufferGeometry();
    const pos = new Float32Array(vTotal * 3);
    const nor = new Float32Array(vTotal * 3);
    const uv = new Float32Array(vTotal * 2);
    const idx = new Uint32Array(iTotal);
    let vo = 0;
    let io = 0;
    for (const g of geos) {
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      const n = g.getAttribute('normal') as THREE.BufferAttribute | null;
      const t = g.getAttribute('uv') as THREE.BufferAttribute | null;
      pos.set(p.array as Float32Array, vo * 3);
      if (n) nor.set(n.array as Float32Array, vo * 3);
      if (t) uv.set(t.array as Float32Array, vo * 2);
      const ix = g.getIndex();
      if (ix) {
        const arr = ix.array as ArrayLike<number>;
        for (let k = 0; k < ix.count; k++) idx[io + k] = arr[k] + vo;
        io += ix.count;
      } else {
        for (let k = 0; k < p.count; k++) idx[io + k] = k + vo;
        io += p.count;
      }
      vo += p.count;
    }
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  function buildModel(
    gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }
  ): void {
    const model = gltf.scene;
    model.updateMatrixWorld(true);

    // --- find the rig nodes (tolerant name match) ---
    let frontL: THREE.Object3D | null = null;
    let frontR: THREE.Object3D | null = null;
    let backAxle: THREE.Object3D | null = null;
    const needleNodes: THREE.Object3D[] = [];
    model.traverse((o) => {
      const n = o.name || '';
      if (!frontL && n.startsWith('front_left')) frontL = o;
      if (!frontR && n.startsWith('front_right')) frontR = o;
      if (!backAxle && n.startsWith('backwheels_main')) backAxle = o;
      if (n.startsWith('speedometer') && n.includes('_6')) needleNodes.push(o);
    });
    if (!frontL || !frontR || !backAxle) {
      // no named rig — the generic fleet builder takes over (Hot Wheels)
      buildGenericModel(model);
      return;
    }

    // --- auto-orient: forward = front axle - rear axle (XZ) ---
    const pFL = new THREE.Vector3();
    const pFR = new THREE.Vector3();
    const pBW = new THREE.Vector3();
    (frontL as THREE.Object3D).getWorldPosition(pFL);
    (frontR as THREE.Object3D).getWorldPosition(pFR);
    (backAxle as THREE.Object3D).getWorldPosition(pBW);
    const fwd = new THREE.Vector3(
      (pFL.x + pFR.x) / 2 - pBW.x,
      0,
      (pFL.z + pFR.z) / 2 - pBW.z
    );
    if (fwd.lengthSq() > 1e-6) {
      model.rotation.y = -Math.atan2(fwd.x, fwd.z); // forward -> +Z
    }
    model.updateMatrixWorld(true);

    // --- auto-scale + ground-offset ---
    const bbox = new THREE.Box3().setFromObject(model);
    const size = bbox.getSize(new THREE.Vector3());
    const s = TARGET_LEN / Math.max(1, size.z);
    model.scale.setScalar(s);
    model.updateMatrixWorld(true);
    const bbox2 = new THREE.Box3().setFromObject(model);
    const ctr = bbox2.getCenter(new THREE.Vector3());
    model.position.x -= ctr.x;
    model.position.z -= ctr.z;
    model.position.y -= bbox2.min.y;
    model.updateMatrixWorld(true);

    // wheel layout (group-space, used by the physics pads) + pivot anchors
    const wheelWorlds = [pFL.set(0, 0, 0), pFR.set(0, 0, 0), pBW.set(0, 0, 0)];
    (frontL as THREE.Object3D).getWorldPosition(wheelWorlds[0]);
    (frontR as THREE.Object3D).getWorldPosition(wheelWorlds[1]);
    (backAxle as THREE.Object3D).getWorldPosition(wheelWorlds[2]);
    // the model is standalone, so its world == the future group-space coords
    AXLE_F = (wheelWorlds[0].z + wheelWorlds[1].z) / 2;
    AXLE_R = wheelWorlds[2].z;
    TRACK_X = (Math.abs(wheelWorlds[0].x) + Math.abs(wheelWorlds[1].x)) / 2;

    // --- merge: body bucket + per-wheel buckets (draw-call diet) ---
    const mat = (() => {
      let found: THREE.Material | null = null;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!found && m.isMesh && m.material) {
          found = m.material as THREE.Material;
        }
      });
      return found;
    })();
    if (!mat) return;
    // light showroom sheen on the stock-car paint (soft env reflection)
    applyCarShine(mat, opts.getRenderer ? opts.getRenderer() : null, 0.45);
    // the livery texture stays EXACTLY as shipped in the GLB — no re-paint

    const wheelRoots = [frontL as THREE.Object3D, frontR as THREE.Object3D, backAxle as THREE.Object3D];
    const under = (o: THREE.Object3D, root: THREE.Object3D): boolean => {
      let p: THREE.Object3D | null = o;
      while (p) {
        if (p === root) return true;
        p = p.parent;
      }
      return false;
    };
    const isUnderNeedles = (o: THREE.Object3D): boolean =>
      needleNodes.some((r) => under(o, r));

    // classify every mesh: wheel-descendants vs needle-descendants vs body
    const bodyGeos: THREE.BufferGeometry[] = [];
    const wheelGeos: THREE.BufferGeometry[][] = [[], [], []];
    const originalMeshes: THREE.Mesh[] = [];
    const mInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const rootInvs = wheelRoots.map((r) =>
      new THREE.Matrix4().copy(r.matrixWorld).invert()
    );
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      originalMeshes.push(m);
      const tris =
        (m.geometry.getIndex()?.count ?? m.geometry.getAttribute('position').count) / 3;
      if (isUnderNeedles(m)) return; // needles stay live (unmerged)
      for (let i = 0; i < wheelRoots.length; i++) {
        if (under(m, wheelRoots[i])) {
          // wheel geometry lives in the WHEEL NODE's space so the merged
          // mesh can ride the rig node (rolling + steering keep working)
          const rel = new THREE.Matrix4().multiplyMatrices(rootInvs[i], m.matrixWorld);
          wheelGeos[i].push(m.geometry.clone().applyMatrix4(rel));
          carTriangles += tris;
          return;
        }
      }
      // static body: mesh world -> model space
      const rel = new THREE.Matrix4().multiplyMatrices(mInv, m.matrixWorld);
      bodyGeos.push(m.geometry.clone().applyMatrix4(rel));
      carTriangles += tris;
    });

    // body: one merged mesh under the model root
    const bodyGeo = mergeGeos(bodyGeos);
    if (bodyGeo) {
      const bodyMesh = new THREE.Mesh(bodyGeo, mat);
      model.add(bodyMesh); // geometry already in model space; identity mesh
      carMeshes++;
    }
    // wheels: merge INTO their rig node (keeps rolling + steering live)
    for (let i = 0; i < wheelRoots.length; i++) {
      const geo = mergeGeos(wheelGeos[i]);
      if (!geo) continue;
      const wMesh = new THREE.Mesh(geo, mat);
      wheelRoots[i].add(wMesh); // geometry already in wheel-node space
      carMeshes++;
    }
    // drop the original fragmented meshes (replaced by the merged ones)
    for (const m of originalMeshes) {
      if (isUnderNeedles(m)) continue; // needles keep their own meshes
      m.parent?.remove(m);
      m.geometry.dispose();
    }
    model.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });

    // --- steering rig: measure the car-up axis in each front wheel's
    // PARENT frame, then leave the hierarchy untouched (the baked
    // animation keeps full control of the node orientations) ---
    group.add(model); // real car in (inherits the placed group pose)
    group.updateMatrixWorld(true);
    for (const node of [frontL as THREE.Object3D, frontR as THREE.Object3D]) {
      const parentQ = new THREE.Quaternion();
      (node.parent as THREE.Object3D).getWorldQuaternion(parentQ);
      const axis = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(parentQ.invert())
        .normalize();
      steerWheels.push({ node, axis });
    }
    for (const node of [
      frontL as THREE.Object3D,
      frontR as THREE.Object3D,
      backAxle as THREE.Object3D,
    ]) {
      allWheels.push({ node, restQ: node.quaternion.clone() });
    }

    group.remove(placeholder);

    // --- animation: split the baked drive clip into wheels + dash ---
    const clip = gltf.animations[0];
    let wheelTracks: THREE.KeyframeTrack[] = [];
    if (clip) {
      const trackOf = (re: RegExp): THREE.KeyframeTrack[] =>
        clip.tracks.filter((t) => re.test(t.name) && t.name.endsWith('.quaternion'));
      wheelTracks = [
        ...trackOf(/front_left/),
        ...trackOf(/front_right/),
        ...trackOf(/backwheels_main/),
      ];
      const dashTracks = trackOf(/speedometer/);
      if (wheelTracks.length > 0) {
        const wClip = new THREE.AnimationClip('nascar_wheels', clip.duration, wheelTracks);
        const mixer = new THREE.AnimationMixer(group);
        const action = mixer.clipAction(wClip);
        action.play();
        // calibrate: radians the rear wheel sweeps per clip loop — unwrap
        // the X-axis spin angle across the keyframes (robust to loops that
        // start and end on the same pose)
        const tr = trackOf(/backwheels_main/)[0];
        let rate = 3.14; // fallback: ~half turn per loop
        if (tr) {
          const v = tr.values as Float32Array; // quaternions, stride 4
          const n = v.length / 4;
          const ang = (i: number): number =>
            2 * Math.atan2(v[i * 4], v[i * 4 + 3]);
          let acc = 0;
          let prev = ang(0);
          for (let i = 1; i < n; i++) {
            let a = ang(i);
            while (a - prev > Math.PI) a -= Math.PI * 2;
            while (a - prev < -Math.PI) a += Math.PI * 2;
            acc += a - prev;
            prev = a;
          }
          const swing = Math.abs(acc);
          rate = Math.max(0.4, swing / Math.max(0.05, clip.duration));
        }
        // rolling radius from the actual scaled rear-wheel bbox
        const wb = new THREE.Box3().setFromObject(backAxle as THREE.Object3D);
        wheelRadius = Math.max(24, wb.getSize(new THREE.Vector3()).y / 2);
        wheelSpin.push({ mixer, action, rate });
      }
      if (dashTracks.length > 0) {
        const dClip = new THREE.AnimationClip('nascar_dash', clip.duration, dashTracks);
        dashMixer = new THREE.AnimationMixer(group);
        dashMixer.clipAction(dClip).play();
      }
    }
    if (wheelTracks.length === 0) {
      // NAMED RIG BUT NO BAKED WHEEL CLIP (the Hot Wheels fleet ships the
      // NASCAR's front_left/front_right/backwheels_main node names with an
      // EMPTY animation list). Without a mixer nothing rewrites the wheel
      // quaternions: the old steer premultiply would compound every frame
      // (fronts tumble instead of holding a steer angle) and nothing would
      // ever roll. So wrap each rig node in a geometric pivot — X carries
      // the ground-speed roll, fronts also carry the steer yaw ('YXZ'
      // steers about up, spins about the steered axle). The pivot sits at
      // the rig node's own origin (hub/axle line) and attach() keeps the
      // rest pose pixel-exact; place() resets both via allWheels.
      const wb = new THREE.Box3().setFromObject(backAxle as THREE.Object3D);
      wheelRadius = THREE.MathUtils.clamp(
        wb.getSize(new THREE.Vector3()).y / 2,
        18,
        150
      );
      const rigs: [THREE.Object3D, boolean][] = [
        [frontL as THREE.Object3D, true],
        [frontR as THREE.Object3D, true],
        [backAxle as THREE.Object3D, false],
      ];
      for (const [node, front] of rigs) {
        const pivot = new THREE.Group();
        pivot.rotation.order = 'YXZ';
        pivot.position.copy(node.position); // pivot ON the hub / axle origin
        (node.parent as THREE.Object3D).add(pivot);
        pivot.attach(node); // node keeps its world transform inside
        spinPivots.push({ node: pivot, front });
        allWheels.push({ node: pivot, restQ: pivot.quaternion.clone() });
      }
    }
    ready = true;
  }

  /* --------------------- generic builder (fleet GLBs) ---------------------- */
  // Un-rigged uploads (Hot Wheels Acceleracers): no named wheel nodes, no
  // baked clips. Auto-orients (longest horizontal axis -> length, the named
  // interior steering wheel picks the front), auto-scales to the stock-car
  // footprint, then clusters compact low side meshes into up to four wheel
  // pivots (front/rear × left/right by bbox centre). Pivots roll with
  // ground speed; front pivots also carry the steer yaw. Anything the
  // heuristics cannot confidently find still drives — on default axles
  // with static wheels, never broken.
  function buildGenericModel(model: THREE.Group): void {
    model.updateMatrixWorld(true);

    // --- auto-orient: the longest horizontal axis becomes the length ---
    let bbox = new THREE.Box3().setFromObject(model);
    let size = bbox.getSize(new THREE.Vector3());
    if (size.x > size.z) model.rotation.y = Math.PI / 2;
    model.updateMatrixWorld(true);

    // --- front sign: the named interior steering wheel sits toward the nose
    let steerWorld: THREE.Vector3 | null = null;
    model.traverse((o) => {
      if (!steerWorld && /steer/i.test(o.name) && /wheel/i.test(o.name)) {
        steerWorld = o.getWorldPosition(new THREE.Vector3());
      }
    });
    if (steerWorld) {
      const c = new THREE.Box3()
        .setFromObject(model)
        .getCenter(new THREE.Vector3());
      if ((steerWorld as THREE.Vector3).z < c.z) model.rotation.y += Math.PI;
      model.updateMatrixWorld(true);
    }

    // --- auto-scale to the stock-car footprint + ground offset ---
    bbox = new THREE.Box3().setFromObject(model);
    size = bbox.getSize(new THREE.Vector3());
    const s = TARGET_LEN / Math.max(1, size.z);
    model.scale.setScalar(s);
    model.updateMatrixWorld(true);
    const bbox2 = new THREE.Box3().setFromObject(model);
    const ctr = bbox2.getCenter(new THREE.Vector3());
    model.position.x -= ctr.x;
    model.position.z -= ctr.z;
    model.position.y -= bbox2.min.y;
    model.updateMatrixWorld(true);

    // --- paint (first material found, exactly like the NASCAR path) ---
    let paint: THREE.Material | null = null;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!paint && m.isMesh && m.material) {
        paint = m.material as THREE.Material;
      }
    });
    if (!paint) return;
    applyCarShine(paint, opts.getRenderer ? opts.getRenderer() : null, 0.45);
    // livery textures stay exactly as shipped — no re-paint

    // --- geometric wheel candidates --------------------------------------
    // tyres: low, wheel-sized, compact ALONG the body, reaching outboard.
    // Skirts/splitters fail the length test, mirrors the height test.
    bbox = new THREE.Box3().setFromObject(model);
    size = bbox.getSize(new THREE.Vector3());
    const ground = bbox.min.y;
    const ccx = (bbox.min.x + bbox.max.x) / 2;
    const ccz = (bbox.min.z + bbox.max.z) / 2;
    interface WheelCand {
      mesh: THREE.Mesh;
      tris: number;
      x: number;
      y: number;
      z: number;
      r: number;
      front: boolean;
      right: boolean;
    }
    const cands: WheelCand[] = [];
    const cbox = new THREE.Box3();
    const cctr = new THREE.Vector3();
    const csize = new THREE.Vector3();
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      cbox.setFromObject(m);
      cbox.getCenter(cctr);
      cbox.getSize(csize);
      const low = cctr.y - ground < size.y * 0.3;
      const tall = csize.y < size.y * 0.45 && csize.y > size.y * 0.03;
      const short = csize.z < size.z * 0.18;
      const side =
        cbox.max.x - ccx > size.x * 0.3 || ccx - cbox.min.x > size.x * 0.3;
      if (low && tall && short && side) {
        cands.push({
          mesh: m,
          tris:
            (m.geometry.getIndex()?.count ??
              m.geometry.getAttribute('position').count) / 3,
          x: cctr.x,
          y: cctr.y,
          z: cctr.z,
          r: csize.y / 2,
          front: cctr.z > ccz,
          right: cctr.x >= ccx,
        });
      }
    });

    // quadrant buckets front/rear × left/right (a one-mesh axle lands on
    // one side by its centre — the X spin axis still runs through it)
    interface WheelCluster {
      front: boolean;
      right: boolean;
      parts: { geo: THREE.BufferGeometry; world: THREE.Matrix4; tris: number }[];
      x: number;
      y: number; // hub height (world)
      z: number;
      r: number;
      pivot: THREE.Group | null;
    }
    const quads = new Map<string, WheelCluster>();
    for (const c of cands) {
      const k = `${c.front ? 'f' : 'r'}${c.right ? 'r' : 'l'}`;
      let cl = quads.get(k);
      if (!cl) {
        cl = { front: c.front, right: c.right, parts: [], x: 0, y: 0, z: 0, r: 0, pivot: null };
        quads.set(k, cl);
      }
      cl.parts.push({ geo: c.mesh.geometry, world: c.mesh.matrixWorld, tris: c.tris });
      cl.x += c.x;
      cl.y += c.y;
      cl.z += c.z;
      cl.r += c.r;
    }
    const hasFront = [...quads.values()].some((c) => c.front);
    const hasRear = [...quads.values()].some((c) => !c.front);
    const okWheels = hasFront && hasRear && quads.size >= 2;

    // --- classify + merge -------------------------------------------------
    const mInv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const bodyGeos: THREE.BufferGeometry[] = [];
    const bodySources: THREE.Mesh[] = [];
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      bodySources.push(m);
      const tris =
        (m.geometry.getIndex()?.count ??
          m.geometry.getAttribute('position').count) / 3;
      if (okWheels) {
        for (const cl of quads.values()) {
          if (cl.parts.some((p) => p.geo === m.geometry)) return; // wheel mesh
        }
      }
      bodyGeos.push(
        m.geometry.clone().applyMatrix4(
          new THREE.Matrix4().multiplyMatrices(mInv, m.matrixWorld)
        )
      );
      carTriangles += tris;
    });

    // wheel pivots at the cluster centroids (model-space), geometry merged
    // into each pivot so rolling + steering ride the pivot transforms
    if (okWheels) {
      let radSum = 0;
      for (const cl of quads.values()) {
        const n = Math.max(1, cl.parts.length);
        // pivot origin at the HUB (world centroid incl. hub height) — the
        // X spin axis has to run through the axle, not the ground
        const local = new THREE.Vector3(cl.x / n, cl.y / n, cl.z / n)
          .applyMatrix4(mInv);
        const pivot = new THREE.Group();
        pivot.position.copy(local);
        pivot.rotation.order = 'YXZ';
        model.add(pivot);
        pivot.updateMatrixWorld(true);
        cl.pivot = pivot;
        const inv = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
        const geos = cl.parts.map((p) =>
          p.geo
            .clone()
            .applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, p.world))
        );
        const geo = mergeGeos(geos);
        if (geo) {
          const wMesh = new THREE.Mesh(geo, paint);
          pivot.add(wMesh);
          carMeshes++;
        }
        carTriangles += cl.parts.reduce((a, p) => a + p.tris, 0);
        radSum += cl.r / n;
        spinPivots.push({ node: pivot, front: cl.front });
        allWheels.push({ node: pivot, restQ: pivot.quaternion.clone() });
        if (cl.front) AXLE_F = local.z;
        else AXLE_R = local.z;
        if (Math.abs(local.x) > 20) TRACK_X = Math.abs(local.x);
      }
      wheelRadius = THREE.MathUtils.clamp(radSum / quads.size, 18, 150);
    } else {
      // no confident wheels — default running gear, static wheels
      AXLE_F = size.z * 0.31;
      AXLE_R = -size.z * 0.31;
      TRACK_X = Math.max(60, size.x * 0.35);
    }

    // body: one merged mesh under the model root
    const bodyGeo = mergeGeos(bodyGeos);
    if (bodyGeo) {
      const bodyMesh = new THREE.Mesh(bodyGeo, paint);
      model.add(bodyMesh);
      carMeshes++;
    }
    // drop the original fragmented meshes (replaced by the merged ones)
    for (const m of bodySources) {
      m.parent?.remove(m);
      m.geometry.dispose();
    }
    model.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });

    group.add(model); // real car in (inherits the placed group pose)
    group.updateMatrixWorld(true);
    group.remove(placeholder);
    ready = true;
  }

  new GLTFLoader().load(
    opts.modelUrl ?? MODEL_URL,
    (gltf) => {
      try {
        buildModel(
          gltf as unknown as {
            scene: THREE.Group;
            animations: THREE.AnimationClip[];
          }
        );
      } catch {
        /* keep the placeholder — a broken model must never brick the game */
      }
    },
    undefined,
    () => {
      /* network/build failure — the placeholder keeps the car usable */
    }
  );

  /* ------------------------------ obstacles ------------------------------- */

  function setObstacles(list: NascarObstacle[]): void {
    obstacles = list;
  }

  /**
   * Resolve the car circle against every obstacle OBB. A hard bump
   * (slower than / stationary against the other car) still stops the car;
   * a RAM — clearly faster — keeps rolling with a light scrub and SHOVES
   * the other car along the impact direction, so both cars carry motion
   * instead of the player pinning against a static box.
   */
  function resolveObstacles(dt: number): void {
    const step = Math.min(dt, 1 / 20);
    // world velocity right now (same composition as the drive step)
    const c0 = Math.cos(group.rotation.y);
    const s0 = Math.sin(group.rotation.y);
    let wvx = s0 * speed + c0 * lateral;
    let wvz = c0 * speed - s0 * lateral;
    for (const ob of obstacles) {
      const dx = group.position.x - ob.x;
      const dz = group.position.z - ob.z;
      const cos = Math.cos(ob.rotY);
      const sin = Math.sin(ob.rotY);
      // world -> obstacle local (inverse of the yaw rotation)
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      const ex = ob.hw + BUMP_R;
      const ez = ob.hl + BUMP_R;
      if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) continue;
      // push along the shallowest axis
      const penX = ex - Math.abs(lx);
      const penZ = ez - Math.abs(lz);
      let nlx = lx;
      let nlz = lz;
      let nwx: number; // world push-out normal (unit length)
      let nwz: number;
      if (penX < penZ) {
        nlx = Math.sign(lx || 1) * ex;
        nwx = nlx > 0 ? cos : -cos; // local X axis -> world (cos, -sin)
        nwz = nlx > 0 ? -sin : sin;
      } else {
        nlz = Math.sign(lz || 1) * ez;
        nwx = nlz > 0 ? sin : -sin; // local Z axis -> world (sin, cos)
        nwz = nlz > 0 ? cos : -cos;
      }
      // local -> world
      const wx = ob.x + nlx * cos + nlz * sin;
      const wz = ob.z - nlx * sin + nlz * cos;
      group.position.x = wx;
      group.position.z = wz;

      // --- momentum transfer ------------------------------------------
      // push direction: where the PLAYER is travelling (a rear-end hit
      // launches the other car forward, a T-bone slides it sideways)
      let pdx: number;
      let pdz: number;
      const vlen = Math.hypot(wvx, wvz);
      if (vlen >= 1) {
        pdx = wvx / vlen;
        pdz = wvz / vlen;
      } else {
        pdx = nwx; // stationary contact — fall back to the box normal
        pdz = nwz;
      }
      // the obstacle's own velocity along the push direction (traffic
      // cars report their AI speed; the parked jeep is always 0)
      const obSpd =
        (ob.speed ?? 0) * (Math.sin(ob.rotY) * pdx + Math.cos(ob.rotY) * pdz);
      const rel = vlen >= 1 ? wvx * pdx + wvz * pdz - obSpd : 0;
      if (rel > 90) {
        // RAM: the player is clearly faster — plow ahead with a light
        // dt-scaled scrub and shove the other car along the impact
        speed *= Math.exp(-1.15 * step);
        lateral *= Math.exp(-1.15 * step);
        ob.onPush?.(pdx, pdz, Math.min(1500, rel * 0.62));
      } else {
        // HARD bump: strong scrub to a stop (dt-scaled — the old hard
        // stop feel without its frame-rate dependence)
        speed *= Math.exp(-16 * step);
        lateral *= Math.exp(-12 * step);
      }
      // refresh the world velocity after the scrub for the next obstacle
      const c2 = Math.cos(group.rotation.y);
      const s2 = Math.sin(group.rotation.y);
      wvx = s2 * speed + c2 * lateral;
      wvz = c2 * speed - s2 * lateral;
    }
  }

  /* ------------------------------ drive step ------------------------------ */

  function updateDrive(dt: number, input: JeepDriveInput): JeepDriveState {
    driving = true;
    const step = Math.min(dt, 1 / 20);
    const t = THREE.MathUtils.clamp(input.throttle, -1, 1);
    const steering = THREE.MathUtils.clamp(input.steer, -1, 1);

    // --- analog easing (same family as the jeep) ---
    const easeUp = 1 - Math.exp(-6.5 * step);
    const easeDown = 1 - Math.exp(-10 * step);
    steerSmooth +=
      (steering - steerSmooth) *
      (Math.abs(steering) > Math.abs(steerSmooth) ? easeUp : easeDown);
    if (Math.abs(steerSmooth) < 0.002) steerSmooth = 0;
    throttleSmooth +=
      (t - throttleSmooth) *
      (Math.abs(t) > Math.abs(throttleSmooth) ? 1 - Math.exp(-5 * step) : easeDown);

    // --- drift intent (needed early: the handbrake softens in a slide) ---
    const wantDrift =
      input.brake && Math.abs(steerSmooth) > 0.1 && Math.abs(speed) > DRIFT_SPEED_MIN;
    // power oversteer: once the rear is out, staying ON the throttle with
    // steering wound in keeps the slide alive (feather-to-hold — the
    // classic NASCAR technique); straightening or lifting gathers it
    const powerHold =
      !input.brake && drifting && t > 0.3 && Math.abs(steerSmooth) > 0.25;
    const driftIntent = wantDrift || powerHold;

    // --- longitudinal ---
    let accel: number;
    if (input.brake) {
      // yanking the handbrake mid-drift locks the REAR only — the car keeps
      // rolling through the slide (a NASCAR slide carries speed, it does
      // not brake to a standstill); throttle powers through even harder
      let decel = driftIntent ? BRAKE_DRIFT : BRAKE_DECEL;
      if (driftIntent && t > 0.3) decel *= 0.55;
      accel = speed > 0 ? -decel : speed < 0 ? decel : 0;
    } else if (t > 0.01) {
      accel = speed < -10 ? BRAKE_DECEL : throttleSmooth * ACCEL;
    } else if (t < -0.01) {
      accel = speed > 10 ? -BRAKE_DECEL : throttleSmooth * REV_ACCEL;
    } else {
      accel = speed > 0 ? -ROLL_RESIST : speed < 0 ? ROLL_RESIST : 0;
      if (Math.abs(speed) < 6) speed = 0;
    }
    speed += accel * step;
    if (!input.brake) speed -= speed * DRAG_K * step;
    speed = THREE.MathUtils.clamp(speed, -MAX_REV, MAX_FWD);

    // --- steering: authority ramps with speed, fades toward top speed ---
    const authority = Math.min(1, Math.abs(speed) / STEER_SPEED_REF);
    const atten = 1 / (1 + Math.abs(speed) / STEER_ATTEN);
    const dir = speed >= 0 ? 1 : -1;

    // --- THE DRIFT — a real pivot, never a side-slide -------------------
    // The velocity vector is INERTIAL: while the body yaws, the velocity
    // keeps pointing where the car was GOING. Tyre grip is the only thing
    // that bends the velocity toward the nose, so slip angle (and the
    // tail-out look) emerges from the yaw/grip balance:
    //   grip      -> tiny slip (velocity chases the body, no slide)
    //   handbrake -> weak rear grip: the nose pivots in while the tail
    //                sweeps around it, then grip gathers it all smoothly.
    // 1) drift state machine (eased in AND out — no snap anywhere)
    const boostTarget = driftIntent ? DRIFT_YAW_BOOST : 1;
    driftBoost += (boostTarget - driftBoost) * Math.min(1, DRIFT_YAW_EASE * step);
    // 2) grip: how hard the tyres bend the velocity toward the nose this
    //    frame. Handbrake loosens the rear, throttle keeps a live slide
    //    alive (power oversteer), everything else is continuous.
    const gripBase = input.brake
      ? GRIP_HANDBRAKE
      : drifting
        ? GRIP_DRIFT
        : GRIP;
    const gripEff =
      drifting && !input.brake && t > 0.05 ? gripBase * 0.72 : gripBase;
    lateral *= Math.exp(-gripEff * step);
    const latMax = Math.abs(speed) * SLIP_MAX + 60;
    lateral = THREE.MathUtils.clamp(lateral, -latMax, latMax);
    // 3) compose the WORLD velocity from the pre-yaw heading + slide
    const cosH = Math.cos(group.rotation.y);
    const sinH = Math.sin(group.rotation.y);
    const velX = sinH * speed + cosH * lateral;
    const velZ = cosH * speed - sinH * lateral;
    // 4) yaw the BODY around the velocity: the front keeps a natural turn
    //    rate, the drift boost swings the rear ~3x harder around it, and
    //    the handbrake adds a touch of entry punch (all sign-correct —
    //    steerSmooth carries the direction, dir the reverse flip)
    const yawRate = STEER_RATE * atten * driftBoost * (input.brake ? 1.15 : 1);
    const prevYaw = group.rotation.y; // pre-turn yaw (footpath pose sweep)
    group.rotation.y += steerSmooth * yawRate * authority * dir * step;
    // 5) re-decompose the world velocity against the NEW heading — this is
    //    where the slip is born: the body rotated around the velocity, so
    //    part of the forward speed reappears as tail-out slide (and vice
    //    versa when counter-steering gathers it back)
    const cosH2 = Math.cos(group.rotation.y);
    const sinH2 = Math.sin(group.rotation.y);
    speed = velX * sinH2 + velZ * cosH2;
    lateral = velX * cosH2 - velZ * sinH2;
    const absLat = Math.abs(lateral);
    const absSpd = Math.abs(speed);
    drifting = absLat > (drifting ? DRIFT_MIN_EXIT : DRIFT_MIN) && absSpd > 110;
    if (drifting) {
      // sliding tyres scrub forward speed (never through zero)
      speed -= Math.sign(speed) * Math.min(absSpd, absLat * DRIFT_SCRUB * step);
    }

    // --- integrate: forward*speed + right*lateral (final car frame) ---
    // CITY FOOTPATHS: the raised kerbed walkways are SOLID — the car can
    // never drive onto one. A hit sparks between the struck car part and
    // the kerb (scaled by speed + impact angle + part), scrubs the into-
    // wall velocity and lets the car SLIDE along the kerb by the hit
    // angle (shallow hits grind along the edge, head-on hits crunch).
    const wvx = sinH2 * speed + cosH2 * lateral;
    const wvz = cosH2 * speed - sinH2 * lateral;
    const fp = resolveVehicleFootpath({
      scene,
      prevX: group.position.x,
      prevZ: group.position.z,
      prevRotY: prevYaw,
      newX: group.position.x + wvx * step,
      newZ: group.position.z + wvz * step,
      rotY: group.rotation.y,
      hw: COLLIDE_HW,
      hl: COLLIDE_HL,
      speed,
      lateral,
      velX: wvx,
      velZ: wvz,
      maxRef: MAX_FWD,
      step,
      heightAt,
    });
    if (fp) {
      speed = fp.speed;
      lateral = fp.lateral;
      group.rotation.y = fp.heading;
      group.position.x = fp.x;
      group.position.z = fp.z;
      // kerb crunch: the sprung body dips into the hit
      if (fp.impact > 240) bodyYVel -= Math.min(150, fp.impact * 0.05);
    } else {
      group.position.x += wvx * step;
      group.position.z += wvz * step;
    }
    resolveObstacles(step);

    // --- terrain follow under the four wheel pads ---
    const gcos = Math.cos(group.rotation.y);
    const gsin = Math.sin(group.rotation.y);
    const padY = (lx: number, lz: number): number =>
      heightAt(
        group.position.x + lx * gcos + lz * gsin,
        group.position.z - lx * gsin + lz * gcos
      );
    const hFR = padY(TRACK_X, AXLE_F);
    const hFL = padY(-TRACK_X, AXLE_F);
    const hRR = padY(TRACK_X, AXLE_R);
    const hRL = padY(-TRACK_X, AXLE_R);
    const targetY = (hFR + hFL + hRR + hRL) / 4;
    const targetPitch = -Math.atan2(
      (hFR + hFL) / 2 - (hRR + hRL) / 2,
      AXLE_F - AXLE_R
    );
    const targetRoll = Math.atan2(
      (hFR + hRR) / 2 - (hFL + hRL) / 2,
      TRACK_X * 2
    );

    // --- sprung suspension (same stiff-overdamped family as the jeep) ---
    const spring = (
      p: number,
      v: number,
      target: number,
      d: number
    ): [number, number] => {
      const nv = v + ((target - p) * SUS_STIFFNESS - v * SUS_DAMPING) * d;
      return [p + nv * d, nv];
    };
    const accelVis = THREE.MathUtils.clamp(accel / ACCEL, -1, 1);
    const pitchTarget = targetPitch - accelVis * 0.016; // squat / brake dive
    const rollTarget =
      targetRoll +
      steerSmooth *
        authority *
        Math.min(1, Math.abs(speed) / MAX_FWD) *
        0.02 -
      THREE.MathUtils.clamp(lateral / 500, -1, 1) * 0.024;
    [bodyY, bodyYVel] = spring(bodyY, bodyYVel, targetY, step);
    [bodyPitch, bodyPitchVel] = spring(bodyPitch, bodyPitchVel, pitchTarget, step);
    [bodyRoll, bodyRollVel] = spring(bodyRoll, bodyRollVel, rollTarget, step);

    group.position.y = bodyY;
    group.rotation.order = 'YXZ'; // yaw was updated in the drift step above
    group.rotation.x = bodyPitch;
    group.rotation.z = bodyRoll;

    // --- wheels: rolling via the calibrated subclip, steering applied on
    // top as a parent-frame pre-rotation about the car's up axis ---
    steerVis +=
      (steerSmooth * WHEEL_STEER_MAX * dir - steerVis) *
      (1 - Math.exp(-10 * step));
    if (wheelSpin.length > 0) {
      const w = wheelSpin[0];
      // rad/s needed = |speed| / wheelRadius -> clip timeScale
      const ts = speed / wheelRadius / w.rate;
      w.mixer.update(step * ts);
    }
    if (dashMixer) {
      // needles sweep their baked range as speed climbs toward max
      dashMixer.update(step * Math.min(1.05, Math.abs(speed) / MAX_FWD));
    }
    // visible front-wheel steer lock, composed AFTER the roll animation.
    // MIXER-DRIVEN WHEELS ONLY: the mixer rewrites the node quaternion every
    // frame, so the premultiply holds exactly ONE steady steer angle. The
    // pivot-driven fleet wheels steer through their own rotation.y below —
    // premultiplying those would compound frame after frame and tumble.
    if (steerVis !== 0 && wheelSpin.length > 0) {
      for (const sw of steerWheels) {
        qSteerTmp.setFromAxisAngle(sw.axis, steerVis);
        sw.node.quaternion.premultiply(qSteerTmp);
      }
    }
    // fleet wheels: absolute spin angle + steer yaw (plain Euler pivots —
    // no baked rig to fight; 'YXZ' order steers about up, spins about axle)
    if (spinPivots.length > 0) {
      spinAccum += (speed / wheelRadius) * step;
      // keep the angle bounded — huge rotation values jitter once float
      // precision runs out on long drives
      if (Math.abs(spinAccum) > Math.PI * 4) spinAccum %= Math.PI * 2;
      for (const sp of spinPivots) {
        sp.node.rotation.y = sp.front ? steerVis : 0;
        sp.node.rotation.x = spinAccum;
      }
    }

    // --- skid marks + tyre smoke for every sliding wheel ---
    // BURNOUT STRAIN: throttle held while the car goes NOWHERE (held on a
    // footpath kerb or obstacle). "Nowhere" = NET displacement over a
    // 0.6s window — the kerb response makes the car oscillate against
    // the edge, so raw speed (or short-window crawl) reads as motion:
    // net displacement collapses to ~0 exactly when the car is straining
    // in place, and stays huge the moment it drives free.
    strainClock += step;
    let straining = false;
    if (Math.abs(t) > 0.4) {
      if (strainClock - strainRefT >= 0.6) {
        strainBlocked =
          Math.hypot(group.position.x - strainRefX, group.position.z - strainRefZ) < 28;
        strainRefX = group.position.x;
        strainRefZ = group.position.z;
        strainRefT = strainClock;
      }
      straining = strainBlocked;
    } else {
      strainBlocked = false;
      strainRefX = group.position.x;
      strainRefZ = group.position.z;
      strainRefT = strainClock;
    }
    if (straining) strainBuild = Math.min(1, strainBuild + step * 0.45);
    else strainBuild = Math.max(0, strainBuild - step * 0.7);
    const handbrakeLock = input.brake && absSpd > 40;
    const brakeLock = input.brake && absSpd > SLIP_BRAKE;
    // a sustained blocked-strain burnout owns the rear-tyre smoke — the
    // launch-wheelspin path stands down so the two never double up
    const launchSpin =
      t > 0.85 &&
      speed > -10 &&
      absSpd < SLIP_LAUNCH &&
      !(straining && strainBuild > 0.2);
    const wvxOut = gsin * speed + gcos * lateral;
    const wvzOut = gcos * speed - gsin * lateral;
    const corners: [number, number, boolean][] = [
      [TRACK_X, AXLE_F, true],
      [-TRACK_X, AXLE_F, true],
      [TRACK_X, AXLE_R, false],
      [-TRACK_X, AXLE_R, false],
    ];
    for (let i = 0; i < corners.length; i++) {
      const [lx, lz, steers] = corners[i];
      const wx = group.position.x + lx * gcos + lz * gsin;
      const wz = group.position.z - lx * gsin + lz * gcos;
      let slip = 0;
      if (drifting) slip = Math.min(1, 0.3 + absLat / 420);
      if (!steers) {
        if (handbrakeLock) slip = Math.max(slip, 0.9);
        if (launchSpin) slip = Math.max(slip, 0.5);
      } else if (brakeLock) {
        slip = Math.max(slip, Math.min(1, 0.35 + absSpd / MAX_FWD));
      }
      const trail = skidTrail[i];
      if (slip > 0.12) {
        if (trail.live) {
          const ddx = wx - trail.x;
          const ddz = wz - trail.z;
          if (ddx * ddx + ddz * ddz > SKID_SEG * SKID_SEG) {
            dropSkid(trail.x, trail.z, padY(lx, lz), wx - trail.x, wz - trail.z, slip);
            trail.x = wx;
            trail.z = wz;
          }
        } else {
          trail.live = true;
          trail.x = wx;
          trail.z = wz;
        }
      } else {
        trail.live = false;
      }
      // tyre smoke boils off every slipping wheel (denser = harder slip)
      if (slip > 0.12) {
        trail.smoke += step * (2.5 + slip * 11);
        while (trail.smoke >= 1) {
          trail.smoke -= 1;
          spawnSmoke(
            wx + (Math.random() - 0.5) * 20,
            padY(lx, lz) + 8,
            wz + (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 36 + gcos * lateral * 0.3 + wvxOut * 0.18,
            12 + Math.random() * 20,
            (Math.random() - 0.5) * 36 - gsin * lateral * 0.3 + wvzOut * 0.18,
            12 + slip * 18 + Math.random() * 7,
            1.1 + slip * 1.0 + Math.random() * 0.5,
            0.2 + slip * 0.7
          );
        }
      } else {
        trail.smoke = 0;
      }
      // --- BURNOUT STRAIN SMOKE (rear/driven wheels, builds slowly) ---
      if (!steers && straining && strainBuild > 0.03) {
        strainAcc4[i] += step * (1.4 + strainBuild * 9.5) * Math.abs(t);
        while (strainAcc4[i] >= 1) {
          strainAcc4[i] -= 1;
          const gy = padY(lx, lz);
          spawnSmoke(
            wx + (Math.random() - 0.5) * 26,
            gy + 6,
            wz + (Math.random() - 0.5) * 26,
            wvxOut * 0.2 + (Math.random() - 0.5) * 16,
            9 + Math.random() * 12 + strainBuild * 18,
            wvzOut * 0.2 + (Math.random() - 0.5) * 16,
            15 + strainBuild * 30 + Math.random() * 10,
            2.0 + strainBuild * 1.7 + Math.random() * 0.6,
            0.25 + strainBuild * 0.75
          );
        }
      } else if (!steers) {
        strainAcc4[i] = 0;
      }
    }

    return {
      speed,
      maxSpeed: MAX_FWD,
      heading: group.rotation.y,
      lateral,
      drifting,
    };
  }

  const skidTrail: { live: boolean; x: number; z: number; smoke: number }[] = [];
  for (let i = 0; i < 4; i++) skidTrail.push({ live: false, x: 0, z: 0, smoke: 0 });
  /** Burnout strain: 0..1, ramps while full throttle is held against a
   *  wall/kerb — the smoke builds the longer the car strains. The strain
   *  detector measures NET displacement over a 0.6s window (the kerb
   *  response makes raw speed useless for "not moving"). */
  let strainBuild = 0;
  const strainAcc4 = [0, 0, 0, 0];
  let strainClock = 0;
  let strainRefX = 0;
  let strainRefZ = 0;
  let strainRefT = 0;
  let strainBlocked = false;

  /* -------------------------------- fx tick ------------------------------- */

  function updateFx(dt: number): void {
    updateFootpathSparks(dt); // kerb-scrape sparks tick once per frame
    updateVehicleSmoke(dt); // ultra-realistic smoke pool steps once per frame
    for (const s of skids) {
      if (!s.mesh.visible) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        continue;
      }
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(
        (s.mesh.material as THREE.MeshBasicMaterial).opacity,
        (s.life / SKID_LIFE) * 0.5
      );
    }
  }

  /* -------------------------------- placement ----------------------------- */

  function place(x: number, z: number, y: number, rotationY = 0): void {
    group.position.set(x, y, z);
    group.rotation.set(0, rotationY, 0);
    bodyPitch = 0;
    bodyRoll = 0;
    bodyY = y;
    bodyYVel = 0;
    bodyPitchVel = 0;
    bodyRollVel = 0;
    speed = 0;
    lateral = 0;
    drifting = false;
    driftBoost = 1;
    steerVis = 0;
    steerSmooth = 0;
    throttleSmooth = 0;
    spinAccum = 0;
    for (const w of allWheels) w.node.quaternion.copy(w.restQ);
    for (const tr of skidTrail) {
      tr.live = false;
      tr.smoke = 0;
    }
    strainBuild = 0;
    strainAcc4[0] = 0;
    strainAcc4[1] = 0;
    strainAcc4[2] = 0;
    strainAcc4[3] = 0;
    strainClock = 0;
    strainRefX = group.position.x;
    strainRefZ = group.position.z;
    strainRefT = 0;
    strainBlocked = false;
    obstacles = [];
  }

  function collide(
    px: number,
    pz: number,
    radius: number
  ): { x: number; z: number } | null {
    const dx = px - group.position.x;
    const dz = pz - group.position.z;
    const cos = Math.cos(group.rotation.y);
    const sin = Math.sin(group.rotation.y);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    const qx = Math.max(-COLLIDE_HW, Math.min(COLLIDE_HW, lx));
    const qz = Math.max(-COLLIDE_HL, Math.min(COLLIDE_HL, lz));
    const ox = lx - qx;
    const oz = lz - qz;
    const d2 = ox * ox + oz * oz;
    if (d2 > radius * radius) return null;
    let nlx: number;
    let nlz: number;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      nlx = lx + ox * push;
      nlz = lz + oz * push;
    } else {
      const penX = COLLIDE_HW - Math.abs(lx) + radius;
      const penZ = COLLIDE_HL - Math.abs(lz) + radius;
      if (penX < penZ) {
        nlx = lx >= 0 ? COLLIDE_HW + radius : -COLLIDE_HW - radius;
        nlz = lz;
      } else {
        nlx = lx;
        nlz = lz >= 0 ? COLLIDE_HL + radius : -COLLIDE_HL - radius;
      }
    }
    return {
      x: group.position.x + nlx * cos + nlz * sin,
      z: group.position.z - nlx * sin + nlz * cos,
    };
  }

  /* --------------------------------- misc --------------------------------- */

  function isDriving(): boolean {
    return driving;
  }
  function setSurface(_desert: boolean): void {
    /* tyre VFX are never biome-gated on the stock car */
  }
  function setOverheat(_level: number): void {
    /* no hood steam on this car */
  }
  function vfxStats(): { steam: number; dust: number; skids: number } {
    const dust = liveVehicleSmoke();
    let sk = 0;
    for (const s of skids) if (s.mesh.visible) sk++;
    return { steam: 0, dust, skids: sk };
  }
  function stats(): { shapes: number; meshes: number; triangles: number } {
    return { shapes: ready ? 1 : 0, meshes: carMeshes, triangles: Math.round(carTriangles) };
  }
  function suspension(): {
    bodyY: number;
    heaveVel: number;
    pitch: number;
    roll: number;
    strokes: number[];
  } {
    return {
      bodyY,
      heaveVel: bodyYVel,
      pitch: bodyPitch,
      roll: bodyRoll,
      strokes: [0, 0, 0, 0],
    };
  }

  function dispose(): void {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    for (const s of skids) {
      scene.remove(s.mesh);
      (s.mesh.material as THREE.Material).dispose();
    }
    skidGeo.dispose();
    skidMat.dispose();
    scene.remove(group);
  }

  return {
    group,
    ready: () => ready,
    place,
    collide,
    setObstacles,
    updateDrive,
    updateFx,
    smokeBurst,
    isDriving,
    setSurface,
    setOverheat,
    vfxStats,
    stats,
    suspension,
    dispose,
  };
}
