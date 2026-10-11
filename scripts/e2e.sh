#!/usr/bin/env bash
# Runs the Playwright integration tests (web + desktop) inside the official
# Playwright Docker image, which bundles browsers and GUI libraries the host may lack.
#
# Usage: scripts/e2e.sh [playwright args...]
#   scripts/e2e.sh                      # build web+server, run all projects
#   scripts/e2e.sh --project web        # browser tests only
#   SKIP_BUILD=1 scripts/e2e.sh         # reuse existing dist/ output
#
# The desktop project tests the packaged app and is skipped unless
# scripts/package-desktop.sh has been run.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  npm run build
fi

PW_VERSION="$(node -p "require('./node_modules/@playwright/test/package.json').version")"

docker run --rm --init --ipc=host \
  -v "$ROOT:/repo" -w /repo \
  "mcr.microsoft.com/playwright:v${PW_VERSION}-noble" \
  xvfb-run --auto-servernum npx playwright test -c e2e/playwright.config.ts "$@"
