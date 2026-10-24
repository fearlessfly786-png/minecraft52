/**
 * WIDOW — RATFIRE's fifth pet: the ROBOTIC SPIDER.
 *
 * Built entirely from three.js primitives (no model to stream) after the
 * classic static-robot-spider renders: a low-slung armored cephalothorax
 * hauling a bulbous segmented abdomen, eight arching legs with knees that
 * ride ABOVE the body line, a cluster of glowing eyes, articulated fangs
 * and feelers, spinneret nozzles at the rear tip and sensor whips on the
 * carapace.
 *
 * ULTRA-DETAIL PBR SKIN (user request):
 *   - three AI-generated 1024² albedo maps served from /textures/spider/
 *     (gunmetal hex-armor plating, carbon-fiber shell segments with glowing
 *     amber energy seams, machined joint hardware with cabling) — the same
 *     recipe as the loot chests' ultrarealistic kit: for every albedo a
 *     tangent-space NORMAL map is derived at boot (Sobel over luminance)
 *     and the metals reflect a tiny procedural equirect environment map.
 *   - the abdomen doubles its albedo as an EMISSIVE map, so the painted
 *     amber seams genuinely glow and pulse with the core rhythm.
 *   - crisp RATFIRE livery (WIDOW stencil, unit id, hazard chevrons,
 *     barcode, panel seams, rivets) rides transparent canvas overlay
 *     quads a hair off the shell — same technique as SPOT's panels.
 *
 * EIGHT-LEGGED LOCOMOTION (no skinned clips — a real procedural rig):
 *   - 2-BONE IK PER LEG  every tick solves femur/tibia angles to a foot
 *     target (law of cosines), so the knees arch like a true spider and
 *     the feet PLANT on the terrain through `heightAt`.
 *   - PLANTED-FOOT GAIT  feet hold still until they drift too far from
 *     their rest slot, then step along a lift arc — alternating tetrapod
 *     groups (L1·R2·L3·R4 / R1·L2·R4·L3) like a real arachnid, with a
 *     force-step escape hatch so fast turns never stretch a leg.
 *   - TERRAIN DANCE  the body samples the ground fore/aft + left/right
 *     and leans into slopes; body height rides the average foot line.
 *   - THREAT DISPLAY  one-shot (player opened fire): rears up, raises the
 *     front two leg pairs, flares the eyes and spreads the fangs.
 *   - HOP  one-shot (player jumped): a springy bounce with a leg splay.
 *   - CURL  plays while the PLAYER is down: legs fold under, the body
 *     drops flat, the eyes gutter out — revives with the player.
 *
 * The follow brain mirrors SPARK/SPOT: slot behind the player, walk when
 * close, run when left behind, teleport if hopeless, face the player
 * while parked. Forward is +Z at yaw 0 (same convention as the others).
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface SpiderPetOptions {
  /** Low-end devices: no shadow casting. */
  lowSpec?: boolean;
  /** Terrain height query — the spider walks the same ground you do. */
  heightAt: (x: number, z: number) => number;
}

export interface SpiderPet {
  /** Root group — already added to the scene you passed in. */
  group: THREE.Group;
  /** Drive one tick: follow the player + run the IK rig. */
  update(dt: number, playerPos: THREE.Vector3, playerYaw: number): void;
  /** One-shot: threat display — rear up, front legs raised (attacked). */
  playThreat(): void;
  /** One-shot: springy hop (player jumped). */
  playHop(): void;
  /** Legs curl under + eyes gutter (player died). Idempotent per tick. */
  playDeath(): void;
  /** Unfold + relight (player respawned). Idempotent per tick. */
  revive(): void;
  /** Live state probe (debug surfaces + automated verification). */
  debug(): {
    clip: string;
    oneShot: string | null;
    dead: boolean;
    stepping: number;
  };
  /** Build stats for debug surfaces. */
  stats: { animations: string[]; triangles: number };
  /** Free geometries, materials and textures. */
  dispose(): void;
}

// ------------------------------------------------------------------
// palette + dimensions (world units — the player stands 190 tall)
// ------------------------------------------------------------------
const SHELL = 0x2e3134; // flat fallback until the armor albedo lands
const CARBON = 0x1b1c1e; // abdomen fallback
const DARK = 0x141517; // underside + trim
const GLOW = 0xff7a26; // RATFIRE ember seams
const EYE = 0xff4a1c; // eye cluster

// cephalothorax (the front body shell)
const CEP_W = 76;
const CEP_H = 42;
const CEP_D = 70;
const CEP_Y = 64; // shell centre height
// abdomen (the rear bulb)
const ABD_R = 47;
const ABD_Y = 72;
const ABD_Z = -74;

// legs — 4 pairs, front → back. Hips ride the LOW shell rim so the
// knee-up IK naturally throws the arch: femur rises above the hip,
// tibia descends wide — the classic spider triangle.
const ATTACH_X = 30; // hip offset from centreline
const ATTACH_Y = 42; // hip pivot height (shell lower rim)
const ATTACH_Z = [36, 14, -8, -30]; // hip row positions
const SPLAY = [0.95, 0.35, -0.25, -0.85]; // yaw off pure-lateral (+ = front)
const REST_R = [124, 112, 112, 104]; // foot rest radius from centre
const FEMUR = 60; // upper segment length
const TIBIA = 70; // lower segment length
const HIP_R = 10.5;
const KNEE_R = 8;
const FOOT_R = 6;

// gait tuning
const STEP_DIST = 30; // start a step when the foot drifts this far
const FORCE_DIST = 62; // …unless it stretched this far (then step NOW)
const STEP_TIME = 0.21; // seconds per step at full stride
const STEP_LIFT = 17; // foot arc height
const GROUP_PERIOD = 0.3; // alternates tetrapod groups while moving

// follow brain (mirrors SPOT/SPARK)
const FOLLOW_BACK = 128;
const FOLLOW_SIDE = 108;
const ARRIVE_DIST = 28;
const WALK_MAX = 390;
const RUN_CAP = 720;
const TELEPORT_DIST = 1500;

/** Texture sources under public/. */
const ARMOR_URL = '/textures/spider/armor-albedo.png';
const ABDOMEN_URL = '/textures/spider/abdomen-albedo.png';
const JOINT_URL = '/textures/spider/joint-albedo.png';

/** Sobel strength for the derived normal maps (albedo dark = recessed). */
const NORMAL_STRENGTH = 2.4;

export function createSpiderPet(
  scene: THREE.Scene,
  opts: SpiderPetOptions
): Promise<SpiderPet> {
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

    // ================================================================
    // ULTRA-DETAIL PBR KIT — tiny procedural env map + async albedo
    // attach with Sobel-derived normal maps (chestPbr recipe).
    // ================================================================
    function createEnvTexture(): THREE.CanvasTexture {
      const w = 256;
      const h = 128;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#a9cdf6');
        sky.addColorStop(0.42, '#e8f2fc');
        sky.addColorStop(0.5, '#e6d9b8');
        sky.addColorStop(0.6, '#77603c');
        sky.addColorStop(1, '#413726');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
        const sx = w * 0.22;
        const sy = h * 0.16;
        const sun = ctx.createRadialGradient(sx, sy, 2, sx, sy, 26);
        sun.addColorStop(0, 'rgba(255,255,250,1)');
        sun.addColorStop(0.4, 'rgba(255,240,190,0.85)');
        sun.addColorStop(1, 'rgba(255,240,190,0)');
        ctx.fillStyle = sun;
        ctx.fillRect(0, 0, w, h);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }
    const env = createEnvTexture();
    texes.push(env);

    const disposed = { value: false };

    /** Sobel over a 512² luminance downscale → tangent-space normals. */
    function makeNormalMap(img: HTMLImageElement): THREE.CanvasTexture | null {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, size, size);
      let src: Uint8ClampedArray;
      try {
        src = ctx.getImageData(0, 0, size, size).data;
      } catch {
        return null;
      }
      const out = ctx.createImageData(size, size);
      const dst = out.data;
      const lum = (i: number) =>
        (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
      for (let y = 0; y < size; y++) {
        const yu = ((y - 1 + size) % size) * size;
        const yc = y * size;
        const yd = ((y + 1) % size) * size;
        for (let x = 0; x < size; x++) {
          const xl = (x - 1 + size) % size;
          const xr = (x + 1) % size;
          const dx = lum((yc + xr) * 4) - lum((yc + xl) * 4);
          const dy = lum((yd + x) * 4) - lum((yu + x) * 4);
          const nx = -dx * NORMAL_STRENGTH;
          const ny = dy * NORMAL_STRENGTH;
          const len = Math.hypot(nx, ny, 1);
          const i = (yc + x) * 4;
          dst[i] = ((nx / len) * 0.5 + 0.5) * 255;
          dst[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
          dst[i + 2] = (1 / len * 0.5 + 0.5) * 255;
          dst[i + 3] = 255;
        }
      }
      ctx.putImageData(out, 0, 0);
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }

    /** Async: albedo + derived normal map land on the material without
     *  stalling the spawn (flat-color fallback until then). */
    function attach(
      url: string,
      target: THREE.MeshStandardMaterial,
      normalScale: number,
      alsoEmissive = false
    ): void {
      new THREE.TextureLoader().load(
        url,
        (tex) => {
          if (disposed.value) {
            tex.dispose();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.anisotropy = 4;
          const nrm = makeNormalMap(tex.image as HTMLImageElement);
          target.map = tex;
          if (nrm) {
            target.normalMap = nrm;
            target.normalScale.set(normalScale, normalScale);
            texes.push(nrm);
          }
          if (alsoEmissive) {
            // dark shell pixels ≈ no glow; painted amber seams light up
            target.emissiveMap = tex;
            target.emissive.set(0xffa040);
            target.emissiveIntensity = 0.75;
          }
          target.needsUpdate = true;
          texes.push(tex);
        },
        undefined,
        () => {
          /* keep the flat-color fallback on load failure */
        }
      );
    }

    const armorMat = mat(
      new THREE.MeshStandardMaterial({
        color: SHELL,
        metalness: 0.72,
        roughness: 0.44,
        envMap: env,
        envMapIntensity: 0.7,
      })
    );
    const abdomenMat = mat(
      new THREE.MeshStandardMaterial({
        color: CARBON,
        metalness: 0.55,
        roughness: 0.52,
        envMap: env,
        envMapIntensity: 0.45,
      })
    );
    const jointMat = mat(
      new THREE.MeshStandardMaterial({
        color: 0x232527,
        metalness: 0.85,
        roughness: 0.36,
        envMap: env,
        envMapIntensity: 0.8,
      })
    );
    const darkMat = mat(
      new THREE.MeshStandardMaterial({
        color: DARK,
        metalness: 0.7,
        roughness: 0.55,
      })
    );
    const rubberMat = mat(
      new THREE.MeshStandardMaterial({
        color: 0x0c0c0c,
        metalness: 0.1,
        roughness: 0.9,
      })
    );
    const eyeMat = mat(
      new THREE.MeshStandardMaterial({
        color: 0x050505,
        metalness: 0.3,
        roughness: 0.25,
        emissive: EYE,
        emissiveIntensity: 2.4,
      })
    );
    const glowMat = mat(
      new THREE.MeshStandardMaterial({
        color: 0x200a02,
        metalness: 0.4,
        roughness: 0.4,
        emissive: GLOW,
        emissiveIntensity: 1.5,
      })
    );

    attach(ARMOR_URL, armorMat, 1.1);
    attach(ABDOMEN_URL, abdomenMat, 1.25, true);
    attach(JOINT_URL, jointMat, 0.9);

    // ================================================================
    // LIVERY DECALS — transparent canvases with crisp black markings
    // (the generated albedos carry no text; overlays add the service
    // stencil like SPOT's flank panels).
    // ================================================================
    function makeDetailMaterial(map: THREE.CanvasTexture): THREE.MeshStandardMaterial {
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
    function rivet(
      g: CanvasRenderingContext2D,
      x: number,
      y: number,
      r: number,
      a = 0.7
    ): void {
      g.fillStyle = `rgba(225,228,232,${a})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.arc(x + r * 0.3, y + r * 0.3, r * 0.4, 0, Math.PI * 2);
      g.fill();
    }

    // ---- CARAPACE TOP: canvas 512×512 ↔ a 70×62 quad on the shell ----
    // canvas LEFT = body REAR, canvas RIGHT = body FRONT
    function makeCarapaceTexture(): THREE.CanvasTexture {
      const cv = document.createElement('canvas');
      cv.width = 512;
      cv.height = 512;
      const g = cv.getContext('2d')!;
      const X = (z: number) => (z + 35) * (512 / 70); // world z → px
      const Y = (x: number) => (x + 31) * (512 / 62); // world x → px
      const px = 512 / 70;

      // perimeter seam + inner frame
      g.strokeStyle = 'rgba(215,218,222,0.55)';
      g.lineWidth = 4;
      g.strokeRect(X(-32), Y(-29), X(32) - X(-32), Y(29) - Y(-29));
      g.strokeStyle = 'rgba(215,218,222,0.3)';
      g.lineWidth = 2;
      g.strokeRect(X(-27), Y(-25), X(27) - X(-27), Y(25) - Y(-25));

      // hex-bolt ring around the perimeter
      for (let z = -28; z <= 28; z += 8) {
        rivet(g, X(z), Y(-28), 3.4, 0.75);
        rivet(g, X(z), Y(28), 3.4, 0.75);
      }
      for (let x = -20; x <= 20; x += 10) {
        rivet(g, X(-29), Y(x), 3.2, 0.7);
        rivet(g, X(29), Y(x), 3.2, 0.7);
      }

      // WIDOW stencil (reads from above, front to the right)
      g.fillStyle = 'rgba(230,233,238,0.92)';
      g.font = `900 ${Math.round(9.5 * px)}px ui-sans-serif, system-ui, Arial`;
      g.textBaseline = 'middle';
      g.fillText('WIDOW', X(-22), Y(-8));
      g.fillStyle = 'rgba(255,122,38,0.85)';
      g.font = `800 ${Math.round(3.4 * px)}px ui-sans-serif, system-ui, Arial`;
      g.fillText('RATFIRE · ARACHNO-08', X(-22), Y(3));

      // hazard chevrons across the nose (front)
      g.save();
      g.beginPath();
      g.rect(X(20), Y(-26), X(31) - X(20), Y(26) - Y(-26));
      g.clip();
      g.strokeStyle = 'rgba(230,233,238,0.7)';
      g.lineWidth = 0.9 * px;
      for (let y = Y(-30); y < Y(30); y += 2.6 * px) {
        g.beginPath();
        g.moveTo(X(20), y);
        g.lineTo(X(31), y + 2.2 * px);
        g.stroke();
      }
      g.restore();

      // barcode + service ticks (rear deck)
      let bx = X(-30);
      let k = 0;
      while (bx < X(-14)) {
        const w = 0.35 + ((k * 7919) % 5) * 0.22;
        g.fillStyle = 'rgba(230,233,238,0.8)';
        g.fillRect(bx, Y(14), w * px, Y(26) - Y(14));
        bx += (w + 0.4) * px;
        k++;
      }
      g.strokeStyle = 'rgba(230,233,238,0.55)';
      g.lineWidth = 2.4;
      for (let z = -12; z <= 12; z += 4) {
        g.beginPath();
        g.moveTo(X(z), Y(18));
        g.lineTo(X(z), Y(26));
        g.stroke();
      }

      // warning triangle mid-deck
      g.strokeStyle = 'rgba(230,233,238,0.8)';
      g.lineWidth = 3.4;
      g.beginPath();
      g.moveTo(X(6), Y(-20));
      g.lineTo(X(12), Y(-10));
      g.lineTo(X(0), Y(-10));
      g.closePath();
      g.stroke();
      g.fillStyle = 'rgba(230,233,238,0.8)';
      g.fillRect(X(5.4), Y(-18), 2, 5);
      g.beginPath();
      g.arc(X(6), Y(-11.6), 1.1, 0, Math.PI * 2);
      g.fill();

      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      texes.push(t);
      return t;
    }

    // ---- FLANK PLATE: canvas 1024×300 ↔ a 66×34 quad per side -------
    // canvas LEFT = body REAR, canvas RIGHT = body FRONT
    function makeFlankTexture(): THREE.CanvasTexture {
      const cv = document.createElement('canvas');
      cv.width = 1024;
      cv.height = 300;
      const g = cv.getContext('2d')!;
      const X = (z: number) => (z + 33) * (1024 / 66); // world z → px
      const Y = (y: number) => (84 - y) * (300 / 34); // world y → px
      const px = 1024 / 66;

      // seam grid
      g.strokeStyle = 'rgba(215,218,222,0.45)';
      g.lineWidth = 3;
      for (const z of [-24, -4, 16]) {
        g.beginPath();
        g.moveTo(X(z), Y(-12));
        g.lineTo(X(z), Y(14));
        g.stroke();
      }
      g.beginPath();
      g.moveTo(X(-28), Y(1));
      g.lineTo(X(28), Y(1));
      g.stroke();

      // rivet rows
      for (let z = -30; z <= 30; z += 6) {
        rivet(g, X(z), Y(14.5), 0.32 * px, 0.6);
        rivet(g, X(z), Y(-12.5), 0.32 * px, 0.6);
      }

      // service stencil
      g.fillStyle = 'rgba(230,233,238,0.9)';
      g.font = `900 ${Math.round(4.6 * px)}px ui-sans-serif, system-ui, Arial`;
      g.textBaseline = 'middle';
      g.fillText('WIDOW', X(-20), Y(8));
      g.fillStyle = 'rgba(255,122,38,0.8)';
      g.font = `700 ${Math.round(2.2 * px)}px ui-sans-serif, system-ui, Arial`;
      g.fillText('OCTO-PLATFORM', X(-20), Y(-1));

      // vent slots (front half)
      for (let i = 0; i < 6; i++) {
        g.fillStyle = 'rgba(215,218,222,0.75)';
        g.fillRect(X(8 + i * 3.4), Y(11), 0.95 * px, Y(3) - Y(11));
      }

      // hazard chevrons (rear bottom)
      g.save();
      g.beginPath();
      g.rect(X(-30), Y(-12), X(-14) - X(-30), Y(-6) - Y(-12));
      g.clip();
      g.strokeStyle = 'rgba(230,233,238,0.7)';
      g.lineWidth = 0.8 * px;
      for (let s = X(-32); s < X(-12); s += 2.4 * px) {
        g.beginPath();
        g.moveTo(s, Y(-5));
        g.lineTo(s + 2 * px, Y(-13));
        g.stroke();
      }
      g.restore();

      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      texes.push(t);
      return t;
    }

    const carapaceMat = makeDetailMaterial(makeCarapaceTexture());
    const flankMat = makeDetailMaterial(makeFlankTexture());

    // ================================================================
    // ROOT + BODY
    // ================================================================
    const root = new THREE.Group();
    root.name = 'spiderPet';
    const body = new THREE.Group(); // bob + lean + curl drop apply here
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
    const rbox = (w: number, h: number, d: number, seg = 2, r = 2) =>
      geo(new RoundedBoxGeometry(w, h, d, seg, r));
    const cyl = (r: number, h: number, seg = 14) =>
      geo(new THREE.CylinderGeometry(r, r, h, seg));

    // ---- cephalothorax shell (armored prow) ----
    body.add(mesh(rbox(CEP_W, CEP_H, CEP_D, 4, 7), armorMat, 0, CEP_Y, 4));
    // belly pan
    body.add(mesh(rbox(CEP_W - 14, 10, CEP_D - 20, 2, 3), darkMat, 0, CEP_Y - CEP_H / 2 + 2, 4));
    // top carapace plate — slightly proud of the shell
    body.add(mesh(rbox(CEP_W - 2, 9, CEP_D - 4, 3, 3.4), armorMat, 0, CEP_Y + CEP_H / 2 - 1, 4));
    // carapace livery decal
    const carapaceGeo = geo(new THREE.PlaneGeometry(70, 62));
    const carapaceDecal = new THREE.Mesh(carapaceGeo, carapaceMat);
    carapaceDecal.rotation.x = -Math.PI / 2;
    carapaceDecal.position.set(0, CEP_Y + CEP_H / 2 + 4, 4);
    body.add(carapaceDecal);
    // flank livery decals
    const flankGeo = geo(new THREE.PlaneGeometry(66, 34));
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(flankGeo, flankMat);
      p.position.set(sx * (CEP_W / 2 + 0.8), CEP_Y + 4, 4);
      p.rotation.y = (sx * Math.PI) / 2;
      body.add(p);
    }

    // ---- head: tilted face plate + eye cluster + fangs + feelers ----
    const faceGroup = new THREE.Group();
    faceGroup.position.set(0, CEP_Y + 2, CEP_D / 2 + 4 + 4);
    const FACE_TILT = -0.16;
    faceGroup.rotation.x = FACE_TILT;
    body.add(faceGroup);
    faceGroup.add(mesh(rbox(52, 34, 10, 3, 3.4), armorMat, 0, 0, 2));
    faceGroup.add(mesh(rbox(56, 5, 12, 2, 2), darkMat, 0, 18.5, 2)); // brow
    faceGroup.add(mesh(rbox(40, 4.5, 9, 2, 1.8), darkMat, 0, -18.2, 2.4)); // chin
    // eye cluster: 2 main + 4 above + 2 top — classic spider arrangement
    const mainEyeGeo = geo(new THREE.SphereGeometry(6.2, 16, 12));
    const smallEyeGeo = geo(new THREE.SphereGeometry(3.1, 12, 10));
    for (const sx of [-1, 1]) {
      faceGroup.add(mesh(mainEyeGeo, eyeMat, sx * 11, 3.5, 6.6));
    }
    for (const [ex, ey] of [
      [-17, 12.5],
      [-6.5, 13.5],
      [6.5, 13.5],
      [17, 12.5],
    ]) {
      faceGroup.add(mesh(smallEyeGeo, eyeMat, ex, ey, 6.2));
    }
    for (const sx of [-1, 1]) {
      const e = mesh(smallEyeGeo, eyeMat, sx * 5, 17.4, 5.4);
      e.scale.setScalar(0.72);
      faceGroup.add(e);
    }
    // chelicerae — fang prongs that spread on the threat display
    const fangGeo = geo(new THREE.ConeGeometry(3.4, 15, 10));
    fangGeo.rotateX(Math.PI); // points down
    const fangL = new THREE.Group();
    const fangR = new THREE.Group();
    fangL.position.set(-9, -19, 4);
    fangR.position.set(9, -19, 4);
    fangL.add(mesh(fangGeo, jointMat));
    fangR.add(mesh(fangGeo, jointMat));
    faceGroup.add(fangL);
    faceGroup.add(fangR);
    // pedipalps — two short feelers angled forward
    const feelerGeo = geo(new THREE.CylinderGeometry(1.1, 1.7, 20, 8));
    feelerGeo.translate(0, -10, 0);
    const feelerL = new THREE.Group();
    const feelerR = new THREE.Group();
    feelerL.position.set(-20, -12, 5);
    feelerR.position.set(20, -12, 5);
    feelerL.rotation.x = 1.05;
    feelerR.rotation.x = 1.05;
    feelerL.add(mesh(feelerGeo, jointMat));
    feelerR.add(mesh(feelerGeo, jointMat));
    faceGroup.add(feelerL);
    faceGroup.add(feelerR);

    // ---- carapace sensor whips (scan on idle) ----
    const whipGeo = geo(new THREE.CylinderGeometry(0.7, 1.1, 30, 6));
    const whipL = mesh(whipGeo, darkMat, -12, CEP_Y + CEP_H / 2 + 16, -12);
    const whipR = mesh(whipGeo, darkMat, 12, CEP_Y + CEP_H / 2 + 16, -12);
    whipL.rotation.z = 0.14;
    whipR.rotation.z = -0.14;
    body.add(whipL);
    body.add(whipR);
    const whipTipGeo = geo(new THREE.SphereGeometry(1.5, 8, 6));
    body.add(mesh(whipTipGeo, glowMat, -12, CEP_Y + CEP_H / 2 + 31, -12));
    body.add(mesh(whipTipGeo, glowMat, 12, CEP_Y + CEP_H / 2 + 31, -12));

    // ---- waist + abdomen (the rear bulb) ----
    body.add(mesh(geo(new THREE.CylinderGeometry(17, 21, 26, 16)), darkMat, 0, CEP_Y - 4, -CEP_D / 2 + 6));
    const abdomen = new THREE.Group();
    abdomen.position.set(0, ABD_Y, ABD_Z);
    body.add(abdomen);
    const abdGeo = geo(new THREE.SphereGeometry(ABD_R, 28, 22));
    abdGeo.scale(0.98, 0.84, 1.18);
    abdomen.add(mesh(abdGeo, abdomenMat));
    // spine ridge fins along the top of the bulb
    const finGeo = geo(new RoundedBoxGeometry(7, 10, 14, 2, 2.6));
    for (let i = 0; i < 5; i++) {
      const t = i / 4; // 0 front .. 1 rear
      const z = 28 - t * 66;
      const y = Math.cos((z / (ABD_R * 1.18)) * (Math.PI / 2)) * ABD_R * 0.84;
      const fin = mesh(finGeo, armorMat, 0, y + 2, z);
      fin.rotation.x = t * 0.5 - 0.25;
      abdomen.add(fin);
    }
    // rear tip: spinneret nozzle cluster
    const nozzleGeo = geo(new THREE.CylinderGeometry(2.6, 4, 9, 8));
    for (const [nx, ny] of [
      [-6, -4],
      [6, -4],
      [0, 2],
    ]) {
      const n = mesh(nozzleGeo, jointMat, nx, ny, -ABD_R * 1.18 + 2);
      n.rotation.x = Math.PI / 2 + 0.28;
      abdomen.add(n);
    }
    const nozzleGlow = mesh(geo(new THREE.SphereGeometry(2.2, 8, 6)), glowMat, 0, 2, -ABD_R * 1.18 - 3);
    abdomen.add(nozzleGlow);
    // underside thruster plate (hover-assist canon-fodder detail)
    abdomen.add(mesh(rbox(30, 6, 34, 2, 2), darkMat, 0, -ABD_R * 0.84 + 2, 4));
    for (let i = 0; i < 3; i++) {
      abdomen.add(mesh(cyl(2.6, 3, 10), glowMat, 0, -ABD_R * 0.84 - 1, 12 - i * 10));
    }

    // ================================================================
    // LEGS — hip module + femur + knee + tibia + tarsus claw, solved
    // with 2-bone IK every tick (knees arch ABOVE the body line).
    // ================================================================
    interface LegRig {
      hip: THREE.Group; // yaw (splay) — local +X points along the leg
      femur: THREE.Group; // pitch up from the hip
      tibia: THREE.Group; // pitch down from the knee
      foot: THREE.Group; // counter-rotated pad + claw
      side: 1 | -1;
      row: number; // 0 front .. 3 back
      group: 0 | 1; // alternating tetrapod
      planted: boolean;
      stepping: boolean;
      stepT: number;
      footCurrent: THREE.Vector3; // world-space
      footFrom: THREE.Vector3;
      footTo: THREE.Vector3;
    }
    const legs: LegRig[] = [];

    const hipModuleGeo = geo(new THREE.CylinderGeometry(HIP_R, HIP_R, 18, 16));
    hipModuleGeo.rotateX(Math.PI / 2); // axle along local Z
    const hipCapGeo = geo(new THREE.CylinderGeometry(HIP_R * 0.66, HIP_R * 0.66, 2.4, 12));
    hipCapGeo.rotateX(Math.PI / 2);
    const femurGeo = geo(new RoundedBoxGeometry(FEMUR, 14, 17, 3, 3.2));
    femurGeo.translate(FEMUR / 2, 0, 0); // extends +X
    const kneeGeo = geo(new THREE.SphereGeometry(KNEE_R, 14, 12));
    const kneeAxleGeo = geo(new THREE.CylinderGeometry(5.4, 5.4, 15, 12));
    kneeAxleGeo.rotateX(Math.PI / 2);
    const tibiaGeo = geo(new RoundedBoxGeometry(TIBIA, 10.5, 12.5, 3, 2.6));
    tibiaGeo.translate(TIBIA / 2, 0, 0); // extends +X
    const footGeo = geo(new THREE.SphereGeometry(FOOT_R, 12, 10));
    footGeo.scale(1, 0.7, 1.2);
    const clawGeo = geo(new THREE.ConeGeometry(2.2, 7, 8));
    clawGeo.rotateX(Math.PI); // points down
    const spikeGeo = geo(new THREE.ConeGeometry(1.7, 6.5, 8));
    const femurStripeGeo = geo(box(FEMUR * 0.62, 1.2, 2.2));

    for (const side of [-1, 1] as const) {
      for (let row = 0; row < 4; row++) {
        const hip = new THREE.Group();
        hip.position.set(
          side * ATTACH_X,
          ATTACH_Y,
          ATTACH_Z[row]
        );
        // local +X must point along the splay direction (outward ± front)
        hip.rotation.y = side === 1 ? -SPLAY[row] : Math.PI + SPLAY[row];
        body.add(hip);
        hip.add(mesh(hipModuleGeo, jointMat));
        hip.add(mesh(hipCapGeo, darkMat, 0, 0, 9.4));
        hip.add(mesh(hipCapGeo, darkMat, 0, 0, -9.4));
        // shoulder plate hugging the shell
        const plate = mesh(rbox(14, 20, 22, 2, 3), armorMat, -side * 3, 0, 0);
        hip.add(plate);

        const femur = new THREE.Group();
        hip.add(femur);
        femur.add(mesh(femurGeo, armorMat));
        // spider leg spines on the femur top
        for (const at of [FEMUR * 0.38, FEMUR * 0.68]) {
          femur.add(mesh(spikeGeo, darkMat, at, 8, 0));
        }
        // glowing service seam along the femur flank
        femur.add(mesh(femurStripeGeo, glowMat, FEMUR * 0.5, 5.4, 8.2));

        const tibia = new THREE.Group();
        tibia.position.set(FEMUR, 0, 0);
        femur.add(tibia);
        tibia.add(mesh(kneeGeo, jointMat));
        tibia.add(mesh(kneeAxleGeo, darkMat));
        tibia.add(mesh(tibiaGeo, armorMat));
        tibia.add(mesh(box(TIBIA * 0.5, 1, 1.8), glowMat, TIBIA * 0.55, 4.2, 6));

        const foot = new THREE.Group();
        foot.position.set(TIBIA, 0, 0);
        tibia.add(foot);
        const pad = mesh(footGeo, rubberMat, 0, -2.5, 0);
        foot.add(pad);
        foot.add(mesh(clawGeo, jointMat, 2.5, -5.5, 0));

        // alternating tetrapod: L1·R2·L3·R4 = group 0
        const isGroup0 =
          (row === 0 && side === -1) ||
          (row === 1 && side === 1) ||
          (row === 2 && side === -1) ||
          (row === 3 && side === 1);

        legs.push({
          hip,
          femur,
          tibia,
          foot,
          side,
          row,
          group: isGroup0 ? 0 : 1,
          planted: true,
          stepping: false,
          stepT: 0,
          footCurrent: new THREE.Vector3(),
          footFrom: new THREE.Vector3(),
          footTo: new THREE.Vector3(),
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
    // RIG STATE + 2-BONE IK + PLANTED-FOOT GAIT
    // ================================================================
    let elapsed = 0;
    let clip = 'Idle';
    let oneShot: 'Threat' | 'Hop' | null = null;
    let shotT = -1;
    let dead = false;
    let deathK = 0; // smoothed curl amount 0..1
    let threatK = 0; // smoothed threat display 0..1
    let hopK = 0; // hop arc 0..1..0
    let speedSm = 0;
    let activeGroup: 0 | 1 = 0;
    let groupClock = 0;
    let bodyY = 0; // smoothed body height (terrain-following)
    let leanX = 0; // smoothed terrain pitch (rotation.x)
    let leanZ = 0; // smoothed terrain roll (rotation.z)
    let eyePulse = 0;

    const prevPos = new THREE.Vector3();
    // pooled per-frame scratch — the follow brain allocates nothing
    const _forward = new THREE.Vector3();
    const _right = new THREE.Vector3();
    const _target = new THREE.Vector3();
    const _footIdeal = new THREE.Vector3();
    const _delta = new THREE.Vector3();
    const _hipWorld = new THREE.Vector3();
    const _hipQuat = new THREE.Quaternion();
    const _hipQuatInv = new THREE.Quaternion();

    /** Solve femur/tibia pitch so the tibia end lands on (lx, ly) in the
     *  hip plane (local +X out, +Y up). Law of cosines, knee held UP. */
    function solveLeg(leg: LegRig, lx: number, ly: number): void {
      const maxReach = (FEMUR + TIBIA) * 0.985;
      const minReach = (FEMUR + TIBIA) * 0.34;
      const d = Math.min(maxReach, Math.max(minReach, Math.hypot(lx, ly)));
      const line = Math.atan2(ly, lx); // hip→foot line angle
      // femur sits ABOVE the line by α (spider knee-up silhouette)
      const alpha = Math.acos(
        Math.min(1, Math.max(-1, (FEMUR * FEMUR + d * d - TIBIA * TIBIA) / (2 * FEMUR * d)))
      );
      leg.femur.rotation.z = line + alpha;
      const beta = Math.acos(
        Math.min(1, Math.max(-1, (FEMUR * FEMUR + TIBIA * TIBIA - d * d) / (2 * FEMUR * TIBIA)))
      );
      leg.tibia.rotation.z = beta - Math.PI;
      // keep the pad flat against the ground
      leg.foot.rotation.z = -(leg.femur.rotation.z + leg.tibia.rotation.z);
    }

    /** Foot rest slot in world space for this leg at the current pose. */
    function restTarget(leg: LegRig, out: THREE.Vector3): void {
      const a = SPLAY[leg.row];
      const r = REST_R[leg.row];
      const ox = leg.side * Math.cos(a) * r;
      const oz = Math.sin(a) * r;
      const cosY = Math.cos(root.rotation.y);
      const sinY = Math.sin(root.rotation.y);
      out.set(
        root.position.x + cosY * ox + sinY * oz,
        0,
        root.position.z - sinY * ox + cosY * oz
      );
    }

    // spawn feet on their rest slots
    for (const leg of legs) {
      restTarget(leg, leg.footCurrent);
      leg.footCurrent.y = opts.heightAt(leg.footCurrent.x, leg.footCurrent.z);
      leg.footTo.copy(leg.footCurrent);
    }

    function update(
      dt: number,
      playerPos: THREE.Vector3,
      playerYaw: number
    ): void {
      if (!root.visible) return;
      elapsed += dt;

      // ---- one-shot timelines run even while parked ----
      if (oneShot === 'Threat') {
        shotT += dt;
        const T = 1.6;
        if (shotT >= T) {
          oneShot = null;
          shotT = -1;
        }
      } else if (oneShot === 'Hop') {
        shotT += dt;
        const T = 0.6;
        if (shotT >= T) {
          oneShot = null;
          shotT = -1;
          hopK = 0;
        } else {
          hopK = Math.sin((shotT / T) * Math.PI);
        }
      }
      threatK += ((oneShot === 'Threat' ? 1 : 0) - threatK) * Math.min(1, 7 * dt);
      deathK += ((dead ? 1 : 0) - deathK) * Math.min(1, 4.5 * dt);

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
        for (const leg of legs) {
          restTarget(leg, leg.footCurrent);
          leg.footCurrent.y = opts.heightAt(leg.footCurrent.x, leg.footCurrent.z);
          leg.footTo.copy(leg.footCurrent);
          leg.stepping = false;
          leg.planted = true;
        }
      }
      root.position.y = opts.heightAt(root.position.x, root.position.z);

      let moving = false;
      if (deathK > 0.5) {
        moving = false; // curled up — no pursuit until revived
      } else if (dist > ARRIVE_DIST) {
        moving = true;
        const cap = dist > 420 ? RUN_CAP : WALK_MAX + 60;
        const speed = Math.min(cap, dist * 2.6);
        const step = Math.min(speed * dt, dist);
        root.position.x += (dx / dist) * step;
        root.position.z += (dz / dist) * step;
        const desired = Math.atan2(dx, dz);
        let delta = desired - root.rotation.y;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        root.rotation.y += delta * Math.min(1, 9 * dt);
      } else {
        const desired = Math.atan2(
          playerPos.x - root.position.x,
          playerPos.z - root.position.z
        );
        let delta = desired - root.rotation.y;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        root.rotation.y += delta * Math.min(1, 5.5 * dt);
      }

      // ---- measured speed drives the gait ----
      const moved = Math.hypot(
        root.position.x - prevPos.x,
        root.position.z - prevPos.z
      );
      prevPos.copy(root.position);
      const speed = moving ? moved / Math.max(dt, 1e-4) : 0;
      speedSm += (speed - speedSm) * Math.min(1, 8 * dt);
      const strideK = Math.min(1, speedSm / 320);

      if (oneShot === null) {
        clip = deathK > 0.4 ? 'Curl' : moving ? 'Crawl' : 'Idle';
      }

      // ---- alternate the tetrapod groups while walking ----
      if (moving) {
        groupClock += dt;
        const period = Math.max(0.16, GROUP_PERIOD - strideK * 0.12);
        if (groupClock >= period) {
          groupClock = 0;
          activeGroup = activeGroup === 0 ? 1 : 0;
        }
      }

      // ---- body height + terrain lean ----
      const gy = root.position.y;
      const hF = opts.heightAt(root.position.x + Math.sin(root.rotation.y) * 48, root.position.z + Math.cos(root.rotation.y) * 48);
      const hB = opts.heightAt(root.position.x - Math.sin(root.rotation.y) * 48, root.position.z - Math.cos(root.rotation.y) * 48);
      const hRight = opts.heightAt(root.position.x + Math.cos(root.rotation.y) * 34, root.position.z - Math.sin(root.rotation.y) * 34);
      const hLeft = opts.heightAt(root.position.x - Math.cos(root.rotation.y) * 34, root.position.z + Math.sin(root.rotation.y) * 34);
      const targetLeanX = Math.atan2(hB - hF, 96) * 0.7;
      const targetLeanZ = Math.atan2(hRight - hLeft, 68) * 0.7;
      leanX += (targetLeanX - leanX) * Math.min(1, 4 * dt);
      leanZ += (targetLeanZ - leanZ) * Math.min(1, 4 * dt);

      // ---- per-leg stepping + IK ----
      let steppingCount = 0;
      const stepDur = STEP_TIME + (1 - strideK) * 0.14;
      for (const leg of legs) {
        // ideal rest slot (front legs pull up + in on the threat display)
        restTarget(leg, _footIdeal);
        const front = leg.row <= 1;
        _footIdeal.y = opts.heightAt(_footIdeal.x, _footIdeal.z);
        if (threatK > 0.01 && front) {
          const ox = _footIdeal.x - root.position.x;
          const oz = _footIdeal.z - root.position.z;
          const pull = 1 - threatK * 0.38;
          _footIdeal.x = root.position.x + ox * pull;
          _footIdeal.z = root.position.z + oz * pull;
          _footIdeal.y += threatK * 62;
        }
        // hop splay: everything kicks outward a touch
        if (hopK > 0.01) {
          const ox = _footIdeal.x - root.position.x;
          const oz = _footIdeal.z - root.position.z;
          _footIdeal.x += ox * hopK * 0.16;
          _footIdeal.z += oz * hopK * 0.16;
          _footIdeal.y += hopK * 8;
        }
        // death curl: every foot folds under the body
        if (deathK > 0.01) {
          const a = SPLAY[leg.row];
          const ox = leg.side * Math.cos(a) * (ATTACH_X + 40);
          const oz = Math.sin(a) * (ATTACH_X + 40);
          const cosY = Math.cos(root.rotation.y);
          const sinY = Math.sin(root.rotation.y);
          _footIdeal.x = root.position.x + cosY * ox + sinY * oz;
          _footIdeal.z = root.position.z - sinY * ox + cosY * oz;
          _footIdeal.y = gy + 8;
        }

        if (leg.stepping) {
          steppingCount++;
          leg.stepT += dt / stepDur;
          if (leg.stepT >= 1 || deathK > 0.5) {
            leg.stepping = false;
            leg.planted = true;
            leg.stepT = 0;
            leg.footCurrent.copy(leg.footTo);
          } else {
            const k = leg.stepT;
            leg.footCurrent.x = leg.footFrom.x + (leg.footTo.x - leg.footFrom.x) * k;
            leg.footCurrent.z = leg.footFrom.z + (leg.footTo.z - leg.footFrom.z) * k;
            leg.footCurrent.y =
              leg.footFrom.y +
              (leg.footTo.y - leg.footFrom.y) * k +
              Math.sin(k * Math.PI) * STEP_LIFT;
          }
        } else {
          // planted: hold still until the slot drifts too far
          _delta.set(
            _footIdeal.x - leg.footCurrent.x,
            0,
            _footIdeal.z - leg.footCurrent.z
          );
          const drift = _delta.length();
          if (deathK > 0.25) {
            // curl: ease every pad straight to its folded slot
            leg.footCurrent.lerp(_footIdeal, Math.min(1, 6 * dt));
          } else if (threatK > 0.2 && leg.row <= 1) {
            // threat raise: snappy straight ease (no step arc)
            leg.footCurrent.lerp(_footIdeal, Math.min(1, 9 * dt));
          } else {
            const allowed =
              (leg.group === activeGroup || moving === false) &&
              deathK < 0.5;
            if (
              (drift > STEP_DIST && allowed) ||
              drift > FORCE_DIST
            ) {
              leg.stepping = true;
              leg.planted = false;
              leg.stepT = 0;
              leg.footFrom.copy(leg.footCurrent);
              leg.footTo.copy(_footIdeal);
              leg.footTo.y = opts.heightAt(leg.footTo.x, leg.footTo.z);
            } else if (drift > 2.2 && !moving && deathK < 0.5) {
              // parked shuffle: ease the pad toward its slot (no arc)
              leg.footCurrent.x += _delta.x * Math.min(1, 3 * dt);
              leg.footCurrent.z += _delta.z * Math.min(1, 3 * dt);
              leg.footCurrent.y +=
                (_footIdeal.y - leg.footCurrent.y) * Math.min(1, 3 * dt);
            }
          }
        }

        // solve the knee-up 2-bone IK to the (possibly stepping) foot —
        // exact hip frame pulled from the scene graph, so body bob,
        // terrain lean, root yaw and the splay yaw are all accounted for
        leg.hip.getWorldPosition(_hipWorld);
        leg.hip.getWorldQuaternion(_hipQuat);
        _delta.set(
          leg.footCurrent.x - _hipWorld.x,
          leg.footCurrent.y - _hipWorld.y,
          leg.footCurrent.z - _hipWorld.z
        );
        _delta.applyQuaternion(_hipQuatInv.copy(_hipQuat).invert());
        solveLeg(leg, _delta.x, _delta.y);
      }

      // ---- body bob, breathe, lean, hop + curl drop ----
      const bob =
        Math.abs(Math.sin(elapsed * (6 + strideK * 7))) * 2.2 * strideK;
      body.position.y =
        bob +
        Math.sin(elapsed * 1.7) * 1.4 * (1 - strideK) * (1 - deathK) +
        hopK * 26 -
        deathK * 36;
      body.rotation.x = leanX + threatK * -0.34 + Math.sin(elapsed * 1.3) * 0.012 * (1 - strideK);
      body.rotation.z = leanZ;
      body.rotation.y = 0;

      // abdomen sway + breathing (the bulb rocks out of phase)
      abdomen.rotation.x = Math.sin(elapsed * 1.15 + 1.2) * 0.045 * (1 - strideK) * (1 - deathK);
      abdomen.rotation.z = Math.sin(elapsed * (3 + strideK * 5)) * 0.03 * strideK;

      // sensor whips scan while parked, whip back on the run
      const scan = Math.sin(elapsed * 0.8) * 0.35 * (1 - strideK);
      whipL.rotation.x = scan - strideK * 0.55;
      whipR.rotation.x = -scan - strideK * 0.55;

      // eyes: ember pulse + threat flare + death gutter
      eyePulse += dt * (2.2 + strideK * 2);
      const eyeBase = 2.1 + Math.sin(eyePulse) * 0.5 + threatK * 2.6;
      eyeMat.emissiveIntensity = eyeBase * (1 - deathK * 0.94);
      glowMat.emissiveIntensity =
        (1.35 + Math.sin(eyePulse * 0.5 + 1) * 0.35) * (1 - deathK * 0.85);

      // fangs spread + feelers wiggle on the threat display
      const spread = 0.16 + threatK * 0.5;
      fangL.rotation.z = -spread;
      fangR.rotation.z = spread;
      fangL.rotation.x = threatK * -0.35;
      fangR.rotation.x = threatK * -0.35;
      const wig = Math.sin(elapsed * 2.1) * 0.1 * (1 - strideK) * (1 - deathK);
      feelerL.rotation.z = -0.22 + wig;
      feelerR.rotation.z = 0.22 - wig;
      feelerL.rotation.x = 1.05 + threatK * -0.5;
      feelerR.rotation.x = 1.05 + threatK * -0.5;
    }

    function playThreat(): void {
      if (root.visible && oneShot !== 'Threat' && deathK < 0.5) {
        oneShot = 'Threat';
        shotT = 0;
      }
    }
    function playHop(): void {
      if (root.visible && oneShot !== 'Hop' && deathK < 0.5) {
        oneShot = 'Hop';
        shotT = 0;
      }
    }
    function playDeath(): void {
      dead = true;
    }
    function revive(): void {
      dead = false;
    }
    function debug(): {
      clip: string;
      oneShot: string | null;
      dead: boolean;
      stepping: number;
    } {
      return {
        clip,
        oneShot,
        dead,
        stepping: legs.filter((l) => l.stepping).length,
      };
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
      disposed.value = true;
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
      playThreat,
      playHop,
      playDeath,
      revive,
      debug,
      stats: {
        animations: ['Crawl', 'Idle', 'Threat', 'Hop', 'Curl'],
        triangles: Math.round(triangles),
      },
      dispose,
    };
  });
}
