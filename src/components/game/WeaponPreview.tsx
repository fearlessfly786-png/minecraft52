'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MD2Loader } from 'three/examples/jsm/loaders/MD2Loader.js';

/**
 * Live 3D weapon preview for the WEAPONS lobby panel ("gun smithy").
 *
 * The weapon sibling of CharacterPreview: a self-contained Three.js scene
 * (own canvas + WebGL context, alpha transparent so the panel glass shows
 * through) on the SAME PBR podium, framing the selected MD2 weapon LARGE so
 * the player can actually read its texture while the AI repaints it.
 *
 * Whatever rack entry is selected is applied LIVE:
 *  - base weapon  → its stock skins/*.png texture
 *  - AI-forged    → the forged texture streamed over the same mesh
 *  - Unarmed      → empty podium (the parent overlays a badge)
 *
 * The turntable auto-spins and supports pointer drag, exactly like the
 * dressing room.
 */

/** Weapon display size: the longest bbox axis is normalized to this many
 *  world units so every weapon (short blade → long railgun) frames alike.
 *  Tuned LARGE — the smithy stage is a close-up display, weapons should
 *  dominate the podium instead of floating like desk props. */
const WEAPON_LENGTH = 2.35;
/** Hover height of the weapon above the podium top plane (y=0). */
const WEAPON_HOVER = 0.4;

/** Camera framing for a close-up weapon display. The camera AIMS AT THE
 *  WEAPON CENTRE (hover height + turntable lift) so the gun sits dead in
 *  the middle of the frame; resize() may pull it back along this exact
 *  sight line on narrow canvases so the arsenal never swallows the view. */
const CAMERA_FOV = 32;
const CAMERA_DIST = 2.0;
/** Turntable lift: the podium group is raised this far above y=0. */
const TURNTABLE_LIFT = 0.15;
/** Vertical offset of the lens above the look point — preserves the
 *  original ~10.5° podium viewing angle while the aim tracks the gun. */
const CAMERA_TILT_Y = 0.37;
const CAMERA_LOOK_Y = WEAPON_HOVER + TURNTABLE_LIFT;
/** Adaptive pull-back bounds: never closer than CAMERA_DIST, never
 *  farther than this cap — the smithy is a close-up display, a bigger
 *  podium-in-frame only makes the weapon read smaller. */
const CAMERA_MAX_DIST = 2.25;

/** Same podium silhouette constants as CharacterPreview — one visual
 *  language across both dressing rooms. */
const PODIUM_DISC_R = 0.8;
const PODIUM_BASE_R = 0.86;
const PODIUM_HEIGHT = 0.075;
const PODIUM_RIM_TUBE = 0.018;
const PODIUM_RIM_Y = -0.016;
const PODIUM_PLINTH_TOP_R = 0.885;
const PODIUM_PLINTH_BASE_R = 0.905;
const PODIUM_PLINTH_H = 0.035;
const PODIUM_TEX_DIR = '/textures/podium/';
const PODIUM_TILE_TOP = 3;
const PODIUM_TILE_SIDE_X = 6;
const PODIUM_TILE_SIDE_Y = 1;
const PODIUM_ENV_INTENSITY = 0.65;
const PODIUM_TOP_TINT = 0x9aa1a8;
const PODIUM_SIDE_TINT = 0x868d96;
const PODIUM_RIM_TINT = 0xb9bfc7;
const PODIUM_PLINTH_TINT = 0x565b63;
const PODIUM_ORNAMENT_URL = '/textures/podium/ornament-ring.png';
const PODIUM_ORNAMENT_HALF = 0.85;
const PODIUM_ORNAMENT_Y = 0.003;

/** MD2 weapon meshes + stock textures (order = the game's weapon rack —
 *  the full 11-weapon arsenal from the three.js MD2 example). */
const WEAPON_BASE_URL = '/models/md2/ratamahatta/';
const WEAPON_MODELS: Array<[string, string]> = [
  ['weapon.md2', 'weapon.png'],
  ['w_shotgun.md2', 'w_shotgun.png'],
  ['w_chaingun.md2', 'w_chaingun.png'],
  ['w_railgun.md2', 'w_railgun.png'],
  ['w_bfg.md2', 'w_bfg.png'],
  ['w_blaster.md2', 'w_blaster.png'],
  ['w_glauncher.md2', 'w_glauncher.png'],
  ['w_hyperblaster.md2', 'w_hyperblaster.png'],
  ['w_machinegun.md2', 'w_machinegun.png'],
  ['w_rlauncher.md2', 'w_rlauncher.png'],
  ['w_sshotgun.md2', 'w_sshotgun.png'],
];

/** Slow turntable speed + drag sensitivity (rad/s). */
const AUTO_SPIN_SPEED = 0.5;
const DRAG_SENSITIVITY = 0.012;

interface WeaponPreviewProps {
  /** Which weapon mesh to show: a base rack index (or -1 = unarmed, empty
   *  podium). Forged variants resolve to their base index + textureUrl. */
  baseIndex: number;
  /** Optional AI-forged texture URL applied over the active weapon. */
  textureUrl: string | null;
}

export default function WeaponPreview({
  baseIndex,
  textureUrl,
}: WeaponPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Mutable bridge between the React props and the imperative Three.js world.
  const weaponsRef = useRef<Array<THREE.Mesh | null>>(
    Array.from({ length: WEAPON_MODELS.length }, () => null)
  );
  const stockTexturesRef = useRef<Array<THREE.Texture | null>>(
    Array.from({ length: WEAPON_MODELS.length }, () => null)
  );
  const activeRef = useRef<number>(baseIndex);
  const customTexRef = useRef<THREE.Texture | null>(null);
  const customUrlRef = useRef<string | null>(textureUrl);
  const spinVelRef = useRef(0);
  const readyRef = useRef(false);
  /** Pending prop snapshot applied once the models finish loading. */
  const pendingRef = useRef<{ baseIndex: number; textureUrl: string | null }>({
    baseIndex,
    textureUrl,
  });

  /** Show exactly one weapon, with the custom texture applied when present.
   *  Safe to call before the models load — pendingRef covers that case. */
  const applyWeapon = (index: number, url: string | null) => {
    activeRef.current = index;
    pendingRef.current = { baseIndex: index, textureUrl: url };
    const weapons = weaponsRef.current;
    for (let i = 0; i < weapons.length; i += 1) {
      const mesh = weapons[i];
      if (mesh) mesh.visible = i === index;
    }
    if (index < 0 || index >= weapons.length) return;
    const mesh = weapons[index];
    if (!mesh) return;
    const material = mesh.material as THREE.MeshLambertMaterial;
    if (url) {
      // Reuse the streamed texture when the URL is unchanged; a NEW url
      // swaps in a fresh loader texture (old one disposed).
      if (customUrlRef.current !== url || !customTexRef.current) {
        customTexRef.current?.dispose();
        const texture = new THREE.TextureLoader().load(url);
        texture.mapping = THREE.UVMapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.name = url;
        customTexRef.current = texture;
        customUrlRef.current = url;
      }
      material.map = customTexRef.current;
    } else {
      material.map = stockTexturesRef.current[index] ?? null;
    }
    material.needsUpdate = true;
  };

  /** Load / base-texture / visibility prop changes apply live. */
  useEffect(() => {
    applyWeapon(baseIndex, textureUrl);
  }, [baseIndex, textureUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 50);
    camera.position.set(0, CAMERA_LOOK_Y + CAMERA_TILT_Y, CAMERA_DIST);
    camera.lookAt(0, CAMERA_LOOK_Y, 0);

    // Same RATFIRE light language as the dressing room: cool key, warm amber
    // rim, soft ambient fill.
    const keyLight = new THREE.DirectionalLight(0xcfe8ff, 2.4);
    keyLight.position.set(-2.2, 3.2, 2.6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xfbbf24, 1.7);
    rimLight.position.set(2.4, 2.4, -2.8);
    scene.add(rimLight);
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    // Turntable: podium + weapon spin together, lifted so the pedestal base
    // clears the bottom edge (same FRAME_LIFT idea as the dressing room).
    const turntable = new THREE.Group();
    turntable.position.y = TURNTABLE_LIFT;
    scene.add(turntable);

    // ===== PBR podium — identical build recipe to CharacterPreview =====
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

    const topColor = loadPodiumTex('color.jpg', true, PODIUM_TILE_TOP, PODIUM_TILE_TOP);
    const topNormal = loadPodiumTex('normal.jpg', false, PODIUM_TILE_TOP, PODIUM_TILE_TOP);
    const topRough = loadPodiumTex('roughness.jpg', false, PODIUM_TILE_TOP, PODIUM_TILE_TOP);
    const topMetal = loadPodiumTex('metalness.jpg', false, PODIUM_TILE_TOP, PODIUM_TILE_TOP);
    const topAo = loadPodiumTex('ao.jpg', false, PODIUM_TILE_TOP, PODIUM_TILE_TOP);
    const sideColor = loadPodiumTex('side/color.jpg', true, PODIUM_TILE_SIDE_X, PODIUM_TILE_SIDE_Y);
    const sideNormal = loadPodiumTex('side/normal.jpg', false, PODIUM_TILE_SIDE_X, PODIUM_TILE_SIDE_Y);
    const sideRough = loadPodiumTex('side/roughness.jpg', false, PODIUM_TILE_SIDE_X, PODIUM_TILE_SIDE_Y);
    const sideMetal = loadPodiumTex('side/metalness.jpg', false, PODIUM_TILE_SIDE_X, PODIUM_TILE_SIDE_Y);

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
    const sideMaterial = new THREE.MeshStandardMaterial({
      map: sideColor,
      normalMap: sideNormal,
      roughnessMap: sideRough,
      metalnessMap: sideMetal,
      envMap: envTex,
      envMapIntensity: PODIUM_ENV_INTENSITY * 0.8,
      metalness: 1,
      roughness: 1,
      color: PODIUM_SIDE_TINT,
    });
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

    const topGeometry = new THREE.CircleGeometry(PODIUM_DISC_R, 64);
    topGeometry.setAttribute('uv1', topGeometry.attributes.uv);
    const topPlate = new THREE.Mesh(topGeometry, topMaterial);
    topPlate.rotation.x = -Math.PI / 2;
    turntable.add(topPlate);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(PODIUM_DISC_R - 0.007, PODIUM_RIM_TUBE, 16, 72),
      rimMaterial
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = PODIUM_RIM_Y;
    turntable.add(rim);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(
        PODIUM_DISC_R,
        PODIUM_BASE_R,
        PODIUM_HEIGHT,
        64,
        1,
        true
      ),
      sideMaterial
    );
    body.position.y = -PODIUM_HEIGHT / 2;
    turntable.add(body);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(
        PODIUM_PLINTH_TOP_R,
        PODIUM_PLINTH_BASE_R,
        PODIUM_PLINTH_H,
        64
      ),
      plinthMaterial
    );
    plinth.position.y = -PODIUM_HEIGHT - PODIUM_PLINTH_H / 2;
    turntable.add(plinth);

    // Soft baked contact shadow (same recipe as the dressing room).
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
    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.52, 32),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.001;
    turntable.add(contactShadow);

    // Greek-key ornament decal — identical to the dressing room podium.
    const ornamentTex = texLoader.load(PODIUM_ORNAMENT_URL);
    ornamentTex.colorSpace = THREE.SRGBColorSpace;
    ornamentTex.anisotropy = maxAniso;
    podiumTextures.push(ornamentTex);
    const ornament = new THREE.Mesh(
      new THREE.PlaneGeometry(
        PODIUM_ORNAMENT_HALF * 2,
        PODIUM_ORNAMENT_HALF * 2
      ),
      new THREE.MeshStandardMaterial({
        map: ornamentTex,
        transparent: true,
        depthWrite: false,
        metalness: 0.55,
        roughness: 0.45,
        envMap: envTex,
        envMapIntensity: 0.6,
      })
    );
    ornament.rotation.x = -Math.PI / 2;
    ornament.position.y = PODIUM_ORNAMENT_Y;
    ornament.renderOrder = 1;
    turntable.add(ornament);

    // ===== weapon rack: load every rack MD2 mesh (hidden by default) =====
    const md2Loader = new MD2Loader();
    let loadedCount = 0;
    WEAPON_MODELS.forEach(([modelFile, textureFile], index) => {
      const stockTexture = texLoader.load(
        `${WEAPON_BASE_URL}skins/${textureFile}`
      );
      stockTexture.mapping = THREE.UVMapping;
      stockTexture.colorSpace = THREE.SRGBColorSpace;
      stockTexturesRef.current[index] = stockTexture;

      md2Loader.load(`${WEAPON_BASE_URL}${modelFile}`, (geometry) => {
        const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
        material.map = stockTexture;
        const mesh = new THREE.Mesh(geometry, material);

        // Normalize every weapon to the same display length and centre its
        // bbox on the podium axis, hovering above the steel plate.
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox ?? new THREE.Box3();
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        bbox.getSize(size);
        bbox.getCenter(center);
        const longest = Math.max(size.x, size.y, size.z) || 1;
        const s = WEAPON_LENGTH / longest;
        mesh.scale.setScalar(s);
        mesh.position.set(
          -center.x * s,
          WEAPON_HOVER - center.y * s,
          -center.z * s
        );
        mesh.visible = index === pendingRef.current.baseIndex;
        turntable.add(mesh);
        weaponsRef.current[index] = mesh;
        loadedCount += 1;
        if (loadedCount === WEAPON_MODELS.length) {
          readyRef.current = true;
          // Models just arrived — apply the latest pending selection.
          applyWeapon(
            pendingRef.current.baseIndex,
            pendingRef.current.textureUrl
          );
        }
      });
    });

    // ===== responsive sizing: canvas CSS size == container at any dpr =====
    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      // The weapons are displayed LARGE — on narrow/tall preview boxes,
      // slide the camera back along its sight line only while the longest
      // weapon axis truly swallows the frame (worst-case perpendicular
      // span over ~150%); wide stages keep the full close-up distance.
      const halfV = (CAMERA_FOV * Math.PI) / 360;
      const fitDist =
        WEAPON_LENGTH / 2 / (1.5 * Math.tan(halfV) * camera.aspect);
      const dist = Math.min(
        CAMERA_MAX_DIST,
        Math.max(CAMERA_DIST, fitDist)
      );
      // Preserve the original viewing angle: raise the lens above the
      // look point in lockstep with the pull-back distance.
      camera.position.set(
        0,
        CAMERA_LOOK_Y + CAMERA_TILT_Y * (dist / CAMERA_DIST),
        dist
      );
      camera.lookAt(0, CAMERA_LOOK_Y, 0);
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // ===== pointer drag to spin + gentle auto turntable =====
    let dragging = false;
    let lastX = 0;
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      container.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      turntable.rotation.y += dx * DRAG_SENSITIVITY;
      spinVelRef.current = dx * DRAG_SENSITIVITY * 60;
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
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.1);
      if (!dragging) {
        spinVelRef.current *= Math.pow(0.02, dt);
        const extra =
          Math.abs(spinVelRef.current) > 0.02 ? spinVelRef.current * dt : 0;
        turntable.rotation.y += AUTO_SPIN_SPEED * dt + extra;
      }
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
      podiumTextures.forEach((tex) => tex.dispose());
      envTex.dispose();
      customTexRef.current?.dispose();
      customTexRef.current = null;
      customUrlRef.current = null;
      stockTexturesRef.current.forEach((tex) => tex?.dispose());
      stockTexturesRef.current = Array.from(
        { length: WEAPON_MODELS.length },
        () => null
      );
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      weaponsRef.current = Array.from(
        { length: WEAPON_MODELS.length },
        () => null
      );
      readyRef.current = false;
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
