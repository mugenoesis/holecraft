#!/usr/bin/env bash
# Drives the ruler, the Workplane tool and the Edge tool in headless Chromium (software WebGL) and saves screenshots of
# the results, for looking at what the browser tests only check by numbers.
#
# Usage: scripts/tool-shots.sh <url> [out-dir] [width] [height]
#   scripts/tool-shots.sh http://127.0.0.1:8277/ test-results/tools
# The URL must be reachable from a container using host networking.
# Writes ruler.png, plane-top-marker.png, plane-top.png, plane-wall-marker.png, plane-wall-iso.png, plane-wall.png,
# edges-hover.png, edges-preview.png, edges-preview-round.png, edges-applied.png.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
URL="${1:?usage: scripts/tool-shots.sh <url> [out-dir] [width] [height]}"
OUT="${2:-test-results/tools}"
PW_VERSION="$(node -p "require('./node_modules/@playwright/test/package.json').version")"

docker run --rm --network host -v "$ROOT:/repo" -w /repo "mcr.microsoft.com/playwright:v${PW_VERSION}-noble" \
  node scripts/lib/tool-shots.mjs "$URL" "$OUT" "${3:-1280}" "${4:-800}"
echo "Wrote screenshots to $OUT"
