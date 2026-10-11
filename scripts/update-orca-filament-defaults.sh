#!/usr/bin/env bash
# Regenerates packages/geometry/src/formats/orcaFilamentDefaults.ts: the project settings OrcaSlicer holds
# once per filament, taken from the real engine (inside a throwaway container made from the local Trident
# image). Run it when you update the Trident/OrcaSlicer version Holecraft's export is checked against,
# then run scripts/verify-orca-export.sh.
#
# Usage: scripts/update-orca-filament-defaults.sh [trident-image]     (default mugenoesis/trident:latest)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
IMAGE="${1:-mugenoesis/trident:latest}"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Trident image $IMAGE is not available here; build or pull it, or pass another image name." >&2
  exit 2
fi

OUT="$(mktemp -d)"
trap 'rm -f scripts/lib/_make-orca-sample.run.ts scripts/lib/_make-orca-defaults.run.ts; rm -rf "$OUT"' EXIT
chmod 777 "$OUT"

# The engine needs some model to export a project from.
cp scripts/lib/make-orca-sample.ts scripts/lib/_make-orca-sample.run.ts
npx tsx scripts/lib/_make-orca-sample.run.ts "$OUT" >/dev/null

for n in 1 4 16; do
  docker run --rm --entrypoint /bin/bash -v "$OUT:/files" -v "$ROOT/scripts/lib:/checks:ro" "$IMAGE" /checks/orca-reference.sh "$n" "ref$n.3mf" | grep -E "exit code|wrote"
done

cp scripts/lib/make-orca-defaults.ts scripts/lib/_make-orca-defaults.run.ts
npx tsx scripts/lib/_make-orca-defaults.run.ts "$OUT" packages/geometry/src/formats/orcaFilamentDefaults.ts
