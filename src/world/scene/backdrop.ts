// The backdrop: a tilted card in the top band, painted with a procedural Chisos ridgeline under a
// storm sky. The camera looks steeply down, so real ridge tops sit above the frame; the card puts a
// silhouette where the blur can still carry it. It rides with the camera (placed from the frustum
// every frame, so it holds through orbit and zoom) and its ridge slides slowly for parallax.
import * as THREE from 'three';
import { CLS } from '../bake';

/** NDC y of the card's lower edge (+1 is the top of the view). */
export const BASE_NDC = 0.4;
const LEAN = THREE.MathUtils.degToRad(8);

const frag = /* glsl */ `
uniform float uT, uOff, uW;
varying vec2 vUv;
float h11(float x){ return fract(sin(x*127.1)*43758.5453); }
float n1(float x){ float i=floor(x), f=fract(x); f=f*f*(3.-2.*f); return mix(h11(i),h11(i+1.),f); }
float f1(float x){ return n1(x)*.5+n1(x*2.1+3.)*.28+n1(x*4.3+7.)*.15+n1(x*8.9+1.)*.07; }
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ return vn(p)*.5+vn(p*2.1+3.1)*.28+vn(p*4.3+7.7)*.15+vn(p*8.7+1.3)*.07; }
float plateau(float x, float c, float w, float s){ return smoothstep(c-w-s, c-w, x)*smoothstep(c+w+s, c+w, x); }
// a peak: pointed summit, concave flanks
float peak(float x, float c, float w){ return pow(max(0., 1.-abs(x-c)/w), 1.5); }
// Chisos profile (Task 10b): a high Emory Peak massif, the blocky Casa Grande, jagged secondary
// peaks and a V notch (the Window), rising well above the foothill crest. Profile units: 32 = half the
// view height; the default views centre on x in about [-15, 30], so the massif sits in frame at every stop.
float rdg(float x){ return 1.-abs(2.*n1(x)-1.); }
float mainRidge(float x){
  float p = mod(x + 115., 230.) - 115.;  // one range per 230 units, centred on 0
  float h = .2 + .06*f1(x*.017) + .05*rdg(x*.06+3.)*rdg(x*.023);
  float m = peak(p, 8., 40.);                                  // Emory Peak massif
  h += .27*m + .05*m*rdg(p*.14+2.) + .02*rdg(p*.41);           // its crest is jagged
  h += .17*plateau(p, -26., 6., 3.5);                          // Casa Grande: flat top, cliff sides
  h += .13*peak(p, 46., 13.) + .1*peak(p, 62., 9.) + .12*peak(p, -55., 14.) + .09*peak(p, -76., 10.) + .1*peak(p, 92., 12.);
  h += .035*rdg(x*.19) + .012*f1(x*.6);
  h -= .09*smoothstep(7., 0., abs(p+13.));                     // the Window, a V notch west of the massif
  return h;
}
float farRidge(float x){ return .34 + .08*f1(x*.011+9.) + .06*rdg(x*.04+2.); }
void main(){
  float x = (vUv.x-.5)*uW + uOff, v = vUv.y;
  // the foot: ragged, then dissolved over a band so the card melts into the terrain (no straight seam)
  float foot = .015 + .07*f1(x*.09+2.)*f1(x*.031);
  float fade = smoothstep(foot, foot + .16, v);
  if(v < foot || h21(floor(gl_FragCoord.xy)) > fade) discard;
  float mr = mainRidge(x), fr = max(farRidge(x*.7+40.), mr+.02);
  vec3 c; float cls;
  if(v > fr){
    // storm sky: a thin pale band of breaking light at the horizon, blue-grey, then heavy slate billows
    float hv = v - fr;
    c = mix(vec3(.88,.84,.74), vec3(.5,.56,.62), smoothstep(.0,.07,hv));
    c = mix(c, vec3(.24,.29,.35), smoothstep(.07,.3,hv));
    vec2 cp = vec2(x*.03 - uT*.02, v*2.6);
    float b = fbm(cp), lit = fbm(cp*1.6+vec2(5.,uT*.008));
    c *= mix(1., .62, smoothstep(.42,.72,b)*smoothstep(.03,.12,hv));
    c += vec3(.16,.16,.15)*smoothstep(.6,.8,lit)*smoothstep(.04,.2,hv);
    // drifting cumulus (Task 12): separate puffs blown east across the storm sky, lit tops, grey bellies
    float xc = x - uT*.8;
    float puff = smoothstep(.5,.6, fbm(vec2(xc*.06, hv*6.+.7)) * smoothstep(.015,.06,hv));
    float pl = smoothstep(.45,.75, fbm(vec2(xc*.11+4., v*7.)) + (hv-.06)*3.);
    c = mix(c, mix(vec3(.4,.45,.52), vec3(.9,.86,.78), pl), puff*.9);
    cls = ${CLS.sky}.;
  } else if(v > mr){
    // far ridges, hazed blue-grey
    c = mix(vec3(.5,.55,.62), vec3(.58,.62,.67), smoothstep(mr, fr, v));
    cls = ${CLS.sky}.;
  } else {
    // the Chisos face: rust rimrock and cliffs high up, patchy olive woodland, tan foothills at the foot
    float d = mr - v, hr = v / max(mr, .01);
    float strata = step(.5, fract(v*22. + f1(x*.08)*1.5));
    vec3 rock = mix(vec3(.33,.25,.24), vec3(.42,.32,.28), strata);
    float wood = smoothstep(.35,.6,fbm(vec2(x*.12, v*9.)));
    vec3 midc = mix(vec3(.5,.44,.36), vec3(.36,.39,.27), wood);
    c = mix(vec3(.57,.53,.43), midc, smoothstep(.2,.45,hr));
    c = mix(c, rock, smoothstep(.55,.8,hr) * smoothstep(.0,.03,d+.01));
    // light from the front-left: faces that rise to the right are lit, the others in storm shade
    float sl = mainRidge(x+.6) - mainRidge(x-.6);
    c *= clamp(.88 + 5.*sl, .62, 1.18) * (.9 + .2*f1(x*.3+v*9.));
    cls = hr > .62 ? ${CLS.rock}. : ${CLS.dirt}.;
  }
  gl_FragColor = vec4(pow(c, vec3(2.2)), cls/16.);
}`;

export function buildBackdrop(scene: THREE.Scene, time: { value: number }) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0); // lower edge on y = 0
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: time, uOff: { value: 0 }, uW: { value: 100 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: frag,
    side: THREE.DoubleSide,
    // drawn last and over everything in its band: the card *is* the far view, so nothing pokes through
    depthTest: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.renderOrder = 10;
  scene.add(mesh);

  const local = new THREE.Matrix4(), rot = new THREE.Matrix4(), scl = new THREE.Matrix4();
  return {
    mesh,
    /** Place the card from the frustum, so it holds through orbit and zoom. `parallax` slides the ridge (profile units; 32 = half the view height). */
    update(camera: THREE.PerspectiveCamera, parallax: number) {
      camera.updateMatrixWorld();
      const D = 120;
      const halfH = D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.zoom, halfW = halfH * camera.aspect;
      // a horizontal lens shift (projection element 8, the engine's desktop framing) moves the view's
      // window sideways: widen the card by as much so it still spans the whole width
      const h = (1.12 - BASE_NDC) * halfH * 1.4, w = halfW * (2.6 + 2 * Math.abs(camera.projectionMatrix.elements[8]));
      local.makeTranslation(0, BASE_NDC * halfH, -D).multiply(rot.makeRotationX(-LEAN)).multiply(scl.makeScale(w, h, 1));
      mesh.matrix.multiplyMatrices(camera.matrixWorld, local);
      mesh.matrixWorldNeedsUpdate = true;
      // profile units are screen-relative (32 per half view height) so peaks keep their angular size
      mat.uniforms.uW.value = (w / halfH) * 32;
      mat.uniforms.uOff.value = parallax;
    },
  };
}
