#!/usr/bin/env bash
# Builds a model written in code (see models/README.md), measures the real geometry the way an export would
# (holes cut, groups joined: size, volume, closed surface) and saves it as a design on a running Holecraft.
#
# Usage: scripts/model.sh build <models/thing.ts> [--dry] [--id <design id>] [--shot] [--view iso|top|front|...] [--out <dir>]
#   --dry    build and measure only: nothing is saved (the STL is still written)
#   --id     rebuild over an existing design (the server keeps the earlier version in its history)
#   --shot   afterwards take a picture of the saved design (Docker; also makes the designs-list thumbnail)
# Env: HOLECRAFT_API (default http://127.0.0.1:8200, where this script talks to the server)
#      HOLECRAFT_PUBLIC_URL (default: HOLECRAFT_API; the address put in the links it prints, for when
#      a phone or another machine opens Holecraft by a different address)
# Exit status: 0 fine, 1 built but with warnings (read them), 2 failed.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
exec npx tsx scripts/lib/model.ts "$@"
