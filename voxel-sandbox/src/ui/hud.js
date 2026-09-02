/**
 * DOM overlay: FPS/perf readout, crosshair, and the click-to-play prompt.
 * Deliberately plain DOM — no canvas text, nothing to rebuild per frame
 * beyond a couple of textContent writes.
 */

export class Hud {
  constructor(root = document.body) {
    this.root = root;

    this.stats = document.createElement('div');
    this.stats.className = 'hud-stats';
    this.stats.innerHTML = `
      <div><span class="hud-label">FPS</span> <span id="hud-fps">--</span></div>
      <div><span class="hud-label">ms</span> <span id="hud-frametime">--</span></div>
      <div><span class="hud-label">blocks drawn</span> <span id="hud-instances">--</span></div>
      <div><span class="hud-label">pos</span> <span id="hud-position">--</span></div>
    `;

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'hud-crosshair';

    this.overlay = document.createElement('div');
    this.overlay.className = 'hud-overlay';
    this.overlay.innerHTML = `
      <div class="hud-overlay-card">
        <h1>Voxel Sandbox</h1>
        <p class="hud-overlay-cta">Click to play</p>
        <ul class="hud-keys">
          <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</li>
          <li><kbd>Mouse</kbd> look</li>
          <li><kbd>Space</kbd> jump</li>
          <li><kbd>Shift</kbd> sprint</li>
          <li><kbd>Esc</kbd> release cursor</li>
        </ul>
      </div>
    `;

    root.append(this.stats, this.crosshair, this.overlay);

    this.fpsEl = this.stats.querySelector('#hud-fps');
    this.frameTimeEl = this.stats.querySelector('#hud-frametime');
    this.instancesEl = this.stats.querySelector('#hud-instances');
    this.positionEl = this.stats.querySelector('#hud-position');

    // FPS is averaged over a sampling window rather than shown per frame,
    // otherwise the number is unreadable noise.
    this._frames = 0;
    this._elapsed = 0;
  }

  setOverlayVisible(visible) {
    this.overlay.classList.toggle('is-hidden', !visible);
    this.crosshair.classList.toggle('is-hidden', visible);
  }

  update(dt, { instances, position }) {
    this._frames++;
    this._elapsed += dt;
    if (this._elapsed >= 0.5) {
      const fps = this._frames / this._elapsed;
      this.fpsEl.textContent = fps.toFixed(0);
      this.frameTimeEl.textContent = (1000 / fps).toFixed(1);
      this._frames = 0;
      this._elapsed = 0;
    }
    this.instancesEl.textContent = instances;
    this.positionEl.textContent =
      `${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`;
  }
}
