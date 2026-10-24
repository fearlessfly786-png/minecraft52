/**
 * SPOT — RATFIRE's fourth pet: the YELLOW QUADRUPED robot dog.
 *
 * Built entirely from three.js primitives (no model to stream) after the
 * Boston-Dynamics-Spot-style reference: yellow chassis, black spine rail
 * with a battery pack + five antennas, front sensor pod, faceplate with
 * camera lenses, side service panels, a KUKA-style ROBOTIC ARM with a
 * silver claw on the top deck, and four articulated legs — front knees
 * pointing back, rear knees forward, exactly like the reference photo.
 *
 * V2 REFINEMENTS (user request):
 *   - SMOOTHED CORNERS  every visible shell piece (chassis, deck, belly,
 *                       batteries, sensor pod, faceplate, leg segments,
 *                       arm segments…) is a RoundedBoxGeometry — no hard
 *                       90° edges anywhere on the body.
 *   - LONGER LEGS       both leg segments grew ~15% (+5 units each) with
 *                       slightly thicker cross-sections; the whole body
 *                       rides BODY_LIFT higher so the feet stay planted.
 *   - BLACK DETAILING   the main body wears procedural canvas TEXTURES —
 *                       transparent overlay panels on both flanks and on
 *                       the top deck painted with black panel seams,
 *                       rivet rows, the RATFIRE service panel, handle
 *                       grooves, vent slots, hazard chevrons, a barcode,
 *                       battery bay outlines, non-slip dots, cable
 *                       raceways, tie-downs and K9 stencils. (Overlay
 *                       quads keep crisp UVs — RoundedBoxGeometry's own
 *                       UVs degenerate on the flat faces.)
 *
 * V3 HEAD REFINEMENT (user request):
 *   - TAPERED FACE   the square flat front is now a proper head module:
 *                    a trapezoid black face plate (wider at the chin,
 *                    narrower at the brow) tilted ~11° back, wearing a
 *                    yellow brow cap, a chin lip, socketed amber camera
 *                    eyes and chin vents; the sensor pod rides forward
 *                    as the forehead ridge, and the whole face nods
 *                    subtly with the idle scan (and dips on hops).
 *
 * V4 ROBOTIC ARM (user request — an industrial arm on the TOP of the
 *    body, after the supplied multi-joint KUKA reference photo):
 *   - INDUSTRIAL MANIPULATOR  the thin folded inspection arm is replaced
 *                     by a proper multi-joint arm planted on the top
 *                     deck: black bolted flange + tapered pedestal,
 *                     yellow turret shoulder with black cap discs, a
 *                     power-cable loop over the shell, bulbous upper
 *                     arm, capped elbow, tapered forearm, black wrist
 *                     cuff and a SILVER two-finger claw gripper.
 *   - REFERENCE Z-POSE the arm holds the photo's silhouette (shoulder
 *                     up, elbow bent, forearm reaching forward, claw
 *                     open) and breathes with a gentle idle sway.
 *   - TRICK UPGRADE    the one-shot rears the whole arm up, snaps the
 *                     claw shut, waves it, then settles back.
 *
 * Everything animates procedurally (no skinned clips):
 *
 *   - TROT GAIT  diagonal leg pairs, swing/stance from two sine terms,
 *                body bob + roll synced to the stride, frequency and
 *                amplitude riding the measured movement speed.
 *   - IDLE       legs settle to stance, the body "breathes", the sensor
 *                pod scans left/right.
 *   - TRICK      one-shot: the deck arm rears up, snaps the claw shut
 *                and waves it (fires while the PLAYER attacks, like
 *                SPARK's punch).
 *   - HOP        one-shot: a happy little jump when the PLAYER jumps.
 *
 * The follow brain is the same formation logic as SPARK's: slot behind
 * the player's right shoulder, walk when close, run when left behind,
 * teleport into slot if the gap is hopeless, face the player while
 * parked, stick to the terrain through `heightAt`.
 *
 * Forward is +Z at yaw 0 (same convention as robotPet).
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface SpotPetOptions {
  /** Low-end devices: no shadow casting. */
  lowSpec?: boolean;
  /** Terrain height query — the dog walks the same ground you do. */
  heightAt: (x: number, z: number) => number;
}

export interface SpotPet {
  /** Root group — already added to the scene you passed in. */
  group: THREE.Group;
  /** Drive one tick: follow the player + run the procedural rig. */
  update(dt: number, playerPos: THREE.Vector3, playerYaw: number): void;
  /** One-shot: deck arm rears up, claw snaps + waves (player attacked). */
  playTrick(): void;
  /** One-shot: happy hop (player jumped). */
  playHop(): void;
  /** Live state probe (debug surfaces + automated verification). */
  debug(): { clip: string; oneShot: string | null; dead: boolean };
  /** Build stats for debug surfaces. */
  stats: { animations: string[]; triangles: number };
  /** Free geometries, materials and textures. */
  dispose(): void;
}

// ------------------------------------------------------------------
// palette + dimensions (world units — the player stands 190 tall)
// ------------------------------------------------------------------
const YELLOW = 0xf2b40a; // Spot lacquer yellow
const YELLOW_DEEP = 0xc98f06; // shaded yellow accents
const BLACK = 0x151515; // spine, legs, details
const JOINT = 0x242424; // hip/knee hardware
const RUBBER = 0x0d0d0d; // feet
const GLASS = 0x090909; // lenses

const CHASSIS_L = 150; // along Z (forward +Z)
const CHASSIS_W = 62; // along X
const CHASSIS_H = 44; // along Y
const CHASSIS_Y = 82; // chassis centre height (bottom 60, top 104)
const CHASSIS_R = 7; // corner rounding radius

/** The whole body rides this much higher on the LONGER legs so the
 *  feet still kiss the ground (leg segments grew +5 each). */
const BODY_LIFT = 10;

const HIP_X = 24; // leg offset from centreline
const HIP_Z = 50; // front/rear hip position
const HIP_Y = 62; // hip pivot height
const UPPER_LEN = 37; // was 32 — lightly longer
const LOWER_LEN = 37; // was 32 — lightly longer
const HIP_R = 9.8; // hip module cylinder radius
const KNEE_R = 6.8; // knee hardware radius
const FOOT_R = 6.4; // rubber foot radius

/** Stance pose: front knees point BACK, rear knees FORWARD (Spot's
 *  digitigrade silhouette from the reference photo). */
const HIP_BASE = 0.45;
const KNEE_BASE = 0.9;

// gait tuning
const SWING = 0.34; // hip swing amplitude (rad) at full stride
const LIFT = 0.55; // knee lift during the swing phase (rad)
const STRIDE_HZ_MIN = 1.15;
const STRIDE_HZ_MAX = 3.3;
const STRIDE_HZ_PER_SPEED = 1 / 130; // stride Hz per world unit/s

// follow brain (mirrors robotPet)
const FOLLOW_BACK = 120;
const FOLLOW_SIDE = 115;
const ARRIVE_DIST = 26;
const WALK_MAX = 400;
const RUN_CAP = 760;
const TELEPORT_DIST = 1500;

export function createSpotPet(
  scene: THREE.Scene,
  opts: SpotPetOptions
): Promise<SpotPet> {
  // The build is synchronous once the (immediate) micro task runs — the
  // promise keeps the call site identical to the streaming pet loaders.
  return Promise.resolve().then(() => {
    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];
    const texes: THREE.Texture[] = [];

    const geo = <T extends THREE.BufferGeometry>(g: T): T => {
      geos.push(g);
      return g;
    };
    const mat = <T extends THREE.Material>(m: T): T => {
      mats.push(m);
      return m;
    };

    const yellowMat = mat(
      new THREE.MeshStandardMaterial({
        color: YELLOW,
        metalness: 0.22,
        roughness: 0.48,
      })
    );
    const yellowDeepMat = mat(
      new THREE.MeshStandardMaterial({
        color: YELLOW_DEEP,
        metalness: 0.22,
        roughness: 0.52,
      })
    );
    const blackMat = mat(
      new THREE.MeshStandardMaterial({
        color: BLACK,
        metalness: 0.3,
        roughness: 0.45,
      })
    );
    const jointMat = mat(
      new THREE.MeshStandardMaterial({
        color: JOINT,
        metalness: 0.45,
        roughness: 0.4,
      })
    );
    const rubberMat = mat(
      new THREE.MeshStandardMaterial({
        color: RUBBER,
        metalness: 0.1,
        roughness: 0.8,
      })
    );
    const lensMat = mat(
      new THREE.MeshStandardMaterial({
        color: GLASS,
        metalness: 0.4,
        roughness: 0.2,
        emissive: 0xffa028, // faint camera glint, RATFIRE amber
        emissiveIntensity: 0.5,
      })
    );

    // ================================================================
    // BLACK DETAIL TEXTURES — transparent canvases painted with black
    // service markings only; they ride overlay quads a hair off the
    // yellow shell so the lacquer shows through everywhere else.
    // ================================================================

    /** Shared material for the overlay detail panels. depthWrite stays
     *  OFF so the invisible (alpha 0) pixels never wall off the legs
     *  and shell behind the panel. */
    function makeDetailMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
      return mat(
        new THREE.MeshStandardMaterial({
          map,
          transparent: true,
          depthWrite: false,
          metalness: 0.2,
          roughness: 0.55,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        })
      );
    }

    /** Rounded-rect path helper (roundRect is broadly available but the
     *  manual arc version keeps the canvas code dependency-free). */
    function rr(
      g: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ): void {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    /** Rivet dot. */
    function rivet(
      g: CanvasRenderingContext2D,
      x: number,
      y: number,
      r: number,
      a = 0.7
    ): void {
      g.fillStyle = `rgba(10,10,10,${a})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.beginPath();
      g.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2);
      g.fill();
    }

    // ---- FLANK PANEL: canvas 1024×300 ↔ a 132×36 quad per side -------
    // canvas LEFT = chassis REAR, canvas RIGHT = chassis FRONT
    function makeSidePanelTexture(): THREE.CanvasTexture {
      const cv = document.createElement('canvas');
      cv.width = 1024;
      cv.height = 300;
      const g = cv.getContext('2d')!;
      const X = (z: number) => (z + 66) * (1024 / 132); // world z → px
      const Y = (y: number) => (100 - y) * (300 / 36); // world y → px
      const px = 1024 / 132; // px per world unit

      // panel seam grid — mid horizontal + four vertical stations
      g.strokeStyle = 'rgba(10,10,10,0.5)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(X(-64), Y(85));
      g.lineTo(X(-16), Y(85));
      g.moveTo(X(24), Y(85));
      g.lineTo(X(64), Y(85));
      g.stroke();
      for (const z of [-56, -20, 16, 48]) {
        g.beginPath();
        g.moveTo(X(z), Y(66.5));
        g.lineTo(X(z), Y(98));
        g.stroke();
      }

      // rivet rows along the top + bottom edges and beside the seams
      for (let z = -62; z <= 62; z += 7.5) {
        rivet(g, X(z), Y(96.5), 0.32 * px, 0.6);
        rivet(g, X(z), Y(67.5), 0.32 * px, 0.6);
      }
      for (const z of [-56, -20, 16, 48]) {
        rivet(g, X(z) - 5, Y(85), 0.28 * px, 0.65);
        rivet(g, X(z) + 5, Y(85), 0.28 * px, 0.65);
      }

      // black service panel (mid-flank) — RATFIRE livery
      g.fillStyle = '#121212';
      rr(g, X(-14), Y(94), X(24) - X(-14), Y(72) - Y(94), 10);
      g.fill();
      g.fillStyle = '#f2b40a';
      g.font = `900 ${Math.round(5.4 * px)}px ui-sans-serif, system-ui, Arial`;
      g.textBaseline = 'middle';
      g.fillText('RATFIRE', X(-10.5), Y(86));
      g.fillStyle = 'rgba(242,180,10,0.55)';
      g.font = `700 ${Math.round(2.5 * px)}px ui-sans-serif, system-ui, Arial`;
      g.fillText('QUADRUPED · K9', X(-10.5), Y(78));
      for (const [cz, cy] of [
        [-12.6, 92.6],
        [22.6, 92.6],
        [-12.6, 73.4],
        [22.6, 73.4],
      ]) {
        rivet(g, X(cz), Y(cy), 0.26 * px, 0.9);
      }

      // handle grooves (front half, above the hip)
      for (let i = 0; i < 4; i++) {
        const z = 31 + i * 4.6;
        g.fillStyle = 'rgba(10,10,10,0.82)';
        rr(g, X(z), Y(92), 1.3 * px, Y(74) - Y(92), 1.1 * px);
        g.fill();
        g.fillStyle = 'rgba(255,220,110,0.28)';
        g.fillRect(X(z) + 1.05 * px, Y(92), 0.35 * px, Y(74) - Y(92));
      }

      // vent slots (top front)
      for (let i = 0; i < 5; i++) {
        g.fillStyle = 'rgba(10,10,10,0.85)';
        rr(g, X(50 + i * 3.4), Y(96), 0.95 * px, Y(91.5) - Y(96), 3);
        g.fill();
      }

      // hazard chevron strip (bottom rear)
      g.save();
      g.beginPath();
      g.rect(X(-62), Y(73), X(-24) - X(-62), Y(67) - Y(73));
      g.clip();
      g.strokeStyle = 'rgba(10,10,10,0.8)';
      g.lineWidth = 0.9 * px;
      for (let s = X(-64); s < X(-22); s += 2.6 * px) {
        g.beginPath();
        g.moveTo(s, Y(74));
        g.lineTo(s + 2.2 * px, Y(66));
        g.stroke();
      }
      g.restore();

      // barcode + unit id (rear, above the chevrons)
      let bx = X(-58);
      let k = 0;
      while (bx < X(-40)) {
        const w = 0.35 + ((k * 7919) % 5) * 0.22;
        g.fillStyle = 'rgba(10,10,10,0.8)';
        g.fillRect(bx, Y(84), w * px, Y(76) - Y(84));
        bx += (w + 0.4) * px;
        k++;
      }
      g.fillStyle = 'rgba(10,10,10,0.75)';
      g.font = `800 ${Math.round(1.9 * px)}px ui-sans-serif, system-ui, Arial`;
      g.fillText('K9·04', X(-36), Y(80));

      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      texes.push(t);
      return t;
    }

    // ---- TOP DECK PANEL: canvas 512×1024 ↔ a 48×132 quad -------------
    // canvas TOP = chassis REAR, canvas BOTTOM = chassis FRONT
    function makeTopDeckTexture(): THREE.CanvasTexture {
      const cv = document.createElement('canvas');
      cv.width = 512;
      cv.height = 1024;
      const g = cv.getContext('2d')!;
      const X = (x: number) => (x + 24) * (512 / 48); // world x → px
      const Y = (z: number) => (z + 66) * (1024 / 132); // world z → px
      const pxY = 1024 / 132;

      // perimeter seam inset
      g.strokeStyle = 'rgba(10,10,10,0.5)';
      g.lineWidth = 4;
      rr(g, X(-21.5), Y(-63.5), X(21.5) - X(-21.5), Y(63.5) - Y(-63.5), 14);
      g.stroke();

      // battery bay outlines (frames sit just proud of the modules)
      g.strokeStyle = 'rgba(10,10,10,0.8)';
      g.lineWidth = 6;
      for (const [z0, z1] of [
        [-46.5, -13.5],
        [-12.5, 20.5],
      ]) {
        rr(g, X(-15), Y(z0), X(15) - X(-15), Y(z1) - Y(z0), 12);
        g.stroke();
        for (const cx of [-15, 15]) {
          for (const cz of [z0, z1]) {
            rivet(g, X(cx), Y(cz), 5, 0.85);
          }
        }
      }
      // cross rail seams between/around the bays
      g.strokeStyle = 'rgba(10,10,10,0.4)';
      g.lineWidth = 4;
      for (const z of [-13, 22, -50]) {
        g.beginPath();
        g.moveTo(X(-21), Y(z));
        g.lineTo(X(21), Y(z));
        g.stroke();
      }

      // cable raceways along both edges with cross ticks
      g.strokeStyle = 'rgba(10,10,10,0.45)';
      g.lineWidth = 5;
      for (const x of [-19, 19]) {
        g.beginPath();
        g.moveTo(X(x), Y(-60));
        g.lineTo(X(x), Y(60));
        g.stroke();
        g.lineWidth = 3;
        for (let z = -56; z <= 60; z += 8) {
          g.beginPath();
          g.moveTo(X(x) - 6, Y(z));
          g.lineTo(X(x) + 6, Y(z));
          g.stroke();
        }
        g.lineWidth = 5;
      }

      // tie-down pads
      for (const [x, z] of [
        [-14, -40],
        [14, -40],
        [-14, 36],
        [14, 36],
        [-20, 46],
        [20, 46],
      ]) {
        g.fillStyle = 'rgba(10,10,10,0.8)';
        rr(g, X(x) - 9, Y(z) - 9, 18, 18, 4);
        g.fill();
        g.fillStyle = 'rgba(242,180,10,0.35)';
        g.beginPath();
        g.arc(X(x), Y(z), 3.4, 0, Math.PI * 2);
        g.fill();
      }

      // non-slip dot grid (skips the occupied zones)
      const skip = (x: number, z: number): boolean =>
        (Math.abs(x) < 16.5 && z > -48 && z < 22) || // battery bays
        (Math.abs(x) < 12 && z < -48) || // antenna block
        (Math.abs(x) < 16 && z > 41) || // sensor pod
        (Math.abs(x) < 11 && z > 15 && z < 37) || // arm base
        Math.abs(Math.abs(x) - 19) < 2; // raceways
      g.fillStyle = 'rgba(10,10,10,0.32)';
      for (let x = -17; x <= 17; x += 3.9) {
        for (let z = -60; z <= 60; z += 3.9) {
          if (skip(x, z)) continue;
          g.beginPath();
          g.arc(X(x), Y(z), 3.2, 0, Math.PI * 2);
          g.fill();
        }
      }

      // stencil: unit id + warning triangle (rear flat, reads from above)
      g.fillStyle = 'rgba(10,10,10,0.78)';
      g.font = `800 ${Math.round(3.4 * pxY)}px ui-sans-serif, system-ui, Arial`;
      g.textBaseline = 'middle';
      g.fillText('K9 · 04', X(-13), Y(-46));
      g.strokeStyle = 'rgba(10,10,10,0.78)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(X(12), Y(-48.5));
      g.lineTo(X(15), Y(-43.5));
      g.lineTo(X(9), Y(-43.5));
      g.closePath();
      g.stroke();
      g.fillStyle = 'rgba(10,10,10,0.78)';
      g.fillRect(X(11.7), Y(-47.4), 1.6, 2.2);
      g.beginPath();
      g.arc(X(12.5), Y(-44.4), 0.9, 0, Math.PI * 2);
      g.fill();

      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      texes.push(t);
      return t;
    }

    const sidePanelMat = makeDetailMaterial(makeSidePanelTexture());
    const topDeckMat = makeDetailMaterial(makeTopDeckTexture());

    const root = new THREE.Group();
    root.name = 'spotPet';
    const body = new THREE.Group(); // bob + rock apply here
    root.add(body);
    scene.add(root);

    const mesh = (
      g: THREE.BufferGeometry,
      m: THREE.Material,
      x = 0,
      y = 0,
      z = 0
    ): THREE.Mesh => {
      const me = new THREE.Mesh(g, m);
      me.position.set(x, y, z);
      return me;
    };
    const box = (w: number, h: number, d: number) =>
      geo(new THREE.BoxGeometry(w, h, d));
    /** Rounded shell box — smooths the corners of every visible piece. */
    const rbox = (w: number, h: number, d: number, seg = 2, r = 2) =>
      geo(new RoundedBoxGeometry(w, h, d, seg, r));
    const cyl = (r: number, h: number, seg = 14) =>
      geo(new THREE.CylinderGeometry(r, r, h, seg));

    // ================================================================
    // CHASSIS + BACK HARDWARE
    // ================================================================
    const chassis = mesh(
      rbox(CHASSIS_W, CHASSIS_H, CHASSIS_L, 4, CHASSIS_R),
      yellowMat,
      0,
      CHASSIS_Y,
      0
    );
    body.add(chassis);
    // belly pan (black, slightly inset) gives the two-tone underside —
    // it stops SHORT of the rounded end corners so no black edge line
    // cuts across the back/front bottom corners of the shell
    body.add(mesh(rbox(CHASSIS_W - 10, 12, CHASSIS_L - 36, 2, 3.5), blackMat, 0, 64, 0));
    // top deck plate
    body.add(mesh(rbox(CHASSIS_W - 8, 4, CHASSIS_L - 10, 2, 1.6), yellowDeepMat, 0, 103, 0));

    // black detail panels — one per flank + one across the top deck
    const sidePanelGeo = geo(new THREE.PlaneGeometry(132, 36));
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(sidePanelGeo, sidePanelMat);
      p.position.set(sx * (CHASSIS_W / 2 + 0.8), 82, 0);
      p.rotation.y = (sx * Math.PI) / 2;
      body.add(p);
    }
    const topPanelGeo = geo(new THREE.PlaneGeometry(48, 132));
    const topPanel = new THREE.Mesh(topPanelGeo, topDeckMat);
    topPanel.rotation.x = -Math.PI / 2;
    topPanel.position.set(0, 105.4, 0);
    body.add(topPanel);

    // ---- FACE MODULE — tapered, back-tilted head panel (kills the
    //      square look): trapezoid plate + brow cap + chin + eyes ----
    const faceGroup = new THREE.Group();
    faceGroup.position.set(0, 84, 72.5);
    const FACE_TILT = -0.2; // ~11° back-lean, like the reference
    faceGroup.rotation.x = FACE_TILT;
    body.add(faceGroup);
    const faceShape = new THREE.Shape();
    faceShape.moveTo(-28, -17); // half-width 28 at the chin…
    faceShape.lineTo(28, -17);
    faceShape.lineTo(22, 17); // …22 at the brow — the taper
    faceShape.lineTo(-22, 17);
    faceShape.closePath();
    const faceGeo = geo(
      new THREE.ExtrudeGeometry(faceShape, {
        depth: 4,
        bevelEnabled: true,
        bevelThickness: 1.2,
        bevelSize: 1.2,
        bevelSegments: 2,
      })
    );
    faceGeo.translate(0, 0, -2);
    faceGroup.add(mesh(faceGeo, blackMat));
    // brow cap (yellow, overhangs the plate top) + chin lip
    faceGroup.add(mesh(rbox(47, 3.4, 7, 2, 1.4), yellowMat, 0, 18.6, 1.2));
    faceGroup.add(mesh(rbox(34, 3.4, 5.5, 2, 1.4), blackMat, 0, -18.4, 2.2));
    // camera eyes: dark sockets + amber lenses, set INTO the plate
    const socketGeo = geo(new THREE.CylinderGeometry(6.4, 6.4, 1.8, 16));
    const eyeGeo = geo(new THREE.CylinderGeometry(4.8, 4.8, 2.8, 16));
    for (const sx of [-1, 1]) {
      const socket = mesh(socketGeo, jointMat, sx * 12.5, 4, 3.2);
      socket.rotation.x = Math.PI / 2;
      faceGroup.add(socket);
      const eye = mesh(eyeGeo, lensMat, sx * 12.5, 4, 4.4);
      eye.rotation.x = Math.PI / 2;
      faceGroup.add(eye);
    }
    // chin vents
    for (let i = 0; i < 3; i++) {
      faceGroup.add(mesh(box(24, 1.4, 1), jointMat, 0, -8 - i * 3.5, 3.9));
    }

    // ---- rear service plate + fins ----
    body.add(mesh(rbox(CHASSIS_W - 12, 28, 3.4, 2, 1.5), blackMat, 0, 82, -CHASSIS_L / 2 - 1.2));
    for (let i = 0; i < 4; i++) {
      body.add(
        mesh(
          box(CHASSIS_W - 26, 1.8, 1.2),
          jointMat,
          0,
          72 + i * 5.4,
          -CHASSIS_L / 2 - 2.6
        )
      );
    }

    // ---- spine rails + battery modules ----
    for (const sx of [-1, 1]) {
      body.add(mesh(rbox(5, 5, 108, 2, 1.6), blackMat, sx * 14, 106.5, -4));
    }
    for (const z of [-45, -15, 15, 45]) {
      body.add(mesh(rbox(26, 3.6, 4, 2, 1.2), blackMat, 0, 106.5, z));
    }
    const batteryGeo = rbox(26, 16, 30, 3, 3.2);
    for (const z of [-30, 4]) {
      body.add(mesh(batteryGeo, blackMat, 0, 112, z));
      body.add(mesh(box(26, 3, 2), yellowDeepMat, 0, 112, z + 15.2));
    }

    // ---- rear antenna block: five whips, slight random lean ----
    body.add(mesh(rbox(20, 8, 16, 2, 2.2), blackMat, 0, 105.5, -58));
    const antennaGeo = geo(new THREE.CylinderGeometry(0.9, 1.3, 36, 8));
    const antennaLean = [-0.1, 0.06, -0.05, 0.1, 0.03];
    for (let i = 0; i < 5; i++) {
      const a = mesh(antennaGeo, blackMat, -8 + i * 4, 126, -58);
      a.rotation.z = antennaLean[i];
      a.rotation.x = (i % 2 === 0 ? 1 : -1) * 0.05;
      body.add(a);
    }

    // ---- front sensor pod (the forehead — pans on idle) ----
    const sensorPod = new THREE.Group();
    sensorPod.position.set(0, 109.5, 58);
    body.add(sensorPod);
    sensorPod.add(mesh(rbox(30, 14, 18, 3, 3), blackMat));
    const glassGeo = geo(new THREE.CylinderGeometry(6, 6, 2.2, 16));
    const glass = mesh(glassGeo, lensMat, 0, 0, 9.4);
    glass.rotation.x = Math.PI / 2;
    sensorPod.add(glass);
    for (const sx of [-1, 1]) {
      sensorPod.add(mesh(box(4, 10, 12), jointMat, sx * 15, 0, 0));
    }

    // ================================================================
    // ROBOTIC ARM — KUKA-style industrial manipulator on the top deck
    // (user reference photo: multi-joint arm, silver claw gripper).
    // Black bolted flange + tapered pedestal, yellow turret shoulder
    // with black cap discs, cable loop over the shell, bulbous upper
    // arm, capped elbow, tapered forearm, black wrist cuff, and a
    // SILVER two-finger claw. Holds the reference Z-pose; TRICK rears
    // it up, snaps the claw and waves.
    // ================================================================
    const armBase = new THREE.Group();
    armBase.position.set(0, 105, 33); // top deck: between battery + pod
    body.add(armBase);
    // bolted mounting flange + tapered pedestal (black, like the ref)
    armBase.add(mesh(rbox(26, 4, 26, 2, 1.8), blackMat, 0, 1.7, 0));
    const armBoltGeo = geo(new THREE.CylinderGeometry(1.3, 1.3, 1.8, 8));
    for (const [bx, bz] of [
      [-9.5, -9.5],
      [9.5, -9.5],
      [-9.5, 9.5],
      [9.5, 9.5],
    ]) {
      armBase.add(mesh(armBoltGeo, jointMat, bx, 4.2, bz));
    }
    armBase.add(
      mesh(geo(new THREE.CylinderGeometry(8.2, 11.6, 9, 18)), blackMat, 0, 8.5, 0)
    );

    const armShoulder = new THREE.Group();
    armShoulder.position.y = 14;
    armBase.add(armShoulder);
    // turret shell + black cap discs on both flanks (ref shoulder)
    armShoulder.add(mesh(rbox(19, 17, 23, 4, 5.5), yellowMat, 0, 7, 0));
    const shoulderCapGeo = geo(new THREE.CylinderGeometry(7.2, 7.2, 2.2, 16));
    shoulderCapGeo.rotateZ(Math.PI / 2);
    armShoulder.add(mesh(shoulderCapGeo, blackMat, -10, 7, 0));
    armShoulder.add(mesh(shoulderCapGeo, blackMat, 10, 7, 0));
    // power cable looping out of the shell over the shoulder (ref)
    const armCableGeo = geo(
      new THREE.TorusGeometry(7.8, 1.15, 8, 18, Math.PI * 0.62)
    );
    armCableGeo.rotateY(Math.PI / 2);
    armShoulder.add(mesh(armCableGeo, blackMat, 0, 8, -8.8));

    // upper arm — bulbous yellow shell rising from the turret
    const upperArmGeo = geo(new RoundedBoxGeometry(14.5, 38, 18, 3, 5.5));
    upperArmGeo.translate(0, 19, 0);
    armShoulder.add(mesh(upperArmGeo, yellowMat));

    const armElbow = new THREE.Group();
    armElbow.position.y = 38;
    armShoulder.add(armElbow);
    // elbow axle with black caps (ref elbow)
    const elbowAxleGeo = geo(cyl(7, 16, 16));
    elbowAxleGeo.rotateZ(Math.PI / 2); // hinge axle along X
    armElbow.add(mesh(elbowAxleGeo, yellowMat));
    const elbowCapGeo = geo(new THREE.CylinderGeometry(6.2, 6.2, 2.4, 14));
    elbowCapGeo.rotateZ(Math.PI / 2);
    armElbow.add(mesh(elbowCapGeo, blackMat, -8.6, 0, 0));
    armElbow.add(mesh(elbowCapGeo, blackMat, 8.6, 0, 0));

    // forearm — tapering shell toward the wrist
    const forearmGeo = geo(new RoundedBoxGeometry(11.5, 32, 13.5, 3, 4.6));
    forearmGeo.translate(0, 16, 0);
    armElbow.add(mesh(forearmGeo, yellowMat));

    const armWrist = new THREE.Group();
    armWrist.position.y = 32;
    armElbow.add(armWrist);
    const wristAxleGeo = geo(cyl(4.6, 11, 12));
    wristAxleGeo.rotateZ(Math.PI / 2);
    armWrist.add(mesh(wristAxleGeo, blackMat));
    armWrist.add(mesh(rbox(9.5, 9.5, 10, 2, 2.6), blackMat, 0, 5.5, 0));

    // ---- silver claw gripper: palm block + two curled prongs ----
    const silverMat = mat(
      new THREE.MeshStandardMaterial({
        color: 0xc7ccd2,
        metalness: 0.85,
        roughness: 0.28,
      })
    );
    armWrist.add(mesh(rbox(10.5, 7, 11, 2, 2.2), silverMat, 0, 13, 0));
    const prongGeo = geo(new THREE.BoxGeometry(3.4, 12, 3.8));
    prongGeo.translate(0, 6, 0);
    const prongTipGeo = geo(new THREE.BoxGeometry(3.2, 9, 3));
    prongTipGeo.translate(0, 4.5, 0);
    const knuckleGeo = geo(cyl(2.1, 4.8, 10));
    knuckleGeo.rotateZ(Math.PI / 2);
    const makeProng = (side: 1 | -1): THREE.Group => {
      // side 1 = upper prong (splays toward −Z = up in the display pose)
      const prong = new THREE.Group();
      prong.position.y = 16.5;
      prong.rotation.x = -side * 0.55;
      prong.add(mesh(knuckleGeo, jointMat));
      prong.add(mesh(prongGeo, silverMat));
      const tip = new THREE.Group();
      tip.position.y = 12;
      tip.rotation.x = side * 1.05; // claw curls back toward the axis
      tip.add(mesh(prongTipGeo, silverMat));
      prong.add(tip);
      return prong;
    };
    const prongTop = makeProng(1);
    const prongBot = makeProng(-1);
    armWrist.add(prongTop);
    armWrist.add(prongBot);

    // ---- arm detailing in BLACK — decal labels + trim, matching the
    //      body livery. Transparent canvas overlays carry the crisp
    //      markings (the rounded shells' own UVs are unusable); 3D trim
    //      pieces (collar sleeves, vents, bolts, junction box) finish
    //      the industrial look. ----
    /** Slim service label for the upper-arm flanks: black end bands,
     *  hazard chevrons, rivet rails and along-the-limb stencil text. */
    function makeArmSideTexture(): THREE.CanvasTexture {
      const cv = document.createElement('canvas');
      cv.width = 128;
      cv.height = 512;
      const g = cv.getContext('2d')!;
      // top + bottom black bands
      g.fillStyle = 'rgba(12,12,12,0.92)';
      g.fillRect(0, 0, 128, 54);
      g.fillRect(0, 458, 128, 54);
      // hazard chevrons inside the bottom band
      g.save();
      g.beginPath();
      g.rect(0, 458, 128, 54);
      g.clip();
      g.strokeStyle = 'rgba(242,180,10,0.55)';
      g.lineWidth = 10;
      for (let x = -30; x < 160; x += 26) {
        g.beginPath();
        g.moveTo(x, 512);
        g.lineTo(x + 30, 458);
        g.stroke();
      }
      g.restore();
      // vertical seam rails + rivet columns
      g.strokeStyle = 'rgba(10,10,10,0.55)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(18, 54);
      g.lineTo(18, 458);
      g.moveTo(110, 54);
      g.lineTo(110, 458);
      g.stroke();
      for (let y = 92; y < 440; y += 42) {
        rivet(g, 18, y, 5, 0.7);
        rivet(g, 110, y, 5, 0.7);
      }
      // along-the-limb stencil (reads like a real manipulator label)
      g.save();
      g.translate(78, 256);
      g.rotate(Math.PI / 2);
      g.fillStyle = 'rgba(10,10,10,0.85)';
      g.font = '900 46px ui-sans-serif, system-ui, Arial';
      g.textBaseline = 'middle';
      g.fillText('K9·04', -60, -14);
      g.fillStyle = 'rgba(10,10,10,0.55)';
      g.font = '700 26px ui-sans-serif, system-ui, Arial';
      g.fillText('SERVO ARM', -60, 26);
      g.restore();
      // warning triangle + exclamation
      g.strokeStyle = 'rgba(10,10,10,0.8)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(64, 372);
      g.lineTo(84, 406);
      g.lineTo(44, 406);
      g.closePath();
      g.stroke();
      g.fillStyle = 'rgba(10,10,10,0.8)';
      g.fillRect(61, 380, 6, 14);
      g.beginPath();
      g.arc(64, 400, 3.2, 0, Math.PI * 2);
      g.fill();
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      texes.push(t);
      return t;
    }

    /** Slim barcode + ticks label for the forearm flanks. */
    function makeForearmTexture(): THREE.CanvasTexture {
      const cv = document.createElement('canvas');
      cv.width = 96;
      cv.height = 512;
      const g = cv.getContext('2d')!;
      // black end bands with yellow pips
      g.fillStyle = 'rgba(12,12,12,0.92)';
      g.fillRect(0, 0, 96, 44);
      g.fillRect(0, 468, 96, 44);
      g.fillStyle = 'rgba(242,180,10,0.6)';
      g.fillRect(14, 16, 68, 10);
      g.fillRect(14, 486, 68, 10);
      // barcode column
      let by = 70;
      let k = 0;
      while (by < 210) {
        const h = 8 + ((k * 6151) % 5) * 6;
        g.fillStyle = 'rgba(10,10,10,0.8)';
        g.fillRect(20, by, 56, h);
        by += h + 10;
        k++;
      }
      // hazard chevron band mid-limb
      g.save();
      g.beginPath();
      g.rect(0, 236, 96, 64);
      g.clip();
      g.strokeStyle = 'rgba(10,10,10,0.85)';
      g.lineWidth = 14;
      for (let y = 200; y < 340; y += 30) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(96, y + 40);
        g.stroke();
      }
      g.restore();
      // servo tick ruler
      g.strokeStyle = 'rgba(10,10,10,0.6)';
      g.lineWidth = 4;
      for (let y = 330; y < 452; y += 17) {
        g.beginPath();
        g.moveTo(30, y);
        g.lineTo(y % 34 === 28 ? 66 : 50, y);
        g.stroke();
      }
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      texes.push(t);
      return t;
    }

    const armSideMat = makeDetailMaterial(makeArmSideTexture());
    const forearmMat = makeDetailMaterial(makeForearmTexture());
    // upper-arm flank labels (flat region 7×27 — decal 6.4×26 fits)
    const armSideGeo = geo(new THREE.PlaneGeometry(6.4, 26));
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(armSideGeo, armSideMat);
      p.position.set(sx * 7.37, 19, 0);
      p.rotation.y = (sx * Math.PI) / 2;
      armShoulder.add(p);
    }
    // forearm flank labels (flat region 4.3×22.8 — decal 4×22 fits)
    const forearmDecalGeo = geo(new THREE.PlaneGeometry(4, 22));
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(forearmDecalGeo, forearmMat);
      p.position.set(sx * 5.87, 16, 0);
      p.rotation.y = (sx * Math.PI) / 2;
      armElbow.add(p);
    }
    // black collar sleeves clamping both arm segments
    armShoulder.add(mesh(rbox(15.7, 3, 19.2, 2, 1.4), blackMat, 0, 4, 0));
    armShoulder.add(mesh(rbox(15.7, 3, 19.2, 2, 1.4), blackMat, 0, 34, 0));
    armElbow.add(mesh(rbox(12.5, 2.8, 14.5, 2, 1.3), blackMat, 0, 28.5, 0));
    // vent slats on the upper-arm face + cable junction box on the back
    const armVentGeo = geo(box(2.4, 5, 0.7));
    for (const vy of [12, 19, 26]) {
      armShoulder.add(mesh(armVentGeo, blackMat, 0, vy, 9.1));
    }
    armShoulder.add(mesh(rbox(4, 6, 2.4, 2, 1), blackMat, 0, 10, -9.6));
    // turret face bolts (black hardware, like the flange)
    for (const tx of [-3.8, 3.8]) {
      const b = mesh(armBoltGeo, jointMat, tx, 7, 11.7);
      b.rotation.x = Math.PI / 2;
      armShoulder.add(b);
    }

    // ================================================================
    // LEGS — hip module + upper (yellow) + knee + lower (black) + foot
    // (lightly bigger than v1: +5 length per segment, thicker shells)
    // ================================================================
    interface LegRig {
      hip: THREE.Group;
      knee: THREE.Group;
      baseHip: number;
      baseKnee: number;
      offset: number; // trot phase offset
    }
    const legs: LegRig[] = [];
    const upperLegGeo = geo(new RoundedBoxGeometry(15, UPPER_LEN, 19.5, 3, 3.4));
    upperLegGeo.translate(0, -UPPER_LEN / 2, 0);
    const lowerLegGeo = geo(new RoundedBoxGeometry(9.5, LOWER_LEN, 11.5, 3, 2.6));
    lowerLegGeo.translate(0, -LOWER_LEN / 2, 0);
    const hipModuleGeo = geo(new THREE.CylinderGeometry(HIP_R, HIP_R, 17, 16));
    hipModuleGeo.rotateZ(Math.PI / 2); // axle along X
    const kneeGeo = geo(new THREE.CylinderGeometry(KNEE_R, KNEE_R, 12, 12));
    kneeGeo.rotateZ(Math.PI / 2);
    const footGeo = geo(new THREE.SphereGeometry(FOOT_R, 12, 10));

    for (const front of [true, false]) {
      for (const sx of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(sx * HIP_X, HIP_Y, front ? HIP_Z : -HIP_Z);
        body.add(hip);
        hip.add(mesh(hipModuleGeo, jointMat)); // side axle
        hip.add(
          mesh(geo(new THREE.SphereGeometry(HIP_R * 0.72, 12, 10)), yellowMat)
        );
        const upper = mesh(upperLegGeo, yellowMat);
        upper.position.y = -2;
        hip.add(upper);

        const knee = new THREE.Group();
        knee.position.y = -UPPER_LEN - 2;
        hip.add(knee);
        knee.add(mesh(kneeGeo, jointMat));
        knee.add(mesh(lowerLegGeo, blackMat, 0, -3, 0));
        const foot = mesh(footGeo, rubberMat, 0, -LOWER_LEN + 1, 0);
        foot.scale.set(1, 0.72, 1.15);
        knee.add(foot);

        // front: hip back + knee folds the shin forward (knee points
        // back); rear mirrored (knee points forward) — like the photo
        const s = front ? 1 : -1;
        legs.push({
          hip,
          knee,
          baseHip: s * HIP_BASE,
          baseKnee: -s * KNEE_BASE,
          // trot: diagonal pairs share a phase (FL+RR, FR+RL)
          offset: (front ? sx > 0 : sx < 0) ? 0 : Math.PI,
        });
      }
    }

    // ---- shadows ----
    if (!opts.lowSpec) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.castShadow = true;
      });
    }

    // ================================================================
    // RIG STATE + PROCEDURAL ANIMATION
    // ================================================================
    let gaitPhase = 0;
    let speedSm = 0;
    let elapsed = 0;
    let clip = 'Idle';
    let oneShot: 'Trick' | 'Hop' | null = null;
    /** one-shot timeline cursor; < 0 = finished/inactive */
    let shotT = -1;
    const prevPos = new THREE.Vector3();
    // pooled per-frame scratch — the follow brain allocates nothing,
    // keeping the steady-state GC garbage at zero
    const _forward = new THREE.Vector3();
    const _right = new THREE.Vector3();
    const _target = new THREE.Vector3();
    // display Z-pose (the reference photo silhouette) + claw splay
    const POSE_SHOULDER = 0.32;
    const POSE_ELBOW = 1.0;
    const POSE_WRIST = 0.1;
    const FINGER_OPEN = 0.55;
    const FINGER_CLOSED = 0.07;

    function update(
      dt: number,
      playerPos: THREE.Vector3,
      playerYaw: number
    ): void {
      if (!root.visible) return;
      elapsed += dt;

      // ---- one-shot timelines run even while parked ----
      let trickK = 0; // 0 = folded, 1 = fully raised
      let hopK = 0;
      if (oneShot === 'Trick') {
        shotT += dt;
        const T = 1.5;
        if (shotT >= T) {
          oneShot = null;
          shotT = -1;
        } else if (shotT < 0.35) {
          const k = shotT / 0.35;
          trickK = 1 - (1 - k) * (1 - k); // ease-out raise
        } else if (shotT < 1.0) {
          trickK = 1;
        } else {
          const k = (shotT - 1.0) / 0.5;
          trickK = 1 - k * k; // ease-in fold back
        }
        clip = 'Trick';
      } else if (oneShot === 'Hop') {
        shotT += dt;
        const T = 0.55;
        if (shotT >= T) {
          oneShot = null;
          shotT = -1;
        } else {
          hopK = Math.sin((shotT / T) * Math.PI);
        }
        clip = 'Hop';
      }

      // ---- brain: formation slot behind the player's right shoulder
      //      (pooled scratch vectors — zero per-frame allocations) ----
      const forward = _forward.set(
        Math.sin(playerYaw),
        0,
        Math.cos(playerYaw)
      );
      const right = _right.set(
        Math.cos(playerYaw),
        0,
        -Math.sin(playerYaw)
      );
      const target = _target
        .copy(playerPos)
        .addScaledVector(forward, -FOLLOW_BACK)
        .addScaledVector(right, FOLLOW_SIDE);

      const dx = target.x - root.position.x;
      const dz = target.z - root.position.z;
      const dist = Math.hypot(dx, dz);

      if (
        root.position.distanceTo(playerPos) > TELEPORT_DIST ||
        !Number.isFinite(root.position.x)
      ) {
        root.position.set(target.x, 0, target.z);
      }
      root.position.y = opts.heightAt(root.position.x, root.position.z);

      let moving = false;
      if (dist > ARRIVE_DIST) {
        moving = true;
        const cap = dist > 420 ? RUN_CAP : WALK_MAX + 60;
        const speed = Math.min(cap, dist * 2.6);
        const step = Math.min(speed * dt, dist);
        root.position.x += (dx / dist) * step;
        root.position.z += (dz / dist) * step;
        // face the run direction (shortest-arc absolute smoothing — no
        // incremental drift, the DART lesson applied to legs)
        const desired = Math.atan2(dx, dz);
        let delta = desired - root.rotation.y;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        root.rotation.y += delta * Math.min(1, 10 * dt);
      } else {
        const desired = Math.atan2(
          playerPos.x - root.position.x,
          playerPos.z - root.position.z
        );
        let delta = desired - root.rotation.y;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        root.rotation.y += delta * Math.min(1, 6 * dt);
      }

      // ---- measured speed drives the gait ----
      const moved = Math.hypot(
        root.position.x - prevPos.x,
        root.position.z - prevPos.z
      );
      prevPos.copy(root.position);
      const speed = moving ? moved / Math.max(dt, 1e-4) : 0;
      speedSm += (speed - speedSm) * Math.min(1, 8 * dt);
      const strideK = Math.min(1, speedSm / 320); // 0 park .. 1 flat-out

      if (oneShot === null) {
        clip = moving ? 'Trot' : 'Idle';
      }

      // ---- gait: diagonal pairs, sine swing + cosine knee lift ----
      gaitPhase +=
        dt *
        2 *
        Math.PI *
        Math.min(
          STRIDE_HZ_MAX,
          Math.max(STRIDE_HZ_MIN, speedSm * STRIDE_HZ_PER_SPEED)
        );
      const amp = SWING * (0.35 + 0.65 * strideK);
      const lift = LIFT * (0.3 + 0.7 * strideK);
      for (const leg of legs) {
        const phi = gaitPhase + leg.offset;
        const swingT = (Math.sin(phi) + 1) / 2; // 0 back .. 1 forward
        leg.hip.rotation.x =
          leg.baseHip + (swingT * 2 - 1) * amp - hopK * 0.45;
        leg.knee.rotation.x =
          leg.baseKnee +
          Math.max(0, Math.cos(phi)) * lift +
          hopK * (leg.baseKnee < 0 ? -0.6 : 0.6);
      }

      // ---- body bob, rock, lean; breathing + hop bounce when parked ----
      const bob = Math.abs(Math.sin(gaitPhase)) * 2.6 * strideK;
      body.position.y =
        BODY_LIFT +
        bob +
        Math.sin(elapsed * 1.8) * 0.9 * (1 - strideK) +
        hopK * 26;
      body.rotation.z = Math.sin(gaitPhase) * 0.05 * strideK;
      body.rotation.x =
        Math.sin(gaitPhase * 2) * 0.018 * strideK - 0.03 * strideK;
      body.rotation.y = 0;

      // ---- sensor pod: scan while parked, lock forward on the run;
      //      the face nods with it and dips on hops ----
      const scan = Math.sin(elapsed * 0.7) * 0.55 * (1 - strideK);
      sensorPod.rotation.y += (scan - sensorPod.rotation.y) * Math.min(1, 5 * dt);
      faceGroup.rotation.x =
        FACE_TILT +
        Math.sin(elapsed * 0.7 + 0.8) * 0.05 * (1 - strideK) +
        hopK * 0.12;

      // ---- robotic arm: reference Z-pose with a gentle idle sway;
      //      TRICK rears it up, snaps the claw shut and waves ----
      armShoulder.rotation.x = POSE_SHOULDER - trickK * 0.85;
      armElbow.rotation.x = POSE_ELBOW - trickK * 0.45;
      armWrist.rotation.x = POSE_WRIST + trickK * 0.25;
      const pinch =
        Math.min(1, Math.max(0, (trickK - 0.3) * 5)) *
        Math.min(1, Math.max(0, (0.92 - trickK) * 5));
      const splay = FINGER_OPEN + (FINGER_CLOSED - FINGER_OPEN) * pinch;
      prongTop.rotation.x = -splay;
      prongBot.rotation.x = splay;
      armWrist.rotation.z = trickK > 0.9 ? Math.sin(elapsed * 9) * 0.25 : 0;
      armBase.rotation.y =
        trickK * Math.sin(elapsed * 3.1) * 0.12 +
        Math.sin(elapsed * 0.6) * 0.05 * (1 - strideK);
    }

    function playTrick(): void {
      if (root.visible && oneShot !== 'Trick') {
        oneShot = 'Trick';
        shotT = 0;
      }
    }
    function playHop(): void {
      if (root.visible && oneShot !== 'Hop') {
        oneShot = 'Hop';
        shotT = 0;
      }
    }
    function debug(): { clip: string; oneShot: string | null; dead: boolean } {
      return { clip, oneShot, dead: false };
    }

    // ---- stats + teardown ----
    let triangles = 0;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const g = m.geometry as THREE.BufferGeometry;
        triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
      }
    });

    function dispose(): void {
      scene.remove(root);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texes) t.dispose();
    }

    return {
      group: root,
      update,
      playTrick,
      playHop,
      debug,
      stats: {
        animations: ['Trot', 'Idle', 'Trick', 'Hop'],
        triangles: Math.round(triangles),
      },
      dispose,
    };
  });
}
