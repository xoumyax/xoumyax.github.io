// Single source of card content for the drive. Positions live in world.js.

export const ZONES = [
  {
    id: 'trailhead',
    emoji: '🚩',
    title: 'Trailhead',
    tagline: 'Welcome! You found the start of the road.',
    points: [
      'I\'m <strong>Soumyajyoti Dutta</strong> — PhD student at Texas A&M, ML engineer, and your tour guide today.',
      '<strong>Keep scrolling</strong> and the car drives itself. Seven signposted stops between here and the mailbox.',
      'In a hurry? Everything here is also written down — take the <em>“skip the drive”</em> exit any time.',
    ],
    tags: ['7 stops', 'no fuel needed', 'scroll-powered'],
  },
  {
    id: 'ridge',
    emoji: '🏔️',
    title: 'Research Ridge',
    tagline: 'PhD research: LLMs that write malware-detection rules.',
    points: [
      '<strong>YaraGen</strong> (Booz Allen Hamilton–sponsored, <strong>USENIX Security 2026</strong> in prep): an end-to-end LLM system for automated YARA rule generation — a <strong>20-tool agent dispatcher</strong>, 4-layer query router, and anti-hallucination RAG.',
      'Designed <strong>YaraAST</strong>, an AST-aware tokenizer with <strong>10× token reduction</strong>; post-trained models to <strong>≥99% syntax / ≥95% logical validity</strong> on 22,655 held-out rules.',
      '<strong>AutoPYara</strong> (ACSAC 2026, open-sourced on PyPI): beat the AutoYara SOTA by <strong>+14% coverage</strong>, <strong>+10% accuracy</strong>, <strong>+8% generalization</strong>.',
      'Built <em>Brownie & Puff</em>, a reward/eval function used as both training signal and quality gate across <strong>10+ LLM families, 150+ runs</strong>.',
    ],
    tags: ['LLMs', 'cyberdefense', 'USENIX \'26', 'ACSAC \'26'],
  },
  {
    id: 'grounds',
    emoji: '🖥️',
    title: 'Training Grounds',
    tagline: 'LLM post-training, alignment, and the clusters that run it.',
    points: [
      'Curriculum-based post-training across <strong>140M–9B-param</strong> families (BART, T5, Gemma 3, LLaMA 3.x, Nemotron, sparse-MoE) on <strong>multi-node SLURM</strong> clusters with DeepSpeed, FSDP, and CUDA.',
      '<strong>Proactive Research Agent</strong>: taught a deep-research agent to pause on underspecified queries and ask first — a 4-stage SFT curriculum lifting <strong>pause-detection F1 0.168 → 0.573</strong>.',
      'Trained a ~9B sparse-MoE (Gemma-4-E4B) on a <strong>single 80GB GPU</strong> using vLLM with multi-turn KV reuse and rank-stabilized LoRA.',
      'Datasets at scale: a three-source framework with <strong>100M+ labeled examples</strong>, including 305K crawled real-world rules.',
    ],
    tags: ['post-training', 'DeepSpeed / FSDP', 'vLLM', 'agents'],
  },
  {
    id: 'park',
    emoji: '🌲',
    title: 'Project Park',
    tagline: 'Things I built because I wanted them to exist.',
    points: [
      '<strong>ML Malware Detection</strong> — <strong>1st place</strong>, CSCE 689 ML-Based Cyberdefenses competition: a Windows PE classifier over <strong>2M+ samples</strong> at <strong>96.2% accuracy / 0.97 F1</strong>, plus the best-performing adversarial evasion suite.',
      '<strong>Sturdy Fishstick</strong> — a self-hosted job &amp; PhD search platform scoring listings with <strong>fully on-device local LLMs</strong> (FastAPI, React, Ollama, ATS APIs, FTS5-grounded RAG chat).',
      '<strong>Multiperspective Hawkeye</strong> — the ISCA\'16 cache-replacement policy implemented in zsim, extended with PC-tracking.',
      '<strong>HelloPentagon</strong> — explainable ML malware-defense chatbot; and <strong>Carotid USG Analysis</strong> — CNN ultrasound classification, published as a <strong>Springer chapter (2022)</strong>.',
    ],
    tags: ['1st place 🏆', 'local LLMs', 'systems', 'Springer'],
  },
  {
    id: 'district',
    emoji: '🏢',
    title: 'Industry District',
    tagline: 'Shipping software for a Fortune 500, before the PhD.',
    points: [
      '<strong>Cognizant Technology Solutions</strong> (2021–2022), client-embedded consultant for <strong>TJX Companies</strong>: delivered a logistics-automation platform with client engineering and product stakeholders.',
      'Optimized <strong>REST endpoints</strong> for latency and concurrency; maintained <strong>CI/CD</strong> and led code review across cross-functional teams.',
    ],
    tags: ['Fortune 500 client', 'full-stack', 'CI/CD'],
  },
  {
    id: 'campus',
    emoji: '🎓',
    title: 'Campus Quad',
    tagline: 'Degrees earned, students taught.',
    points: [
      '<strong>Ph.D. Computer Science</strong>, Texas A&M (2024–present) — advisor Dr. Marcus Botacin. <strong>M.S. Computer Engineering</strong>, Texas A&M (2022–2023). <strong>B.Tech. ECE</strong>, SRM University (2017–2021).',
      '<strong>TA, CSCE 439/704 Data Analytics for Cybersecurity</strong> (Spring 2026): designing assignments and mentoring student projects.',
      '<strong>TAMU CS Day</strong> (2024, 2025): hands-on AI &amp; cybersecurity demos for high-schoolers. <strong>TA, ECEN 325 Electronics</strong> (Spring 2023). Technical coordinator, <strong>Student Research Week</strong> (2023).',
    ],
    tags: ['Texas A&M', 'teaching', 'outreach'],
  },
  {
    id: 'cove',
    emoji: '📮',
    title: 'Mailbox Cove',
    tagline: 'The most important stop on the map.',
    points: [
      'I\'m <strong>open to work</strong> — ML engineering, research, and applied-science roles.',
      'The fastest route to me is email: <a href="mailto:soumyajyotidutta23@gmail.com"><strong>soumyajyotidutta23@gmail.com</strong></a>.',
      'Also parked at <a href="https://github.com/xoumyax" target="_blank" rel="noopener">github.com/xoumyax</a> and <a href="https://www.linkedin.com/in/soumyajyotidutta/" target="_blank" rel="noopener">linkedin.com/in/soumyajyotidutta</a>.',
    ],
    tags: ['open to work', 'say hi'],
  },
];

export const ZONE_BY_ID = Object.fromEntries(ZONES.map(z => [z.id, z]));
