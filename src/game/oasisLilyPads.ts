/**
 * LILY PADS on the oasis pool — the water's flat green furniture, per
 * the user's "implement 1 ... precisely" (suggestion 1: "a scattered
 * drift of flat voxel lily pads on the pool surface (cutout texture,
 * slight bob on the waves, cast no collision but block bullet
 * ripples)").
 *
 *  - THE DRIFT: eight deterministic clusters ring the pool's mid-water
 *    (d 13.5..26.5 blocks — clear of both the shoreline wading ring and
 *    the deep centre), each seeding a loose clump of 5-8 grid-snapped
 *    pads that random-walk outward with a lacy spacing rule (no cell
 *    ever holds two pads and no pad sits buried inside a solid block of
 *    neighbours) — a scattered drift, not a uniform confetti.
 *  - THE PAD: a one-voxel-pixel-thick block-sized flat slab wearing a
 *    hand-painted 16x16 cutout tile (classic minecraft lily pad: green
 *    mosaic disc, north-east wedge notch punched out, dark rim, pale
 *    veins) — alphaTest cutout, so the notch is fully open and the
 *    water shows through it.
 *  - THE BOB: the water shader already swells with a fixed triple-sine
 *    ambient field (see oasisWater.ts WATER_FRAGMENT). Every pad vertex
 *    samples THE SAME FIELD in its vertex shader (a per-pad `aPad`
 *    centre attribute + the shared constants in OASIS_SWELL below) so
 *    each drift rises, dips and tilts in phase with the exact swell
 *    that drives the sun glint around it — one merged draw call, zero
 *    per-frame CPU.
 *  - NO COLLISION: nothing is registered with palms/terrain collision —
 *    the player wades and swims straight through. But the pool probe
 *    `at(x, z)` lets the page skip water splashes/ripples for bullets
 *    that land ON a pad cell (the pad absorbs the impact).
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OASIS } from './oasisTerrain';

/* ------------------------------------------------------------------ *
 * SHARED SWELL FIELD — the JS/GLSL mirror of the pool's ambient wave
 * (constants copied EXACTLY from oasisWater.ts WATER_FRAGMENT so the
 * pads and the glint always agree).
 * ------------------------------------------------------------------ */

/** The ambient swell's three sine phases: p = world.xz - pool centre. */
export const OASIS_SWELL = {
  kx1: 0.011,
  w1: 1.15,
  kz2: 0.008,
  w2: -0.9,
  kx3: 0.006,
  w3: 0.62,
} as const;

/** Height/gradient of the swell at world (x, z), time t — the same
 *  triple-sine the water shader renders as normals. `y` is the implied
 *  surface height (±3 shader units), (dhdx, dhdz) its slope. Shared
 *  with palmFronds.ts so floating fronds bob on the same water. */
export function oasisSwell(
  x: number,
  z: number,
  t: number,
  cx: number,
  cz: number
): { y: number; dhdx: number; dhdz: number } {
  const px = x - cx;
  const pz = z - cz;
  const a1 = px * OASIS_SWELL.kx1 + t * OASIS_SWELL.w1;
  const a2 = pz * OASIS_SWELL.kz2 + t * OASIS_SWELL.w2;
  const a3 = (px + pz) * OASIS_SWELL.kx3 + t * OASIS_SWELL.w3;
  return {
    y: Math.sin(a1) + Math.sin(a2) + Math.sin(a3),
    dhdx: Math.cos(a1) * OASIS_SWELL.kx1 + Math.cos(a3) * OASIS_SWELL.kx3,
    dhdz: Math.cos(a2) * OASIS_SWELL.kz2 + Math.cos(a3) * OASIS_SWELL.kx3,
  };
}

/** Pad bob scaling — the shader height field is ±3, scaled to a subtle
 *  ±~4.8 world units; the tilt rides the swell slope (visible, but a
 *  fraction of the normal exaggeration the water paints). */
const SWELL_BOB = 1.6;
const SWELL_TILT = 6;

/* ------------------------------------------------------------------ *
 * TEXTURE — the classic minecraft lily pad tile
 * ------------------------------------------------------------------ */

/** Deterministic PRNG (mulberry32) so every boot paints identical tiles. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nearestTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter; // crisp minecraft pixels
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** Lily greens — cooler and deeper than the palm canopy so the pads
 *  read as a different plant floating on the turquoise. */
const PAD_BODY = ['#1e5e24', '#25702c', '#2c8033', '#33913b'];
const PAD_RIM = '#144219';
const PAD_VEIN = '#49a851';

/** 16x16 RGBA lily-pad tile: a rounded green disc with the classic
 *  NORTH-EAST WEDGE NOTCH punched out (alpha 0), a dark rim outline,
 *  pale veins radiating from the stem notch and sparse speckles. The
 *  bottom pixel row is solid rim colour — box sides sample just that
 *  row so the slab's edge reads dark green. Pure pixel math (no canvas
 *  reads): a pixel is filled when it sits inside the disc AND outside
 *  the notch bite; rim = the outer band of either edge. */
export function paintLilyPadTile(
  ctx: CanvasRenderingContext2D,
  rand: () => number
): void {
  ctx.clearRect(0, 0, 16, 16);
  const mid = 7.5;
  const DISC_R = 7.6;
  const RIM_W = 1.2;
  const NOTCH_R = 5.2;
  const NOTCH_RIM_W = 1.2;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dxc = x - mid;
      const dyc = y - mid;
      const dc = Math.sqrt(dxc * dxc + dyc * dyc);
      if (dc > DISC_R) continue; // outside the pad — stays transparent
      // notch bite: distance to the NE corner (x+, y-)
      const dn = Math.sqrt((15 - x) * (15 - x) + y * y);
      if (dn < NOTCH_R) continue; // the wedge notch stays OPEN (cutout)
      const onDiscRim = dc > DISC_R - RIM_W;
      const onNotchRim = dn < NOTCH_R + NOTCH_RIM_W;
      if (onDiscRim || onNotchRim) {
        // dark rim — both the pad outline and the cut edge
        ctx.fillStyle = PAD_RIM;
      } else {
        const pick = rand();
        ctx.fillStyle =
          pick < 0.5
            ? PAD_BODY[1 + ((rand() * 2) | 0)]
            : pick < 0.8
              ? PAD_BODY[0]
              : PAD_BODY[3];
        // sparse speckles — dark flecks on the body
        if (rand() < 0.06) ctx.fillStyle = PAD_RIM;
      }
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // pale veins radiating from the stem point (west side, opposite the
  // notch) — three short forked lines like the reference pad; only
  // pixels that are actually filled get the vein colour
  const filled = (x: number, y: number): boolean => {
    const dxc = x - mid;
    const dyc = y - mid;
    if (dxc * dxc + dyc * dyc > DISC_R * DISC_R) return false;
    return (15 - x) * (15 - x) + y * y >= NOTCH_R * NOTCH_R;
  };
  ctx.fillStyle = PAD_VEIN;
  for (const vein of [
    [
      [3, 8],
      [6, 8],
      [9, 8],
      [11, 7],
    ],
    [
      [3, 8],
      [5, 10],
      [8, 11],
      [10, 11],
    ],
    [
      [3, 8],
      [5, 6],
      [7, 4],
      [9, 3],
    ],
  ]) {
    for (const [vx, vy] of vein) {
      if (filled(vx, vy)) ctx.fillRect(vx, vy, 1, 1);
    }
  }
}

/** The lily pad cutout texture: one 16x16 tile. */
export function createLilyPadTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx) paintLilyPadTile(ctx, mulberry32(0x11c7ad >>> 0));
  return nearestTexture(canvas);
}

/* ------------------------------------------------------------------ *
 * PLACEMENT — the deterministic drift
 * ------------------------------------------------------------------ */

/** Clusters ringing the pool (fewer on low-spec phones). */
const CLUSTER_COUNT = 8;
const CLUSTER_COUNT_LOWSPEC = 6;
/** Cluster ring, blocks from the pool centre — the mid-water band:
 *  clear of the shoreline wading margin (d > 28 keeps every pad off
 *  the shallow ring the player enters through) and of the deepest pan
 *  centre. */
const CLUSTER_D_MIN = 13.5;
const CLUSTER_D_MAX = 26.5;
/** Pad cells live inside this radial band, blocks. */
const PAD_D_MIN = 12;
const PAD_D_MAX = 28;
/** Pads per cluster (min/max, low-spec floors to 4/6). */
const PADS_PER_CLUSTER_MIN = 5;
const PADS_PER_CLUSTER_MAX = 8;
/** Lacy spacing: a candidate cell is only placed when BOTH it and every
 *  existing neighbour it would gain stay within this 8-neighbourhood
 *  pad cap — clumps, never a solid mat (symmetric rule, so the FINAL
 *  state obeys it, not just the moment of placement). */
const MAX_NEIGHBOUR_PADS = 2;
/** Fixed seeds — the drift is identical every boot. */
const SEED_PLACE = 0x71bed5;

/** Build the pad list: grid-cell coordinates (pads are 1x1 voxel
 *  slabs) + a quarter-turn orientation each. Pure + deterministic so a
 *  probe can verify every rule. */
export function planLilyPads(
  lowSpec: boolean
): Array<{ gx: number; gz: number; rot: number }> {
  const rand = mulberry32(SEED_PLACE);
  const clusters = lowSpec ? CLUSTER_COUNT_LOWSPEC : CLUSTER_COUNT;
  const pads: Array<{ gx: number; gz: number; rot: number }> = [];
  const used = new Set<number>();
  const key = (gx: number, gz: number): number => gx * 8192 + gz;
  const neighbourCount = (gx: number, gz: number): number => {
    let n = 0;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        if (ox === 0 && oz === 0) continue;
        if (used.has(key(gx + ox, gz + oz))) n++;
      }
    }
    return n;
  };
  for (let c = 0; c < clusters; c++) {
    // cluster centre: evenly spread angles + hashed jitter, mid-water
    const ang = (c / clusters) * Math.PI * 2 + (rand() - 0.5) * 0.7;
    const d = CLUSTER_D_MIN + rand() * (CLUSTER_D_MAX - CLUSTER_D_MIN);
    const cgx = Math.round(OASIS.cx + Math.cos(ang) * d);
    const cgz = Math.round(OASIS.cz + Math.sin(ang) * d);
    const count =
      PADS_PER_CLUSTER_MIN +
      ((rand() * (PADS_PER_CLUSTER_MAX - PADS_PER_CLUSTER_MIN + 1)) | 0);
    let placed = 0;
    let guard = 0;
    // the first pad anchors at the cluster cell; the rest random-walk
    // within a 5x5 neighbourhood, lacy-spacing checked BOTH ways (the
    // candidate's own neighbourhood AND every neighbour's resulting
    // count) so the final drift can never hold a solid mat
    while (placed < count && guard++ < 80) {
      const jx = placed === 0 ? 0 : ((rand() * 5) | 0) - 2;
      const jz = placed === 0 ? 0 : ((rand() * 5) | 0) - 2;
      const gx = cgx + jx;
      const gz = cgz + jz;
      const dd = Math.hypot(gx - OASIS.cx, gz - OASIS.cz);
      if (dd < PAD_D_MIN || dd > PAD_D_MAX) continue;
      if (used.has(key(gx, gz))) continue;
      if (neighbourCount(gx, gz) > MAX_NEIGHBOUR_PADS) continue;
      // symmetric cap: no existing pad may be pushed over the cap
      let crowds = false;
      for (let ox = -1; ox <= 1 && !crowds; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          if (!ox && !oz) continue;
          if (
            used.has(key(gx + ox, gz + oz)) &&
            neighbourCount(gx + ox, gz + oz) + 1 > MAX_NEIGHBOUR_PADS
          ) {
            crowds = true;
            break;
          }
        }
      }
      if (crowds) continue;
      used.add(key(gx, gz));
      pads.push({
        gx,
        gz,
        rot: ((rand() * 4) | 0) * (Math.PI / 2), // minecraft quarter-turns
      });
      placed++;
    }
  }
  return pads;
}

/* ------------------------------------------------------------------ *
 * SYSTEM
 * ------------------------------------------------------------------ */

export interface OasisLilyPadsHandle {
  /** Advance the shared swell clock (call once per frame). */
  update(dt: number): void;
  /** Does a pad float over this world point? (O(1) cell lookup — the
   *  page uses it to mute bullet splashes/ripples on pad cells.) */
  at(x: number, z: number): boolean;
  /** Debug: pad + cluster counts. */
  stats(): { pads: number; clusters: number };
  dispose(): void;
}

export function createOasisLilyPads(
  scene: THREE.Scene,
  opts: {
    block: number;
    gridOffset: number;
    /** The pool's live layout (centre + waterline + radius). */
    water: { x: number; z: number; y: number; radius: number };
    lowSpec?: boolean;
  }
): OasisLilyPadsHandle {
  const { block, gridOffset } = opts;
  const water = opts.water;
  const lowSpec = opts.lowSpec ?? false;

  // world pool centre (grid -> world, same conversion as the water disc)
  const cxw = (OASIS.cx - gridOffset) * block;
  const czw = (OASIS.cz - gridOffset) * block;

  /* --------------------------- geometry ---------------------------- */
  // one flat slab per pad: block-wide footprint, ONE VOXEL PIXEL thick
  // (block/16), riding 2.5 units above the waterline so the surface
  // never cuts through the top face — the bob then rocks it through
  // the plane like a real floating pad (dips read as wet edges).
  const padThick = block / 16;
  const baseY = water.y + 2.5;

  const parts: THREE.BufferGeometry[] = [];
  const cellOf = (x: number, z: number): number =>
    Math.round(x / block + gridOffset) * 8192 + Math.round(z / block + gridOffset);
  const padCells = new Set<number>();

  for (const pad of planLilyPads(lowSpec)) {
    const wx = (pad.gx - gridOffset) * block;
    const wz = (pad.gz - gridOffset) * block;
    const geo = new THREE.BoxGeometry(block, padThick, block);
    // TOP face (+y, face 2) samples the whole tile; every other face
    // samples only the tile's bottom rim row so the slab edge is dark
    const uv = geo.attributes.uv;
    for (let face = 0; face < 6; face++) {
      if (face === 2) continue;
      for (let i = 0; i < 4; i++) {
        const idx = face * 4 + i;
        uv.setY(idx, uv.getY(idx) / 16); // bottom rim row only
      }
    }
    uv.needsUpdate = true;
    // rotate the pad AROUND ITSELF first, then place it — translating
    // before the rotation would swing the slab around the world origin
    geo.rotateY(pad.rot);
    geo.translate(wx, baseY, wz);
    // per-vertex pad centre for the shader bob (aPad = world x, z)
    const aPad = new Float32Array(24 * 2);
    for (let v = 0; v < 24; v++) {
      aPad[v * 2] = wx;
      aPad[v * 2 + 1] = wz;
    }
    geo.setAttribute('aPad', new THREE.BufferAttribute(aPad, 2));
    parts.push(geo);
    padCells.add(cellOf(wx, wz));
  }

  const material = new THREE.MeshLambertMaterial({
    map: createLilyPadTexture(),
    alphaTest: 0.5, // the notch is fully open — water shows through
    side: THREE.DoubleSide,
  });
  // the shader bob: uniforms shared with the compiled program via
  // onBeforeCompile (one merged mesh -> one program)
  const timeU = { value: 0 };

  const merged = BufferGeometryUtils.mergeGeometries(parts);
  for (const part of parts) part.dispose();

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeU;
    shader.uniforms.uBobAmp = { value: SWELL_BOB };
    shader.uniforms.uTiltGain = { value: SWELL_TILT };
    shader.uniforms.uPoolCx = { value: cxw };
    shader.uniforms.uPoolCz = { value: czw };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aPad;
        uniform float uTime;
        uniform float uBobAmp;
        uniform float uTiltGain;
        uniform float uPoolCx;
        uniform float uPoolCz;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // the pool's ambient swell (constants = oasisWater.ts fragment):
        // every pad rises/dips and tilts in phase with the glint field
        {
          float a1 = (position.x - uPoolCx) * 0.011 + uTime * 1.15;
          float a2 = (position.z - uPoolCz) * 0.008 - uTime * 0.9;
          float a3 = ((position.x - uPoolCx) + (position.z - uPoolCz)) * 0.006 + uTime * 0.62;
          float swellY = (sin(a1) + sin(a2) + sin(a3)) * uBobAmp;
          float dhdx = cos(a1) * 0.011 + cos(a3) * 0.006;
          float dhdz = cos(a2) * 0.008 + cos(a3) * 0.006;
          float lx = position.x - aPad.x;
          float lz = position.z - aPad.y;
          transformed.y += swellY + (lx * dhdx + lz * dhdz) * uTiltGain;
        }`
      );
  };

  const mesh = new THREE.Mesh(merged, material);
  // shadow map must respect the notch too — same alphaTest cutout on
  // the depth material (the ±5-unit bob is invisible in the shadow)
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: material.map ?? null,
    alphaTest: 0.5,
  });
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.renderOrder = 2; // below the water disc (3): pads are IN the pool
  scene.add(mesh);

  /* ----------------------------- API ------------------------------- */

  function update(dt: number): void {
    timeU.value += dt;
  }

  function at(x: number, z: number): boolean {
    return padCells.has(cellOf(x, z));
  }

  function stats(): { pads: number; clusters: number } {
    return {
      pads: padCells.size,
      clusters: lowSpec ? CLUSTER_COUNT_LOWSPEC : CLUSTER_COUNT,
    };
  }

  function dispose(): void {
    scene.remove(mesh);
    merged.dispose();
    material.map?.dispose();
    material.dispose();
    mesh.customDepthMaterial?.dispose();
  }

  return { update, at, stats, dispose };
}
