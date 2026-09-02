/**
 * Entry point: wires the voxel world, physics-driven player and Three.js
 * renderer together and runs the frame loop.
 */

import * as THREE from 'three';
import './style.css';

import { World, generateFlatWorld } from './core/World.js';
import { createPlayerState, spawnPositionAt } from './core/physics.js';
import { WorldRenderer } from './render/WorldRenderer.js';
import { createSky } from './render/sky.js';
import { PlayerController } from './player/PlayerController.js';
import { Hud } from './ui/hud.js';

const WORLD_SIZE = { sizeX: 32, sizeY: 32, sizeZ: 32 };

// --- world ----------------------------------------------------------------
const world = generateFlatWorld(new World(WORLD_SIZE));

// --- renderer -------------------------------------------------------------
const canvas = document.createElement('canvas');
canvas.id = 'game-canvas';
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
// Cap DPR: on a 3x display the pixel count triples for little visual gain.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.add(createSky({ radius: 400, offset: 0 }));
// Fog matched to the sky's horizon colour so the world edge fades out instead
// of ending in a hard line against the sky.
scene.fog = new THREE.Fog(0xbcd9f2, 40, 110);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  600,
);

// Lighting. Shadow casting lands in Phase 4; this is just enough for every
// face of a cube to be readable. The hemisphere light alone leaves vertical
// faces pointing away from the sun almost black, so a dim fill light comes in
// from the opposite side to keep them legible.
scene.add(new THREE.HemisphereLight(0xdfefff, 0x6b6350, 0.9));
const sun = new THREE.DirectionalLight(0xfff3d6, 1.6);
sun.position.set(40, 70, 25);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xaec6e8, 0.45);
fill.position.set(-35, 20, -30);
scene.add(fill);

const worldRenderer = new WorldRenderer(scene, world);
worldRenderer.update();

// --- player ---------------------------------------------------------------
const spawn = spawnPositionAt(world, WORLD_SIZE.sizeX / 2, WORLD_SIZE.sizeZ / 2);
const playerState = createPlayerState(spawn.x, spawn.y, spawn.z);

const controller = new PlayerController({
  camera,
  domElement: canvas,
  world,
  state: playerState,
});
controller.syncCamera();

// --- ui -------------------------------------------------------------------
const hud = new Hud();
hud.setOverlayVisible(true);
controller.onLockChange = (locked) => hud.setOverlayVisible(!locked);
canvas.addEventListener('click', () => controller.requestLock());
hud.overlay.addEventListener('click', () => controller.requestLock());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- frame loop -----------------------------------------------------------
const clock = new THREE.Clock();

function frame() {
  // Clamp dt so an alt-tab (or a breakpoint) doesn't teleport the player
  // through the floor when the tab resumes.
  const dt = Math.min(clock.getDelta(), 0.1);

  controller.update(dt);
  worldRenderer.update();
  hud.update(dt, {
    instances: worldRenderer.instanceCount,
    position: playerState.position,
  });

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Handy for poking at the sim from the devtools console.
window.__game = { world, playerState, controller, worldRenderer, scene, camera };
