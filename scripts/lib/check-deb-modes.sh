#!/usr/bin/env bash
# Fails if a .deb holds a file or directory that other users cannot read (or enter): the package would install, but only
# root could run the app. 0.5.0 shipped /opt/Holecraft root-only. Prints each offender and exits 1.
#
# Usage: scripts/lib/check-deb-modes.sh path/to/Holecraft.deb
#
# Reads the listing with dpkg-deb, or in the Debian container package-desktop.sh uses when the host has none (Unraid).
set -euo pipefail

DEB="${1:?usage: check-deb-modes.sh path/to/package.deb}"
[[ -f "$DEB" ]] || { echo "No such file: $DEB" >&2; exit 1; }

if command -v dpkg-deb >/dev/null 2>&1; then
  listing="$(dpkg-deb -c "$DEB")"
else
  listing="$(docker run --rm -v "$(cd "$(dirname "$DEB")" && pwd):/pkg:ro" node:22-bookworm dpkg-deb -c "/pkg/$(basename "$DEB")")"
fi

# Columns: mode, owner/group, size, date, time, name. The mode's last three characters are "other": it needs r, and a directory x.
# The "./" entry is the package root; dpkg leaves / alone.
unreadable="$(awk '$6 != "./" && (substr($1, 8, 1) != "r" || (substr($1, 1, 1) == "d" && substr($1, 10, 1) != "x")) { print $1, $6 }' <<<"$listing")"

if [[ -n "$unreadable" ]]; then
  echo "$(basename "$DEB") has files other users cannot read:" >&2
  echo "$unreadable" | head -20 >&2
  [[ "$(wc -l <<<"$unreadable")" -le 20 ]] || echo "...and $(($(wc -l <<<"$unreadable") - 20)) more" >&2
  echo "Package with a umask of 022 and world-readable sources (scripts/package-desktop.sh does both)." >&2
  exit 1
fi
echo "$(basename "$DEB"): every file is readable by other users"
