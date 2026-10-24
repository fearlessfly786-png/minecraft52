/**
 * VOLCANIC EMBERS for RATFIRE — the volcano biome's own weather (the hot
 * sibling of the winter snowfall): a drifting swarm of glowing orange
 * sparks that rise off the ground and wobble through the air around the
 * player, fading with the volcano factor. Recycled relative to the
 * player each frame (like the rain/snow systems), additive-blended so
 * they burn bright against the dark basalt — especially at night.
 */

import * as THREE from 'three';

export interface EmbersHandle {
  /** Per-frame: swarm follows the player, intensity drives the glow. */
  update(dt: number, playerPos: THREE.Vector3, intensity: number): void;
  dispose(): void;
}

export function createEmbers(scene: THREE.Scene, count?: number): EmbersHandle {
  const N = count ?? 240;

  // local-space swarm: x/z spread around the player, y cycling as embers
  // rise from the ground up past the camera
  const SPREAD = 520; // horizontal radius around the player
  const RISE = 320; // vertical cycle height

  const positions = new Float32Array(N * 3);
  const baseX = new Float32Array(N);
  const baseZ = new Float32Array(N);
  const speed = new Float32Array(N);
  const sway = new Float32Array(N);
  const swayR = new Float32Array(N);

  function respawn(i: number, randomY: boolean): void {
    baseX[i] = (Math.random() * 2 - 1) * SPREAD;
    baseZ[i] = (Math.random() * 2 - 1) * SPREAD;
    positions[i * 3 + 1] = randomY ? Math.random() * RISE : 0;
    speed[i] = 24 + Math.random() * 36;
    sway[i] = Math.random() * Math.PI * 2;
    swayR[i] = 6 + Math.random() * 16;
  }
  for (let i = 0; i < N; i++) {
    respawn(i, true);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xff8038,
    size: 6.5,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending, // embers burn against the dark rock
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false; // recycled around the player every frame
  points.visible = false;
  scene.add(points);

  let clock = 0;

  function update(dt: number, playerPos: THREE.Vector3, intensity: number): void {
    const target = 0.9 * intensity;
    // fade toward the target glow, hide completely when done
    material.opacity += (target - material.opacity) * Math.min(1, dt * 3);
    if (material.opacity < 0.01 && target <= 0) {
      points.visible = false;
      return;
    }
    points.visible = true;
    clock += dt;

    // the swarm is anchored to the player; embers cycle upward inside it
    points.position.copy(playerPos);
    for (let i = 0; i < N; i++) {
      let y = positions[i * 3 + 1] + speed[i] * dt;
      if (y > RISE) {
        respawn(i, false);
        y = 0;
      }
      positions[i * 3 + 1] = y;
      positions[i * 3] = baseX[i] + Math.sin(clock * 1.3 + sway[i]) * swayR[i];
      positions[i * 3 + 2] = baseZ[i] + Math.cos(clock * 1.1 + sway[i]) * swayR[i];
    }
    geometry.attributes.position.needsUpdate = true;
  }

  function dispose(): void {
    scene.remove(points);
    geometry.dispose();
    material.dispose();
  }

  return { update, dispose };
}
