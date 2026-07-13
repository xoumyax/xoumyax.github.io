// The 2D roadside world. Three parallax layers of inline SVG, colored
// entirely through CSS variables so day/night is a pure theme switch.

const H = 520;                 // design height of every layer
export const CP_SPACING = 1150;
export const CP_START = 650;

const seed = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* ── Prop templates (front layer, ground at gy) ─────────── */
const pine = (x, gy, s = 1) => `
  <g transform="translate(${x} ${gy}) scale(${s})">
    <rect x="-5" y="-16" width="10" height="18" rx="3" fill="var(--sc-trunk)"/>
    <polygon points="0,-118 34,-52 -34,-52" fill="var(--sc-tree)"/>
    <polygon points="0,-86 40,-22 -40,-22" fill="var(--sc-tree-2)"/>
  </g>`;

const roundTree = (x, gy, s = 1) => `
  <g transform="translate(${x} ${gy}) scale(${s})">
    <rect x="-5" y="-26" width="10" height="28" rx="3" fill="var(--sc-trunk)"/>
    <circle cx="0" cy="-52" r="34" fill="var(--sc-tree)"/>
    <circle cx="-22" cy="-38" r="22" fill="var(--sc-tree-2)"/>
    <circle cx="22" cy="-40" r="24" fill="var(--sc-tree-2)"/>
  </g>`;

const fence = (x, gy, n = 5) => {
  let out = `<g fill="var(--sc-fence)">`;
  for (let i = 0; i < n; i++) out += `<rect x="${x + i * 26}" y="${gy - 26}" width="6" height="26" rx="2"/>`;
  out += `<rect x="${x - 4}" y="${gy - 22}" width="${n * 26 - 12}" height="5" rx="2"/>
          <rect x="${x - 4}" y="${gy - 11}" width="${n * 26 - 12}" height="5" rx="2"/></g>`;
  return out;
};

const rock = (x, gy, s = 1) => `
  <ellipse cx="${x}" cy="${gy - 6 * s}" rx="${14 * s}" ry="${9 * s}" fill="var(--sc-rock)"/>`;

const signpost = (x, gy, emoji, title) => `
  <g transform="translate(${x} ${gy})">
    <rect x="-5" y="-108" width="10" height="108" rx="4" fill="var(--sc-trunk)"/>
    <g>
      <rect x="-118" y="-178" width="236" height="82" rx="18" fill="var(--sc-board)" stroke="var(--sc-board-edge)" stroke-width="5"/>
      <text x="0" y="-146" text-anchor="middle" font-size="30">${emoji}</text>
      <text x="0" y="-112" text-anchor="middle" font-family="'Baloo 2', sans-serif" font-weight="700" font-size="26" fill="var(--sc-board-ink)">${title}</text>
    </g>
  </g>`;

const mountain = (x, gy, w, h) => `
  <g>
    <polygon points="${x},${gy - h} ${x + w / 2},${gy} ${x - w / 2},${gy}" fill="var(--sc-mtn)"/>
    <polygon points="${x},${gy - h} ${x + w * 0.16},${gy - h * 0.68} ${x - w * 0.16},${gy - h * 0.68}" fill="var(--sc-snow)"/>
  </g>`;

const serverRack = (x, gy) => `
  <g transform="translate(${x} ${gy})">
    <rect x="-26" y="-84" width="52" height="84" rx="6" fill="var(--sc-rack)"/>
    ${[0, 1, 2].map(i => `<rect x="-16" y="${-70 + i * 22}" width="10" height="8" rx="2" fill="var(--sc-led)"/>
      <rect x="0" y="${-70 + i * 22}" width="16" height="8" rx="2" fill="var(--sc-rack-2)"/>`).join('')}
  </g>`;

const building = (x, gy, w, h, windows = true) => {
  let win = '';
  if (windows) {
    const cols = Math.floor(w / 26), rows = Math.floor(h / 34);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      win += `<rect x="${x - w / 2 + 14 + c * 26}" y="${gy - h + 16 + r * 34}" width="12" height="16" rx="2" fill="var(--sc-window)"/>`;
  }
  return `<rect x="${x - w / 2}" y="${gy - h}" width="${w}" height="${h}" rx="6" fill="var(--sc-bldg)"/>
          <rect x="${x - w / 2 - 5}" y="${gy - h - 8}" width="${w + 10}" height="12" rx="4" fill="var(--sc-bldg-roof)"/>${win}`;
};

const hall = (x, gy) => `
  <g transform="translate(${x} ${gy})">
    <rect x="-90" y="-70" width="180" height="70" rx="6" fill="var(--sc-hall)"/>
    <polygon points="-102,-70 102,-70 0,-124" fill="var(--sc-hall-roof)"/>
    <rect x="-14" y="-42" width="28" height="42" rx="4" fill="var(--sc-hall-door)"/>
    <rect x="-66" y="-52" width="20" height="24" rx="3" fill="var(--sc-window)"/>
    <rect x="46" y="-52" width="20" height="24" rx="3" fill="var(--sc-window)"/>
    <rect x="-2" y="-176" width="5" height="52" fill="var(--sc-trunk)"/>
    <polygon points="3,-176 40,-166 3,-156" fill="var(--sc-flag)"/>
  </g>`;

const mailbox = (x, gy) => `
  <g transform="translate(${x} ${gy})">
    <rect x="-4" y="-58" width="8" height="58" rx="3" fill="var(--sc-trunk)"/>
    <rect x="-26" y="-86" width="52" height="30" rx="12" fill="var(--sc-mailbox)"/>
    <rect x="18" y="-104" width="5" height="20" fill="var(--sc-flag)"/>
    <polygon points="23,-104 40,-99 23,-94" fill="var(--sc-flag)"/>
  </g>`;

const umbrella = (x, gy) => `
  <g transform="translate(${x} ${gy})">
    <rect x="-3" y="-92" width="6" height="92" rx="3" fill="var(--sc-board)"/>
    <path d="M -56 -84 Q 0 -132 56 -84 Z" fill="var(--sc-mailbox)"/>
    <path d="M -56 -84 Q -28 -96 0 -84 Q 28 -96 56 -84 Z" fill="var(--sc-board)"/>
  </g>`;

const pond = (x, gy, w) => `
  <ellipse cx="${x}" cy="${gy + 6}" rx="${w / 2}" ry="26" fill="var(--sc-water)"/>
  <ellipse cx="${x - w * 0.18}" cy="${gy + 2}" rx="${w * 0.14}" ry="6" fill="var(--sc-water-hi)"/>
  <ellipse cx="${x + w * 0.2}" cy="${gy + 10}" rx="${w * 0.1}" ry="5" fill="var(--sc-water-hi)"/>`;

const trophy = (x, gy) => `
  <g transform="translate(${x} ${gy})">
    <rect x="-24" y="-26" width="48" height="26" rx="5" fill="var(--sc-rock)"/>
    <path d="M -16 -66 h32 v14 a16 16 0 0 1 -32 0 Z" fill="var(--sc-gold)"/>
    <rect x="-5" y="-40" width="10" height="14" fill="var(--sc-gold)"/>
    <rect x="-14" y="-26" width="28" height="7" rx="3" fill="var(--sc-gold)"/>
  </g>`;

const flagBanner = (x, gy) => `
  <g transform="translate(${x} ${gy})">
    <rect x="-3" y="-150" width="6" height="150" rx="3" fill="var(--sc-trunk)"/>
    <polygon points="3,-150 66,-136 3,-122" fill="var(--sc-flag)"/>
  </g>`;

const hayBale = (x, gy) => `
  <g transform="translate(${x} ${gy})">
    <circle cx="0" cy="-20" r="20" fill="var(--sc-hay)"/>
    <circle cx="0" cy="-20" r="11" fill="none" stroke="var(--sc-hay-2)" stroke-width="4"/>
  </g>`;

/* ── Rolling hill silhouette ────────────────────────────── */
function hills(width, baseY, amp, wl, phase) {
  let d = `M 0 ${H} L 0 ${baseY}`;
  for (let x = 0; x <= width + wl; x += wl) {
    const y1 = baseY - amp * (0.5 + 0.5 * Math.sin((x / wl + phase) * 2.1));
    d += ` Q ${x + wl / 2} ${y1} ${x + wl} ${baseY - amp * (0.5 + 0.5 * Math.sin(((x + wl) / wl + phase) * 2.1))}`;
  }
  return d + ` L ${width + wl} ${H} Z`;
}

/* ── Build ──────────────────────────────────────────────── */
export function buildScene({ farEl, midEl, frontEl, zones }) {
  const checkpoints = zones.map((z, i) => ({ ...z, x: CP_START + i * CP_SPACING }));
  const finishX = CP_START + (zones.length - 1) * CP_SPACING + 700;
  const worldWidth = finishX + 2000; // scenery keeps rolling behind the finish line
  const GY = H - 96;           // ground line where props stand (road top)
  const cp = Object.fromEntries(checkpoints.map(c => [c.id, c.x]));

  /* far layer (parallax 0.22): soft hills + the ridge range */
  const farW = Math.ceil(worldWidth * 0.22 + 2600);
  let far = `<path d="${hills(farW, H - 210, 90, 460, 0.4)}" fill="var(--sc-hill-far)"/>`;
  // ridge mountains appear centered when the car reaches Research Ridge
  const ridgeFarX = 420 + 0.22 * (cp.ridge - 420);
  far += mountain(ridgeFarX - 190, H - 150, 340, 240) + mountain(ridgeFarX + 40, H - 150, 420, 310) + mountain(ridgeFarX + 290, H - 150, 300, 200);
  farEl.innerHTML = svg(farW, far);

  /* mid layer (parallax 0.55): greener hills + filler trees */
  const midW = Math.ceil(worldWidth * 0.55 + 2600);
  let mid = `<path d="${hills(midW, H - 128, 64, 330, 2.2)}" fill="var(--sc-hill)"/>`;
  for (let i = 0; i < Math.floor(midW / 210); i++) {
    const x = i * 210 + seed(i) * 120, s = 0.5 + seed(i + 40) * 0.3;
    mid += seed(i + 7) > 0.5 ? pine(x, H - 130 + seed(i + 3) * 30, s) : roundTree(x, H - 130 + seed(i + 3) * 30, s);
  }
  midEl.innerHTML = svg(midW, mid);

  /* front layer (parallax 1): grass, road, checkpoint scenes */
  let f = `<path d="${hills(worldWidth, H - 92, 26, 420, 5.1)}" fill="var(--sc-grass)"/>`;
  f += `<rect x="0" y="${H - 84}" width="${worldWidth}" height="60" fill="var(--sc-road)"/>`;
  for (let x = 30; x < worldWidth; x += 96) f += `<rect x="${x}" y="${H - 57}" width="42" height="6" rx="3" fill="var(--sc-dash)"/>`;

  // sprinkle ambient props between checkpoints
  for (let i = 0; i < Math.floor(worldWidth / 300); i++) {
    const x = i * 300 + seed(i + 90) * 180;
    const nearCp = checkpoints.some(c => Math.abs(c.x - x) < 300) || Math.abs(finishX - x) < 340;
    if (nearCp) continue;
    const pick = seed(i + 13);
    if (pick < 0.35) f += pine(x, GY, 0.7 + seed(i) * 0.5);
    else if (pick < 0.6) f += roundTree(x, GY, 0.6 + seed(i) * 0.4);
    else if (pick < 0.75) f += rock(x, GY, 0.7 + seed(i) * 0.8);
    else if (pick < 0.88) f += hayBale(x, GY);
    else f += fence(x, GY, 4);
  }

  /* checkpoint scenes */
  f += flagBanner(cp.trailhead - 150, GY) + fence(cp.trailhead - 90, GY, 5) + roundTree(cp.trailhead + 150, GY, 0.9);

  f += rock(cp.ridge - 170, GY, 1.3) + rock(cp.ridge + 150, GY, 1) + pine(cp.ridge - 240, GY, 0.8) + pine(cp.ridge + 220, GY, 0.9);

  f += serverRack(cp.grounds - 190, GY) + serverRack(cp.grounds - 128, GY) + serverRack(cp.grounds + 140, GY) + fence(cp.grounds + 190, GY, 4);

  f += pine(cp.park - 220, GY, 1.15) + pine(cp.park - 150, GY, 0.9) + trophy(cp.park + 140, GY) + pine(cp.park + 200, GY, 1.2) + pine(cp.park + 265, GY, 0.85);

  f += building(cp.district - 215, GY, 90, 170) + building(cp.district - 120, GY, 70, 120) + building(cp.district + 135, GY, 84, 200) + building(cp.district + 225, GY, 64, 140);

  f += hall(cp.campus - 180, GY) + roundTree(cp.campus + 160, GY, 0.9) + fence(cp.campus + 215, GY, 4);

  f += pond(cp.cove + 210, GY + 40, 260) + mailbox(cp.cove - 150, GY) + umbrella(cp.cove + 40, GY);

  /* signposts last, on top */
  checkpoints.forEach(c => { f += signpost(c.x, GY, c.emoji, c.title); });

  /* the finish line */
  f += flagBanner(finishX - 170, GY) + flagBanner(finishX + 170, GY);
  f += `<g transform="translate(${finishX} ${GY})">
    <rect x="-5" y="-96" width="10" height="96" rx="4" fill="var(--sc-trunk)"/>
    <rect x="-104" y="-158" width="208" height="64" rx="16" fill="var(--sc-board)" stroke="var(--sc-board-edge)" stroke-width="5"/>
    <text x="0" y="-116" text-anchor="middle" font-family="'Baloo 2', sans-serif" font-weight="700" font-size="26" fill="var(--sc-board-ink)">🏁 The End 🌻</text>
  </g>`;
  f += fence(finishX + 240, GY, 6) + roundTree(finishX + 430, GY, 1.1) + pine(finishX + 620, GY, 1);
  frontEl.innerHTML = svg(worldWidth, f);

  return { worldWidth, checkpoints, height: H, finishX };
}

function svg(w, inner) {
  return `<svg width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}
