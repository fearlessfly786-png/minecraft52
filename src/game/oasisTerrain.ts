/**
 * OASIS for RATFIRE — one smooth circular TERRACED BOWL sunk into the
 * golden dune sea, FILLED TO THE BRIM with turquoise water (see
 * src/game/oasisWater.ts). The user asked for "an oasis in the desert
 * biome, smooth circular" as a bare base first — a wide cone stepping
 * down 4-5 terraced layers to a small round floor — and then asked to
 * "fill water in the oasis from bottom to top surface" of the dug
 * area: a crystal-clear tropical pool, pale luminous aqua at the
 * shallow shore rings deepening to rich turquoise over the pan, with
 * animated white caustic light nets rippling over the sand. The whole
 * bowl below the brim is submerged; every water visual lives in
 * oasisWater.ts.
 *
 * Everything here is PURE MATH and 100% DETERMINISTIC — no THREE, no
 * perlin, no per-session state — so terrain meshes, collision, the
 * after-rain puddle scanner, the pool body and the minimap all agree
 * on where the pit, the terraces and the waterline begin and end:
 *
 *  - The oasis is HAND-PLACED at the exact centre of the due-north
 *    showcase dune country (DESERT_ZONES[0], grid 64/436), the same
 *    "first far-discovery desert" the desert generator anchors north
 *    of spawn (the biome was DOUBLED in size and the oasis moved with
 *    its centre, so it sits MID-DESERT — ~188 blocks of dune sea from
 *    the zone edge in every direction). The whole circle (top radius
 *    40) sits deep inside that zone's dune core (radius 188), so every
 *    rim block is sand — the cone never crosses into grass.
 *  - BOWL PROFILE: oasisConeFrac(gx, gz) -> 0..1 is the descended
 *    fraction of the pit's depth at that column. It is a PLAIN RADIAL
 *    measure — no noise wobble, the user asked for a smooth circle —
 *    quantised into OASIS.layers terraces: each terrace is an annulus
 *    (outerR-bottomR)/layers = 6 blocks wide whose floor sits one
 *    depth/layers = 3-block step below the ring outside it. Top rim
 *    is the widest circle, every layer inward is smaller and lower,
 *    and the small bottom pan (bottomR) is the deepest floor — the
 *    classic stepped-cone cross-section. The blocky heightfield turns
 *    the ring boundaries into clean 3-block cliffs (sealed by the
 *    chunk builder's wall-fill, mesa-terrace style) while every shelf
 *    stays perfectly level and circular in plan view.
 *  - WATER: the pool fills the WHOLE dug pit — "from bottom to top
 *    surface" as requested. The waterline rides OASIS.waterLevel
 *    (= depth − 0.5) blocks above the pan floor, half a block below
 *    the brim ring's top face, so every terrace is submerged (2.5
 *    blocks of water over the first ring, the full 14.5 over the pan)
 *    and only the flat brim ring stays dry as a circular shore
 *    walkway. The disc's edge meets the brim ring's inner wall in a
 *    perfect circle of radius OASIS.waterR (tucked half a block into
 *    that wall so no seam ever shows). oasisWaterCover(gx, gz) marks
 *    the pool's map footprint for the minimap; the pool's shader
 *    lives in oasisWater.ts.
 *  - The carve itself lives in terrainChunks.ts: every column inside
 *    the mouth takes its ring's SHARED CONSTANT level (see
 *    oasisRingOffset below) — crests are cut, interior dune troughs
 *    are filled — so each terrace is perfectly flat and exactly
 *    circular. That is what lets the filled pool meet every terrace
 *    wall in an exact-circle waterline with zero leaks: nothing under
 *    the water disc can poke above the surface, and the bowl can
 *    never spill (all levels sit at or below the brim).
 *  - The terraces stay in the DESERT bucket (sand material) — the
 *    factor never touches the biome fields, only the height, so sand,
 *    footprints, dry-desert weather and the map all treat the cone as
 *    ordinary dune ground: a bare stepped basin with one round pool
 *    of turquoise water at its heart. ONE EXCEPTION, per later
 *    requests: the GRASS COLLAR — the dry brim walkway PLUS a wide
 *    meadow band reaching ~19 blocks out around the pool (see
 *    oasisBrimRing below) — carries the grass block textures (green
 *    top + grass sides), while everything INSIDE the bowl (every
 *    submerged terrace + the pan) stays sand. Per the latest request
 *    the collar is ROUGH: its outer edge wobbles with the compass
 *    angle (never the same width from each side) and then dissolves
 *    into scattered patches that merge into the desert sand texture
 *    with distance instead of stopping at a hard circular cutoff.
 *  - MOUNTAIN RISER (per later request): the raw dune field around
 *    the mouth used to stand at whatever height the perlin gave it,
 *    so tall dunes slammed straight against the grass ring reading as
 *    one wall from the oasis side. oasisRiserFactor below re-anchors
 *    the profile — every ring-side column blends from the brim's
 *    exact level at the rim up to its full natural height across
 *    OASIS.riserR blocks, so the mountains START at the oasis and
 *    climb smoothly to full dune height farther out (applied at the
 *    end of terrainChunks.naturalHeight).
 */

/** The oasis build plan — circle in grid-block space (the same gx/gz
 *  space the height field uses: world x = (gx - gridOffset) * block).
 *  Centred on the due-north desert showcase zone. */
export const OASIS = {
  /** Grid-block centre (= DESERT_ZONES[0] centre, moved with the
   *  biome-doubling so the oasis stays mid-desert). */
  cx: 64,
  cz: 436,
  /** Top rim radius, blocks — the cone mouth, its widest circle. */
  outerR: 40,
  /** Bottom pan radius, blocks — the deepest, smallest circle. */
  bottomR: 10,
  /** Full pit depth below the pre-oasis dune datum, blocks — with 5
   *  layers that is a clean 3-block step per terrace. */
  depth: 15,
  /** Terraced layers between the rim and the bottom pan (4-5 per the
   *  request; 5 gives 5 distinct ring shelves + the round floor). */
  layers: 5,
  /** Waterline height above the pan floor's top face, blocks — the
   *  pool fills the WHOLE dug pit ("from bottom to top surface"):
   *  depth (15) minus a half-block lip below the brim ring's top
   *  face, so every terrace is submerged (2.5 blocks of water over
   *  the first ring, the full 14.5 over the pan) and only the flat
   *  brim ring stays dry as a circular shore walkway. */
  waterLevel: 14.5,
  /** Pool disc radius, blocks — reaches half a block PAST the brim
   *  ring's inner wall (d = outerR - (outerR-bottomR)/layers = 34) so
   *  the shoreline tucks into that wall and reads as one seamless
   *  perfect circle. */
  waterR: 34.5,
  /** Mean grass-collar radius, blocks from the centre — the grass
   *  collar around the pool is anchored here: the dry brim walkway
   *  (d 34..40) PLUS a wide meadow band draped over the natural desert
   *  out to ~19 blocks around the water (34.5 + 19 = 53.5), per the
   *  user's "increase the grass range to 7-19 blocks around the
   *  oasis". The collar's outer edge is no longer this exact circle —
   *  it wobbles ~±8 blocks with the angle and then dissolves into
   *  scattered patches across a further ~14-block merge band (see
   *  oasisBrimRing) — but this stays the collar's mean radius. */
  grassR: 53.5,
  /** MOUNTAIN RISER width, blocks — outside the mouth the surrounding
   *  terrain blends from the brim's EXACT level (flush joint, zero
   *  step) up to its full natural height across this band, so the
   *  mountains START at the oasis rim and climb smoothly outward
   *  instead of slamming into the grass ring like a straight wall
   *  (per the user's "mountains start from the oasis side and rise to
   *  the other side"). Full natural dune country resumes at
   *  outerR + riserR = 100 blocks from the centre. */
  riserR: 60,
} as const;

/** Clamped 0..1 smoothstep (same shape as every biome module). */
function smoothstep01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** 0 outside the cone mouth .. 1 across its whole footprint. A plain
 *  radial smoothstep between the bottom pan and the top rim —
 *  deliberately NO noise jitter, the outline stays a perfectly smooth
 *  circle as requested. Used by the minimap to tint the pit's
 *  footprint; the terrain carve quantises further into terraces. */
export function oasisFactor(gx: number, gz: number): number {
  const dx = gx - OASIS.cx;
  const dz = gz - OASIS.cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= OASIS.outerR * OASIS.outerR) return 0; // fast reject
  const d = Math.sqrt(d2);
  return (
    1 - smoothstep01((d - OASIS.bottomR) / (OASIS.outerR - OASIS.bottomR))
  );
}

/** Terraced cone profile: 0 outside the mouth .. 1 on the bottom pan,
 *  quantised so each layer is one level shelf 3 blocks below the ring
 *  before it (depth/layers). Radial distance only — every terrace is
 *  a clean concentric circle, wide at the top, smallest at the bottom. */
export function oasisConeFrac(gx: number, gz: number): number {
  const dx = gx - OASIS.cx;
  const dz = gz - OASIS.cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= OASIS.outerR * OASIS.outerR) return 0; // fast reject
  const d = Math.sqrt(d2);
  if (d <= OASIS.bottomR) return 1; // the bottom pan — deepest floor
  // 0 at the mouth .. 1 at the pan edge, cut into `layers` rings
  const t = (OASIS.outerR - d) / (OASIS.outerR - OASIS.bottomR);
  const k = Math.floor(t * OASIS.layers); // ring index 0..layers-1
  return k / OASIS.layers; // ring 0 rides at rim level (see terrainChunks)
}

/** Absolute terrace level of any column inside the oasis mouth, in
 *  blocks above the shared pan datum (terrainChunks' oasisFloorDatum):
 *  the bottom pan sits at 0, each terrace ring one depth/layers =
 *  3-block step higher, and the outermost brim ring rides at the full
 *  depth — a flat dry walkway ringing the pool at the pre-oasis dune
 *  datum. Returns null outside the mouth (d > outerR) so the height
 *  field can skip the oasis entirely there.
 *
 *  Every level is a SHARED CONSTANT per ring — no noise, no per-column
 *  min-guard. Interior dune troughs are filled and crests cut, which
 *  is exactly what a water-filled bowl needs: the surface disc meets
 *  every terrace wall in an exact circle and nothing under it can
 *  poke through to leak the pool. */
export function oasisRingOffset(gx: number, gz: number): number | null {
  const dx = gx - OASIS.cx;
  const dz = gz - OASIS.cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > OASIS.outerR * OASIS.outerR) return null; // outside the mouth
  const frac = oasisConeFrac(gx, gz); // 0 on the brim ring .. 1 on the pan
  return OASIS.depth * (1 - frac);
}

/* ------------------------------------------------------------------ *
 * ROUGH MEADOW EDGE + DESERT MERGE — per the user's "make it rough,
 * like it does not [look the same] from each side, and it merges into
 * the desert biome's texture when it goes away from the oasis".
 *
 * The old meadow ended in one hard perfect circle at grassR — a
 * laser-cut collar that read as stamped onto the dunes. The grass
 * collar is now built in three radial bands:
 *
 *   d 34..40            the engineered brim walkway — STILL a perfect
 *                       circle (the flat spawn shore ring depends on
 *                       it, see page.tsx SPAWN_BRIM_EAST)
 *   d 40..rough edge    the solid meadow core draped over the natural
 *                       dunes, but its outer edge now WOBBLES with the
 *                       compass angle (integer sine harmonics),
 *                       swinging ~±8 blocks — wide green lobes on some
 *                       sides, narrow bights on others, never the same
 *                       width from each side
 *   rough edge ..+14    the merge band — the grass breaks into
 *                       organic two-octave noise patches that thin
 *                       from ~85% cover against the meadow to nothing
 *                       in pure sand, so the collar DISSOLVES into the
 *                       desert texture with distance instead of
 *                       stopping dead at a circular cutoff
 *
 * All of it is fixed-constant deterministic math (NO per-session
 * seed) so the chunk builder, the collision field and the minimap
 * always bake the exact same rough collar, session after session.
 * ------------------------------------------------------------------ */

/** Peak swing of the meadow's rough edge, blocks either side of
 *  grassR — the solid grass reaches ~61 blocks out on the lobed sides
 *  and pulls in to ~45 on the tight ones (never uniform). */
const MEADOW_WOBBLE = 8;
/** Width of the scattered-patch merge band beyond the rough edge,
 *  blocks — where the grass dissolves into the desert texture. */
const MEADOW_FADE = 14;
/** Absolute outer limit of the whole grass collar (fast reject). */
const MEADOW_MAX_R = OASIS.grassR + MEADOW_WOBBLE + MEADOW_FADE;

/** Smooth angular wobble of the meadow edge, ~-1..1. INTEGER harmonics
 *  only (3/7/13 waves around the circle), so the value joins
 *  seamlessly across the ±π wrap of atan2 — no seam anywhere. */
function meadowWobble(angle: number): number {
  return (
    Math.sin(angle * 3 + 1.3) * 0.45 +
    Math.sin(angle * 7 - 2.1) * 0.32 +
    Math.sin(angle * 13 + 4.7) * 0.23
  );
}

/** Deterministic 0..1 lattice hash — fixed constants, never seeded. */
function meadowHash(ix: number, iz: number): number {
  const h = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

/** Smooth value noise over that hash — bilinear between lattice
 *  corners with the usual smoothstep fade, 0..1, ~0.5 mean. */
function meadowVnoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const xf = x - ix;
  const zf = z - iz;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = meadowHash(ix, iz);
  const b = meadowHash(ix + 1, iz);
  const c = meadowHash(ix, iz + 1);
  const d = meadowHash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Organic patch field for the merge band, 0..1 — two octaves so the
 *  grass breaks into blobby clumps (~5-block bodies carrying ~2-block
 *  edge detail), not per-block static. */
function meadowPatchNoise(gx: number, gz: number): number {
  return (
    meadowVnoise(gx * 0.19, gz * 0.19) * 0.72 +
    meadowVnoise(gx * 0.47 + 7.3, gz * 0.47 - 4.1) * 0.28
  );
}

/** True on the ROUGH GRASS COLLAR encircling the oasis — the dry brim
 *  walkway (ring index 0, d 34..40, six blocks wide, still a perfect
 *  circle) PLUS the rough meadow: a solid core whose outer edge
 *  wobbles with the compass angle, then a ~14-block merge band of
 *  scattered patches that thin out until pure desert takes over (see
 *  the band diagram above). All of it carries BOTH grass textures —
 *  the green grass top and the grass side texture on every exposed
 *  wall — while the bowl interior (every submerged terrace + the pan)
 *  and the dunes past the merge band stay sand. terrainChunks routes
 *  these columns to the grass material bucket (all their faces: top +
 *  sides) and the minimap bakes the same rough green collar; nothing
 *  under the water changes. */
export function oasisBrimRing(gx: number, gz: number): boolean {
  const dx = gx - OASIS.cx;
  const dz = gz - OASIS.cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > MEADOW_MAX_R * MEADOW_MAX_R) return false; // pure desert out here
  if (d2 <= OASIS.outerR * OASIS.outerR) {
    return oasisConeFrac(gx, gz) === 0; // ring 0 only — the dry brim
  }
  const d = Math.sqrt(d2);
  // Rough solid edge — sways in and out with the angle, so the collar
  // is never the same width from each side of the oasis.
  const edge = OASIS.grassR + meadowWobble(Math.atan2(dz, dx)) * MEADOW_WOBBLE;
  if (d <= edge) return true; // solid meadow core
  // Merge band — patches thin from ~85% cover at the rough edge to
  // nothing a band later, dissolving the grass into the desert sand.
  const t = (d - edge) / MEADOW_FADE; // 0 at the edge .. 1 in full desert
  return t < 1 && meadowPatchNoise(gx, gz) > 0.22 + 0.74 * t;
}

/* ------------------------------------------------------------------ *
 * OASIS MUD MIX — per the user's "add a mud or clay block and give it
 * mud texture and mix it in the grass texture blocks around the oasis
 * after 4 to 5 grass texture", then "match the mud texture pixel size
 * with the grass texture pixels size and merge the mud blocks in the
 * grass blocks smoothly and properly", and finally the complaint that
 * the first mix came out "in group" — several mud blocks fused into
 * solid islands sitting INSTEAD OF the grass rather than melting into
 * it.
 *
 * The final mix is a GUARANTEED-SCATTERED SPRINKLE:
 *
 *   - the plane is tiled with 2x2-block cells and AT MOST ONE block
 *     inside each cell can be mud (the cell's lowest-hash block, and
 *     only if that hash clears the cell's acceptance threshold) — a
 *     solid group is mathematically impossible;
 *   - a "snake killer" also compares against the left/up neighbour
 *     cells, so two mud blocks can never even touch — every mud block
 *     stands alone IN the grass, fully surrounded by green;
 *   - the acceptance threshold breathes with a very low-frequency
 *     regional sway (purer stretches ~1-in-9, muddier ~1-in-3.5) so
 *     the sprinkle feels organic rather than uniform static;
 *   - the engineered brim walkway (d 34..40, ~5-6 grass rings) stays
 *     PURE GRASS — the spawn shore.
 *
 * Same fixed-constant determinism as the rough collar: chunk builder
 * and minimap bake the identical sprinkle, session after session (the
 * texture itself lives in oasisTextures.ts, drawn at the grass atlas's
 * own 16x16-per-tile pixel density so mud texels read exactly the same
 * size as grass texels on screen).
 * ------------------------------------------------------------------ */

/** Mean mud sprinkle density — one mud block per ~4-5 grass blocks on
 *  average, per the "after 4 to 5 grass texture" request. (The 2x2
 *  winner + neighbour suppression trims this slightly; tuned so the
 *  baked collar lands ~15-20% mud.) */
const MUD_DENSITY = 0.2;
/** Regional sway amplitude — the sprinkle breathes between ~0.11 and
 *  ~0.29 of blocks across the meadow, but never groups. */
const MUD_SWAY = 0.09;

/** Acceptance threshold for the 2x2 cell (cx2, cz2)'s winner — four
 *  blocks per cell, so acceptance = 4x the target block fraction,
 *  clamped so the 2x2 lattice never shows through at the muddy peak. */
function mudCellAccept(cx2: number, cz2: number): number {
  const sway = meadowVnoise((cx2 * 2 + 1) * 0.07 + 3.1, (cz2 * 2 + 1) * 0.07 - 8.7);
  const density = MUD_DENSITY + (sway - 0.5) * 2 * MUD_SWAY;
  return Math.min(density * 4, 0.92);
}

/** The lowest-hash block inside the 2x2 cell (cx2, cz2) — the only
 *  slot that may ever carry mud. Deterministic pure function. */
function mudCellWinner(
  cx2: number,
  cz2: number
): { x: number; z: number; h: number } {
  let best = 2;
  let bx = 0;
  let bz = 0;
  for (let ox = 0; ox < 2; ox++) {
    for (let oz = 0; oz < 2; oz++) {
      const h = meadowHash((cx2 * 2 + ox) * 13 + 101, (cz2 * 2 + oz) * 13 - 57);
      if (h < best) {
        best = h;
        bx = ox;
        bz = oz;
      }
    }
  }
  return { x: bx, z: bz, h: best };
}

/** True when a grass-collar column carries the MUD texture instead of
 *  grass. Only meaningful where oasisBrimRing is true — and it returns
 *  false on the brim walkway itself (d <= outerR), keeping the spawn
 *  shore's first 4-6 grass rings pure green per the request. Beyond
 *  the brim, the 2x2-cell single-winner draw + left/up neighbour
 *  suppression sprinkle isolated mud blocks INTO the grass (~4-5 grass
 *  blocks between hits on average, never two touching) — terrainChunks
 *  routes these columns to the mud bucket (packed-mud top + damp mud
 *  sides at the grass atlas's own 16px density, see oasisTextures.ts)
 *  and the minimap bakes the same brown speckle. */
export function oasisMudAt(gx: number, gz: number): boolean {
  const dx = gx - OASIS.cx;
  const dz = gz - OASIS.cz;
  if (dx * dx + dz * dz <= OASIS.outerR * OASIS.outerR) {
    return false; // the brim walkway — pure grass, no mud
  }
  const cx2 = Math.floor(gx / 2);
  const cz2 = Math.floor(gz / 2);
  const me = mudCellWinner(cx2, cz2);
  // Only the cell's lowest-hash block can be mud, and only when the
  // cell's swayed acceptance clears that hash.
  if (me.h >= mudCellAccept(cx2, cz2)) return false;
  if (gx !== cx2 * 2 + me.x || gz !== cz2 * 2 + me.z) return false;
  // Snake killer — never touch the left / up neighbour cells' mud:
  // this is what keeps every mud block fully surrounded by grass.
  const left = mudCellWinner(cx2 - 1, cz2);
  if (
    left.h < mudCellAccept(cx2 - 1, cz2) &&
    me.x === 0 &&
    left.x === 1 &&
    me.z === left.z
  ) {
    return false;
  }
  const up = mudCellWinner(cx2, cz2 - 1);
  if (
    up.h < mudCellAccept(cx2, cz2 - 1) &&
    me.z === 0 &&
    up.z === 1 &&
    me.x === up.x
  ) {
    return false;
  }
  return true;
}

/** MOUNTAIN RISER weight 0..1 for the dunes OUTSIDE the oasis mouth:
 *  0 at the rim (d = outerR — every column there is held at the brim's
 *  exact level, flush with the ring-0 carve) rising on a smoothstep to
 *  1 at d = outerR + riserR, beyond which the columns keep their full
 *  natural height. This is what turns the old straight wall of dunes
 *  into a gradient — mountains begin at the oasis rim and climb to
 *  full height across the riser band (terrainChunks blends
 *  height = brim + (natural - brim) * riser). Pure radial math, no
 *  noise — the climb is the same circle all the way around. */
export function oasisRiserFactor(gx: number, gz: number): number {
  const dx = gx - OASIS.cx;
  const dz = gz - OASIS.cz;
  const d2 = dx * dx + dz * dz;
  const end = (OASIS.outerR + OASIS.riserR) * (OASIS.outerR + OASIS.riserR);
  if (d2 >= end) return 1; // full natural beyond the riser band
  if (d2 <= OASIS.outerR * OASIS.outerR) return 0; // the mouth itself
  const d = Math.sqrt(d2);
  return smoothstep01((d - OASIS.outerR) / OASIS.riserR);
}

/** Loot-chest blocklist (grid coords): true anywhere inside the oasis
 *  mouth plus a two-block sand apron beyond the brim. Keeps treasure
 *  crates, their summoning circles and their coin bursts off the pool,
 *  its terraces and the shore walkway — the oasis stays a pristine
 *  circle of water and sand (see lootChests.ts `blockedAt`). */
export function oasisChestBlock(gx: number, gz: number): boolean {
  const dx = gx - OASIS.cx;
  const dz = gz - OASIS.cz;
  const keepOut = OASIS.outerR + 2;
  return dx * dx + dz * dz <= keepOut * keepOut;
}

/** Minimap footprint of the POOL: 1 inside the water circle, easing to
 *  0 across its feathered edge (the visible shoreline sits at radius
 *  waterR - 0.5 where the terrace cliff meets the surface). Pure radial
 *  — the pool reads as one smooth bright circle on the map. */
export function oasisWaterCover(gx: number, gz: number): number {
  const dx = gx - OASIS.cx;
  const dz = gz - OASIS.cz;
  const d2 = dx * dx + dz * dz;
  const edge = OASIS.waterR - 0.5;
  if (d2 >= edge * edge) return 0; // fast reject
  const d = Math.sqrt(d2);
  return 1 - smoothstep01((d - edge + 1.5) / 1.5);
}
