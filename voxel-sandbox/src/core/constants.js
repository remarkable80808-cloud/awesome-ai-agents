/**
 * Central tuning constants. Pure data — no engine/rendering imports.
 * Units are "blocks" for distance and "blocks per second" for velocity.
 */

// --- World shape ---
export const CHUNK_SIZE = 16; // blocks per chunk along X and Z
export const WORLD_HEIGHT = 64; // blocks along Y; y is clamped to [0, WORLD_HEIGHT)

/** Half-extent of the generated world, in blocks, measured from the origin. */
export const WORLD_RADIUS = 32; // -> a 64x64 block play area for Phase 1

/** How far from the player we bother building render geometry. */
export const RENDER_DISTANCE = 32;

// --- Terrain layers (flat world) ---
export const GROUND_LEVEL = 3; // y index of the topmost solid block

// --- Player body (an axis-aligned box centred on x/z, standing on `position.y`) ---
export const PLAYER_HALF_WIDTH = 0.3; // -> 0.6 block wide box
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.62;

// --- Movement ---
export const WALK_SPEED = 4.6;
export const SPRINT_SPEED = 7.2;
export const GRAVITY = 26.0; // blocks/s^2, applied downward
export const JUMP_VELOCITY = 8.4; // ~1.35 blocks of jump height at the gravity above
export const GROUND_ACCEL = 60.0; // how fast we approach target velocity on the ground
export const AIR_ACCEL = 12.0; // much weaker mid-air steering
export const GROUND_FRICTION = 12.0;
export const TERMINAL_VELOCITY = 60.0;

/** Falling below this y means the player left the world; respawn instead of falling forever. */
export const VOID_Y = -24;

// --- Simulation ---
export const FIXED_TIMESTEP = 1 / 120; // physics substep length in seconds
export const MAX_SUBSTEPS = 8; // clamp so a stalled tab can't spiral the simulation

// --- Look ---
export const MOUSE_SENSITIVITY = 0.0022; // radians per pixel of mouse movement
export const PITCH_LIMIT = Math.PI / 2 - 0.01; // stop just short of straight up/down
