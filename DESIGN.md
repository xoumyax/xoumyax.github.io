# Design

The visual system of soumyajyoti-portfolio: a sunny, low-poly road-trip world wrapped around a warm, readable resume. Tokens live in `css/style.css` (`:root`); the 3D palette lives in `js/world.js` (`COLOR`).

## Theme

Daylight, always. The page is the sky over the world: a light blue-tinted paper, never dark mode, never hacker-terminal. Warmth comes from the coral car and sunset accents, not from a cream background.

## Color

| Token | Value | Role |
|---|---|---|
| `--bg` | `oklch(0.972 0.012 225)` | page background, tinted toward the sky |
| `--ink` | `oklch(0.3 0.035 240)` | text, deep blue-slate |
| `--muted` | `oklch(0.48 0.035 235)` | secondary text |
| `--brand` | `oklch(0.55 0.155 38)` | CTAs, links — the car's coral, darkened for contrast |
| `--brand-bright` | `oklch(0.68 0.175 36)` | the car itself, bullets, playful accents |
| `--go` | `oklch(0.52 0.12 160)` | "open to work" green, visited-zone chips |
| `--sun` | `oklch(0.88 0.09 85)` | award badges only |

World palette (hex, in `world.js`): grass `#8fcb7a`/`#6fb35f`, sand `#eed9a2`, path `#dfc28a`, water `#5fb6d9`, rock `#9aa7b0`, car body `#e96842`, car roof `#f6ede0`.

Strategy: **Full palette** — the 3D world carries most of the color; the UI chrome stays quiet (white surfaces, one coral accent, one green status color) so the world reads as the hero.

## Typography

- **Display**: Baloo 2 (600/700/800) — headings, buttons, chips, tags. Rounded and warm; the adventure-game voice.
- **Body**: Nunito Sans (400/700/800) — body text at 1.0625rem/1.65.
- Headings use fluid `clamp()`; body is fixed. `text-wrap: balance` on headings.
- Section headings open with a thematic emoji (🧭 🏔️ 🌲 📄 🎓) — that's the wayfinding system; no eyebrow labels.

## Shape & depth

- Radius: 16px surfaces, pill (999px) for every button/chip/tag.
- Shadows: two levels (`--shadow-md`, `--shadow-lg`), soft and blue-tinted. The world shell gets the large one.
- Borders: 1px `--line` on cards; the drive-invite uses a 2px dashed coral border (map/route motif — used exactly once).

## Motion

- Ease: `--ease-out` (`cubic-bezier(0.22,1,0.36,1)`); no bounce.
- The signature motion is the drive itself; UI motion is minimal (button press scale, card hover lift, pulsing "open to work" dot).
- Confetti only on full completion. Everything respects `prefers-reduced-motion`.

## Components

- **Buttons**: `.btn` pill, min-height 44px; `.btn-primary` coral/white, `.btn-outline` bordered.
- **Zone card** (`.zone-card`): white panel, bottom-right on desktop, bottom-center sheet on mobile; emoji + title, tagline, coral-dot bullets, pill tags, one full-width primary action.
- **HUD chips** (`.hud-chip`): translucent white pills; visited = solid green with the zone name revealed (unvisited show "?").
- **Project cards** (`.proj`): auto-fit grid `minmax(280px,1fr)`, hover lifts 3px; award badge in `--sun`.
- **Experience rows** (`.xp`): mono-free date column left, content right; collapses to stacked on mobile.

## The world (js/world.js)

Procedural low-poly only — no model files. Flat-shaded Lambert materials, vertex-colored terrain (grass→rock by height, sand near water, tan trails), instanced trees/rocks, one hemisphere + one warm sun + one cool fill light, fog matched to the sky color. Signposts are canvas-textured boards, readable from both sides, placed beside the road (never on the arrival corridor — same rule for buildings). Camera is a smoothed chase cam. Pixel ratio capped at 2.
