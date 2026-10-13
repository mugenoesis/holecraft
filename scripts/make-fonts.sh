#!/usr/bin/env bash
# Rebuilds the bundled font outlines (packages/core/src/fonts/fontData.generated.ts) and the licence texts in licenses/ from the open fonts
# in node_modules (the @fontsource packages, which are dev dependencies). Only needed when a font is added or changed.
#
# Usage: scripts/make-fonts.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
node scripts/lib/make-fonts.mjs
npx biome format --write packages/core/src/fonts/fontData.generated.ts >/dev/null
echo "Wrote packages/core/src/fonts/fontData.generated.ts"
