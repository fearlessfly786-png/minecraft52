/**
 * COCONUT PALMS around the oasis for RATFIRE — per the user's "create
 * and add some coconut trees around the oasis. make sure that the
 * coconut trees are straight", with the leaf texture cut through with
 * see-through holes (reference 1) and the banded-log trunk texture
 * (reference 2), both painted in src/game/palmTextures.ts.
 *
 *  - STRAIGHT TALLER TRUNKS: every trunk is a perfect 1x1 VERTICAL
 *    column of log blocks (8-10 tall, varied per tree — lightly
 *    heightened per the user's follow-up) — zero lean, zero bend, a
 *    plumb line from the grass to the crown.
 *  - WOOD BASE: each trunk's foot is ringed with 8 log STAIRS (the 3x3
 *    neighbourhood minus the centre) — the user's "make the base block
 *    like the stairs ... like this but in same texture" with the oak-
 *    stairs reference: classic two-box steps (full bottom slab + half-
 *    depth tall back half toward the trunk), each laid on its OWN
 *    column's ground height so the ring steps with the meadow drift —
 *    eight little staircases climbing to the tree.
 *  - CROWN: a flat palm rosette of cutout leaf blocks — four cardinal
 *    fronds reaching 3 blocks out with a drooped 4th tip, four diagonal
 *    fronds 2 out with a drooped 3rd tip — plus 2-4 VOXEL COCONUTS
 *    (user: "create coconuts like this in voxel style with texture and
 *    or hang it on the tree. random 2 to 4 coconut on each tree"):
 *    dedicated coconut-atlas mini cubes (the big-pixel husk mosaic +
 *    three-pore pores painted in palmTextures.ts), hung at the TOP OF
 *    THE TRUNK — each nut sits centred on ONE SIDE FACE of the top
 *    wood block (never the corners — user follow-up: "you placed the
 *    coconuts in the corners of the top wood block fix it and place
 *    the coconuts in the top centre of each side and the coconuts one
 *    side is only touch to the tree top wood block"), flush to that
 *    single face with a hairline render gap, top edge just under the
 *    crown slab, so every nut touches exactly one side and reads
 *    clearly from the ground. The count and which sides carry nuts
 *    are drawn per tree by fixed-integer-salt hashes.
 *  - PLACEMENT, TWO LAYERS (user: "add two layers of trees one is
 *    lightly more closer to the oasis, and increase the trees"): pure
 *    deterministic math (fixed-constant hashes, no per-session seed)
 *    sowing TWO concentric bands on the rough grass collar — an inner
 *    ring hugging the brim walkway and an outer ring set back across a
 *    deliberate bare gap, so the grove reads as two distinct layers —
 *    never on the spawn-side brim walkway, never on mud, never inside
 *    the spawn / jeep keep-out circles — with a jittered 7-block
 *    lattice and a hard minimum spacing so crowns never overlap. The
 *    back layer's trunks run a couple of logs taller than the front
 *    layer's, so the layering survives even from the spawn shore. The
 *    same predicate bakes the minimap's palm dots, so map and world
 *    always agree.
 *  - COLLISION: every wood block is solid — `collide()` carries one
 *    SQUARE axis-aligned box per block (all 8 base-ring blocks, each at
 *    its own ground height, plus the 1x1 trunk column) and pushes the
 *    player capsule out of each one, exactly like the jeep and the loot
 *    chests do. A box stops pushing once the player's feet rise above
 *    its top face, and the whole tree ghosts while flying above the
 *    crown (per the user's "add square collisions to all the blocks
 *    in the base of the tree").
 *  - STANDING (per the user's "make sure that player can stand over
 *    the base blocks like other"): `supportAt(x, z, maxY)` returns the
 *    highest solid block top at/below a ceiling that covers the point —
 *    the page max()es it with the terrain height, so jumping onto a
 *    base block LANDS on it and the grounded walk rides its top face
 *    exactly like the ground itself. The support footprint matches the
 *    visible block (plus a small capsule-overhang margin), and the
 *    push-out keeps guarding the sides below the top, so the blocks
 *    are proper Minecraft-style platforms: solid from the side, floor
 *    on top.
 *
 * The trees are built ONCE at boot (a couple of dozen merged meshes
 * worth of boxes is nothing) and live in the scene permanently — the
 * oasis country is where they stand, and streaming them per chunk would
 * buy nothing but crown-seam complexity at the chunk borders.
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OASIS, oasisBrimRing, oasisMudAt } from './oasisTerrain';
import { createCoconutTexture, createPalmBarkAtlas, createPalmLeafTexture } from './palmTextures';

/* ---------------- placement tuning (grid blocks) ---------------- */

/** Jitter lattice cell — one candidate per cell. Tightened 8 -> 7 so
 *  BOTH layers fill out (user: "increase the trees", round two). */
const PALM_CELL = 7;
/** Fraction of cells that actually grow a tree before spacing culls —
 *  0.85 -> 0.95: with the claim-based spacing the count rose 26 -> 35,
 *  exactly the "increase the trees" the user asked for. */
const PALM_DENSITY = 0.95;
/** Hard minimum trunk-to-trunk spacing — crowns (radius 4) just meet
 *  instead of meshing into one canopy slab. */
const PALM_MIN_DIST = 8;
/** TWO LAYERS (user: "add two layers of trees one is lightly more
 *  closer to the oasis"): the inner ring hugs the brim walkway (d
 *  34..40 stays clear — the flat spawn shore depends on it), the outer
 *  ring sits back across a deliberate ~3-block bare gap, so from
 *  anywhere the grove reads as two distinct bands instead of one blob.
 *  Both bands still demand real grass (palmCellValid — never mud,
 *  never bare sand) under every trunk. */
const PALM_INNER_RING = { min: 41.5, max: 47.5 };
const PALM_OUTER_RING = { min: 50.5, max: 57 };
/** Which layer a palm stands in — drives trunk height (the back layer
 *  grows a couple of logs taller so the layering reads from afar). */
type PalmBand = 'inner' | 'outer';
/** Keep-out circles (grid blocks) around the spawn anchor + jeep park
 *  so the home shore and its parking spot stay wide open (see page.tsx
 *  SPAWN_BRIM_EAST / SPAWN_JEEP_OFFSET — world 3800/3620 east, z 440
 *  south of the oasis centre -> these exact grid cells). */
const PALM_KEEP_OUT: Array<{ x: number; z: number; r: number }> = [
  { x: OASIS.cx + 38, z: OASIS.cz, r: 10 }, // spawn anchor
  { x: OASIS.cx + 36, z: OASIS.cz + 4, r: 10 }, // jeep park
];

/** Deterministic 0..1 lattice hash — fixed constants, never seeded. */
function palmHash(ix: number, iz: number, salt: number): number {
  const h = Math.sin(ix * 127.1 + iz * 311.7 + salt * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}

/** A cell's jittered candidate trunk position — pure function. */
function palmCandidate(icx: number, icz: number): { gx: number; gz: number } {
  return {
    gx: icx * PALM_CELL + 2 + Math.floor(palmHash(icx, icz, 1) * (PALM_CELL - 4)),
    gz: icz * PALM_CELL + 2 + Math.floor(palmHash(icx, icz, 2) * (PALM_CELL - 4)),
  };
}

/** Static validity of a trunk cell: inside one of the two palm layers,
 *  on grass (never mud), clear of the spawn/jeep keep-out circles.
 *  Spacing is checked separately (palmAt) so this stays recursion-free. */
function palmCellValid(gx: number, gz: number): boolean {
  const dx = gx - OASIS.cx;
  const dz = gz - OASIS.cz;
  const d = Math.sqrt(dx * dx + dz * dz);
  // two-layer band test — the gap between the rings stays bare grass
  const inInner = d >= PALM_INNER_RING.min && d <= PALM_INNER_RING.max;
  const inOuter = d >= PALM_OUTER_RING.min && d <= PALM_OUTER_RING.max;
  if (!inInner && !inOuter) return false;
  if (!oasisBrimRing(gx, gz) || oasisMudAt(gx, gz)) return false; // grass only
  for (const keep of PALM_KEEP_OUT) {
    const kx = gx - keep.x;
    const kz = gz - keep.z;
    if (kx * kx + kz * kz < keep.r * keep.r) return false;
  }
  return true;
}

/** A cell's candidate tree, if all static checks pass — null when bare.
 *  `h` is the cell's acceptance draw, reused as the spacing tie-break
 *  claim strength (lowest hash keeps the spot). */
function palmCellTree(
  icx: number,
  icz: number
): { gx: number; gz: number; h: number } | null {
  const h = palmHash(icx, icz, 3);
  if (h >= PALM_DENSITY) return null; // cell skipped
  const { gx, gz } = palmCandidate(icx, icz);
  return palmCellValid(gx, gz) ? { gx, gz, h } : null;
}

/** True when the grid column (gx, gz) carries a COCONUT PALM — the
 *  exact cell its trunk stands on. Deterministic pure math: the world
 *  meshes, the collision and the minimap all bake the identical grove. */
export function palmAt(gx: number, gz: number): boolean {
  const icx = Math.floor(gx / PALM_CELL);
  const icz = Math.floor(gz / PALM_CELL);
  const mine = palmCellTree(icx, icz);
  if (!mine || mine.gx !== gx || mine.gz !== gz) return false;
  // Hard spacing with a deterministic CLAIM: a conflicting neighbour
  // (closer than PALM_MIN_DIST) only rejects me when its own draw is
  // LOWER than mine — so of any close pair exactly the strongest
  // candidate survives instead of BOTH dying in a mutual cull (the
  // old symmetric check stranded whole arcs of the ring empty).
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      if (ox === 0 && oz === 0) continue;
      const other = palmCellTree(icx + ox, icz + oz);
      if (!other) continue;
      const ddx = other.gx - gx;
      const ddz = other.gz - gz;
      if (ddx * ddx + ddz * ddz >= PALM_MIN_DIST * PALM_MIN_DIST) continue;
      if (other.h < mine.h) return false; // stronger neighbour claims it
      // exact draw tie (virtually impossible with float hashes, but
      // kept fully deterministic anyway): lower cell index wins
      if (
        other.h === mine.h &&
        (icx + ox) * 31 + (icz + oz) * 17 < icx * 31 + icz * 17
      ) {
        return false;
      }
    }
  }
  return true;
}

/** Every palm on the collar, scanned once with its layer — used by the
 *  mesh builder (the layer drives the trunk height). */
function allPalms(): Array<{ gx: number; gz: number; band: PalmBand }> {
  const outer = PALM_OUTER_RING.max;
  const span = Math.ceil(outer / PALM_CELL) + 1;
  const cx0 = Math.floor((OASIS.cx - outer) / PALM_CELL);
  const cz0 = Math.floor((OASIS.cz - outer) / PALM_CELL);
  const trees: Array<{ gx: number; gz: number; band: PalmBand }> = [];
  for (let icz = cz0; icz <= cz0 + span * 2; icz++) {
    for (let icx = cx0; icx <= cx0 + span * 2; icx++) {
      const tree = palmCellTree(icx, icz);
      if (!tree || !palmAt(tree.gx, tree.gz)) continue;
      const d = Math.hypot(tree.gx - OASIS.cx, tree.gz - OASIS.cz);
      trees.push({
        gx: tree.gx,
        gz: tree.gz,
        band: d <= PALM_INNER_RING.max ? 'inner' : 'outer',
      });
    }
  }
  return trees;
}

/** Per-tree trunk height in logs, by layer — the inner ring runs 8-9
 *  logs, the outer ring 9-11, so the back layer towers a little over
 *  the front one and the two-layer read survives from the spawn shore.
 *  Hashed from the INTEGER grid coords + a fixed per-layer salt ONLY
 *  (never the terrain height float — that must stay bit-identical
 *  across page loads so every session grows the exact same grove). */
function palmTrunkH(gx: number, gz: number, band: PalmBand): number {
  const r = palmHash(gx * 3 + 7, gz * 3 - 11, band === 'inner' ? 91 : 137);
  return band === 'inner' ? 8 + Math.floor(r * 2) : 9 + Math.floor(r * 3);
}

/** COCONUTS per tree — 2 to 4, the user's "random 2 to 4 coconut on
 *  each tree": hashed from the INTEGER grid coords + a fixed salt
 *  (never floats) so every boot hangs the exact same nuts on the exact
 *  same trees. Exported pure so probes can verify the spread without
 *  booting the renderer. */
export function palmNutCount(gx: number, gz: number): number {
  return 2 + Math.floor(palmHash(gx * 5 + 3, gz * 5 - 7, 211) * 3);
}

/** Candidate hang spots on the TOP WOOD BLOCK's side faces — tree-local
 *  offsets [ox, oy, oz, size] in blocks from the trunk axis, where oy
 *  runs from the crown cell centre (the top log's top face sits at oy
 *  -0.5, its side faces at |x| or |z| 0.5). Per the user's "place the
 *  coconuts in the top centre of each side and the coconuts one side
 *  is only touch to the tree top wood block": FOUR spots, one centred
 *  on each cardinal side face (never the corners), each pressed flush
 *  to that single face with a 0.015-block hairline gap (reads as
 *  touching, dodges coplanar z-fighting), top edge 0.04 blocks below
 *  the crown slab so the nut touches ONLY its one side — nothing
 *  above, nothing beside. Exported so the math probe can verify the
 *  face-centred contact on the REAL constants. The per-tree shuffle
 *  picks which sides carry nuts (2-4 of the four). */
export const NUT_SPOTS: Array<[number, number, number, number]> = [
  [0.715, -0.74, 0, 0.4], // +x face centre
  [-0.695, -0.72, 0, 0.36], // -x face centre
  [0, -0.73, 0.705, 0.38], // +z face centre
  [0, -0.71, -0.685, 0.34], // -z face centre
];

/* ---------------- geometry ---------------- */

/** Re-maps a BoxGeometry's UVs onto the 16x32 bark atlas: side faces
 *  (+x,-x,-y,+z,-z) sample the BOTTOM half (banded bark) between vLo
 *  and vHi (default the whole strip — stair slabs/treads slice it into
 *  quarters so the banding flows continuously up the step), the +y top
 *  face samples the TOP half (log-cut rings, V 0.5..1). */
function atlasBoxUVs(geo: THREE.BoxGeometry, vLo = 0, vHi = 0.5): void {
  const uv = geo.attributes.uv;
  for (let face = 0; face < 6; face++) {
    const top = face === 2; // +y
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      const v = uv.getY(idx);
      uv.setY(idx, top ? 0.5 + v * 0.5 : vLo + v * (vHi - vLo));
    }
  }
  uv.needsUpdate = true;
}

/** Re-maps a nut box's UVs onto the 16x32 coconut atlas: BOTH pole
 *  faces (+y up, -y down) sample the TOP half (three-pore tile), the
 *  four side faces sample the BOTTOM half (husk mosaic) — so the
 *  coconut "eyes" read from above the crown AND from the ground
 *  looking up at the hanging nuts. Exported — the falling-coconut
 *  system's pooled nut cubes wear the same atlas (palmCoconuts.ts). */
export function nutBoxUVs(geo: THREE.BoxGeometry): void {
  const uv = geo.attributes.uv;
  for (let face = 0; face < 6; face++) {
    const pole = face === 2 || face === 3; // +y / -y
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      const v = uv.getY(idx);
      uv.setY(idx, pole ? 0.5 + v * 0.5 : v * 0.5);
    }
  }
  uv.needsUpdate = true;
}

/** One square solid box, tree-local: XZ offset from the trunk, half
 *  extent, and the WORLD Y of the block's top face (the collider stops
 *  pushing once the caller's feet rise above it). */
interface PalmSolid {
  lx: number;
  lz: number;
  half: number;
  top: number;
}

/** Module-level id counter for hanging-coconut instances — lives here
 *  (not inside createPalmTrees) because buildPalmBoxes assigns the ids
 *  while it builds. Deterministic: ids follow tree order, 0 upward. */
let nutInstanceId = 0;

/** One hanging coconut, tracked individually: world centre + half-size
 *  + its own geometry (so the merged hanging mesh can be rebuilt minus
 *  any nut that detached and fell). `tx`/`tz` = the tree's trunk centre
 *  (the outward knock direction when the nut is struck). */
export interface PalmNutInstance {
  id: number;
  treeIndex: number;
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  size: number;
  geo: THREE.BufferGeometry;
  alive: boolean;
}

/** One straight trunk + stair ring crown, expressed as bark / leaf /
 *  nut box lists in WORLD coordinates. Trunk: 1x1 vertical column —
 *  perfectly plumb (`trunkH` logs tall, drawn per tree + layer by
 *  palmTrunkH). BASE: a ring of 8 two-box wood STAIRS around the
 *  trunk's foot (the 3x3 neighbourhood minus the centre; tall back
 *  half toward the trunk), each sitting ON its own column's ground so
 *  the ring steps with the meadow. Crown: cardinal fronds 3 out +
 *  drooped 4th tip, diagonal fronds 2 out + drooped 3rd tip, centre
 *  block, then 2-4 coconut mini-cubes (palmNutCount) hung on a hashed
 *  subset of NUT_SPOTS on the top block's side faces. Every stair
 *  (slab + tread quarters) + the trunk column also emit square entries
 *  into `solids` for collision. */
function buildPalmBoxes(
  gx: number,
  gz: number,
  h: number,
  block: number,
  gridOffset: number,
  trunkH: number,
  treeIndex: number,
  heightAt: (gx: number, gz: number) => number,
  bark: THREE.BufferGeometry[],
  leaf: THREE.BufferGeometry[],
  nutInstances: PalmNutInstance[],
  solids: PalmSolid[]
): void {
  const wx = (gx - gridOffset) * block;
  const wz = (gz - gridOffset) * block;
  const topY = h * block + block / 2; // grass top face

  // BASE RING — eight WOOD STAIRS around the bottom of the trunk (the
  // 3x3 neighbourhood minus the centre), per the user's "make the base
  // block like the stairs and add them in the base of trees ... like
  // this but in same texture" + the oak-stairs reference: each stair is
  // the classic two-box step — a full 1x1 bottom slab (half height)
  // with the tall back half on the side TOWARD the trunk, so the ring
  // reads as eight steps climbing to the tree. Each stair sits on ITS
  // OWN column's ground so the ring steps with the meadow drift; the
  // bark banding flows continuously up the step (the slab samples the
  // lower bark quarter, the tread the next quarter) and every top face
  // keeps the pale log-cut tile. Colliders match the visible step:
  // the slab is a full-footprint platform at mid height, the tread is
  // two quarter squares at full height — jump on, stand, step down.
  for (const [ox, oz] of [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ]) {
    const nh = heightAt(gx + ox, gz + oz);
    const ground = nh * block; // this column's grass cell centre
    // orientation: the tall back half faces the trunk — cardinals step
    // out along their own axis, the diagonals step out along x
    const alongX = ox !== 0;
    // BOTTOM SLAB — full 1x1 footprint, half height, on the grass
    const slab = new THREE.BoxGeometry(block, block * 0.5, block);
    atlasBoxUVs(slab, 0, 0.25);
    slab.translate(
      wx + ox * block,
      ground + block * 0.75,
      wz + oz * block
    );
    bark.push(slab);
    // TREAD — the tall back half: half depth (radial), full width
    const tread = alongX
      ? new THREE.BoxGeometry(block * 0.5, block * 0.5, block)
      : new THREE.BoxGeometry(block, block * 0.5, block * 0.5);
    atlasBoxUVs(tread, 0.25, 0.5);
    tread.translate(
      alongX ? wx + ox * block * 0.75 : wx + ox * block,
      ground + block * 1.25,
      alongX ? wz + oz * block : wz + oz * block * 0.75
    );
    bark.push(tread);
    // square colliders — slab platform at mid height + the tread as
    // two quarter squares at full height (the old block-top height,
    // so jumps onto the stair reach exactly the same place)
    solids.push({
      lx: ox * block,
      lz: oz * block,
      half: block * 0.5,
      top: ground + block,
    });
    for (const t of [-0.25, 0.25]) {
      solids.push({
        lx: alongX ? ox * block * 0.75 : ox * block + t * block,
        lz: alongX ? oz * block + t * block : oz * block * 0.75,
        half: block * 0.25,
        top: ground + block * 1.5,
      });
    }
  }

  // TRUNK — one shared box per log, straight up: cell k centre sits at
  // topY + block/2 + k*block, XZ locked to the column
  for (let k = 0; k < trunkH; k++) {
    const log = new THREE.BoxGeometry(block, block, block);
    atlasBoxUVs(log);
    log.translate(wx, topY + block / 2 + k * block, wz);
    bark.push(log);
  }
  // square collider — the whole 1x1 column as one box, grass top face
  // up to the crown base
  solids.push({ lx: 0, lz: 0, half: block * 0.5, top: topY + trunkH * block });

  // CROWN centre cell (level L) — directly on top of the top log
  const crownY = topY + block / 2 + trunkH * block;
  const leafAt = (ox: number, oz: number, oyBlocks: number): void => {
    const l = new THREE.BoxGeometry(block, block, block);
    l.translate(
      wx + ox * block,
      crownY + oyBlocks * block,
      wz + oz * block
    );
    leaf.push(l);
  };
  leafAt(0, 0, 0);
  // cardinal fronds: 3 out level, 4th tip drooped one block
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    leafAt(dx, dz, 0);
    leafAt(dx * 2, dz * 2, 0);
    leafAt(dx * 3, dz * 3, 0);
    leafAt(dx * 4, dz * 4, -1);
  }
  // diagonal fronds: 2 out level, 3rd tip drooped one block
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    leafAt(dx, dz, 0);
    leafAt(dx * 2, dz * 2, 0);
    leafAt(dx * 3, dz * 3, -1);
  }

  // COCONUTS — 2-4 voxel mini-cubes (palmNutCount) hung on the TOP
  // WOOD BLOCK's side faces: the four NUT_SPOTS are shuffled per tree
  // by a fixed-salt hash and the first `count` light up, so every tree
  // wears its own deterministic nut necklace. Each nut sits centred on
  // ONE cardinal side face of the top log (never a corner), flush to
  // that single face (hairline gap, no z-fighting) with its top edge
  // just under the crown slab — touching exactly one side, per the
  // user's follow-up. Poles carry the three-pore tile (nutBoxUVs),
  // sides the husk mosaic. Every nut is registered as a PALM NUT
  // INSTANCE (id + world pos + size + its tree's trunk position) so
  // the falling-coconut system can hit-test, detach and regrow them —
  // each instance keeps its OWN BoxGeometry so the merged hanging mesh
  // can be rebuilt without the dropped ones.
  const nutCount = palmNutCount(gx, gz);
  const spots = NUT_SPOTS.map((spot, i) => ({
    spot,
    r: palmHash(gx * 7 + i * 13, gz * 7 - i * 29, 307),
  })).sort((a, b) => a.r - b.r);
  for (let i = 0; i < nutCount; i++) {
    const [ox, oy, oz, s] = spots[i].spot;
    const cubed = new THREE.BoxGeometry(block * s, block * s, block * s);
    nutBoxUVs(cubed);
    cubed.translate(wx + ox * block, crownY + oy * block, wz + oz * block);
    nutInstances.push({
      id: nutInstanceId++,
      treeIndex,
      x: wx + ox * block,
      y: crownY + oy * block,
      z: wz + oz * block,
      tx: wx,
      tz: wz,
      size: s,
      geo: cubed,
      alive: true,
    });
  }
}

/* ---------------- system ---------------- */

/** How far past a solid block's edge the player may still count its top
 *  as floor — a small capsule-overhang so standing on the very edge of
 *  a base block feels like standing on any other block. */
const PALM_STAND_MARGIN = 10;

export interface PalmTreesHandle {
  /** Capsule push-out against every solid palm block — one SQUARE box
   *  per base block + the trunk column (like jeep/chest collide).
   *  `y` optional — a box ghosts once the caller's feet rise above its
   *  top face, and whole trees ghost above the crown. */
  collide(
    x: number,
    z: number,
    radius: number,
    y?: number
  ): { x: number; z: number } | null;
  /** Highest solid palm block top that acts as FLOOR under (x, z):
   *  among the boxes whose footprint covers the point (plus a small
   *  stand margin), the tallest top no higher than `maxY` — null over
   *  bare ground. The page max()es this with the terrain height so the
   *  player can jump onto and STAND on the base blocks like any other
   *  block. */
  supportAt(x: number, z: number, maxY: number): number | null;
  /** All hanging coconuts as individually tracked instances (read-only
   *  view — the falling-coconut system hit-tests and detaches these). */
  nuts(): readonly PalmNutInstance[];
  /** Detach (alive=false) or regrow (true) a hanging nut by id —
   *  rebuilds the merged hanging mesh without it. False for unknown
   *  ids / no state change. */
  setNutAlive(id: number, alive: boolean): boolean;
  /** Debug: palm count + trunk/canopy box + solid-collider + HANGING
   *  coconut counts (dropped nuts stop counting until they regrow). */
  stats(): {
    trees: number;
    trunks: number;
    leaves: number;
    solids: number;
    coconuts: number;
  };
}

export function createPalmTrees(
  scene: THREE.Scene,
  terrain: { blockHeight(gx: number, gz: number): number },
  opts: { block: number; gridOffset: number; lowSpec?: boolean }
): PalmTreesHandle {
  const { block, gridOffset } = opts;

  // materials — bark atlas (opaque) + cutout canopy (alpha-tested,
  // double-sided so the back faces show through the punched holes)
  const leafTexture = createPalmLeafTexture();
  const barkMaterial = new THREE.MeshLambertMaterial({
    map: createPalmBarkAtlas(),
    side: THREE.DoubleSide,
  });
  const leafMaterial = new THREE.MeshLambertMaterial({
    map: leafTexture,
    side: THREE.DoubleSide,
    alphaTest: 0.5, // cutout: punched pixels are fully open
  });
  const nutMaterial = new THREE.MeshLambertMaterial({
    map: createCoconutTexture(),
  });

  const barkParts: THREE.BufferGeometry[] = [];
  const leafParts: THREE.BufferGeometry[] = [];
  const nutInstances: PalmNutInstance[] = [];
  let aliveNuts = 0;
  const trees: Array<{
    x: number;
    z: number;
    topY: number;
    boxes: PalmSolid[];
  }> = [];

  let treeIndex = 0;
  for (const { gx, gz, band } of allPalms()) {
    const h = terrain.blockHeight(gx, gz);
    const trunkH = palmTrunkH(gx, gz, band);
    const boxes: PalmSolid[] = [];
    buildPalmBoxes(
      gx,
      gz,
      h,
      block,
      gridOffset,
      trunkH,
      treeIndex++,
      (bx, bz) => terrain.blockHeight(bx, bz),
      barkParts,
      leafParts,
      nutInstances,
      boxes
    );
    const topY = h * block + block / 2;
    // per-tree ghost top: grass face + trunk logs + crown cell (+ a
    // margin) — taller outer-layer trees ghost proportionally higher
    trees.push({
      x: (gx - gridOffset) * block,
      z: (gz - gridOffset) * block,
      topY: topY + (trunkH + 2) * block,
      boxes,
    });
  }

  const group = new THREE.Group();
  group.name = 'oasis-palms';
  const trunkMesh = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(barkParts),
    barkMaterial
  );
  for (const part of barkParts) part.dispose();
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  trunkMesh.matrixAutoUpdate = false;
  group.add(trunkMesh);

  const canopyMesh = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(leafParts),
    leafMaterial
  );
  for (const part of leafParts) part.dispose();
  canopyMesh.castShadow = true;
  // shadow map must respect the punched holes too, or canopies shadow
  // as solid slabs — same alpha-test cutout on the depth material
  canopyMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: leafTexture,
    alphaTest: 0.5,
  });
  canopyMesh.receiveShadow = true;
  canopyMesh.matrixAutoUpdate = false;
  group.add(canopyMesh);

  // HANGING COCONUTS — one merged mesh built from the ALIVE nut
  // instances, rebuilt whenever a nut detaches (falls) or regrows:
  // ~100 small boxes so a rebuild (one per drop/regrow, seconds apart)
  // costs a whisker. The instance geometries stay alive — they ARE the
  // rebuild source (never disposed while the system exists).
  aliveNuts = nutInstances.length;
  const coconutMesh = new THREE.Mesh(
    BufferGeometryUtils.mergeGeometries(nutInstances.map((n) => n.geo)),
    nutMaterial
  );
  coconutMesh.castShadow = true;
  coconutMesh.receiveShadow = true;
  coconutMesh.matrixAutoUpdate = false;
  group.add(coconutMesh);

  function rebuildNutMesh(): void {
    const alive = nutInstances.filter((n) => n.alive).map((n) => n.geo);
    const old = coconutMesh.geometry;
    coconutMesh.geometry = alive.length
      ? BufferGeometryUtils.mergeGeometries(alive)
      : new THREE.BufferGeometry();
    old.dispose();
    coconutMesh.visible = alive.length > 0;
  }

  scene.add(group);

  /** Square block-vs-capsule push-out in XZ — null when clear. Each
   *  palm block gets its own axis-aligned square (half = block/2), so
   *  the collision matches the visible blocks exactly. */
  function pushBox(
    px: number,
    pz: number,
    radius: number,
    cx: number,
    cz: number,
    half: number
  ): { x: number; z: number } | null {
    const nx = Math.max(cx - half, Math.min(px, cx + half));
    const nz = Math.max(cz - half, Math.min(pz, cz + half));
    const dx = px - nx;
    const dz = pz - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) return null;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      return { x: nx + (dx / d) * radius, z: nz + (dz / d) * radius };
    }
    // centre inside the box — exit along the shallowest face
    const exits = [
      { d: px - (cx - half) + radius, x: cx - half - radius, z: pz },
      { d: cx + half - px + radius, x: cx + half + radius, z: pz },
      { d: pz - (cz - half) + radius, x: px, z: cz - half - radius },
      { d: cz + half - pz + radius, x: px, z: cz + half + radius },
    ];
    exits.sort((a, b) => a.d - b.d);
    return { x: exits[0].x, z: exits[0].z };
  }

  function collide(
    x: number,
    z: number,
    radius: number,
    y?: number
  ): { x: number; z: number } | null {
    let px = x;
    let pz = z;
    let hit = false;
    for (const tree of trees) {
      // broad phase — the 3x3 base footprint reaches ~1.5 blocks out
      const bx = px - tree.x;
      const bz = pz - tree.z;
      const broad = block * 2.5 + radius;
      if (bx * bx + bz * bz > broad * broad) continue;
      if (y !== undefined && y > tree.topY) continue; // flying over it
      // one square push-out per solid block — the base blocks each sit
      // at their own column's ground, so a box only blocks while the
      // caller's feet are below its top face (step-over feel on the
      // drifted meadow); the trunk box covers the full column
      for (const box of tree.boxes) {
        if (y !== undefined && y >= box.top) continue; // feet above it
        const pushed = pushBox(
          px,
          pz,
          radius,
          tree.x + box.lx,
          tree.z + box.lz,
          box.half
        );
        if (pushed) {
          px = pushed.x;
          pz = pushed.z;
          hit = true;
        }
      }
    }
    return hit ? { x: px, z: pz } : null;
  }

  /** Highest solid palm top at/below `maxY` covering (x, z) — the floor
   *  the player stands on. Only boxes whose square footprint (padded by
   *  PALM_STAND_MARGIN) contains the point count, so the support matches
   *  the visible blocks exactly and ends at the block edge. */
  function supportAt(x: number, z: number, maxY: number): number | null {
    let best: number | null = null;
    for (const tree of trees) {
      const bx = x - tree.x;
      const bz = z - tree.z;
      // broad phase — the 3x3 base footprint reaches ~1.5 blocks out
      const broad = block * 2.5 + PALM_STAND_MARGIN;
      if (bx * bx + bz * bz > broad * broad) continue;
      for (const box of tree.boxes) {
        if (box.top > maxY) continue; // above the ceiling — not floor yet
        const dx = Math.abs(x - (tree.x + box.lx));
        const dz = Math.abs(z - (tree.z + box.lz));
        if (
          dx <= box.half + PALM_STAND_MARGIN &&
          dz <= box.half + PALM_STAND_MARGIN &&
          (best === null || box.top > best)
        ) {
          best = box.top;
        }
      }
    }
    return best;
  }

  /** Snapshot of every tracked coconut (hanging AND detached — check
   *  `.alive` for hanging). */
  function nuts(): readonly PalmNutInstance[] {
    return nutInstances;
  }

  function setNutAlive(id: number, alive: boolean): boolean {
    const nut = nutInstances.find((n) => n.id === id);
    if (!nut || nut.alive === alive) return false;
    nut.alive = alive;
    aliveNuts += alive ? 1 : -1;
    rebuildNutMesh();
    return true;
  }

  function stats(): {
    trees: number;
    trunks: number;
    leaves: number;
    solids: number;
    coconuts: number;
  } {
    return {
      trees: trees.length,
      trunks: barkParts.length,
      leaves: leafParts.length,
      solids: trees.reduce((n, t) => n + t.boxes.length, 0),
      coconuts: aliveNuts,
    };
  }

  return { collide, supportAt, nuts, setNutAlive, stats };
}
