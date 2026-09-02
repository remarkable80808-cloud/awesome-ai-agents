/**
 * Keyboard / mouse / pointer-lock plumbing.
 *
 * Deliberately dumb: it records *what the user is doing* (keys down, mouse
 * delta accumulated since the last read) and exposes it as an "intent" object.
 * It does not know about the player, the camera, or Three.js.
 */
export class InputState {
  /**
   * @param {HTMLElement} lockTarget element that requests pointer lock on click
   */
  constructor(lockTarget) {
    this.lockTarget = lockTarget;
    this.keys = new Set();
    // Mouse movement accumulates between frames and is drained by consume().
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.locked = false;
    /** Called with the new lock state whenever it changes. */
    this.onLockChange = null;

    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      // Ignore auto-repeat: we only care about "is it held", plus repeat would
      // spam any edge-triggered action we add later.
      if (e.repeat) return;
      this.keys.add(e.code);
      // Space scrolls the page by default, which is very noticeable if pointer
      // lock ever drops.
      if (e.code === 'Space') e.preventDefault();
    });

    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    // Losing focus mid-keypress would otherwise leave the key stuck "down".
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.lockTarget;
      if (!this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDeltaX += e.movementX;
      this.mouseDeltaY += e.movementY;
    });
  }

  requestLock() {
    this.lockTarget.requestPointerLock?.();
  }

  releaseLock() {
    document.exitPointerLock?.();
  }

  isDown(code) {
    return this.keys.has(code);
  }

  /** Returns the mouse delta since the previous call and resets the accumulator. */
  consumeMouseDelta() {
    const delta = { x: this.mouseDeltaX, y: this.mouseDeltaY };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return delta;
  }

  /** Translates raw key state into the movement intent the Player understands. */
  getMoveIntent() {
    const forward = (this.isDown('KeyW') ? 1 : 0) - (this.isDown('KeyS') ? 1 : 0);
    const right = (this.isDown('KeyD') ? 1 : 0) - (this.isDown('KeyA') ? 1 : 0);
    return {
      forward,
      right,
      jump: this.isDown('Space'),
      sprint: this.isDown('ShiftLeft') || this.isDown('ShiftRight'),
    };
  }
}
