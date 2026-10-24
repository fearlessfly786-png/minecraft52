/**
 * spiderWeb.ts — WIDOW's silk: realistic flexible web strands.
 *
 * Pressing G makes the deployed robotic spider fire a silk strand at
 * whatever the player is aiming at. The strand is a VERLET ROPE — a
 * chain of particles integrated with gravity, damping and distance
 * constraints — so it flies, trails, snaps taut, sags under its own
 * weight and swings exactly like real silk:
 *
 *   FLIGHT   the tip is a ballistic projectile (fast, slight drop);
 *            inner points are dragged behind it follow-the-leader
 *            style, drawing a natural whipping curve in the air.
 *   STICK    the tip pins to the first surface the segment crosses
 *            (terrain probe supplies hit + surface normal), a silk
 *            splat blob stamps the anchor, rest length is set to shot
 *            distance × 1.1 — so the strand arrives with REAL slack
 *            and settles into a hanging catenary while its mouth end
 *            stays pinned to the spider (it follows the spider live).
 *            AND the anchor BLOOMS into a full orb web: 8 radial
 *            spokes + 4 concentric rings of inward-sagging silk arcs
 *            woven outward on the surface plane (spokes first, then
 *            ring by ring) — the classic web silhouette.
 *   MISS     past max reach the tip reels back to the spider and the
 *            strand despawns — no web hangs from the sky.
 *   FADE     stuck webs hold ~6s, then thin out and release.
 *
 * Rendering is a THREE.TubeGeometry rebuilt along a Catmull-Rom curve
 * through the rope every frame (a few hundred verts per strand —
 * trivial), with a silk MeshStandardMaterial (ivory, low roughness)
 * so sunlight catches the strand. At most `maxActive` strands live at
 * once; the oldest is cut when a new shot fires.
 *
 * ZERO assets, no per-frame allocations beyond the tube rebuild, and
 * dispose() frees everything.
 */

import * as THREE from 'three';

/** Probe a moving segment against the world; returns the hit point or
 *  null. (page.tsx supplies a terrain-march implementation.) When the
 *  probe can compute a surface normal it writes it into `outNormal` —
 *  the orb web lies flat against whatever it sticks to. */
export type WebHitTest = (
  from: THREE.Vector3,
  to: THREE.Vector3,
  outNormal?: THREE.Vector3
) => THREE.Vector3 | null;

export interface SpiderWebOptions {
  /** Webs are added/removed here automatically. */
  scene: THREE.Scene;
  /** World probe used to decide where a flying strand sticks. */
  hitTest: WebHitTest;
  /** Fired whenever a strand anchors to the world (for the splat SFX). */
  onStick?: () => void;
  /** Fired when the anchor starts weaving its orb web (weave SFX). */
  onBloom?: () => void;
  /** Max concurrent strands (oldest is cut when exceeded). */
  maxActive?: number;
}

export interface SpiderWebHandle {
  /** Fire one strand from `origin` along `dir` (dir need not be unit). */
  shoot(origin: THREE.Vector3, dir: THREE.Vector3): void;
  /** Advance every strand one tick. `mouth` = the spider's live mouth
   *  world position (null → strands detach from a gone spider and fall). */
  update(dt: number, mouth: THREE.Vector3 | null): void;
  /** Free everything. */
  dispose(): void;
  /** Live probe for debug surfaces + automated verification. */
  debug(): {
    active: number;
    states: string[];
    webs: { age: number; woven: number }[];
    stuck: { x: number; y: number; z: number }[];
  };
}

// ------------------------------------------------------------------
// tuning (world units — the player stands 190 tall, spider reach 620)
// ------------------------------------------------------------------
const SEGMENTS = 20; // rope particles per strand
const TUBE_R = 1.15; // silk strand radius
const TIP_SPEED = 1350; // launch speed (u/s)
const REACH = 620; // max shot distance
const FLIGHT_GRAV = 240; // tip drop while flying (u/s²) — silk is light
const ROPE_GRAV = 560; // settled-rope gravity (u/s²)
const DAMPING = 0.985; // verlet velocity retention
const FLIGHT_GAP = 30; // trailing spacing while airborne
const SAG = 1.1; // stuck rest length = shot distance × this (10% slack)
const STICK_HOLD = 6; // seconds a stuck strand stays anchored
const FADE_TIME = 0.7; // seconds to thin out before release
const RETRACT_SPEED = 950; // reel-in speed after a miss
const SOLVE_ITERS = 5; // constraint iterations per tick

// ---- orb web bloom (the classic radial web at the anchor) ----
const SPOKES = 8; // radial scaffold spokes per web (like a real orb web)
const RING_FRACTIONS = [0.34, 0.57, 0.79, 0.97]; // ring radii × web R
const RING_SAG = 0.13; // arcs bow inward between spokes (real silk sag)
const WEB_R_FRAC = 0.34; // web radius = shot distance × this
const WEB_R_MIN = 56; // …clamped so point-blank shots still read
const WEB_R_MAX = 118; // …and far shots don't engulf the horizon
const SPOKE_TUBE_R = 1.4; // spokes are the thicker scaffold silk
const RING_TUBE_R = 1.05; // spiral catch-silk is finer
const RADIAL_SEG = 5; // tube cross-section resolution
const SPOKE_TUB = 10; // tube length segments per spoke
const ARC_TUB = 8; // tube length segments per ring arc
const ARC_PTS = 9; // curve samples per ring arc
const BLOOM_SPOKE_DUR = 0.34; // seconds per spoke to shoot out
const BLOOM_SPOKE_STAG = 0.035; // spoke-to-spoke stagger
const BLOOM_RING0 = 0.4; // first spiral ring starts after the spokes
const BLOOM_RING_GAP = 0.2; // ring-to-ring stagger
const BLOOM_ARC_STAG = 0.04; // arc-to-arc stagger around a ring
const BLOOM_ARC_DUR = 0.22; // seconds per arc to weave in
const POP_TIME = 0.55; // web "pop" scale overshoot after sticking
const BLOOM_TOTAL =
  BLOOM_RING0 +
  (RING_FRACTIONS.length - 1) * BLOOM_RING_GAP +
  (SPOKES - 1) * BLOOM_ARC_STAG +
  BLOOM_ARC_DUR;

type StrandState = 'fly' | 'stuck' | 'retract' | 'fade';

/** A woven orb web anchored at a stuck strand's tip: ONE merged tube
 *  geometry (all spokes + ring arcs) played back through index
 *  drawRange along a per-strand weave timeline. Built once — zero
 *  per-frame allocation afterwards. */
interface OrbWeb {
  group: THREE.Group;
  geo: THREE.BufferGeometry;
  /** index count / start time / duration per woven strand, in the
   *  merged (completion-ordered) sequence */
  counts: number[];
  starts: number[];
  durs: number[];
  age: number;
}

interface Strand {
  state: StrandState;
  pos: THREE.Vector3[];
  prev: THREE.Vector3[];
  restGap: number;
  age: number; // seconds in the current state
  stuckAt: THREE.Vector3;
  // rendering
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  blob: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  /** orb web woven at the anchor (only once stuck) */
  web: OrbWeb | null;
}

export function createSpiderWeb(opts: SpiderWebOptions): SpiderWebHandle {
  const { scene, hitTest, onStick, onBloom } = opts;
  const maxActive = opts.maxActive ?? 3;
  const strands: Strand[] = [];

  const silkBase = new THREE.MeshStandardMaterial({
    color: 0xf2eee2, // dry spider silk — warm ivory
    roughness: 0.38,
    metalness: 0.05,
    transparent: true,
    opacity: 0.95,
  });
  const blobGeo = new THREE.SphereGeometry(9, 10, 8);
  blobGeo.scale(1, 0.45, 1); // squashed splat

  // scratch (module-level — reused by every strand every frame)
  const tmpA = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const UP_VEC = new THREE.Vector3(0, 1, 0);

  function makeStrand(origin: THREE.Vector3, dir: THREE.Vector3): Strand {
    const pos: THREE.Vector3[] = [];
    const prev: THREE.Vector3[] = [];
    // lay the rope bunched behind the tip so flight pulls it OUT of the
    // spinneret — the classic web-shot whip
    for (let i = 0; i < SEGMENTS; i++) {
      const p = origin
        .clone()
        .addScaledVector(dir, (SEGMENTS - 1 - i) * 2.2);
      pos.push(p);
      prev.push(p.clone());
    }
    const mat = silkBase.clone();
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.renderOrder = 4;
    const blob = new THREE.Mesh(blobGeo, mat);
    blob.visible = false;
    blob.castShadow = false;
    const curve = new THREE.CatmullRomCurve3(pos, false, 'catmullrom', 0.4);
    return {
      state: 'fly',
      pos,
      prev,
      restGap: FLIGHT_GAP,
      age: 0,
      stuckAt: new THREE.Vector3(),
      mesh,
      mat,
      blob,
      curve,
      web: null,
    };
  }

  /** Launch impulse: the tip becomes a projectile along `dir`. */
  function launchTip(
    s: Strand,
    origin: THREE.Vector3,
    dir: THREE.Vector3
  ): void {
    const tip = s.pos[SEGMENTS - 1];
    tip.copy(origin);
    s.prev[SEGMENTS - 1].copy(origin).addScaledVector(dir, -TIP_SPEED / 60);
  }

  /** Rebuild the tube along the current rope shape. */
  function rebuildTube(s: Strand): void {
    // guard against coincident points (NaN tube) right at launch
    for (let i = 1; i < SEGMENTS; i++) {
      if (s.pos[i].distanceToSquared(s.pos[i - 1]) < 0.01) {
        s.pos[i].x += 0.1 * i;
      }
    }
    s.curve.points = s.pos;
    const old = s.mesh.geometry;
    s.mesh.geometry = new THREE.TubeGeometry(s.curve, 22, TUBE_R, 5, false);
    old.dispose();
  }

  /** One symmetric verlet pass: gravity + inertia + distance constraints.
   *  Point 0 follows the spider's mouth, the tip stays pinned to
   *  `stuckAt` while stuck — pinned points never move, everything
   *  between sags, swings and snaps realistically. */
  function solveRope(s: Strand, dt: number, mouth: THREE.Vector3 | null): void {
    const g = ROPE_GRAV * dt * dt;
    for (let i = 0; i < SEGMENTS; i++) {
      const p = s.pos[i];
      const pr = s.prev[i];
      const pinned = (i === 0 && !!mouth) || (i === SEGMENTS - 1 && s.state === 'stuck');
      if (pinned) {
        if (i === 0 && mouth) {
          pr.copy(p);
          p.copy(mouth);
        }
        continue;
      }
      const vx = (p.x - pr.x) * DAMPING;
      const vy = (p.y - pr.y) * DAMPING;
      const vz = (p.z - pr.z) * DAMPING;
      pr.copy(p);
      p.x += vx;
      p.y += vy - g;
      p.z += vz;
    }
    // distance constraints — symmetric relax toward rest length
    for (let k = 0; k < SOLVE_ITERS; k++) {
      for (let i = 0; i < SEGMENTS - 1; i++) {
        const a = s.pos[i];
        const b = s.pos[i + 1];
        tmpA.subVectors(b, a);
        const d = tmpA.length() || 0.0001;
        const diff = ((d - s.restGap) / d) * 0.5;
        const aPinned = i === 0 && !!mouth;
        const bPinned = i + 1 === SEGMENTS - 1 && s.state === 'stuck';
        if (!aPinned && !bPinned) {
          a.addScaledVector(tmpA, diff);
          b.addScaledVector(tmpA, -diff);
        } else if (aPinned && !bPinned) {
          b.addScaledVector(tmpA, -diff * 2);
        } else if (!aPinned && bPinned) {
          a.addScaledVector(tmpA, diff * 2);
        }
      }
    }
  }

  /** Follow-the-leader flight pass: the tip advances ballistically, every
   *  inner point is pulled to `FLIGHT_GAP` behind the next — a chain that
   *  trails and whips without stretching the strand taut mid-air. */
  function flyStep(s: Strand, dt: number, mouth: THREE.Vector3 | null): void {
    const tip = s.pos[SEGMENTS - 1];
    const tipPrev = s.prev[SEGMENTS - 1];
    // ballistic tip (verlet on the tip only)
    const vx = (tip.x - tipPrev.x) * 0.995;
    const vy = (tip.y - tipPrev.y) * 0.995 - FLIGHT_GRAV * dt * dt;
    const vz = (tip.z - tipPrev.z) * 0.995;
    tipPrev.copy(tip);
    tip.x += vx;
    tip.y += vy;
    tip.z += vz;
    // drag the chain behind the tip, mouth-end pinned to the spider
    if (mouth) {
      s.pos[0].copy(mouth);
      s.prev[0].copy(mouth);
    }
    for (let i = SEGMENTS - 2; i >= 1; i--) {
      tmpA.subVectors(s.pos[i], s.pos[i + 1]);
      const d = tmpA.length() || 0.0001;
      s.pos[i].addScaledVector(tmpA, (FLIGHT_GAP - d) / d);
    }
  }

  /** easeOutBack — the little overshoot when the web pops open. */
  function easeOutBack(t: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const u = t - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
  }

  /** Weave the classic orb web onto the surface the strand stuck to:
   *  8 radial scaffold spokes out of the impact point + 4 concentric
   *  rings of inward-sagging catch-silk arcs (silk sags between spokes
   *  exactly like a real orb web), with a touch of per-web randomness
   *  so no two webs read identical. Every strand is a tiny
   *  TubeGeometry merged into ONE BufferGeometry in completion order;
   *  the weave plays back by growing the mesh's index drawRange along
   *  the same timeline — spokes shoot out first, then the spiral
   *  ripples in ring by ring. Built once, zero per-frame allocation. */
  function makeOrbWeb(
    hit: THREE.Vector3,
    normal: THREE.Vector3,
    dist: number,
    mat: THREE.MeshStandardMaterial
  ): OrbWeb {
    const n = normal.clone();
    const radius =
      THREE.MathUtils.clamp(dist * WEB_R_FRAC, WEB_R_MIN, WEB_R_MAX) *
      (0.92 + Math.random() * 0.16);
    // web-plane basis from the surface normal, random yaw for variety
    const ref =
      Math.abs(n.y) > 0.92
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(ref, n).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
    const phi = Math.random() * Math.PI * 2;
    const dirAt = (ang: number): THREE.Vector3 =>
      new THREE.Vector3()
        .copy(t1)
        .multiplyScalar(Math.cos(ang))
        .addScaledVector(t2, Math.sin(ang));

    // every woven strand: a tube + when it finishes weaving
    const parts: {
      g: THREE.BufferGeometry;
      start: number;
      dur: number;
    }[] = [];
    for (let k = 0; k < SPOKES; k++) {
      const ang =
        phi + (k / SPOKES) * Math.PI * 2 + (Math.random() - 0.5) * 0.06;
      const dir = dirAt(ang).multiplyScalar(radius * 1.06); // tips poke past the last ring
      const line = new THREE.LineCurve3(new THREE.Vector3(), dir);
      parts.push({
        g: new THREE.TubeGeometry(
          line,
          SPOKE_TUB,
          SPOKE_TUBE_R,
          RADIAL_SEG,
          false
        ),
        start: k * BLOOM_SPOKE_STAG,
        dur: BLOOM_SPOKE_DUR,
      });
    }
    for (let j = 0; j < RING_FRACTIONS.length; j++) {
      const rj =
        radius * RING_FRACTIONS[j] * (1 + (Math.random() - 0.5) * 0.05);
      const sag = RING_SAG + (Math.random() - 0.5) * 0.04;
      for (let a = 0; a < SPOKES; a++) {
        const a1 = phi + (a / SPOKES) * Math.PI * 2;
        const a2 = phi + ((a + 1) / SPOKES) * Math.PI * 2;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < ARC_PTS; i++) {
          const t = i / (ARC_PTS - 1);
          const rr = rj * (1 - sag * Math.sin(Math.PI * t));
          pts.push(dirAt(a1 + (a2 - a1) * t).multiplyScalar(rr));
        }
        parts.push({
          g: new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(pts),
            ARC_TUB,
            RING_TUBE_R,
            RADIAL_SEG,
            false
          ),
          start: BLOOM_RING0 + j * BLOOM_RING_GAP + a * BLOOM_ARC_STAG,
          dur: BLOOM_ARC_DUR,
        });
      }
    }
    // merge in completion order so ONE growing drawRange plays the weave
    parts.sort((p, q) => p.start + p.dur - (q.start + q.dur));
    let vTotal = 0;
    let iTotal = 0;
    for (const p of parts) {
      vTotal += p.g.attributes.position.count;
      iTotal += p.g.index!.count;
    }
    const posArr = new Float32Array(vTotal * 3);
    const norArr = new Float32Array(vTotal * 3);
    const uvArr = new Float32Array(vTotal * 2);
    const idxArr = new (vTotal > 65535 ? Uint32Array : Uint16Array)(iTotal);
    const counts: number[] = [];
    const starts: number[] = [];
    const durs: number[] = [];
    let vOff = 0;
    let iOff = 0;
    for (const p of parts) {
      posArr.set(p.g.attributes.position.array as Float32Array, vOff * 3);
      norArr.set(p.g.attributes.normal.array as Float32Array, vOff * 3);
      uvArr.set(p.g.attributes.uv.array as Float32Array, vOff * 2);
      const idx = p.g.index!;
      for (let i = 0; i < idx.count; i++)
        idxArr[iOff + i] = idx.getX(i) + vOff;
      counts.push(idx.count);
      starts.push(p.start);
      durs.push(p.dur);
      iOff += idx.count;
      vOff += p.g.attributes.position.count;
      p.g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(norArr, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
    geo.setDrawRange(0, 0); // the weave grows this
    const mesh = new THREE.Mesh(geo, mat); // shares the strand material → fades together
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    const group = new THREE.Group();
    group.position.copy(hit).addScaledVector(n, 1.0); // a hair off the surface
    group.add(mesh);
    return { group, geo, counts, starts, durs, age: 0 };
  }

  /** Play the weave: grow the drawRange along the timeline + the
   *  little elastic pop as the web snaps taut. */
  function updateOrbWeb(w: OrbWeb, step: number): void {
    w.age += step;
    let vis = 0;
    for (let k = 0; k < w.counts.length; k++) {
      const f = (w.age - w.starts[k]) / w.durs[k];
      if (f >= 1) {
        vis += w.counts[k];
      } else if (f > 0) {
        vis += Math.floor((f * w.counts[k]) / 6) * 6;
        break; // strands complete in merge order — prefix reveal only
      } else {
        break;
      }
    }
    w.geo.setDrawRange(0, vis);
    const t = Math.min(1, w.age / POP_TIME);
    w.group.scale.setScalar(0.7 + 0.3 * easeOutBack(t));
  }

  function killStrand(s: Strand): void {
    if (s.web) {
      scene.remove(s.web.group);
      s.web.geo.dispose();
      s.web = null;
    }
    s.mesh.geometry.dispose();
    s.mat.dispose();
    scene.remove(s.mesh);
    scene.remove(s.blob);
  }

  function shoot(origin: THREE.Vector3, dir: THREE.Vector3): void {
    // hard cap: cut the oldest strand when a new shot fires
    while (strands.length >= maxActive) {
      const old = strands.shift();
      if (old) killStrand(old);
    }
    const s = makeStrand(origin, dir);
    launchTip(s, origin, dir);
    scene.add(s.mesh);
    strands.push(s);
  }

  function update(dt: number, mouth: THREE.Vector3 | null): void {
    const step = Math.min(dt, 1 / 20); // clamp frame spikes
    for (let i = strands.length - 1; i >= 0; i--) {
      const s = strands[i];
      s.age += step;
      if (s.web) updateOrbWeb(s.web, step);

      if (s.state === 'fly') {
        flyStep(s, step, mouth);
        // tip crossed a surface? → STICK
        const tip = s.pos[SEGMENTS - 1];
        const tipPrev = s.prev[SEGMENTS - 1];
        tmpN.set(0, 0, 0);
        const hit = hitTest(tipPrev, tip, tmpN);
        if (hit) {
          s.state = 'stuck';
          s.age = 0;
          s.stuckAt.copy(hit);
          tip.copy(hit);
          s.prev[SEGMENTS - 1].copy(hit);
          // shot distance → rest length with 10% slack so the strand
          // arrives alive: it dips, swings, then settles
          const dist = mouth
            ? mouth.distanceTo(hit)
            : s.pos[0].distanceTo(hit);
          s.restGap = Math.max(9, (dist * SAG) / (SEGMENTS - 1));
          if (tmpN.lengthSq() < 0.5) tmpN.set(0, 1, 0); // no probe normal
          // silk splat + the orb web bloom, both lying on the surface
          s.blob.position.copy(hit).addScaledVector(tmpN, 1.4);
          s.blob.quaternion.setFromUnitVectors(UP_VEC, tmpN);
          s.blob.visible = true;
          scene.add(s.blob);
          s.web = makeOrbWeb(hit, tmpN, dist, s.mat);
          scene.add(s.web.group);
          onBloom?.();
          onStick?.();
        } else if (
          s.age > REACH / TIP_SPEED + 0.12 ||
          (mouth && mouth.distanceTo(tip) > REACH * 1.06)
        ) {
          s.state = 'retract';
          s.age = 0;
          s.blob.visible = false;
        }
      } else if (s.state === 'stuck') {
        solveRope(s, step, mouth);
        if (s.age > STICK_HOLD) {
          s.state = 'fade';
          s.age = 0;
        }
      } else if (s.state === 'retract') {
        // reel the tip home; the chain follows follow-the-leader style
        const tip = s.pos[SEGMENTS - 1];
        if (mouth) {
          tmpA.subVectors(mouth, tip);
          const d = tmpA.length();
          if (d < 70) {
            killStrand(s);
            strands.splice(i, 1);
            continue;
          }
          tip.addScaledVector(
            tmpA.normalize(),
            Math.min(d, RETRACT_SPEED * step)
          );
        } else {
          // spider gone: just fall out and fade quickly
          s.state = 'fade';
          s.age = 0;
        }
        if (mouth) {
          s.pos[0].copy(mouth);
          for (let k = SEGMENTS - 2; k >= 1; k--) {
            tmpA.subVectors(s.pos[k], s.pos[k + 1]);
            const d2 = tmpA.length() || 0.0001;
            s.pos[k].addScaledVector(tmpA, (FLIGHT_GAP - d2) / d2);
          }
        }
      } else {
        // fade: thin out in place, rope keeps sagging gently
        solveRope(s, step, mouth);
        const k = 1 - s.age / FADE_TIME;
        s.mat.opacity = 0.95 * Math.max(0, k);
        if (s.age >= FADE_TIME) {
          killStrand(s);
          strands.splice(i, 1);
          continue;
        }
      }

      rebuildTube(s);
    }
  }

  function dispose(): void {
    for (const s of strands) killStrand(s);
    strands.length = 0;
    silkBase.dispose();
    blobGeo.dispose();
  }

  function debug(): {
    active: number;
    states: string[];
    webs: { age: number; woven: number }[];
    stuck: { x: number; y: number; z: number }[];
  } {
    return {
      active: strands.length,
      states: strands.map((s) => s.state),
      webs: strands
        .filter((s) => s.web)
        .map((s) => ({
          age: Number(s.web!.age.toFixed(2)),
          woven: Number(Math.min(1, s.web!.age / BLOOM_TOTAL).toFixed(2)),
        })),
      stuck: strands
        .filter((s) => s.state === 'stuck' || s.web)
        .map((s) => ({
          x: Number(s.stuckAt.x.toFixed(1)),
          y: Number(s.stuckAt.y.toFixed(1)),
          z: Number(s.stuckAt.z.toFixed(1)),
        })),
    };
  }

  return { shoot, update, dispose, debug };
}
