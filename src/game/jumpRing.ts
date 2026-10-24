/**
 * jumpRing.ts — DOUBLE JUMP air-ring burst VFX for RATFIRE.
 *
 * When the player triggers the mid-air second jump, a flat energy ring
 * detonates right under their feet: an expanding, additive teal-green
 * halo that punches outward, drifts up slightly and fades inside half a
 * second. Reads as the jump jet "firing" — pure juice, zero gameplay
 * effect.
 *
 * Design notes:
 *  - horizontal plane (rotation.x = -PI/2) with a soft ring gradient —
 *    readable from the chase camera's high/low angles alike;
 *  - additive blending so the ring glows against any sky/terrain and
 *    needs no depth write (it may overlap the character harmlessly);
 *  - hue set by material.color over a NEUTRAL white-hot texture, so the
 *    tint stays pure (same trick as bulletSystem's per-weapon tracers);
 *  - tiny fixed pool (4, low-spec 2) — a new burst recycles the oldest;
 *  - `update(dt)` advances every live ring; call it once per frame.
 */

import * as THREE from 'three';

/* ------------------------------- tuning ---------------------------------- */
const RING_POOL = 4;
const RING_POOL_LOW = 2;
const RING_LIFE = 0.5; // s from burst to fully faded
const RING_SCALE_START = 16; // initial diameter (world units)
const RING_SCALE_END = 88; // final diameter
const RING_RISE = 10; // u/s upward drift while expanding
const RING_OPACITY = 0.95;
/** Teal-green energy hue — BUZZ's accent family, reads as "jump jet". */
const RING_COLOR = 0x6ff2c8;

/* --------------------------- procedural texture -------------------------- */

/** Soft energy ring: white-hot rim, quick inner + outer falloff. */
function ringTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // radial falloff: transparent center -> bright rim -> transparent edge
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grad.addColorStop(0.0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.32)');
    grad.addColorStop(0.8, 'rgba(255,255,255,0.95)'); // the hot rim
    grad.addColorStop(0.92, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

/* ------------------------------- types ----------------------------------- */

interface JumpRing {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  age: number;
  active: boolean;
}

export interface JumpRings {
  /** Detonate one ring at a world point (the jumper's feet). */
  burst(x: number, y: number, z: number): void;
  /** Advance every live ring. Call once per frame. */
  update(dt: number): void;
  /** Free GPU resources. */
  dispose(): void;
  stats(): { active: number };
  /** Verification probe: live state of every pool slot. */
  probe(): Array<{
    active: boolean;
    age: number;
    scale: number;
    opacity: number;
    pos: [number, number, number];
  }>;
}

/* ------------------------------- system ---------------------------------- */

export function createJumpRings(
  scene: THREE.Scene,
  opts: { lowSpec?: boolean } = {}
): JumpRings {
  const low = opts.lowSpec === true;
  const tex = ringTexture();
  const geo = new THREE.PlaneGeometry(1, 1);

  const rings: JumpRing[] = [];
  const poolSize = low ? RING_POOL_LOW : RING_POOL;
  for (let i = 0; i < poolSize; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: RING_COLOR,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2; // lie flat under the jumper's feet
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    rings.push({ mesh, age: 0, active: false });
  }
  let cursor = 0;

  function burst(x: number, y: number, z: number): void {
    // free slot first, else recycle the oldest ring (round-robin)
    let r: JumpRing | null = null;
    for (const cand of rings) {
      if (!cand.active) {
        r = cand;
        break;
      }
    }
    if (!r) {
      r = rings[cursor];
      cursor = (cursor + 1) % rings.length;
    }
    r.mesh.position.set(x, y, z);
    r.mesh.scale.setScalar(RING_SCALE_START);
    r.mesh.material.opacity = RING_OPACITY;
    r.age = 0;
    r.active = true;
    r.mesh.visible = true;
  }

  function update(dt: number): void {
    for (const r of rings) {
      if (!r.active) continue;
      r.age += dt;
      const t = Math.min(1, r.age / RING_LIFE);
      // punch out fast, settle into the final diameter (ease-out quad)
      const ease = 1 - (1 - t) * (1 - t);
      r.mesh.scale.setScalar(
        RING_SCALE_START + (RING_SCALE_END - RING_SCALE_START) * ease
      );
      // fade with a tail so the rim lingers a touch
      r.mesh.material.opacity = RING_OPACITY * Math.pow(1 - t, 1.7);
      r.mesh.position.y += RING_RISE * dt;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
      }
    }
  }

  function dispose(): void {
    for (const r of rings) {
      scene.remove(r.mesh);
      r.mesh.material.dispose();
    }
    geo.dispose();
    tex.dispose();
  }

  return {
    burst,
    update,
    dispose,
    stats: () => ({ active: rings.filter((r) => r.active).length }),
    probe: () =>
      rings.map((r) => ({
        active: r.active,
        age: Math.round(r.age * 1000) / 1000,
        scale: Math.round(r.mesh.scale.x),
        opacity: Math.round(r.mesh.material.opacity * 100) / 100,
        pos: [
          Math.round(r.mesh.position.x),
          Math.round(r.mesh.position.y),
          Math.round(r.mesh.position.z),
        ] as [number, number, number],
      })),
  };
}
