import './style.css';
import { FIXED_TIMESTEP, GROUND_LEVEL, MAX_SUBSTEPS, MOUSE_SENSITIVITY } from './core/constants.js';
import { VoxelWorld } from './world/VoxelWorld.js';
import { generateFlatWorld } from './world/worldgen.js';
import { Player } from './physics/Player.js';
import { InputState } from './input/InputState.js';
import { SceneManager } from './render/SceneManager.js';
import { TerrainRenderer } from './render/TerrainRenderer.js';
import { Hud } from './ui/Hud.js';

const canvas = document.getElementById('game-canvas');

// --- Simulation state (renderer-agnostic) ---
const world = generateFlatWorld(new VoxelWorld());
const player = new Player(0.5, GROUND_LEVEL + 1, 0.5); // stand on top of the grass layer

// --- Presentation ---
const scene = new SceneManager(canvas);
const terrain = new TerrainRenderer(scene.scene, world);
const hud = new Hud();

// --- Input ---
const input = new InputState(canvas);
input.onLockChange = (locked) => hud.setLocked(locked);
canvas.addEventListener('click', () => input.requestLock());
document.getElementById('lock-overlay').addEventListener('click', () => input.requestLock());

let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);

  // Clamp dt so an alt-tab (or a breakpoint) doesn't hand us a multi-second
  // step that teleports the player through the floor.
  const dt = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;

  if (input.locked) {
    const look = input.consumeMouseDelta();
    player.applyLook(look.x, look.y, MOUSE_SENSITIVITY);

    // Fixed-timestep physics: gameplay feel and collision correctness must not
    // depend on the display refresh rate. Leftover time carries to next frame.
    const intent = input.getMoveIntent();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_TIMESTEP && steps < MAX_SUBSTEPS) {
      player.update(world, intent, FIXED_TIMESTEP);
      accumulator -= FIXED_TIMESTEP;
      steps++;
    }
    // If we hit the substep cap we are running behind; drop the backlog rather
    // than accumulating debt we can never pay off.
    if (steps === MAX_SUBSTEPS) accumulator = 0;
  } else {
    accumulator = 0;
  }

  terrain.update(player.position);
  scene.syncCamera(player);
  scene.render();
  hud.updateStats(dt, now, terrain.instanceCount, player.position);
}

requestAnimationFrame(frame);

// Dev-only handle for poking at live state from the browser console (and used
// by the browser smoke test). The DEV guard strips it from production builds.
if (import.meta.env.DEV) {
  window.__game = { world, player, input, terrain, scene, hud };
}
