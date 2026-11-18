# xoumyax.github.io

Personal site of Soumyajyoti Dutta, built with [Astro](https://astro.build) and deployed to GitHub Pages by GitHub Actions.

- `/`: the journey, a scroll through six stops over a pixel-art Big Bend backdrop, with every word in plain HTML.
- `/resume`, `/projects`, `/projects/<slug>`, `/teaching`, `/study`, `/personal`.
- `/CSCE-313/…`: TA course material, served byte-for-byte from `public/CSCE-313/`.
- `/Soumyajyoti_Dutta_Resume.pdf` (one page) and `/Soumyajyoti_Dutta_CV.pdf` (full CV).

## Set up

You need Node 26 (see `.nvmrc`), Python 3 and git.

```bash
./setup.sh             # .venv (Pillow, cryptography) + node_modules + Playwright's Chromium + pre-push hook
./setup.sh --node-only # skip the Python env
./setup.sh --no-hooks  # skip the pre-push hook (the flags combine, in any order)
```

Nothing is installed globally. `.venv/`, `node_modules/` and `.pw-browsers/` are git-ignored. The pre-push hook (`scripts/install-hooks.sh`, written into the common git dir, so it covers every worktree) runs `npm run test:unit` before each push, refuses to push any branch other than `main`, and refuses commits that touch `docs/superpowers/` (private design docs); it never replaces a `pre-push` hook it did not write.

## Run and test

```bash
npm run dev         # http://localhost:4321
npm run build       # → dist/
npm run test:unit   # schemas, content guards (incl. every tracked file), PDFs
npm run typecheck   # astro sync + tsc --noEmit
npm run test:e2e    # Playwright: desktop + phone
npm test            # all three
```

The e2e suite builds the site and serves it on `$PORT` (default 4321).

The pixel scenes in `public/scenes/` are regenerated with `.venv/bin/python scripts/pixel-scenes.py <path-to-album-dir>`.

## Edit content

All text lives in `src/content/` and is validated by `src/lib/schema.ts`:

| File | What it holds |
|---|---|
| `profile.yaml` | name, role, open-to-work line, education, experience, skills, publications, teaching, talks |
| `journey.yaml` | the six stops on the landing page, and which projects and items sit at each. A stop lists `items`, or instead `groups` (titled blocks of items, each with its own deck) plus an optional `more` (a closed list of small projects); `more` needs `groups`, and a stop with `groups` has no `items`. A project page's "On the journey" link goes to the stop that lists it |
| `projects/<slug>.md` | one file per project (copy `_template.md`); the file name must match `slug` |
| `study.yaml` | links on `/study` |
| `config.yaml` | the YARAikiba demo URL and its guest sign-in steps, and the resume PDF paths |

**Dark / light mode.** The site follows the device setting; the toggle in the top bar overrides it and stores `'dark'` or `'light'` in `localStorage.mode` (applied before first paint by the inline script in `src/layouts/Base.astro`). The Personal page keeps its night look and hides the toggle.

**Content guards.** `src/lib/claims.ts` enforces:

- the venue rule: only AutoPYara and IOCScooper++ may carry a `venue`;
- that "57×" always refers to the 139M generator.

It also reads a **private** list of banned phrases from outside the repo (`PORTFOLIO_PRIVATE_PATTERNS`, default `/Users/xoumyax/portfolio/private/banned-patterns.txt`). The list covers retired claims, unpublished venues and personal details. The unit tests run it over `src/content/`, the resume sources, and every tracked text file in the repo (`tests/unit/repo-guard.test.ts`); the e2e crawl runs it over every rendered page. A failure names `file:line` and the pattern number, never the text. On a workstation the tests fail if that file is missing, even when `PORTFOLIO_PRIVATE_PATTERNS` points somewhere (a typo must not skip the patterns); in CI only the structural checks run. Never commit that file or quote its contents.

The private patterns therefore run only on this machine: `npm test`, and the pre-push hook. **Edits made in GitHub's web editor (or pushed from a machine without the hook) bypass the private guard.**

## Deploy (owner's cutover)

The site deploys from `main` through `.github/workflows/deploy.yml`, which runs the unit tests and the type check, builds, and publishes `dist/` to Pages. The first time, in this order (switching the source first keeps the live site, `/CSCE-313/` included, up the whole time):

1. Run `npm test` locally. It runs the private guard and the repo-wide scan, which CI cannot run.
2. GitHub → Settings → Pages → Build and deployment → Source: **GitHub Actions**. The current deployment stays up until a new one replaces it; confirm that on that screen before going on.
3. Squash-merge `revamp` into `main`, so the intermediate commits are not published: `git checkout main && git merge --squash revamp && git commit`.
4. Push `main`.
5. If the first "Deploy to GitHub Pages" run failed, re-run it from the Actions tab (the workflow has `workflow_dispatch`).
6. Check `/`, `/CSCE-313/`, `/Soumyajyoti_Dutta_Resume.pdf`, `/#stop-phd`, and a URL that does not exist (it must show the 404 page).

Edits made in GitHub's web editor bypass the private guard: make content changes locally, where `npm test` and the pre-push hook run it.

## Licences

Third-party assets are listed in `LICENSES.md`.
