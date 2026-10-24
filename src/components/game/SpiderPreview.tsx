'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createDisplayPodium } from '@/components/game/displayPodium';
import { createSpiderPet } from '@/game/spiderPet';

/**
 * Live 3D WIDOW preview for the PET lobby panel — the robotic spider's
 * display room (BUZZ/DART/SPARK/SPOT's sibling).
 *
 * Shows the REAL procedural spider pet on the shared steel podium, and
 * because its whole rig is the follow brain + planted-foot crawl, the
 * room feeds it a VIRTUAL PLAYER point that circles the podium — WIDOW
 * skitters after it forever, so the panel itself proves the IK gait,
 * body bob and sensor scan work. The badge shows the live gait clip.
 *
 * Teardown disposes the model, the shared podium and the renderer so
 * open/close never leaks WebGL contexts.
 */

const CAMERA_FOV = 40;
const CAMERA_R = 400;
const CAMERA_Y = 150;
const LOOK_Y = 62;
const AUTO_ORBIT_SPEED = 0.3; // rad/s
const DRAG_SENSITIVITY = 0.008;

/** The virtual player the pet chases around the podium — a TIGHT circle
 *  so the crawling spider stays framed with the pedestal at all times. */
const CHASE_R = 66;
const CHASE_SPEED = 0.5; // rad/s → a steady skitter

export default function SpiderPreview() {
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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 5, 4000);

    // RATFIRE light language — the studio trio used by every display room
    const keyLight = new THREE.DirectionalLight(0xcfe8ff, 2.4);
    keyLight.position.set(-2.2, 3.2, 2.6).multiplyScalar(130);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xfbbf24, 1.7);
    rimLight.position.set(2.4, 2.4, -2.8).multiplyScalar(130);
    scene.add(rimLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const podium = createDisplayPodium(scene, renderer);

    // ===== the REAL spider pet, crawling after a virtual player =====
    let pet: Awaited<ReturnType<typeof createSpiderPet>> | null = null;
    const virtualPlayer = new THREE.Vector3();
    let chase = 0;
    let mounted = false;

    void createSpiderPet(scene, {
      heightAt: () => 0, // podium top is the ground plane
    })
      .then((built) => {
        if (cancelled) {
          built.dispose();
          return;
        }
        pet = built;
        // start mid-chase so the first frame is already crawling
        chase = Math.PI * 0.5;
        virtualPlayer
          .set(Math.sin(chase) * CHASE_R, 0, Math.cos(chase) * CHASE_R)
          .add(new THREE.Vector3(0, 0, 0));
        pet.group.position.set(
          Math.sin(chase + 0.9) * (CHASE_R + 80),
          0,
          Math.cos(chase + 0.9) * (CHASE_R + 80)
        );
        mounted = true;
        setClipLabel('Crawl');
      })
      .catch(() => {
        if (!cancelled) setClipLabel('model offline');
      });

    // ===== responsive sizing =====
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

    // ===== render loop =====
    const clock = new THREE.Clock();
    let raf = 0;
    let labelTick = 0;
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      if (pet && mounted) {
        chase += CHASE_SPEED * dt;
        virtualPlayer.set(
          Math.sin(chase) * CHASE_R,
          0,
          Math.cos(chase) * CHASE_R
        );
        // virtual facing: the point's own heading around the circle
        const yaw = chase + Math.PI / 2;
        pet.update(dt, virtualPlayer, yaw);
        labelTick += dt;
        if (labelTick > 0.4) {
          labelTick = 0;
          const clip = pet.debug().clip;
          setClipLabel((prev) => (prev === clip ? prev : clip));
        }
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

      pet?.dispose();
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
      {/* live gait badge — the panel proves the procedural rig works */}
      <p className="absolute right-3 top-3 border border-emerald-400/40 bg-zinc-950/80 px-2 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-emerald-300 backdrop-blur-sm">
        {clipLabel}
      </p>
    </div>
  );
}
