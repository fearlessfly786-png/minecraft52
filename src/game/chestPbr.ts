/**
 * Ultrarealistic PBR material kit for the RATFIRE loot chests.
 *
 * The chests are clad in three AI-generated photorealistic albedo maps
 * (aged dark-oak planks, hammered gold, ornate gilded plate) served from
 * /textures/chest/. For every albedo we also derive a matching tangent
 * space NORMAL map at boot (canvas Sobel filter over the luminance, one
 * 512² pass per texture) so the wood grain and gold engravings catch the
 * sunlight like real surface relief, plus a tiny 256×128 procedural
 * equirect environment map so the metal fittings get genuine reflections
 * without touching the scene lighting or any other material.
 *
 * RAM/cost profile (kept tiny on purpose — see the project memory audit):
 *   - one shared kit instance for the whole world (created with the chest
 *     system, disposed with it); 3 albedos + 3 derived normals + 1 env map
 *   - materials start with flat colors matched to the legacy chest palette
 *     and swap to full PBR the moment each image arrives (async, no pop-in
 *     stall — chests spawn progressively as regions are discovered)
 *   - if an image ever fails to load the flat-color fallback stays, so the
 *     game never breaks
 */

import * as THREE from 'three';

/** Albedo sources under public/. */
const WOOD_URL = '/textures/chest/wood-albedo.png';
const GOLD_URL = '/textures/chest/gold-albedo.png';
const ORNATE_URL = '/textures/chest/gold-ornate.png';
const CARVED_URL = '/textures/chest/skull-carving.png';

export interface ChestPbrKit {
  wood: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  ornate: THREE.MeshStandardMaterial;
  carved: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  dispose(): void;
}

/** Sobel strength for the derived normal maps (albedo dark = recessed). */
const NORMAL_STRENGTH = 2.2;

export function createChestPbr(): ChestPbrKit {
  const disposed = { value: false };
  const disposables: Array<{ dispose(): void }> = [];
  const loader = new THREE.TextureLoader();

  // ---- procedural environment map (equirect) for metal reflections ----
  function createEnvTexture(): THREE.CanvasTexture {
    const w = 256;
    const h = 128;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // vertical gradient: RATFIRE sky above, sunlit ground below
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#a9cdf6');
      sky.addColorStop(0.42, '#e8f2fc');
      sky.addColorStop(0.5, '#e6d9b8');
      sky.addColorStop(0.6, '#77603c');
      sky.addColorStop(1, '#413726');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // sun blob — gives gold its crisp specular streak
      const sx = w * 0.22;
      const sy = h * 0.16;
      const sun = ctx.createRadialGradient(sx, sy, 2, sx, sy, 26);
      sun.addColorStop(0, 'rgba(255,255,250,1)');
      sun.addColorStop(0.4, 'rgba(255,240,190,0.85)');
      sun.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, h);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const env = createEnvTexture();
  disposables.push(env);

  // ---- materials (flat-color fallbacks match the legacy chest palette) ----
  const wood = new THREE.MeshStandardMaterial({
    color: 0x8a5a2b,
    roughness: 0.72,
    metalness: 0.03,
    envMap: env,
    envMapIntensity: 0.25,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xffd24a,
    roughness: 0.32,
    metalness: 0.82,
    envMap: env,
    envMapIntensity: 1.05,
  });
  const ornate = new THREE.MeshStandardMaterial({
    color: 0xf5c95c,
    roughness: 0.28,
    metalness: 0.88,
    envMap: env,
    envMapIntensity: 1.15,
  });
  const carved = new THREE.MeshStandardMaterial({
    color: 0x7a5230,
    roughness: 0.7,
    metalness: 0.02,
    envMap: env,
    envMapIntensity: 0.2,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x35302b,
    roughness: 0.45,
    metalness: 0.8,
    envMap: env,
    envMapIntensity: 0.55,
  });

  // ---- derived normal map (Sobel over a 512² luminance downscale) ----
  function makeNormalMap(img: HTMLImageElement): THREE.CanvasTexture | null {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    let src: Uint8ClampedArray;
    try {
      src = ctx.getImageData(0, 0, size, size).data;
    } catch {
      return null;
    }
    const out = ctx.createImageData(size, size);
    const dst = out.data;
    const lum = (i: number) =>
      (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
    for (let y = 0; y < size; y++) {
      const yu = ((y - 1 + size) % size) * size;
      const yc = y * size;
      const yd = ((y + 1) % size) * size;
      for (let x = 0; x < size; x++) {
        const xl = (x - 1 + size) % size;
        const xr = (x + 1) % size;
        // surface height falls where the albedo is darker (crevices)
        const dx = lum((yc + xr) * 4) - lum((yc + xl) * 4);
        const dy = lum((yd + x) * 4) - lum((yu + x) * 4);
        const nx = -dx * NORMAL_STRENGTH;
        const ny = dy * NORMAL_STRENGTH;
        const len = Math.hypot(nx, ny, 1);
        const i = (yc + x) * 4;
        dst[i] = ((nx / len) * 0.5 + 0.5) * 255;
        dst[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
        dst[i + 2] = (1 / len * 0.5 + 0.5) * 255;
        dst[i + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // ---- async attach: albedo via TextureLoader + derived normal map ----
  function attach(
    url: string,
    mat: THREE.MeshStandardMaterial,
    normalScale: number
  ): void {
    loader.load(
      url,
      (tex) => {
        if (disposed.value) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 4;
        const nrm = makeNormalMap(tex.image as HTMLImageElement);
        mat.map = tex;
        if (nrm) {
          mat.normalMap = nrm;
          disposables.push(nrm);
        }
        mat.normalScale.set(normalScale, normalScale);
        mat.needsUpdate = true;
        disposables.push(tex);
      },
      undefined,
      () => {
        /* keep the flat-color fallback on load failure */
      }
    );
  }

  attach(WOOD_URL, wood, 0.9);
  attach(GOLD_URL, gold, 0.65);
  attach(ORNATE_URL, ornate, 0.8);
  attach(CARVED_URL, carved, 1.25);

  function dispose(): void {
    disposed.value = true;
    for (const d of disposables) d.dispose();
    disposables.length = 0;
    wood.dispose();
    gold.dispose();
    ornate.dispose();
    carved.dispose();
    dark.dispose();
  }

  return { wood, gold, ornate, carved, dark, dispose };
}
