// The road: the journey's leading line. `road` is the contract Task 12 walks the figures on.
//
// Journey mapping (Task 10b, I2): `road.curve` runs from the trailhead (t = 0, the srm stop, far,
// top of view) to the road's end on the Rio Grande (t = 1, the river stop, near). Use it with
// `getPointAt` (arc-length t): then curve t IS journey u, so a figure at journey u stands at
// `road.curve.getPointAt(u)` and the point at `journeyForStop(id)` is beside that stop's landmark.
// The 30-unit lead-in that climbs behind the backdrop card is drawn on the terrain but is not part
// of the curve. (bake.ts `journeyS(u)` is the arc length on the full polyline, lead-in included.)
import * as THREE from 'three';
import { CLS, heightAt, journeyS, roadAt, roadLength, roadPolyline } from '../bake';
import { tag } from '../render/ascii';

const pts = roadPolyline(1, journeyS(0)).map(([x, y, z]) => new THREE.Vector3(x, y, z));
const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
curve.arcLengthDivisions = 3000;

/** From the trailhead (t = 0 = journey u 0, far, top of view) down to the Rio Grande (t = 1 = journey u 1, near). Use getPointAt. */
export const road: { curve: THREE.CatmullRomCurve3; length: number; heightAt(x: number, z: number): number } = {
  curve,
  length: curve.getLength(),
  heightAt,
};

/** Delineator posts on both shoulders and a line of telephone poles on the near side. */
export function buildRoadside(scene: THREE.Scene) {
  const L = roadLength();
  const posts: THREE.Matrix4[] = [], poles: THREE.Matrix4[] = [], arms: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (let s = 6; s < L - 2; s += 4.2) {
    const p = roadAt(s);
    for (const side of [-1, 1]) {
      const x = p.x - p.tz * side * 1.75, z = p.z + p.tx * side * 1.75;
      posts.push(new THREE.Matrix4().makeTranslation(x, heightAt(x, z) + 0.28, z));
    }
  }
  for (let s = 8; s < L - 4; s += 9.5) {
    const p = roadAt(s), x = p.x - p.tz * 3.1, z = p.z + p.tx * 3.1, y = heightAt(x, z);
    poles.push(new THREE.Matrix4().makeTranslation(x, y + 1.25, z));
    q.setFromAxisAngle(up, Math.atan2(p.tx, p.tz));
    arms.push(m.clone().compose(new THREE.Vector3(x, y + 2.3, z), q, new THREE.Vector3(1, 1, 1)));
  }
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
    scene.add(im);
    return im;
  };
  inst(new THREE.BoxGeometry(0.12, 0.56, 0.12), tag(new THREE.MeshLambertMaterial({ color: '#f1ece2' }), CLS.stone), posts);
  inst(new THREE.CylinderGeometry(0.08, 0.1, 2.5, 6), tag(new THREE.MeshLambertMaterial({ color: '#6e5238' }), CLS.wood), poles);
  inst(new THREE.BoxGeometry(1.1, 0.08, 0.08), tag(new THREE.MeshLambertMaterial({ color: '#5d452f' }), CLS.wood), arms);
}
