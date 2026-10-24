'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createDisplayPodium } from '@/components/game/displayPodium';
import { applySparkCostume } from '@/game/sparkCostume';

/**
 * Live 3D ROBOT preview for the PET lobby panel — SPARK's display room.
 *
 * The robot sibling of DronePreview / PlanePreview: a self-contained
 * Three.js scene (own canvas + WebGL context, alpha transparent so the
 * panel glass shows through) showing the REAL RobotExpressive.glb pet —
 * the exact skinned model that trots beside you in game — standing at
 * the CENTRE of the SAME display podium the CHARACTER panel uses (the
 * shared 4-piece photo-scanned steel pedestal from displayPodium.ts).
 *
 * Instead of a static idle pose the room PLAYS THE INSTALLED RIG: the
 * six pet clips cycle forever — Idle → Walking → Running → Jump →
 * Punch → Death (held, then a revive) — with the current clip name
 * pinned in the corner, so the panel itself proves the animations work.
 *
 * Teardown disposes the model, the shared podium and the renderer so
 * open/close never leaks WebGL contexts.
 */

/** The six clips the pet installs, in showcase order, with how long the
 *  room dwells on each (seconds) before crossfading to the next. */
const SHOWCASE: Array<{ clip: string; dwell: number }> = [
  { clip: 'Idle', dwell: 3.2 },
  { clip: 'Walking', dwell: 3.0 },
  { clip: 'Running', dwell: 3.0 },
  { clip: 'Jump', dwell: 1.9 },
  { clip: 'Punch', dwell: 1.6 },
  { clip: 'Death', dwell: 3.0 },
];

/** Robot display height (world units, game scale — matches robotPet). */
const ROBOT_HEIGHT = 112;

/** Camera framing: slow auto-orbit at this radius/height, drag to steer.
 *  Frames the full robot with the pedestal low in the composition. */
const CAMERA_FOV = 40;
const CAMERA_R = 300;
const CAMERA_Y = 100;
const LOOK_Y = 56;
const AUTO_ORBIT_SPEED = 0.3; // rad/s
const DRAG_SENSITIVITY = 0.008;

/** Crossfade seconds between showcase clips. */
const FADE = 0.25;

/** Character-panel studio lights, rescaled to this world. */
const LIGHT_SCALE = 130;

export default function RobotPreview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [clipLabel, setClipLabel] = useState('loading…');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    // Alpha-transparent like the dressing room: the panel glass gradient
    // shows through instead of a solid backdrop.
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 5, 4000);

    // RATFIRE light language — the CHARACTER panel's exact studio trio.
    const keyLight = new THREE.DirectionalLight(0xcfe8ff, 2.4);
    keyLight.position.set(-2.2, 3.2, 2.6).multiplyScalar(LIGHT_SCALE);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xfbbf24, 1.7);
    rimLight.position.set(2.4, 2.4, -2.8).multiplyScalar(LIGHT_SCALE);
    scene.add(rimLight);
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    // ===== the CHARACTER panel's PBR steel podium (shared module) =====
    const podium = createDisplayPodium(scene, renderer);

    // ===== the REAL pet robot, scaled to game size, feet on the pad =====
    let model: THREE.Object3D | null = null;
    let costume: ReturnType<typeof applySparkCostume> | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    const actions = new Map<string, THREE.AnimationAction>();
    let current: THREE.AnimationAction | null = null;
    let currentIndex = 0;
    let dwell = 0;

    const load = async () => {
      try {
        const gltf = await new GLTFLoader().loadAsync(
          '/models/gltf/RobotExpressive/RobotExpressive.glb'
        );
        if (cancelled) return;
        model = gltf.scene;

        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        model.scale.setScalar(ROBOT_HEIGHT / Math.max(0.0001, size.y));
        box.setFromObject(model);
        model.position.y -= box.min.y;
        scene.add(model);

        // the MAGMA VANGUARD suit — same one the in-game pet wears
        costume = applySparkCostume(model);

        mixer = new THREE.AnimationMixer(model);
        for (const step of SHOWCASE) {
          const clip = gltf.animations.find((c) => c.name === step.clip);
          if (!clip) continue;
          const action = mixer.clipAction(clip);
          action.setLoop(
            step.clip === 'Death' || step.clip === 'Jump' || step.clip === 'Punch'
              ? THREE.LoopOnce
              : THREE.LoopRepeat,
            Infinity
          );
          action.clampWhenFinished = true;
          actions.set(step.clip, action);
        }
        const first = actions.get(SHOWCASE[0].clip);
        if (first) {
          first.play();
          current = first;
        }
        setClipLabel(SHOWCASE[0].clip);
      } catch {
        if (!cancelled) setClipLabel('model offline');
      }
    };
    void load();

    /** Crossfade the showcase onto the next clip in the cycle. */
    const advance = () => {
      currentIndex = (currentIndex + 1) % SHOWCASE.length;
      const step = SHOWCASE[currentIndex];
      const next = actions.get(step.clip);
      if (!next || !current) return;
      next.reset().fadeIn(FADE).play();
      current.fadeOut(FADE);
      current = next;
      dwell = 0;
      setClipLabel(step.clip);
    };

    // ===== responsive sizing: canvas fills the container at any dpr =====
    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // ===== pointer drag to orbit + gentle auto orbit =====
    let dragging = false;
    let lastX = 0;
    let azimuth = 0.8;
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      try {
        container.setPointerCapture?.(event.pointerId);
      } catch {
        /* no active pointer — dragging still works via pointermove */
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      azimuth -= dx * DRAG_SENSITIVITY;
    };
    const endDrag = () => {
      dragging = false;
    };
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', endDrag);
    container.addEventListener('pointerleave', endDrag);

    // ===== render loop: play the installed clip cycle on the podium =====
    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      mixer?.update(dt);
      if (current) {
        dwell += dt;
        const step = SHOWCASE[currentIndex];
        const finished =
          current.loop === THREE.LoopOnce &&
          current.time >= current.getClip().duration - 0.001;
        // finished one-shots hand over early — except Death, which holds
        // the fallen pose for a beat before the revive crossfade
        const doneGate = step.clip === 'Death' ? 2.6 : 0.9;
        if (dwell >= step.dwell || (finished && dwell >= doneGate)) advance();
      }

      if (!dragging) azimuth += AUTO_ORBIT_SPEED * dt;
      camera.position.set(
        Math.sin(azimuth) * CAMERA_R,
        CAMERA_Y,
        Math.cos(azimuth) * CAMERA_R
      );
      camera.lookAt(0, LOOK_Y, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', endDrag);
      container.removeEventListener('pointerleave', endDrag);

      // Full teardown so open/close never leaks WebGL contexts.
      costume?.dispose();
      if (model) {
        mixer?.stopAllAction();
        mixer?.uncacheRoot(model);
        scene.remove(model);
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.geometry.dispose();
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            for (const mat of mats) mat.dispose();
          }
        });
      }
      podium.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        aria-hidden="true"
      />
      {/* current showcase clip — the panel proves the animation rig live */}
      <p className="absolute right-3 top-3 border border-emerald-400/40 bg-zinc-950/80 px-2 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-emerald-300 backdrop-blur-sm">
        {clipLabel}
      </p>
    </div>
  );
}
