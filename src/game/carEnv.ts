/* ==========================================================================
 * CAR PAINT SHINE — a LIGHT studio environment map shared by every car.
 *
 * "lightly map the nascar's shiny": the stock-car paint gets a subtle
 * image-based sheen. A tiny RoomEnvironment scene is baked ONCE into a
 * PMREM cubemap (per renderer) and applied to the paint materials with a
 * LOW envMapIntensity — a soft showroom glaze, never a chrome mirror.
 * ==========================================================================*/

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

let cachedTex: THREE.Texture | null = null;
let cachedRenderer: THREE.WebGLRenderer | null = null;

/** Bake (once per renderer) the studio env map used for car paint. */
export function carEnvMap(
  renderer: THREE.WebGLRenderer
): THREE.Texture | null {
  try {
    if (cachedTex && cachedRenderer === renderer) return cachedTex;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    cachedTex = tex;
    cachedRenderer = renderer;
    return tex;
  } catch {
    /* a broken env must never brick a car — paint just stays matte */
    return null;
  }
}

/** Apply the light shine to one material (safe on any material type). */
export function applyCarShine(
  mat: THREE.Material | null | undefined,
  renderer: THREE.WebGLRenderer | null | undefined,
  intensity = 0.45
): void {
  if (!mat || !renderer) return;
  const env = carEnvMap(renderer);
  if (!env) return;
  const std = mat as THREE.MeshStandardMaterial;
  if ((std as Partial<THREE.MeshStandardMaterial>).isMeshStandardMaterial) {
    std.envMap = env;
    std.envMapIntensity = intensity; // light sheen — showroom, not mirror
    std.needsUpdate = true;
  } else if ((mat as { isMeshPhongMaterial?: boolean }).isMeshPhongMaterial) {
    const ph = mat as unknown as THREE.MeshPhongMaterial;
    ph.envMap = env;
    ph.needsUpdate = true;
  }
}
