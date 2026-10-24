import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * displayPodium.ts — the CHARACTER panel's dressing-room pedestal, shared
 * by every live preview room (Character / Weapons / Pet quad / Pet plane).
 *
 * The exact 4-piece photo-scanned steel podium extracted from
 * DronePreview: diamond-plate top (ambientCG "Diamond Plate 009"), smooth
 * machined rim, brushed "Metal 009" body band and the wider plinth tier —
 * same CC0 scans, same tints, same PMREM RoomEnvironment envMap, same
 * baked radial contact shadow and Greek-key ornament inlay. Scaled ×100
 * into the flying pets' world (top plane at y=0) so every display room
 * reads as one and the same steel stage.
 *
 * `dispose()` frees every texture, geometry and material it created so
 * panel open/close never leaks GPU resources.
 */

/** The CHARACTER panel's dressing-room podium, scaled into the pets'
 *  world. ×100 puts the steel disc at r=80 — several wingspans across, so
 *  a pet visibly hovers OVER a full pedestal while the silhouette,
 *  materials and tints stay a 1:1 match with the character pedestal.
 *  y=0 is the top plane the pets hover over. */
const PODIUM_SCALE = 100;
const PODIUM_DISC_R = 0.8 * PODIUM_SCALE;
const PODIUM_BASE_R = 0.86 * PODIUM_SCALE;
const PODIUM_HEIGHT = 0.075 * PODIUM_SCALE;
/** Smooth machined rim rolled over the top edge (the rounded bevel). */
const PODIUM_RIM_TUBE = 0.018 * PODIUM_SCALE;
const PODIUM_RIM_Y = -0.016 * PODIUM_SCALE;
/** Wider base tier under the body — the pedestal's 3D step design. */
const PODIUM_PLINTH_TOP_R = 0.885 * PODIUM_SCALE;
const PODIUM_PLINTH_BASE_R = 0.905 * PODIUM_SCALE;
const PODIUM_PLINTH_H = 0.035 * PODIUM_SCALE;

/** CC0 PBR maps for the podium (ambientCG.com, CC0 license) — the SAME
 *  scans the character pedestal uses: top = "Diamond Plate 009" photo-scanned
 *  steel plate; side = "Metal 009" brushed metal whose streaks wrap around
 *  the band. Tiling is re-tuned for the display cameras' field of view so
 *  the plate reads at the same on-screen density as the dressing-room
 *  podium. */
const PODIUM_TEX_DIR = '/textures/podium/';
const PODIUM_TILE_TOP = 3;
const PODIUM_TILE_SIDE_X = 8;
const PODIUM_TILE_SIDE_Y = 1;
const PODIUM_ENV_INTENSITY = 0.65;
const PODIUM_NORMAL_SCALE = 1;
/** Tints pulled toward the RATFIRE theme — identical to the character panel. */
const PODIUM_TOP_TINT = 0x9aa1a8;
const PODIUM_SIDE_TINT = 0x868d96;
const PODIUM_RIM_TINT = 0xb9bfc7;
const PODIUM_PLINTH_TINT = 0x565b63;

/** Greek-key ornament inlay + baked contact shadow, same proportions as the
 *  character pedestal (scaled). The shadow grounds the hovering pet on the
 *  steel top like a display piece. */
const PODIUM_ORNAMENT_URL = '/textures/podium/ornament-ring.png';
const PODIUM_ORNAMENT_HALF = 0.85 * PODIUM_SCALE;
const PODIUM_ORNAMENT_Y = 0.003 * PODIUM_SCALE;
const PODIUM_SHADOW_R = 0.52 * PODIUM_SCALE;
const PODIUM_SHADOW_Y = 0.001 * PODIUM_SCALE;

export interface DisplayPodium {
  /** Free all podium GPU resources (textures, geometries, materials). */
  dispose(): void;
}

export function createDisplayPodium(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer
): DisplayPodium {
  const podiumTextures: THREE.Texture[] = [];
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const texLoader = new THREE.TextureLoader();
  const loadPodiumTex = (
    file: string,
    srgb: boolean,
    repeatX: number,
    repeatY: number
  ) => {
    const tex = texLoader.load(`${PODIUM_TEX_DIR}${file}`);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = maxAniso;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    podiumTextures.push(tex);
    return tex;
  };

  const topColor = loadPodiumTex(
    'color.jpg',
    true,
    PODIUM_TILE_TOP,
    PODIUM_TILE_TOP
  );
  const topNormal = loadPodiumTex(
    'normal.jpg',
    false,
    PODIUM_TILE_TOP,
    PODIUM_TILE_TOP
  );
  const topRough = loadPodiumTex(
    'roughness.jpg',
    false,
    PODIUM_TILE_TOP,
    PODIUM_TILE_TOP
  );
  const topMetal = loadPodiumTex(
    'metalness.jpg',
    false,
    PODIUM_TILE_TOP,
    PODIUM_TILE_TOP
  );
  const topAo = loadPodiumTex(
    'ao.jpg',
    false,
    PODIUM_TILE_TOP,
    PODIUM_TILE_TOP
  );

  // Side band: the brushed "Metal 009" scan — fresh loads (browser cache
  // serves the files) instead of clones — a cloned texture flagged
  // needsUpdate before its shared image arrives spams "no image data"
  // upload warnings every frame.
  const sideColor = loadPodiumTex(
    'side/color.jpg',
    true,
    PODIUM_TILE_SIDE_X,
    PODIUM_TILE_SIDE_Y
  );
  const sideNormal = loadPodiumTex(
    'side/normal.jpg',
    false,
    PODIUM_TILE_SIDE_X,
    PODIUM_TILE_SIDE_Y
  );
  const sideRough = loadPodiumTex(
    'side/roughness.jpg',
    false,
    PODIUM_TILE_SIDE_X,
    PODIUM_TILE_SIDE_Y
  );
  const sideMetal = loadPodiumTex(
    'side/metalness.jpg',
    false,
    PODIUM_TILE_SIDE_X,
    PODIUM_TILE_SIDE_Y
  );

  // Studio-style environment map — metals look dead without one. Applied
  // ONLY to the podium materials so each pet's tuned look is kept.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const topMaterial = new THREE.MeshStandardMaterial({
    map: topColor,
    normalMap: topNormal,
    roughnessMap: topRough,
    metalnessMap: topMetal,
    aoMap: topAo,
    envMap: envTex,
    envMapIntensity: PODIUM_ENV_INTENSITY,
    metalness: 1,
    roughness: 1,
    color: PODIUM_TOP_TINT,
  });
  topMaterial.normalScale.set(PODIUM_NORMAL_SCALE, PODIUM_NORMAL_SCALE);

  const sideMaterial = new THREE.MeshStandardMaterial({
    map: sideColor,
    normalMap: sideNormal,
    roughnessMap: sideRough,
    metalnessMap: sideMetal,
    envMap: envTex,
    envMapIntensity: PODIUM_ENV_INTENSITY * 0.8,
    metalness: 1,
    roughness: 1,
    color: PODIUM_SIDE_TINT, // subtle dark tint — separates the band from the top
  });
  sideMaterial.normalScale.set(PODIUM_NORMAL_SCALE, PODIUM_NORMAL_SCALE);

  // Smooth machined metal for the rolled rim + plinth tier — texture-free
  // so the rounded 3D edges read as polished, polished-by-machine steel.
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: PODIUM_RIM_TINT,
    metalness: 1,
    roughness: 0.32,
    envMap: envTex,
    envMapIntensity: PODIUM_ENV_INTENSITY * 1.2,
  });
  const plinthMaterial = new THREE.MeshStandardMaterial({
    color: PODIUM_PLINTH_TINT,
    metalness: 0.95,
    roughness: 0.42,
    envMap: envTex,
    envMapIntensity: PODIUM_ENV_INTENSITY * 0.8,
  });

  // ===== podium silhouette (4 pieces, top plane at y=0) =====
  const podiumGeos: THREE.BufferGeometry[] = [];
  const podiumMats: THREE.Material[] = [
    topMaterial,
    sideMaterial,
    rimMaterial,
    plinthMaterial,
  ];

  // 1) Top plate — diamond-plate PBR texture.
  const topGeometry = new THREE.CircleGeometry(PODIUM_DISC_R, 64);
  // aoMap samples the second UV channel — duplicate the circle UVs.
  topGeometry.setAttribute('uv1', topGeometry.attributes.uv);
  const topPlate = new THREE.Mesh(topGeometry, topMaterial);
  topPlate.rotation.x = -Math.PI / 2;
  scene.add(topPlate);
  podiumGeos.push(topGeometry);

  // 2) Smooth rolled rim — a torus rounding over the top edge so the
  //    plate's end reads as a machined bevel instead of a paper-thin cut.
  const rimGeometry = new THREE.TorusGeometry(
    PODIUM_DISC_R - 0.007 * PODIUM_SCALE,
    PODIUM_RIM_TUBE,
    16,
    72
  );
  const rim = new THREE.Mesh(rimGeometry, rimMaterial);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = PODIUM_RIM_Y;
  scene.add(rim);
  podiumGeos.push(rimGeometry);

  // 3) Body band — brushed PBR texture, open-ended (caps covered by the
  //    top plate above and the plinth tier below).
  const bodyGeometry = new THREE.CylinderGeometry(
    PODIUM_DISC_R,
    PODIUM_BASE_R,
    PODIUM_HEIGHT,
    64,
    1,
    true
  );
  const body = new THREE.Mesh(bodyGeometry, sideMaterial);
  body.position.y = -PODIUM_HEIGHT / 2;
  scene.add(body);
  podiumGeos.push(bodyGeometry);

  // 4) Plinth tier — wider smooth base step under the body.
  const plinthGeometry = new THREE.CylinderGeometry(
    PODIUM_PLINTH_TOP_R,
    PODIUM_PLINTH_BASE_R,
    PODIUM_PLINTH_H,
    64
  );
  const plinth = new THREE.Mesh(plinthGeometry, plinthMaterial);
  plinth.position.y = -PODIUM_HEIGHT - PODIUM_PLINTH_H / 2;
  scene.add(plinth);
  podiumGeos.push(plinthGeometry);

  // Soft baked contact shadow — grounds the hovering pet on the steel
  // top like a display piece.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const shadowCtx = shadowCanvas.getContext('2d');
  if (shadowCtx) {
    const gradient = shadowCtx.createRadialGradient(128, 128, 8, 128, 128, 120);
    gradient.addColorStop(0, 'rgba(0,0,0,0.5)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,0.22)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    shadowCtx.fillStyle = gradient;
    shadowCtx.fillRect(0, 0, 256, 256);
  }
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  shadowTex.colorSpace = THREE.SRGBColorSpace;
  podiumTextures.push(shadowTex);
  const shadowGeometry = new THREE.CircleGeometry(PODIUM_SHADOW_R, 32);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = PODIUM_SHADOW_Y;
  scene.add(contactShadow);
  podiumGeos.push(shadowGeometry);
  podiumMats.push(shadowMaterial);

  // Greek-key ornament decal — floats above the contact shadow. Lit as
  // metal so the inlay catches the same key/rim light and env reflections
  // as the plate around it.
  const ornamentTex = texLoader.load(PODIUM_ORNAMENT_URL);
  ornamentTex.colorSpace = THREE.SRGBColorSpace;
  ornamentTex.anisotropy = maxAniso;
  podiumTextures.push(ornamentTex);
  const ornamentGeometry = new THREE.PlaneGeometry(
    PODIUM_ORNAMENT_HALF * 2,
    PODIUM_ORNAMENT_HALF * 2
  );
  const ornamentMaterial = new THREE.MeshStandardMaterial({
    map: ornamentTex,
    transparent: true,
    depthWrite: false,
    metalness: 0.55,
    roughness: 0.45,
    envMap: envTex,
    envMapIntensity: 0.6,
  });
  const ornament = new THREE.Mesh(ornamentGeometry, ornamentMaterial);
  ornament.rotation.x = -Math.PI / 2;
  ornament.position.y = PODIUM_ORNAMENT_Y;
  ornament.renderOrder = 1; // above the contact shadow
  scene.add(ornament);
  podiumGeos.push(ornamentGeometry);
  podiumMats.push(ornamentMaterial);

  return {
    dispose(): void {
      podiumTextures.forEach((tex) => tex.dispose());
      envTex.dispose();
      podiumGeos.forEach((geo) => geo.dispose());
      podiumMats.forEach((mat) => mat.dispose());
    },
  };
}
