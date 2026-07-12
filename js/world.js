// The drivable world. Everything is procedural — no model downloads.
import * as THREE from 'three';

/* ── Map layout ─────────────────────────────────────────── */
export const ZONE_POS = {
  trailhead: { x: 0,    z: 18,   r: 13 },
  ridge:     { x: -118, z: -100, r: 17 },
  grounds:   { x: 122,  z: -102, r: 17 },
  park:      { x: 132,  z: 48,   r: 17 },
  district:  { x: 58,   z: 128,  r: 17 },
  campus:    { x: -124, z: 52,   r: 17 },
  cove:      { x: -34,  z: 146,  r: 16 },
};

const WORLD = 420;            // ground plane size
const BOUND = WORLD / 2 - 16; // soft driving boundary
const WATER_Y = -1.35;

const COLOR = {
  sky: 0xbfe0f5,
  grassA: 0x8fcb7a, grassB: 0x6fb35f,
  sand: 0xeed9a2, path: 0xdfc28a,
  rock: 0x9aa7b0, snow: 0xf4f8fb,
  trunk: 0x8a5a36, leafA: 0x3e7c4f, leafB: 0x59985f,
  water: 0x5fb6d9,
  carBody: 0xe96842, carRoof: 0xf6ede0, carDark: 0x2e3b45, tire: 0x27313a,
  cloud: 0xffffff,
};

/* ── Small helpers ──────────────────────────────────────── */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const dist2 = (x1, z1, x2, z2) => { const dx = x1 - x2, dz = z1 - z2; return Math.sqrt(dx * dx + dz * dz); };

function fallOff(d, r) { // 1 at center → 0 at r
  return d >= r ? 0 : smooth(1 - d / r);
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz), 0, 1);
  return dist2(px, pz, ax + abx * t, az + abz * t);
}

const PATHS = Object.values(ZONE_POS).map(p => [0, 18, p.x, p.z]);

function rawHeight(x, z) {
  let h = 2.1 * Math.sin(x * 0.045) * Math.cos(z * 0.038)
        + 1.3 * Math.sin(x * 0.09 + 1.7) * Math.sin(z * 0.075 + 0.4)
        + 0.5 * Math.sin(x * 0.21 + z * 0.17);
  // lift toward Research Ridge, dip into Mailbox Cove
  h += 7.5 * fallOff(dist2(x, z, -140, -140), 130);
  h -= 7.0 * fallOff(dist2(x, z, -30, 185), 95);
  return h;
}

export function terrainH(x, z) {
  let h = rawHeight(x, z);
  // flatten landmark clearings and give each a stable floor
  for (const id in ZONE_POS) {
    const p = ZONE_POS[id];
    const t = fallOff(dist2(x, z, p.x, p.z), p.r + 12);
    const floor = id === 'cove' ? -0.4 : id === 'ridge' ? 2.2 : 0.9;
    h = lerp(h, floor, t);
  }
  // flatten along the trails
  let pd = Infinity;
  for (const [ax, az, bx, bz] of PATHS) pd = Math.min(pd, distToSegment(x, z, ax, az, bx, bz));
  if (pd < 7) {
    const t = smooth(1 - pd / 7);
    h = lerp(h, clamp(h, -0.2, 1.4), t * 0.85);
  }
  return h;
}

function pathDist(x, z) {
  let pd = Infinity;
  for (const [ax, az, bx, bz] of PATHS) pd = Math.min(pd, distToSegment(x, z, ax, az, bx, bz));
  return pd;
}

/* ── World factory ──────────────────────────────────────── */
export function createWorld({ canvas, zones, onEnterZone, spawnZone }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR.sky);
  scene.fog = new THREE.Fog(COLOR.sky, 130, 300);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 500);

  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x7aa96a, 1.05));
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.4);
  sun.position.set(70, 120, -50);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdff0ff, 0.45); // southern fill so the car's tail isn't murky
  fill.position.set(-40, 60, 90);
  scene.add(fill);

  /* ── Terrain ── */
  const seg = 110;
  const ground = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(COLOR.grassA), cB = new THREE.Color(COLOR.grassB);
  const cSand = new THREE.Color(COLOR.sand), cPath = new THREE.Color(COLOR.path);
  const cRock = new THREE.Color(COLOR.rock);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainH(x, z);
    pos.setY(i, h);
    const n = 0.5 + 0.5 * Math.sin(x * 0.35 + Math.sin(z * 0.3) * 2.0);
    tmp.copy(cA).lerp(cB, n);
    if (h > 5.2) tmp.lerp(cRock, smooth(clamp((h - 5.2) / 3.5, 0, 1)));
    if (h < -0.15) tmp.copy(cSand);
    const pd = pathDist(x, z);
    if (pd < 3.4) tmp.lerp(cPath, smooth(1 - pd / 3.4));
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  ground.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  ground.computeVertexNormals();
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  scene.add(new THREE.Mesh(ground, groundMat));

  /* ── Water ── */
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD, WORLD, 24, 24).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: COLOR.water, transparent: true, opacity: 0.85, flatShading: true })
  );
  water.position.y = WATER_Y;
  scene.add(water);
  const waterPos = water.geometry.attributes.position;
  const waterBase = waterPos.array.slice();

  /* ── Props ── */
  const props = new THREE.Group();
  scene.add(props);

  const lam = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

  function placeOnGround(obj, x, z, lift = 0) {
    obj.position.set(x, terrainH(x, z) + lift, z);
    props.add(obj);
    return obj;
  }

  // Trees (instanced trunk + foliage)
  const treeSpots = [];
  const parkP = ZONE_POS.park;
  for (let i = 0; i < 90; i++) { // park forest ring
    const a = (i / 90) * Math.PI * 2 * 7.13, rr = 20 + (i * 37 % 43);
    const x = parkP.x + Math.cos(a) * rr * 0.8, z = parkP.z + Math.sin(a) * rr;
    if (Math.abs(x) < WORLD / 2 - 8 && Math.abs(z) < WORLD / 2 - 8) treeSpots.push([x, z]);
  }
  for (let i = 0; i < 130; i++) { // sparse everywhere
    const x = (Math.sin(i * 127.1) * 0.5 + 0.5) * (WORLD - 40) - (WORLD - 40) / 2;
    const z = (Math.sin(i * 311.7 + 2) * 0.5 + 0.5) * (WORLD - 40) - (WORLD - 40) / 2;
    treeSpots.push([x, z]);
  }
  const validTrees = treeSpots.filter(([x, z]) => {
    const h = terrainH(x, z);
    if (h < 0 || h > 5.5 || pathDist(x, z) < 6) return false;
    for (const id in ZONE_POS) { const p = ZONE_POS[id]; if (dist2(x, z, p.x, p.z) < p.r + 4) return false; }
    return true;
  });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 2.2, 6);
  const leafGeo = new THREE.ConeGeometry(2.3, 4.6, 7);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, lam(COLOR.trunk), validTrees.length);
  const leafMesh = new THREE.InstancedMesh(leafGeo, lam(COLOR.leafA), validTrees.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), v3 = new THREE.Vector3();
  const leafColor = new THREE.Color();
  validTrees.forEach(([x, z], i) => {
    const h = terrainH(x, z);
    const sc = 0.75 + (Math.sin(i * 91.7) * 0.5 + 0.5) * 0.7;
    q.setFromAxisAngle(v3.set(0, 1, 0), i * 2.4);
    m4.compose(new THREE.Vector3(x, h + 1.1 * sc, z), q, s3.set(sc, sc, sc));
    trunkMesh.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, h + (2.2 + 2.0) * sc, z), q, s3.set(sc, sc, sc));
    leafMesh.setMatrixAt(i, m4);
    leafMesh.setColorAt(i, leafColor.set(i % 3 ? COLOR.leafA : COLOR.leafB));
  });
  props.add(trunkMesh, leafMesh);

  // Rocks
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, lam(COLOR.rock), 40);
  for (let i = 0; i < 40; i++) {
    const x = Math.sin(i * 47.9) * (WORLD / 2 - 30), z = Math.cos(i * 83.1) * (WORLD / 2 - 30);
    const sc = 0.4 + (Math.sin(i * 13.3) * 0.5 + 0.5) * 1.3;
    q.setFromAxisAngle(v3.set(1, 0, 1).normalize(), i);
    m4.compose(new THREE.Vector3(x, terrainH(x, z) + sc * 0.4, z), q, s3.set(sc, sc * 0.8, sc));
    rocks.setMatrixAt(i, m4);
  }
  props.add(rocks);

  // Research Ridge mountains
  const ridgeP = ZONE_POS.ridge;
  [[-44, -48, 17], [-12, -62, 22], [26, -44, 14], [-64, -18, 12], [50, -64, 18]].forEach(([dx, dz, hM]) => {
    const x = ridgeP.x + dx, z = ridgeP.z + dz;
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(hM * 0.75, hM, 6), lam(COLOR.rock));
    placeOnGround(mtn, x, z, hM / 2 - 1);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(hM * 0.28, hM * 0.34, 6), lam(COLOR.snow));
    cap.position.set(x, mtn.position.y + hM / 2 - hM * 0.16, z);
    props.add(cap);
  });

  // Training Grounds server racks
  const gP = ZONE_POS.grounds;
  for (let i = 0; i < 6; i++) {
    const x = gP.x - 9 + (i % 3) * 9, z = gP.z - 12 + Math.floor(i / 3) * 7;
    const rack = new THREE.Group();
    rack.add(new THREE.Mesh(new THREE.BoxGeometry(4.4, 5.5, 2.6), lam(0x35495c)));
    for (let l = 0; l < 3; l++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.15), new THREE.MeshBasicMaterial({ color: 0x7bd4a8 }));
      led.position.set(-1.2 + l * 1.2, 1.4, 1.38);
      rack.add(led);
    }
    placeOnGround(rack, x, z, 2.75);
  }

  // Project Park trophy
  const trophy = new THREE.Group();
  trophy.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 1.2, 8), lam(0x8d99a4)));
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.6, 1.8, 8), lam(0xf0b429));
  cup.position.y = 2.1; trophy.add(cup);
  placeOnGround(trophy, parkP.x + 6, parkP.z - 6, 0.6);

  // Industry District buildings — flanking the arrival road, never on it
  const dP = ZONE_POS.district;
  const dirA = { x: 58 / 125, z: 110 / 125 };            // arrival bearing from the trailhead
  const perpA = { x: -dirA.z, z: dirA.x };
  [[-20, 2, 8, 0x9db4c6], [-12, -5, 6, 0x8aa2b5], [12, 4, 7, 0xafc3d2], [19, -3, 5.5, 0x93abbe], [4, 18, 9, 0xa5bac9]].forEach(([k, a, hB, col]) => {
    const x = dP.x + perpA.x * k + dirA.x * a;
    const z = dP.z + perpA.z * k + dirA.z * a;
    const b = new THREE.Mesh(new THREE.BoxGeometry(6.5, hB, 6.5), lam(col));
    placeOnGround(b, x, z, hB / 2);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.7, 7.1), lam(0x5c7080));
    roof.position.copy(b.position); roof.position.y += hB / 2 + 0.35;
    props.add(roof);
  });

  // Campus Quad buildings
  const cP = ZONE_POS.campus;
  [[-14, -6], [8, -14]].forEach(([dx, dz]) => {
    const hall = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 8), lam(0xc9a06a));
    placeOnGround(hall, cP.x + dx, cP.z + dz, 2.5);
    // hip roof: a four-sided pyramid stretched along the hall
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.9, 3.4, 4), lam(0x8f4f38));
    roof.rotation.y = Math.PI / 4;
    roof.scale.x = 2.05;
    roof.position.copy(hall.position); roof.position.y += 2.5 + 1.7;
    props.add(roof);
  });

  // Mailbox Cove mailbox + umbrella
  const mv = ZONE_POS.cove;
  const mail = new THREE.Group();
  const mpole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.6, 6), lam(0x8a5a36));
  mail.add(mpole);
  const mbox = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 1.2), lam(COLOR.carBody));
  mbox.position.y = 1.9; mail.add(mbox);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.5), lam(0xf0b429));
  flag.position.set(1.05, 2.4, 0); mail.add(flag);
  placeOnGround(mail, mv.x + 4, mv.z + 3, 1.3);
  const umb = new THREE.Group();
  umb.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 6), lam(0xf6ede0)));
  const shade = new THREE.Mesh(new THREE.ConeGeometry(3, 1.4, 8), lam(0xe96842));
  shade.position.y = 2.3; umb.add(shade);
  placeOnGround(umb, mv.x - 6, mv.z + 6, 2);

  /* ── Signposts ── */
  function makeLabel(text, emoji) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 192;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.beginPath(); ctx.roundRect(6, 6, 500, 180, 28); ctx.fill();
    ctx.strokeStyle = '#e96842'; ctx.lineWidth = 8; ctx.stroke();
    ctx.fillStyle = '#22333d';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '64px "Baloo 2", "Nunito Sans", sans-serif';
    ctx.fillText(emoji, 256, 58);
    ctx.font = '700 52px "Baloo 2", "Nunito Sans", sans-serif';
    ctx.fillText(text, 256, 134);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  }

  zones.forEach((zone) => {
    const p = ZONE_POS[zone.id];
    if (!p) return;
    const post = new THREE.Group();
    post.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 4.6, 6), lam(0x8a5a36)));
    const boardMat = new THREE.MeshBasicMaterial({ map: makeLabel(zone.title, zone.emoji), transparent: true });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 3.2), boardMat);
    board.position.y = 3.6;
    const boardBack = board.clone();
    boardBack.rotation.y = Math.PI; // readable from both sides
    post.add(board, boardBack);
    // face the trailhead, standing beside the road, not on it
    const toward = Math.atan2(0 - p.x, 18 - p.z);
    post.rotation.y = toward;
    const ox = Math.sin(toward) * 2 + Math.cos(toward) * 9;
    const oz = Math.cos(toward) * 2 - Math.sin(toward) * 9;
    placeOnGround(post, p.x + ox, p.z + oz, 2.3);
  });

  /* ── Clouds ── */
  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: COLOR.cloud, flatShading: true, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + (k === 1 ? 2 : 0), 0), cloudMat);
      puff.position.set(k * 4 - 4, (k === 1 ? 1 : 0), Math.sin(i + k) * 1.5);
      puff.scale.y = 0.6;
      c.add(puff);
    }
    c.position.set(Math.sin(i * 2.3) * 170, 40 + (i % 3) * 6, Math.cos(i * 1.7) * 170);
    scene.add(c);
    clouds.push(c);
  }

  /* ── The car (4Runner-ish, made of boxes) ── */
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 4.6), lam(COLOR.carBody));
  body.position.y = 1.0; car.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 1.2), lam(COLOR.carBody));
  hood.position.set(0, 1.35, -1.85); car.add(hood);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.05, 2.7), lam(COLOR.carRoof));
  cabin.position.set(0, 1.95, 0.35); car.add(cabin);
  const glass = lam(0x9fd3e8);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.75, 0.1), glass);
  windshield.position.set(0, 1.9, -1.05); windshield.rotation.x = -0.28; car.add(windshield);
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 0.08), glass);
  rearGlass.position.set(0, 2.0, 1.72); car.add(rearGlass);
  [-1.12, 1.12].forEach((sx) => {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 2.1), glass);
    side.position.set(sx, 2.0, 0.3); car.add(side);
  });
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 2.2), lam(COLOR.carDark));
  rack.position.set(0, 2.58, 0.35); car.add(rack);
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 10), lam(COLOR.tire));
  spare.rotation.x = Math.PI / 2; spare.position.set(0, 1.15, 2.42); car.add(spare);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.4, 0.5), lam(0xd8d2c6));
  bumper.position.set(0, 0.55, -2.35); car.add(bumper);
  [[-0.85, -1.5], [0.85, -1.5]].forEach(([lx, lz]) => {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.12), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
    lamp.position.set(lx, 1.15, lz - 0.85); car.add(lamp);
  });
  const wheels = [];
  [[-1.15, -1.5], [1.15, -1.5], [-1.15, 1.5], [1.15, 1.5]].forEach(([wx, wz]) => {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 10), lam(COLOR.tire));
    tire.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.52, 8), lam(0xc9ced3));
    hub.rotation.z = Math.PI / 2;
    w.add(tire, hub);
    w.position.set(wx, 0.62, wz);
    car.add(w);
    wheels.push(w);
  });
  const blobShadow = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x1e3324, transparent: true, opacity: 0.22 })
  );
  scene.add(blobShadow);
  scene.add(car);

  /* ── Car state & spawn ── */
  const spawn = spawnZone && ZONE_POS[spawnZone] ? ZONE_POS[spawnZone] : ZONE_POS.trailhead;
  const state = {
    x: spawn.x, z: spawn.z + 4, heading: Math.PI, speed: 0,
    pitch: 0, roll: 0,
  };
  const input = { throttle: 0, steer: 0 };
  const insideZone = {};

  const MAX_F = 26, MAX_R = 9, ACCEL = 30, TURN = 2.1;

  function step(dt) {
    // drive
    const target = input.throttle >= 0 ? input.throttle * MAX_F : input.throttle * MAX_R;
    if (Math.abs(input.throttle) > 0.05) {
      state.speed = lerp(state.speed, target, clamp(ACCEL / Math.max(Math.abs(target), 1) * dt, 0, 1));
    } else {
      state.speed *= Math.max(0, 1 - 2.4 * dt);
      if (Math.abs(state.speed) < 0.05) state.speed = 0;
    }
    const spd = Math.abs(state.speed);
    if (spd > 0.15) {
      state.heading -= input.steer * TURN * dt * Math.sign(state.speed) * (0.35 + 0.65 * Math.min(spd / MAX_F, 1));
    }
    state.x += Math.sin(state.heading) * state.speed * dt;
    state.z += Math.cos(state.heading) * state.speed * dt;
    // soft bounds
    if (Math.abs(state.x) > BOUND) { state.x = clamp(state.x, -BOUND, BOUND); state.speed *= 0.4; }
    if (Math.abs(state.z) > BOUND) { state.z = clamp(state.z, -BOUND, BOUND); state.speed *= 0.4; }
    // keep out of deep water
    if (terrainH(state.x, state.z) < WATER_Y + 0.3) {
      const backX = state.x - Math.sin(state.heading) * state.speed * dt;
      const backZ = state.z - Math.cos(state.heading) * state.speed * dt;
      state.x = backX; state.z = backZ; state.speed = 0;
    }

    // pose on terrain
    const h = terrainH(state.x, state.z);
    const fx = Math.sin(state.heading), fz = Math.cos(state.heading);
    const hF = terrainH(state.x + fx * 2.1, state.z + fz * 2.1);
    const hB = terrainH(state.x - fx * 2.1, state.z - fz * 2.1);
    const hL = terrainH(state.x + fz * 1.2, state.z - fx * 1.2);
    const hR = terrainH(state.x - fz * 1.2, state.z + fx * 1.2);
    state.pitch = lerp(state.pitch, Math.atan2(hB - hF, 4.2), 0.15);
    state.roll = lerp(state.roll, Math.atan2(hR - hL, 2.4), 0.15);

    car.position.set(state.x, h, state.z);
    car.rotation.set(0, 0, 0);
    car.rotateY(state.heading + Math.PI);
    car.rotateX(state.pitch);
    car.rotateZ(state.roll + input.steer * Math.min(spd / MAX_F, 1) * 0.06);
    blobShadow.position.set(state.x, h + 0.06, state.z);

    for (const w of wheels) w.rotation.x -= state.speed * dt / 0.62;

    // camera chase
    const camBack = 13, camUp = 6.5;
    const cx = state.x - Math.sin(state.heading) * camBack;
    const cz = state.z - Math.cos(state.heading) * camBack;
    const cy = Math.max(h, terrainH(cx, cz)) + camUp;
    const k = 1 - Math.pow(0.0015, dt);
    camera.position.lerp(v3.set(cx, cy, cz), k);
    camera.lookAt(state.x, h + 2.2, state.z);

    // ambient
    const t = performance.now() * 0.001;
    for (let i = 0; i < waterPos.count; i++) {
      waterPos.setY(i, Math.sin(t * 1.4 + waterBase[i * 3] * 0.08 + waterBase[i * 3 + 2] * 0.1) * 0.12);
    }
    waterPos.needsUpdate = true;
    clouds.forEach((c, i) => {
      c.position.x += dt * (0.6 + (i % 3) * 0.25);
      if (c.position.x > 220) c.position.x = -220;
    });

    // zone detection with hysteresis
    for (const zone of zones) {
      const p = ZONE_POS[zone.id];
      if (!p) continue;
      const d = dist2(state.x, state.z, p.x, p.z);
      if (d < p.r && !insideZone[zone.id]) {
        insideZone[zone.id] = true;
        onEnterZone(zone.id);
      } else if (d > p.r + 8) {
        insideZone[zone.id] = false;
      }
    }
  }

  /* ── Loop plumbing ── */
  let raf = 0, last = 0, running = false;

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    step(dt || 0.016);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  function resize() {
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (!w || !hgt) return;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  }

  resize();
  // set an initial camera pose behind the car
  camera.position.set(state.x - Math.sin(state.heading) * 13, terrainH(state.x, state.z) + 7, state.z - Math.cos(state.heading) * 13);
  camera.lookAt(state.x, 2, state.z);
  renderer.render(scene, camera);

  return {
    input,
    resize,
    start() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } },
    stop() { running = false; cancelAnimationFrame(raf); },
    renderOnce() { renderer.render(scene, camera); },
    dispose() { this.stop(); renderer.dispose(); },
  };
}
