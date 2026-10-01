// Renders every content section from data/site.json. The page has no build
// step, so this is the template layer; markup here, copy in the JSON.

const $ = (sel) => document.querySelector(sel);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Copy in site.json is trusted, hand-written HTML (it carries <strong> and
// entities); attribute values still go through attr().
const attr = (s) => String(s).replace(/&(?!amp;|lt;|gt;|quot;|#)/g, '&amp;').replace(/"/g, '&quot;');
const plain = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent; };
const isTodo = (href) => !href || href === 'TODO';
const isExternal = (href) => /^https?:/.test(href);
const linkAttrs = (href) => (isExternal(href) ? ' target="_blank" rel="noopener"' : '');

const PUB_KIND = { accepted: 'accepted', review: 'review', prep: 'progress', published: 'accepted' };

export function badge(b) {
  return `<span class="badge badge-${b.kind}">${b.text}</span>`;
}

/* ── Hero + currently building ────────────────────────── */
function renderHero(d) {
  $('#hero-status').innerHTML = d.hero.status;
  $('#hero-title').innerHTML = `${d.hero.name}<br />${d.hero.tagline}<span class="ship" aria-hidden="true">⛴️</span>`;
  $('#hero-intro').innerHTML = d.hero.intro;
  if (d.hero.sponsor) {
    const sp = $('#hero-sponsor');
    sp.href = d.hero.sponsor.href;
    sp.innerHTML = `<span class="hero-sponsor-label">${d.hero.sponsor.label}</span>
      <span class="hero-sponsor-text">${d.hero.sponsor.text} <span class="hero-sponsor-go">${d.hero.sponsor.linkLabel} →</span></span>`;
    sp.hidden = false;
  }
  $('#hero-chips').innerHTML = d.hero.proofChips
    .map(c => `<li><a class="proof-chip" href="${attr(c.href)}">${c.label}</a></li>`).join('');
}

function renderNow(d) {
  const n = d.now;
  $('#now-slot').innerHTML = `
    <article class="wip">
      <div class="wip-bar" aria-hidden="true"></div>
      <div class="wip-head">
        <p class="wip-badge"><span class="dot" aria-hidden="true"></span> Currently building</p>
        ${badge(n.badge)}
      </div>
      <h2>${n.title} <span class="wip-sub">${n.subtitle}</span></h2>
      <ul class="wip-stats">${n.chips.map(c => `<li><strong>${c.value}</strong><span>${c.label}</span></li>`).join('')}</ul>
      <a class="wip-link" href="${attr(n.href)}">See the project →</a>
    </article>`;
}

/* ── Research map ─────────────────────────────────────── */
function renderMap(d) {
  const byLane = (lane) => d.projects
    .filter(p => p.lane === lane)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const lanes = d.lanes.map(l => `
    <div class="rmap-lane rmap-${l.id}">
      <h3>${l.title}</h3>
      <ul>${byLane(l.id).map(p => {
        const href = p.shelf ? '#shelf' : `#project-${p.id}`;
        const meta = [p.year, p.mapNote].filter(Boolean).join(' · ');
        const hot = p.id === d.mapHighlight ? ' is-current' : '';
        return `<li><a class="rmap-box${hot}" href="${href}" data-target="${p.id}">
          <span class="rmap-title">${p.title}</span>${meta ? `<span class="rmap-meta">${meta}</span>` : ''}
          ${hot ? '<span class="rmap-now">current build</span>' : ''}</a></li>`;
      }).join('')}</ul>
    </div>`).join('');
  $('#rmap').innerHTML = `
    <div class="rmap-lanes">${lanes}</div>
    <div class="rmap-toolkit">${d.toolkit}</div>
    <figcaption>${d.projects.filter(p => p.lane).length} projects in three lanes; IOCScooper++ is highlighted because it is the current build.</figcaption>`;

  // pointing at a box raises its card's outline
  $('#rmap').addEventListener('pointerover', (e) => pointCard(e, true));
  $('#rmap').addEventListener('pointerout', (e) => pointCard(e, false));
  $('#rmap').addEventListener('focusin', (e) => pointCard(e, true));
  $('#rmap').addEventListener('focusout', (e) => pointCard(e, false));
}
function pointCard(e, on) {
  const box = e.target.closest('.rmap-box');
  if (!box) return;
  const card = document.getElementById(`project-${box.dataset.target}`);
  if (card) card.classList.toggle('is-pointed', on);
}

/* ── Projects ─────────────────────────────────────────── */
function projectCard(p) {
  const metrics = (p.metrics || []).map((m, i) =>
    `<li class="${i === 0 ? 'lead' : ''}"><strong>${m.value}</strong><span>${m.label}</span></li>`).join('');
  const links = (p.links || []).filter(l => !isTodo(l.href))
    .map(l => `<a href="${attr(l.href)}"${linkAttrs(l.href)}>${l.label} ↗</a>`).join('');
  const stepper = p.stepper ? `
    <div class="stepper">
      <p class="stepper-label">${p.stepper.label}</p>
      <ol>${p.stepper.steps.map(s => `<li class="${s.best ? 'best' : ''}"><b>${s.id}</b><span>${s.text}</span>${s.best ? `<em>${s.best}</em>` : ''}</li>`).join('')}</ol>
    </div>` : '';
  const versus = p.versus ? `
    <div class="versus">
      <p class="versus-label">${p.versus.label}</p>
      <table>
        <thead><tr><th scope="col">Task</th>${p.versus.columns.map(c => `<th scope="col">vs. ${c}</th>`).join('')}</tr></thead>
        <tbody>${p.versus.rows.map(r => `<tr><th scope="row">${r.task}</th>${p.versus.columns.map(() => `<td><span class="win">✓ ${r.result}</span></td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      <p class="versus-note">${p.versus.note}</p>
    </div>` : '';
  return `
    <article class="stop" id="project-${p.id}">
      <header class="stop-head">
        <p class="stop-meta"><span class="stop-year">${p.year}</span>${(p.badges || []).map(badge).join('')}</p>
        <h3>${p.title}</h3>
        <p class="stop-line">${p.oneLine}</p>
      </header>
      ${metrics ? `<div class="stop-metrics"><ul class="metrics">${metrics}</ul>${p.metricsNote ? `<p class="metrics-note">${p.metricsNote}</p>` : ''}</div>` : ''}
      <figure class="stop-fig" data-src="${attr(p.diagram)}">
        <div class="dg-scroll"></div>
        <figcaption>${p.caption}</figcaption>
      </figure>
      <ul class="stop-bullets">${p.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
      ${stepper}${versus}
      <div class="stop-foot">
        <ul class="tags">${p.tags.map(t => `<li>${t}</li>`).join('')}</ul>
        ${links ? `<p class="stop-links">${links}</p>` : ''}
      </div>
    </article>`;
}

function renderProjects(d) {
  const cards = d.projects.filter(p => !p.shelf)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.year - a.p.year || a.i - b.i)   // newest first; ties keep file order
    .map(({ p }) => projectCard(p)).join('');
  $('#project-list').innerHTML = cards;

  const shelf = d.projects.filter(p => p.shelf)
    .sort((a, b) => (b.year ?? -1) - (a.year ?? -1));
  $('#shelf-list').innerHTML = shelf.map(p => {
    const links = (p.links || []).filter(l => !isTodo(l.href))
      .map(l => ` <a href="${attr(l.href)}"${linkAttrs(l.href)}>${l.label} ↗</a>`).join('');
    return `<li id="shelf-${p.id}"><span class="shelf-year">${p.year ?? '—'}</span><span><strong>${p.title}</strong> ${p.oneLine}${links}</span></li>`;
  }).join('');

  inlineDiagrams();
}

// Diagrams are inlined as markup, not loaded as images, so the --diagram-*
// tokens and night mode apply.
async function inlineDiagrams() {
  const figs = [...document.querySelectorAll('.stop-fig[data-src]')];
  const io = !reducedMotion && 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          en.target.classList.add('is-drawn');
          io.unobserve(en.target);
        }
      }, { threshold: 0.35 })
    : null;

  await Promise.all(figs.map(async (fig) => {
    try {
      const res = await fetch(fig.dataset.src);
      if (!res.ok) throw new Error(res.status);
      const slot = fig.querySelector('.dg-scroll');
      slot.innerHTML = await res.text();
      const svg = slot.querySelector('svg');
      const vbW = svg.viewBox.baseVal.width;
      svg.removeAttribute('width'); svg.removeAttribute('height');
      // never render the 13px labels below 12px: scroll inside the figure instead
      svg.style.minWidth = `${Math.round(vbW * 12 / 13)}px`;
      svg.style.maxWidth = `${Math.round(vbW * 1.15)}px`;
      if (io) { svg.classList.add('dg-anim'); io.observe(svg); }
    } catch {
      fig.hidden = true; // a missing diagram should not leave an empty frame
    }
  }));
}

/* ── Experience timeline ──────────────────────────────── */
const months = (ym) => { const [y, m] = ym.split('-').map(Number); return y * 12 + (m - 1); };

function renderTimeline(d) {
  const t0 = months(d.timeline.start);
  const t1 = months(d.timeline.end) + 1;
  const span = t1 - t0;
  const pct = (m) => ((m - t0) / span) * 100;
  const years = [];
  for (let y = Number(d.timeline.start.slice(0, 4)); y * 12 < t1; y++) years.push(y);

  const lanes = d.timeline.lanes.map(l => {
    const bars = d.experience.filter(e => e.lane === l.id).map(e => {
      const active = e.end === 'present';
      const a = pct(months(e.start));
      const b = active ? 100 : pct(months(e.end) + 1);
      const wide = b - a >= 10;
      return `<button class="tl-bar tl-${l.id}${active ? ' is-active' : ''}${wide ? '' : ' is-narrow'}" data-id="${e.id}"
        style="left:${a.toFixed(2)}%; width:${(b - a).toFixed(2)}%"
        aria-pressed="false" aria-controls="tl-detail" aria-label="${attr(plain(`${e.title}, ${e.org}, ${e.dates}`))}"
        title="${attr(plain(`${e.title} · ${e.dates}`))}">
        <span>${e.short}</span></button>`;
    }).join('');
    return `<div class="tl-lane"><span class="tl-lane-name">${l.title}</span><div class="tl-track">${bars}</div></div>`;
  }).join('');

  $('#timeline').innerHTML = `
    <div class="tl-scroll">
      <div class="tl-chart">
        ${lanes}
        <div class="tl-axis" aria-hidden="true"><span class="tl-lane-name"></span><div class="tl-track">
          ${years.map(y => `<span style="left:${pct(y * 12).toFixed(2)}%">${y}</span>`).join('')}
        </div></div>
      </div>
    </div>
    <div class="tl-detail" id="tl-detail" aria-live="polite"></div>`;

  const byId = Object.fromEntries(d.experience.map(e => [e.id, e]));
  const select = (id) => {
    const e = byId[id];
    document.querySelectorAll('.tl-bar').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    const more = e.href ? ` <a href="${attr(e.href)}">More →</a>` : '';
    $('#tl-detail').innerHTML = `
      <p class="tl-detail-head"><strong>${e.title}</strong> · ${e.org} <span class="tl-dates">${e.dates}</span></p>
      ${e.detail ? `<p>${e.detail}${more}</p>` : ''}`;
  };
  $('#timeline').addEventListener('click', (ev) => {
    const bar = ev.target.closest('.tl-bar');
    if (bar) select(bar.dataset.id);
  });
  select((d.experience.find(e => e.default) || d.experience[0]).id);
}

/* ── Skills matrix ────────────────────────────────────── */
function renderSkills(d) {
  const proj = Object.fromEntries(d.projects.map(p => [p.id, p]));
  const cols = d.skillColumns.map(id => proj[id]);
  const head = cols.map(p => `<th scope="col"><a href="#project-${p.id}"><span>${p.short}</span></a></th>`).join('');
  const rows = d.skills.map(s => {
    const cells = cols.map(p => s.evidence.includes(p.id)
      ? `<td><a class="sk-dot" href="#project-${p.id}" aria-label="${attr(plain(`${p.title}`))}" title="${attr(plain(p.title))}"></a></td>`
      : '<td><span class="sk-none" aria-label="no"></span></td>').join('');
    const chips = s.chips.length ? `<span class="sk-chips">${s.chips.map(c => `<span>${c}</span>`).join('')}</span>` : '';
    return `<tr><th scope="row"><span class="sk-name">${s.name}</span>${chips}</th>${cells}</tr>`;
  }).join('');
  $('#skills-matrix').innerHTML = `
    <div class="sk-scroll">
      <table class="sk">
        <caption class="sr-only">Skills, and the projects that show each one</caption>
        <thead><tr><th scope="col" class="sk-corner">Skill</th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="sk-foot">${d.skillsFootnote}</p>
    <p class="sk-also"><strong>Also use:</strong> ${d.alsoUse.join(' · ')}</p>`;
}

/* ── Publications, talks, teaching ────────────────────── */
function renderPubs(d) {
  $('#pub-list').innerHTML = d.publications.map(p => `
    <li class="pub">
      <div><a class="pub-title" href="${attr(p.href)}"${linkAttrs(p.href)}>${p.title}</a><span class="pub-venue">${p.venue}</span></div>
      ${badge({ kind: PUB_KIND[p.badge] || 'note', text: p.badgeText })}
    </li>`).join('');
  $('#talk-list').innerHTML = d.talks.map(t => `
    <li><div><strong>${t.event}</strong><span>${t.line}</span></div><span class="row-when">${t.date}</span></li>`).join('');
  $('#teaching-list').innerHTML = d.teaching.map(t => `
    <li><div><strong>${t.course}</strong><span>${t.line}${t.link ? ` <a href="${attr(t.link.href)}">${t.link.label} →</a>` : ''}</span></div><span class="row-when">${t.term}</span></li>`).join('');
}

export function renderAll(d) {
  renderHero(d);
  renderNow(d);
  renderMap(d);
  renderProjects(d);
  renderTimeline(d);
  renderSkills(d);
  renderPubs(d);
}
