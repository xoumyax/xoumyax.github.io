// The glyph pass: each cell takes its colour from the scene render and its character from the
// surface class (written into alpha by every scene material), brightness and edge direction.
import * as THREE from 'three';

export const GLYPHS = " .'`,:;-~=+*oOsS$%&8#@/\\|_^v\u2014";
const GI: Record<string, number> = Object.fromEntries([...GLYPHS].map((c, i) => [c, i]));
const g = (c: string) => {
  if (!(c in GI)) throw new Error(`glyph ${c} is not in the atlas`);
  return GI[c].toFixed(1);
};

/** Make a scene material write its glyph class into alpha. */
export function tag<M extends THREE.Material>(mat: M, cls: number, extra?: (s: THREE.WebGLProgramParametersWithUniforms) => void, key = ''): M {
  mat.onBeforeCompile = (s) => {
    extra?.(s);
    s.fragmentShader = s.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n gl_FragColor.a = ${(cls / 16).toFixed(4)};`);
  };
  mat.customProgramCacheKey = () => `cls${cls}:${key}`;
  return mat;
}

export const MONO_FONT = '"JetBrains Mono Variable", "JetBrains Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

/** Glyph atlas: one row of white glyphs on black, drawn with the site's monospace font. */
export async function buildAtlas(): Promise<THREE.CanvasTexture> {
  const font = `700 100px ${MONO_FONT}`;
  try { await document.fonts.load(font, GLYPHS); } catch { /* fall back to whatever monospace is there */ }
  const tw = 64, th = 120, c = document.createElement('canvas');
  c.width = tw * GLYPHS.length; c.height = th;
  const x = c.getContext('2d')!;
  x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = font;
  [...GLYPHS].forEach((ch, i) => { if (ch === '\u2014') x.fillRect(i * tw, th * 0.44, tw, th * 0.12); else x.fillText(ch, (i + 0.5) * tw, th * 0.52); });
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; t.flipY = false;
  return t;
}

const frag = /* glsl */ `
precision highp float;
uniform sampler2D uScene, uAtlas; uniform vec2 uGrid; uniform float uTime, uN;
in vec2 vUv; out vec4 outColor;
float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float lum(vec3 c){ return dot(c,vec3(.25,.6,.15)); }
// hue-preserving clamp: scale the whole colour down instead of clipping channels (keeps amber amber)
vec3 hclamp(vec3 c){ c = max(c,0.); float m = max(c.r,max(c.g,c.b)); return m > 1. ? c/m : c; }
vec3 grade(vec3 c){
  c = max(c,0.); c = c/(1.+c*.12); c = hclamp(c); c = pow(c,vec3(1./2.2));
  c = mix(c,c*c*(3.-2.*c),.45);
  float l = lum(c); c = mix(vec3(l),c,1.18);
  return clamp(c,0.,1.);
}
void main(){
  vec2 gp = vUv*uGrid, cell = floor(gp), cuv = (cell+.5)/uGrid;
  ivec2 sz = textureSize(uScene,0);
  float lodC = log2(float(sz.x)/uGrid.x)+.05;
  vec3 col = grade(textureLod(uScene,cuv,lodC).rgb);
  float cls = floor(texelFetch(uScene,ivec2(cuv*vec2(sz)),0).a*16.+.5);
  float L = lum(col);
  vec2 e = 1./uGrid;
  float lx0=lum(grade(textureLod(uScene,cuv-vec2(e.x,0),lodC).rgb)), lx1=lum(grade(textureLod(uScene,cuv+vec2(e.x,0),lodC).rgb));
  float ly0=lum(grade(textureLod(uScene,cuv-vec2(0,e.y),lodC).rgb)), ly1=lum(grade(textureLod(uScene,cuv+vec2(0,e.y),lodC).rgb));
  vec2 grad = vec2(lx1-lx0,(ly1-ly0)*.55); float mag = length(grad);
  float a4 = mod(atan(grad.y,grad.x)+.3927,3.14159)/.7854;
  float edgeG = a4<1.?${g('|')}:a4<2.?${g('\\')}:a4<3.?${g('\u2014')}:${g('/')};
  // wind field, slow enough that glyphs lean and settle rather than strobe
  float w = vn(cell*vec2(.05,.09)+vec2(-uTime*.22,uTime*.05))*2.-1.;
  float hc = h21(cell);
  vec3 blur = grade(textureLod(uScene,vUv,lodC+1.2).rgb);
  float gl = ${g('.')}; float bgK = .22; float inkK = 1.3;
  if(cls<.5){                // nothing
    gl = ${g(' ')}; bgK = .6;
  } else if(cls<1.5){        // blades: bunchgrass, ocotillo, cane
    gl = L<.1?${g('.')}:L<.17?${g(':')}:(w<-.2?${g('\\')}:w>.2?${g('/')}:${g('|')});
  } else if(cls<2.5){        // leaf cards: creosote, mesquite, juniper, willow
    gl = L<.12?${g('.')}:L<.24?${g(':')}:L<.38?${g('*')}:L<.5?${g('+')}:${g('o')};
  } else if(cls<3.5){        // amber glow
    gl = L<.35?${g('*')}:L<.6?${g('o')}:L<.8?${g('O')}:${g('@')}; bgK = .55; inkK = 1.0;
  } else if(cls<4.5){        // walls, car, trailer, posts
    gl = L<.22?${g(':')}:L<.42?${g('%')}:${g('#')};
    if(mag>.16) gl = edgeG;
    bgK = .3;
  } else if(cls<5.5){        // road: a soft band of asphalt with sparse grit; only the centre dashes, brighter than their surroundings, get a stroke
    float dash = step(.025,L-lum(blur));
    gl = dash>.5?${g('-')}:(hc<.16?${g('.')}:${g(' ')}); bgK = .62; inkK = 1.05+.2*dash;
  } else if(cls<6.5){        // dome shell
    gl = L<.2?${g(':')}:L<.45?${g('=')}:${g('#')};
    if(mag>.12) gl = edgeG;
    bgK = .4; inkK = 1.15;
  } else if(cls<7.5){        // wood
    gl = L<.14?${g(':')}:(mag>.1?edgeG:(L<.34?${g('|')}:${g('#')}));
  } else if(cls<8.5){        // gravel: bars, washes, pads
    gl = L<.3?${g(':')}:L<.6?(hc<.5?${g(';')}:${g(':')}):(hc<.3?${g('-')}:hc<.65?${g('.')}:${g("'")}); bgK = .55;
  } else if(cls<9.5){        // water
    gl = L<.22?${g('-')}:L<.45?(w>0.?${g('~')}:${g('-')}):L<.72?${g('~')}:${g('=')}; bgK = .35;
  } else if(cls<10.5){       // riffles and foam
    gl = L<.6?${g('*')}:L<.82?${g('%')}:${g('#')}; bgK = .4;
  } else if(cls<11.5){       // figures, horse
    gl = L<.4?${g('&')}:${g('$')};
  } else if(cls<12.5){       // roofs: lit from above so the steep camera sees them
    gl = L<.4?${g('=')}:${g('\u2014')}; bgK = .35;
  } else if(cls<13.5){       // cliff rock, ridges
    gl = L<.12?${g('.')}:L<.26?${g(':')}:L<.42?${g('%')}:${g('#')};
    if(mag>.2) gl = edgeG;
  } else if(cls<14.5){       // desert floor and slopes: marks follow the ground's tone in patches, not a uniform grid
    float pt = vn(cell*vec2(.21,.37)+7.);
    gl = L<.14?${g('.')}:L<.28?(hc<.55?${g(',')}:${g('.')}):L<.46?(pt<.38?(hc<.5?${g(' ')}:${g('.')}):hc<.35?${g(':')}:hc<.7?${g(',')}:${g("'")}):(pt<.45?(hc<.6?${g(' ')}:${g("'")}):hc<.5?${g(';')}:${g(':')});
    if(mag>.22) gl = edgeG;
    bgK = .58;
  } else {                   // storm sky and far ridges on the backdrop
    gl = L<.25?${g('-')}:L<.5?(hc<.5?${g('~')}:${g('-')}):(hc<.5?${g('~')}:${g('=')}); bgK = .85; inkK = 1.12;
  }
  vec2 gv = gp-cell, dx = dFdx(gp), dy = dFdy(gp);
  float ink = smoothstep(.12,.78,textureGrad(uAtlas,vec2((gl+gv.x)/uN,1.-gv.y),dx/uN,dy).r);
  outColor = vec4(mix(blur*bgK, hclamp(col*inkK+.012), ink),1.);
}`;

export const FULLSCREEN_VERT = `in vec3 position; in vec2 uv; out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }`;

export function createAsciiMaterial(atlas: THREE.Texture, time: { value: number }) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: FULLSCREEN_VERT, fragmentShader: frag, depthTest: false, depthWrite: false,
    uniforms: { uScene: { value: null }, uAtlas: { value: atlas }, uGrid: { value: new THREE.Vector2(200, 63) }, uTime: time, uN: { value: GLYPHS.length } },
  });
}
