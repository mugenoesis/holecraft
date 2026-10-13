#!/usr/bin/env bash
# Proves the "3MF for OrcaSlicer" export is read correctly by OrcaSlicer's own ecosystem. It writes
# three-colour samples (a four-colour and a sixteen-colour palette) with the real export code, then, in
# throwaway containers made from the local Trident image (which bundles OrcaSlicer's engine), checks that:
#   1. Trident's own 3MF reader sees every object with the right filament and the whole palette;
#   2. the real OrcaSlicer engine loads the file WITHOUT crashing (an inconsistent file segfaults it),
#      and the project it writes back out still has every object's filament and every palette colour.
# Nothing running is touched: the containers are `docker run --rm`.
#
# Usage: scripts/verify-orca-export.sh [trident-image]     (default mugenoesis/trident:latest)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
IMAGE="${1:-mugenoesis/trident:latest}"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Trident image $IMAGE is not available here; build or pull it, or pass another image name." >&2
  exit 2
fi

OUT="$(mktemp -d)"
trap 'rm -f scripts/lib/_make-orca-sample.run.ts; rm -rf "$OUT"' EXIT
chmod 777 "$OUT"

cp scripts/lib/make-orca-sample.ts scripts/lib/_make-orca-sample.run.ts
npx tsx scripts/lib/_make-orca-sample.run.ts "$OUT"

python_in_image() {
  docker run --rm --entrypoint /opt/api/.venv/bin/python -v "$OUT:/files:ro" -v "$ROOT/scripts/lib:/checks:ro" -w /opt/api "$IMAGE" "$@"
}

for sample in "orca.3mf 4" "orca16.3mf 16"; do
  set -- $sample
  file="$1"; colours="$2"
  echo "== $file ($colours colours) =="
  echo "Trident's reader:"
  python_in_image /checks/verify-orca-export.py "/files/$file" "$colours"

  echo "the OrcaSlicer engine:"
  docker run --rm --entrypoint /bin/bash -v "$OUT:/files" -v "$ROOT/scripts/lib:/checks:ro" "$IMAGE" /checks/orca-engine-check.sh "$file" "engine-$file" | grep -E "engine exit|wrote no"
  if [ ! -f "$OUT/engine-$file" ]; then
    echo "FAIL: the OrcaSlicer engine could not load $file (see scripts/lib/orca-engine-check.sh)" >&2
    exit 1
  fi
  echo "what the engine kept:"
  python_in_image /checks/verify-orca-export.py "/files/engine-$file" "$colours" filaments-only
done
echo "== paint.3mf (a box with its top face painted in filament 2) =="
echo "what we wrote:"
python_in_image /checks/verify-orca-paint.py /files/paint.3mf 2 2
echo "the OrcaSlicer engine:"
docker run --rm --entrypoint /bin/bash -v "$OUT:/files" -v "$ROOT/scripts/lib:/checks:ro" "$IMAGE" /checks/orca-engine-check.sh paint.3mf engine-paint.3mf | grep -E "engine exit|wrote no"
if [ ! -f "$OUT/engine-paint.3mf" ]; then
  echo "FAIL: the OrcaSlicer engine could not load paint.3mf" >&2
  exit 1
fi
echo "what the engine kept:"
python_in_image /checks/verify-orca-paint.py /files/engine-paint.3mf 2 2
echo "== brush.3mf (a round brush dab, the surface cut finer under it, in filament 2) =="
PAINTED="$(cat "$OUT/brush.count")"
echo "what we wrote ($PAINTED painted triangles):"
python_in_image /checks/verify-orca-paint.py /files/brush.3mf "$PAINTED" 2
echo "the OrcaSlicer engine:"
docker run --rm --entrypoint /bin/bash -v "$OUT:/files" -v "$ROOT/scripts/lib:/checks:ro" "$IMAGE" /checks/orca-engine-check.sh brush.3mf engine-brush.3mf | grep -E "engine exit|wrote no"
if [ ! -f "$OUT/engine-brush.3mf" ]; then
  echo "FAIL: the OrcaSlicer engine could not load brush.3mf" >&2
  exit 1
fi
echo "what the engine kept:"
python_in_image /checks/verify-orca-paint.py /files/engine-brush.3mf "$PAINTED" 2
echo "== band.3mf (a height range band round the walls, the surface cut straight along it, in filament 2) =="
PAINTED="$(cat "$OUT/band.count")"
echo "what we wrote ($PAINTED painted triangles):"
python_in_image /checks/verify-orca-paint.py /files/band.3mf "$PAINTED" 2
echo "the OrcaSlicer engine:"
docker run --rm --entrypoint /bin/bash -v "$OUT:/files" -v "$ROOT/scripts/lib:/checks:ro" "$IMAGE" /checks/orca-engine-check.sh band.3mf engine-band.3mf | grep -E "engine exit|wrote no"
if [ ! -f "$OUT/engine-band.3mf" ]; then
  echo "FAIL: the OrcaSlicer engine could not load band.3mf" >&2
  exit 1
fi
echo "what the engine kept:"
python_in_image /checks/verify-orca-paint.py /files/engine-band.3mf "$PAINTED" 2
echo "OK: OrcaSlicer's engine loads the export and keeps every object's filament, the whole palette and the painted faces"
