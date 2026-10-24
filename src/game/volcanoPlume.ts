/**
 * VOLCANO ASH PLUME for RATFIRE — the signature of a live stratovolcano:
 * a dense column of dark ash smoking up out of the caldera, slowly
 * spiralling, spreading into an umbrella as it rises, with a spray of
 * molten sparks whipped up off the lava lake at its base.
 *
 * The plume is ANCHORED to the nearest volcano's crater (world-space
 * query — see volcanoTerrain.ts), so it stands over the cone whether the
 * player approaches from any direction, and it fades in through the haze
 * as the player closes in (opacity follows the proximity glow). Two
 * particle layers:
 *  - SMOKE: normal-blended soft puffs in three size buckets, coloured
 *    ember-warm at the base cooling to ash-grey up high (vertex colors),
 *    fogged naturally by the scene haze.
 *  - SPARKS: additive bright points snapping up off the lava surface —
 *    the same language as the ambient ember swarm, concentrated at the
 *    crater mouth.
 */

import * as THREE from 'three';
import { nearestVolcanoWorld } from './volcanoTerrain';

export interface VolcanoPlumeOptions {
  /** World units per voxel block edge (100). */
  block: number;
  /** Grid origin offset (64). */
  gridOffset: number;
  /** Terrain surface height (top of block) at a world position — anchors
   *  the plume base to the lava lake. */
  heightAt(x: number, z: number): number;
  /** Mobile LOW tier: fewer particles. */
  lowSpec?: boolean;
}

export interface VolcanoPlumeHandle {
  /** Per-frame: anchor to the nearest crater, simulate, fade by distance. */
  update(dt: number, playerX: number, playerZ: number): void;
  /** Debug readout for automated browser verification. */
  debug(): {
    opacity: number;
    visible: boolean;
    x: number;
    y: number;
    z: number;
  };
  dispose(): void;
}

/** Soft radial puff sprite (procedural, no assets). */
function makeSmokeSprite(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.42)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createVolcanoPlume(
  scene: THREE.Scene,
  opts: VolcanoPlumeOptions
): VolcanoPlumeHandle {
  const SMOKE_N = opts.lowSpec ? 66 : 150;
  const SPARK_N = opts.lowSpec ? 18 : 40;

  // column metrics in WORLD units (block = 100): the plume rises ~52
  // blocks off the lava lake and umbrellas out to ~30 blocks across
  const PLUME_TOP = 5200;
  const COL_R = 420;
  const UMBRELLA_R = 2600;

  // ---------------- smoke layer (three size buckets, own geometry each) --
  // three size buckets so the column has depth without shaders — every
  // bucket owns a SUBSET of the particles (round-robin) and its own
  // geometry, so nothing is drawn twice
  const BUCKET_SIZES = opts.lowSpec ? [900, 1500, 2200] : [700, 1250, 1900];
  const bucketIdx: number[][] = [[], [], []];
  for (let i = 0; i < SMOKE_N; i++) {
    bucketIdx[i % 3].push(i);
  }

  // per-particle simulation state (global indexing)
  const age = new Float32Array(SMOKE_N); // 0..1 life fraction
  const rise = new Float32Array(SMOKE_N); // life cycles per second
  const ang0 = new Float32Array(SMOKE_N);
  const swirl = new Float32Array(SMOKE_N);
  const wob = new Float32Array(SMOKE_N);
  const wobbleR = new Float32Array(SMOKE_N);
  for (let i = 0; i < SMOKE_N; i++) {
    age[i] = Math.random();
    rise[i] = 0.028 + Math.random() * 0.03; // ~17-35s per full column
    ang0[i] = Math.random() * Math.PI * 2;
    swirl[i] = 0.5 + Math.random() * 1.2;
    wob[i] = Math.random() * Math.PI * 2;
    wobbleR[i] = 60 + Math.random() * 190;
  }

  // per-bucket geometry: positions + ember-warm→ash-grey vertex colours
  const bucketPos: Float32Array[] = [];
  const bucketGeo: THREE.BufferGeometry[] = [];
  const smokeMats: THREE.PointsMaterial[] = [];
  const smokePoints: THREE.Points[] = [];
  for (let b = 0; b < 3; b++) {
    const n = bucketIdx[b].length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let j = 0; j < n; j++) {
      const i = bucketIdx[b][j];
      // base colour: ember-warm near the base -> ash grey up high
      const warm = 1 - age[i];
      col[j * 3] = 0.2 + 0.18 * warm;
      col[j * 3 + 1] = 0.17 + 0.08 * warm;
      col[j * 3 + 2] = 0.16 + 0.03 * warm;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      map: makeSmokeSprite(),
      size: BUCKET_SIZES[b],
      transparent: true,
      opacity: 0,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.visible = false;
    pts.renderOrder = 20 + b;
    scene.add(pts);
    bucketPos.push(pos);
    bucketGeo.push(geo);
    smokeMats.push(mat);
    smokePoints.push(pts);
  }

  // ---------------- spark layer ----------------
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_N * 3);
  const sparkAge = new Float32Array(SPARK_N);
  const sparkLife = new Float32Array(SPARK_N);
  const sparkVx = new Float32Array(SPARK_N);
  const sparkVz = new Float32Array(SPARK_N);
  const sparkVy = new Float32Array(SPARK_N);
  const POOL_R = 420; // sparks burst off the lava lake surface
  for (let i = 0; i < SPARK_N; i++) {
    sparkAge[i] = Math.random() * 2;
    sparkLife[i] = 1.1 + Math.random() * 1.4;
    sparkVx[i] = 0;
    sparkVz[i] = 0;
    sparkVy[i] = 260 + Math.random() * 420;
  }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: 0xffa03a,
    size: 130,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.visible = false;
  sparks.renderOrder = 24;
  scene.add(sparks);

  // group anchor: crater mouth, lerped so switching volcanoes glides
  const anchor = new THREE.Vector3();
  let anchored = false;
  let opacity = 0;
  let clock = 0;

  function respawnSpark(i: number): void {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * POOL_R;
    sparkPos[i * 3] = Math.cos(a) * r;
    sparkPos[i * 3 + 1] = 60 + Math.random() * 120;
    sparkPos[i * 3 + 2] = Math.sin(a) * r;
    sparkAge[i] = 0;
    sparkLife[i] = 1.1 + Math.random() * 1.4;
    sparkVx[i] = Math.cos(a) * (30 + Math.random() * 130);
    sparkVz[i] = Math.sin(a) * (30 + Math.random() * 130);
    sparkVy[i] = 260 + Math.random() * 420;
  }
  for (let i = 0; i < SPARK_N; i++) respawnSpark(i);

  function dispose(): void {
    for (const pts of smokePoints) scene.remove(pts);
    scene.remove(sparks);
    for (const geo of bucketGeo) geo.dispose();
    for (const mat of smokeMats) {
      mat.map?.dispose();
      mat.dispose();
    }
    sparkGeo.dispose();
    sparkMat.dispose();
  }

  function update(dt: number, playerX: number, playerZ: number): void {
    const nearVolcano = nearestVolcanoWorld(
      playerX,
      playerZ,
      opts.block,
      opts.gridOffset
    );

    const target = nearVolcano.has ? 0.88 * nearVolcano.glow : 0;
    opacity += (target - opacity) * Math.min(1, dt * 2.2);
    const visible = opacity > 0.015;
    for (const pts of smokePoints) pts.visible = visible;
    sparks.visible = visible && opacity > 0.05;
    if (!visible) return;

    clock += dt;

    // glide the anchor to the crater mouth (lava-lake surface + a bit)
    const baseY = opts.heightAt(nearVolcano.x, nearVolcano.z) + 240;
    if (!anchored) {
      anchor.set(nearVolcano.x, baseY, nearVolcano.z);
      anchored = true;
    } else {
      anchor.x += (nearVolcano.x - anchor.x) * Math.min(1, dt * 4);
      anchor.y += (baseY - anchor.y) * Math.min(1, dt * 4);
      anchor.z += (nearVolcano.z - anchor.z) * Math.min(1, dt * 4);
    }

    for (const pts of smokePoints) {
      pts.position.copy(anchor);
      (pts.material as THREE.PointsMaterial).opacity = opacity * 0.52;
    }
    sparks.position.copy(anchor);
    sparkMat.opacity = opacity * 0.95;

    // --- smoke: rise, spiral, umbrella out (per bucket geometry) ---
    for (let b = 0; b < 3; b++) {
      const pos = bucketPos[b];
      const idx = bucketIdx[b];
      for (let j = 0; j < idx.length; j++) {
        const i = idx[j];
        age[i] += rise[i] * dt;
        if (age[i] > 1) age[i] -= 1;
        const t = age[i];
        // column tightens slightly then umbrellas out with height
        const r =
          COL_R * (1 - 0.3 * Math.min(1, t * 4)) +
          Math.pow(t, 1.7) * UMBRELLA_R +
          Math.sin(clock * 0.6 + wob[i]) * wobbleR[i] * t;
        const a = ang0[i] + clock * swirl[i] * (0.35 + t * 0.8);
        pos[j * 3] = Math.cos(a) * r;
        pos[j * 3 + 1] = t * PLUME_TOP;
        pos[j * 3 + 2] = Math.sin(a) * r;
      }
      bucketGeo[b].attributes.position.needsUpdate = true;
    }

    // --- sparks: short bright bursts off the pool ---
    for (let i = 0; i < SPARK_N; i++) {
      sparkAge[i] += dt;
      if (sparkAge[i] > sparkLife[i]) {
        respawnSpark(i);
        continue;
      }
      sparkPos[i * 3] += sparkVx[i] * dt;
      sparkPos[i * 3 + 1] += sparkVy[i] * dt;
      sparkPos[i * 3 + 2] += sparkVz[i] * dt;
      sparkVy[i] -= 90 * dt; // gentle gravity arcs them over
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  return {
    update,
    debug: () => ({
      opacity,
      visible: smokePoints[0].visible,
      x: anchor.x,
      y: anchor.y,
      z: anchor.z,
    }),
    dispose,
  };
}
