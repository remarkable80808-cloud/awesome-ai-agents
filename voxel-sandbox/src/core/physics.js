/**
 * Player physics: gravity + swept-AABB collision against the voxel grid.
 *
 * Pure logic. It takes a `world` (anything exposing `isCollidableAt`) and a
 * mutable player state made of plain numbers — no Three.js vectors — so the
 * whole simulation can run headless or against a different renderer.
 */

export const PLAYER = {
  width: 0.6,        // AABB footprint (x and z), centred on position
  height: 1.8,       // AABB height, measured up from the feet
  eyeHeight: 1.62,   // camera offset above the feet
};

export const PHYSICS = {
  gravity: 26,           // m/s^2 — heavier than real gravity; feels better
  walkSpeed: 4.8,        // m/s
  sprintSpeed: 7.6,      // m/s
  jumpSpeed: 8.4,        // m/s => apex ~1.35 blocks, clears a 1-block step
  groundAccel: 55,       // m/s^2 toward the desired velocity
  airAccel: 12,          // much weaker air control
  maxFallSpeed: 55,      // terminal velocity clamp
  maxStepDistance: 0.25, // substep cap, in blocks, to avoid tunnelling
};

const EPS = 1e-3;

export function createPlayerState(x, y, z) {
  return {
    position: { x, y, z },       // feet-centre position
    velocity: { x: 0, y: 0, z: 0 },
    onGround: false,
  };
}

/**
 * Does the player's AABB at `pos` overlap any collidable voxel?
 *
 * The box is shrunk by EPS on every side before deciding which cells to test.
 * Without that, a player standing exactly flush at y=3.0 would sample the
 * block row at y=3 (the air they're standing in is fine) *and* count a
 * neighbouring cell they're only touching, producing phantom collisions.
 */
function collides(world, pos) {
  const hw = PLAYER.width / 2;
  const minX = Math.floor(pos.x - hw + EPS);
  const maxX = Math.floor(pos.x + hw - EPS);
  const minY = Math.floor(pos.y + EPS);
  const maxY = Math.floor(pos.y + PLAYER.height - EPS);
  const minZ = Math.floor(pos.z - hw + EPS);
  const maxZ = Math.floor(pos.z + hw - EPS);

  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (world.isCollidableAt(x, y, z)) return true;
      }
    }
  }
  return false;
}

/**
 * Move along one axis and, if that lands us inside geometry, snap back to the
 * face we hit.
 *
 * Because each axis is resolved independently and each substep moves less than
 * a quarter block, the penetration depth is always < 1 block. So the contact
 * plane is simply the near edge of the cell the leading face ended up in:
 *  - moving +: leading face is `pos + halfExtent`; snap it to floor(face)
 *  - moving -: trailing face is `pos - halfExtent`; snap it to floor(face) + 1
 * That is what makes this cheap — no per-cell distance search is needed.
 *
 * Returns true if a collision was resolved (so the caller can zero velocity).
 */
function moveAxis(world, pos, axis, delta) {
  if (delta === 0) return false;

  const before = pos[axis];
  pos[axis] += delta;
  if (!collides(world, pos)) return false;

  const hw = PLAYER.width / 2;
  if (axis === 'y') {
    if (delta > 0) {
      // Head hit a ceiling: put the top of the box just below the block face.
      pos.y = Math.floor(pos.y + PLAYER.height) - PLAYER.height - EPS;
    } else {
      // Feet hit a floor: rest on top of the block we sank into.
      pos.y = Math.floor(pos.y) + 1 + EPS;
    }
  } else {
    if (delta > 0) {
      pos[axis] = Math.floor(pos[axis] + hw) - hw - EPS;
    } else {
      pos[axis] = Math.floor(pos[axis] - hw) + 1 + hw + EPS;
    }
  }

  // Safety net: if the snap somehow still overlaps (e.g. the player was spawned
  // inside a wall), give up on this axis rather than teleporting them.
  if (collides(world, pos)) pos[axis] = before;
  return true;
}

/**
 * Advance the player by `dt` seconds.
 *
 * @param {object} world  needs isCollidableAt(x,y,z)
 * @param {object} state  from createPlayerState(); mutated in place
 * @param {object} input  { moveX, moveZ, jump, sprint } where moveX/moveZ are a
 *                        world-space direction (not necessarily normalised —
 *                        we normalise here). The caller owns the camera, so
 *                        yaw->direction conversion happens outside physics.
 */
export function stepPlayer(world, state, input, dt) {
  const { position: pos, velocity: vel } = state;

  // --- horizontal: accelerate toward the desired velocity -----------------
  let wishX = input.moveX || 0;
  let wishZ = input.moveZ || 0;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1e-6) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  const speed = input.sprint ? PHYSICS.sprintSpeed : PHYSICS.walkSpeed;
  const targetX = wishX * speed;
  const targetZ = wishZ * speed;
  const accel = (state.onGround ? PHYSICS.groundAccel : PHYSICS.airAccel) * dt;

  // Move each horizontal velocity component toward its target by at most
  // `accel`. On the ground with no input, the same code decelerates to a stop.
  vel.x += clampMagnitude(targetX - vel.x, accel);
  vel.z += clampMagnitude(targetZ - vel.z, accel);

  // --- vertical -----------------------------------------------------------
  if (input.jump && state.onGround) {
    vel.y = PHYSICS.jumpSpeed;
    state.onGround = false;
  }
  vel.y -= PHYSICS.gravity * dt;
  if (vel.y < -PHYSICS.maxFallSpeed) vel.y = -PHYSICS.maxFallSpeed;

  // --- integrate with substepping ----------------------------------------
  // A single 60fps frame at sprint speed moves ~0.13 blocks, but a lag spike
  // (or a long fall) can move several blocks. Splitting the movement keeps
  // every axis step under maxStepDistance so nothing tunnels through a wall.
  const distance = Math.hypot(vel.x * dt, vel.y * dt, vel.z * dt);
  const steps = Math.max(1, Math.ceil(distance / PHYSICS.maxStepDistance));
  const sub = dt / steps;

  state.onGround = false;
  for (let i = 0; i < steps; i++) {
    if (moveAxis(world, pos, 'x', vel.x * sub)) vel.x = 0;
    if (moveAxis(world, pos, 'z', vel.z * sub)) vel.z = 0;
    if (moveAxis(world, pos, 'y', vel.y * sub)) {
      // Landing (moving down) is the only case that grants ground contact;
      // bonking a ceiling just kills upward velocity.
      if (vel.y <= 0) state.onGround = true;
      vel.y = 0;
    }
  }
}

function clampMagnitude(value, max) {
  if (value > max) return max;
  if (value < -max) return -max;
  return value;
}

/** Drop the player onto the first free spot above the terrain at (x, z). */
export function spawnPositionAt(world, x, z) {
  const top = world.highestSolidY(Math.floor(x), Math.floor(z));
  return { x: x + 0.0, y: top + 1 + EPS, z: z + 0.0 };
}
