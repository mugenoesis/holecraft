#!/usr/bin/env bash
# Regenerates the app icons from the cube mark cropped out of branding/logo.jpg:
#   branding/logo-mark.png            512px mark (source for the others)
#   apps/web/public/icon-192.png      browser tab / top bar
#   apps/desktop/build/icon.png       512px desktop app icon
# Rerun after replacing branding/logo.jpg. If you have a transparent SVG/PNG of the
# mark, drop it in as branding/logo-mark.png and run with CROP=0.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PW_VERSION="$(node -p "require('./node_modules/@playwright/test/package.json').version")"
run() { docker run --rm -v "$ROOT:/repo" -w /repo "mcr.microsoft.com/playwright:v${PW_VERSION}-noble" "$@"; }

if [[ "${CROP:-1}" == "1" ]]; then
  # Square around the cube (x 486-926, y 96-536 of the 1376x768 logo), above the wordmark.
  run node scripts/lib/crop-image.mjs branding/logo.jpg branding/logo-mark.png 486 96 440 440 512
fi
run node scripts/lib/crop-image.mjs branding/logo-mark.png apps/web/public/icon-192.png 0 0 512 512 192
cp branding/logo-mark.png apps/desktop/build/icon.png
echo "Wrote branding/logo-mark.png, apps/web/public/icon-192.png, apps/desktop/build/icon.png"
