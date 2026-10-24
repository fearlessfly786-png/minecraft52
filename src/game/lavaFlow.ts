/**
 * MINECRAFT-STYLE DYNAMIC LAVA FLOWS for the RATFIRE volcano biome.
 *
 * The caldera lake used to be the only lava; its flank "flows" were baked
 * material stripes. This module turns every stratovolcano into a LIVING
 * vanilla volcano:
 *
 *  - SOURCES: each cone's flow bearings breach the crater rim (see
 *    volcanoTerrain.ts `volcanoesNear`) — those rim cells are permanent
 *    level-8 sources, fed by the caldera pool like vanilla source blocks.
 *  - FLOW SIM (vanilla rules): one spread step per 30 game ticks (1.5 s,
 *    overworld lava pace). Flowing DOWN a drop never decays the level — a
 *    fall resets the column full, so source-fed rivers run all the way to
 *    the base. Spreading across flat/equal ground decays 2 per block
 *    (a level-8 source pools 3 blocks — 8,6,4,2 — then dies), and on
 *    slopes the pour channels toward the LOWEST neighbour only, so rivers
 *    meander downslope instead of fanning into a flood.
 *  - RENDERING (vanilla fluid geometry): a cell's molten surface is a
 *    TILTED SHEET, not a flat box. Each grid corner of the surface blends
 *    the level/9 heights of the cells touching that corner — exactly how
 *    Minecraft blends fluid corners: downstream corners dip toward the
 *    lower cell, upstream corners ramp toward the pourer, open banks and
 *    air let the melt bend toward the block bottom (at most one block),
 *    and walls at/above the melt are ignored. One blended height per
 *    corner makes neighbouring sheets meet EXACTLY, so flows render as
 *    smooth wedges sliding downhill — thin run-out tongues at the tip,
 *    near-full cubes at the source — never a staircase of square slabs.
 *  - FALLS (vanilla falling fluid): wherever an edge between two lava
 *    cells drops 2+ blocks of ground (a real cliff), the corner blend
 *    cannot span the gap — so each side keeps ITS OWN height at those
 *    pour corners and a REAL 3D POUR BLOCK seals the contact: the melt
 *    curls over the lip and pours as a FULL SOLID BLOCK — the curtain
 *    fills the air cell below the lip (one block deep off the rock),
 *    with the crust texture on EVERY side: front face, two side
 *    flanks, lip shelf on top and an underside where it hangs above
 *    the pool. One open side pours one block column, two open sides
 *    pour two, and where they meet a sealed corner-wrap block closes
 *    the diagonal cell — no open wedge from any angle. Pour faces
 *    live on the wrapping side tile whose offset.y glides downward
 *    continuously (and offset.x drifts), so every pour visibly FLOWS
 *    from top to bottom.
 *  - Side walls otherwise appear only where the sheet truly hangs above
 *    a bank (pool lips). Walls sample the same wrapping tile; both
 *    materials are UNLIT MeshBasic — vanilla lava is fullbright (light
 *    level 15).
 *  - PARTICLES: vanilla-style lava pops — little incandescent droplets
 *    that jump off random flow cells near the player, rise and fall back
 *    with gravity, fading out (additive points, no GPU cost when idle).
 *
 * Sims are created lazily as the player approaches a cone (with a
 * deterministic fast-forward so the rivers already pour on arrival) and
 * disposed beyond hysteresis range, so the whole endless world keeps at
 * most one or two live simulations.
 */

import * as THREE from 'three';
import { volcanoesNear, type VolcanoFlowInfo } from './volcanoTerrain';
import { createLavaFlowFeed, type LavaFlowFeed } from './extraTextures';

/** Vanilla overworld pacing: one spread step per 30 game ticks (1.5 s). */
const SPREAD_STEP_S = 1.5;
/** Vanilla flowing texture pace: 1 texel of the classic 16px tile every
 *  3 ticks = one full cycle every 2.4 s — now gliding continuously. */
const POUR_CYCLE_S = 2.4;
/** Vanilla overworld decay: a level-8 source pools 3 blocks across flats
 *  (8 -> 6 -> 4 -> 2 -> dead). Falls never decay — they reset full. */
const LEVEL_DECAY = 2;
const MAX_LEVEL = 8;
/** Perf guard per cone. */
const MAX_CELLS = 4200;
/** New cones pre-run this many spread steps so rivers already pour. */
const PREWARM_STEPS = 26;

/** Vanilla flow surface height: level/9 of a block above the ground top —
 *  level 8 rides a near-full cube (8/9), the weakest tongue sits at 2/9.
 *  Ground steps of 2+ blocks are POUR cliffs: the corner blend cannot
 *  span them, so the melt unblends across the contact and a REAL 3D
 *  pour block carries it top to bottom. */
const FALL_DROP = 2;
/** The falling melt is a REAL FULL 3D BLOCK (vanilla falling fluid): the
 *  curtain fills the air cell below the lip — its front face stands a
 *  full block proud of the rock plane and every side of the block is
 *  textured geometry (front, two flanks, lip shelf, underside). 0.98
 *  keeps the front a hair inside the far cell boundary so it can never
 *  z-fight a rock wall on the other side. */
const POUR_PROTRUDE = 0.98;
function lavaLift(block: number, level: number): number {
  return (block * level) / 9;
}

interface FlowCell {
  gx: number;
  gz: number;
  /** Ground height (blockHeight grid value) under the cell. */
  h: number;
  /** Vanilla flow level 1..8 (8 = source-fed full). */
  level: number;
}

interface Sim {
  info: VolcanoFlowInfo;
  /** World-space cone centre. */
  wx: number;
  wz: number;
  /** World-space activation radius (with dispose hysteresis). */
  actR: number;
  cells: Map<number, FlowCell>;
  /** Flat snapshot refreshed on rebuild (particle spawn source). */
  cellArr: FlowCell[];
  group: THREE.Group;
  topMesh: THREE.Mesh | null;
  skirtMesh: THREE.Mesh | null;
  dirty: boolean;
}

export interface LavaFlowHandle {
  /** Drive the sims, the scroll and the particles. Call per frame. */
  update(dt: number, playerX: number, playerZ: number): void;
  /** Live sim + cell counts (debug handle). */
  stats(): { volcanoes: number; cells: number };
  /** Debug: run N extra spread steps on every live sim right now. */
  debugFastForward(steps: number): void;
  /** Debug: world-space spot on a live mid-flank flow cell (or null). */
  debugSpot(): { x: number; y: number; z: number } | null;
  /** Debug: world-space spot on a live cliff pour (fall face midpoint). */
  debugFallSpot(): { x: number; y: number; z: number } | null;
  dispose(): void;
}

export function createLavaFlowSystem(
  scene: THREE.Scene,
  terrain: { blockHeight(gx: number, gz: number): number },
  opts: { block: number; gridOffset: number; lowSpec?: boolean }
): LavaFlowHandle {
  const block = opts.block;
  const gridOffset = opts.gridOffset;
  const maxCells = opts.lowSpec ? 2400 : MAX_CELLS;
  const prewarmSteps = opts.lowSpec ? 18 : PREWARM_STEPS;

  const feed: LavaFlowFeed = createLavaFlowFeed();

  // flat faces sample the atlas (top half = tops); walls sample the
  // wrapping side tile whose offset pours down AND drifts sideways —
  // both UNLIT MeshBasic (vanilla lava is fullbright, light level 15)
  const topMat = new THREE.MeshBasicMaterial({
    map: feed.atlas,
    side: THREE.DoubleSide,
  });
  const skirtMat = new THREE.MeshBasicMaterial({
    map: feed.side,
    side: THREE.DoubleSide,
  });

  // ---------------- cone simulations ----------------
  const sims = new Map<string, Sim>();

  function keyOf(sim: Sim, gx: number, gz: number): number {
    // local pack — flow extent never exceeds ~150 blocks from the centre
    return (gx - sim.info.cx + 1024) * 2048 + (gz - sim.info.cz + 1024);
  }

  /** One vanilla spread step: every live cell tries to pour further. */
  function spreadStep(sim: Sim): void {
    const cells = sim.cells;
    if (cells.size === 0 || cells.size >= maxCells) return;
    const heightAt = terrain.blockHeight;
    // births collect into a max-level map so two channels converging on
    // the same cell keep the stronger flow and insert exactly once
    const births = new Map<number, FlowCell>();
    let grew = false;

    for (const cell of cells.values()) {
      const myTop = (cell.h + 0.5) * block + lavaLift(block, cell.level);

      // pass 1: how deep does the ground drop around this cell?
      let lowest = cell.h;
      let hasLower = false;
      for (let d = 0; d < 4; d++) {
        const nh = heightAt(
          cell.gx + (d === 0 ? 1 : d === 1 ? -1 : 0),
          cell.gz + (d === 2 ? 1 : d === 3 ? -1 : 0)
        );
        if (nh < cell.h) hasLower = true;
        if (nh < lowest) lowest = nh;
      }

      // pass 2: pour
      for (let d = 0; d < 4; d++) {
        const dx = d === 0 ? 1 : d === 1 ? -1 : 0;
        const dz = d === 2 ? 1 : d === 3 ? -1 : 0;
        const ngx = cell.gx + dx;
        const ngz = cell.gz + dz;
        const nh = heightAt(ngx, ngz);

        let nl: number;
        if (nh < cell.h) {
          nl = MAX_LEVEL; // a fall resets the column full (vanilla rule)
        } else {
          nl = cell.level - LEVEL_DECAY; // flat flood decays per block
          if (nl <= 0) continue;
          if (hasLower && nh > lowest) continue; // channel to the drop only
        }
        // lava can never climb over a wall: the neighbour's ground top
        // must sit below my molten surface
        if (myTop <= (nh + 0.5) * block) continue;

        const key = keyOf(sim, ngx, ngz);
        const existing = cells.get(key);
        if (existing) {
          if (nl > existing.level) {
            existing.level = nl; // re-fed from upstream
            grew = true;
          }
        } else if (cells.size + births.size < maxCells) {
          const prev = births.get(key);
          if (!prev || nl > prev.level) {
            births.set(key, {
              gx: ngx,
              gz: ngz,
              h: nh,
              level: nl,
            });
          }
        }
      }
    }

    if (births.size > 0) {
      for (const [key, cell] of births) cells.set(key, cell);
      grew = true;
    }
    if (grew) sim.dirty = true;
  }

  // ---------------- geometry rebuild ----------------

  function makeGeom(
    pos: number[],
    nor: number[],
    uv: number[]
  ): THREE.BufferGeometry | null {
    if (pos.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    return g;
  }

  function rebuildSim(sim: Sim): void {
    if (sim.topMesh) {
      sim.group.remove(sim.topMesh);
      sim.topMesh.geometry.dispose();
      sim.topMesh = null;
    }
    if (sim.skirtMesh) {
      sim.group.remove(sim.skirtMesh);
      sim.skirtMesh.geometry.dispose();
      sim.skirtMesh = null;
    }

    const b2 = block / 2;
    const topPos: number[] = [];
    const topNor: number[] = [];
    const topUv: number[] = [];
    const skPos: number[] = [];
    const skNor: number[] = [];
    const skUv: number[] = [];
    const cellArr: FlowCell[] = [];
    const heightAt = terrain.blockHeight;

    // absolute molten surface Y of every live cell (ground + level/9)
    const surf = new Map<number, number>();
    for (const c of sim.cells.values()) {
      surf.set(
        keyOf(sim, c.gx, c.gz),
        (c.h + 0.5) * block + lavaLift(block, c.level)
      );
    }

    // ---- VANILLA FLUID CORNER BLEND --------------------------------
    // Minecraft never renders fluid as stacked flat boxes: each grid
    // corner of the surface blends the heights of the cells touching it,
    // so sheets TILT with the flow. One blended height per corner also
    // guarantees neighbouring sheets meet EXACTLY — no seams, no steps.
    //
    // POUR CORNERS are the exception: when an EDGE through the corner
    // drops 2+ blocks between two lava cells (a real cliff), the blend
    // cannot span the gap — instead each side keeps its own height there
    // (the lip above, the pool toe below) and the wall pass seals the
    // contact with a vertical FALL FACE, vanilla's falling fluid.
    const cornerH = new Map<number, number>(); // flow corners: one height
    const pourH = new Map<number, number>(); // pour corners: per side

    /** The classic corner blend (lava neighbours pull, open banks drape
     *  at most one block, walls at/above the melt are ignored). */
    function blendCorner(
      gs: number[],
      ss: Array<number | undefined>
    ): number {
      let maxSurf = -Infinity;
      let minGround = Infinity;
      for (let q = 0; q < 4; q++) {
        const s = ss[q];
        if (s !== undefined) {
          if (s > maxSurf) maxSurf = s;
          if (gs[q] < minGround) minGround = gs[q];
        }
      }
      // open banks and air let the surface bend toward the ground, but
      // never more than one block below the highest melt (vanilla's
      // block-bottom drape bound — the tongue tip thins, cliffs pour)
      const drape = Math.max(minGround, maxSurf - block);
      let sum = 0;
      let n = 0;
      let floor = -Infinity;
      for (let q = 0; q < 4; q++) {
        const s = ss[q];
        if (s !== undefined) {
          sum += s; // lava neighbour pulls the corner to its surface
          n++;
          if (gs[q] > floor) floor = gs[q];
        } else if (gs[q] < maxSurf) {
          sum += drape; // air / lower bank — the sheet drapes
          n++;
          if (gs[q] > floor) floor = gs[q];
        }
        // else: wall at/above the melt — lava never climbs it
      }
      // the surface can never dip into the terrain it touches
      return Math.max(sum / n, floor);
    }

    function cornerHeightFor(ref: FlowCell, cx: number, cz: number): number {
      const cornerId =
        (cx - sim.info.cx + 1024) * 2048 + (cz - sim.info.cz + 1024);

      // the four cells sharing this grid corner
      const gs: number[] = [];
      const ss: Array<number | undefined> = [];
      for (let q = 0; q < 4; q++) {
        const gx = cx - (q & 1 ? 0 : 1);
        const gz = cz - (q & 2 ? 0 : 1);
        gs.push((heightAt(gx, gz) + 0.5) * block);
        ss.push(surf.get(keyOf(sim, gx, gz)));
      }

      // pour corner? one of the four EDGES through this point drops 2+
      // blocks between two lava cells (the four side pairs — diagonals
      // only touch at the point, they share no cliff face)
      let pour = false;
      for (let e = 0; e < 4 && !pour; e++) {
        const a = e === 0 ? 0 : e === 1 ? 2 : e === 2 ? 0 : 1;
        const b = e === 0 ? 1 : e === 1 ? 3 : e === 2 ? 2 : 3;
        if (
          ss[a] !== undefined &&
          ss[b] !== undefined &&
          gs[a] - gs[b] >= block * FALL_DROP
        )
          pour = true;
        if (
          ss[a] !== undefined &&
          ss[b] !== undefined &&
          gs[b] - gs[a] >= block * FALL_DROP
        )
          pour = true;
      }

      if (!pour) {
        const cached = cornerH.get(cornerId);
        if (cached !== undefined) return cached;
        const h = blendCorner(gs, ss);
        cornerH.set(cornerId, h);
        return h;
      }

      // pour corner: this sheet keeps ITS side of the cliff. Lava cells
      // 2+ blocks above/below my ground are a vertical pour contact —
      // the fall face seals it, so they must not drag my corner across
      // the rock (that was the old "ski-jump ramp" artifact).
      const id = (keyOf(sim, ref.gx, ref.gz) + 1) * 4194304 + cornerId;
      const cached = pourH.get(id);
      if (cached !== undefined) return cached;
      const refGround = (ref.h + 0.5) * block;
      const fss = ss.slice();
      for (let q = 0; q < 4; q++) {
        if (
          fss[q] !== undefined &&
          Math.abs(gs[q] - refGround) >= block * FALL_DROP
        )
          fss[q] = undefined;
      }
      const h = blendCorner(gs, fss);
      pourH.set(id, h);
      return h;
    }

    /** Up-facing TILTED quad into the top bucket (atlas top half). The
     *  four corners carry the blended heights, so the sheet slopes. */
    function pushTopTilted(
      x0: number,
      x1: number,
      z0: number,
      z1: number,
      y00: number,
      y10: number,
      y01: number,
      y11: number
    ): void {
      // CCW seen from above: (x0,z0) (x0,z1) (x1,z1) (x1,z0)
      topPos.push(x0, y00, z0, x0, y01, z1, x1, y11, z1);
      topPos.push(x0, y00, z0, x1, y11, z1, x1, y10, z0);
      for (let i = 0; i < 6; i++) topNor.push(0, 1, 0);
      topUv.push(0, 0.5, 0, 1, 1, 1);
      topUv.push(0, 0.5, 1, 1, 1, 0.5);
    }

    /** Vertical POUR COLUMN — vanilla falling fluid built as a REAL FULL
     *  3D BLOCK of melt hanging off the cliff: the curtain fills the air
     *  cell below the lip, one block deep, and EVERY side of the block
     *  is actual textured geometry — (1) the downstream face a full block
     *  proud of the rock plane, (2) two SIDE FLANKS along the open edges
     *  (shrunk a hair off shared planes so neighbouring pours never
     *  z-fight), (3) a curled lip shelf sealing the block to the sheet
     *  above, (4) an UNDERSIDE where the block hangs above the pool
     *  (skipped mid-spread when it stands on the ground). All faces
     *  carry ABSOLUTE-world v, so stacked falls and side-by-side pours
     *  tile into one continuous top-to-bottom wall under the shared
     *  side scroll. */
    function pushPourColumn(
      ex0: number,
      ez0: number,
      ex1: number,
      ez1: number,
      nx: number,
      nz: number,
      t0: number,
      t1: number,
      b0: number,
      b1: number,
      groundRef: number
    ): void {
      if (Math.max(t0, t1) - Math.min(b0, b1) < block * 0.02) return;
      const inset = block * 0.02;
      // flanks pull inward this much so coplanar flank pairs between
      // neighbouring pours never fight on the shared cell plane
      const eps = block * 0.01;
      // slab back edge (a hair off the rock, no z-fight) and front edge
      // (a full block proud — the curtain fills the air cell below)
      const kx0 = ex0 + nx * inset;
      const kz0 = ez0 + nz * inset;
      const kx1 = ex1 + nx * inset;
      const kz1 = ez1 + nz * inset;
      const fx0 = ex0 + nx * block * POUR_PROTRUDE;
      const fz0 = ez0 + nz * block * POUR_PROTRUDE;
      const fx1 = ex1 + nx * block * POUR_PROTRUDE;
      const fz1 = ez1 + nz * block * POUR_PROTRUDE;

      // 1) downstream face — the visible pour sheet of the block
      skPos.push(fx0, b0, fz0, fx1, b1, fz1, fx1, t1, fz1);
      skPos.push(fx0, b0, fz0, fx1, t1, fz1, fx0, t0, fz0);
      for (let i = 0; i < 6; i++) skNor.push(nx, 0, nz);
      skUv.push(0, b0 / block, 1, b1 / block, 1, t1 / block);
      skUv.push(0, b0 / block, 1, t1 / block, 0, t0 / block);

      // 2) side flanks — the slab's open SIDES (a proper block shows all
      //    its faces), pulled inward by eps off the shared cell planes.
      //    Outward normals are the front normal rotated ±90°.
      const tax = nz;
      const taz = -nx;
      const tbx = -nz;
      const tbz = nx;
      const s0x = kx0 - tax * eps;
      const s0z = kz0 - taz * eps;
      const f0x = fx0 - tax * eps;
      const f0z = fz0 - taz * eps;
      const s1x = kx1 + tax * eps;
      const s1z = kz1 + taz * eps;
      const f1x = fx1 + tax * eps;
      const f1z = fz1 + taz * eps;
      skPos.push(s0x, t0, s0z, f0x, t0, f0z, f0x, b0, f0z);
      skPos.push(s0x, t0, s0z, f0x, b0, f0z, s0x, b0, s0z);
      for (let i = 0; i < 6; i++) skNor.push(tax, 0, taz);
      skUv.push(0, t0 / block, 1, t0 / block, 1, b0 / block);
      skUv.push(0, t0 / block, 1, b0 / block, 0, b0 / block);
      skPos.push(s1x, t1, s1z, f1x, t1, f1z, f1x, b1, f1z);
      skPos.push(s1x, t1, s1z, f1x, b1, f1z, s1x, b1, s1z);
      for (let i = 0; i < 6; i++) skNor.push(tbx, 0, tbz);
      skUv.push(0, t1 / block, 1, t1 / block, 1, b1 / block);
      skUv.push(0, t1 / block, 1, b1 / block, 0, b1 / block);

      // 3) lip shelf — the block's top, curling from the sheet edge out
      //    to the protruded face (seals the slab so it reads closed)
      topPos.push(kx0, t0, kz0, kx1, t1, kz1, fx1, t1, fz1);
      topPos.push(kx0, t0, kz0, fx1, t1, fz1, fx0, t0, fz0);
      for (let i = 0; i < 6; i++) topNor.push(0, 1, 0);
      topUv.push(0, 0.5, 1, 0.5, 1, 0.56);
      topUv.push(0, 0.5, 1, 0.56, 0, 0.56);

      // 4) underside — seals the block where it hangs above the pool
      //    (mid-spread pours stand on the ground and need none)
      if (Math.min(b0, b1) > groundRef + block * 0.05) {
        topPos.push(kx0, b0, kz0, kx1, b1, kz1, fx1, b1, fz1);
        topPos.push(kx0, b0, kz0, fx1, b1, fz1, fx0, b0, fz0);
        for (let i = 0; i < 6; i++) topNor.push(0, -1, 0);
        topUv.push(0, 0.5, 1, 0.5, 1, 0.56);
        topUv.push(0, 0.5, 1, 0.56, 0, 0.56);
      }
    }

    for (const cell of sim.cells.values()) {
      cellArr.push(cell);
      const cxw = (cell.gx - gridOffset) * block;
      const czw = (cell.gz - gridOffset) * block;
      const myGroundTop = (cell.h + 0.5) * block;
      const x0 = cxw - b2;
      const x1 = cxw + b2;
      const z0 = czw - b2;
      const z1 = czw + b2;

      // the four blended sheet corners — the surface flows through them
      const y00 = cornerHeightFor(cell, cell.gx, cell.gz);
      const y10 = cornerHeightFor(cell, cell.gx + 1, cell.gz);
      const y01 = cornerHeightFor(cell, cell.gx, cell.gz + 1);
      const y11 = cornerHeightFor(cell, cell.gx + 1, cell.gz + 1);

      // --- molten surface: a smooth wedge sliding downhill ---
      pushTopTilted(x0, x1, z0, z1, y00, y10, y01, y11);

      // --- side walls, pool lips and VANILLA FALLS -------------------
      // pours on this cell (for the corner chamfers below): one open
      // side pours one block face, two open sides pour two
      const pours: Array<{
        d: number;
        t0: number;
        t1: number;
        b0: number;
        b1: number;
      }> = [];
      for (let d = 0; d < 4; d++) {
        const dx = d === 0 ? 1 : d === 1 ? -1 : 0;
        const dz = d === 2 ? 1 : d === 3 ? -1 : 0;
        const ngx = cell.gx + dx;
        const ngz = cell.gz + dz;
        const nH = heightAt(ngx, ngz);
        const nGroundTop = (nH + 0.5) * block;
        const nSurf = surf.get(keyOf(sim, ngx, ngz));
        const drop = cell.h - nH;

        // this edge's two blended corner heights (match the top sheet)
        let t0: number, t1: number;
        if (d === 0) {
          t0 = y10; t1 = y11;
        } else if (d === 1) {
          t0 = y01; t1 = y00;
        } else if (d === 2) {
          t0 = y11; t1 = y01;
        } else {
          t0 = y00; t1 = y10;
        }

        // edge endpoints + outward normal per direction
        let ex0: number, ez0: number, ex1: number, ez1: number, nx: number, nz: number;
        if (d === 0) {
          ex0 = x1; ez0 = z0; ex1 = x1; ez1 = z1; nx = 1; nz = 0;
        } else if (d === 1) {
          ex0 = x0; ez0 = z1; ex1 = x0; ez1 = z0; nx = -1; nz = 0;
        } else if (d === 2) {
          ex0 = x1; ez0 = z1; ex1 = x0; ez1 = z1; nx = 0; nz = 1;
        } else {
          ex0 = x0; ez0 = z0; ex1 = x1; ez1 = z0; nx = 0; nz = -1;
        }

        if (nSurf !== undefined) {
          // lava neighbour: the corner blend seals the sheets, EXCEPT
          // across a 2+ block cliff — there the melt POURS. Draw the
          // vertical fall face from my lip down to the lower sheet's own
          // corners (vanilla falling fluid, gliding top to bottom).
          if (drop >= FALL_DROP) {
            const nCell = sim.cells.get(keyOf(sim, ngx, ngz))!;
            let b0: number, b1: number;
            if (d === 0) {
              b0 = cornerHeightFor(nCell, cell.gx + 1, cell.gz);
              b1 = cornerHeightFor(nCell, cell.gx + 1, cell.gz + 1);
            } else if (d === 1) {
              b0 = cornerHeightFor(nCell, cell.gx, cell.gz + 1);
              b1 = cornerHeightFor(nCell, cell.gx, cell.gz);
            } else if (d === 2) {
              b0 = cornerHeightFor(nCell, cell.gx + 1, cell.gz + 1);
              b1 = cornerHeightFor(nCell, cell.gx, cell.gz + 1);
            } else {
              b0 = cornerHeightFor(nCell, cell.gx, cell.gz);
              b1 = cornerHeightFor(nCell, cell.gx + 1, cell.gz);
            }
            pushPourColumn(
              ex0,
              ez0,
              ex1,
              ez1,
              nx,
              nz,
              t0,
              t1,
              b0,
              b1,
              nGroundTop
            );
            pours.push({ d, t0, t1, b0, b1 });
          }
          continue;
        }

        if (drop >= FALL_DROP) {
          // cliff pour where the landing pool hasn't filled in yet
          // (mid-spread): drop the block straight to the ground so the
          // fall never gapes while the sim is still growing
          pushPourColumn(
            ex0,
            ez0,
            ex1,
            ez1,
            nx,
            nz,
            t0,
            t1,
            nGroundTop,
            nGroundTop,
            nGroundTop
          );
          pours.push({ d, t0, t1, b0: nGroundTop, b1: nGroundTop });
          continue;
        }

        // pool lip over a lower bank: wall bottom is my own block bottom,
        // raised to the bank top when the bank bites into my block (never
        // paint over terrain)
        const bottom = Math.max(myGroundTop, nGroundTop);
        if (Math.max(t0, t1) - bottom < block * 0.02) continue; // flush
        t0 = Math.max(t0, bottom);
        t1 = Math.max(t1, bottom);

        // v spans the wall height (the wrapping tile tiles the face and
        // its scroll makes the melt pour down it)
        const vt = (Math.max(t0, t1) - bottom) / block;
        skPos.push(ex0, bottom, ez0, ex1, bottom, ez1, ex1, t1, ez1);
        skPos.push(ex0, bottom, ez0, ex1, t1, ez1, ex0, t0, ez0);
        for (let i = 0; i < 6; i++) skNor.push(nx, 0, nz);
        skUv.push(0, 0, 1, 0, 1, vt);
        skUv.push(0, 0, 1, vt, 0, vt);
      }

      // --- corner wrap blocks -----------------------------------------
      // Where TWO sides of this cell are open and both pour, the two
      // full-block curtains leave the diagonal corner cell open. A
      // proper block fills EVERY open side, corners included: a sealed
      // corner-wrap block fills that cell — two outer walls continuing
      // both curtains' front planes around the post, plus a top and an
      // underside — so the melt wraps the corner with no gap from any
      // angle.
      if (pours.length >= 2) {
        const fd = block * POUR_PROTRUDE;
        // heights of a pour at one of its edge ends (the post)
        const endHeights = (
          p: (typeof pours)[number],
          px: number,
          pz: number
        ): { top: number; bot: number } => {
          let top: number;
          let bot: number;
          if (p.d === 0) {
            top = pz === z1 ? p.t1 : p.t0;
            bot = pz === z1 ? p.b1 : p.b0;
          } else if (p.d === 1) {
            top = pz === z1 ? p.t0 : p.t1;
            bot = pz === z1 ? p.b0 : p.b1;
          } else if (p.d === 2) {
            top = px === x1 ? p.t0 : p.t1;
            bot = px === x1 ? p.b0 : p.b1;
          } else {
            top = px === x0 ? p.t0 : p.t1;
            bot = px === x0 ? p.b0 : p.b1;
          }
          return { top, bot };
        };
        for (const px of [x0, x1]) {
          for (const pz of [z0, z1]) {
            // the X-side and Z-side pours whose edges touch this corner
            const pa = pours.find((p) => p.d === (px === x1 ? 0 : 1));
            const pb = pours.find((p) => p.d === (pz === z1 ? 2 : 3));
            if (!pa || !pb) continue;
            const ea = endHeights(pa, px, pz);
            const eb = endHeights(pb, px, pz);
            // both pours share this cell's sheet lip corner at the post;
            // the wrap hangs to the deeper of the two lower-sheet toes
            const top = ea.top;
            const bot = Math.min(ea.bot, eb.bot);
            const sxa = pa.d === 0 ? 1 : -1; // X-side pour direction
            const szb = pb.d === 2 ? 1 : -1; // Z-side pour direction
            const xFar = px + sxa * fd;
            const zFar = pz + szb * fd;
            // outer wall continuing pour A's front plane around the post
            skPos.push(xFar, top, pz, xFar, top, zFar, xFar, bot, zFar);
            skPos.push(xFar, top, pz, xFar, bot, zFar, xFar, bot, pz);
            for (let i = 0; i < 6; i++) skNor.push(sxa, 0, 0);
            skUv.push(0, top / block, 1, top / block, 1, bot / block);
            skUv.push(0, top / block, 1, bot / block, 0, bot / block);
            // outer wall continuing pour B's front plane around the post
            skPos.push(px, top, zFar, xFar, top, zFar, xFar, bot, zFar);
            skPos.push(px, top, zFar, xFar, bot, zFar, px, bot, zFar);
            for (let i = 0; i < 6; i++) skNor.push(0, 0, szb);
            skUv.push(0, top / block, 1, top / block, 1, bot / block);
            skUv.push(0, top / block, 1, bot / block, 0, bot / block);
            // top: the lip curling around the post (seals the wrap shut)
            topPos.push(px, top, pz, px, top, zFar, xFar, top, zFar);
            topPos.push(px, top, pz, xFar, top, zFar, xFar, top, pz);
            for (let i = 0; i < 6; i++) topNor.push(0, 1, 0);
            topUv.push(0, 0.5, 0, 0.56, 1, 0.56);
            topUv.push(0, 0.5, 1, 0.56, 1, 0.5);
            // underside: seal the wrap where it hangs above the pool
            const dgx = cell.gx + (px === x1 ? 1 : -1);
            const dgz = cell.gz + (pz === z1 ? 1 : -1);
            if (bot > (heightAt(dgx, dgz) + 0.5) * block + block * 0.05) {
              topPos.push(px, bot, pz, xFar, bot, pz, xFar, bot, zFar);
              topPos.push(px, bot, pz, xFar, bot, zFar, px, bot, zFar);
              for (let i = 0; i < 6; i++) topNor.push(0, -1, 0);
              topUv.push(0, 0.5, 1, 0.5, 1, 0.56);
              topUv.push(0, 0.5, 1, 0.56, 0, 0.56);
            }
          }
        }
      }
    }

    sim.cellArr = cellArr;

    const topGeom = makeGeom(topPos, topNor, topUv);
    if (topGeom) {
      const mesh = new THREE.Mesh(topGeom, topMat);
      mesh.matrixAutoUpdate = false; // world-space vertices
      // vanilla lava is FULLBRIGHT (light level 15) — no shadows on the
      // melt, or the terrace walls stripe the rivers dark
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      sim.group.add(mesh);
      sim.topMesh = mesh;
    }
    const skirtGeom = makeGeom(skPos, skNor, skUv);
    if (skirtGeom) {
      const mesh = new THREE.Mesh(skirtGeom, skirtMat);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      sim.group.add(mesh);
      sim.skirtMesh = mesh;
    }
  }

  // ---------------- lifecycle ----------------

  function disposeSim(key: string, sim: Sim): void {
    if (sim.topMesh) {
      sim.topMesh.geometry.dispose();
      sim.group.remove(sim.topMesh);
    }
    if (sim.skirtMesh) {
      sim.skirtMesh.geometry.dispose();
      sim.group.remove(sim.skirtMesh);
    }
    scene.remove(sim.group);
    sims.delete(key);
  }

  function ensureSim(
    info: VolcanoFlowInfo,
    playerX: number,
    playerZ: number
  ): void {
    const key = info.cx + ',' + info.cz;
    if (sims.has(key)) return;
    const wx = (info.cx - gridOffset) * block;
    const wz = (info.cz - gridOffset) * block;
    const actR = info.baseR * block * 1.7 + 2400;
    if (Math.hypot(playerX - wx, playerZ - wz) > actR) return;

    const sim: Sim = {
      info,
      wx,
      wz,
      actR,
      cells: new Map(),
      cellArr: [],
      group: new THREE.Group(),
      topMesh: null,
      skirtMesh: null,
      dirty: true,
    };
    sim.group.matrixAutoUpdate = false;
    // the rim breaches are permanent level-8 sources (the caldera feeds)
    for (const br of info.breaches) {
      const h = terrain.blockHeight(br.gx, br.gz);
      sim.cells.set(keyOf(sim, br.gx, br.gz), {
        gx: br.gx,
        gz: br.gz,
        h,
        level: MAX_LEVEL,
      });
    }
    // deterministic fast-forward: the rivers already run down the flank
    for (let i = 0; i < prewarmSteps; i++) spreadStep(sim);
    scene.add(sim.group);
    sims.set(key, sim);
  }

  // ---------------- vanilla lava pops (particles) ----------------
  const P_MAX = opts.lowSpec ? 90 : 160;
  const pPos = new Float32Array(P_MAX * 3);
  const pCol = new Float32Array(P_MAX * 3);
  const pVelY = new Float32Array(P_MAX);
  const pLife = new Float32Array(P_MAX);
  const pMaxLife = new Float32Array(P_MAX);
  for (let i = 0; i < P_MAX; i++) pPos[i * 3 + 1] = -1e9;
  let pCursor = 0;

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({
    size: block * 0.07,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pPoints = new THREE.Points(pGeo, pMat);
  pPoints.frustumCulled = false;
  scene.add(pPoints);

  function spawnPop(cell: FlowCell): void {
    const i = pCursor;
    pCursor = (pCursor + 1) % P_MAX;
    pPos[i * 3] =
      (cell.gx - gridOffset) * block + (Math.random() - 0.5) * block * 0.7;
    pPos[i * 3 + 1] =
      (cell.h + 0.5) * block + lavaLift(block, cell.level) + block * 0.04;
    pPos[i * 3 + 2] =
      (cell.gz - gridOffset) * block + (Math.random() - 0.5) * block * 0.7;
    pVelY[i] = block * (0.9 + Math.random() * 0.7);
    pMaxLife[i] = pLife[i] = 0.5 + Math.random() * 0.45;
  }

  let spawnAcc = 0;
  function updateParticles(dt: number, playerX: number, playerZ: number): void {
    spawnAcc += dt;
    if (spawnAcc >= 0.22) {
      spawnAcc = 0;
      // pop from the nearest live cone, cells near the player preferred
      let best: Sim | null = null;
      let bestD = Infinity;
      for (const sim of sims.values()) {
        if (sim.cellArr.length === 0) continue;
        const d = Math.hypot(playerX - sim.wx, playerZ - sim.wz);
        if (d < bestD) {
          bestD = d;
          best = sim;
        }
      }
      if (best && bestD < best.actR) {
        const arr = best.cellArr;
        const n = 1 + ((Math.random() * 2) | 0);
        for (let i = 0; i < n; i++) {
          let cell = arr[(Math.random() * arr.length) | 0];
          const dxc = (cell.gx - gridOffset) * block - playerX;
          const dzc = (cell.gz - gridOffset) * block - playerZ;
          if (dxc * dxc + dzc * dzc > 170 * 170) {
            cell = arr[(Math.random() * arr.length) | 0]; // one re-roll
            const dx2 = (cell.gx - gridOffset) * block - playerX;
            const dz2 = (cell.gz - gridOffset) * block - playerZ;
            if (dx2 * dx2 + dz2 * dz2 > 170 * 170) continue;
          }
          spawnPop(cell);
        }
      }
    }
    // integrate + fade (additive blending: colour -> 0 = invisible)
    for (let i = 0; i < P_MAX; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      if (pLife[i] <= 0) {
        pPos[i * 3 + 1] = -1e9;
        pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0;
        continue;
      }
      pVelY[i] -= block * 2.6 * dt;
      pPos[i * 3 + 1] += pVelY[i] * dt;
      const t = pLife[i] / pMaxLife[i];
      pCol[i * 3] = 1.0 * t;
      pCol[i * 3 + 1] = 0.62 * t * t;
      pCol[i * 3 + 2] = 0.18 * t * t;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  // ---------------- per-frame driver ----------------
  let simAcc = 0;
  let pourTime = 0;
  let enumAcc = 1; // enumerate on the first update

  function update(dt: number, playerX: number, playerZ: number): void {
    // lazy lifecycle: create sims near the player, retire the far ones
    enumAcc += dt;
    if (enumAcc >= 0.5) {
      enumAcc = 0;
      const gx = Math.round(playerX / block) + gridOffset;
      const gz = Math.round(playerZ / block) + gridOffset;
      for (const info of volcanoesNear(gx, gz)) {
        ensureSim(info, playerX, playerZ);
      }
      for (const [key, sim] of sims) {
        const d = Math.hypot(playerX - sim.wx, playerZ - sim.wz);
        if (d > sim.actR * 1.45) disposeSim(key, sim);
      }
    }

    // vanilla pacing: one spread step per 30 ticks
    simAcc += dt;
    while (simAcc >= SPREAD_STEP_S) {
      simAcc -= SPREAD_STEP_S;
      for (const sim of sims.values()) spreadStep(sim);
    }

    // smooth pour: the skirt texture glides continuously down the face
    // (same average pace as the vanilla step, but buttery — no jumps)
    // and also drifts SIDEWAYS, so the walls animate in 2D like vanilla
    pourTime += dt;
    feed.side.offset.y = (pourTime / POUR_CYCLE_S) % 1;
    feed.side.offset.x = (pourTime / (POUR_CYCLE_S * 4)) % 1;

    // rebuild budget: at most one cone's geometry per frame
    for (const sim of sims.values()) {
      if (sim.dirty) {
        sim.dirty = false;
        rebuildSim(sim);
        break;
      }
    }

    updateParticles(dt, playerX, playerZ);
  }

  function stats(): { volcanoes: number; cells: number } {
    let cells = 0;
    for (const sim of sims.values()) cells += sim.cells.size;
    return { volcanoes: sims.size, cells };
  }

  function debugFastForward(steps: number): void {
    for (const sim of sims.values()) {
      for (let i = 0; i < steps; i++) spreadStep(sim);
      sim.dirty = true;
    }
    for (const sim of sims.values()) {
      if (sim.dirty) {
        sim.dirty = false;
        rebuildSim(sim);
      }
    }
  }

  function debugSpot(): { x: number; y: number; z: number } | null {
    for (const sim of sims.values()) {
      // prefer a mid-flank cell: far enough from the rim to be IN a river
      const mid: FlowCell[] = [];
      const all: FlowCell[] = [];
      for (const cell of sim.cells.values()) {
        all.push(cell);
        const d = Math.hypot(cell.gx - sim.info.cx, cell.gz - sim.info.cz);
        if (d > sim.info.baseR * 0.2 && d < sim.info.baseR * 0.85) {
          mid.push(cell);
        }
      }
      const pool = mid.length > 0 ? mid : all;
      if (pool.length === 0) continue;
      const cell = pool[(Math.random() * pool.length) | 0];
      return {
        x: (cell.gx - gridOffset) * block,
        y: (cell.h + 0.5) * block + lavaLift(block, cell.level),
        z: (cell.gz - gridOffset) * block,
      };
    }
    return null;
  }

  function debugFallSpot(): { x: number; y: number; z: number } | null {
    for (const sim of sims.values()) {
      // prefer the TALLEST fall: the most dramatic top-to-bottom pour
      let best: { x: number; y: number; z: number } | null = null;
      let bestDrop = 0;
      for (const cell of sim.cells.values()) {
        for (let d = 0; d < 4; d++) {
          const nh = terrain.blockHeight(
            cell.gx + (d === 0 ? 1 : d === 1 ? -1 : 0),
            cell.gz + (d === 2 ? 1 : d === 3 ? -1 : 0)
          );
          const drop = cell.h - nh;
          if (drop < FALL_DROP || drop <= bestDrop) continue;
          bestDrop = drop;
          best = {
            x: (cell.gx - gridOffset) * block,
            y:
              (cell.h + nh + 1) * block * 0.5 + lavaLift(block, cell.level),
            z: (cell.gz - gridOffset) * block,
          };
        }
      }
      if (best) return best;
    }
    return null;
  }

  function dispose(): void {
    for (const [key, sim] of sims) disposeSim(key, sim);
    scene.remove(pPoints);
    pGeo.dispose();
    pMat.dispose();
    topMat.dispose();
    skirtMat.dispose();
    feed.dispose();
  }

  return { update, stats, debugFastForward, debugSpot, debugFallSpot, dispose };
}
