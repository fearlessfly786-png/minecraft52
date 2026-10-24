/**
 * CALDERA LAVA BODY — a REAL 3D MODEL for the volcano's molten lake.
 *
 * The caldera pool used to be a dead-flat textured quad per block (the
 * chunk mesher's lava bucket): the crust texture boiled, but the surface
 * itself had zero geometry — the melt read as a decal, not a body.
 * This module builds actual geometry riding above that old sheet (which
 * stays as a guaranteed-opaque underlay):
 *
 *  - BODY: the lake is a smooth molten DOME — each grid corner carries a
 *    wide-kernel smoothed lake level (the old ±1-2 block datum terraces
 *    disappear under the surface), lifted EDGE_LIFT..DOME_LIFT blocks
 *    above the basin (a bulge that swells toward the centre), so the
 *    melt has real SILHOUETTE and clearly stands out of its rock cradle.
 *  - THICKNESS: every pool-boundary edge grows an inset vertical SKIRT
 *    from the surface edge down into the basin — the shoreline shows the
 *    melt's actual depth all around the lake, exactly like the walls of
 *    a vanilla lava cube seen from the side.
 *  - RELIEF SHADING: vertices are darkened toward the troughs and the
 *    waterline (vertex colors), so the swell reads even though lava is
 *    fullbright-unlit — the same trick that makes the rivers' wedges pop.
 *  - LIVING SURFACE: the dome breathes — two slow drifting noise octaves
 *    sway every vertex (the Y updates per frame from a pure per-corner
 *    function, so shared corners always match and the skin never tears).
 *  - TEXTURE: one wrapping 128px crust tile (extraTextures.ts
 *    createLavaSurfaceTile, the lake's own soup instance) sampled on
 *    absolute world coordinates, so tops and skirts share one seamless
 *    boiling skin.
 *
 * Bodies are built lazily per cone as the player approaches (same
 * activation range as lavaFlow.ts) and disposed beyond hysteresis, and
 * the build is 100% deterministic (volcanoTerrain's pure math fields).
 */

import * as THREE from 'three';
import { volcanoesNear, volcanoSampleAt } from './volcanoTerrain';
import { createLavaSurfaceTile, type LavaSurfaceTile } from './extraTextures';

/** One crust tile spans this many grid blocks on the body. */
const TILE_BLOCKS = 2.2;
/** Guaranteed melt thickness at the shoreline (blocks above the basin). */
const EDGE_LIFT = 0.38;
/** Extra bulge at the lake centre (blocks). */
const DOME_LIFT = 0.62;
/** Living-surface sway amplitude (blocks, ±). */
const NOISE_AMP = 0.16;
/** The surface never dips closer than this to the basin floor (blocks). */
const FLOOR_GAP = 0.07;
/** How deep the skirts tuck below the basin floor (blocks). */
const SKIRT_TUCK = 0.15;
/** Skirt inset off the rock plane (blocks) — no z-fighting. */
const SKIRT_INSET = 0.02;
/** Grid scan half-extent around a cone centre for pool cells. */
const POOL_SCAN = 15;

function clamp01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

function smoothstep01(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

/** 0..1 deterministic integer hash — the biome modules' standard. */
function hash2f(ix: number, iz: number, salt: number): number {
  let h =
    (Math.imul(ix | 0, 374761393) +
      Math.imul(iz | 0, 668265263) +
      Math.imul(salt | 0, 2246822519)) |
    0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

/** Smooth 2D value noise (biome-module standard hashing underneath). */
function vnoise(x: number, z: number, salt: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const tx = x - xi;
  const tz = z - zi;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash2f(xi, zi, salt);
  const b = hash2f(xi + 1, zi, salt);
  const c = hash2f(xi, zi + 1, salt);
  const d = hash2f(xi + 1, zi + 1, salt);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

export interface CalderaLavaHandle {
  /** Drive the living surfaces. Call per frame. */
  update(dt: number, playerX: number, playerZ: number): void;
  /** Live body + vertex counts (debug handle). */
  stats(): { bodies: number; verts: number };
  /** World-space spot on the first live lake surface (debug handle). */
  debugSpot(): { x: number; y: number; z: number } | null;
  dispose(): void;
}

interface PoolBody {
  key: string;
  /** Cone centre, world space. */
  cxw: number;
  czw: number;
  actR: number;
  /** Per-cone flavouring for the sway field (matches the build pose). */
  salt: number;
  group: THREE.Group;
  mesh: THREE.Mesh | null;
  posAttr: THREE.BufferAttribute | null;
  /** Per-vertex animation record: sx, sz, baseY, floorY, amp. */
  animData: Float32Array;
  vertCount: number;
  /** Representative animated vertex index (debug probe). */
  probe: number;
}

export function createCalderaLavaSystem(
  scene: THREE.Scene,
  terrain: { blockHeight(gx: number, gz: number): number },
  opts: { block: number; gridOffset: number; lowSpec?: boolean }
): CalderaLavaHandle {
  const block = opts.block;
  const gridOffset = opts.gridOffset;

  const feed: LavaSurfaceTile = createLavaSurfaceTile();
  const bodyMat = new THREE.MeshBasicMaterial({
    map: feed.tile,
    vertexColors: true,
    side: THREE.DoubleSide,
  });

  // ---------------- cone bodies ----------------
  const bodies = new Map<string, PoolBody>();

  /** The living part of the surface: two slow drifting noise octaves. */
  function waveY(sx: number, sz: number, t: number, salt: number): number {
    const n1 = vnoise(sx * 0.052 + t * 0.021, sz * 0.052 - t * 0.016, salt);
    const n2 = vnoise(
      sx * 0.149 - t * 0.03,
      sz * 0.149 + t * 0.026,
      salt ^ 0x51ed
    );
    return (n1 * 0.72 + n2 * 0.28 - 0.5) * 2 * NOISE_AMP * block;
  }

  function buildBody(
    info: { cx: number; cz: number; baseR: number; salt: number },
    playerX: number,
    playerZ: number
  ): void {
    const key = info.cx + ',' + info.cz;
    if (bodies.has(key)) return;
    const cxw = (info.cx - gridOffset) * block;
    const czw = (info.cz - gridOffset) * block;
    const actR = info.baseR * block * 1.7 + 2400;
    if (Math.hypot(playerX - cxw, playerZ - czw) > actR) return;

    // local key packing (endless world: never key on absolute coords)
    const cellKey = (gx: number, gz: number) =>
      (gx - info.cx + 1024) * 4096 + (gz - info.cz + 1024);
    const cornerKey = (cgx: number, cgz: number) =>
      (cgx - info.cx + 1024) * 2048 + (cgz - info.cz + 1024);

    // ---- 1. collect the pool's cells (the exact set the chunk mesher
    // paints flat — lava weight > 0.55 coming from the caldera pool) ----
    const cellH = new Map<number, number>();
    const cells: Array<{ gx: number; gz: number; h: number }> = [];
    let poolR = 0;
    for (let gx = info.cx - POOL_SCAN; gx <= info.cx + POOL_SCAN; gx++) {
      for (let gz = info.cz - POOL_SCAN; gz <= info.cz + POOL_SCAN; gz++) {
        const s = volcanoSampleAt(gx, gz);
        if (!(s.lava > 0.55 && s.hasPool)) continue;
        const h = terrain.blockHeight(gx, gz);
        cellH.set(cellKey(gx, gz), h);
        cells.push({ gx, gz, h });
        const d = Math.hypot(gx - info.cx, gz - info.cz) + 0.5;
        if (d > poolR) poolR = d;
      }
    }
    if (cells.length < 4) return; // no real lake here

    // ---- 2. vanilla corner blend: lake level per grid corner ----
    // Each corner averages the molten tops of the (up to 4) pool cells
    // TOUCHING it — exactly how the rivers' wedges blend — so the old
    // ±1-2 block datum terraces turn into smooth continuous ramps and
    // neighbouring cells share their edge heights (one seamless skin).
    // The floor guard uses those SAME cells, so it only bites across a
    // real step, never flattening whole regions (that was the bug that
    // pinned the surface and froze the animation).
    interface Corner {
      wx: number;
      wz: number;
      level: number;
      /** Static lift above the level: the dome profile (world units). */
      lift: number;
      /** Highest basin floor touching the corner (world Y). */
      floorY: number;
      /** 0 at the shoreline .. 1 at the centre (dome weight + shading). */
      dome: number;
    }
    const corners = new Map<number, Corner>();

    for (const c of cells) {
      for (let q = 0; q < 4; q++) {
        const cgx = c.gx + (q & 1 ? 1 : 0);
        const cgz = c.gz + (q & 2 ? 1 : 0);
        const id = cornerKey(cgx, cgz);
        if (corners.has(id)) continue;
        let sum = 0;
        let n = 0;
        let floorTop = -Infinity;
        for (let ox = -1; ox <= 0; ox++) {
          for (let oz = -1; oz <= 0; oz++) {
            const h = cellH.get(cellKey(cgx + ox, cgz + oz));
            if (h === undefined) continue;
            const top = (h + 0.5) * block;
            sum += top;
            n++;
            if (top > floorTop) floorTop = top;
          }
        }
        if (n === 0) continue;
        const wx = (cgx - gridOffset) * block;
        const wz = (cgz - gridOffset) * block;
        const dome = 1 - smoothstep01(
          clamp01(Math.hypot(wx - cxw, wz - czw) / (poolR * block))
        );
        corners.set(id, {
          wx,
          wz,
          level: sum / n,
          lift: (EDGE_LIFT + DOME_LIFT * dome) * block,
          floorY: floorTop + FLOOR_GAP * block,
          dome,
        });
      }
    }

    /** Molten surface Y at a corner (time-animated, floor-guarded). */
    const surfaceY = (corner: Corner, t: number): number => {
      let y =
        corner.level + corner.lift + waveY(corner.wx, corner.wz, t, info.salt);
      if (y < corner.floorY) y = corner.floorY;
      return y;
    };

    // ---- 3. geometry: tops + boundary skirts, one animated buffer ----
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const anim: number[] = [];

    /** Pushes one animated vertex sampling the wave at a corner. */
    const pushAnim = (
      x: number,
      z: number,
      corner: Corner,
      bright: number,
      topUv: boolean,
      u: number
    ): void => {
      const y = surfaceY(corner, 0);
      pos.push(x, y, z);
      uv.push(
        topUv ? x / (block * TILE_BLOCKS) : u,
        topUv ? z / (block * TILE_BLOCKS) : y / (block * TILE_BLOCKS)
      );
      col.push(bright, bright, bright);
      anim.push(corner.wx, corner.wz, corner.level + corner.lift, corner.floorY, 1);
    };

    /** Pushes one static vertex (skirt bottoms). */
    const pushStatic = (
      x: number,
      y: number,
      z: number,
      u: number,
      bright: number
    ): void => {
      pos.push(x, y, z);
      uv.push(u, y / (block * TILE_BLOCKS));
      col.push(bright, bright, bright);
      anim.push(x, z, y, y, 0); // amp 0: frozen at its own Y
    };

    for (const c of cells) {
      const x0 = (c.gx - gridOffset) * block;
      const x1 = x0 + block;
      const z0 = (c.gz - gridOffset) * block;
      const z1 = z0 + block;
      const c00 = corners.get(cornerKey(c.gx, c.gz));
      const c10 = corners.get(cornerKey(c.gx + 1, c.gz));
      const c01 = corners.get(cornerKey(c.gx, c.gz + 1));
      const c11 = corners.get(cornerKey(c.gx + 1, c.gz + 1));
      if (!c00 || !c10 || !c01 || !c11) continue;

      // crest-bright / trough-dark relief shading (fullbright lava still
      // reads depth through the vertex-tinted crust)
      const b00 = 0.82 + 0.18 * c00.dome;
      const b10 = 0.82 + 0.18 * c10.dome;
      const b01 = 0.82 + 0.18 * c01.dome;
      const b11 = 0.82 + 0.18 * c11.dome;

      // CCW from above: (x0,z0) (x0,z1) (x1,z1) / (x0,z0) (x1,z1) (x1,z0)
      pushAnim(x0, z0, c00, b00, true, 0);
      pushAnim(x0, z1, c01, b01, true, 0);
      pushAnim(x1, z1, c11, b11, true, 0);
      pushAnim(x0, z0, c00, b00, true, 0);
      pushAnim(x1, z1, c11, b11, true, 0);
      pushAnim(x1, z0, c10, b10, true, 0);

      // ---- shoreline skirts: the melt's visible THICKNESS ----
      const myTop = (c.h + 0.5) * block;
      const bot = myTop - SKIRT_TUCK * block;
      const inset = SKIRT_INSET * block;
      for (let d = 0; d < 4; d++) {
        const dx = d === 0 ? 1 : d === 1 ? -1 : 0;
        const dz = d === 2 ? 1 : d === 3 ? -1 : 0;
        if (cellH.has(cellKey(c.gx + dx, c.gz + dz))) continue; // lava side

        // the edge's two corners (order: a -> b follows the top skin)
        let ea: Corner, eb: Corner;
        if (d === 0) {
          ea = c10;
          eb = c11;
        } else if (d === 1) {
          ea = c01;
          eb = c00;
        } else if (d === 2) {
          ea = c11;
          eb = c01;
        } else {
          ea = c00;
          eb = c10;
        }

        const ax = (d === 0 ? x1 : d === 1 ? x0 : ea.wx) - dx * inset;
        const az = (d === 2 ? z1 : d === 3 ? z0 : ea.wz) - dz * inset;
        const bx = (d === 0 ? x1 : d === 1 ? x0 : eb.wx) - dx * inset;
        const bz = (d === 2 ? z1 : d === 3 ? z0 : eb.wz) - dz * inset;
        const uA =
          (ax * Math.abs(dx) + az * Math.abs(dz)) / (block * TILE_BLOCKS);
        const uB =
          (bx * Math.abs(dx) + bz * Math.abs(dz)) / (block * TILE_BLOCKS);
        const bA = 0.82 + 0.18 * ea.dome;
        const bB = 0.82 + 0.18 * eb.dome;

        pushAnim(ax, az, ea, bA, false, uA);
        pushStatic(ax, bot, az, uA, 0.6);
        pushStatic(bx, bot, bz, uB, 0.6);
        pushAnim(ax, az, ea, bA, false, uA);
        pushStatic(bx, bot, bz, uB, 0.6);
        pushAnim(bx, bz, eb, bB, false, uB);
      }
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.Float32BufferAttribute(pos, 3);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();

    const mesh = new THREE.Mesh(geo, bodyMat);
    mesh.matrixAutoUpdate = false; // world-space vertices
    // vanilla lava is fullbright — never shadowed, never shadow-casting
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    group.add(mesh);
    scene.add(group);

    bodies.set(key, {
      key,
      cxw,
      czw,
      actR,
      salt: info.salt,
      group,
      mesh,
      posAttr,
      animData: new Float32Array(anim),
      vertCount: pos.length / 3,
      probe: 0,
    });
  }

  function disposeBody(key: string, body: PoolBody): void {
    if (body.mesh) {
      body.mesh.geometry.dispose();
      body.group.remove(body.mesh);
    }
    scene.remove(body.group);
    bodies.delete(key);
  }

  // ---------------- per-frame driver ----------------
  let time = 0;
  let enumAcc = 1; // enumerate on the first update
  let surfAcc = 0;
  const SURF_DT = 1 / 30; // the melt sways at 30 Hz — plenty for magma

  function update(dt: number, playerX: number, playerZ: number): void {
    enumAcc += dt;
    if (enumAcc >= 0.5) {
      enumAcc = 0;
      const gx = Math.round(playerX / block) + gridOffset;
      const gz = Math.round(playerZ / block) + gridOffset;
      for (const info of volcanoesNear(gx, gz)) {
        buildBody(info, playerX, playerZ);
      }
      for (const [key, body] of bodies) {
        const d = Math.hypot(playerX - body.cxw, playerZ - body.czw);
        if (d > body.actR * 1.45) disposeBody(key, body);
      }
    }

    time += dt;
    surfAcc += dt;
    if (surfAcc < SURF_DT) return;
    surfAcc = 0;

    for (const body of bodies.values()) {
      const attr = body.posAttr;
      if (!attr) continue;
      const arr = attr.array as Float32Array;
      const data = body.animData;
      const n = body.vertCount;
      const salt = body.salt;
      for (let i = 0; i < n; i++) {
        const o = i * 5;
        const amp = data[o + 4];
        let y: number;
        if (amp === 0) {
          y = data[o + 2]; // static skirt bottom
        } else {
          y =
            data[o + 2] + waveY(data[o], data[o + 1], time, salt) * amp;
          const fl = data[o + 3];
          if (y < fl) y = fl;
        }
        arr[i * 3 + 1] = y;
      }
      attr.needsUpdate = true;
    }
  }

  function stats(): { bodies: number; verts: number } {
    let verts = 0;
    for (const body of bodies.values()) verts += body.vertCount;
    return { bodies: bodies.size, verts };
  }

  function debugSpot(): { x: number; y: number; z: number } | null {
    for (const body of bodies.values()) {
      if (!body.mesh || !body.posAttr) continue;
      const arr = body.posAttr.array as Float32Array;
      const i = body.probe * 3;
      return { x: arr[i], y: arr[i + 1] + 2, z: arr[i + 2] };
    }
    return null;
  }

  function dispose(): void {
    for (const [key, body] of bodies) disposeBody(key, body);
    bodyMat.dispose();
    feed.dispose();
  }

  return { update, stats, debugSpot, dispose };
}
