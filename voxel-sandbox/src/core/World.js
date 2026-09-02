/**
 * Voxel world state. Pure data + queries, no rendering concepts at all.
 *
 * Coordinate system: block (x, y, z) occupies the AABB
 *   [x, x+1] x [y, y+1] x [z, z+1]
 * in world units, so the block's centre is at (x+0.5, y+0.5, z+0.5).
 * +Y is up. The world origin is the corner of block (0,0,0).
 */

import { BLOCK, isSolidId } from './blocks.js';

export class World {
  constructor({ sizeX = 32, sizeY = 32, sizeZ = 32 } = {}) {
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.sizeZ = sizeZ;

    // Flat array beats nested arrays for cache locality during meshing.
    this.blocks = new Uint8Array(sizeX * sizeY * sizeZ);

    // Bumped on every mutation so the renderer can skip rebuilds when nothing
    // changed. The renderer stores the last version it meshed.
    this.version = 0;
  }

  /** Row-major with x fastest: neighbours in x are adjacent in memory. */
  index(x, y, z) {
    return (y * this.sizeZ + z) * this.sizeX + x;
  }

  inBounds(x, y, z) {
    return (
      x >= 0 && x < this.sizeX &&
      y >= 0 && y < this.sizeY &&
      z >= 0 && z < this.sizeZ
    );
  }

  /** Reads outside the volume return AIR. Used by meshing/raycasting. */
  getBlock(x, y, z) {
    if (!this.inBounds(x, y, z)) return BLOCK.AIR;
    return this.blocks[this.index(x, y, z)];
  }

  /** No-op outside the volume. Returns true if the world actually changed. */
  setBlock(x, y, z, id) {
    if (!this.inBounds(x, y, z)) return false;
    const i = this.index(x, y, z);
    if (this.blocks[i] === id) return false;
    this.blocks[i] = id;
    this.version++;
    return true;
  }

  /** True if a *rendered* block sits here (out of bounds = empty). */
  isOpaqueAt(x, y, z) {
    return isSolidId(this.getBlock(x, y, z));
  }

  /**
   * True if physics should treat this cell as blocking.
   *
   * Deliberately different from `isOpaqueAt`: everything outside the volume
   * counts as solid, which gives the arena invisible walls and a floor under
   * y=0 so the player can never leave the world or fall out of it. Above the
   * world (y >= sizeY) is left open so you can still jump at max height.
   */
  isCollidableAt(x, y, z) {
    if (y >= this.sizeY) return false;
    if (y < 0) return true;
    if (x < 0 || x >= this.sizeX || z < 0 || z >= this.sizeZ) return true;
    return isSolidId(this.blocks[this.index(x, y, z)]);
  }

  /** Highest solid block at this column, or -1 if the column is empty. */
  highestSolidY(x, z) {
    for (let y = this.sizeY - 1; y >= 0; y--) {
      if (this.isOpaqueAt(x, y, z)) return y;
    }
    return -1;
  }

  /**
   * A block is visible only if at least one of its six faces touches air.
   * Fully buried blocks are skipped by the mesher, which is what keeps the
   * instance count down (a 32x32x3 slab drops from 3072 to ~1400 instances).
   */
  isExposed(x, y, z) {
    return (
      !this.isOpaqueAt(x + 1, y, z) ||
      !this.isOpaqueAt(x - 1, y, z) ||
      !this.isOpaqueAt(x, y + 1, z) ||
      !this.isOpaqueAt(x, y - 1, z) ||
      !this.isOpaqueAt(x, y, z + 1) ||
      !this.isOpaqueAt(x, y, z - 1)
    );
  }
}

/**
 * Phase 1 world generation: a flat slab of terrain plus two small test
 * structures (a staircase and a pillar) so ground/wall collision and jumping
 * can actually be exercised. Both are ordinary blocks — Phase 2 mining will
 * remove them.
 */
export function generateFlatWorld(world) {
  const groundTop = 2; // topmost terrain layer index

  for (let x = 0; x < world.sizeX; x++) {
    for (let z = 0; z < world.sizeZ; z++) {
      world.setBlock(x, 0, z, BLOCK.STONE);
      world.setBlock(x, 1, z, BLOCK.DIRT);
      world.setBlock(x, groundTop, z, BLOCK.GRASS);
    }
  }

  const cx = Math.floor(world.sizeX / 2);
  const cz = Math.floor(world.sizeZ / 2);

  // 4-step staircase: each step is one block taller, to verify the player can
  // walk/jump up single-block rises.
  for (let step = 1; step <= 4; step++) {
    const x = cx + 3 + step;
    for (let h = 1; h <= step; h++) {
      world.setBlock(x, groundTop + h, cz, BLOCK.STONE);
      world.setBlock(x, groundTop + h, cz + 1, BLOCK.STONE);
    }
  }

  // Wall + glowstone cap: something to bump into and to sight against.
  for (let h = 1; h <= 4; h++) {
    for (let dz = -2; dz <= 2; dz++) {
      world.setBlock(cx - 5, groundTop + h, cz + dz, BLOCK.WOOD);
    }
  }
  world.setBlock(cx - 5, groundTop + 5, cz, BLOCK.GLOWSTONE);

  return world;
}
