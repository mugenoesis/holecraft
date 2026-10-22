#!/usr/bin/env bash
# Builds the Firefox add-on (apps/addon): the files the browser loads go to apps/addon/dist/, and the zip to upload to addons.mozilla.org (to have it
# signed) goes to apps/addon/release/holecraft-send-<version>.zip. To try it without signing, open about:debugging in Firefox on a computer, choose
# "This Firefox", then "Load Temporary Add-on" and pick apps/addon/dist/manifest.json (it lasts until the browser is closed).
#
# Usage: scripts/package-addon.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
npm run build --workspace @holecraft/addon
