#!/usr/bin/env bash
# Writes sample STL, OBJ and 3MF files with Holecraft's real export code, then loads them with an
# independent library (trimesh, in a Python container) and checks they are watertight, consistently
# wound and the right size. Run it after changing anything in packages/geometry/src/formats.
#
# Usage: scripts/verify-exports.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

# tsx runs the TypeScript directly; the script must live inside the repo to resolve workspace packages.
cp scripts/lib/make-sample-exports.ts scripts/lib/_make-sample-exports.run.ts
trap 'rm -f scripts/lib/_make-sample-exports.run.ts; rm -rf "$OUT"' EXIT
npx tsx scripts/lib/_make-sample-exports.run.ts "$OUT"

docker run --rm -v "$OUT:/files" -v "$ROOT/scripts/lib:/scripts:ro" python:3.12-slim \
  sh -c "pip install -q trimesh numpy lxml networkx scipy >/dev/null 2>&1 && python /scripts/verify-exports.py /files"
