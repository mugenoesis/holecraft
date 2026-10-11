#!/usr/bin/env bash
# Takes a screenshot of a running holecraft instance with headless Chromium
# (software WebGL), for visually checking UI changes.
#
# Usage: scripts/screenshot.sh <url> [out.png] [width] [height]
#   scripts/screenshot.sh http://127.0.0.1:8080/ test-results/shot.png
# The URL must be reachable from a container using host networking.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
URL="${1:?usage: scripts/screenshot.sh <url> [out.png] [width] [height]}"
OUT="${2:-test-results/screenshot.png}"
mkdir -p "$(dirname "$OUT")"
PW_VERSION="$(node -p "require('./node_modules/@playwright/test/package.json').version")"

docker run --rm --network host -v "$ROOT:/repo" -w /repo "mcr.microsoft.com/playwright:v${PW_VERSION}-noble" \
  node scripts/lib/screenshot.mjs "$URL" "$OUT" "${3:-1280}" "${4:-800}"
echo "Wrote $OUT"
