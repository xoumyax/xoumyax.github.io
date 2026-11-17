// Light: a low-ish warm sun from the front-left under a storm sky, a cool sky / warm ground fill.
import * as THREE from 'three';

const SUN_DIR = new THREE.Vector3(-30, 44, 22).normalize();
const SHADOW_SPAN = 30;

export function buildSky(scene: THREE.Scene, shadowMap: number) {
  scene.background = null; // the backdrop card fills the top; anything uncovered is class 0 (blank)
  const sun = new THREE.DirectionalLight('#fff0dc', 2.8);
  const hemi = new THREE.HemisphereLight('#d3dce8', '#8a7a62', 1.15);
  sun.castShadow = shadowMap > 0;
  const cam = sun.shadow.camera;
  cam.left = -SHADOW_SPAN; cam.right = SHADOW_SPAN; cam.top = SHADOW_SPAN; cam.bottom = -SHADOW_SPAN; cam.near = 5; cam.far = 170;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target, hemi);

  const xL = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
  const yL = new THREE.Vector3().crossVectors(SUN_DIR, xL);
  const tmp = new THREE.Vector3();
  let size = 0;
  const setShadowMap = (n: number) => {
    size = n;
    sun.castShadow = n > 0;
    if (n > 0) { sun.shadow.mapSize.set(n, n); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  };
  setShadowMap(shadowMap);
  return {
    sun,
    setShadowMap,
    /** Keep the shadow frustum on the view target, snapped to shadow texels so it does not shimmer. */
    follow(target: THREE.Vector3) {
      tmp.copy(target);
      if (size > 0) {
        const texel = (2 * SHADOW_SPAN) / size, a = target.dot(xL), b = target.dot(yL);
        tmp.addScaledVector(xL, Math.round(a / texel) * texel - a).addScaledVector(yL, Math.round(b / texel) * texel - b);
      }
      sun.target.position.copy(tmp); sun.position.copy(tmp).addScaledVector(SUN_DIR, 85);
      sun.target.updateMatrixWorld();
    },
  };
}
