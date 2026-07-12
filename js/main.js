import { ZONES, ZONE_BY_ID } from './content.js';

const $ = (sel) => document.querySelector(sel);

const shell = $('.world-shell');
const canvas = $('#world-canvas');
const overlay = $('#world-overlay');
const startBtn = $('#start-drive');
const fallbackPanel = $('#world-fallback');
const hud = $('#hud');
const progressEl = $('#hud-progress');
const card = $('#zone-card');
const joystick = $('#joystick');
const stick = joystick.querySelector('.stick');
const confettiCanvas = $('#confetti');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);

let world = null;
const visited = new Set();
let cardOpenFor = null;

/* ── HUD progress chips ─────────────────────────────────── */
function renderProgress() {
  progressEl.innerHTML = ZONES.map(z =>
    `<span class="hud-chip ${visited.has(z.id) ? 'visited' : ''}" title="${z.title}">${z.emoji}<span class="chip-label">${visited.has(z.id) ? z.title : '?'}</span></span>`
  ).join('');
}

/* ── Zone card ──────────────────────────────────────────── */
function openCard(id) {
  const zone = ZONE_BY_ID[id];
  if (!zone) return;
  cardOpenFor = id;
  card.innerHTML = `
    <div class="zone-card-head"><span class="emoji" aria-hidden="true">${zone.emoji}</span><h3>${zone.title}</h3></div>
    <p class="zone-tagline">${zone.tagline}</p>
    <ul class="zone-points">${zone.points.map(p => `<li>${p}</li>`).join('')}</ul>
    <div class="zone-tags">${zone.tags.map(t => `<span>${t}</span>`).join('')}</div>
    ${visited.size === ZONES.length ? `<p class="zone-complete">🎉 That's all seven landmarks! Thanks for driving along — <a href="mailto:soumyajyotidutta23@gmail.com">email me</a> and let's plan the next trip together.</p>` : ''}
    <button class="btn btn-primary" id="card-close">Keep driving 🚙</button>`;
  card.hidden = false;
  $('#card-close').addEventListener('click', closeCard);
  $('#card-close').focus({ preventScroll: true });
}

function closeCard() {
  card.hidden = true;
  cardOpenFor = null;
  canvas.focus({ preventScroll: true });
}

function onEnterZone(id) {
  if (cardOpenFor) return;
  const first = !visited.has(id);
  visited.add(id);
  renderProgress();
  openCard(id);
  if (first && visited.size === ZONES.length) celebrate();
}

/* ── Completion celebration ─────────────────────────────── */
function celebrate() {
  if (reducedMotion) return;
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
    else { confettiCanvas.style.display = 'none'; }
  })(t0);
}

/* ── Input: keyboard ────────────────────────────────────── */
const keys = {};
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};
function applyKeys() {
  if (!world) return;
  world.input.throttle = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  world.input.steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
}
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && cardOpenFor) { closeCard(); return; }
  const k = KEYMAP[e.code];
  if (!k || !world || card.hidden === false) return;
  // only steer while the world is on screen
  const r = shell.getBoundingClientRect();
  if (r.bottom < 80 || r.top > innerHeight - 80) return;
  keys[k] = true; applyKeys();
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
document.addEventListener('keyup', (e) => {
  const k = KEYMAP[e.code];
  if (!k) return;
  keys[k] = false; applyKeys();
});

/* ── Input: joystick (touch) ────────────────────────────── */
let joyActive = false;
function joyVector(e) {
  const r = joystick.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
  const m = Math.hypot(dx, dy);
  if (m > 1) { dx /= m; dy /= m; }
  stick.style.transform = `translate(calc(-50% + ${dx * 30}px), calc(-50% + ${dy * 30}px))`;
  if (world) { world.input.steer = dx; world.input.throttle = -dy; }
}
joystick.addEventListener('pointerdown', (e) => { joyActive = true; joystick.setPointerCapture(e.pointerId); joyVector(e); });
joystick.addEventListener('pointermove', (e) => { if (joyActive) joyVector(e); });
['pointerup', 'pointercancel'].forEach(ev => joystick.addEventListener(ev, () => {
  joyActive = false;
  stick.style.transform = 'translate(-50%, -50%)';
  if (world) { world.input.steer = 0; world.input.throttle = 0; }
}));

/* ── Boot ───────────────────────────────────────────────── */
function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const dbg = (m) => { if (params.has('debug')) document.title = `[${m}]`; };
window.addEventListener('error', (e) => dbg('ERR ' + e.message));

async function startDrive() {
  overlay.classList.add('hidden');
  dbg('start');
  if (!webglOK()) {
    fallbackPanel.classList.add('show');
    dbg('no-webgl');
    return;
  }
  startBtn.disabled = true;
  try {
    dbg('importing');
    const { createWorld } = await import('./world.js');
    dbg('imported');
    // signposts draw text to canvas — wait briefly for fonts, but never hang
    await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
    dbg('fonts-ok');
    world = createWorld({
      canvas,
      zones: ZONES,
      onEnterZone,
      spawnZone: params.get('zone') || undefined,
    });
    dbg('world-created');
    shell.classList.add('world-active');
    document.body.classList.add('world-active');
    hud.hidden = false;
    renderProgress();
    world.start();
    world.resize();
    canvas.setAttribute('tabindex', '0');
    canvas.focus({ preventScroll: true });
    new ResizeObserver(() => world && world.resize()).observe(shell);
    document.addEventListener('visibilitychange', () => {
      if (!world) return;
      if (document.hidden) world.stop(); else world.start();
    });
  } catch (err) {
    console.error('World failed to load:', err);
    fallbackPanel.classList.add('show');
  }
}

startBtn.addEventListener('click', startDrive);
$('#hud-exit').addEventListener('click', () => {
  if (world) world.stop();
  document.getElementById('story').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
});

// Deep-link helpers (also used for headless visual testing)
if (params.has('autostart')) startDrive();
