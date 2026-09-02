import * as THREE from 'three';

export const HORIZON_COLOR = new THREE.Color(0xbcd9f2);
export const ZENITH_COLOR = new THREE.Color(0x3b7ad9);

/**
 * A gradient sky: an inside-out sphere whose fragment colour is a function of
 * the view direction's height. Cheaper and softer than a cubemap, and it needs
 * no texture assets.
 */
export function createSky(radius = 800) {
  const geometry = new THREE.SphereGeometry(radius, 24, 16);

  const material = new THREE.ShaderMaterial({
    // BackSide: we are inside the sphere, so the outward-facing tris are culled.
    side: THREE.BackSide,
    // The sky is always behind everything, so it must not occlude geometry.
    depthWrite: false,
    fog: false,
    uniforms: {
      horizonColor: { value: HORIZON_COLOR },
      zenithColor: { value: ZENITH_COLOR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocalPosition;
      void main() {
        vLocalPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 horizonColor;
      uniform vec3 zenithColor;
      varying vec3 vLocalPosition;
      void main() {
        // Normalised height of this fragment on the sphere: -1 straight down,
        // 0 at the horizon, +1 straight up. Remap to 0..1 and ease it so the
        // gradient concentrates just above the horizon.
        float h = normalize(vLocalPosition).y;
        float t = smoothstep(-0.05, 0.6, h);
        gl_FragColor = vec4(mix(horizonColor, zenithColor, t), 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1; // draw first, before opaque geometry
  mesh.frustumCulled = false;
  return mesh;
}
