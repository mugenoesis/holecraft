#!/usr/bin/env bash
# Builds the Linux desktop packages (AppImage + .deb) into apps/desktop/release/.
#
# Packaging runs inside node:22-bookworm so it works on hosts without the
# Debian tooling electron-builder needs (e.g. `ar` for .deb on Unraid).
#
# Usage: scripts/package-desktop.sh            # build then package
#        SKIP_BUILD=1 scripts/package-desktop.sh
#        LOCAL=1 scripts/package-desktop.sh    # package on the host instead of Docker
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  npm run build:desktop
fi

if [[ "${LOCAL:-0}" == "1" ]]; then
  npm run dist --workspace @holecraft/desktop
else
  docker run --rm -v "$ROOT:/repo" -w /repo/apps/desktop node:22-bookworm \
    npx electron-builder --linux AppImage deb
fi

ls -lh apps/desktop/release/*.AppImage apps/desktop/release/*.deb
