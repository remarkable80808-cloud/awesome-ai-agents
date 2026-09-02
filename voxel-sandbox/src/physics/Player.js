import {
  AIR_ACCEL,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_FRICTION,
  JUMP_VELOCITY,
  PITCH_LIMIT,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  SPRINT_SPEED,
  TERMINAL_VELOCITY,
  VOID_Y,
  WALK_SPEED,
} from '../core/constants.js';

/** Push-out distance used after a collision so the player never rests exactly
 *  on a block plane (exact equality re-triggers the collision next frame). */
const SKIN = 1e-3;
/** The AABB is shrunk by this before picking which voxels to test, so a box
 *  whose face lands exactly on x = 4.0 doesn't claim to overlap block 4. */
const EDGE_BIAS = 1e-4;

/**
 * Player state + movement simulation.
 *
 * Intentionally engine-agnostic: positions are plain numbers and the only
 * thing it touches is the VoxelWorld query interface (`isSolid`). The renderer
 * reads `position` / `yaw` / `pitch` to drive the camera.
 */
export class Player {
  constructor(x = 0.5, y = 8, z = 0.5) {
    // Feet position: x/z are the horizontal centre of the box, y is its base.
    this.position = { x, y, z };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.spawn = { x, y, z };

    this.yaw = 0; // radians, rotation about +Y. 0 looks down -Z.
    this.pitch = 0; // radians, positive looks up.

    this.onGround = false;
    this.sprinting = false;
  }

  /** Eye position, i.e. where the camera goes. */
  getEyeY(eyeHeight) {
    return this.position.y + eyeHeight;
  }

  /** Unit forward vector on the XZ plane, derived from yaw. */
  getForward() {
    // Three.js convention: yaw = 0 faces -Z. Rotating (0,0,-1) by yaw about +Y
    // gives (-sin(yaw), 0, -cos(yaw)).
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  /** Unit right vector on the XZ plane (forward rotated -90 degrees about +Y). */
  getRight() {
    return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
  }

  applyLook(deltaX, deltaY, sensitivity) {
    // Moving the mouse right should turn the view right, which is a *negative*
    // rotation about +Y under the right-hand rule. Same sign logic for pitch.
    this.yaw -= deltaX * sensitivity;
    this.pitch -= deltaY * sensitivity;
    if (this.pitch > PITCH_LIMIT) this.pitch = PITCH_LIMIT;
    if (this.pitch < -PITCH_LIMIT) this.pitch = -PITCH_LIMIT;
  }

  respawn() {
    this.position.x = this.spawn.x;
    this.position.y = this.spawn.y;
    this.position.z = this.spawn.z;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
  }

  /**
   * Advances the simulation by one fixed substep.
   *
   * @param {VoxelWorld} world
   * @param {{forward:number, right:number, jump:boolean, sprint:boolean}} intent
   *        forward/right are in [-1, 1]; they describe *desired* motion, not velocity.
   * @param {number} dt fixed substep in seconds
   */
  update(world, intent, dt) {
    this.sprinting = intent.sprint && intent.forward > 0;

    // --- Horizontal: steer the current velocity toward the intended velocity ---
    const forward = this.getForward();
    const right = this.getRight();

    let wishX = forward.x * intent.forward + right.x * intent.right;
    let wishZ = forward.z * intent.forward + right.z * intent.right;

    // Normalise so diagonal input isn't ~1.41x faster than straight input.
    const wishLength = Math.hypot(wishX, wishZ);
    if (wishLength > 1e-6) {
      wishX /= wishLength;
      wishZ /= wishLength;
    }

    const speed = this.sprinting ? SPRINT_SPEED : WALK_SPEED;
    const targetX = wishX * speed;
    const targetZ = wishZ * speed;

    // On the ground we accelerate hard (snappy FPS feel); in the air we barely
    // steer at all, so a jump commits to its trajectory.
    const accel = this.onGround ? GROUND_ACCEL : AIR_ACCEL;
    const maxDelta = accel * dt;

    // Steer the velocity *vector* toward the target, not each component
    // separately. Clamping x and z independently would let diagonal input
    // change speed sqrt(2) times faster than straight input, which is
    // measurable as a "diagonal is quicker off the mark" bug.
    const dvx = targetX - this.velocity.x;
    const dvz = targetZ - this.velocity.z;
    const dvLength = Math.hypot(dvx, dvz);
    if (dvLength <= maxDelta || dvLength < 1e-9) {
      this.velocity.x = targetX;
      this.velocity.z = targetZ;
    } else {
      this.velocity.x += (dvx / dvLength) * maxDelta;
      this.velocity.z += (dvz / dvLength) * maxDelta;
    }

    // Extra friction when there is no input, so the player stops rather than glides.
    if (this.onGround && wishLength < 1e-6) {
      const damping = Math.max(0, 1 - GROUND_FRICTION * dt);
      this.velocity.x *= damping;
      this.velocity.z *= damping;
    }

    // --- Vertical ---
    if (intent.jump && this.onGround) {
      this.velocity.y = JUMP_VELOCITY;
      this.onGround = false;
    }
    this.velocity.y -= GRAVITY * dt;
    if (this.velocity.y < -TERMINAL_VELOCITY) this.velocity.y = -TERMINAL_VELOCITY;

    // --- Integrate + resolve, one axis at a time ---
    // Solving axes independently is what makes wall-sliding work: a blocked X
    // move zeroes only vx, leaving the Z component of the motion intact.
    // It is only valid while each step is shorter than one block, which the
    // fixed timestep guarantees at our speeds (7.2 / 120 = 0.06 blocks).
    this.moveAxis(world, 'x', this.velocity.x * dt);
    this.moveAxis(world, 'z', this.velocity.z * dt);
    this.onGround = false;
    this.moveAxis(world, 'y', this.velocity.y * dt);

    if (this.position.y < VOID_Y) this.respawn();
  }

  /**
   * Moves along one axis and undoes the part of the move that ended up inside
   * a solid block.
   */
  moveAxis(world, axis, delta) {
    if (delta === 0) return;
    this.position[axis] += delta;
    if (!this.collides(world)) return;

    const p = this.position;
    if (axis === 'y') {
      if (delta < 0) {
        // Fell into the floor: sit on the top face of the block the feet entered.
        p.y = Math.floor(p.y) + 1;
        this.onGround = true;
      } else {
        // Head hit a ceiling: drop back so the top of the box clears the block.
        p.y = Math.floor(p.y + PLAYER_HEIGHT) - PLAYER_HEIGHT - SKIN;
      }
      this.velocity.y = 0;
      return;
    }

    // Horizontal: back the leading face out to the block plane it crossed.
    if (delta > 0) {
      p[axis] = Math.floor(p[axis] + PLAYER_HALF_WIDTH) - PLAYER_HALF_WIDTH - SKIN;
    } else {
      p[axis] = Math.floor(p[axis] - PLAYER_HALF_WIDTH) + 1 + PLAYER_HALF_WIDTH + SKIN;
    }
    this.velocity[axis] = 0;
  }

  /** True if the player's AABB overlaps any solid voxel. */
  collides(world) {
    const { x, y, z } = this.position;
    // Integer voxel range covered by the box. EDGE_BIAS keeps a face that lands
    // exactly on a block boundary from counting the block beyond it.
    const x0 = Math.floor(x - PLAYER_HALF_WIDTH + EDGE_BIAS);
    const x1 = Math.floor(x + PLAYER_HALF_WIDTH - EDGE_BIAS);
    const y0 = Math.floor(y + EDGE_BIAS);
    const y1 = Math.floor(y + PLAYER_HEIGHT - EDGE_BIAS);
    const z0 = Math.floor(z - PLAYER_HALF_WIDTH + EDGE_BIAS);
    const z1 = Math.floor(z + PLAYER_HALF_WIDTH - EDGE_BIAS);

    for (let bx = x0; bx <= x1; bx++) {
      for (let by = y0; by <= y1; by++) {
        for (let bz = z0; bz <= z1; bz++) {
          if (world.isSolid(bx, by, bz)) return true;
        }
      }
    }
    return false;
  }
}
