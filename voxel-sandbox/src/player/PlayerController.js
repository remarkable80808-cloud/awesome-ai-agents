/**
 * First-person input + camera.
 *
 * Owns pointer lock, keyboard state and yaw/pitch, and each frame translates
 * those into the plain `{ moveX, moveZ, jump, sprint }` input struct that the
 * renderer-agnostic physics module consumes.
 */

import { PLAYER, stepPlayer } from '../core/physics.js';

const MOUSE_SENSITIVITY = 0.0022;   // radians per pixel of mouse movement
const PITCH_LIMIT = Math.PI / 2 - 0.01; // just shy of straight up/down

export class PlayerController {
  constructor({ camera, domElement, world, state }) {
    this.camera = camera;
    this.domElement = domElement;
    this.world = world;
    this.state = state;

    this.yaw = 0;    // rotation about +Y, 0 = looking down -Z
    this.pitch = 0;  // rotation about the local X axis, + = looking up
    this.keys = new Set();
    this.locked = false;

    this._onKeyDown = (e) => {
      // A Set makes auto-repeat harmless: re-adding a held key is a no-op.
      this.keys.add(e.code);
      // Space scrolls the page otherwise, which is jarring even under lock.
      if (e.code === 'Space') e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => this._handleMouseMove(e);
    this._onPointerLockChange = () => {
      this.locked = document.pointerLockElement === this.domElement;
      // Dropping lock mid-stride would otherwise leave keys stuck down.
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  requestLock() {
    this.domElement.requestPointerLock?.();
  }

  _handleMouseMove(event) {
    if (!this.locked) return;
    // movementX/Y are raw deltas; under pointer lock the cursor never moves so
    // these are the only source of look input.
    this.yaw -= event.movementX * MOUSE_SENSITIVITY;
    this.pitch -= event.movementY * MOUSE_SENSITIVITY;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
  }

  /** Build the physics input for this frame from the current key state. */
  _readInput() {
    const k = this.keys;
    const forward = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);

    // Yaw 0 faces -Z, so the forward vector is (-sin yaw, -cos yaw) and the
    // right vector is that rotated -90 degrees: (cos yaw, -sin yaw).
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const moveX = forward * -sin + strafe * cos;
    const moveZ = forward * -cos + strafe * sin;

    return {
      moveX,
      moveZ,
      jump: k.has('Space'),
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
    };
  }

  update(dt) {
    // With no pointer lock the player shouldn't walk, but gravity should still
    // settle them, so we step physics with empty input rather than skipping it.
    const input = this.locked
      ? this._readInput()
      : { moveX: 0, moveZ: 0, jump: false, sprint: false };

    stepPlayer(this.world, this.state, input, dt);
    this.syncCamera();
  }

  syncCamera() {
    const p = this.state.position;
    this.camera.position.set(p.x, p.y + PLAYER.eyeHeight, p.z);
    // YXZ order applies yaw first then pitch, which is what stops the view
    // from rolling when you look around (the usual FPS Euler order).
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
  }
}
