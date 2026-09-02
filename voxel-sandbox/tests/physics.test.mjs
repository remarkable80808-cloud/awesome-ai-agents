import { World, generateFlatWorld } from '../src/core/World.js';
import { createPlayerState, stepPlayer, spawnPositionAt, PLAYER } from '../src/core/physics.js';
import { BLOCK } from '../src/core/blocks.js';

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
};

const DT = 1 / 60;
const sim = (world, state, input, seconds) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepPlayer(world, state, input, DT);
};
const still = { moveX: 0, moveZ: 0, jump: false, sprint: false };

// --- 1. falls and lands on terrain ---------------------------------------
{
  const w = generateFlatWorld(new World({ sizeX: 32, sizeY: 32, sizeZ: 32 }));
  const s = createPlayerState(16, 20, 16);
  sim(w, s, still, 5);
  check('falls from y=20 and rests on top of grass (y=3)',
    Math.abs(s.position.y - 3) < 0.01 && s.onGround, `y=${s.position.y.toFixed(4)}`);
}

// --- 2. never sinks through the floor even after a huge dt ---------------
{
  const w = generateFlatWorld(new World({ sizeX: 32, sizeY: 32, sizeZ: 32 }));
  const s = createPlayerState(16, 31, 16);
  // One monstrous 1-second step: ~26 blocks of fall in a single frame.
  stepPlayer(w, s, still, 1.0);
  check('substepping prevents tunnelling on a 1s frame',
    s.position.y >= 3 - 0.01, `y=${s.position.y.toFixed(4)}`);
}

// --- 3. walls block horizontal movement ----------------------------------
{
  const w = new World({ sizeX: 16, sizeY: 16, sizeZ: 16 });
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) w.setBlock(x, 0, z, BLOCK.STONE);
  for (let y = 1; y <= 3; y++) for (let z = 0; z < 16; z++) w.setBlock(10, y, z, BLOCK.STONE);
  const s = createPlayerState(8, 1, 8);
  sim(w, s, { moveX: 1, moveZ: 0, jump: false, sprint: true }, 4);
  const expected = 10 - PLAYER.width / 2;
  check('sprinting into a wall stops flush against it',
    s.position.x < expected + 0.01 && s.position.x > expected - 0.05,
    `x=${s.position.x.toFixed(4)} expected~${expected}`);
}

// --- 4. world edges act as invisible walls -------------------------------
{
  const w = generateFlatWorld(new World({ sizeX: 32, sizeY: 32, sizeZ: 32 }));
  const s = createPlayerState(16, 3, 16);
  sim(w, s, { moveX: 0, moveZ: -1, jump: false, sprint: true }, 12);
  check('cannot walk out of the world (-Z edge)',
    s.position.z >= 0 && s.position.z <= 0.35, `z=${s.position.z.toFixed(4)}`);
}

// --- 5. jump height clears exactly one block ------------------------------
{
  const w = generateFlatWorld(new World({ sizeX: 32, sizeY: 32, sizeZ: 32 }));
  const s = createPlayerState(16, 3, 16);
  let peak = s.position.y;
  for (let i = 0; i < 120; i++) {
    stepPlayer(w, s, { moveX: 0, moveZ: 0, jump: i < 2, sprint: false }, DT);
    peak = Math.max(peak, s.position.y);
  }
  const rise = peak - 3;
  check('jump apex clears a 1-block step (>1, <2)',
    rise > 1.0 && rise < 2.0, `rise=${rise.toFixed(3)} blocks`);
  check('returns to the ground after jumping',
    Math.abs(s.position.y - 3) < 0.01 && s.onGround, `y=${s.position.y.toFixed(4)}`);
}

// --- 6. can jump up the test staircase ------------------------------------
{
  const w = generateFlatWorld(new World({ sizeX: 32, sizeY: 32, sizeZ: 32 }));
  const s = createPlayerState(16, 3, 16.5);
  // Walk +X into the staircase holding jump. Track the highest *grounded*
  // height reached: the end position is useless because a player who climbs
  // all four steps then walks off the far side and falls back to y=3.
  let bestGrounded = 3;
  for (let i = 0; i < 360; i++) {
    stepPlayer(w, s, { moveX: 1, moveZ: 0, jump: true, sprint: false }, DT);
    if (s.onGround) bestGrounded = Math.max(bestGrounded, s.position.y);
  }
  check('can jump-climb all four staircase steps (stands on y=7 top)',
    bestGrounded > 6.9 && bestGrounded < 7.1, `bestGroundedY=${bestGrounded.toFixed(3)}`);
}

// --- 7. ceiling stops upward motion ---------------------------------------
{
  const w = new World({ sizeX: 8, sizeY: 8, sizeZ: 8 });
  for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) {
    w.setBlock(x, 0, z, BLOCK.STONE);
    w.setBlock(x, 3, z, BLOCK.STONE); // ceiling: floor of block 3 is y=3
  }
  const s = createPlayerState(4, 1, 4);
  let peak = 1;
  for (let i = 0; i < 60; i++) {
    stepPlayer(w, s, { moveX: 0, moveZ: 0, jump: i < 2, sprint: false }, DT);
    peak = Math.max(peak, s.position.y);
  }
  check('head stops below a ceiling (top of AABB never passes y=3)',
    peak + PLAYER.height <= 3 + 1e-3, `topY=${(peak + PLAYER.height).toFixed(4)}`);
}

// --- 8. spawn helper places the player on the surface ---------------------
{
  const w = generateFlatWorld(new World({ sizeX: 32, sizeY: 32, sizeZ: 32 }));
  const p = spawnPositionAt(w, 16, 16);
  check('spawnPositionAt returns the surface height', Math.abs(p.y - 3) < 0.01, `y=${p.y}`);
}

// --- 9. exposed-face culling actually culls -------------------------------
{
  const w = generateFlatWorld(new World({ sizeX: 32, sizeY: 32, sizeZ: 32 }));
  let total = 0, exposed = 0;
  for (let y = 0; y < w.sizeY; y++) for (let z = 0; z < w.sizeZ; z++) for (let x = 0; x < w.sizeX; x++) {
    if (w.getBlock(x, y, z) !== 0) { total++; if (w.isExposed(x, y, z)) exposed++; }
  }
  check('face culling drops buried blocks', exposed < total,
    `${exposed}/${total} instanced (${(100 * (1 - exposed / total)).toFixed(0)}% culled)`);
}

// --- 10. sprint is faster than walk ---------------------------------------
{
  const w = generateFlatWorld(new World({ sizeX: 32, sizeY: 32, sizeZ: 32 }));
  // z=4 is clear of the generated wall/staircase, which both sit near z=16.
  const a = createPlayerState(4, 3, 4), b = createPlayerState(4, 3, 4);
  sim(w, a, { moveX: 1, moveZ: 0, jump: false, sprint: false }, 2);
  sim(w, b, { moveX: 1, moveZ: 0, jump: false, sprint: true }, 2);
  check('sprint covers more ground than walk',
    b.position.x - a.position.x > 3, `walk=${(a.position.x-4).toFixed(2)} sprint=${(b.position.x-4).toFixed(2)}`);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
