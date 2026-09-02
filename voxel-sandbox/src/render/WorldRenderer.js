/**
 * Turns World voxel data into Three.js geometry.
 *
 * One InstancedMesh per block type (so each type keeps its own material) and
 * only *exposed* blocks get an instance — a buried block contributes nothing
 * visible, so meshing it would be pure waste.
 *
 * This is the only place that knows both about voxels and about Three.js;
 * World/physics stay renderer-agnostic.
 */

import * as THREE from 'three';
import { BLOCK_TYPES, SOLID_BLOCK_IDS } from '../core/blocks.js';

// Shared unit cube. Instances are positioned at block centres, so the geometry
// itself is centred on the origin and needs no offset baked in.
const CUBE = new THREE.BoxGeometry(1, 1, 1);

// How far each block's colour may drift from its base colour, as a multiplier.
const TINT_JITTER = 0.09;

/**
 * Deterministic per-block noise in [0, 1).
 *
 * A hash rather than Math.random() so a block keeps the same shade across
 * rebuilds — otherwise the whole terrain would shimmer every time you mined a
 * single block. Integer mixing (xorshift-style) of the three coordinates.
 */
function blockNoise(x, y, z) {
  let h = (x * 374761393) ^ (y * 668265263) ^ (z * 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

export class WorldRenderer {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.meshes = new Map(); // block id -> InstancedMesh
    this.lastVersion = -1;
    this._matrix = new THREE.Matrix4();
    this._color = new THREE.Color();

    for (const id of SOLID_BLOCK_IDS) {
      const type = BLOCK_TYPES[id];
      const material = new THREE.MeshLambertMaterial({
        color: type.color,
        emissive: type.emissive,
      });

      // Worst case every block in the world is of this one type and exposed.
      // Allocating the full volume up front means block edits never have to
      // reallocate; the buffer is ~32k * 16 floats which is cheap enough here
      // and will need revisiting only if the world grows a lot.
      const capacity = world.sizeX * world.sizeY * world.sizeZ;
      const mesh = new THREE.InstancedMesh(CUBE, material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // instances span the whole world anyway
      mesh.count = 0;
      mesh.name = `blocks:${type.name}`;
      // Per-instance tint: without it a field of identically coloured cubes
      // reads as one flat surface and the voxel grid is invisible.
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(capacity * 3), 3,
      );
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.meshes.set(id, mesh);
      scene.add(mesh);
    }
  }

  /** Re-mesh only when the world data actually changed since the last build. */
  update() {
    if (this.world.version === this.lastVersion) return false;
    this.rebuild();
    this.lastVersion = this.world.version;
    return true;
  }

  rebuild() {
    const world = this.world;
    const counts = new Map();
    for (const id of this.meshes.keys()) counts.set(id, 0);

    for (let y = 0; y < world.sizeY; y++) {
      for (let z = 0; z < world.sizeZ; z++) {
        for (let x = 0; x < world.sizeX; x++) {
          const id = world.blocks[world.index(x, y, z)];
          if (id === 0) continue;
          const mesh = this.meshes.get(id);
          if (!mesh) continue;
          if (!world.isExposed(x, y, z)) continue;

          // Block (x,y,z) spans [x, x+1], so its centre sits at +0.5.
          this._matrix.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
          const i = counts.get(id);
          mesh.setMatrixAt(i, this._matrix);

          // instanceColor is MULTIPLIED by material.color by the shader, so
          // this must be a factor around 1.0 — writing the absolute colour
          // here would square the albedo and turn every block near-black.
          // setRGB writes raw working-space (linear) values, which is exactly
          // what a multiplier wants: no sRGB conversion.
          const shade = 1 + (blockNoise(x, y, z) * 2 - 1) * TINT_JITTER;
          this._color.setRGB(shade, shade, shade);
          mesh.setColorAt(i, this._color);

          counts.set(id, i + 1);
        }
      }
    }

    for (const [id, mesh] of this.meshes) {
      mesh.count = counts.get(id);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // Instances move around between rebuilds; the cached bounds would
      // otherwise be stale and break raycasting against the mesh.
      mesh.computeBoundingSphere();
    }
  }

  /** Total instances currently drawn — surfaced in the HUD for perf checks. */
  get instanceCount() {
    let total = 0;
    for (const mesh of this.meshes.values()) total += mesh.count;
    return total;
  }
}
