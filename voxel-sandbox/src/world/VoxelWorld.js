import { CHUNK_SIZE, WORLD_HEIGHT } from '../core/constants.js';
import { AIR, isSolidId, getBlockType } from './blocks.js';

/**
 * Sparse, chunked voxel storage. This is the single source of truth for the
 * world's contents and it knows nothing about Three.js — the render layer
 * reads from it, never the other way around.
 *
 * Layout: chunks are CHUNK_SIZE x WORLD_HEIGHT x CHUNK_SIZE columns keyed by
 * their chunk coordinate. Each chunk is one flat Uint8Array indexed
 * y-major so that vertical scans (the common case for terrain) stay
 * cache-friendly:  index = (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx
 */
export class VoxelWorld {
  constructor() {
    /** @type {Map<string, Uint8Array>} chunk key -> voxel ids */
    this.chunks = new Map();
    /** Chunk keys whose contents changed since the last render rebuild. */
    this.dirtyChunks = new Set();
    /** Bumped on every mutation so consumers can cheaply detect "anything changed". */
    this.revision = 0;
  }

  static chunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  /**
   * Floor division — plain `/ CHUNK_SIZE | 0` truncates toward zero, which puts
   * x = -1 in chunk 0 instead of chunk -1. Math.floor is the correct mapping
   * for negative coordinates.
   */
  static toChunkCoord(v) {
    return Math.floor(v / CHUNK_SIZE);
  }

  /** Positive modulo, so local offsets stay in [0, CHUNK_SIZE) for negative world coords. */
  static toLocalCoord(v) {
    return ((v % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  }

  static localIndex(lx, y, lz) {
    return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
  }

  getChunk(cx, cz, createIfMissing = false) {
    const key = VoxelWorld.chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk && createIfMissing) {
      chunk = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE); // zero-filled == all air
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /** Returns the block id at integer world coords; AIR for anything unloaded or out of range. */
  getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return AIR;
    const chunk = this.chunks.get(
      VoxelWorld.chunkKey(VoxelWorld.toChunkCoord(x), VoxelWorld.toChunkCoord(z))
    );
    if (!chunk) return AIR;
    return chunk[
      VoxelWorld.localIndex(VoxelWorld.toLocalCoord(x), y, VoxelWorld.toLocalCoord(z))
    ];
  }

  /**
   * Writes a block id. Returns true if something actually changed.
   * Marks the owning chunk dirty, plus any neighbouring chunk whose border
   * faces could now be exposed or hidden by this edit.
   */
  setBlock(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return false;

    const cx = VoxelWorld.toChunkCoord(x);
    const cz = VoxelWorld.toChunkCoord(z);
    const chunk = this.getChunk(cx, cz, true);
    const lx = VoxelWorld.toLocalCoord(x);
    const lz = VoxelWorld.toLocalCoord(z);
    const index = VoxelWorld.localIndex(lx, y, lz);

    if (chunk[index] === id) return false;
    chunk[index] = id;

    this.dirtyChunks.add(VoxelWorld.chunkKey(cx, cz));
    // A block on a chunk border changes the face-culling result for the chunk
    // next door, so that one has to be rebuilt too.
    if (lx === 0) this.dirtyChunks.add(VoxelWorld.chunkKey(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) this.dirtyChunks.add(VoxelWorld.chunkKey(cx + 1, cz));
    if (lz === 0) this.dirtyChunks.add(VoxelWorld.chunkKey(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) this.dirtyChunks.add(VoxelWorld.chunkKey(cx, cz + 1));

    this.revision++;
    return true;
  }

  /** Convenience wrappers used by physics and (later) raycasting. */
  isSolid(x, y, z) {
    return isSolidId(this.getBlock(x, y, z));
  }

  /**
   * Face-culling query — "does this neighbour hide the face pointing at it?"
   *
   * Anything below y = 0 counts as opaque bedrock. It is never a *solid* block
   * (physics still treats it as empty), but the underside of the world floor
   * can't be looked at, and culling it drops roughly half the terrain geometry
   * in a flat world.
   */
  isOpaque(x, y, z) {
    if (y < 0) return true;
    return getBlockType(this.getBlock(x, y, z)).opaque;
  }

  /**
   * True when the block has at least one air-facing side, i.e. it is worth
   * drawing. Fully buried blocks are invisible and get skipped by the mesher.
   */
  isExposed(x, y, z) {
    return (
      !this.isOpaque(x + 1, y, z) ||
      !this.isOpaque(x - 1, y, z) ||
      !this.isOpaque(x, y + 1, z) ||
      !this.isOpaque(x, y - 1, z) ||
      !this.isOpaque(x, y, z + 1) ||
      !this.isOpaque(x, y, z - 1)
    );
  }

  clearDirty() {
    this.dirtyChunks.clear();
  }

  /**
   * Walks every non-air block in the given world-space box (inclusive bounds),
   * calling cb(x, y, z, id). Used by the mesher; kept here so callers never
   * need to know how chunks are laid out.
   */
  forEachBlockInBox(minX, minY, minZ, maxX, maxY, maxZ, cb) {
    const y0 = Math.max(0, minY);
    const y1 = Math.min(WORLD_HEIGHT - 1, maxY);
    for (let cx = VoxelWorld.toChunkCoord(minX); cx <= VoxelWorld.toChunkCoord(maxX); cx++) {
      for (let cz = VoxelWorld.toChunkCoord(minZ); cz <= VoxelWorld.toChunkCoord(maxZ); cz++) {
        const chunk = this.chunks.get(VoxelWorld.chunkKey(cx, cz));
        if (!chunk) continue;
        const baseX = cx * CHUNK_SIZE;
        const baseZ = cz * CHUNK_SIZE;
        for (let y = y0; y <= y1; y++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const z = baseZ + lz;
            if (z < minZ || z > maxZ) continue;
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
              const x = baseX + lx;
              if (x < minX || x > maxX) continue;
              const id = chunk[VoxelWorld.localIndex(lx, y, lz)];
              if (id !== AIR) cb(x, y, z, id);
            }
          }
        }
      }
    }
  }
}
