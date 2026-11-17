#!/usr/bin/env bash
# Idempotent project setup. Usage: ./setup.sh [--node-only] [--no-hooks]
#   --node-only  skip the Python env
#   --no-hooks   do not install the pre-push hook (scripts/install-hooks.sh)
set -euo pipefail
cd "$(dirname "$0")"

NODE_ONLY=0 HOOKS=1
for arg in "$@"; do
  case "$arg" in
    --node-only) NODE_ONLY=1 ;;
    --no-hooks) HOOKS=0 ;;
    *) echo "setup.sh: unknown option $arg (use --node-only, --no-hooks)" >&2; exit 2 ;;
  esac
done

if [[ $NODE_ONLY == 0 ]]; then
  [[ -d .venv ]] || python3 -m venv .venv
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet -r requirements.txt
fi

npm ci --no-audit --no-fund

# One Playwright browser copy shared by the main checkout and every worktree.
MAIN_ROOT="$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
export PLAYWRIGHT_BROWSERS_PATH="${PW_BROWSERS:-$MAIN_ROOT/.pw-browsers}"
npx playwright install chromium

# The private claims guard runs before every push (CI cannot run it: no pattern file there).
if [[ $HOOKS == 1 ]]; then scripts/install-hooks.sh; else echo "setup: pre-push hook skipped (--no-hooks)"; fi
echo "setup done (browsers: $PLAYWRIGHT_BROWSERS_PATH)"
