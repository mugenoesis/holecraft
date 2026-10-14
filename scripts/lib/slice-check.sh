#!/usr/bin/env bash
# Slices a 3MF through a throwaway Trident container (the same path Trident's web page uses) on the four-nozzle
# Snapmaker U1 with one filament profile per palette colour, and fails unless the slice succeeds. Loading a file
# is not enough: a file can load and still kill the engine when sliced (filament_self_index all "1").
# Usage: slice-check.sh <trident-image> <file.3mf> <filament-count>
set -euo pipefail
IMAGE="$1"; FILE="$2"; COUNT="$3"
NAME="holecraft-slice-check-$$"
PORT="${SLICE_CHECK_PORT:-18090}"
DATA="$(mktemp -d)"; chmod 777 "$DATA"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

docker run -d --rm --name "$NAME" -p "$PORT:8000" -v "$DATA:/data" "$IMAGE" serve >/dev/null
for _ in $(seq 1 40); do curl -fs "http://127.0.0.1:$PORT/auth/status" >/dev/null && break; sleep 1; done

json() { node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log($1)"; }
MODEL="$(curl -fs -F "file=@$FILE" "http://127.0.0.1:$PORT/models" | json 'j.model_id')"
FILAMENT="Snapmaker PLA Basic @U1"
REQUEST="$(node -e "
const n=$COUNT, f='$FILAMENT';
console.log(JSON.stringify({model_id:'$MODEL',printer_profile:'Snapmaker U1 (0.4 nozzle)',
  process_profile:'0.20 Standard @Snapmaker U1 (0.4 nozzle)',filament_profiles:Array(n).fill(f),
  setting_overrides:{nozzle_diameter:Array(4).fill('0.4').join(','),nozzle_type:Array(4).fill('hardened_steel').join(',')}}))")"
JOB="$(curl -fs -H 'content-type: application/json' -d "$REQUEST" "http://127.0.0.1:$PORT/jobs" | json 'j.id')"

STATUS=""; RECORD="{}"
for _ in $(seq 1 90); do
  RECORD="$(curl -fs "http://127.0.0.1:$PORT/jobs/$JOB")"
  STATUS="$(echo "$RECORD" | json 'j.status')"
  [[ "$STATUS" == "succeeded" || "$STATUS" == "failed" ]] && break
  sleep 2
done
if [[ "$STATUS" != "succeeded" ]]; then
  echo "FAIL: slicing $(basename "$FILE") with $COUNT filaments: $STATUS $(echo "$RECORD" | json "j.error")" >&2
  exit 1
fi
echo "sliced $(basename "$FILE") with $COUNT filaments"
