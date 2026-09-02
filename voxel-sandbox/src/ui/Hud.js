/**
 * Thin wrapper over the DOM overlay. No Three.js, no game logic — it just
 * renders numbers it is handed.
 */
export class Hud {
  constructor() {
    this.fpsEl = document.getElementById('fps-value');
    this.drawEl = document.getElementById('draw-value');
    this.posEl = document.getElementById('pos-value');
    this.overlayEl = document.getElementById('lock-overlay');

    // Rolling FPS window: instantaneous 1/dt is far too noisy to read.
    this.frameTimes = [];
    this.lastFpsUpdate = 0;
  }

  /** @param {number} dt seconds since the previous frame */
  updateStats(dt, now, blockCount, position) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 120) this.frameTimes.shift();

    // Repaint text at most 5x/second; DOM writes every frame are themselves a
    // measurable cost when you're trying to measure cost.
    if (now - this.lastFpsUpdate < 200) return;
    this.lastFpsUpdate = now;

    const mean = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.fpsEl.textContent = mean > 0 ? Math.round(1 / mean).toString() : '—';
    this.drawEl.textContent = blockCount.toLocaleString();
    this.posEl.textContent = `${position.x.toFixed(1)} ${position.y.toFixed(1)} ${position.z.toFixed(1)}`;
  }

  setLocked(locked) {
    this.overlayEl.classList.toggle('hidden', locked);
  }
}
