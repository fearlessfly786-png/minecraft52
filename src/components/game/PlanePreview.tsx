'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createPlaneDrone, type PlaneDrone } from '@/game/planeDrone';
import { createDisplayPodium } from '@/components/game/displayPodium';

/**
 * Live 3D PLANE preview for the PET lobby panel (DART, the fixed-wing
 * strike pet).
 *
 * Sibling of DronePreview: a self-contained Three.js scene (own canvas +
 * WebGL context, alpha transparent so the panel glass shows through)
 * showing the REAL DART airframe — the exact planeDrone.ts model — flying
 * its genuine plane brain (a plane can never hover) in a tight circle
 * centred directly over the display podium (the shared 4-piece photo-scanned
 * steel pedestal from displayPodium.ts), so every pet display room reads as
 * one and the same dressing room with its piece parked at the podium
 * CENTRE. The banking, coordinated turn, bob and propeller RPM all come
 * from planeDrone's own flight logic, not an animation fake.
 *
 * Silent by design: planeDrone creates no audio.
 *
 * Teardown disposes the airframe, the shared podium and the renderer so
 * open/close never leaks WebGL contexts.
 */

/** Camera framing: slow auto-orbit at this radius/height, drag to steer.
 *  Same dressing-room composition as DronePreview: pedestal low in frame,
 *  display piece centred above it. */
const CAMERA_FOV = 40;
const CAMERA_R = 265;
const CAMERA_Y = 95;
const LOOK_Y = 48;
const AUTO_ORBIT_SPEED = 0.3; // rad/s
const DRAG_SENSITIVITY = 0.008;

/** DART's display circle, centred on the podium CENTRE: the steel disc is
 *  r=80, so this tight radius keeps the whole coordinated turn hovering
 *  above the pedestal — the strike plane on centre display, never swinging
 *  off past the edge. (A plane can never hover, so centre = tight circle.) */
const DISPLAY_ORBIT_R = 34;
const DISPLAY_HOVER_Y = 58;

/** Character-panel studio lights, rescaled to this world (directional lights
 *  only care about direction — the multiply just keeps magnitudes sane). */
const LIGHT_SCALE = 130;

export default function PlanePreview() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    // Alpha-transparent like the dressing room: the panel glass gradient
    // shows through instead of a solid backdrop.
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 5, 4000);

    // RATFIRE light language — the CHARACTER panel's exact studio trio:
    // cool key from the front-left, warm amber rim from behind-right, soft
    // ambient fill. One light language across all display rooms.
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

    // The REAL DART airframe — its own brain flies a tight coordinated
    // circle pinned to the podium CENTRE from the very first frame
    // (deterministic orbit: no spring pre-warm needed).
    const plane: PlaneDrone = createPlaneDrone(scene, {
      lowSpec: true,
      orbitRadius: DISPLAY_ORBIT_R,
      hoverHeight: DISPLAY_HOVER_Y,
    });

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
      // Synthetic events (tests) carry inactive pointer ids — ignore the
      // DOMException instead of surfacing it as an unhandled error.
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

    // ===== render loop: fly the plane's own brain around the podium =====
    const clock = new THREE.Clock();
    const origin = new THREE.Vector3(); // the podium center

    let raf = 0;
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      // The plane brain banks its coordinated circle around the podium
      // CENTRE — velocity-aligned nose, bank, bob and prop RPM are
      // genuine logic.
      plane.update(dt, origin);

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
      cancelAnimationFrame(raf);
      observer.disconnect();
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', endDrag);
      container.removeEventListener('pointerleave', endDrag);

      // Full teardown so open/close never leaks WebGL contexts.
      plane.dispose();
      podium.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      aria-hidden="true"
    />
  );
}
