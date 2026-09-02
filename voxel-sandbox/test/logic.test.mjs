/**
 * Headless sanity checks for the engine-agnostic layer.
 * Runs in plain Node precisely because VoxelWorld/Player never import Three.js.
 *   node --test test/
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { VoxelWorld } from '../src/world/VoxelWorld.js';
import { generateFlatWorld } from '../src/world/worldgen.js';
import { Player } from '../src/physics/Player.js';
import { AIR, STONE, GRASS } from '../src/world/blocks.js';
import { GROUND_LEVEL, FIXED_TIMESTEP, PLAYER_HEIGHT, VOID_Y } from '../src/core/constants.js';

const IDLE = { forward: 0, right: 0, jump: false, sprint: false };
const idle = (over = {}) => ({ ...IDLE, ...over });

function simulate(player, world, intent, seconds) {
  const steps = Math.round(seconds / FIXED_TIMESTEP);
  for (let i = 0; i < steps; i++) player.update(world, intent, FIXED_TIMESTEP);
}

test('chunk coordinate mapping handles negative world coordinates', () => {
  assert.equal(VoxelWorld.toChunkCoord(-1), -1);
  assert.equal(VoxelWorld.toChunkCoord(-16), -1);
  assert.equal(VoxelWorld.toChunkCoord(-17), -2);
  assert.equal(VoxelWorld.toLocalCoord(-1), 15);
  assert.equal(VoxelWorld.toLocalCoord(-16), 0);
});

test('get/set round-trips across the origin and out of bounds reads are air', () => {
  const world = new VoxelWorld();
  world.setBlock(-5, 10, -33, STONE);
  assert.equal(world.getBlock(-5, 10, -33), STONE);
  assert.equal(world.getBlock(-5, 11, -33), AIR);
  assert.equal(world.getBlock(999, 10, 999), AIR);
  assert.equal(world.getBlock(-5, -1, -33), AIR, 'below the world is air');
  assert.equal(world.getBlock(-5, 9999, -33), AIR, 'above the world is air');
});

test('setBlock marks neighbouring chunks dirty on a border edit', () => {
  const world = new VoxelWorld();
  world.setBlock(0, 5, 0, STONE); // local x/z = 0 -> touches chunks -1 as well
  assert.ok(world.dirtyChunks.has('0,0'));
  assert.ok(world.dirtyChunks.has('-1,0'));
  assert.ok(world.dirtyChunks.has('0,-1'));
});

test('flat worldgen produces a grass surface at GROUND_LEVEL', () => {
  const world = generateFlatWorld(new VoxelWorld(), 8);
  assert.equal(world.getBlock(0, GROUND_LEVEL, 0), GRASS);
  assert.equal(world.getBlock(0, GROUND_LEVEL + 1, 0), AIR);
  assert.ok(world.isSolid(0, 0, 0));
});

test('buried blocks are not exposed, surface blocks are', () => {
  const world = generateFlatWorld(new VoxelWorld(), 8);
  assert.equal(world.isExposed(0, GROUND_LEVEL, 0), true, 'top layer sees sky');
  assert.equal(world.isExposed(0, 0, 0), false,
    'bottom layer is culled: below-world counts as opaque bedrock');
  assert.equal(world.isExposed(-8, 0, 0), true,
    'bottom layer at the world edge still shows its side face');
  assert.equal(world.isExposed(0, 1, 0), false, 'fully surrounded block is hidden');
});

test('gravity lands the player exactly on the surface and keeps them there', () => {
  const world = generateFlatWorld(new VoxelWorld(), 8);
  const player = new Player(0.5, 20, 0.5);
  simulate(player, world, idle(), 3);
  assert.equal(player.position.y, GROUND_LEVEL + 1, 'rests on top of the grass block');
  assert.equal(player.onGround, true);
  assert.equal(player.velocity.y, 0);
});

test('player cannot walk through a wall', () => {
  const world = generateFlatWorld(new VoxelWorld(), 8);
  // Wall two blocks tall at x = 3, spanning the player's path along +X.
  for (let z = -2; z <= 2; z++) {
    world.setBlock(3, GROUND_LEVEL + 1, z, STONE);
    world.setBlock(3, GROUND_LEVEL + 2, z, STONE);
  }
  const player = new Player(0.5, GROUND_LEVEL + 1, 0.5);
  player.yaw = -Math.PI / 2; // face +X
  simulate(player, world, idle({ forward: 1, sprint: true }), 3);

  assert.ok(player.position.x < 3, `stopped before the wall, got x=${player.position.x}`);
  assert.ok(player.position.x > 2.5, `reached the wall, got x=${player.position.x}`);
  assert.equal(world.isSolid(Math.floor(player.position.x), GROUND_LEVEL + 1, 0), false);
});

test('jump clears a one-block step but not a two-block wall', () => {
  const world = generateFlatWorld(new VoxelWorld(), 8);
  const player = new Player(0.5, GROUND_LEVEL + 1, 0.5);
  simulate(player, world, idle(), 0.5); // settle

  const startY = player.position.y;
  player.update(world, idle({ jump: true }), FIXED_TIMESTEP);
  let peak = player.position.y;
  simulate(player, world, idle(), 0.4);
  peak = Math.max(peak, player.position.y);
  assert.ok(peak - startY > 1.0, `jump height ${peak - startY} should clear one block`);
  assert.ok(peak - startY < 2.0, `jump height ${peak - startY} should not clear two blocks`);
});

test('head collision stops an upward move', () => {
  const world = generateFlatWorld(new VoxelWorld(), 8);
  const feetY = GROUND_LEVEL + 1;
  const ceilingY = feetY + 2; // low ceiling, 2 blocks of headroom
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) world.setBlock(x, ceilingY, z, STONE);
  }
  const player = new Player(0.5, feetY, 0.5);
  simulate(player, world, idle(), 0.3);
  player.update(world, idle({ jump: true }), FIXED_TIMESTEP);
  simulate(player, world, idle(), 0.3);

  assert.ok(
    player.position.y + PLAYER_HEIGHT <= ceilingY + 1e-6,
    `head stayed below the ceiling, got top=${player.position.y + PLAYER_HEIGHT}`
  );
});

test('falling out of the world respawns instead of falling forever', () => {
  const world = new VoxelWorld(); // completely empty: nothing to land on
  const player = new Player(0.5, 8, 0.5);
  // Long enough to cross VOID_Y several times over; the player should keep
  // getting recycled to spawn rather than accumulating unbounded -y.
  simulate(player, world, idle(), 8);
  assert.ok(player.position.y > VOID_Y, `y=${player.position.y} never escapes the void`);
  assert.ok(player.position.y <= 8, 'respawn does not launch the player upward');
});

test('diagonal input is not faster than straight input', () => {
  const world = generateFlatWorld(new VoxelWorld(), 16);
  const straight = new Player(0.5, GROUND_LEVEL + 1, 0.5);
  const diagonal = new Player(0.5, GROUND_LEVEL + 1, 0.5);
  simulate(straight, world, idle({ forward: 1 }), 1.5);
  simulate(diagonal, world, idle({ forward: 1, right: 1 }), 1.5);

  const dist = (p) => Math.hypot(p.position.x - 0.5, p.position.z - 0.5);
  assert.ok(Math.abs(dist(straight) - dist(diagonal)) < 0.05,
    `straight=${dist(straight)} diagonal=${dist(diagonal)}`);
});
