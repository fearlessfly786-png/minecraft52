import * as THREE from 'three';
import {
  createGrassField,
  type GrassStyle,
  type GrassTuftTopColor,
  type GrassTuftsHandle,
  type GrassTuftsOptions,
} from './grassTufts';

/**
 *  MINECRAFT-STYLE TALL GRASS (the double-plant sibling of grassTufts.ts)
 *  ----------------------------------------------------------------------
 *  Same DNA as the short-grass lawn — crossed pixel-art quads, up-normals,
 *  quincunx scatter, camera-cone cell streaming, InstancedMesh pool, gust
 *  wind, blade-shaped PCF shadows — stretched into the vanilla TALL
 *  variant:
 *    - TALL: 0.9 blocks high — EXACTLY DOUBLE the short tufts (0.45),
 *      knee-high on the 100-unit blocks — and a touch narrower, so each
 *      tuft reads as a slender clump instead of a scaled-up bush.
 *    - The sprite is a 16x32 canvas — the vanilla double-plant layout —
 *      with nine longer blades whose tips reach the top of the canvas.
 *    - SPARSER than the short lawn: one tuft per 10th-block grid point
 *      plus cell centres, so tall clumps dot the meadow between the
 *      short grass instead of carpeting it.
 *    - WIND: same travelling gust front, but a deeper lean multiplier —
 *      tall blades hinge visibly where short ones only tremble.
 *  Palette, shadows, streaming and everything else are shared verbatim
 *  with the short grass via the generic createGrassField() factory, so
 *  the two layers always match the ground they stand on and stream in
 *  and out of view identically.
 */

/** The TALL-GRASS style fed into the shared field factory.
 *  tuftHeight is pinned to 2x the short grass (0.45 * 2 = 0.9). */
const TALL_GRASS_STYLE: GrassStyle = {
  tuftHeight: 0.9,
  tuftWidth: 0.78,
  gridStepBlocks: 10,
  sway: 0.3,
  sprite: {
    w: 16,
    h: 32, // vanilla double-plant proportions
    // nine long blades spanning the full canvas — tips at h≈1 reach the
    // top row, shorter ones shoulder in from the sides
    blades: [
      { x: 0, h: 0.58, bend: 0 },
      { x: 2, h: 0.84, bend: -1 },
      { x: 4, h: 0.66, bend: 1 },
      { x: 6, h: 1.0, bend: -1 },
      { x: 8, h: 0.75, bend: 1 },
      { x: 10, h: 0.92, bend: 0 },
      { x: 12, h: 0.8, bend: 1 },
      { x: 14, h: 0.62, bend: -1 },
      { x: 15, h: 0.45, bend: 0 },
    ],
  },
};

export type TallGrassHandle = GrassTuftsHandle;

/** Build the tall-grass layer. Takes exactly the same world options as
 *  createGrassTufts — anchor, block size, terrain sampler, palette
 *  sampler, low-spec flag — so page.tsx can point both layers at the
 *  same meadow and palette source. */
export function createTallGrass(
  scene: THREE.Scene,
  options: GrassTuftsOptions
): GrassTuftsHandle {
  return createGrassField(scene, options, TALL_GRASS_STYLE);
}
