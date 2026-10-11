#!/usr/bin/env bash
# Renders the SVG logo (apps/web/public/favicon.svg) to the 512px PNG used for
# the desktop app icon (apps/desktop/build/icon.png). Rerun after editing the logo.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PW_VERSION="$(node -p "require('./node_modules/@playwright/test/package.json').version")"

docker run --rm -v "$ROOT:/repo" -w /repo "mcr.microsoft.com/playwright:v${PW_VERSION}-noble" \
  node scripts/lib/render-svg.mjs apps/web/public/favicon.svg apps/desktop/build/icon.png 512
echo "Wrote apps/desktop/build/icon.png"
