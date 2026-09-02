import * as THREE from 'three';
import { PLAYER_EYE_HEIGHT, RENDER_DISTANCE } from '../core/constants.js';
import { createSky, HORIZON_COLOR } from './Sky.js';

/**
 * Owns everything Three.js: renderer, scene graph, camera, lights.
 * Game code hands it a Player and it mirrors that state onto the camera —
 * state never flows back the other way.
 */
export class SceneManager {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    // Fog tinted to the horizon colour hides the hard edge of the finite world.
    this.scene.fog = new THREE.Fog(HORIZON_COLOR, RENDER_DISTANCE * 0.55, RENDER_DISTANCE * 1.15);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    // YXZ order means "yaw first, then pitch" — the standard FPS ordering that
    // keeps the horizon level no matter where you look.
    this.camera.rotation.order = 'YXZ';

    this.sky = createSky();
    this.scene.add(this.sky);

    this.ambient = new THREE.AmbientLight(0xbcd4f0, 0.85);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    this.sun.position.set(60, 100, 30);
    this.scene.add(this.sun);

    // A dim upward-facing light so downward faces aren't pure black.
    this.bounce = new THREE.DirectionalLight(0x8899bb, 0.35);
    this.bounce.position.set(-40, -60, -30);
    this.scene.add(this.bounce);

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Copies player state onto the camera. */
  syncCamera(player) {
    this.camera.position.set(
      player.position.x,
      player.getEyeY(PLAYER_EYE_HEIGHT),
      player.position.z
    );
    this.camera.rotation.y = player.yaw;
    this.camera.rotation.x = player.pitch;
    // Keep the sky dome centred on the viewer so it never gets "reached".
    this.sky.position.copy(this.camera.position);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
