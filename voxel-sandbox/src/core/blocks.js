/**
 * Block type registry.
 *
 * Pure data — no Three.js. The renderer reads `color` from here to build
 * materials, but nothing in this file knows a renderer exists.
 */

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  GLOWSTONE: 5,
};

/**
 * Indexed by block id so a lookup is a plain array access (this runs inside
 * the meshing loop over every voxel, so avoid object/map hashing).
 */
export const BLOCK_TYPES = [
  { id: BLOCK.AIR,       name: 'Air',       solid: false, color: 0x000000, emissive: 0x000000 },
  { id: BLOCK.GRASS,     name: 'Grass',     solid: true,  color: 0x5da130, emissive: 0x000000 },
  { id: BLOCK.DIRT,      name: 'Dirt',      solid: true,  color: 0x8b5a2b, emissive: 0x000000 },
  { id: BLOCK.STONE,     name: 'Stone',     solid: true,  color: 0x8a8a8f, emissive: 0x000000 },
  { id: BLOCK.WOOD,      name: 'Wood',      solid: true,  color: 0xa9743a, emissive: 0x000000 },
  { id: BLOCK.GLOWSTONE, name: 'Glowstone', solid: true,  color: 0xf6d97a, emissive: 0x6b5410 },
];

/** Block ids that actually get rendered/collided (everything except air). */
export const SOLID_BLOCK_IDS = BLOCK_TYPES.filter((t) => t.solid).map((t) => t.id);

export function isSolidId(id) {
  const type = BLOCK_TYPES[id];
  return type !== undefined && type.solid;
}
