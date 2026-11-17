// Ground and scrub, built from the bake's typed arrays.
import * as THREE from 'three';
import { CLS, type BakeResult } from '../bake';
import { tag } from '../render/ascii';

const MESH_STEP = 2; // terrain mesh uses every 2nd height sample (2 vertices per unit)

/** Bilinear height lookup on the baked grid. */
export function heightSampler(B: BakeResult) {
  const m = B.meta, W = m.hCols, Hh = m.hRows, f = B.heights;
  const sx = (W - 1) / (m.x1 - m.x0), sz = (Hh - 1) / (m.z1 - m.z0);
  return (x: number, z: number) => {
    const u = Math.min(W - 1.001, Math.max(0, (x - m.x0) * sx)), v = Math.min(Hh - 1.001, Math.max(0, (z - m.z0) * sz));
    const i = u | 0, j = v | 0, a = u - i, b = v - j, q = j * W + i;
    return (f[q] * (1 - a) + f[q + 1] * a) * (1 - b) + (f[q + W] * (1 - a) + f[q + W + 1] * a) * b;
  };
}

export function buildTerrain(B: BakeResult, time: { value: number }, anisotropy: number) {
  const m = B.meta;
  const colTex = new THREE.DataTexture(B.colors, m.cols, m.rows, THREE.RGBAFormat);
  colTex.colorSpace = THREE.SRGBColorSpace; colTex.magFilter = THREE.LinearFilter; colTex.minFilter = THREE.LinearMipmapLinearFilter;
  colTex.generateMipmaps = true; colTex.anisotropy = anisotropy; colTex.needsUpdate = true;
  const clsTex = new THREE.DataTexture(B.classes, m.cols, m.rows, THREE.RedFormat);
  clsTex.magFilter = clsTex.minFilter = THREE.NearestFilter; clsTex.needsUpdate = true;

  const W = (m.hCols - 1) / MESH_STEP + 1, Hh = (m.hRows - 1) / MESH_STEP + 1;
  const pos = new Float32Array(W * Hh * 3), nrm = new Float32Array(W * Hh * 3), uv = new Float32Array(W * Hh * 2);
  const hc = m.hCols, f = B.heights, cell = (m.x1 - m.x0) / (m.hCols - 1);
  const at = (i: number, j: number) => f[Math.min(m.hRows - 1, Math.max(0, j)) * hc + Math.min(hc - 1, Math.max(0, i))];
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const gi = i * MESH_STEP, gj = j * MESH_STEP, v = j * W + i;
    pos[v * 3] = m.x0 + gi * cell; pos[v * 3 + 1] = at(gi, gj); pos[v * 3 + 2] = m.z0 + gj * cell;
    const nx = at(gi - 1, gj) - at(gi + 1, gj), nz = at(gi, gj - 1) - at(gi, gj + 1), ny = 2 * cell, L = Math.hypot(nx, ny, nz);
    nrm[v * 3] = nx / L; nrm[v * 3 + 1] = ny / L; nrm[v * 3 + 2] = nz / L;
    uv[v * 2] = gi / (m.hCols - 1); uv[v * 2 + 1] = gj / (m.hRows - 1);
  }
  const idx = new Uint32Array((W - 1) * (Hh - 1) * 6);
  let q = 0;
  for (let j = 0; j < Hh - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();

  const mat = new THREE.MeshLambertMaterial({ map: colTex });
  mat.onBeforeCompile = (s) => {
    s.uniforms.clsTex = { value: clsTex }; s.uniforms.uT = time;
    s.vertexShader = 'varying vec2 vCW;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vCW = (modelMatrix*vec4(transformed,1.)).xz;');
    s.fragmentShader = `uniform sampler2D clsTex; uniform float uT; varying vec2 vCW;
      float ch21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float cvn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(ch21(i),ch21(i+vec2(1,0)),f.x),mix(ch21(i+vec2(0,1)),ch21(i+vec2(1,1)),f.x),f.y); }
      ` + s.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        // drifting storm-cloud shadows
        vec2 cp = vCW*.022 - vec2(uT*.011, uT*.004);
        float cl = smoothstep(.55,.8, cvn(cp)*.65 + cvn(cp*2.3+4.)*.35);
        gl_FragColor.rgb *= 1. - .22*cl;
        gl_FragColor.a = texture2D(clsTex, vMapUv).r;`);
  };
  mat.customProgramCacheKey = () => 'terrain';
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true; mesh.castShadow = true;
  mesh.userData.textures = [clsTex]; // bound only inside onBeforeCompile, so dispose() must find it here
  return mesh;
}

// ---------------------------------------------------------------- scrub
function bladeWind(s: THREE.WebGLProgramParametersWithUniforms, time: { value: number }) {
  s.uniforms.uT = time;
  s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float ph = instanceMatrix[3].x*.34+instanceMatrix[3].z*.22;
    float gust = sin(uT*.75-ph)*.5+.5;
    transformed.x += (sin(uT*1.6+ph*2.)*.28+gust*.6)*.2*position.y*position.y;`);
}
function leafWind(s: THREE.WebGLProgramParametersWithUniforms, time: { value: number }) {
  s.uniforms.uT = time;
  s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float ph = instanceMatrix[3].x*.9+instanceMatrix[3].z*.7+instanceMatrix[3].y*.8;
    transformed.y += sin(uT*2.1+ph)*.03;
    transformed += vec3(1.,0.,.4)*sin(uT*.8+instanceMatrix[3].x*.22)*.04;`);
}

/** Chunked instanced scrub. `setFraction` thins every chunk uniformly (instances are shuffled per chunk). */
export function buildScrub(scene: THREE.Scene, B: BakeResult, time: { value: number }) {
  const N = B.meta.scrubCount, mats = B.scrub.subarray(0, N * 16), cols = B.scrub.subarray(N * 16, N * 19);
  const bladeG = new THREE.BufferGeometry();
  bladeG.setAttribute('position', new THREE.Float32BufferAttribute([-0.045, 0, 0, 0.045, 0, 0, 0.012, 0.6, 0, -0.045, 0, 0, 0.012, 0.6, 0, 0, 1, 0], 3));
  bladeG.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  const leafG = new THREE.PlaneGeometry(0.26, 0.2);
  const bladeM = tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), CLS.blade, (s) => bladeWind(s, time), 'blade');
  const leafM = tag(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), CLS.leaf, (s) => leafWind(s, time), 'leaf');
  const meshes: { im: THREE.InstancedMesh; full: number }[] = [];
  for (const c of B.meta.chunks) {
    const im = new THREE.InstancedMesh(c.kind ? leafG : bladeG, c.kind ? leafM : bladeM, c.count);
    im.instanceMatrix = new THREE.InstancedBufferAttribute(mats.subarray(c.start * 16, (c.start + c.count) * 16), 16);
    im.instanceColor = new THREE.InstancedBufferAttribute(cols.subarray(c.start * 3, (c.start + c.count) * 3), 3);
    im.boundingSphere = new THREE.Sphere(new THREE.Vector3(c.sphere[0], c.sphere[1], c.sphere[2]), c.sphere[3]);
    im.castShadow = c.kind === 1; im.receiveShadow = true;
    scene.add(im);
    meshes.push({ im, full: c.count });
  }
  return {
    count: N,
    setFraction(f: number) { for (const m of meshes) m.im.count = Math.max(0, Math.floor(m.full * Math.min(1, f))); },
  };
}
