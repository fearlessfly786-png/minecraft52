/**
 * CITY ROUTE GUIDE — the planned minimap route drawn IN THE WORLD:
 * a chain of glowing NEON GPS chevrons — hollow ">>" arrow outlines
 * with a hot core and a soft additive halo (the classic yellow light
 * arrows) — lying flat on the real road decks, vertex pointing along
 * the route, plus a soft additive light pillar with a spinning base
 * ring marking the destination. Google Maps navigation, rendered on
 * the actual streets.
 *
 * The chevron look is one canvas texture (wide white halo pass + hot
 * white core pass, drawn with shadowBlur) on an instanced plane; the
 * amber colour lives in the PER-INSTANCE colours, so a bright crest
 * travels FORWARD along the chain like flowing light.
 * The arrows never move from their painted spots (they must not change
 * until the route changes) — only the light flows.
 *
 * The route polyline arrives pre-smoothed (cityRoute.ts: string-pulled,
 * centreline-anchored, Bézier-rounded) and every chevron yaws to its
 * local tangent, so the chain curves through junctions smoothly and
 * exactly like the map line.
 *
 * Data flow: the Minimap overlay plans a route (cityRoute.ts A*) and
 * pushes the polyline here via setCityRouteGuide(); page.tsx adds the
 * guide group to the scene once (cityRouteGuideGroup) and pumps
 * cityRouteGuideTick every frame — a dirty flag rebuilds the instanced
 * chevrons only when the route changes; steady state is one colour
 * wave over the instances (typed-array writes, zero GC).
 *
 * Arrow Y comes from the page's surfaceYAt (terrain + city deck lift),
 * injected via cityRouteGuideInit, so chevrons sit exactly on asphalt
 * and correctly step up onto raised footpath blocks. Pure three.js,
 * one InstancedMesh + two beacon meshes — 3 draw calls.
 */

import * as THREE from 'three';
import { CITY_GRID_OFFSET } from './cityLayout';

/* tuning (world units; one voxel block = 100) */
const SPACING = 330; // one chevron every ~3.3 blocks — a near-continuous chain
const START_SKIP = 350; // none under the player's own feet
const CHEV = 400; // chevron plane size (4 blocks across)
const ARROW_LIFT = 7; // hover above the deck top
const PILLAR_R = 220; // destination light pillar radius (2.2 blocks)
const PILLAR_H = 3000; // pillar height (30 blocks)
const RING_IN = 160; // destination base ring radii
const RING_OUT = 260;
const MAX_ARROWS = 1400; // ~46 km of chain at 3.3-block spacing

/* flow pulse (travelling highlight along the static chain) */
const FLOW_SPEED = 1100; // crest speed along the route (world u/s)
const FLOW_LEN = 2600; // distance between pulse crests
const FLOW_W = 420; // crest half-width (world units)

let group: THREE.Group | null = null;
let arrowMesh: THREE.InstancedMesh | null = null;
let arrowMat: THREE.MeshBasicMaterial | null = null;
let pillar: THREE.Mesh | null = null;
let pillarMat: THREE.MeshBasicMaterial | null = null;
let ring: THREE.Mesh | null = null;
let ringMat: THREE.MeshBasicMaterial | null = null;

let pts: number[] | null = null; // flat absolute-grid polyline [gx, gz, ...]
let block = 100;
let surfaceY: ((x: number, z: number) => number) | null = null;
let dirty = false;
let flowDist: Float32Array | null = null; // arc distance per instance

/* scratch objects — zero allocation after init */
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** The neon chevron sprite: hollow V outline, drawn white (the amber
 *  tint comes from the per-instance colour) with a wide soft halo
 *  pass and a hot thin core pass — classic glow-arrow look. */
function makeChevronTexture(): THREE.CanvasTexture {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const cx = S / 2;
  const cy = S / 2 + 10;
  const W = 82; // half width of the V
  const A = 92; // tip reach above centre
  const B = 92; // wing drop below centre
  const T = 30; // band thickness (horizontal cut)
  // inner-tip depth that keeps the band a constant perpendicular width
  const G = Math.round((T * Math.sqrt(W * W + (A + B) * (A + B))) / W);
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - A); // outer tip (forward)
    ctx.lineTo(cx + W, cy + B); // right outer end
    ctx.lineTo(cx + W - T, cy + B); // right inner end
    ctx.lineTo(cx, cy - A + G); // inner tip (the notch)
    ctx.lineTo(cx - (W - T), cy + B); // left inner end
    ctx.lineTo(cx - W, cy + B); // left outer end
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // wide soft halo
  ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
  ctx.shadowBlur = 34;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 18;
  trace();
  ctx.stroke();
  ctx.stroke();
  // hot thin core
  ctx.shadowBlur = 12;
  ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
  ctx.lineWidth = 7;
  trace();
  ctx.stroke();
  ctx.stroke();
  ctx.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Page calls once after terrain/city exist — surfaceYAt already
 *  includes the city deck lift, so arrows sit on the real surface. */
export function cityRouteGuideInit(
  surfY: (x: number, z: number) => number
): void {
  surfaceY = surfY;
  dirty = true;
}

/** The scene object (created lazily; safe to call every session). */
export function cityRouteGuideGroup(): THREE.Group {
  if (group) return group;
  group = new THREE.Group();
  group.name = 'cityRouteGuide';
  group.visible = false;

  const geo = new THREE.PlaneGeometry(CHEV, CHEV);
  geo.rotateX(Math.PI / 2); // lie flat; texture-up becomes +Z (forward)

  arrowMat = new THREE.MeshBasicMaterial({
    map: makeChevronTexture(),
    color: 0xffffff, // amber lives in the per-instance colours (flow wave)
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  arrowMesh = new THREE.InstancedMesh(geo, arrowMat, MAX_ARROWS);
  arrowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arrowMesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX_ARROWS * 3),
    3
  );
  arrowMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  arrowMesh.count = 0;
  arrowMesh.frustumCulled = false;
  arrowMesh.renderOrder = 4;
  group.add(arrowMesh);

  pillarMat = new THREE.MeshBasicMaterial({
    color: 0xffc23d,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(PILLAR_R, PILLAR_R * 0.7, PILLAR_H, 24, 1, true),
    pillarMat
  );
  pillar.renderOrder = 5;
  group.add(pillar);

  ringMat = new THREE.MeshBasicMaterial({
    color: 0xffc23d,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  ring = new THREE.Mesh(new THREE.RingGeometry(RING_IN, RING_OUT, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 5;
  group.add(ring);

  return group;
}

/** Minimap pushes the planned route (flat ABSOLUTE-grid polyline) or
 *  null to clear the guidance. */
export function setCityRouteGuide(next: number[] | null, blk: number): void {
  pts = next;
  block = blk;
  dirty = true;
}

/** One neon chevron: plane yawed so its texture-forward (+Z) runs
 *  along the route tangent at that spot. */
function placeChevron(
  index: number,
  cx: number,
  cy: number,
  cz: number,
  yaw: number
): void {
  tmpQ.setFromAxisAngle(UP, yaw);
  tmpP.set(cx, cy, cz);
  tmpS.set(1, 1, 1);
  tmpM.compose(tmpP, tmpQ, tmpS);
  arrowMesh!.setMatrixAt(index, tmpM);
}

function rebuild(): void {
  const g = group as THREE.Group;
  const mesh = arrowMesh as THREE.InstancedMesh;
  mesh.count = 0;
  if (!pts || pts.length < 4 || !surfaceY) {
    g.visible = false;
    return;
  }
  const gx0 = CITY_GRID_OFFSET;
  if (!flowDist) flowDist = new Float32Array(MAX_ARROWS);
  const dist = flowDist;
  let emitted = 0;
  let nextAt = START_SKIP;
  let arc = 0; // absolute distance along the route at the segment start
  let px = (pts[0] - gx0) * block;
  let pz = (pts[1] - gx0) * block;
  for (let k = 2; k + 1 < pts.length && emitted < MAX_ARROWS; k += 2) {
    const nx = (pts[k] - gx0) * block;
    const nz = (pts[k + 1] - gx0) * block;
    const dx = nx - px;
    const dz = nz - pz;
    const seg = Math.hypot(dx, dz);
    if (seg >= 1e-6) {
      const ux = dx / seg;
      const uz = dz / seg;
      while (nextAt <= seg && emitted < MAX_ARROWS) {
        const cx = px + ux * nextAt;
        const cz = pz + uz * nextAt;
        const cy = surfaceY(cx, cz) + ARROW_LIFT;
        dist[emitted] = arc + nextAt;
        placeChevron(emitted++, cx, cy, cz, Math.atan2(ux, uz));
        nextAt += SPACING;
      }
      nextAt -= seg;
      arc += seg;
    }
    px = nx;
    pz = nz;
  }
  mesh.count = emitted;
  mesh.instanceMatrix.needsUpdate = true;

  // destination beacon: light pillar + spinning base ring on the deck
  const ex = (pts[pts.length - 2] - gx0) * block;
  const ez = (pts[pts.length - 1] - gx0) * block;
  const ey = surfaceY(ex, ez);
  (pillar as THREE.Mesh).position.set(ex, ey + PILLAR_H * 0.5, ez);
  (ring as THREE.Mesh).position.set(ex, ey + ARROW_LIFT + 6, ez);
  g.visible = true;
}

/** Per-frame pump: rebuild after a route change, then animate — the
 *  bright flow crest rides forward along the static chain. */
export function cityRouteGuideTick(elapsed: number, dt: number): void {
  if (!group) return;
  if (dirty) {
    dirty = false;
    rebuild();
  }
  if (!group.visible) return;
  const mesh = arrowMesh as THREE.InstancedMesh;
  if (arrowMat) arrowMat.opacity = 0.9 + 0.1 * Math.sin(elapsed * 4.2);
  if (pillarMat) pillarMat.opacity = 0.13 + 0.07 * Math.sin(elapsed * 2.4);
  if (ring) ring.rotation.z += dt * 0.8;
  // travelling colour wave: amber #ffc23d base, crest lifts to warm
  // white. positions never change — only the light moves.
  const colors = mesh.instanceColor;
  if (colors && flowDist && mesh.count > 0) {
    const arr = colors.array as Float32Array;
    const crest = (elapsed * FLOW_SPEED) % FLOW_LEN;
    for (let i = 0; i < mesh.count; i++) {
      let d = flowDist[i] - crest;
      d = ((d % FLOW_LEN) + FLOW_LEN) % FLOW_LEN;
      const p =
        d < FLOW_W
          ? 1 - d / FLOW_W
          : d > FLOW_LEN - FLOW_W
            ? (d - (FLOW_LEN - FLOW_W)) / FLOW_W
            : 0;
      const glow = p * p;
      const j = i * 3;
      arr[j] = 1;
      arr[j + 1] = 0.759 + 0.241 * glow;
      arr[j + 2] = 0.239 + 0.62 * glow;
    }
    colors.needsUpdate = true;
  }
}

/** Debug summary for the window.__city handle. */
export function cityRouteGuideStats(): { active: boolean; arrows: number } {
  return {
    active: !!group && group.visible,
    arrows: arrowMesh ? arrowMesh.count : 0,
  };
}
