import { ZONES } from './content.js';
import { buildScene } from './scene.js';

const $ = (sel) => document.querySelector(sel);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);

/* ── Theme (day / night) ────────────────────────────────── */
const themeBtn = $('#theme-toggle');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
if (params.get('theme')) document.documentElement.dataset.theme = params.get('theme');

function effectiveTheme() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark' || t === 'light') return t;
  return systemDark.matches ? 'dark' : 'light';
}
function paintThemeButton() {
  const dark = effectiveTheme() === 'dark';
  themeBtn.textContent = dark ? '☀️' : '🌙';
  themeBtn.setAttribute('aria-label', dark ? 'Switch to day mode' : 'Switch to night mode');
  themeBtn.title = dark ? 'Day drive' : 'Night drive';
}
themeBtn.addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* private mode */ }
  paintThemeButton();
});
systemDark.addEventListener('change', paintThemeButton);
paintThemeButton();

/* ── Journey scaffolding ────────────────────────────────── */
const track = $('#journey-track');
const stage = $('#journey-stage');
const layers = { far: $('#layer-far'), mid: $('#layer-mid'), front: $('#layer-front') };
const carEl = $('#journey-car');
const wheelEls = carEl.querySelectorAll('.wheel');
const mapEl = $('#journey-map');
const card = $('#cp-card');
const confettiCanvas = $('#confetti');

const scene = buildScene({ farEl: layers.far, midEl: layers.mid, frontEl: layers.front, zones: ZONES });

const PARALLAX = { far: 0.22, mid: 0.55, front: 1 };
const sceneScale = $('#scene-scale');
const visited = new Set();
let activeCp = null;
let travel = 0, carScreenX = 0, lastWorldX = -1;

function layout() {
  // shrink the whole scene on short viewports so the road never clips
  const s = Math.min(1, Math.max(0.55, (stage.clientHeight - 70) / scene.height));
  sceneScale.style.transform = `scale(${s})`;
  const vwWorld = stage.clientWidth / s;           // viewport width in world units
  carScreenX = Math.min(vwWorld * 0.34, 620);
  carEl.style.left = `${Math.round(carScreenX - 105)}px`; // center the 210px car on its axle line
  travel = Math.max(scene.worldWidth - vwWorld + 140, 1);
  track.style.height = `${Math.round(travel + window.innerHeight)}px`;
  lastWorldX = -1;
  update(true);
}

/* ── Mini-map ───────────────────────────────────────────── */
function renderMap() {
  mapEl.innerHTML = `
    <div class="map-line"></div>
    ${ZONES.map(z => `<span class="map-dot ${visited.has(z.id) ? 'visited' : ''} ${activeCp === z.id ? 'here' : ''}" title="${z.title}">${z.emoji}</span>`).join('')}
    <span class="map-car" id="map-car" aria-hidden="true">🚙</span>`;
  positionMapCar();
}
function positionMapCar() {
  const mc = $('#map-car');
  if (!mc) return;
  const p = travel ? Math.min(Math.max(progress(), 0), 1) : 0;
  mc.style.left = `${6 + p * 88}%`;
}

/* ── Checkpoint card ────────────────────────────────────── */
function showCard(zone) {
  card.innerHTML = `
    <div class="zone-card-head"><span class="emoji" aria-hidden="true">${zone.emoji}</span><h3>${zone.title}</h3></div>
    <p class="zone-tagline">${zone.tagline}</p>
    <ul class="zone-points">${zone.points.map(p => `<li>${p}</li>`).join('')}</ul>
    <div class="zone-tags">${zone.tags.map(t => `<span>${t}</span>`).join('')}</div>
    ${visited.size === ZONES.length ? `<p class="zone-complete">🎉 That's all seven stops! Thanks for riding along — <a href="mailto:soumyajyotidutta23@gmail.com">email me</a> and let's plan the next trip together.</p>` : ''}`;
  card.hidden = false;
  requestAnimationFrame(() => card.classList.add('show'));
}
function hideCard() {
  card.classList.remove('show');
  card.hidden = true;
}

/* ── Completion confetti ────────────────────────────────── */
let celebrated = false;
function celebrate() {
  if (celebrated || reducedMotion) return;
  celebrated = true;
  confettiCanvas.style.display = 'block';
  const ctx = confettiCanvas.getContext('2d');
  confettiCanvas.width = innerWidth; confettiCanvas.height = innerHeight;
  const hues = ['#e96842', '#f0b429', '#6fb35f', '#5fb6d9', '#f6ede0'];
  const bits = Array.from({ length: 140 }, () => ({
    x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5,
    vy: 2.2 + Math.random() * 3, vx: -1 + Math.random() * 2,
    s: 5 + Math.random() * 6, r: Math.random() * Math.PI, vr: -0.15 + Math.random() * 0.3,
    c: hues[(Math.random() * hues.length) | 0],
  }));
  const t0 = performance.now();
  (function tick(now) {
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    for (const b of bits) {
      b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r);
      ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s * 0.6);
      ctx.restore();
    }
    if (now - t0 < 3200) requestAnimationFrame(tick);
    else confettiCanvas.style.display = 'none';
  })(t0);
}

/* ── Scroll → world ─────────────────────────────────────── */
// ?pin=0.4 freezes the journey at a fixed progress (headless visual testing)
const PIN = params.has('pin') ? Math.min(Math.max(parseFloat(params.get('pin')) || 0, 0), 1) : null;

function progress() {
  if (PIN !== null) return PIN;
  const rect = track.getBoundingClientRect();
  const total = track.offsetHeight - window.innerHeight;
  if (total <= 0) return 0;
  return Math.min(Math.max(-rect.top / total, 0), 1);
}

let wheelAngle = 0;
function update(force = false) {
  const p = progress();
  const worldX = p * travel;                       // how far the car has driven
  if (!force && Math.abs(worldX - lastWorldX) < 0.1) return;
  const delta = lastWorldX < 0 ? 0 : worldX - lastWorldX;
  lastWorldX = worldX;

  for (const key of Object.keys(layers)) {
    layers[key].style.transform = `translate3d(${-worldX * PARALLAX[key]}px, 0, 0)`;
  }

  // wheels roll with the road (r ≈ 17px in the car SVG)
  wheelAngle += delta / 17;
  const deg = wheelAngle * 57.29;
  wheelEls.forEach(w => { w.style.transform = `rotate(${deg}deg)`; });
  if (!reducedMotion) {
    carEl.style.transform = `translateY(${Math.sin(worldX * 0.09) * 1.6}px)`;
  }

  // checkpoint detection: which signpost is the car beside?
  const carWorldX = worldX + carScreenX;
  let found = null;
  for (const c of scene.checkpoints) {
    if (Math.abs(c.x - carWorldX) < 300) { found = c; break; }
  }
  if (found && activeCp !== found.id) {
    activeCp = found.id;
    visited.add(found.id);
    showCard(found);
    renderMap();
    if (visited.size === ZONES.length) celebrate();
  } else if (!found && activeCp) {
    activeCp = null;
    hideCard();
    renderMap();
  }
  positionMapCar();
}

let ticking = false;
addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { ticking = false; update(); });
}, { passive: true });
addEventListener('resize', () => layout());

if (PIN !== null) {
  for (const sel of ['.topbar', '.hero', '#drive .wrap']) $(sel).style.display = 'none';
}
renderMap();
layout();
if (PIN !== null) track.style.height = '100svh';

// Debug/deep-link: ?p=0.42 scrolls the journey to that progress
if (params.has('p')) {
  const p = Math.min(Math.max(parseFloat(params.get('p')) || 0, 0), 1);
  requestAnimationFrame(() => {
    const top = track.offsetTop + p * (track.offsetHeight - window.innerHeight);
    scrollTo({ top, behavior: 'instant' });
    if (params.has('debug')) requestAnimationFrame(() => {
      document.title = `[y=${Math.round(scrollY)} want=${Math.round(top)} trackTop=${track.offsetTop} h=${track.offsetHeight}]`;
    });
  });
}
