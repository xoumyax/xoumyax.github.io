// Landmarks (the doors), the parked Corolla and the windmill spring. All primitives, no assets.
// Roofs and tops are coloured and lit: the camera looks down, so tops are what it sees.
import * as THREE from 'three';
import { CLS, carSpot, heightAt, journeyS, landmarks, riverDist, roadAt, roadInfo, roadLength, windmillSpot, type LandmarkKey } from '../bake';
import { tag } from '../render/ascii';

const lam = (color: THREE.ColorRepresentation, cls: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  tag(new THREE.MeshLambertMaterial({ color, ...extra }), cls);
const basic = (c: THREE.Color, cls: number) => tag(new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }), cls);

function box(g: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; g.add(m);
  return m;
}

/** Amber pushed toward orange, in linear light, kept in range so the glyph pass keeps the hue. */
export const DOME_GLOW = new THREE.Color(1.15, 0.36, 0.06);

function ranger(g: THREE.Group) {
  const wall = lam('#cdb998', CLS.stone), trim = lam('#5b4330', CLS.wood);
  box(g, 3.6, 1.55, 2.6, wall);
  // low hipped roof in NPS green, lit so it reads from above
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.75, 0.85, 4, 1), lam('#6a9150', CLS.roof, { emissive: '#22381a', emissiveIntensity: 0.45 }));
  roof.rotation.y = Math.PI / 4; roof.scale.set(1.0, 1, 0.74); roof.position.y = 1.55 + 0.42; roof.castShadow = true; g.add(roof);
  box(g, 0.75, 1.05, 0.08, trim, -0.6, 0, 1.32);                    // door
  for (const x of [0.55, 1.25]) box(g, 0.45, 0.42, 0.06, lam('#2d3238', CLS.wood), x, 0.68, 1.32); // windows
  box(g, 3.9, 0.12, 0.7, trim, 0, 1.45, 1.6);                         // porch roof
  for (const x of [-1.8, 1.8]) box(g, 0.1, 1.45, 0.1, trim, x, 0, 1.9);
  box(g, 0.08, 3.4, 0.08, lam('#e4e0d8', CLS.stone), 2.4, 0, 1.4);    // flagpole
  box(g, 0.66, 0.4, 0.04, lam('#c63b2b', CLS.roof), 2.75, 2.9, 1.4);  // flag
  box(g, 0.66, 0.12, 0.045, lam('#f2efe8', CLS.roof), 2.75, 3.02, 1.4);
  return 2.6;
}

function trailer(g: THREE.Group) {
  // Airstream: polished aluminium capsule, a teal door stripe, an awning and a shed
  const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 2.3, 6, 14), lam('#d3d9dd', CLS.stone, { emissive: '#3b4247', emissiveIntensity: 0.35 }));
  shell.rotation.z = Math.PI / 2; shell.position.set(0, 0.95, 0); shell.scale.set(1, 1, 0.92); shell.castShadow = shell.receiveShadow = true; g.add(shell);
  box(g, 3.0, 0.1, 1.15, lam('#eef2f3', CLS.roof, { emissive: '#4a5054', emissiveIntensity: 0.3 }), 0, 1.62, 0); // bright roof band
  box(g, 0.5, 0.95, 0.06, lam('#3f7f7c', CLS.wood), 0.6, 0.35, 0.68);  // door
  box(g, 2.4, 0.06, 1.1, lam('#2fa6a0', CLS.roof, { emissive: '#0f4a46', emissiveIntensity: 0.4 }), -0.4, 1.45, 1.15);  // turquoise awning
  for (const x of [-1.4, 0.6]) box(g, 0.06, 1.45, 0.06, lam('#cfd3d5', CLS.stone), x, 0, 1.6);
  box(g, 1.2, 0.08, 0.6, lam('#9a7a55', CLS.wood), -0.5, 0.5, 2.1);    // picnic table
  box(g, 1.3, 1.1, 1.1, lam('#e2dccd', CLS.stone), -3.0, 0, -0.5);     // shed
  box(g, 1.45, 0.1, 1.25, lam('#8f8a7e', CLS.roof), -3.0, 1.1, -0.5);
  // hitch and a propane bottle
  box(g, 0.7, 0.08, 0.08, lam('#3b3b3b', CLS.wood), 2.2, 0.35, 0);
  return 2.2;
}

function dome(g: THREE.Group) {
  // geodesic hemisphere: flat facets, a few glowing panes and the open, lit door facing the road (+z)
  const ico = new THREE.IcosahedronGeometry(2.3, 2), p = ico.attributes.position, keep: number[] = [], glow: number[] = [];
  for (let i = 0; i < p.count; i += 3) {
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3, cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    if (cy < -0.2) continue;
    const tri = [0, 1, 2].flatMap((k) => [p.getX(i + k), Math.max(0, p.getY(i + k)), p.getZ(i + k)]);
    const window = cz > 0.3 && cx < -0.8 && cx > -2.2 && cy < 1.5;                // triangular panes, left of the door
    const door = Math.abs(cx) < 0.55 && cz > 1.6 && cy < 1.5;
    (window || door ? glow : keep).push(...tri);
  }
  const mk = (arr: number[]) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); geo.computeVertexNormals(); return geo; };
  const shell = new THREE.Mesh(mk(keep), lam('#f2d4ac', CLS.dome, { emissive: '#ff5a08', emissiveIntensity: 0.5, side: THREE.DoubleSide, flatShading: true }));
  shell.castShadow = true; shell.receiveShadow = true;
  const panes = new THREE.Mesh(mk(glow), basic(DOME_GLOW, CLS.glow));
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.4), basic(DOME_GLOW.clone().multiplyScalar(1.05), CLS.glow));
  door.position.set(0, 0.72, 2.2);
  // a warm pool of light spilling out of the door onto the gravel
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), basic(new THREE.Color(0.95, 0.32, 0.07), CLS.glow));
  pool.rotation.x = -Math.PI / 2; pool.scale.set(1.0, 1.3, 1); pool.position.set(0, 0.04, 3.1);
  const light = new THREE.PointLight('#ff7417', 34, 24, 1.6); light.position.set(0, 1.1, 3.2);
  // lantern posts by the door, a few step stones
  for (const x of [-1.2, 1.2]) box(g, 0.1, 0.9, 0.1, lam('#5a4636', CLS.wood), x, 0, 2.7);
  for (const x of [-1.2, 1.2]) { const lan = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), basic(DOME_GLOW, CLS.glow)); lan.position.set(x, 1.0, 2.7); g.add(lan); }
  g.add(shell, panes, door, pool, light);
  g.userData.light = light;
  return 2.5;
}

function school(g: THREE.Group) {
  // old adobe schoolhouse: thick mud walls, flat roof with parapet, viga ends, a belfry over the door
  const adobe = lam('#c99f78', CLS.stone), roofM = lam('#b8553a', CLS.roof, { emissive: '#4a1c10', emissiveIntensity: 0.45 }), wood = lam('#5e4027', CLS.wood);
  box(g, 4.2, 1.7, 2.9, adobe);
  box(g, 3.9, 0.06, 2.6, roofM, 0, 1.7, 0);                          // roof deck
  for (const [w, d, x, z] of [[4.2, 0.18, 0, 1.36], [4.2, 0.18, 0, -1.36], [0.18, 2.9, 2.01, 0], [0.18, 2.9, -2.01, 0]] as const) box(g, w, 0.3, d, adobe, x, 1.7, z); // parapet
  for (let i = 0; i < 6; i++) box(g, 0.12, 0.12, 0.3, wood, -1.75 + i * 0.7, 1.45, 1.55);  // vigas
  box(g, 1.0, 1.2, 0.9, adobe, 0, 1.7, 0.9);                          // belfry
  box(g, 1.15, 0.14, 1.05, roofM, 0, 2.9, 0.9);
  const bell = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 10), lam('#b0843f', CLS.wood)); bell.position.set(0, 2.35, 1.38); g.add(bell);
  box(g, 0.75, 1.15, 0.08, wood, 0, 0, 1.47);                         // door
  for (const x of [-1.4, 1.4]) box(g, 0.5, 0.5, 0.06, lam('#2b2c30', CLS.wood), x, 0.7, 1.47);
  return 3.1;
}

function trailhead(g: THREE.Group) {
  // signpost, a small map kiosk with a slanted roof, and a ramada (shade shelter) over a picnic table
  const wood = lam('#8a6a48', CLS.wood);
  const tin = lam('#6b8599', CLS.roof, { emissive: '#1c2a36', emissiveIntensity: 0.35 });
  const ram = new THREE.Group(); ram.position.set(-2.4, 0, -0.9); g.add(ram);
  for (const [x, z] of [[-1.1, -0.8], [1.1, -0.8], [-1.1, 0.8], [1.1, 0.8]] as const) box(ram, 0.12, 1.6, 0.12, wood, x, 0, z);
  box(ram, 2.8, 0.1, 2.1, tin, 0, 1.6, 0);
  box(ram, 1.3, 0.08, 0.6, lam('#9a7a55', CLS.wood), 0, 0.55, 0);
  box(g, 0.14, 1.9, 0.14, wood, -0.5); box(g, 0.14, 1.9, 0.14, wood, 0.5);
  box(g, 1.4, 0.62, 0.09, lam('#6b4a30', CLS.wood, { emissive: '#3a2412', emissiveIntensity: 0.3 }), 0, 1.15);
  box(g, 1.4, 0.06, 0.1, lam('#e9dfc8', CLS.roof), 0, 1.5);
  const k = new THREE.Group(); k.position.set(1.8, 0, -0.6); g.add(k);
  box(k, 0.1, 1.6, 0.1, wood, -0.5); box(k, 0.1, 1.6, 0.1, wood, 0.5);
  box(k, 1.1, 0.75, 0.06, lam('#3e5a4a', CLS.stone), 0, 0.6);
  const r = box(k, 1.5, 0.08, 0.9, tin, 0, 1.62); r.rotation.x = -0.35;
  for (const [x, z, s] of [[-1.0, 0.9, 0.5], [-4.2, 0.3, 0.35], [2.9, 0.4, 0.42]] as const) {
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), lam('#a9a39a', CLS.rock)); b.scale.y = 0.6; b.position.set(x, s * 0.25, z); b.castShadow = true; g.add(b);
  }
  return 2.2;
}

const BUILDERS: Record<LandmarkKey, (g: THREE.Group) => number> = { ranger, trailer, dome, school, trailhead };

/** Boulders in outcrops: thicker around the trailhead at the mountain foot, then all down the road. */
function boulders(scene: THREE.Scene) {
  let seed = 4242;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const L = roadLength(), s0 = journeyS(0) - 12, lm = landmarks();
  const mats: THREE.Matrix4[] = [], cols: THREE.Color[] = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), m = new THREE.Matrix4();
  let cx = 0, cz = 0, left = 0;
  for (let guard = 0; mats.length < 2400 && guard < 60000; guard++) {
    if (left-- <= 0) {
      // a new outcrop: a cluster of 3–12 stones around a centre beside the road
      const head = rnd() < 0.3;
      const s = head ? s0 + rnd() * 34 : s0 + rnd() * (L - s0);
      const p = roadAt(s), side = rnd() < 0.5 ? -1 : 1, off = 2.6 + Math.pow(rnd(), 1.3) * 24;
      cx = p.x - p.tz * side * off; cz = p.z + p.tx * side * off; left = 3 + ((rnd() * 10) | 0);
    }
    const a = rnd() * 6.283, rr = Math.pow(rnd(), 0.7) * 2.2;
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    if (roadInfo(x, z).d < 2.4 || riverDist(x, z) < 4 || lm.some((l) => (x - l.x) ** 2 + (z - l.z) ** 2 < (l.radius + 1) ** 2)) continue;
    const r = (0.16 + rnd() * 0.42) * (rnd() < 0.1 ? 2 : 1);
    e.set(rnd() * 6, rnd() * 6, rnd() * 6); q.setFromEuler(e);
    mats.push(m.clone().compose(new THREE.Vector3(x, heightAt(x, z) + r * 0.15, z), q, new THREE.Vector3(r, r * 0.55, r * (0.8 + rnd() * 0.4))));
    const v = 0.42 + rnd() * 0.3; cols.push(new THREE.Color(v * 0.95, v * 0.92, v * 0.9));
  }
  const im = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), lam('#ffffff', CLS.rock), mats.length);
  mats.forEach((mm, i) => { im.setMatrixAt(i, mm); im.setColorAt(i, cols[i]); });
  im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
  scene.add(im);
}

function worldVertices(g: THREE.Object3D) {
  g.updateMatrixWorld(true);
  const out: number[] = [], v = new THREE.Vector3();
  g.traverse((ob) => {
    const pos = (ob as THREE.Mesh).isMesh ? (ob as THREE.Mesh).geometry.attributes.position : null;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(ob.matrixWorld); out.push(v.x, v.y, v.z); }
  });
  return Float32Array.from(out);
}

/** Builds the landmarks, the Corolla and the windmill. Returns anchors (just above each landmark) and a ticker. */
export function buildProps(scene: THREE.Scene) {
  boulders(scene);
  const anchors = {} as Record<LandmarkKey, THREE.Vector3>;
  /** World-space bounding box of each landmark's geometry (static: built once). */
  const boxes = {} as Record<LandmarkKey, THREE.Box3>;
  /** World-space vertices of each landmark's geometry (x, y, z, …): its true silhouette, for framing checks. */
  const points = {} as Record<LandmarkKey, Float32Array>;
  let domeGroup: THREE.Group | null = null;
  for (const l of landmarks()) {
    const g = new THREE.Group();
    g.position.set(l.x, l.y - 0.05, l.z); g.rotation.y = l.yaw; g.scale.setScalar(l.scale);
    const top = BUILDERS[l.id](g) * l.scale;
    scene.add(g);
    anchors[l.id] = new THREE.Vector3(l.x, l.y + top, l.z);
    boxes[l.id] = new THREE.Box3().setFromObject(g);
    points[l.id] = worldVertices(g);
    if (l.id === 'dome') domeGroup = g;
  }
  // the parked silver Corolla
  const c = carSpot(), car = new THREE.Group();
  const silver = lam('#c9cdd2', CLS.stone, { emissive: '#30343a', emissiveIntensity: 0.3 });
  box(car, 0.9, 0.42, 2.05, silver, 0, 0.16);
  box(car, 0.82, 0.32, 1.15, lam('#3c4450', CLS.stone), 0, 0.58, -0.1);  // glass
  box(car, 0.78, 0.05, 0.95, lam('#dfe2e6', CLS.roof), 0, 0.9, -0.1);    // silver roof (what the camera sees)
  for (const [x, z] of [[-0.45, 0.65], [0.45, 0.65], [-0.45, -0.65], [0.45, -0.65]] as const) box(car, 0.12, 0.3, 0.34, lam('#1f1f22', CLS.wood), x, 0, z);
  car.position.set(c.x, c.y, c.z); car.rotation.y = c.yaw + 0.12; scene.add(car);

  // Aermotor windmill over a stock tank at the spring
  const w = windmillSpot(), mill = new THREE.Group(); mill.position.set(w.x, w.y, w.z);
  const steel = lam('#9a9a96', CLS.stone);
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 5.2, 4), steel);
    leg.position.set(x * 0.55, 2.6, z * 0.55); leg.rotation.set(z * 0.11, 0, -x * 0.11); leg.castShadow = true; mill.add(leg);
  }
  const head = new THREE.Group(); head.position.set(0, 5.3, 0.25); mill.add(head);
  const wheel = new THREE.Group(); head.add(wheel);
  for (let i = 0; i < 16; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.02), lam('#d8d4c8', CLS.roof)); b.position.y = 0.6; const arm = new THREE.Group(); arm.rotation.z = (i / 16) * Math.PI * 2; arm.add(b); wheel.add(arm); }
  box(head, 0.06, 0.06, 1.4, steel, 0, 0, -0.8);
  const vane = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.6, 0.8), lam('#d8d4c8', CLS.roof)); vane.position.set(0, 0, -1.5); head.add(vane);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.55, 20, 1, true), lam('#8d8f8c', CLS.stone, { side: THREE.DoubleSide })); tank.position.set(1.8, 0.27, 0.8); mill.add(tank);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.05, 20), lam('#4f6a64', CLS.water)); water.rotation.x = -Math.PI / 2; water.position.set(1.8, 0.48, 0.8); mill.add(water);
  mill.rotation.y = 0.5; scene.add(mill);

  const light = domeGroup ? (domeGroup.userData.light as THREE.PointLight) : null;
  return {
    anchors, boxes, points,
    tick(t: number) {
      wheel.rotation.z = -t * 1.3;
      if (light) light.intensity = 34 * (0.92 + 0.08 * Math.sin(t * 1.7) * Math.sin(t * 0.63));
    },
  };
}
