/**
 * Block type registry. Pure data — deliberately free of any renderer import so
 * the voxel layer can be reused with a different backend.
 *
 * `color` is stored here as a plain 0xRRGGBB integer. It is *description*, not
 * rendering: the render layer decides what to do with it (material colour now,
 * texture atlas index later).
 */

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const WOOD = 4;
export const GLOWSTONE = 5;

/**
 * Indexed by block id, so BLOCKS[id] is O(1).
 * - solid:    blocks player movement and stops a voxel ray
 * - opaque:   fully hides the neighbouring face (used for face culling)
 * - emissive: renders with a self-lit look
 */
export const BLOCKS = [
  { id: AIR, name: 'Air', color: 0x000000, solid: false, opaque: false, emissive: 0 },
  { id: GRASS, name: 'Grass', color: 0x5fa83c, solid: true, opaque: true, emissive: 0 },
  { id: DIRT, name: 'Dirt', color: 0x8a5a35, solid: true, opaque: true, emissive: 0 },
  { id: STONE, name: 'Stone', color: 0x8b8b8b, solid: true, opaque: true, emissive: 0 },
  { id: WOOD, name: 'Wood', color: 0xa9773f, solid: true, opaque: true, emissive: 0 },
  { id: GLOWSTONE, name: 'Glowstone', color: 0xffd977, solid: true, opaque: true, emissive: 0.85 },
];

/** Every id that can actually appear in the world (i.e. everything but air). */
export const SOLID_BLOCK_IDS = BLOCKS.filter((b) => b.id !== AIR).map((b) => b.id);

export function getBlockType(id) {
  return BLOCKS[id] ?? BLOCKS[AIR];
}

export function isSolidId(id) {
  return id !== AIR && BLOCKS[id] !== undefined && BLOCKS[id].solid;
}
