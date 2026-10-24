/**
 * SPARK's "MAGMA VANGUARD" costume — a pure PAINT JOB that turns the
 * stock RobotExpressive.glb (three flat plastic colours, no textures,
 * no UVs) into RATFIRE's ember-forged fire robot.
 *
 * The GLB ships three untextured materials ("Main" orange-brown plastic,
 * "Grey" plastic, "Black" face parts) and NOT A SINGLE UV SET — so the
 * costume first generates box-projected UVs for every mesh (dominant
 * normal-axis projection), then applies a shared procedural
 * armour-plate canvas texture — panel seams, rivets, battle scratches
 * and grime — through three re-tinted PBR materials:
 *
 *   - Main   → molten orange-red lacquer (the shell armour)
 *   - Grey   → gunmetal (the joints + under-suit)
 *   - Black  → gloss BLACK (the eyes + eyebrows — deliberately dark
 *              and unlit, no glow)
 *
 * NO extra geometry is added — every shape on the robot is the original
 * model; only its skin changed.
 *
 * Both the in-game pet (robotPet.ts) and the PET-panel display room
 * (RobotPreview.tsx) call applySparkCostume(); dispose() frees the
 * texture and materials the costume created.
 *
 * Call this AFTER the caller has scaled/grounded the model and attached
 * it to its scene — the UV projection wants the model's native size,
 * which is derived from the placed world box and the caller's scale.
 */

import * as THREE from 'three';

export interface SparkCostume {
  /** Free every texture/material the costume created. */
  dispose(): void;
}

/** Box-project UVs onto a UV-less geometry: for every vertex pick the
 *  dominant normal axis and take planar (u, v) from the other two native
 *  coordinates, scaled so `tile` model units = one texture repeat. The
 *  armour texture is a seamless-ish plate pattern, so island seams read
 *  as panel joints — exactly the look a combat robot wants. */
function addBoxProjectionUVs(geo: THREE.BufferGeometry, tile: number): void {
  if (geo.attributes.uv || tile <= 0) return;
  const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
  const nor = geo.attributes.normal as THREE.BufferAttribute | undefined;
  if (!pos || !nor) return;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    let u: number;
    let v: number;
    if (ax >= ay && ax >= az) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else if (ay >= az) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** The shared armour-plate albedo: lacquer-ready light grey (materials
 *  tint it by multiplication), 4x4 panel grid with rivets, battle wear.
 *  512px keeps it crisp on the PET podium and cheap in VRAM. */
function makeArmorPlateTexture(): THREE.CanvasTexture {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d')!;

  // base lacquer
  g.fillStyle = '#c9c9c9';
  g.fillRect(0, 0, S, S);

  // brushed horizontal sheen bands
  for (let i = 0; i < 42; i++) {
    const y = Math.random() * S;
    const h = 4 + Math.random() * 26;
    const v = Math.random() > 0.5 ? 255 : 60;
    g.fillStyle = `rgba(${v},${v},${v},0.05)`;
    g.fillRect(0, y, S, h);
  }

  // grime blotches
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 10 + Math.random() * 34;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(38,38,44,0.11)');
    grad.addColorStop(1, 'rgba(38,38,44,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // panel grid — 4 panels per tile, dark seam + top highlight
  const P = S / 4;
  for (let i = 0; i <= 4; i++) {
    const p = i * P;
    g.fillStyle = 'rgba(52,52,58,0.85)';
    g.fillRect(p - 2, 0, 4, S);
    g.fillRect(0, p - 2, S, 4);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(p + 2, 0, 1, S);
    g.fillRect(0, p + 2, S, 1);
  }

  // rivets: inset corners of every panel
  const rivet = (x: number, y: number) => {
    g.fillStyle = 'rgba(45,45,50,0.9)';
    g.beginPath();
    g.arc(x, y, 3.1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath();
    g.arc(x - 0.9, y - 0.9, 1.5, 0, Math.PI * 2);
    g.fill();
  };
  const inset = 9;
  for (let ix = 0; ix < 4; ix++) {
    for (let iy = 0; iy < 4; iy++) {
      const x0 = ix * P;
      const y0 = iy * P;
      rivet(x0 + inset, y0 + inset);
      rivet(x0 + P - inset, y0 + inset);
      rivet(x0 + inset, y0 + P - inset);
      rivet(x0 + P - inset, y0 + P - inset);
    }
  }

  // battle scratches — bright paint-chip streaks + dark gouges
  for (let i = 0; i < 44; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const len = 6 + Math.random() * 34;
    const a = Math.random() * Math.PI * 2;
    g.strokeStyle =
      Math.random() > 0.35
        ? 'rgba(238,238,238,0.5)'
        : 'rgba(60,60,64,0.45)';
    g.lineWidth = Math.random() > 0.7 ? 1.6 : 0.9;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function applySparkCostume(
  model: THREE.Object3D,
  opts: { lowSpec?: boolean } = {}
): SparkCostume {
  void opts; // kept for API stability with both call sites

  // fresh materials per costume instance (safe to dispose with the pet)
  const mats: THREE.Material[] = [];
  const own = <T extends THREE.Material>(m: T): T => {
    mats.push(m);
    return m;
  };

  // make sure the box below measures the TRUE placed transform
  model.updateWorldMatrix(true, true);

  // ---- UV projection scale: six texture repeats over the robot's
  // height, 4 panels each → a panel is ~1/24 of the body height:
  // readable up close, fading to texture at gameplay distance ----
  const placedBox = new THREE.Box3().setFromObject(model);
  const placedSize = new THREE.Vector3();
  placedBox.getSize(placedSize);
  const scale = model.scale.y || 1;
  const nativeH = Math.max(0.0001, placedSize.y / scale);
  const tile = nativeH / 6;

  const tex = makeArmorPlateTexture();

  const lacquer = own(
    new THREE.MeshStandardMaterial({
      name: 'CostumeLacquer',
      color: 0xc2400e, // molten orange-red shell
      map: tex,
      metalness: 0.38,
      roughness: 0.46,
    })
  );
  const gunmetal = own(
    new THREE.MeshStandardMaterial({
      name: 'CostumeGunmetal',
      color: 0x5a6068, // under-suit + joints
      map: tex,
      metalness: 0.62,
      roughness: 0.4,
    })
  );
  const obsidian = own(
    new THREE.MeshStandardMaterial({
      name: 'CostumeObsidian',
      color: 0x050505, // eyes + eyebrows — plain gloss black, no glow
      metalness: 0.2,
      roughness: 0.3,
    })
  );

  /** Swap one original material for its costume repaint. */
  const repaint = (orig: THREE.Material): THREE.Material => {
    switch (orig.name) {
      case 'Main':
        return lacquer;
      case 'Grey':
        return gunmetal;
      case 'Black':
        return obsidian;
      default:
        return orig; // unknown — leave untouched
    }
  };

  // collect originals first (they are SHARED across meshes), swap, then
  // dispose the retired set once every mesh has been re-materialed.
  // NOTE the material's SHAPE is preserved: an array assignment on a
  // group-less geometry (single-primitive meshes) makes the renderer
  // draw zero groups — the whole robot would go invisible.
  const retired = new Set<THREE.Material>();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    addBoxProjectionUVs(mesh.geometry as THREE.BufferGeometry, tile);
    if (Array.isArray(mesh.material)) {
      for (const m of mesh.material) retired.add(m);
      mesh.material = mesh.material.map(repaint);
    } else {
      retired.add(mesh.material);
      mesh.material = repaint(mesh.material);
    }
  });
  for (const m of retired) m.dispose();

  function dispose(): void {
    for (const m of mats) m.dispose();
    tex.dispose();
  }

  return { dispose };
}
