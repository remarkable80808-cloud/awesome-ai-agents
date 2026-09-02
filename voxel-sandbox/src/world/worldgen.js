import { GROUND_LEVEL, WORLD_RADIUS } from '../core/constants.js';
import { DIRT, GRASS, STONE } from './blocks.js';

/**
 * Fills a VoxelWorld with the Phase 1 flat terrain: a square slab of real
 * 1x1x1 voxels (not a plane mesh) so it can be mined and built on later.
 *
 * Layers, bottom to top:  stone, stone, dirt, grass  ->  walkable surface is
 * the top of GROUND_LEVEL, so the player spawns standing at y = GROUND_LEVEL + 1.
 */
export function generateFlatWorld(world, radius = WORLD_RADIUS) {
  for (let x = -radius; x < radius; x++) {
    for (let z = -radius; z < radius; z++) {
      for (let y = 0; y <= GROUND_LEVEL; y++) {
        let id = STONE;
        if (y === GROUND_LEVEL) id = GRASS;
        else if (y === GROUND_LEVEL - 1) id = DIRT;
        world.setBlock(x, y, z, id);
      }
    }
  }
  // Terrain generation isn't an "edit"; the first render pass builds everything
  // anyway, so start with a clean dirty set.
  world.clearDirty();
  return world;
}
