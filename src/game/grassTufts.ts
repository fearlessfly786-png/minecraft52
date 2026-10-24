import * as THREE from 'three';

/**
 *  MINECRAFT-STYLE GRASS FIELDS (procedural, vanilla cross-sprite build)
 *  ---------------------------------------------------------------------
 *  This module hosts the GENERIC field factory (createGrassField) plus
 *  the SHORT-GRASS preset (createGrassTufts); the TALL-GRASS preset
 *  lives in tallGrass.ts and feeds the same factory. Hand-built the way
 *  Minecraft does it — no model files:
 *    - Each tuft is a CROSS of two camera-agnostic quads (4 triangles),
 *      exactly like vanilla's crossed plant sprites.
 *    - The blade art is a pixel canvas drawn at runtime with
 *      NearestFilter, so every pixel stays crisp at any distance.
 *    - The palette is SAMPLED FROM THE LIVE GRASS BLOCKS: page.tsx hands
 *      in the average top-face colour of the grass zone's atlas (Zone
 *      Studio skins included), and the blades shade darker at the roots
 *      and lighter at the tips around that colour — the tufts always
 *      match the ground they stand on.
 *    - SHORT preset: 0.45 of a block tall (vanilla-short proportions).
 *    - LIGHTLY RANDOM even spacing: a sparse quincunx grid (a tuft on
 *      every 7th-block grid point PLUS every cell centre), each tuft
 *      nudged slightly off its spot — evenly spread, never rigid rows.
 *    - LIGHTING: every normal points up (lit like the block tops) and
 *      the mesh both casts and receives real PCF shadow-map shadows —
 *      the alpha-tested depth material keeps the shadows blade-shaped.
 *    - WIND: a travelling gust front sweeps the whole meadow (phase
 *      seeded by world position, so waves visibly roll across the
 *      field) with per-blade flutter layered on top; roots pinned.
 *    - Purely decorative: NO collision, NO support — the player and every
 *      vehicle walk/drive straight through it.
 *
 *  CAMERA-FACING STREAMING (RAM / GPU memory technique)
 *  -----------------------------------------------------
 *  The whole meadow is only SOURCE DATA (tiny {x,z,tint,rot} seeds,
 *  a few dozen bytes each). It is cut into square spatial CELLS and
 *  only the cells IN FRONT OF THE CAMERA are ever loaded:
 *    1. CONE TEST  — a cell is loaded when the angle between the
 *       camera's forward vector and the direction to the cell is inside
 *       the view cone (FOV half-angle + the cell's own angular radius,
 *       so near cells widen the cone naturally). Cells BEHIND or beside
 *       the camera are NOT loaded.
 *    2. DISTANCE TEST — cells beyond the view horizon unload (and stay
 *       loaded a little further with hysteresis so edge cells never
 *       flicker). 5000u is sub-pixel for a 45u tuft through the FogExp2
 *       haze, so the pop-in is invisible.
 *    3. NEAR RING — cells hugging the player always load (looking
 *       straight down / ultra-wide screens would defeat a pure cone).
 *    4. MESH POOL — loaded cells draw from a small fixed pool of
 *       InstancedMeshes (each sized to the fullest cell). A cell leaving
 *       the cone releases its slot to the next cell entering it, so GPU
 *       instance buffers stay bounded by what the player can SEE instead
 *       of the whole 15km field — and stay constant no matter how far
 *       the player walks. Per-cell matrices are built lazily the first
 *       time a cell is ever seen, then cached for instant reloads.
 *  The refresh runs a few times a second (a dot product per cell —
 *  microseconds), so as the player walks or turns, grass streams in
 *  ahead and evaporates behind.
 */

export interface GrassTuftTopColor {
  r: number;
  g: number;
  b: number;
}

export interface GrassTuftsOptions {
  /** World centre of the meadow field (the grassland spawn anchor). */
  anchorX: number;
  anchorZ: number;
  /** World size of one voxel block (100) — sets both tuft size and the
   *  exact grid spacing (one tuft per block top). */
  block: number;
  /** Terrain surface sampler (top of the block deck) at a world pos. */
  heightAt: (x: number, z: number) => number;
  /** Average colour of the grass zone's top-face atlas tile (0..1 RGB).
   *  Blade shades are derived from it so tufts match the blocks; when
   *  null a vanilla-style green fallback keeps the field alive. */
  topColor?: () => GrassTuftTopColor | null;
  /** Low-spec machines get a smaller, nearer field. */
  lowSpec?: boolean;
}

export interface GrassTuftsStats {
  /** Total tufts in the whole field (source seeds, loaded or not). */
  tufts: number;
  /** Tufts actually instantiated and drawn RIGHT NOW (in the cone). */
  liveTufts: number;
  /** Total spatial cells the field was cut into. */
  cells: number;
  /** Cells currently loaded (in front of the camera). */
  liveCells: number;
  /** InstancedMesh pool slots allocated / maximum. */
  pool: number;
  poolMax: number;
  /** Streaming horizon (world units). */
  viewDist: number;
  ready: boolean;
  radius: number;
  spacing: number;
}

export interface GrassTuftsHandle {
  /** Per-frame tick: advances the wind clock and (throttled) refreshes
   *  the camera-facing cell streaming. Pass the live camera. */
  update(dt: number, camera?: THREE.Camera): void;
  /** Meadow + streaming census (debug handle). */
  stats(): GrassTuftsStats;
  /** Live wind clock (debug handle) — advances every update tick. */
  wind(): number;
  /** The InstancedMeshes currently drawing loaded cells (debug handle)
   *  — shadow flags, draw-call and memory checks. */
  meshes(): THREE.InstancedMesh[];
  /** Every tuft/plant position the layer was AUTHORED with (world x/z,
   *  jitter and all — the exact spots instances draw at). Read-only
   *  snapshot, built once. The fruit layer feeds these into its
   *  collision builder so the solid boxes match the rendered plants. */
  seeds(): ReadonlyArray<{ x: number; z: number }>;
}

/**
 * Everything that makes one grass LAYER look the way it does — the
 * generic field factory below is shared by the short-grass lawn AND the
 * tall-grass scatter (see src/game/tallGrass.ts).
 */
export interface GrassStyle {
  /** Tuft height as a fraction of one voxel block. For `custom` plants
   *  this is the plant's world height — the wind hinges around it. */
  tuftHeight: number;
  /** Tuft cross width as a fraction of one voxel block. */
  tuftWidth: number;
  /** Density: one tuft on every Nth-block grid point PLUS every cell
   *  centre (the quincunx). Larger = sparser. */
  gridStepBlocks: number;
  /** Wind lean multiplier — taller blades need a deeper bend to sell. */
  sway: number;
  /** Wind TIME multiplier — 1 = the shared gust tempo; values < 1 make
   *  a layer sway in slow motion (sugar cane: very slow, stately). */
  windSpeed?: number;
  /** STATIC layer (sugar cane): skip the wind vertex shader entirely —
   *  the plant stands PERFECTLY STILL (no gust lean, no flutter) while
   *  the grass layers around it keep swaying. Also saves the per-vertex
   *  wind math on this layer's GPU program. */
  static?: boolean;
  /** Pixel-art sprite canvas size + blade layout (x = px column,
   *  h = height fraction of the canvas, bend = upper-half px lean).
   *  Only used by the built-in cross-sprite builder. */
  sprite?: {
    w: number;
    h: number;
    blades: { x: number; h: number; bend: number }[];
  };
  /** Advanced layers (sugar plant): supply a fully custom merged
   *  geometry + material instead of the built-in cross sprite. The
   *  factory keeps everything else — streaming, pool, shadows, wind,
   *  per-instance tint — and just instances THIS plant. Build the
   *  geometry in WORLD units around the origin (base at y=0). */
  custom?: () => {
    geometry: THREE.BufferGeometry;
    material: THREE.MeshLambertMaterial;
  };
}

/** Field radii: sized to the terrain's streamed view (6 chunks x 16
 *  blocks x 100 units ≈ 9.6k units) so the meadow's edge hides in the
 *  haze, and kept inside the verified pure-grassland heartland. */
const FIELD_RADIUS = 7500;
const FIELD_RADIUS_LOW_SPEC = 4800;
/** Keep the exact spawn pad clear (player + lobby turntable pop in here). */
const SPAWN_CLEAR_RADIUS = 150;
/** "Lightly random" placement: each tuft wanders up to ±0.22 of a grid
 *  step off its grid point — even spacing stays readable, rigidity gone. */
const JITTER_FRACTION = 0.22;

/** The SHORT-GRASS lawn style: knee-high vanilla cross sprites, one
 *  notch denser than the original one-per-8-blocks field (nearest
 *  neighbours sit ~495 world units apart, 700 along the axes). */
export const SHORT_GRASS_STYLE: GrassStyle = {
  tuftHeight: 0.45,
  tuftWidth: 0.62,
  gridStepBlocks: 7,
  sway: 0.26,
  sprite: {
    w: 16,
    h: 16,
    // six blades of differing heights with gentle leans — a classic
    // Minecraft short-grass silhouette
    blades: [
      { x: 1, h: 0.55, bend: -1 },
      { x: 4, h: 0.82, bend: -1 },
      { x: 7, h: 1.0, bend: 0 },
      { x: 9, h: 0.72, bend: 1 },
      { x: 12, h: 0.9, bend: 1 },
      { x: 14, h: 0.5, bend: 0 },
    ],
  },
};

// ---- streaming tuning ---------------------------------------------------
/** Spatial cell side: 2 quincunx grid steps (16 blocks = 1600u) — each
 *  full cell holds ~13 tufts, small enough to stream smoothly. */
const CELL_STEPS = 2;
/** Load horizon: at 5000u a 45u tuft subtends half a pixel through the
 *  FogExp2 haze — cells crossing in here pop in invisibly. */
const VIEW_DIST = 5000;
/** Hysteresis: a loaded cell only unloads past this (never flickers on
 *  the show/hide boundary while strafing along the horizon). */
const HIDE_DIST = 5400;
/** Cells this close to the camera always load — peripheral vision,
 *  looking straight down and ultra-wide aspect safety net. */
const NEAR_RADIUS = 1400;
/** View-cone half-angle (covers a 60° vertical FOV at up to 32:9 plus
 *  margin); each cell adds its own angular radius on top, so cells
 *  widen the cone as they get close. */
const HALF_ANGLE = (72 * Math.PI) / 180;
/** Exit hysteresis for the cone test: live cells leave through a slightly
 *  wider cone so a cell sitting exactly on the cone boundary cannot
 *  flicker visible/invisible on tiny yaw changes. */
const CONE_EXIT_MARGIN = 0.105; // ~6°
/** Streaming refresh cadence (seconds) — a dot product per cell, so
 *  this is effectively free even at 5 Hz. */
const REFRESH_INTERVAL = 0.2;
/** Fixed InstancedMesh pool: worst-case visible cells is ~22 (72° cone
 *  out to 5000u of 1400u cells) + turn spikes; nearest cells win. */
const MAX_POOL = 26;

/** Vanilla-style fallback green when no atlas sample is available. */
const FALLBACK_TOP = { r: 0.47, g: 0.67, b: 0.33 };

/** Draw the tuft sprite: transparent background, four shade bands
 *  (dark roots -> light tips) around the sampled block colour. The
 *  canvas size and blade layout come from the layer's style, so the
 *  same painter writes both the 16x16 short sprite and the 16x32 tall
 *  double-plant sprite. */
function drawTuftTexture(
  top: GrassTuftTopColor,
  sprite: GrassStyle['sprite']
): THREE.CanvasTexture {
  const W = sprite.w;
  const H = sprite.h;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  // ---- palette: a proper GREENER pixel ramp ----------------------------
  // A fixed vanilla-style saturated green ladder (dark roots -> light
  // tips) — deriving everything from the block average washed out mint,
  // because the atlas top tile is full of near-white highlight pixels.
  // The sampled colour only pulls the ramp ~18% toward the live ground
  // so the meadow still harmonises with the blocks it stands on.
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const vanillaRamp = ['#3e7a24', '#549630', '#6cb03c', '#8acc50'];
  const ref = new THREE.Color(
    clamp01(top.r * 0.78),
    clamp01(top.g * 1.1),
    clamp01(top.b * 0.7)
  );
  const shades = vanillaRamp.map((hex, i) => {
    const c = new THREE.Color(hex).lerp(ref, 0.18);
    // the scene sun is VERY intense (intensity 12) — keep the ramp a
    // notch darker so blades land on proper green instead of washing out
    c.r = clamp01(c.r * 0.85);
    c.g = clamp01(c.g * 0.85 * (1 + i * 0.012)); // tips keep a green bias
    c.b = clamp01(c.b * 0.85 * 0.88); // kill any blue drift -> pure greens
    return `#${c.getHexString()}`;
  });

  const px = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  };

  const bottom = H - 1;
  for (const blade of sprite.blades) {
    const topRow = Math.max(1, Math.round(bottom - blade.h * (H - 3)));
    for (let row = bottom; row >= topRow; row--) {
      const t = (bottom - row) / Math.max(1, bottom - topRow); // 0 root -> 1 tip
      const bendPx = blade.x + (t > 0.5 ? blade.bend : 0);
      const x = Math.max(0, Math.min(W - 1, bendPx));
      const si = t > 0.72 ? 3 : t > 0.42 ? 2 : t > 0.18 ? 1 : 0;
      px(x, row, shades[si]);
      // widen the rooted half so blades read as a tuft, not sticks
      if (row >= H - 6)
        px(Math.min(W - 1, x + 1), row, shades[Math.max(0, si - 1)]);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; // crisp pixel-art, Minecraft style
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- streaming data model ------------------------------------------------

/** Light source seed — the ONLY per-tuft data kept for the whole field. */
interface TuftSeed {
  x: number;
  z: number;
  rot: number;
  tint: THREE.Color;
}

/** GPU-ready instance data for one cell, built lazily on first sight
 *  (needs the terrain sampler) and cached for instant reloads. */
interface CellGPU {
  count: number;
  matrices: Float32Array; // 16 floats per tuft (column-major, like the attr)
  colors: Float32Array; // 3 floats per tuft
}

interface Cell {
  key: string;
  /** Centre + half-diagonal (world units) for the cone/distance tests. */
  wx: number;
  wz: number;
  rad: number;
  seeds: TuftSeed[];
  gpu: CellGPU | null;
  /** Pool slot currently drawing this cell (null = not loaded). */
  slot: PoolSlot | null;
}

interface PoolSlot {
  mesh: THREE.InstancedMesh;
  cell: Cell | null;
}

/**
 * The built-in crossed pixel sprite: two camera-agnostic quads
 * (4 triangles), the classic vanilla plant shape. Authored in WORLD
 * units around the origin, base at y=0.
 */
function buildCrossGeometry(
  block: number,
  style: GrassStyle
): THREE.BufferGeometry {
  const h = block * style.tuftHeight;
  const hw = (block * style.tuftWidth) / 2;
  const geo = new THREE.BufferGeometry();
  // quad A faces +z, quad B faces +x — the classic crossed pair
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -hw, 0, 0, hw, 0, 0, hw, h, 0, -hw, h, 0, // A: root L, root R, tip R, tip L
        0, 0, -hw, 0, 0, hw, 0, h, hw, 0, h, -hw, // B: same, rotated 90°
      ],
      3
    )
  );
  geo.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1],
      2
    )
  );
  geo.setAttribute(
    'normal',
    // every normal points UP — vanilla-style plant lighting: both cross
    // faces are lit exactly like the grass-block top they stand on, so
    // the tufts share the ground's brightness instead of catching the
    // sky's horizon wash on edge-on normals
    new THREE.Float32BufferAttribute(
      [
        0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
        0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
      ],
      3
    )
  );
  geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return geo;
}

/**
 * The GENERIC grass-layer factory behind both fields. `style` carries
 * everything visual (size, density, sprite art, wind depth); `options`
 * carries everything world (anchor, terrain sampler, palette source).
 * createGrassTufts() is the short-lawn preset; src/game/tallGrass.ts
 * feeds it the tall-grass style; src/game/sugarPlant.ts feeds it a
 * fully custom 3D plant.
 */
export function createGrassField(
  scene: THREE.Scene,
  options: GrassTuftsOptions,
  style: GrassStyle
): GrassTuftsHandle {
  const { anchorX, anchorZ, block, heightAt, topColor, lowSpec } = options;
  const radius = lowSpec ? FIELD_RADIUS_LOW_SPEC : FIELD_RADIUS;
  const spacing = block * style.gridStepBlocks;
  const cellSize = spacing * CELL_STEPS;

  const swayUniform = { value: 0 };

  // ---- palette: match the live grass blocks ---------------------------
  const sampled = topColor?.() ?? null;
  const top = sampled ?? FALLBACK_TOP;

  // ---- plant geometry + material ---------------------------------------
  // Either the custom plant (sugar cane style — its own merged geometry
  // + atlas material) or the built-in crossed pixel sprite.
  const customPlant = style.custom?.();
  const h = block * style.tuftHeight; // wind hinge height (world units)
  const geo: THREE.BufferGeometry = customPlant
    ? customPlant.geometry
    : buildCrossGeometry(block, style);
  const mat: THREE.MeshLambertMaterial = customPlant
    ? customPlant.material
    : new THREE.MeshLambertMaterial({
        map: drawTuftTexture(top, style.sprite!),
        alphaTest: 0.5,
        side: THREE.DoubleSide,
      });
  // taller blades hinge deeper — the style carries its own lean factor;
  // windSpeed slows the whole gust field down (slow-motion layers).
  // STATIC styles (sugar cane) get NO wind injection at all: the shared
  // program stays vanilla Lambert, so the layer cannot move a vertex.
  const sway = style.sway;
  const ws = style.windSpeed ?? 1;
  if (!style.static) {
    mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = swayUniform;
    shader.uniforms.uBladeH = { value: h };
    shader.vertexShader =
      'uniform float uTime;\nuniform float uBladeH;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          // ---- WIND FIELD --------------------------------------------------
          // Blades lean WITH a travelling gust front (phase seeded by the
          // instance's world position, so waves visibly roll across the
          // field) plus a faster per-blade flutter. ROOTS ARE PINNED:
          // blade=0 at the ground -> zero motion; blade=1 at the tips ->
          // full lean. IMPORTANT: the geometry is authored in WORLD
          // units (uBladeH ≈ 45), so the amplitude must scale with it —
          // an object-space constant would be sub-pixel and invisible.
          'float wpx = instanceMatrix[3][0];',
          'float wpz = instanceMatrix[3][2];',
          'float front = wpx * 0.011 + wpz * 0.009;',
          'float blade = clamp(transformed.y / max(uBladeH, 0.001), 0.0, 1.0);',
          `float gust = sin(uTime * ${(1.35 * ws).toFixed(4)} - front) * 0.62 + sin(uTime * ${(0.57 * ws).toFixed(4)} - front * 0.41) * 0.38;`,
          `float flutter = sin(uTime * ${(3.4 * ws).toFixed(4)} + front * ${(7.0 * ws).toFixed(4)} + transformed.x * 0.9 + transformed.z * 0.7) * 0.18;`,
          // wind blows one way: mostly positive lean, brief soft return
          'float lean = max(gust + flutter, -0.35);',
          'float amp = uBladeH * blade;',
          `transformed.x += ${sway} * lean * amp;`,
          `transformed.z += ${sway} * lean * amp * 0.56;`,
          // bending foreshortens the blade a touch — sells the hinge
          `transformed.y -= ${sway} * abs(lean) * amp * 0.22;`,
        ].join('\n')
      );
    };
  }

  // blade-shaped shadows: the default depth pass ignores alphaTest (the
  // whole quad would shadow as a square), so hand it the same cutout
  // (the sway itself stays depth-side static — imperceptible at this size).
  // DoubleSide so single-plant strips (sugar-plant leaves) cast too.
  const depthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: mat.map,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });

  // ---- the even-but-lightly-random quincunx field, cut into cells -------
  // Grid points every `style.gridStepBlocks` blocks PLUS every cell
  // centre, each tuft nudged a little off its spot so rows never read as
  // rigid farm lines. Tufts are bucketed straight into their streaming
  // cell.
  const step = spacing;
  const anchorGX = Math.round(anchorX / block);
  const anchorGZ = Math.round(anchorZ / block);
  const n = Math.floor(radius / step);
  const cells = new Map<string, Cell>();
  const tint = new THREE.Color();
  for (let gx = -n; gx <= n; gx++) {
    for (let gz = -n; gz <= n; gz++) {
      // a quincunx pair: the grid-point tuft + the cell-centre tuft
      for (const [fx, fz] of [
        [0, 0],
        [0.5, 0.5],
      ]) {
        const jx = (Math.random() - 0.5) * step * JITTER_FRACTION * 2;
        const jz = (Math.random() - 0.5) * step * JITTER_FRACTION * 2;
        const x = (anchorGX + (gx + fx) * style.gridStepBlocks) * block + jx;
        const z = (anchorGZ + (gz + fz) * style.gridStepBlocks) * block + jz;
        const dx = x - anchorX;
        const dz = z - anchorZ;
        const d2 = dx * dx + dz * dz;
        if (d2 > radius * radius) continue; // stay inside the field disc
        if (d2 < SPAWN_CLEAR_RADIUS * SPAWN_CLEAR_RADIUS) continue; // spawn pad
        // bucket into the streaming cell this tuft lands in
        const ccx = Math.floor(x / cellSize);
        const ccz = Math.floor(z / cellSize);
        const key = `${ccx},${ccz}`;
        let cell = cells.get(key);
        if (!cell) {
          cell = {
            key,
            wx: (ccx + 0.5) * cellSize,
            wz: (ccz + 0.5) * cellSize,
            rad: cellSize * 0.5 * Math.SQRT2,
            seeds: [],
            gpu: null,
            slot: null,
          };
          cells.set(key, cell);
        }
        // subtle per-tuft tint so the regular grid still feels organic
        cell.seeds.push({
          x,
          z,
          // full 90° rotations only: keeps the cross perfectly regular AND
          // the even grid reading cleanly, like vanilla's snapped sprites
          rot: (Math.floor(Math.random() * 4) * Math.PI) / 2,
          tint: tint
            .setRGB(
              0.95 + Math.random() * 0.09,
              0.96 + Math.random() * 0.08,
              0.93 + Math.random() * 0.09
            )
            .clone(),
        });
      }
    }
  }
  const cellList = [...cells.values()];
  const totalTufts = cellList.reduce((s, c) => s + c.seeds.length, 0);
  const maxCellItems = cellList.reduce((m, c) => Math.max(m, c.seeds.length), 1);

  // ---- lazy per-cell GPU build ------------------------------------------
  const m4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const oneScale = new THREE.Vector3(1, 1, 1);

  function buildCellGPU(cell: Cell): CellGPU {
    const count = cell.seeds.length;
    const matrices = new Float32Array(count * 16);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const s = cell.seeds[i];
      const y = heightAt(s.x, s.z); // top of this tuft's grass block
      euler.set(0, s.rot, 0);
      quat.setFromEuler(euler);
      pos.set(s.x, y, s.z);
      m4.compose(pos, quat, oneScale);
      m4.toArray(matrices, i * 16);
      colors[i * 3] = s.tint.r;
      colors[i * 3 + 1] = s.tint.g;
      colors[i * 3 + 2] = s.tint.b;
    }
    const gpuData = { count, matrices, colors };
    cell.gpu = gpuData;
    return gpuData;
  }

  // ---- the InstancedMesh pool -------------------------------------------
  // Only loaded cells hold instances: a cell entering the cone grabs a
  // free slot and copies its cached arrays into it; a cell leaving the
  // cone releases the slot for the next arrival. GPU instance buffers
  // are therefore bounded by the view, not by the 15km field.
  const pool: PoolSlot[] = [];

  function activateCell(cell: Cell): void {
    if (cell.slot) return; // already loaded
    let slot: PoolSlot | undefined = pool.find((s) => !s.cell);
    if (!slot) {
      if (pool.length >= MAX_POOL) return; // nearest cells won the pool
      const mesh = new THREE.InstancedMesh(geo, mat, maxCellItems);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(maxCellItems * 3),
        3
      );
      mesh.frustumCulled = false; // the cone test IS the cull (instances
      // span the cell in world space; the geometry bounds would lie)
      mesh.castShadow = true; // blade-shaped shadows via the depth material
      mesh.receiveShadow = true; // smooth PCF shadows from sun/props/player
      mesh.customDepthMaterial = depthMat;
      mesh.visible = false;
      slot = { mesh, cell: null };
      pool.push(slot);
    }
    const gpuData = cell.gpu ?? buildCellGPU(cell);
    const mesh = slot.mesh;
    mesh.count = gpuData.count;
    (mesh.instanceMatrix.array as Float32Array).set(gpuData.matrices);
    mesh.instanceMatrix.needsUpdate = true;
    (mesh.instanceColor!.array as Float32Array).set(gpuData.colors);
    mesh.instanceColor!.needsUpdate = true;
    mesh.visible = true;
    if (!mesh.parent) scene.add(mesh);
    slot.cell = cell;
    cell.slot = slot;
  }

  function deactivateCell(cell: Cell): void {
    const slot = cell.slot;
    if (!slot) return;
    slot.mesh.visible = false;
    scene.remove(slot.mesh);
    slot.cell = null;
    cell.slot = null;
  }

  // ---- camera-facing streaming refresh -----------------------------------
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  let lastFx = 0;
  let lastFz = -1; // assume facing -z until the camera reports one
  const want: { cell: Cell; d: number }[] = [];

  function refresh(camera: THREE.Camera): void {
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);
    // flatten the forward vector to the ground plane; if the player is
    // looking straight down/up keep the last usable heading
    let fx = camDir.x;
    let fz = camDir.z;
    const fl = Math.hypot(fx, fz);
    if (fl > 1e-4) {
      fx /= fl;
      fz /= fl;
    } else {
      fx = lastFx;
      fz = lastFz;
    }
    lastFx = fx;
    lastFz = fz;
    const px = camPos.x;
    const pz = camPos.z;

    want.length = 0;
    for (const cell of cellList) {
      const dx = cell.wx - px;
      const dz = cell.wz - pz;
      const d = Math.hypot(dx, dz);
      const live = cell.slot !== null;
      // distance test with hysteresis (loaded cells stick a bit further)
      if (d > (live ? HIDE_DIST : VIEW_DIST)) {
        if (live) deactivateCell(cell);
        continue;
      }
      // cone test: inside the near ring everything loads; beyond it the
      // cell must sit inside the view cone (half-angle widened by the
      // cell's own angular radius, so near cells are forgiving). A cell
      // whose bounding disc REACHES the near ring counts as near too:
      // huge sparse cells (the rare fruit plants) can park their centre
      // far off to the side while one of their plants stands right
      // beside the player — testing that centre against the cone made
      // the plant pop out of existence on the slightest camera turn and
      // pop back on the next one.
      let visible: boolean;
      if (d - cell.rad <= NEAR_RADIUS) {
        visible = true;
      } else {
        const ang = Math.asin(Math.min(1, cell.rad / d));
        // live cells exit through a slightly wider cone (hysteresis, like
        // the distance test above) so boundary cells cannot flicker
        const half = HALF_ANGLE + ang + (live ? CONE_EXIT_MARGIN : 0);
        const cosLim = Math.cos(Math.min(half, 1.62));
        visible = ((dx / d) * fx + (dz / d) * fz) >= cosLim;
      }
      if (visible) {
        want.push({ cell, d });
      } else if (live) {
        deactivateCell(cell);
      }
    }
    // nearest cells first — if the pool ever runs dry, the grass the
    // player is closest to (and most likely to inspect) wins
    want.sort((a, b) => a.d - b.d);
    for (const w of want) activateCell(w.cell);
  }

  // ---- handle -------------------------------------------------------------
  let refreshClock = REFRESH_INTERVAL; // fire on the very first tick

  if (!totalTufts) {
    return {
      update: (dt) => void (swayUniform.value += dt),
      stats: () => ({
        tufts: 0,
        liveTufts: 0,
        cells: 0,
        liveCells: 0,
        pool: 0,
        poolMax: MAX_POOL,
        viewDist: VIEW_DIST,
        ready: false,
        radius,
        spacing,
      }),
      wind: () => swayUniform.value,
      meshes: () => [],
      seeds: () => [],
    };
  }

  return {
    update(dt: number, camera?: THREE.Camera) {
      swayUniform.value += dt; // wind never sleeps
      if (!camera) return;
      refreshClock += dt;
      if (refreshClock >= REFRESH_INTERVAL) {
        refreshClock = 0;
        refresh(camera);
      }
    },
    stats: () => {
      let liveTufts = 0;
      let liveCells = 0;
      for (const cell of cellList) {
        if (cell.slot) {
          liveCells++;
          liveTufts += cell.seeds.length;
        }
      }
      return {
        tufts: totalTufts,
        liveTufts,
        cells: cellList.length,
        liveCells,
        pool: pool.length,
        poolMax: MAX_POOL,
        viewDist: VIEW_DIST,
        ready: true,
        radius,
        spacing,
      };
    },
    wind: () => swayUniform.value,
    meshes: () =>
      pool.filter((s) => s.cell !== null).map((s) => s.mesh),
    seeds: () =>
      cellList.flatMap((c) => c.seeds.map((s) => ({ x: s.x, z: s.z }))),
  };
}

/** The SHORT-GRASS lawn — the generic field factory with the knee-high
 *  vanilla preset above. (The tall variant lives in tallGrass.ts.) */
export function createGrassTufts(
  scene: THREE.Scene,
  options: GrassTuftsOptions
): GrassTuftsHandle {
  return createGrassField(scene, options, SHORT_GRASS_STYLE);
}
