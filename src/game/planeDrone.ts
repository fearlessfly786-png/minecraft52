import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ============================================================================
 * planeDrone.ts — "DART" the RATFIRE fixed-wing pet plane: a micro-detail
 * strike/recon PLANE drone built with the same craft as petDrone's BUZZ.
 *
 * MODEL (hand-built from primitives, merged per material like petDrone):
 *  - gunmetal fuselage with procedural skin (panel lines, rivets, amber
 *    racing stripe, "RF-02" + "DART" decals, warning triangle), nose cowl,
 *    tail boom + cone, tinted canopy glass
 *  - swept main wings with dihedral + tip fairings, aviation nav LEDs
 *    (green right / red left), tailplane + swept vertical fin with beacon
 *  - spinning nose propeller (pitch-twisted blades + translucent blur disc
 *    that fades in with RPM)
 *  - belly sensor ball + status ring, fixed landing gear (main wheels +
 *    tail wheel), spine antenna, rear white strobe
 *  - olive under-wing pylons with two visible missiles (static, showcase)
 *
 * BRAIN (`update`): a genuine PLANE flight — it can never hover and it is
 *  never glued to the follow point. DART integrates its own position along
 *  its nose every frame (velocity == heading, always straight), steers with
 *  a turn-rate-limited pursuit controller (fly AT the player when far,
 *  spiral onto the loiter circle when outside it, chase a lead point when
 *  circling), banks exactly proportional to the ACTUAL turn rate (level
 *  when straight, dipped into the turn when circling), holds a cruise
 *  altitude with a terrain floor + look-ahead flare, and ramps its
 *  airspeed up with the gap so it catches up when you run off. `ctx.night`
 *  eases in like petDrone (brightens the status light).
 *
 * PILOT BRAIN (`beginPilot` / `updatePilot` / `resumeCruise`): hand the
 *  stick to the player — an arcade flight model with throttle (boost /
 *  brake), banked coordinated turns (steer), eased climb/dive (pitch),
 *  look-ahead terrain avoidance (hills flare the nose up before impact),
 *  a soft ceiling and a hard floor. Handover is seamless both ways: the
 *  pilot model starts from the cruise attitude, and the cruise resumes
 *  from the exact live position/attitude when you hop out (no snapping).
 *
 * SOUND: none — the preview passes `lowSpec: true` and this module stays
 *  silent by design (no engine audio until it joins the game world).
 *
 * Scale: 100 world units = 1 m -> wingspan ~74 u, length ~70 u. The plane
 *  flies with +Z as its nose (same convention as petDrone). `dispose()`
 *  frees everything.
 * ==========================================================================*/

export interface PlaneDroneOptions {
  /** Low-end devices: fewer segments, no blur disc. */
  lowSpec?: boolean;
  /** Cruise-circle radius around the display center (world units).
   *  A tight value keeps the showcase plane circling over the podium
   *  CENTRE instead of swinging past the pedestal's edge. Default 95
   *  (open-sky cruise). */
  orbitRadius?: number;
  /** Cruise height above the center point (world units). Default 60. */
  hoverHeight?: number;
}

export interface PlaneDroneUpdateContext {
  /** 0 = full day, 1 = deep night — brightens the status light. */
  night?: number;
  /** Terrain sampler (world units). When provided, the cruise brain keeps
   *  the belly clear of the ground here and just ahead of the nose. The
   *  PET-panel preview omits it (display rooms have no terrain). */
  heightAt?: (x: number, z: number) => number;
}

/** Player stick input for `updatePilot` — all values already resolved by
 *  the caller (keyboard, joystick or debug probes). */
export interface PlanePilotInput {
  /** +1 climb .. -1 dive (W/S, arrows or the joystick Y axis). */
  pitch: number;
  /** +1 left .. -1 right (A/D — matches the game's turnInput sign). */
  steer: number;
  /** Hold to throttle up (Shift on keyboard, the RUN toggle on touch). */
  boost: boolean;
  /** Hold to throttle back (Space) — bleeds speed toward idle flight. */
  brake: boolean;
}

/** Per-frame readout from `updatePilot` — the flight HUD + debug probes. */
export interface PlanePilotTelemetry {
  /** Forward airspeed (world units/s). */
  speed: number;
  /** Throttle lever 0..1. */
  throttle: number;
  /** Nose heading (rad, same convention as the player's yaw). */
  heading: number;
  /** Climb angle (rad, + up). */
  pitch: number;
  /** Height above the terrain directly under the belly (units). */
  altitude: number;
}

export interface PlaneDrone {
  /** Root group — already added to the scene you passed in. */
  group: THREE.Group;
  /** Fly one brain tick: pursue + loiter around `center` like a real
   *  plane — nose aligned with velocity, coordinated bank, terrain floor. */
  update(
    dt: number,
    center: THREE.Vector3,
    ctx?: PlaneDroneUpdateContext
  ): void;
  /** Take the stick: capture the current cruise attitude into the pilot
   *  flight model (seamless handover — no snap on boarding). */
  beginPilot(): void;
  /** Player-piloted flight tick — integrates the arcade flight model and
   *  returns telemetry for the HUD. `heightAt` is the terrain sampler. */
  updatePilot(
    dt: number,
    input: PlanePilotInput,
    heightAt: (x: number, z: number) => number,
    ctx?: PlaneDroneUpdateContext
  ): PlanePilotTelemetry;
  /** Hand DART back to its AI cruise from wherever the flight ended:
   *  the brain adopts the live position/attitude and the pursuit eases
   *  onward — no snap, no orbit rebuild. */
  resumeCruise(): void;
  /** Free geometries, materials and textures. */
  dispose(): void;
  /** Build stats for debug surfaces. */
  stats: { meshes: number; triangles: number };
}

/* ----- cruise flight constants (the plane's AI follow brain) ----- */
/** Base loiter airspeed per unit of orbit radius — scale-invariant, so the
 *  PET-panel podium circle (r=34) and the open-world circle (r=380) both
 *  fly the same graceful ~0.55 rad/s coordinated turn. Kept well under the
 *  0.95 rad/s yaw-rate ceiling so the pursuit controller always has turn
 *  margin to converge (at 0.9 rad/s the loiter saturates and limit-cycles). */
const CRUISE_SPEED_PER_R = 0.55;
/** Airspeed multiplier ramp while the follow target pulls away (catch-up
 *  climb-and-chase). World cruise ≈ 209 u/s → full catch ≈ 710 u/s, which
 *  outruns a sprinting player (620) and closes the gap from the spiral
 *  band; the speed bleeds back off smoothly as the circle is regained. */
const CRUISE_CATCH_MULT = 3.4;
/** Beyond the orbit radius DART aims at the NEAREST point of the loiter
 *  circle (spiral the chase onto the circle) instead of the player's
 *  exact position — a high-speed approach that terminates on the circle
 *  instead of overshooting through the middle of the formation. */
const CRUISE_SPIRAL_R = 1.0;
/** Hard catch-up: beyond this multiple of the orbit radius the gap is a
 *  glitch (world respawn while the pet was hidden) — reposition onto the
 *  circle instead of flying in from kilometres away. */
const CRUISE_TELEPORT_R = 20;
/** Max yaw rate (rad/s) of the pursuit controller. */
const CRUISE_MAX_YAW_RATE = 0.95;
/** Pursuit gain: desired yaw rate = heading error × this. */
const CRUISE_TURN_GAIN = 2.0;
/** Lead angle (rad) ahead on the loiter circle that the plane chases —
 *  pure-pursuit of a lead point produces the stable coordinated orbit. */
const CRUISE_LEAD = 0.55;
/** Orbit direction: +1 = bearing increases (same sweep as the original
 *  showcase circle). */
const ORBIT_DIR = 1;
/** Bank (rad) per unit of ACTUAL yaw rate — the coordinated-turn visual:
 *  zero roll flying straight, dipping into every turn exactly as hard as
 *  it turns. */
const CRUISE_BANK_GAIN = 0.55;
const CRUISE_MAX_BANK = 0.5;
/** Terrain floor under the belly / ahead of the nose (units, world). */
const CRUISE_TERRAIN_CLEAR = 85;
/** Look-ahead (seconds of flight) for the terrain flare sample. */
const CRUISE_LOOKAHEAD_S = 0.9;
/** Max climb / dive angle (rad) while following. */
const CRUISE_MAX_CLIMB = 0.38;
const CRUISE_MAX_DIVE = 0.45;
/** Altitude-error → pitch gain (rad per unit of height error). */
const CRUISE_ALT_GAIN = 0.004;

/* ----- pilot flight constants (the player's arcade flight model) ----- */
/** Idle-flight airspeed (units/s) — a plane can never hang on its prop. */
const PILOT_MIN_SPEED = 200;
/** Full-boost airspeed (units/s). */
const PILOT_MAX_SPEED = 820;
/** Hands-off throttle the lever eases back to. */
const PILOT_BASE_THROTTLE = 0.55;
/** Yaw rate (rad/s) at full steer and full speed. */
const PILOT_TURN_RATE = 1.2;
/** Bank angle (rad) at full steer — the turn visual follows this. */
const PILOT_MAX_BANK = 0.62;
/** Max climb angle (rad) at full stick back. */
const PILOT_MAX_PITCH = 0.5;
/** Max dive angle (rad) — slightly steeper than the climb. */
const PILOT_DIVE_PITCH = 0.62;
/** Hard floor: never closer to the terrain than this (units). */
const PILOT_MIN_CLEAR = 46;
/** Look-ahead (seconds of flight) for the terrain flare sample. */
const PILOT_LOOKAHEAD_S = 0.85;
/** Soft ceiling above the local terrain (units). */
const PILOT_MAX_AGL = 1100;

/* ---------------- small texture factory helpers ---------------- */

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('planeDrone: 2D canvas unavailable');
  return [canvas, ctx];
}

function finishTexture(canvas: HTMLCanvasElement, repeat: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

/** DART fuselage skin: gunmetal base, amber racing stripe, panel lines,
 *  rivets, "RF-02" / "DART · STRIKE PLANE" decals, warning triangle. */
function planeTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256);
  const base = ctx.createLinearGradient(0, 0, 0, 256);
  base.addColorStop(0, '#a7adb6');
  base.addColorStop(1, '#878e98');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  // worn tone patches
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 8; i++) {
    const w = 40 + rand() * 90;
    const h = 24 + rand() * 60;
    ctx.fillStyle =
      rand() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(rand() * (256 - w), rand() * (256 - h), w, h);
  }
  // amber racing stripe with dark edge piping
  ctx.fillStyle = '#f2b418';
  ctx.fillRect(0, 92, 256, 26);
  ctx.fillStyle = '#23262c';
  ctx.fillRect(0, 88, 256, 4);
  ctx.fillRect(0, 118, 256, 4);
  // panel seams
  ctx.strokeStyle = 'rgba(52,58,66,0.8)';
  ctx.lineWidth = 2;
  for (const o of [42, 128, 170, 214]) {
    ctx.beginPath();
    ctx.moveTo(0, o);
    ctx.lineTo(256, o);
    ctx.stroke();
  }
  for (const o of [64, 150, 236]) {
    ctx.beginPath();
    ctx.moveTo(o, 0);
    ctx.lineTo(o, 256);
    ctx.stroke();
  }
  // rivet rows along the seams
  ctx.fillStyle = '#6d747e';
  for (const y of [46, 132, 174, 218]) {
    for (let x = 12; x < 256; x += 44) {
      ctx.beginPath();
      ctx.arc(x, y, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // RATFIRE pet decals
  ctx.fillStyle = '#23262c';
  ctx.font = '900 30px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RF-02', 128, 56);
  ctx.font = '900 15px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#23262c';
  ctx.fillText('DART · STRIKE PLANE', 128, 152);
  ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#c87a12';
  ctx.fillText('PET UNIT · RATFIRE', 128, 174);
  // amber warning triangle
  ctx.fillStyle = '#f2b418';
  ctx.beginPath();
  ctx.moveTo(222, 216);
  ctx.lineTo(238, 242);
  ctx.lineTo(206, 242);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#23262c';
  ctx.font = '900 15px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('!', 222, 236);
  // scuffs
  for (let i = 0; i < 130; i++) {
    ctx.fillStyle =
      Math.random() > 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 1);
  }
  return finishTexture(canvas, 1);
}

/* ---------------- geometry bucket helper (same as petDrone) ---------------- */

type Vec3 = [number, number, number];

class Bucket {
  geos: THREE.BufferGeometry[] = [];
  add(
    geo: THREE.BufferGeometry,
    pos: Vec3 = [0, 0, 0],
    rot: Vec3 = [0, 0, 0],
    scale: Vec3 = [1, 1, 1]
  ): void {
    // RoundedBoxGeometry is non-indexed while primitive geometries are
    // indexed — normalize everything to non-indexed so mergeGeometries
    // always finds compatible attribute sets.
    if (geo.index) geo = geo.toNonIndexed();
    const m = new THREE.Matrix4();
    m.compose(
      new THREE.Vector3(...pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
      new THREE.Vector3(...scale)
    );
    geo.applyMatrix4(m);
    this.geos.push(geo);
  }
  mesh(material: THREE.Material, shadows: boolean): THREE.Mesh | null {
    if (this.geos.length === 0) return null;
    const merged = mergeGeometries(this.geos, false);
    for (const g of this.geos) g.dispose();
    this.geos = [];
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = shadows;
    return mesh;
  }
}

/* ---------------- module ---------------- */

export function createPlaneDrone(
  scene: THREE.Scene,
  opts: PlaneDroneOptions = {}
): PlaneDrone {
  const low = opts.lowSpec ?? false;
  const seg = low ? 2 : 3; // rounded-box segments
  const rad = low ? 8 : 14; // cylinder/torus radial segments

  /* ----- cruise pattern (option-tunable for display rooms) ----- */
  /** Circle radius around the center point (world units). The PET panel
   *  passes a tight radius so DART circles over the podium CENTRE. */
  const ORBIT_R = Math.max(1, opts.orbitRadius ?? 95);
  /** Cruise height above the center point (world units). */
  const HOVER_Y = opts.hoverHeight ?? 60;

  /* ----- materials (procedural textures, no asset files) ----- */
  const planeTex = planeTexture();
  const shellMat = new THREE.MeshStandardMaterial({
    map: planeTex,
    metalness: 0.5,
    roughness: 0.45,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x191c21,
    metalness: 0.25,
    roughness: 0.72,
  });
  const bellMat = new THREE.MeshStandardMaterial({
    color: 0x3a4048,
    metalness: 0.9,
    roughness: 0.32,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0a0d16,
    metalness: 1.0,
    roughness: 0.08,
  });
  const amberMat = new THREE.MeshStandardMaterial({
    color: 0xffb020,
    metalness: 0.4,
    roughness: 0.4,
    emissive: 0xff8c00,
    emissiveIntensity: 0.25,
  });
  const oliveMat = new THREE.MeshStandardMaterial({
    color: 0x708048,
    metalness: 0.3,
    roughness: 0.55,
  });
  const propMat = new THREE.MeshStandardMaterial({
    color: 0x22262c,
    metalness: 0.3,
    roughness: 0.5,
    transparent: true,
    opacity: 0.92,
  });
  const blurMat = new THREE.MeshBasicMaterial({
    color: 0x9aa4b2,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ledGreenMat = new THREE.MeshBasicMaterial({ color: 0x36ff6a });
  const ledRedMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffb020 });
  const statusMat = new THREE.MeshBasicMaterial({ color: 0xffb020 });

  /* ----- static merged buckets ----- */
  const shell = new Bucket();
  const dark = new Bucket();
  const bell = new Bucket();
  const amber = new Bucket();
  const olive = new Bucket();

  // fuselage: long rounded body, nose cowl, spinner base, tail boom + cone
  shell.add(new RoundedBoxGeometry(9, 7.5, 46, seg, 3), [0, 0.5, -4]);
  shell.add(
    new THREE.CylinderGeometry(4.0, 4.7, 11, rad),
    [0, 0.5, 24],
    [Math.PI / 2, 0, 0]
  );
  shell.add(
    new THREE.CylinderGeometry(2.4, 4.0, 3.4, rad),
    [0, 0.5, 31],
    [Math.PI / 2, 0, 0]
  );
  shell.add(
    new THREE.CylinderGeometry(4.2, 1.6, 20, rad),
    [0, 1.5, -24],
    [Math.PI / 2, 0, 0]
  );
  shell.add(
    new THREE.CylinderGeometry(1.6, 0.9, 4, rad),
    [0, 1.5, -35],
    [Math.PI / 2, 0, 0]
  );
  // canopy: tinted glass hump over the cockpit section
  const canopy = new Bucket();
  canopy.add(new RoundedBoxGeometry(5.4, 3.8, 11, seg, 2), [0, 4.6, 9]);
  // main wings: swept back with dihedral; tip fairings carry the nav LEDs
  // (fairings sit ON the computed swept tip: center [±11, 1.6, 7] + tip
  // offset (12,0,0) rotated by yaw 0.3 / dihedral 0.07 -> ≈ [±22.5, 2.4, 3.5])
  for (const sx of [-1, 1]) {
    shell.add(
      new RoundedBoxGeometry(24, 1.6, 9, seg, 1),
      [sx * 11, 1.6, 7],
      [0, sx * 0.3, sx * 0.07]
    );
    bell.add(
      new RoundedBoxGeometry(2.4, 2.0, 6.5, seg, 0.9),
      [sx * 22.6, 2.5, 3.5],
      [0, sx * 0.3, 0]
    );
  }
  // tailplane + swept vertical fin + fin cap
  shell.add(new RoundedBoxGeometry(17, 1.2, 5.5, seg, 0.8), [0, 1.8, -30]);
  shell.add(
    new RoundedBoxGeometry(1.4, 10.5, 7.5, seg, 0.8),
    [0, 6.8, -29.5],
    [-0.28, 0, 0]
  );
  bell.add(
    new RoundedBoxGeometry(1.8, 1.4, 3, seg, 0.6),
    [0, 16.4, -32]
  );
  // belly sensor plate + spine antenna
  dark.add(
    new THREE.CylinderGeometry(3.2, 3.8, 1.4, rad),
    [0, -3.6, 6]
  );
  dark.add(
    new THREE.CylinderGeometry(0.5, 0.7, 9, 6),
    [0, 7.5, -10],
    [0.35, 0, 0]
  );
  // fixed landing gear: main struts + wheels, tail skid wheel
  for (const sx of [-1, 1]) {
    dark.add(new THREE.BoxGeometry(1.6, 4.5, 1.6), [sx * 5.5, -5, 5]);
    dark.add(
      new THREE.CylinderGeometry(2.5, 2.5, 1.7, rad),
      [sx * 5.5, -7.4, 5],
      [0, 0, Math.PI / 2]
    );
    bell.add(
      new THREE.CylinderGeometry(0.7, 0.7, 2.4, 6),
      [sx * 5.5, -7.4, 5],
      [0, 0, Math.PI / 2]
    );
  }
  dark.add(new THREE.BoxGeometry(1.2, 3, 1.2), [0, -2.6, -30]);
  dark.add(
    new THREE.CylinderGeometry(1.3, 1.3, 1.2, low ? 6 : 10),
    [0, -4.4, -30],
    [0, 0, Math.PI / 2]
  );
  // amber nose chevrons on the cowl (DART's identity color)
  amber.add(
    new RoundedBoxGeometry(1.8, 1.2, 4.5, seg, 0.6),
    [-4.5, 2.2, 27.5],
    [0, 0.22, 0]
  );
  amber.add(
    new RoundedBoxGeometry(1.8, 1.2, 4.5, seg, 0.6),
    [4.5, 2.2, 27.5],
    [0, -0.22, 0]
  );
  // under-wing pylons + two static missiles (recon loadout)
  for (const sx of [-1, 1]) {
    olive.add(
      new RoundedBoxGeometry(2.4, 1.2, 11, seg, 0.8),
      [sx * 9, -1.8, 9]
    );
    olive.add(
      new THREE.CylinderGeometry(1.05, 1.05, 8.4, low ? 6 : 10),
      [sx * 9, -3.4, 9],
      [Math.PI / 2, 0, 0]
    );
    olive.add(
      new THREE.CylinderGeometry(0.06, 1.05, 2.6, low ? 6 : 10),
      [sx * 9, -3.4, 14.4],
      [Math.PI / 2, 0, 0]
    );
    for (const fr of [0, Math.PI / 2]) {
      olive.add(
        new THREE.BoxGeometry(0.28, 2.1, 1.9),
        [sx * 9, -3.4, 5.6],
        [0, 0, fr]
      );
    }
  }

  const root = new THREE.Group();
  root.name = 'planeDrone';
  // YXZ (yaw -> pitch -> roll): the pilot brain banks and climbs without
  // the Euler cross-terms XYZ would introduce (harmless for the cruise).
  root.rotation.order = 'YXZ';

  const shellMesh = shell.mesh(shellMat, true);
  const canopyMesh = canopy.mesh(glassMat, true);
  const darkMesh = dark.mesh(darkMat, true);
  const bellMesh = bell.mesh(bellMat, true);
  const amberMesh = amber.mesh(amberMat, true);
  const oliveMesh = olive.mesh(oliveMat, true);
  for (const m of [
    shellMesh,
    canopyMesh,
    darkMesh,
    bellMesh,
    amberMesh,
    oliveMesh,
  ]) {
    if (m) root.add(m);
  }

  // belly sensor ball (glass) + amber status ring underneath
  const sensorBall = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, low ? 8 : 14, low ? 6 : 10),
    glassMat
  );
  sensorBall.position.set(0, -5.6, 6);
  root.add(sensorBall);
  const statusRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.8, 0.5, low ? 6 : 10, low ? 18 : 32),
    statusMat
  );
  statusRing.rotation.x = Math.PI / 2;
  statusRing.position.set(0, -5.2, 6);
  root.add(statusRing);

  // aviation lights: nav LEDs on the wingtip fairings, tail strobe,
  // fin-tip beacon
  const navGeo = new THREE.SphereGeometry(1.3, low ? 6 : 10, low ? 5 : 8);
  for (const sx of [-1, 1]) {
    // aviation: red = PORT (left, +X for a +Z nose — the wing the banked
    // turn dips), green = STARBOARD (right, -X)
    const led = new THREE.Mesh(navGeo, sx > 0 ? ledRedMat : ledGreenMat);
    led.position.set(sx * 22.6, 4.6, 3.5);
    root.add(led);
  }
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, low ? 6 : 10, low ? 5 : 8),
    strobeMat
  );
  strobe.position.set(0, 1.5, -36.5);
  root.add(strobe);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, low ? 6 : 10, low ? 5 : 8),
    beaconMat
  );
  beacon.position.set(0, 17, -32.2);
  root.add(beacon);

  // ----- nose propeller (animated assembly) -----
  const propPivot = new THREE.Group();
  propPivot.position.set(0, 0.5, 33.5);
  root.add(propPivot);
  const propBlades = new Bucket();
  // two pitch-twisted blades crossed at 90°: the first pitches about its
  // long X axis, the second is stood up (Rz) then pitched about Y
  propBlades.add(
    new RoundedBoxGeometry(24, 1.7, 0.6, 1, 0.55),
    [0, 0, 0],
    [0.24, 0, 0]
  );
  propBlades.add(
    new RoundedBoxGeometry(24, 1.7, 0.6, 1, 0.55),
    [0, 0, 0],
    [0, 0.24, Math.PI / 2]
  );
  const bladesMesh = propBlades.mesh(propMat, true);
  if (bladesMesh) propPivot.add(bladesMesh);
  const spinner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 2.2, 4, rad),
    bellMat
  );
  spinner.rotation.x = Math.PI / 2;
  spinner.position.z = 1.8;
  propPivot.add(spinner);
  let blur: THREE.Mesh | null = null;
  if (!low) {
    blur = new THREE.Mesh(new THREE.CircleGeometry(13.5, 24), blurMat);
    blur.position.z = 0.6;
    propPivot.add(blur);
  }

  scene.add(root);

  /* ----- brain state ----- */
  let spin = 30; // prop rad/s
  let nightSm = 0;
  const TWO_PI = Math.PI * 2;

  // Cruise flight state. The plane OWNS its position: every tick integrates
  // it along the nose, so the velocity is ALWAYS the heading (no sideways
  // slide, no rigid attachment to the follow point) and a player flight
  // hands back seamlessly because there is no orbit to rebuild at all.
  let cruiseStarted = false; // first update() materialises on the circle
  let heading = 0; // nose heading (rad, wrapped to [-π, π])
  let pitchSm = 0; // cruise pitch, + climb (rad) — eased
  let rollSm = 0; // cruise roll, coordinated bank (rad) — eased
  let yawRateSm = 0; // ACTUAL turn rate (rad/s) — eased, drives the bank
  let speed = 0; // shared airspeed: cruise eases it, pilot adopts it

  // Pilot flight-model state (unit 'u' = world unit, 100 u = 1 m).
  let pitch = 0; // + climb / - dive (rad)
  let roll = 0; // + bank left / - bank right (rad)
  let throttle = PILOT_BASE_THROTTLE;

  /** Shared prop tick: eases RPM to `target`, spins the hub, fades the
   *  blur disc in past cruise RPM. Used by BOTH brains. */
  function tickProp(dt: number, target: number): void {
    spin += (target - spin) * (1 - Math.exp(-2.5 * dt));
    propPivot.rotation.z += spin * dt;
    if (blur) {
      (blur.material as THREE.MeshBasicMaterial).opacity =
        THREE.MathUtils.smoothstep(spin, 26, 44) * 0.16;
    }
  }

  /** Shared aviation-lights tick: white double-flash strobe every 1.4 s,
   *  1 Hz beacon, pulsing amber status ring (brighter at night). */
  function tickLights(dt: number, nRaw: number): void {
    const t = performance.now() / 1000;
    const ph = t % 1.4;
    const strobeOn = ph < 0.06 || (ph > 0.16 && ph < 0.22);
    strobeMat.color.setHex(strobeOn ? 0xffffff : 0x2a2d33);
    beaconMat.color.setHex(t % 1 < 0.5 ? 0xffb020 : 0x5a4010);
    nightSm += (nRaw - nightSm) * (1 - Math.exp(-2 * dt));
    statusMat.color
      .setHex(0xffb020)
      .multiplyScalar(0.75 + 0.3 * Math.sin(t * 2.6) + nightSm * 0.6);
  }

  /* ----- per-frame AI brain: a real plane never hovers, never slides ----- */
  function update(
    dt: number,
    center: THREE.Vector3,
    ctx?: PlaneDroneUpdateContext
  ): void {
    const heightAt = ctx?.heightAt;

    // First tick: materialise ON the loiter circle, nose already on the
    // tangent — display rooms pin DART to the podium centre from frame
    // one, and in-world deploys spawn in formation instead of flying in
    // from the world origin.
    if (!cruiseStarted) {
      cruiseStarted = true;
      const a0 = 0.9;
      root.position.set(
        center.x + Math.sin(a0) * ORBIT_R,
        center.y + HOVER_Y,
        center.z + Math.cos(a0) * ORBIT_R
      );
      // tangent of the +bearing orbit: d/da (sin a, cos a) = (cos a, -sin a)
      heading = Math.PI / 2 + a0;
      pitchSm = 0;
      rollSm = 0;
      yawRateSm = 0;
      speed = CRUISE_SPEED_PER_R * ORBIT_R;
    }

    // Hard catch-up: the follow target is impossibly far (respawn / world
    // warp while the pet was hidden) — reposition onto the circle instead
    // of chasing across kilometres.
    const dxRaw = root.position.x - center.x;
    const dzRaw = root.position.z - center.z;
    if (Math.hypot(dxRaw, dzRaw) > ORBIT_R * CRUISE_TELEPORT_R) {
      const a = Math.atan2(dxRaw, dzRaw);
      root.position.set(
        center.x + Math.sin(a) * ORBIT_R * 1.4,
        center.y + HOVER_Y,
        center.z + Math.cos(a) * ORBIT_R * 1.4
      );
      heading = Math.PI / 2 + a;
      pitchSm = 0;
    }

    const px = root.position.x;
    const pz = root.position.z;
    const dx = px - center.x;
    const dz = pz - center.z;
    const dist = Math.max(0.001, Math.hypot(dx, dz));
    const bearing = Math.atan2(dx, dz); // centre -> plane

    // --- pursuit target: OUTSIDE the circle, aim at its nearest point
    //     (the chase spirals cleanly onto the circle — never overshooting
    //     through the player); INSIDE it, chase a lead point on the rim so
    //     the plane swings around and back out into the orbit ---
    let tx: number;
    let tz: number;
    if (dist > ORBIT_R * CRUISE_SPIRAL_R) {
      tx = center.x + Math.sin(bearing) * ORBIT_R; // nearest circle point
      tz = center.z + Math.cos(bearing) * ORBIT_R;
    } else {
      const la = bearing + ORBIT_DIR * CRUISE_LEAD; // lead point ahead
      tx = center.x + Math.sin(la) * ORBIT_R;
      tz = center.z + Math.cos(la) * ORBIT_R;
    }

    // --- airspeed: graceful base cruise, ramping up with the gap so a
    //     running player gets genuinely chased down (and it bleeds back
    //     off smoothly once the circle is regained) ---
    const baseSpeed = CRUISE_SPEED_PER_R * ORBIT_R;
    const gapFactor =
      1 +
      THREE.MathUtils.clamp(
        (dist - ORBIT_R) / ORBIT_R,
        0,
        CRUISE_CATCH_MULT - 1
      );
    const speedTarget = baseSpeed * gapFactor;
    speed += (speedTarget - speed) * (1 - Math.exp(-1.4 * dt));

    // --- coordinated turn: ease the yaw RATE toward the pursuit error and
    //     integrate — the nose IS the velocity direction, every frame ---
    const desiredYaw = Math.atan2(tx - px, tz - pz);
    const yawErr = Math.atan2(
      Math.sin(desiredYaw - heading),
      Math.cos(desiredYaw - heading)
    );
    const yawRateTarget = THREE.MathUtils.clamp(
      yawErr * CRUISE_TURN_GAIN,
      -CRUISE_MAX_YAW_RATE,
      CRUISE_MAX_YAW_RATE
    );
    yawRateSm += (yawRateTarget - yawRateSm) * (1 - Math.exp(-3.2 * dt));
    heading += yawRateSm * dt;
    if (heading > Math.PI) heading -= TWO_PI;
    else if (heading < -Math.PI) heading += TWO_PI;
    root.rotation.y = heading;

    // --- bank rides the ACTUAL turn rate: perfectly level on straight
    //     legs, dipping into the turn exactly as hard as it turns ---
    const rollTarget = THREE.MathUtils.clamp(
      -yawRateSm * CRUISE_BANK_GAIN,
      -CRUISE_MAX_BANK,
      CRUISE_MAX_BANK
    );
    rollSm += (rollTarget - rollSm) * (1 - Math.exp(-4 * dt));
    root.rotation.z = rollSm;

    // --- altitude: hold cruise height above the follow target, but never
    //     dip under the terrain HERE or just ahead of the nose (the flare
    //     lifts the plane over stepped hills before they arrive) ---
    let altTarget = center.y + HOVER_Y;
    if (heightAt) {
      const laX = px + Math.sin(heading) * speed * CRUISE_LOOKAHEAD_S;
      const laZ = pz + Math.cos(heading) * speed * CRUISE_LOOKAHEAD_S;
      const floor =
        Math.max(heightAt(px, pz), heightAt(laX, laZ)) + CRUISE_TERRAIN_CLEAR;
      altTarget = Math.max(altTarget, floor);
    }
    // whisper of vertical life, scaled to the display (no attitude fake)
    const bobScale = ORBIT_R / 380;
    altTarget += Math.sin(performance.now() / 1000 * 0.8) * 1.6 * bobScale;
    const pitchTarget = THREE.MathUtils.clamp(
      (altTarget - root.position.y) * CRUISE_ALT_GAIN +
        Math.abs(yawRateSm) * 0.1,
      -CRUISE_MAX_DIVE,
      CRUISE_MAX_CLIMB
    );
    pitchSm += (pitchTarget - pitchSm) * (1 - Math.exp(-3 * dt));
    root.rotation.x = -pitchSm; // cruise convention: rotation.x = -climb

    // --- integrate along the nose: forward speed is ALWAYS on ---
    const cp = Math.cos(pitchSm);
    root.position.x += Math.sin(heading) * cp * speed * dt;
    root.position.z += Math.cos(heading) * cp * speed * dt;
    root.position.y += Math.sin(pitchSm) * speed * dt;

    // propeller rides the airspeed + aviation lights
    tickProp(dt, 24 + speed * 0.03);
    tickLights(dt, ctx?.night ?? 0);
  }

  /* ----- player-piloted flight: board / fly / hand back ----- */

  /** Capture the current cruise attitude into the flight model — boarding
   *  mid-cruise continues the exact attitude the plane was in. */
  function beginPilot(): void {
    heading = root.rotation.y;
    pitch = -root.rotation.x; // cruise stores rotation.x trim, ≈ level
    roll = root.rotation.z;
    throttle = PILOT_BASE_THROTTLE;
    speed = PILOT_MIN_SPEED + throttle * (PILOT_MAX_SPEED - PILOT_MIN_SPEED);
  }

  function updatePilot(
    dt: number,
    input: PlanePilotInput,
    heightAt: (x: number, z: number) => number,
    ctx?: PlaneDroneUpdateContext
  ): PlanePilotTelemetry {
    // --- throttle & airspeed: boost ramps up, brake bleeds off, hands-off
    //     settles at the cruise lever. Everything eased — no jerks. ---
    const thrTarget = input.boost ? 1 : input.brake ? 0.1 : PILOT_BASE_THROTTLE;
    throttle += (thrTarget - throttle) * (1 - Math.exp(-1.7 * dt));
    const speedTarget =
      PILOT_MIN_SPEED + throttle * (PILOT_MAX_SPEED - PILOT_MIN_SPEED);
    speed += (speedTarget - speed) * (1 - Math.exp(-2 * dt));

    // --- coordinated turn: bank into the steer, the yaw rate rides the
    //     bank (faster = tighter turn, like a real plane) ---
    const speedFactor = THREE.MathUtils.clamp(speed / 520, 0.45, 1.25);
    heading += input.steer * PILOT_TURN_RATE * speedFactor * dt;
    const rollTarget = input.steer * PILOT_MAX_BANK * (0.7 + 0.3 * speedFactor);
    roll += (rollTarget - roll) * (1 - Math.exp(-4.5 * dt));

    // --- climb / dive, eased for that heavy-airframe feel ---
    const pitchTarget =
      input.pitch >= 0
        ? input.pitch * PILOT_MAX_PITCH
        : input.pitch * PILOT_DIVE_PITCH;
    pitch += (pitchTarget - pitch) * (1 - Math.exp(-3.6 * dt));

    // --- integrate along the nose (speed always forward — never stalls) ---
    const cp = Math.cos(pitch);
    root.position.x += Math.sin(heading) * cp * speed * dt;
    root.position.z += Math.cos(heading) * cp * speed * dt;
    root.position.y += Math.sin(pitch) * speed * dt;

    // --- terrain safety: hard floor under the belly, a LOOK-AHEAD flare
    //     (hills rising ahead push the nose up before impact) and a soft
    //     ceiling so the sky stays reachable but never leaves the world ---
    const groundNow = heightAt(root.position.x, root.position.z);
    const laX =
      root.position.x + Math.sin(heading) * speed * PILOT_LOOKAHEAD_S;
    const laZ =
      root.position.z + Math.cos(heading) * speed * PILOT_LOOKAHEAD_S;
    const floor = Math.max(groundNow, heightAt(laX, laZ)) + PILOT_MIN_CLEAR;
    if (root.position.y < floor) {
      root.position.y += (floor - root.position.y) * Math.min(1, 6 * dt);
      if (pitch < 0.24) pitch += (0.24 - pitch) * Math.min(1, 4 * dt);
    }
    const ceil = groundNow + PILOT_MAX_AGL;
    if (root.position.y > ceil) {
      root.position.y += (ceil - root.position.y) * Math.min(1, 3 * dt);
      if (pitch > -0.1) pitch += (-0.1 - pitch) * Math.min(1, 2.5 * dt);
    }

    // --- attitude: YXZ order (yaw -> pitch -> roll) keeps the bank honest
    //     while the nose climbs/dives; whisper of trim noise keeps it alive ---
    const t = performance.now() / 1000;
    root.rotation.y = heading;
    root.rotation.x = -pitch + Math.sin(t * 1.7) * 0.012;
    root.rotation.z = roll + Math.sin(t * 1.3) * 0.016;

    // prop + lights ride the same shared ticks as the cruise brain
    tickProp(dt, 16 + throttle * 44);
    tickLights(dt, ctx?.night ?? 0);

    return {
      speed,
      throttle,
      heading,
      pitch,
      altitude: root.position.y - groundNow,
    };
  }

  /** Hand DART back to the AI cruise from wherever the flight ended: the
   *  brain owns no orbit phase any more — it simply adopts the live
   *  position/attitude and the pursuit eases in from there (no snap). */
  function resumeCruise(): void {
    heading = root.rotation.y;
    heading -= TWO_PI * Math.round(heading / TWO_PI); // wrap to [-π, π]
    pitchSm = -root.rotation.x; // pilot writes rotation.x = -pitch
    rollSm = root.rotation.z;
    yawRateSm = 0;
    cruiseStarted = true;
  }

  /* ----- stats + disposal ----- */
  let triangles = 0;
  let meshCount = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      meshCount++;
      const g = m.geometry as THREE.BufferGeometry;
      triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });

  function dispose(): void {
    scene.remove(root);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) mat.dispose();
      }
    });
    planeTex.dispose();
  }

  return {
    group: root,
    update,
    beginPilot,
    updatePilot,
    resumeCruise,
    dispose,
    stats: { meshes: meshCount, triangles: Math.round(triangles) },
  };
}
