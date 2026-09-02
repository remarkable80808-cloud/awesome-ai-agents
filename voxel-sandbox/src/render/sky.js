/**
 * Gradient sky dome.
 *
 * A big sphere rendered from the inside (BackSide) with a vertical gradient.
 * Cheaper and simpler than a cubemap, and it needs no texture assets.
 */

import * as THREE from 'three';

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    // Direction from the world origin to this vertex, used to work out how
    // high up the dome the fragment is.
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 bottomColor;
  uniform float offset;
  varying vec3 vWorldPosition;

  void main() {
    // h in [-1, 1]: -1 straight down, 0 at the horizon, 1 straight up.
    float h = normalize(vWorldPosition - vec3(0.0, offset, 0.0)).y;
    vec3 color = h > 0.0
      ? mix(horizonColor, topColor, pow(h, 0.55))
      : mix(horizonColor, bottomColor, pow(-h, 0.6));
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createSky({ radius = 400, offset = 0 } = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x2b6ed6) },
      horizonColor: { value: new THREE.Color(0xbcd9f2) },
      bottomColor: { value: new THREE.Color(0x50596b) },
      offset: { value: offset },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), material);
  sky.name = 'sky';
  sky.frustumCulled = false;
  return sky;
}
