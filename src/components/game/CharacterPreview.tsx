'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MD2Character } from 'three/examples/jsm/misc/MD2Character.js';

/**
 * Live 3D costume preview for the CHARACTER lobby panel ("dressing room").
 *
 * A fully self-contained Three.js scene (own canvas + WebGL context, alpha
 * transparent so the panel glass shows through) that loads the SAME Quake 2
 * MD2 hero the in-game lobby showcases. Whatever costume/weapon the player
 * clicks in the rack is applied here LIVE — and simultaneously on the real
 * lobby/game model through the shared apiRef -> loadout flow.
 *
 * Framing guarantees (Tasks 7-9):
 *  - The model is normalized to PREVIEW_HEIGHT and its XZ centroid is baked
 *    onto the turntable axis, so it stays centred at every rotation angle.
 *  - The camera aims at the model's vertical midpoint, centring it in the
 *    container both vertically and horizontally. The whole turntable is then
 *    lifted a touch (FRAME_LIFT) so the pedestal base clears the bottom edge.
 *  - renderer.setSize(w, h) is called WITH style updates so the canvas CSS
 *    size always equals its container at ANY devicePixelRatio (the buffer
 *    still scales with setPixelRatio for crisp HiDPI rendering).
 */

/** World height the previewed hero is normalized to (slightly smaller than
 *  the game's 1.9 so the showcase figure reads as a display-room piece). */
const PREVIEW_HEIGHT = 1.65;

/** Camera framing: aims at the model's vertical midpoint (PREVIEW_HEIGHT/2)
 *  so the figure sits dead-centre at every turntable angle. */
const CAMERA_FOV = 32;
const CAMERA_POS_Y = 1.05;
const CAMERA_DIST = 4.1;

/** Light upward lift of the whole turntable (podium + hero + shadow move
 *  together) so the pedestal base is not clipped by the container edge. */
const FRAME_LIFT = 0.15;

/** Podium silhouette (top plate / smooth rim / body band / plinth tier).
 *  Radii matched to the model size; y=0 is the top plane the hero stands on. */
const PODIUM_DISC_R = 0.8;
const PODIUM_BASE_R = 0.86;
const PODIUM_HEIGHT = 0.075;
/** Smooth machined rim rolled over the top edge (the rounded bevel). */
const PODIUM_RIM_TUBE = 0.018;
const PODIUM_RIM_Y = -0.016;
/** Wider base tier under the body — the pedestal's 3D step design. */
const PODIUM_PLINTH_TOP_R = 0.885;
const PODIUM_PLINTH_BASE_R = 0.905;
const PODIUM_PLINTH_H = 0.035;

/** CC0 PBR maps for the podium (ambientCG.com, CC0 license):
 *  top = "Diamond Plate 009" photo-scanned steel plate; side = "Metal 009"
 *  brushed metal whose streaks wrap around the band. Smooth machined rim
 *  and plinth stay texture-free for the polished-metal look. */
const PODIUM_TEX_DIR = '/textures/podium/';
const PODIUM_TILE_TOP = 3;
const PODIUM_TILE_SIDE_X = 6;
const PODIUM_TILE_SIDE_Y = 1;
const PODIUM_ENV_INTENSITY = 0.65;
const PODIUM_NORMAL_SCALE = 1;
/** Tints pulled toward the RATFIRE theme — the raw scans are bright white
 *  galvanized steel that would glare against the dark dressing room. */
const PODIUM_TOP_TINT = 0x9aa1a8;
const PODIUM_SIDE_TINT = 0x868d96;
const PODIUM_RIM_TINT = 0xb9bfc7;
const PODIUM_PLINTH_TINT = 0x565b63;

/** Greek-key ornament ring (user-supplied art, chroma-keyed so the black
 *  background is alpha). Decal plane half-size 0.85 puts the ornament's
 *  outer edge at ~0.74 world radius — inside the contact shadow boundary
 *  (measured: outer 87.2% / inner 52.2% of the half-size). */
const PODIUM_ORNAMENT_URL = '/textures/podium/ornament-ring.png';
const PODIUM_ORNAMENT_HALF = 0.85;
const PODIUM_ORNAMENT_Y = 0.003;

/** MD2 config — mirrors the in-game hero exactly (page.tsx loadParts).
 *  KEEP IN LOCKSTEP with SKINS in page.tsx — same order, same files. */
const MODEL_BASE_URL = '/models/md2/ratamahatta/';
const MODEL_BODY = 'ratamahatta.md2';
const MODEL_SKINS = [
  'ratamahatta.png',
  'skin_crimson.png',
  'ctf_b.png',
  'ctf_r.png',
  'dead.png',
  'gearwhore.png',
  'skin_gold.png',
  'skin_toxin.png',
  'skin_shadow.png',
  'skin_frost.png',
  'skin_magma.png',
];
const MODEL_WEAPONS: Array<[string, string]> = [
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
/** Loadout entries above the last mesh weapon map to "unarmed" (-1). */
const MESH_WEAPON_COUNT = MODEL_WEAPONS.length;

/** CCW turntable speed + drag sensitivity (rad/s). */
const AUTO_SPIN_SPEED = 0.5;
const DRAG_SENSITIVITY = 0.012;

interface CharacterPreviewProps {
  /** Equipped skin (index into MODEL_SKINS) — applied live on change. */
  skinIndex: number;
  /** Equipped loadout weapon (index into the 5-entry loadout list; the
   *  trailing Unarmed entry maps to -1 = no mesh). */
  weaponIndex: number;
  /** AI-forged costume textures (public URLs) appended after MODEL_SKINS —
   *  kept in lockstep with the game's skinsBody so indices match. */
  customSkinUrls: string[];
}

export default function CharacterPreview({
  skinIndex,
  weaponIndex,
  customSkinUrls,
}: CharacterPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Mutable bridge between the React props and the imperative Three.js world.
  const characterRef = useRef<MD2Character | null>(null);
  const loadedRef = useRef(false);
  const pendingRef = useRef<{ skin: number; weapon: number }>({
    skin: skinIndex,
    weapon: weaponIndex,
  });
  const spinVelRef = useRef(0);
  /** How many forged textures are already registered on this character. */
  const customCountRef = useRef(0);

  /** Apply a loadout to the preview model if it is ready, else park it.
   *  The modulo spans base + forged skins, mirroring the game bridge. */
  const applyLoadout = (skin: number, weapon: number) => {
    pendingRef.current = { skin, weapon };
    const character = characterRef.current;
    if (!character || !loadedRef.current) return;
    const total = MODEL_SKINS.length + customCountRef.current;
    character.setSkin(((skin % total) + total) % total);
    character.setWeapon(weapon < MESH_WEAPON_COUNT ? weapon : -1);
  };

  /** Register newly forged textures (runs BEFORE the applyLoadout effect so
   *  a freshly equipped forged index resolves against the right count). */
  useEffect(() => {
    const character = characterRef.current;
    if (!character) return;
    for (let i = customCountRef.current; i < customSkinUrls.length; i += 1) {
      const texture = new THREE.TextureLoader().load(customSkinUrls[i]);
      texture.mapping = THREE.UVMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.name = customSkinUrls[i];
      character.skinsBody.push(texture);
      customCountRef.current += 1;
    }
    if (customCountRef.current > 0 && loadedRef.current) {
      applyLoadout(pendingRef.current.skin, pendingRef.current.weapon);
    }
  }, [customSkinUrls]);

  useEffect(() => {
    applyLoadout(skinIndex, weaponIndex);
  }, [skinIndex, weaponIndex]);

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
    camera.position.set(0, CAMERA_POS_Y, CAMERA_DIST);
    camera.lookAt(0, PREVIEW_HEIGHT / 2, 0);

    // RATFIRE light language: cool key from the front-left, warm amber rim
    // kicking the silhouette from behind-right, soft ambient fill.
    const keyLight = new THREE.DirectionalLight(0xcfe8ff, 2.4);
    keyLight.position.set(-2.2, 3.2, 2.6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xfbbf24, 1.7);
    rimLight.position.set(2.4, 2.4, -2.8);
    scene.add(rimLight);
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    // Turntable: PBR podium + the character all spin together, lifted a
    // touch so the pedestal base clears the bottom of the frame.
    const turntable = new THREE.Group();
    turntable.position.y = FRAME_LIFT;
    scene.add(turntable);

    // ===== PBR podium — photo-scanned diamond-plate steel (CC0, ambientCG)
    //  replaces the old unlit flat disc. CylinderGeometry material order:
    //  [side, top, bottom]. Textures are tracked for teardown. =====
    const podiumTextures: THREE.Texture[] = [];
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const texLoader = new THREE.TextureLoader();
    const loadPodiumTex = (file: string, srgb: boolean, repeatX: number, repeatY: number) => {
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

    // Side band: a DIFFERENT photo-scanned metal (brushed "Metal 009") —
    // its linear streaks wrap around the cylinder. Fresh loads (browser
    // cache serves the files) instead of clones — a cloned texture flagged
    // needsUpdate before its shared image arrives spams "no image data"
    // upload warnings every frame.
    const sideColor = loadPodiumTex('side/color.jpg', true, PODIUM_TILE_SIDE_X, PODIUM_TILE_SIDE_Y);
    const sideNormal = loadPodiumTex('side/normal.jpg', false, PODIUM_TILE_SIDE_X, PODIUM_TILE_SIDE_Y);
    const sideRough = loadPodiumTex('side/roughness.jpg', false, PODIUM_TILE_SIDE_X, PODIUM_TILE_SIDE_Y);
    const sideMetal = loadPodiumTex('side/metalness.jpg', false, PODIUM_TILE_SIDE_X, PODIUM_TILE_SIDE_Y);

    // Studio-style environment map — metals look dead without one. Applied
    // ONLY to the podium materials so the character's tuned look is kept.
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
    // 1) Top plate — diamond-plate PBR texture A.
    const topGeometry = new THREE.CircleGeometry(PODIUM_DISC_R, 64);
    // aoMap samples the second UV channel — duplicate the circle UVs.
    topGeometry.setAttribute('uv1', topGeometry.attributes.uv);
    const topPlate = new THREE.Mesh(topGeometry, topMaterial);
    topPlate.rotation.x = -Math.PI / 2;
    turntable.add(topPlate);

    // 2) Smooth rolled rim — a torus rounding over the top edge so the
    //    plate's end reads as a machined bevel instead of a paper-thin cut.
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(PODIUM_DISC_R - 0.007, PODIUM_RIM_TUBE, 16, 72),
      rimMaterial
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = PODIUM_RIM_Y;
    turntable.add(rim);

    // 3) Body band — brushed PBR texture B, open-ended (caps covered by the
    //    top plate above and the plinth tier below).
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

    // 4) Plinth tier — wider smooth base step under the body.
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

    // Soft baked contact shadow — grounds the figure on the steel top.
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

    // Greek-key ornament decal — floats 2mm above the contact shadow and
    // spins with the turntable. Lit as metal so the inlay catches the same
    // key/rim light and env reflections as the plate around it.
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
    ornament.renderOrder = 1; // above the contact shadow
    turntable.add(ornament);

    const character = new MD2Character();
    characterRef.current = character;

    /** Bake the raw MD2 figure's XZ centroid onto the rotation axis. The
     *  original Quake model is laterally offset from its own origin
     *  (stand-pose centroid ≈ (-0.5, -5.8), bbox centre ≈ (1.5, -5.2)),
     *  which would make it ORBIT the podium centre while the turntable
     *  spins. The shift is baked into the base position attribute AND every
     *  morph-target frame (MD2 frames are absolute positions) of the body
     *  and all weapon meshes — with the same delta, so the weapon stays in
     *  the hand. Y is untouched. */
    const bakeXZCentroid = (geo: THREE.BufferGeometry, cx: number, cz: number) => {
      const frames: Array<THREE.BufferAttribute | THREE.InterleavedBufferAttribute> = [
        geo.attributes.position as THREE.BufferAttribute,
        ...((geo.morphAttributes.position ?? []) as unknown as Array<THREE.BufferAttribute>),
      ];
      for (const attr of frames) {
        if (!attr || !(attr.array instanceof Float32Array)) continue;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i] -= cx;
          arr[i + 2] -= cz;
        }
        attr.needsUpdate = true;
      }
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
    };

    character.onLoadComplete = () => {
      const body = character.meshBody;
      if (!body) return;

      const positionAttr = body.geometry.attributes
        .position as THREE.BufferAttribute;
      const bbox = new THREE.Box3().setFromBufferAttribute(positionAttr);

      // Centre the hero on the podium axis using the MEAN vertex position
      // of the frames the showcase actually plays (the 'stand' clip).
      // MD2Loader names every morph attribute after its frame (e.g.
      // "stand001"), so the stand frames are selectable by name. The old
      // bbox centre landed beside the visual body centre — the asymmetric
      // Quake stance inflates the bbox — and averaging ALL frames is no
      // better because death/pain poses (crdeath sits ~15 units off-axis)
      // drag the centre around. Mean of the 40 stand frames keeps the
      // figure's visual mass dead-centre on the turntable axis.
      const allMorphs = (body.geometry.morphAttributes.position ??
        []) as unknown as Array<THREE.BufferAttribute>;
      const standFrames = allMorphs.filter((attr) =>
        /^stand/.test(attr.name || '')
      );
      const frameAttrs: Array<
        THREE.BufferAttribute | THREE.InterleavedBufferAttribute
      > = standFrames.length > 0 ? standFrames : [positionAttr, ...allMorphs];
      let sumX = 0;
      let sumZ = 0;
      let count = 0;
      for (const attr of frameAttrs) {
        if (!attr || !(attr.array instanceof Float32Array)) continue;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) {
          sumX += arr[i];
          sumZ += arr[i + 2];
          count += 1;
        }
      }
      const cx =
        count > 0 ? sumX / count : (bbox.max.x + bbox.min.x) / 2;
      const cz =
        count > 0 ? sumZ / count : (bbox.max.z + bbox.min.z) / 2;

      bakeXZCentroid(body.geometry, cx, cz);
      for (const weapon of character.weapons) {
        if (weapon) bakeXZCentroid(weapon.geometry, cx, cz);
      }

      // Normalize the raw Quake-scale model to the showcase height.
      const rawHeight = bbox.max.y - bbox.min.y;
      const s = PREVIEW_HEIGHT / rawHeight;
      body.scale.setScalar(s);
      for (const weapon of character.weapons) weapon.scale.setScalar(s);
      character.scale = s;
      character.root.position.y = -s * bbox.min.y;

      character.setAnimation('stand');
      loadedRef.current = true;
      applyLoadout(pendingRef.current.skin, pendingRef.current.weapon);
    };

    character.loadParts({
      baseUrl: MODEL_BASE_URL,
      body: MODEL_BODY,
      skins: MODEL_SKINS,
      weapons: MODEL_WEAPONS,
    });
    turntable.add(character.root);

    // ===== responsive sizing: canvas CSS size == container at any dpr =====
    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h); // updateStyle ENABLED — the Task 9 fix
      camera.aspect = w / h;
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
        // drag flick decays into the idle auto-spin
        spinVelRef.current *= Math.pow(0.02, dt);
        const extra =
          Math.abs(spinVelRef.current) > 0.02 ? spinVelRef.current * dt : 0;
        turntable.rotation.y += AUTO_SPIN_SPEED * dt + extra;
      }
      character.mixer?.update(dt);

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
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
      character.skinsBody?.forEach((t) => t?.dispose());
      character.skinsWeapon?.forEach((t) => t?.dispose());
      character.mixer?.stopAllAction();
      characterRef.current = null;
      loadedRef.current = false;
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
