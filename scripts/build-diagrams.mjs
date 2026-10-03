// Builds assets/diagrams/<id>.svg from the specs below.
// Run: node scripts/build-diagrams.mjs
//
// The page inlines these files, so every colour is a class styled by the
// --diagram-* tokens in css/style.css and night mode just works.
// Two node kinds only: process (rounded rect) and data (cylinder).
// One accent node per diagram; dashed = planned or in progress.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'diagrams');

/* ── Grid: three columns, rows 92 apart, a right gutter for routing ── */
const W = 550;
const COL_X = [6, 192, 378];
const NODE_W = 156;
const ROW_Y = (r) => 8 + r * 92;
const NODE_H = 58;
const GUTTER_X = 542;
const LINE_H = 15;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function box(n) {
  const x = n.x ?? COL_X[n.c];
  const y = n.y ?? ROW_Y(n.r);
  const w = n.w ?? (n.span ? NODE_W * n.span + (COL_X[1] - COL_X[0] - NODE_W) * (n.span - 1) : NODE_W);
  const h = n.h ?? NODE_H;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

function nodeSvg(n, b) {
  const cls = ['dg-n', n.data ? 'dg-data' : 'dg-proc', n.accent ? 'dg-accent' : '', n.dashed ? 'dg-dashed' : ''].filter(Boolean).join(' ');
  let shape;
  if (n.data) {
    const e = 5;
    shape = `<path class="dg-shape" d="M${b.x} ${b.y + e} a${b.w / 2} ${e} 0 0 1 ${b.w} 0 V${b.y + b.h - e} a${b.w / 2} ${e} 0 0 1 ${-b.w} 0 Z"/>` +
            `<path class="dg-rim" d="M${b.x} ${b.y + e} a${b.w / 2} ${e} 0 0 0 ${b.w} 0"/>`;
  } else {
    shape = `<rect class="dg-shape" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10"/>`;
  }
  const lines = n.lines;
  const top = b.cy - ((lines.length - 1) * LINE_H) / 2 + 4.5 + (n.data ? 2 : 0);
  const text = lines.map((t, i) =>
    `<text x="${b.cx}" y="${top + i * LINE_H}" class="${i === 0 ? 'dg-t' : 'dg-s'}">${esc(t)}</text>`).join('');
  return `<g class="${cls}">${shape}${text}</g>`;
}

// Auto edge between two boxes that share a row or a column; otherwise pass pts.
function autoPts(a, b) {
  if (Math.abs(a.cy - b.cy) < 1) {
    return a.cx < b.cx ? [[a.x + a.w, a.cy], [b.x, b.cy]] : [[a.x, a.cy], [b.x + b.w, b.cy]];
  }
  if (Math.abs(a.cx - b.cx) < 1) {
    return a.cy < b.cy ? [[a.cx, a.y + a.h], [b.cx, b.y]] : [[a.cx, a.y], [b.cx, b.y + b.h]];
  }
  throw new Error('edge needs pts');
}

function edgeSvg(e, boxes, id) {
  const pts = e.pts ?? autoPts(boxes[e.from], boxes[e.to]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
  const solid = !e.dashed;
  return `<path class="dg-edge${solid ? '' : ' dg-edge-dashed'}" d="${d}"${solid ? ' pathLength="1"' : ''} marker-end="url(#${id}-head)"/>`;
}

function labelSvg(e, boxes) {
  const pts = e.pts ?? autoPts(boxes[e.from], boxes[e.to]);
  let out = '';
  if (e.label) {
    // label on the longest segment unless placed explicitly
    let at = e.labelAt;
    if (!at) {
      let best = 0;
      for (let i = 1; i < pts.length; i++) {
        const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (len > best) { best = len; at = [(pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2]; }
      }
    }
    const w = e.label.length * 6.6 + 12;
    out += `<g class="dg-label"><rect x="${at[0] - w / 2}" y="${at[1] - 9}" width="${w}" height="18" rx="9"/>` +
           `<text x="${at[0]}" y="${at[1] + 4}">${esc(e.label)}</text></g>`;
  }
  return out;
}

function build(spec) {
  const boxes = {};
  for (const n of spec.nodes) boxes[n.id] = box(n);
  const rows = Math.max(...spec.nodes.map(n => (n.r ?? 0))) + 1;
  const H = spec.h ?? ROW_Y(rows) - 34 + 8;
  const id = `dg-${spec.id}`;
  const edges = spec.edges.map(e => edgeSvg(e, boxes, id)).join('');
  const nodes = spec.nodes.map(n => nodeSvg(n, boxes[n.id])).join('');
  const labels = spec.edges.map(e => labelSvg(e, boxes)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="dg" role="img" aria-label="${esc(spec.aria)}">` +
    `<defs><marker id="${id}-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path class="dg-head" d="M0 0 L10 5 L0 10 Z"/></marker></defs>` +
    `<g class="dg-edges">${edges}</g><g class="dg-nodes">${nodes}</g><g class="dg-labels">${labels}</g></svg>\n`;
}

/* ── Specs ─────────────────────────────────────────────── */
const R0 = ROW_Y(0) + NODE_H / 2, R1 = ROW_Y(1) + NODE_H / 2, R2 = ROW_Y(2) + NODE_H / 2;
const GAP01 = ROW_Y(1) - 17, GAP12 = ROW_Y(2) - 17;   // mid-gap between rows
const CX = COL_X.map(x => x + NODE_W / 2);

const specs = [
  {
    id: 'yaragen',
    aria: 'YaraGen pipeline: Scooper masks IOCs, a YaraAST tokenizer feeds a 139M-parameter BART generator, IOCs are restored into the YARA rule, and the Brownie & Puff evaluator scores rules with Z3 as a training-time signal. The 139M generator reaches 91.8% semantic correctness.',
    nodes: [
      { id: 'req', c: 0, r: 0, data: true, lines: ['Rule request', 'description + IOCs'] },
      { id: 'sc', c: 1, r: 0, lines: ['Scooper · 55M', 'masks IOCs as', 'placeholders'] },
      { id: 'tok', c: 2, r: 0, lines: ['YaraAST', 'hybrid tokenizer'] },
      { id: 'gen', c: 2, r: 1, accent: true, lines: ['BART generator', '139M params'] },
      { id: 'rest', c: 1, r: 1, lines: ['Restore IOCs'] },
      { id: 'rule', c: 0, r: 1, data: true, lines: ['YARA rule'] },
      { id: 'bp', c: 0, r: 2, lines: ['Brownie & Puff', 'BLEU + compile', '+ Z3 SMT'] },
      { id: 'data', c: 2, r: 2, data: true, lines: ['305K crawled rules', '15M synthetic', '15M grammar-fuzzed'] },
    ],
    edges: [
      { from: 'req', to: 'sc' }, { from: 'sc', to: 'tok' }, { from: 'tok', to: 'gen' },
      { from: 'gen', to: 'rest' }, { from: 'rest', to: 'rule' }, { from: 'rule', to: 'bp' },
      { pts: [[COL_X[0] + NODE_W, R2], [COL_X[1] - 16, R2], [COL_X[1] - 16, GAP12], [CX[2] - 40, GAP12], [CX[2] - 40, ROW_Y(1) + NODE_H]],
        label: 'training-time signal', labelAt: [CX[1] + 12, GAP12] },
      { pts: [[CX[2] + 40, ROW_Y(2)], [CX[2] + 40, ROW_Y(1) + NODE_H]] },
    ],
  },
  {
    id: 'iocscooper',
    aria: 'IOCScooper++ pipeline: threat reports go through audited parsers into ScooperNER-M, a 50.6M-parameter model that extracts 36 IOC types and explicit ATT&CK IDs at 0.894 micro F1; the output feeds frozen YaraGen. Phase 2, in progress, adds grounded tuples, retrieval over procedure examples and open-set mapping to 637 ATT&CK techniques.',
    nodes: [
      { id: 'rep', c: 0, r: 0, data: true, lines: ['Threat report', 'vendor or government'] },
      { id: 'par', c: 1, r: 0, lines: ['Audited parsers'] },
      { id: 'ner', c: 2, r: 0, accent: true, lines: ['ScooperNER-M', '50.6M params', 'MLM → fine-tuning'] },
      { id: 'out', c: 2, r: 1, data: true, lines: ['36 IOC types', '+ explicit ATT&CK IDs'] },
      { id: 'yg', c: 1, r: 1, lines: ['Frozen YaraGen', '100% valid rules'] },
      { id: 'tup', c: 2, r: 2, dashed: true, lines: ['Phase 2 · grounded', '(entity, action, IOC)', 'tuples'] },
      { id: 'ret', c: 1, r: 2, dashed: true, lines: ['Retrieval over', 'procedure-example', 'anchors'] },
      { id: 'att', c: 0, r: 2, data: true, dashed: true, lines: ['Open-set ATT&CK', 'all 637 techniques'] },
    ],
    edges: [
      { from: 'rep', to: 'par' }, { from: 'par', to: 'ner' }, { from: 'ner', to: 'out' },
      { from: 'out', to: 'yg' },
      { from: 'out', to: 'tup', dashed: true }, { from: 'tup', to: 'ret', dashed: true }, { from: 'ret', to: 'att', dashed: true },
    ],
  },
  {
    id: 'autopyara',
    aria: 'AutoPYara pipeline: about 71K Windows PE samples are clustered by family, a subcluster estimate and a centroid selection both feed the biclustering rule generator, and the resulting YARA rules ship as a pip package. It beats AutoYara by 14 pp rule coverage.',
    nodes: [
      { id: 'bin', c: 0, r: 0, data: true, lines: ['≈71K Windows PE', 'samples · 8 years'] },
      { id: 'clu', c: 1, r: 0, lines: ['Family clustering', 'optimal-K heuristics'] },
      { id: 'sub', c: 2, r: 0, lines: ['Subcluster estimate', 'historical', 'VirusTotal data'] },
      { id: 'cen', c: 1, r: 1, lines: ['Centroid selection', 'similarity hashing'] },
      { id: 'gen', c: 2, r: 1, accent: true, lines: ['Biclustering', 'rule generator'] },
      { id: 'yar', c: 2, r: 2, data: true, lines: ['YARA rules'] },
      { id: 'pip', c: 1, r: 2, lines: ['pip install', 'autopyara · PyPI'] },
    ],
    edges: [
      { from: 'bin', to: 'clu' }, { from: 'clu', to: 'sub' }, { from: 'clu', to: 'cen' },
      { from: 'sub', to: 'gen' }, { from: 'cen', to: 'gen' }, { from: 'gen', to: 'yar' }, { from: 'yar', to: 'pip' },
    ],
  },
  {
    id: 'agent',
    aria: 'Research agent loop: the agent thinks, tags the query as clear or ambiguous, asks one minimal clarifying question when it is ambiguous, then calls tools over MCP and answers with citations. Pause-detection F1 rose from 0.168 to 0.573.',
    nodes: [
      { id: 'q', c: 0, r: 0, data: true, lines: ['User query'] },
      { id: 'th', c: 1, r: 0, lines: ['think'] },
      { id: 'am', c: 2, r: 0, lines: ['Ambiguity tag', 'clear or ambiguous?'] },
      { id: 'ask', c: 2, r: 1, accent: true, lines: ['Ask one minimal', 'clarifying question'] },
      { id: 'ua', c: 1, r: 1, lines: ['User answers'] },
      { id: 'tl', c: 1, r: 2, lines: ['Tools over MCP', 'web search,', 'Semantic Scholar'] },
      { id: 'ans', c: 0, r: 2, data: true, lines: ['Answer with', 'citations'] },
    ],
    edges: [
      { from: 'q', to: 'th' }, { from: 'th', to: 'am' },
      { from: 'am', to: 'ask', label: 'ambiguous' },
      { from: 'ask', to: 'ua' }, { from: 'ua', to: 'tl' },
      { pts: [[COL_X[2] + NODE_W, R0], [GUTTER_X, R0], [GUTTER_X, R2], [COL_X[1] + NODE_W, R2]], label: 'clear', labelAt: [CX[2] + 20, R2] },
      { from: 'tl', to: 'ans' },
    ],
  },
  {
    id: 'depix',
    aria: 'Depixelation benchmark loop: a difficulty grid produces pixelated samples, constrained search proposes candidate strings, each candidate is rendered and re-pixelated, and only an exact match counts as recovered. Calibrated abstention is a planned exit. The grid has 360 cells with 10 seeds each.',
    nodes: [
      { id: 'g', c: 0, r: 0, lines: ['Difficulty grid', 'block size × font ×', 'corruption × charset'] },
      { id: 'px', c: 1, r: 0, data: true, lines: ['Pixelated', 'text sample'] },
      { id: 'cs', c: 2, r: 0, accent: true, lines: ['Constrained search', 'over candidate', 'strings'] },
      { id: 'rv', c: 2, r: 1, lines: ['Render and', 're-pixelate', 'candidate'] },
      { id: 'ex', c: 1, r: 1, lines: ['Exact match?'] },
      { id: 'ok', c: 1, r: 2, data: true, lines: ['Recovered'] },
      { id: 'ab', c: 2, r: 2, dashed: true, lines: ['Calibrated', 'abstention'] },
    ],
    edges: [
      { from: 'g', to: 'px' }, { from: 'px', to: 'cs' },
      { pts: [[CX[2] + 25, ROW_Y(0) + NODE_H], [CX[2] + 25, ROW_Y(1)]] },
      { from: 'rv', to: 'ex' },
      { from: 'ex', to: 'ok', label: 'yes' },
      { pts: [[CX[1], ROW_Y(1)], [CX[1], GAP01], [CX[2] - 35, GAP01], [CX[2] - 35, ROW_Y(0) + NODE_H]], label: 'no', labelAt: [CX[1] + 50, GAP01] },
      { pts: [[COL_X[2] + NODE_W, R0], [GUTTER_X, R0], [GUTTER_X, R2], [COL_X[2] + NODE_W, R2]], dashed: true },
    ],
  },
  {
    id: 'fishstick',
    aria: 'Sturdy Fishstick pipeline: 10+ sources land in SQLite, a pre-filter drops listings without an LLM call, a 1.7B local model answers categorical questions, a deterministic score feeds the React dashboard, and a RAG chat retrieves from SQLite FTS5. About 750 listings scored.',
    nodes: [
      { id: 'src', c: 0, r: 0, data: true, lines: ['10+ sources', 'ATS APIs, LinkedIn,', 'Google Jobs']  },
      { id: 'db', c: 1, r: 0, data: true, lines: ['SQLite'] },
      { id: 'rag', c: 2, r: 0, lines: ['RAG chat', 'FTS5 retrieval', 'LFM2.5-1.2B'] },
      { id: 'pf', c: 1, r: 1, lines: ['Pre-filter', 'no LLM call'] },
      { id: 'cq', c: 2, r: 1, accent: true, lines: ['Categorical', 'questions', 'qwen3:1.7b'] },
      { id: 'sc', c: 2, r: 2, lines: ['Deterministic', 'score'] },
      { id: 'ui', c: 1, r: 2, lines: ['Dashboard and', 'Kanban · React'] },
    ],
    edges: [
      { from: 'src', to: 'db' }, { from: 'db', to: 'rag' }, { from: 'db', to: 'pf' },
      { from: 'pf', to: 'cq' }, { from: 'cq', to: 'sc' }, { from: 'sc', to: 'ui' },
    ],
  },
  {
    id: 'hellopentagon',
    aria: 'HelloPentagon pipeline: a Windows binary uploaded through the React UI reaches a Dockerized Flask API, PE and BODMAS features are extracted, XGBoost and random-forest classifiers give the verdict, a hash-similarity lookup names the likely family, an LLM explains the verdict, and the dashboard shows results with live alerts.',
    nodes: [
      { id: 'up', c: 0, r: 0, data: true, lines: ['Windows PE upload', 'React UI'] },
      { id: 'api', c: 1, r: 0, lines: ['Flask API', 'Docker · SQLite'] },
      { id: 'fx', c: 2, r: 0, lines: ['Feature extraction', 'PE + BODMAS'] },
      { id: 'clf', c: 2, r: 1, accent: true, lines: ['XGBoost +', 'random forest', 'malware verdict'] },
      { id: 'fam', c: 1, r: 1, lines: ['Family lookup', 'hash similarity'] },
      { id: 'llm', c: 0, r: 1, lines: ['LLM explanation', 'of the verdict'] },
      { id: 'ui', c: 0, r: 2, data: true, lines: ['Dashboard', 'results + live alerts'] },
    ],
    edges: [
      { from: 'up', to: 'api' }, { from: 'api', to: 'fx' }, { from: 'fx', to: 'clf' },
      { from: 'clf', to: 'fam' }, { from: 'fam', to: 'llm' }, { from: 'llm', to: 'ui' },
    ],
  },
  {
    id: 'hawkeye',
    aria: 'Hawkeye cache replacement: OPTgen replays Belady\'s optimal policy on past accesses to train a PC-based predictor, which inserts cache-friendly loads with high priority and cache-averse loads with low priority. Extensions add PC tracking and multi-policy benchmarking.',
    nodes: [
      { id: 'a', c: 0, r: 0, data: true, lines: ['Memory access', 'stream · zsim'] },
      { id: 'o', c: 1, r: 0, lines: ['OPTgen', 'Belady\'s optimal on', 'past accesses'] },
      { id: 'p', c: 2, r: 0, accent: true, lines: ['PC-based', 'predictor'] },
      { id: 'd', c: 2, r: 1, lines: ['Load PC', 'cache-friendly?'] },
      { id: 'hi', c: 1, r: 2, lines: ['Insert with', 'high priority'] },
      { id: 'lo', c: 2, r: 2, lines: ['Insert with', 'low priority'] },
      { id: 'ext', c: 0, r: 1, dashed: true, lines: ['Extensions', 'PC tracking,', 'multi-policy bench'] },
    ],
    edges: [
      { from: 'a', to: 'o' }, { from: 'o', to: 'p' },
      { pts: [[CX[2] + 25, ROW_Y(0) + NODE_H], [CX[2] + 25, ROW_Y(1)]] },
      { pts: [[COL_X[2], R1], [CX[1], R1], [CX[1], ROW_Y(2)]], label: 'friendly', labelAt: [CX[1], R1] },
      { from: 'd', to: 'lo', label: 'averse' },
      { pts: [[CX[2] - 35, ROW_Y(0) + NODE_H], [CX[2] - 35, GAP01], [CX[0], GAP01], [CX[0], ROW_Y(1)]], dashed: true },
    ],
  },
  {
    id: 'vlm',
    aria: 'VLM evaluation: an image set goes through a DeepSeek vision-language model, its predicted objects and scene descriptions meet human-annotated ground truth in a comparison harness, and disagreements go to error analysis.',
    nodes: [
      { id: 'img', c: 0, r: 0, data: true, lines: ['Image set'] },
      { id: 'vlm', c: 1, r: 0, lines: ['DeepSeek', 'vision-language', 'model'] },
      { id: 'prd', c: 2, r: 0, data: true, lines: ['Predicted objects', 'and scene', 'descriptions'] },
      { id: 'hum', c: 0, r: 1, data: true, lines: ['Human-annotated', 'ground truth'] },
      { id: 'cmp', c: 1, r: 1, accent: true, lines: ['Comparison', 'harness'] },
      { id: 'err', c: 1, r: 2, lines: ['Error analysis'] },
    ],
    edges: [
      { from: 'img', to: 'vlm' }, { from: 'vlm', to: 'prd' },
      { pts: [[CX[2], ROW_Y(0) + NODE_H], [CX[2], R1], [COL_X[1] + NODE_W, R1]] },
      { from: 'hum', to: 'cmp' }, { from: 'cmp', to: 'err' },
    ],
  },
  {
    id: 'malware',
    aria: 'Malware detection: 2M+ PE samples from EMBER, BODMAS and Benign-NET become PE-header and byte-level features for a LightGBM / XGBoost classifier served from a Docker endpoint at 96.2% accuracy; a separate adversarial attack suite evades other teams\' detectors.',
    nodes: [
      { id: 'd', c: 0, r: 0, data: true, lines: ['EMBER + BODMAS', '+ Benign-NET', '2M+ PE samples'] },
      { id: 'fe', c: 1, r: 0, lines: ['PE-header and', 'byte-level', 'features'] },
      { id: 'gb', c: 2, r: 0, accent: true, lines: ['LightGBM / XGBoost', 'classifier'] },
      { id: 'api', c: 2, r: 1, lines: ['Docker HTTP', 'endpoint'] },
      { id: 'atk', c: 0, r: 1, lines: ['Adversarial', 'attack suite'] },
      { id: 'oth', c: 0, r: 2, data: true, lines: ['Other teams\'', 'detectors'] },
    ],
    edges: [
      { from: 'd', to: 'fe' }, { from: 'fe', to: 'gb' }, { from: 'gb', to: 'api' },
      { from: 'atk', to: 'oth', dashed: true, label: 'evades' },
    ],
  },
  {
    id: 'chrisween',
    aria: 'Legends of Chrisween architecture: keyboard and touch input is buffered into a fixed 60 Hz step that drives the campaign simulation of heroes, companion AI and bosses. The simulation emits events that the Canvas renderer draws, that the HUD and audio respond to, and that trigger saves. The published build is encrypted with the passcode.',
    nodes: [
      { id: 'in', c: 0, r: 0, lines: ['Keyboard · touch', 'remappable'] },
      { id: 'step', c: 1, r: 0, lines: ['Fixed 60 Hz step', 'buffered inputs'] },
      { id: 'sim', c: 2, r: 0, accent: true, lines: ['Campaign simulation', 'heroes · AI · bosses'] },
      { id: 'ev', c: 2, r: 1, lines: ['Event stream', 'hits, deaths, XP'] },
      { id: 'ren', c: 1, r: 1, lines: ['Canvas renderer', 'oil-painted sprites'] },
      { id: 'hud', c: 0, r: 1, lines: ['HUD · audio', 'dialogue'] },
      { id: 'save', c: 2, r: 2, data: true, lines: ['Save v3', 'reward ledger'] },
      { id: 'vault', c: 0, r: 2, data: true, dashed: true, lines: ['Encrypted build', 'AES-GCM · passcode'] },
    ],
    edges: [
      { from: 'in', to: 'step' }, { from: 'step', to: 'sim' }, { from: 'sim', to: 'ev' },
      { from: 'ev', to: 'ren' }, { from: 'ren', to: 'hud' }, { from: 'ev', to: 'save' },
    ],
  },
];

mkdirSync(OUT, { recursive: true });
for (const s of specs) {
  writeFileSync(join(OUT, `${s.id}.svg`), build(s));
  console.log(`wrote assets/diagrams/${s.id}.svg`);
}
