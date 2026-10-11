#!/bin/bash
# Runs inside the Trident image. Loads a file with the real OrcaSlicer engine and re-exports it as an
# OrcaSlicer project (which carries the per-object filaments and the filament list back out), then
# shows what Trident's reader finds in the file before and after.
# Usage: orca-engine-check.sh <file in /files> <output name in /files>
set -u
INPUT="/files/$1"
OUTPUT="$2"
mkdir -p /tmp/orcadata /tmp/out
cd /tmp
echo "before the engine:"
(cd /opt/api && /opt/api/.venv/bin/python /checks/inspect-3mf.py "$INPUT")
timeout 180 /opt/orcaslicer/orca-slicer --datadir /tmp/orcadata --outputdir /tmp/out --allow-newer-file=1 \
  --export-3mf "$OUTPUT" "$INPUT" > /tmp/out/engine.log 2>&1
code=$?
echo "engine exit code: $code"
if [ -f "/tmp/out/$OUTPUT" ]; then
  cp "/tmp/out/$OUTPUT" "/files/$OUTPUT"
  echo "after the engine (its own project export):"
  (cd /opt/api && /opt/api/.venv/bin/python /checks/inspect-3mf.py "/files/$OUTPUT")
else
  echo "the engine wrote no project file"
  tail -3 /tmp/out/engine.log
fi
exit 0
