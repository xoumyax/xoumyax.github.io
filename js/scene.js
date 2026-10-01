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

const signpost = (x, gy, emoji, year, title) => {
  const half = Math.max(118, title.length * 6.4 + 26);
  return `
  <g transform="translate(${x} ${gy})">
    <rect x="-5" y="-108" width="10" height="108" rx="4" fill="var(--sc-trunk)"/>
    <g>
      <rect x="${-half}" y="-192" width="${half * 2}" height="96" rx="18" fill="var(--sc-board)" stroke="var(--sc-board-edge)" stroke-width="5"/>
      <text x="0" y="-152" text-anchor="middle" font-family="'Baloo 2', sans-serif" font-weight="800" font-size="28" fill="var(--sc-board-ink)">${emoji} ${year}</text>
      <text x="0" y="-115" text-anchor="middle" font-family="'Baloo 2', sans-serif" font-weight="700" font-size="24" fill="var(--sc-board-ink)">${title}</text>
    </g>
  </g>`;
};

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

const boat = (x, gy) => `
  <g transform="translate(${x} ${gy})">
    <rect x="-2" y="-78" width="4" height="62" fill="var(--sc-trunk)"/>
    <polygon points="3,-76 46,-22 3,-22" fill="var(--sc-board)"/>
    <polygon points="-3,-66 -34,-24 -3,-24" fill="var(--sc-flag)"/>
    <path d="M -52 -16 H 58 L 44 4 H -40 Z" fill="var(--sc-hall-roof)"/>
  </g>`;

const shed = (x, gy) => `
  <g transform="translate(${x} ${gy})">
    <rect x="-70" y="-86" width="140" height="86" rx="4" fill="var(--sc-hall)"/>
    <polygon points="-82,-86 82,-86 0,-128" fill="var(--sc-bldg-roof)"/>
    <rect x="-46" y="-58" width="92" height="58" rx="3" fill="var(--sc-hall-door)"/>
    ${[0, 1, 2].map(i => `<rect x="-46" y="${-46 + i * 16}" width="92" height="3" fill="var(--sc-hall)"/>`).join('')}
    <circle cx="0" cy="-104" r="11" fill="var(--sc-board)"/>
    <circle cx="0" cy="-104" r="4" fill="var(--sc-hall-door)"/>
  </g>`;

const cone = (x, gy) => `
  <g transform="translate(${x} ${gy})">
    <polygon points="-12,0 12,0 3,-34 -3,-34" fill="var(--sc-mailbox)"/>
    <rect x="-8" y="-20" width="16" height="5" fill="var(--sc-board)"/>
    <rect x="-16" y="-3" width="32" height="5" rx="2" fill="var(--sc-mailbox)"/>
  </g>`;

const crane = (x, gy) => `
  <g transform="translate(${x} ${gy})">
    <rect x="-7" y="-210" width="14" height="210" fill="var(--sc-flag)"/>
    ${[0, 1, 2, 3, 4, 5].map(i => `<line x1="-7" y1="${-200 + i * 34}" x2="7" y2="${-176 + i * 34}" stroke="var(--sc-hay-2)" stroke-width="3"/>`).join('')}
    <rect x="-60" y="-222" width="190" height="12" fill="var(--sc-flag)"/>
    <rect x="-60" y="-236" width="34" height="18" fill="var(--sc-rack)"/>
    <line x1="112" y1="-210" x2="112" y2="-132" stroke="var(--sc-rack)" stroke-width="2"/>
    <rect x="98" y="-132" width="28" height="22" rx="3" fill="var(--sc-bldg)"/>
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
  // the mountain range rises behind the 2026 'published and shipped' summit
  const ridgeFarX = 420 + 0.22 * (cp.ship - 420);
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

  /* checkpoint scenes, 2021 → now */
  f += flagBanner(cp.job - 300, GY);
  f += building(cp.job - 215, GY, 90, 170) + building(cp.job - 120, GY, 70, 120) + building(cp.job + 165, GY, 84, 200) + building(cp.job + 255, GY, 64, 140);

  f += hall(cp.grad - 200, GY) + roundTree(cp.grad + 175, GY, 0.9) + fence(cp.grad + 230, GY, 4);

  f += pine(cp.first - 230, GY, 1.15) + pine(cp.first - 160, GY, 0.9) + trophy(cp.first + 165, GY) + pine(cp.first + 230, GY, 1.2) + pine(cp.first + 295, GY, 0.85);

  f += serverRack(cp.phd - 200, GY) + serverRack(cp.phd - 138, GY) + serverRack(cp.phd + 160, GY) + fence(cp.phd + 210, GY, 4);

  f += shed(cp.tools - 240, GY) + hayBale(cp.tools + 170, GY) + rock(cp.tools + 230, GY, 1.1);

  f += pond(cp.ship + 230, GY + 40, 300) + boat(cp.ship + 230, GY + 30) + rock(cp.ship - 190, GY, 1.3) + pine(cp.ship - 250, GY, 0.9);

  f += crane(cp.now - 260, GY) + cone(cp.now + 150, GY) + cone(cp.now + 200, GY) + cone(cp.now + 250, GY);

  /* signposts last, on top */
  checkpoints.forEach(c => { f += signpost(c.x, GY, c.emoji, c.year, c.title); });

  /* the finish line */
  f += flagBanner(finishX - 170, GY) + flagBanner(finishX + 170, GY);
  f += `<g transform="translate(${finishX} ${GY})">
    <rect x="-5" y="-96" width="10" height="96" rx="4" fill="var(--sc-trunk)"/>
    <rect x="-128" y="-158" width="256" height="64" rx="16" fill="var(--sc-board)" stroke="var(--sc-board-edge)" stroke-width="5"/>
    <text x="0" y="-116" text-anchor="middle" font-family="'Baloo 2', sans-serif" font-weight="700" font-size="26" fill="var(--sc-board-ink)">🚩 Open to work</text>
  </g>`;
  f += mailbox(finishX + 250, GY) + umbrella(finishX + 360, GY) + fence(finishX + 440, GY, 6) + roundTree(finishX + 640, GY, 1.1) + pine(finishX + 820, GY, 1);
  frontEl.innerHTML = svg(worldWidth, f);

  return { worldWidth, checkpoints, height: H, finishX };
}

function svg(w, inner) {
  return `<svg width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}
