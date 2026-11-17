// The Rio Grande at the road's end: a silty green-brown river with rolling riffles and foam rims.
import * as THREE from 'three';
import { WATER, riverZ, X0, X1, type BakeResult } from '../bake';
import { heightSampler } from './terrain';

const PER_UNIT = 4;

export function buildRiver(B: BakeResult, time: { value: number }) {
  let zMin = Infinity, zMax = -Infinity;
  for (let x = X0; x <= X1; x += 1) { const z = riverZ(x); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); }
  zMin -= 7; zMax += 7;
  // water depth over the band (depth + 0.5, ×50, as bytes)
  const H = heightSampler(B), W = Math.round((X1 - X0) * PER_UNIT) + 1, Hh = Math.round((zMax - zMin) * PER_UNIT) + 1;
  const depth = new Uint8Array(W * Hh);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const x = X0 + i / PER_UNIT, z = zMin + j / PER_UNIT;
    depth[j * W + i] = Math.max(0, Math.min(255, (WATER - H(x, z) + 0.5) * 50));
  }
  const dt = new THREE.DataTexture(depth, W, Hh, THREE.RedFormat);
  dt.magFilter = dt.minFilter = THREE.LinearFilter; dt.needsUpdate = true;
  const m = new THREE.ShaderMaterial({
    uniforms: { uD: { value: dt }, uT: time, uB: { value: new THREE.Vector4(X0, zMin, X1 - X0, zMax - zMin) } },
    vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix*vec4(position,1.)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vW,1.); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uD; uniform float uT; uniform vec4 uB; varying vec3 vW;
      float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ return vn(p)*.55+vn(p*2.1+3.1)*.3+vn(p*4.3+7.7)*.15; }
      void main(){
        vec2 uv = (vW.xz-uB.xy)/uB.zw;
        float d = texture2D(uD,uv).r*255./50. - .5;
        if(d<-.04) discard;
        vec2 fp = vW.xz + vec2(uT*.9, 0.);           // the river runs toward +x
        float n = fbm(fp*vec2(.25,.6));
        float dd = max(d,0.);
        vec3 shallow = vec3(.5,.47,.33), mid = vec3(.26,.36,.3), deep = vec3(.14,.25,.24);
        vec3 c = mix(shallow, mid, smoothstep(.05,.6,dd));
        c = mix(c, deep, smoothstep(.6,1.4,dd));
        c *= .85 + .3*n;
        // Task 12: broad current bands rolling downstream, big enough to carry through the bottom blur
        float roll = .5+.5*sin(vW.x*.42 - uT*1.5 + 3.*fbm(vW.xz*vec2(.06,.25)));
        c *= .86 + .28*roll*smoothstep(.05,.5,dd);
        float streak = smoothstep(.58,.8, fbm(fp*vec2(.18,1.4)))*1.6;
        float riffle = smoothstep(.55,.75, fbm(fp*vec2(.7,.9)+3.)) * smoothstep(.5,.15,dd);
        float rim = smoothstep(.14,.0,dd)*(.5+.5*vn(fp*1.3));
        c += vec3(.1,.11,.1)*streak;
        float cls = 9.;
        float f = max(riffle, rim);
        if(f>.35){ c = mix(c, vec3(.82,.8,.72), clamp(f*1.4,0.,1.)); cls = 10.; }
        gl_FragColor = vec4(c, cls/16.);
      }`,
  });
  const g = new THREE.PlaneGeometry(X1 - X0, zMax - zMin);
  g.rotateX(-Math.PI / 2); g.translate((X0 + X1) / 2, WATER, (zMin + zMax) / 2);
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = false;
  return mesh;
}
