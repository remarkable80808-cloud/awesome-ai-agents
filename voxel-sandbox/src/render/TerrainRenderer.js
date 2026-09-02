import * as THREE from 'three';
import { RENDER_DISTANCE, WORLD_HEIGHT } from '../core/constants.js';
import { BLOCKS, AIR } from '../world/blocks.js';

const INITIAL_CAPACITY = 4096;

/** How far each block's tint may stray from its base colour, as a multiplier. */
const TINT_RANGE = 0.14;

/**
 * Deterministic per-block noise in [0, 1).
 *
 * Untextured cubes of the same type are pixel-identical, so a field of them
 * reads as one flat sheet with no visible grid. A small per-block brightness
 * jitter restores that grid. It must be a pure function of the coordinate
 * (not random) or blocks would shimmer every time the mesh is rebuilt.
 */
function blockNoise(x, y, z) {
  // Cheap integer hash: multiply each axis by a distinct large odd constant,
  // mix with xor-shifts, then take the low bits as a fraction.
  let h = (x * 374761393) ^ (y * 668265263) ^ (z * 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * Turns VoxelWorld state into drawable geometry.
 *
 * One InstancedMesh per block type: every block of a type shares one geometry
 * and one material, so the whole terrain costs a handful of draw calls instead
 * of thousands of Mesh objects.
 *
 * Two things keep the instance count sane:
 *  1. only blocks inside RENDER_DISTANCE of the player are considered;
 *  2. fully buried blocks are skipped — if all six neighbours are opaque the
 *     block cannot contribute a single visible pixel.
 */
export class TerrainRenderer {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;

    // Unit cube shared by every instanced mesh. Offset so the geometry occupies
    // [0,1] on each axis: instance translation can then be the integer block
    // coordinate directly, with no +0.5 fudge at every call site.
    this.geometry = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);

    /** @type {Map<number, THREE.InstancedMesh>} block id -> mesh */
    this.meshes = new Map();
    /** @type {Map<number, number[]>} block id -> flat [x,y,z,...] scratch buffer */
    this.buffers = new Map();

    for (const block of BLOCKS) {
      if (block.id === AIR) continue;
      this.meshes.set(block.id, this._createMesh(block, INITIAL_CAPACITY));
      this.buffers.set(block.id, []);
    }

    this._matrix = new THREE.Matrix4();
    this._color = new THREE.Color();
    /** World revision the current geometry was built from; -1 forces a first build. */
    this.builtRevision = -1;
    this.builtCenter = { x: NaN, z: NaN };
    this.instanceCount = 0;
  }

  _createMesh(block, capacity) {
    const material = new THREE.MeshLambertMaterial({
      color: block.color,
      // Emissive blocks read as "lit" without needing an actual light source.
      emissive: block.emissive > 0 ? new THREE.Color(block.color) : 0x000000,
      emissiveIntensity: block.emissive,
    });
    const mesh = new THREE.InstancedMesh(this.geometry, material, capacity);
    mesh.count = 0;
    // The terrain always surrounds the camera, so whole-mesh frustum culling
    // would only ever cost us a bounding-sphere recompute per rebuild.
    mesh.frustumCulled = false;
    mesh.name = `terrain:${block.name}`;
    this.scene.add(mesh);
    return mesh;
  }

  /** Replaces a mesh with a bigger one when the block count outgrows it. */
  _growMesh(blockId, needed) {
    const old = this.meshes.get(blockId);
    let capacity = old.instanceMatrix.count;
    while (capacity < needed) capacity *= 2;

    this.scene.remove(old);
    old.dispose();
    const block = BLOCKS[blockId];
    const mesh = this._createMesh(block, capacity);
    this.meshes.set(blockId, mesh);
    return mesh;
  }

  /**
   * Rebuilds instance data if the world changed or the player moved to a new
   * block column. Cheap no-op otherwise, so it is safe to call every frame.
   */
  update(playerPosition) {
    const centerX = Math.floor(playerPosition.x);
    const centerZ = Math.floor(playerPosition.z);
    const moved = centerX !== this.builtCenter.x || centerZ !== this.builtCenter.z;
    if (!moved && this.world.revision === this.builtRevision) return;

    this.builtCenter = { x: centerX, z: centerZ };
    this.builtRevision = this.world.revision;
    this.world.clearDirty();
    this._rebuild(centerX, centerZ);
  }

  _rebuild(centerX, centerZ) {
    for (const buffer of this.buffers.values()) buffer.length = 0;

    const r = RENDER_DISTANCE;
    this.world.forEachBlockInBox(
      centerX - r,
      0,
      centerZ - r,
      centerX + r,
      WORLD_HEIGHT - 1,
      centerZ + r,
      (x, y, z, id) => {
        if (!this.world.isExposed(x, y, z)) return;
        const buffer = this.buffers.get(id);
        if (buffer) buffer.push(x, y, z);
      }
    );

    let total = 0;
    for (const [blockId, buffer] of this.buffers) {
      const count = buffer.length / 3;
      let mesh = this.meshes.get(blockId);
      if (count > mesh.instanceMatrix.count) mesh = this._growMesh(blockId, count);

      const base = BLOCKS[blockId].color;
      for (let i = 0; i < count; i++) {
        const x = buffer[i * 3];
        const y = buffer[i * 3 + 1];
        const z = buffer[i * 3 + 2];
        this._matrix.makeTranslation(x, y, z);
        mesh.setMatrixAt(i, this._matrix);

        // Per-instance tint is multiplied against the material colour, so we
        // store a brightness scale around 1.0 rather than the colour itself.
        const shade = 1 + (blockNoise(x, y, z) - 0.5) * 2 * TINT_RANGE;
        this._color.setHex(base).multiplyScalar(shade);
        mesh.setColorAt(i, this._color);
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      total += count;
    }
    this.instanceCount = total;
  }

  dispose() {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh);
      mesh.material.dispose();
      mesh.dispose();
    }
    this.geometry.dispose();
    this.meshes.clear();
  }
}
