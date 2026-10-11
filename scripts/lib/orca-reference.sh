#!/bin/bash
# Runs inside the Trident image. Asks the real OrcaSlicer engine for projects with N filaments (the
# same generic PLA preset repeated), so we can see exactly which project settings are per-filament lists.
# Usage: orca-reference.sh <N> <output name in /files>
set -u
N="$1"
OUTPUT="$2"
mkdir -p /tmp/orcadata /tmp/out
cd /tmp
FILAMENT="$(find /opt/orcaslicer/resources/profiles -iname 'Generic PLA.json' | head -1)"
echo "using filament preset: $FILAMENT"
LIST=""
for i in $(seq 1 "$N"); do LIST="$LIST${LIST:+;}$FILAMENT"; done
timeout 300 /opt/orcaslicer/orca-slicer --datadir /tmp/orcadata --outputdir /tmp/out --allow-newer-file=1 \
  --load-filaments "$LIST" --export-3mf "$OUTPUT" /files/plain.3mf > /tmp/out/engine.log 2>&1
echo "engine exit code: $?"
tail -3 /tmp/out/engine.log
[ -f "/tmp/out/$OUTPUT" ] && cp "/tmp/out/$OUTPUT" "/files/$OUTPUT" && echo "wrote $OUTPUT"
exit 0
