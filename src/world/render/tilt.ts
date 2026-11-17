// Tilt-shift: the middle band (about 35–65% of the height) stays sharp; above and below, the
// glyphs melt into a soft blur on a golden-angle disc, like a scale model shot through a tilted lens.
import * as THREE from 'three';
import { FULLSCREEN_VERT } from './ascii';

const frag = /* glsl */ `
precision highp float;
uniform sampler2D uA; uniform vec2 uRes; uniform float uR, uFocus;
in vec2 vUv; out vec4 outColor;
const int TAPS = 32;
void main(){
  float dy = abs(vUv.y-uFocus);
  float r = pow(smoothstep(.15,.5,dy),1.35)*uR;
  if(r<.35){ outColor = vec4(texture(uA,vUv).rgb,1.); return; }
  float lod = max(log2(r/5.),0.);
  vec3 c = vec3(0.);
  for(int i=0;i<TAPS;i++){
    float t = float(i)+.5, a = t*2.39996, rr = sqrt(t/float(TAPS))*r;
    c += textureLod(uA, vUv+vec2(cos(a),sin(a))*rr/uRes, lod).rgb;
  }
  outColor = vec4(c/float(TAPS),1.);
}`;

export function createTiltMaterial() {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: FULLSCREEN_VERT, fragmentShader: frag, depthTest: false, depthWrite: false,
    // uFocus is in GL uv (0 = bottom): the focus band is centred on the screen.
    uniforms: { uA: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uR: { value: 26 }, uFocus: { value: 0.5 } },
  });
}

/** Blur radius at the edges, in backing pixels, for a backing height. */
export const tiltRadius = (backingH: number) => 30 * (backingH / 1200);
