#!/usr/bin/env bash
# Dependency vulnerability audit.
#   1. What ships (the web app, server and desktop runtime): must have NO known vulnerabilities, or this fails.
#   2. Everything, build tools included: reported for information, never fails (a build-time tool such as
#      electron-builder cannot reach a user's machine; review these when updating dependencies).
# Needs network access to the npm registry.
#
# Usage: scripts/audit.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

printf '\n\033[1m== shipped dependencies (must be clean) ==\033[0m\n'
npm audit --omit=dev --audit-level=low
shipped=$?

printf '\n\033[1m== everything, including build tools (for information) ==\033[0m\n'
npm audit || true

exit "$shipped"
