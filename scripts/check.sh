#!/usr/bin/env bash
# The full pre-commit gate: lockfile consistency (workspaces pin each other to an exact version, so a version bump must touch them all), Biome (format, lint, complexity), unused code (knip), typecheck, unit tests with
# coverage floors, build, browser integration tests.
#
# Usage: scripts/check.sh           # fast gate (no packaging)
#        FULL=1 scripts/check.sh    # also Docker smoke test + desktop package + desktop e2e
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

step "lockfile matches the packages (npm ci --dry-run)"; npm ci --dry-run --ignore-scripts >/dev/null
step "biome (format, lint, complexity)"; npm run lint
step "unused code and dependencies (knip)"; npm run knip
step "typecheck";          npm run typecheck
step "unit tests + coverage floors"; npm run coverage
step "build";              npm run build

if [[ "${FULL:-0}" == "1" ]]; then
  step "docker smoke";     scripts/docker-smoke.sh
  step "package desktop";  scripts/package-desktop.sh
  step "e2e (all)";        SKIP_BUILD=1 scripts/e2e.sh
else
  step "e2e (web)";        SKIP_BUILD=1 scripts/e2e.sh --project web
fi

step "all checks passed"
