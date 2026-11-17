#!/usr/bin/env bash
# Installs the repo's pre-push hook: `npm run test:unit` (the private claims guard, the
# repo-wide scan of every tracked file, schemas, PDFs) must pass before anything is pushed.
# Hooks live in the common git dir, so one install covers the main checkout and every worktree.
# Idempotent. A pre-push hook that this script did not write is left alone (with a warning).
# Usage: scripts/install-hooks.sh [repo-dir]   (setup.sh runs it; skip with ./setup.sh --no-hooks)
set -euo pipefail
cd "${1:-$(dirname "$0")/..}"

MARK='# portfolio-guard-hook v3'
HOOKS="$(git rev-parse --path-format=absolute --git-path hooks)"
HOOK="$HOOKS/pre-push"
mkdir -p "$HOOKS"

if [[ -e "$HOOK" ]] && ! grep -qF "# portfolio-guard-hook" "$HOOK"; then
  echo "install-hooks: $HOOK exists and was not written by this repo; left as is." >&2
  echo "install-hooks: add 'npm run test:unit' to it yourself to guard pushes." >&2
  exit 0
fi

cat > "$HOOK.tmp" <<EOF
#!/bin/sh
$MARK (written by scripts/install-hooks.sh; re-run it to update)
# The private claims guard runs only on this machine (CI has no pattern file), so it runs here,
# before every push. Edits made in GitHub's web editor bypass it.
# Only main may be pushed, and never a commit that touches docs/superpowers/ (the private design
# docs, untracked since 2026-11-16 but still in the history of the working branch). The cutover is a
# squash-merge into main, so main's new commits never carry them.
z40=0000000000000000000000000000000000000000
while read -r lref lsha rref rsha; do
  [ -z "\$rref" ] && continue
  if [ "\$rref" != "refs/heads/main" ]; then
    echo "pre-push: refusing to push \$rref: only main is published (squash-merge your branch into main)." >&2
    exit 1
  fi
  [ "\$lsha" = "\$z40" ] && continue
  if [ "\$rsha" = "\$z40" ]; then range="\$lsha --not --remotes"; else range="\$rsha..\$lsha"; fi
  if git log --format= --name-only \$range -- docs/superpowers | grep -q .; then
    echo "pre-push: refusing: commits being pushed touch docs/superpowers/ (private design docs)." >&2
    exit 1
  fi
done
cd "\$(git rev-parse --show-toplevel)" || exit 1
# git exports GIT_DIR and friends to hooks: drop them, so the tests (which create scratch repos)
# can never act on this repository
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
echo "pre-push: npm run test:unit (claims guard + repo-wide scan)" >&2
npm run --silent test:unit
EOF
chmod +x "$HOOK.tmp"
mv "$HOOK.tmp" "$HOOK"
echo "install-hooks: pre-push hook installed at $HOOK"
