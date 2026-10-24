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

# What goes into the packages keeps the modes it has here, and the .deb installs them as they are: with a restrictive umask
# (007, 027) or checkout, /opt/Holecraft came out root-only and nobody else could start the app (0.5.0). The app's own folder is
# fixed by the afterPack hook (apps/desktop/src/afterPack.ts); this covers the icon that is copied in, and what LOCAL=1 creates.
umask 022
chmod -R a+rX apps/desktop/build

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
