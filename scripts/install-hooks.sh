#!/usr/bin/env bash
# Points git at the tracked hooks in .githooks/ (pre-commit: fast gate; pre-push: scripts/check.sh).
# Stands in for the GitHub Actions CI while it is unavailable. Run once per clone.
#
# Usage: scripts/install-hooks.sh            # install
#        scripts/install-hooks.sh --remove   # go back to git's default hooks
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" == "--remove" ]]; then
  git config --unset core.hooksPath || true
  echo "Hooks removed"
else
  chmod +x .githooks/*
  git config core.hooksPath .githooks
  echo "Hooks installed: pre-commit (lint, knip, typecheck, tests), pre-push (scripts/check.sh)"
fi
