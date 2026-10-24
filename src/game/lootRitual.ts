/**
 * lootRitual.ts — golden summoning-circle lighting VFX under loot chests.
 *
 * Every treasure chest stands inside a burning ritual circle (see the
 * reference art): a glowing rune ring etched into the ground, a hot light
 * pool beneath the chest, vertical shafts of golden light rising past it,
 * floating rune-script columns drifting upward and a haze of ember motes.
 * Rare chests get a larger, denser circle with a taller central beam.
 *
 *  - ZERO per-frame CPU: every animation (ring counter-rotation, beam
 *    pulsing, rune columns scrolling upward, mote rise + twinkle) runs in
 *    shaders driven by ONE shared `uTime` uniform — the chest system only
 *    calls setTime() once per frame.
 *  - SHARED RESOURCES: textures, disc geometries and materials are built
 *    once and shared by every chest; per-chest variation (beam/rune/mote
 *    layouts) lives in per-chest merged geometries with aSeed attributes,
 *    disposed via release() when a region is pruned.
 *  - GROUNDED: the circle is added to the SCENE (not the chest group)
 *    so the rings stay flat on the terrain while the chest rests inside.
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface LootRitualHandle {
  /** Builds the circle VFX group for one chest (caller adds it to scene). */
  attach(
    x: number,
    y: number,
    z: number,
    rare: boolean,
    seed: number
  ): THREE.Group;
  /** Advances the shared shader clock (call once per frame). */
  setTime(t: number): void;
  /** Frees one chest's per-chest geometries (region prune / dispose). */
  release(group: THREE.Group): void;
  /** Frees every shared resource. */
  dispose(): void;
}

/** Small deterministic PRNG (mulberry32) — same idiom as lootChests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createLootRitual(lowSpec = false): LootRitualHandle {
  /* ---------------- shared shader clock ---------------- */
  const uTime = { value: 0 };

  /* ---------------- palette (linear working space) ---------------- */
  const COL_HOT = new THREE.Color('#ffe9b0'); // beam base — near-white gold
  const COL_DEEP = new THREE.Color('#ff8c1e'); // beam top — deep ember
  const COL_RUNE = new THREE.Color('#ffc85e'); // floating rune script
  const COL_RING = new THREE.Color(1.0, 0.8, 0.42); // ground rings
  const COL_MOTE = new THREE.Color(1.0, 0.85, 0.45); // ember motes

  /* ---------------- canvas texture helpers ---------------- */
  function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return [canvas, canvas.getContext('2d')];
  }

  function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  /**
   * Draws one procedural rune glyph: straight strokes hopping between a
   * 3x3 lattice of points (Elder-Futhark look) with a warm glow shadow.
   */
  function drawRune(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    s: number,
    rng: () => number
  ): void {
    const px = (i: number): number => ((i % 3) - 1) * s;
    const py = (i: number): number => (Math.floor(i / 3) - 1) * s;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    let a = (rng() * 9) | 0;
    ctx.moveTo(px(a), py(a));
    const strokes = 3 + ((rng() * 3) | 0);
    for (let k = 0; k < strokes; k++) {
      let b = (rng() * 9) | 0;
      if (b === a) b = (b + 4) % 9; // never a zero-length stroke
      ctx.lineTo(px(b), py(b));
      a = b;
    }
    ctx.lineWidth = Math.max(2, s * 0.18);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffdf9e';
    ctx.shadowColor = '#ff9a1e';
    ctx.shadowBlur = s * 0.55;
    ctx.stroke();
    ctx.restore();
  }

  /** Ground rune ring (512²): twin gold circles, 24 rim runes, ticks. */
  function createRingTexture(): THREE.CanvasTexture {
    const [canvas, ctxMaybe] = makeCanvas(512, 512);
    const ctx = ctxMaybe;
    if (ctx) {
      const c = 256;
      ctx.lineCap = 'round';
      // faint warm wash so the band reads as one glowing plate
      const wash = ctx.createRadialGradient(c, c, 150, c, c, 250);
      wash.addColorStop(0, 'rgba(255,180,70,0.06)');
      wash.addColorStop(1, 'rgba(255,150,40,0.16)');
      ctx.fillStyle = wash;
      ctx.beginPath();
      ctx.arc(c, c, 250, 0, Math.PI * 2);
      ctx.fill();
      // the three concentric rings
      const ring = (r: number, w: number, alpha: number): void => {
        ctx.beginPath();
        ctx.arc(c, c, r, 0, Math.PI * 2);
        ctx.lineWidth = w;
        ctx.strokeStyle = `rgba(255,205,110,${alpha})`;
        ctx.shadowColor = '#ff9a1e';
        ctx.shadowBlur = 14;
        ctx.stroke();
      };
      ring(240, 7, 0.95);
      ring(206, 3, 0.7);
      ring(180, 5, 0.9);
      // 24 runes marching around the outer band
      const rng = mulberry32(0x2f7e1d);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        ctx.save();
        ctx.translate(c + Math.cos(a) * 223, c + Math.sin(a) * 223);
        ctx.rotate(a + Math.PI / 2);
        drawRune(ctx, 0, 0, 13, rng);
        ctx.restore();
      }
      // 40 tick marks on the inner edge
      ctx.shadowBlur = 6;
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * 166, c + Math.sin(a) * 166);
        ctx.lineTo(c + Math.cos(a) * 174, c + Math.sin(a) * 174);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255,190,90,0.8)';
        ctx.stroke();
      }
    }
    return toTexture(canvas);
  }

  /** Inner core ring (256²): small rune circle + hot center glow. */
  function createCoreTexture(): THREE.CanvasTexture {
    const [canvas, ctxMaybe] = makeCanvas(256, 256);
    const ctx = ctxMaybe;
    if (ctx) {
      const c = 128;
      const glow = ctx.createRadialGradient(c, c, 0, c, c, 120);
      glow.addColorStop(0, 'rgba(255,214,120,0.55)');
      glow.addColorStop(0.45, 'rgba(255,160,50,0.22)');
      glow.addColorStop(1, 'rgba(255,140,30,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 256, 256);
      ctx.lineCap = 'round';
      const ring = (r: number, w: number, alpha: number): void => {
        ctx.beginPath();
        ctx.arc(c, c, r, 0, Math.PI * 2);
        ctx.lineWidth = w;
        ctx.strokeStyle = `rgba(255,205,110,${alpha})`;
        ctx.shadowColor = '#ff9a1e';
        ctx.shadowBlur = 10;
        ctx.stroke();
      };
      ring(112, 5, 0.95);
      ring(92, 3, 0.65);
      const rng = mulberry32(0x51ba2d);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ctx.save();
        ctx.translate(c + Math.cos(a) * 102, c + Math.sin(a) * 102);
        ctx.rotate(a + Math.PI / 2);
        drawRune(ctx, 0, 0, 8, rng);
        ctx.restore();
      }
    }
    return toTexture(canvas);
  }

  /**
   * Floating rune-script strip (128x512, repeat-wrapped vertically): six
   * glowing glyphs stacked in a column — quads sample this with a
   * time-scrolled v so the script streams upward like the reference art.
   */
  function createStripTexture(): THREE.CanvasTexture {
    const [canvas, ctxMaybe] = makeCanvas(128, 512);
    const ctx = ctxMaybe;
    if (ctx) {
      const rng = mulberry32(0x7e51ba);
      const cells = 6;
      for (let i = 0; i < cells; i++) {
        const cy = (i + 0.5) * (512 / cells);
        drawRune(ctx, 64, cy, 24, rng);
      }
    }
    const texture = toTexture(canvas);
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  /** Soft ember dot (64²) for the rising motes. */
  function createMoteTexture(): THREE.CanvasTexture {
    const [canvas, ctxMaybe] = makeCanvas(64, 64);
    const ctx = ctxMaybe;
    if (ctx) {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
      g.addColorStop(0, 'rgba(255,240,190,0.95)');
      g.addColorStop(0.4, 'rgba(255,190,80,0.5)');
      g.addColorStop(1, 'rgba(255,160,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
    return toTexture(canvas);
  }

  /** Warm light pool (256²) blended normally so it tints the grass. */
  function createPoolTexture(): THREE.CanvasTexture {
    const [canvas, ctxMaybe] = makeCanvas(256, 256);
    const ctx = ctxMaybe;
    if (ctx) {
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 126);
      g.addColorStop(0, 'rgba(255,205,110,0.5)');
      g.addColorStop(0.4, 'rgba(255,150,45,0.3)');
      g.addColorStop(0.75, 'rgba(255,120,25,0.12)');
      g.addColorStop(1, 'rgba(255,110,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
    return toTexture(canvas);
  }

  const ringTexture = createRingTexture();
  const coreTexture = createCoreTexture();
  const stripTexture = createStripTexture();
  const moteTexture = createMoteTexture();
  const poolTexture = createPoolTexture();

  /* ---------------- shared geometries ---------------- */
  // The chest footprint is ~120x92 world units, so the circle (r≈106)
  // wraps well clear of it — like the reference where the ring looms
  // much wider than the treasure it summons.
  const discOuterGeo = new THREE.CircleGeometry(106, 72).rotateX(-Math.PI / 2);
  const discInnerGeo = new THREE.CircleGeometry(62, 56).rotateX(-Math.PI / 2);
  const poolGeo = new THREE.CircleGeometry(86, 56).rotateX(-Math.PI / 2);

  /* ---------------- shaders ---------------- */
  const quadVert = /* glsl */ `
    attribute float aSeed;
    varying vec2 vUv;
    varying float vSeed;
    void main() {
      vUv = uv;
      vSeed = aSeed;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const beamFrag = /* glsl */ `
    uniform float uTime;
    uniform vec3 uColA;
    uniform vec3 uColB;
    varying vec2 vUv;
    varying float vSeed;
    void main() {
      float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
      float body = pow(1.0 - vUv.y, 1.45) * 0.5;
      float core = exp(vUv.y * -3.1) * 0.7;
      float pulse = 0.6 + 0.4 * sin(uTime * 2.2 + vSeed * 6.2831);
      float a = edge * (body + core) * pulse;
      a *= smoothstep(0.0, 0.05, vUv.y);
      vec3 col = mix(uColA, uColB, clamp(vUv.y * 1.25, 0.0, 1.0));
      gl_FragColor = vec4(col, a);
      #include <colorspace_fragment>
    }
  `;

  const runeFrag = /* glsl */ `
    uniform float uTime;
    uniform sampler2D uTex;
    uniform vec3 uCol;
    varying vec2 vUv;
    varying float vSeed;
    void main() {
      float sp = 0.02 + fract(vSeed * 7.31) * 0.05;
      float v = fract(vUv.y - uTime * sp);
      float a = texture2D(uTex, vec2(vUv.x, v)).a;
      a *= smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
      a *= smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
      a *= 0.55 + 0.45 * sin(uTime * 1.5 + vSeed * 12.9);
      gl_FragColor = vec4(uCol, a);
      #include <colorspace_fragment>
    }
  `;

  const ringFrag = /* glsl */ `
    uniform float uTime;
    uniform float uRot;
    uniform float uBase;
    uniform vec3 uColRing;
    uniform sampler2D uTex;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv - 0.5;
      float c = cos(uRot * uTime);
      float s = sin(uRot * uTime);
      vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
      float a = texture2D(uTex, q).a;
      a *= uBase * (0.84 + 0.16 * sin(uTime * 1.8));
      gl_FragColor = vec4(uColRing, a);
      #include <colorspace_fragment>
    }
  `;

  const basicVert = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const moteVert = /* glsl */ `
    attribute vec4 aData; // x: seed, y: rise speed, z: wrap span, w: size
    uniform float uTime;
    varying float vA;
    void main() {
      float span = aData.z;
      float rise = mod(uTime * aData.y + aData.x * span, span);
      vec3 p = position;
      p.y += rise;
      float ang = (uTime * 0.05 + aData.x) * 6.2831 * 0.12;
      float ca = cos(ang);
      float sa = sin(ang);
      p.xz = mat2(ca, -sa, sa, ca) * p.xz;
      float h = rise / span;
      vA = (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 2.8 + aData.x * 40.0)))
        * smoothstep(0.0, 0.12, h)
        * (1.0 - smoothstep(0.75, 1.0, h));
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = aData.w * (240.0 / max(1.0, -mv.z));
      gl_Position = projectionMatrix * mv;
    }
  `;

  const moteFrag = /* glsl */ `
    uniform sampler2D uTex;
    uniform vec3 uCol;
    varying float vA;
    void main() {
      float a = texture2D(uTex, gl_PointCoord).a * vA;
      gl_FragColor = vec4(uCol, a);
      #include <colorspace_fragment>
    }
  `;

  /* ---------------- shared materials ---------------- */
  const additive = {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  } as const;

  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uColA: { value: COL_HOT }, uColB: { value: COL_DEEP } },
    vertexShader: quadVert,
    fragmentShader: beamFrag,
    side: THREE.DoubleSide,
    ...additive,
  });

  const runeMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uTex: { value: stripTexture }, uCol: { value: COL_RUNE } },
    vertexShader: quadVert,
    fragmentShader: runeFrag,
    side: THREE.DoubleSide,
    ...additive,
  });

  const ringOuterMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uRot: { value: 0.1 }, // rad/s counter-clockwise
      uBase: { value: 0.95 },
      uTex: { value: ringTexture },
      uColRing: { value: COL_RING },
    },
    vertexShader: basicVert,
    fragmentShader: ringFrag,
    ...additive,
  });

  const ringInnerMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime,
      uRot: { value: -0.16 }, // clockwise
      uBase: { value: 0.9 },
      uTex: { value: coreTexture },
      uColRing: { value: COL_RING },
    },
    vertexShader: basicVert,
    fragmentShader: ringFrag,
    ...additive,
  });

  const moteMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uTex: { value: moteTexture }, uCol: { value: COL_MOTE } },
    vertexShader: moteVert,
    fragmentShader: moteFrag,
    ...additive,
  });

  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTexture,
    transparent: true,
    depthWrite: false,
  });

  /* ---------------- per-chest geometry builders ---------------- */

  /** One vertical additive quad (bottom at y=0), tagged with aSeed. */
  function pushQuad(
    list: THREE.BufferGeometry[],
    w: number,
    h: number,
    x: number,
    z: number,
    rotY: number,
    seed: number
  ): void {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    g.rotateY(rotY);
    g.translate(x, 0, z);
    const seeds = new Float32Array(g.attributes.position.count).fill(seed);
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    list.push(g);
  }

  /** Central pillar + ring of crossed outer beams, merged to one geometry.
   *  Outer beams stand just inside the rune ring (r 92-110) — clear of
   *  the chest silhouette (half-width 60) so they stay visible from the
   *  side and read as pillars of the circle. */
  function buildBeams(rng: () => number, rare: boolean): THREE.BufferGeometry {
    const list: THREE.BufferGeometry[] = [];
    const centerH = rare ? 320 : 250;
    pushQuad(list, 40, centerH, 0, 0, 0, rng());
    pushQuad(list, 40, centerH, 0, 0, Math.PI / 2, rng());
    const outer = rare ? 6 : 4;
    for (let i = 0; i < outer; i++) {
      const a = (i / outer) * Math.PI * 2 + rng() * 0.5;
      const r = 92 + rng() * 18;
      const w = 11 + rng() * 6;
      const h = 150 + rng() * 110;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const seed = rng();
      pushQuad(list, w, h, x, z, a, seed);
      pushQuad(list, w, h, x, z, a + Math.PI / 2, seed);
    }
    const geo = BufferGeometryUtils.mergeGeometries(list);
    for (const g of list) g.dispose();
    return geo ?? new THREE.BufferGeometry();
  }

  /** Outward-facing rune-script columns drifting up around the circle. */
  function buildRunes(rng: () => number, rare: boolean): THREE.BufferGeometry {
    const strips: THREE.BufferGeometry[] = [];
    let count = rare ? 8 : 6;
    if (lowSpec) count = Math.max(4, count - 2);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng() * 0.7;
      const r = 74 + rng() * 16;
      const w = 12 + rng() * 6;
      const h = 150 + rng() * 110;
      const g = new THREE.PlaneGeometry(w, h);
      g.translate(0, h / 2, 0);
      g.rotateY(Math.PI / 2 - a); // face away from the circle center
      g.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
      const seeds = new Float32Array(g.attributes.position.count).fill(rng());
      g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
      strips.push(g);
    }
    const geo = BufferGeometryUtils.mergeGeometries(strips);
    for (const g of strips) g.dispose();
    return geo ?? new THREE.BufferGeometry();
  }

  /** Ember motes: one Points cloud, rise + wrap + twinkle in the shader. */
  function buildMotes(rng: () => number, rare: boolean): THREE.BufferGeometry {
    let count = rare ? 42 : 26;
    if (lowSpec) count = (count * 0.6) | 0;
    const positions = new Float32Array(count * 3);
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = 16 + rng() * 66;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = 3 + rng() * 26;
      positions[i * 3 + 2] = Math.sin(a) * r;
      data[i * 4] = rng(); // seed
      data[i * 4 + 1] = 10 + rng() * 16; // rise speed (u/s)
      data[i * 4 + 2] = 170 + rng() * 100; // wrap span
      data[i * 4 + 3] = 8 + rng() * 10; // point size
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aData', new THREE.BufferAttribute(data, 4));
    // the shader lifts motes up to span units — inflate the cull sphere
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 150, 0), 330);
    return geo;
  }

  /* ---------------- attach / release ---------------- */

  function attach(
    x: number,
    y: number,
    z: number,
    rare: boolean,
    seed: number
  ): THREE.Group {
    const rng = mulberry32(((seed * 4294967296) >>> 0) ^ 0x5f3759df);
    const group = new THREE.Group();

    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.position.y = 0.3;
    pool.renderOrder = 1; // under every additive layer

    const discOuter = new THREE.Mesh(discOuterGeo, ringOuterMat);
    discOuter.position.y = 0.7;
    discOuter.renderOrder = 2;

    const discInner = new THREE.Mesh(discInnerGeo, ringInnerMat);
    discInner.position.y = 1.1;
    discInner.renderOrder = 2;

    const beams = new THREE.Mesh(buildBeams(rng, rare), beamMat);
    beams.renderOrder = 2;
    beams.userData.own = true;

    const runes = new THREE.Mesh(buildRunes(rng, rare), runeMat);
    runes.renderOrder = 2;
    runes.userData.own = true;

    const motes = new THREE.Points(buildMotes(rng, rare), moteMat);
    motes.renderOrder = 3;
    motes.userData.own = true;

    group.add(pool, discOuter, discInner, beams, runes, motes);
    group.position.set(x, y, z);
    if (rare) group.scale.setScalar(1.18); // rare circles loom larger
    return group;
  }

  /** Disposes the per-chest geometries built by attach() (shared assets
   *  live on — they are freed once by dispose()). */
  function release(group: THREE.Group): void {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.userData?.own && mesh.geometry) {
        mesh.geometry.dispose();
      }
    });
  }

  function setTime(t: number): void {
    uTime.value = t;
  }

  function dispose(): void {
    ringTexture.dispose();
    coreTexture.dispose();
    stripTexture.dispose();
    moteTexture.dispose();
    poolTexture.dispose();
    discOuterGeo.dispose();
    discInnerGeo.dispose();
    poolGeo.dispose();
    beamMat.dispose();
    runeMat.dispose();
    ringOuterMat.dispose();
    ringInnerMat.dispose();
    moteMat.dispose();
    poolMat.dispose();
  }

  return { attach, setTime, release, dispose };
}
