#!/usr/bin/env bash
# Builds the Linux desktop packages (AppImage + .deb) for the release, checks them, writes their checksums, and
# (with UPLOAD=1) attaches them to the GitHub release for this version.
#
# Usage: scripts/release-desktop.sh              # build + check, leaves the files and SHA256SUMS.txt in apps/desktop/release/
#        UPLOAD=1 scripts/release-desktop.sh     # ...and attach them to the GitHub release v<version> (it must exist: gh release create)
#        SKIP_BUILD=1 scripts/release-desktop.sh # use the packages already built in apps/desktop/release/
#
# - The version is the one in package.json, and the working tree must be clean and on a commit that is on
#   origin/main, so what is attached is exactly what was merged. Packaging runs in a Debian container
#   (scripts/package-desktop.sh), so it works on this server.
# - The packages are built from the working tree, so a stale file there is replaced, never reused by accident:
#   the old release folder is emptied first.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "package.json version '$VERSION' is not x.y.z" >&2; exit 1; }
TAG="v$VERSION"
OUT="apps/desktop/release"
APPIMAGE="$OUT/Holecraft-$VERSION-x86_64.AppImage"
DEB="$OUT/Holecraft-$VERSION-amd64.deb"

[[ -z "$(git status --porcelain)" ]] || { echo "The working tree is not clean; commit or stash first." >&2; exit 1; }
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' fetch --quiet origin main
git merge-base --is-ancestor HEAD origin/main || { echo "HEAD is not on origin/main; check out the merged commit." >&2; exit 1; }
if [[ "${UPLOAD:-0}" == "1" ]]; then
  gh release view "$TAG" >/dev/null 2>&1 || { echo "There is no GitHub release $TAG yet: create it first (gh release create $TAG)." >&2; exit 1; }
fi

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "Building the desktop packages for $VERSION from $(git rev-parse --short HEAD)"
  rm -rf "$OUT"
  scripts/package-desktop.sh
fi

# A package that built for another version, or is not the kind of file it claims to be, must not be attached.
for file in "$APPIMAGE" "$DEB"; do
  [[ -s "$file" ]] || { echo "Missing or empty: $file" >&2; exit 1; }
done
[[ "$(head -c 4 "$APPIMAGE" | od -An -tx1 | tr -d ' \n')" == "7f454c46" ]] || { echo "$APPIMAGE is not an executable (no ELF header)" >&2; exit 1; }
[[ "$(head -c 7 "$DEB")" == '!<arch>' ]] || { echo "$DEB is not a .deb (no ar header)" >&2; exit 1; }
[[ -x "$APPIMAGE" ]] || chmod +x "$APPIMAGE"
# A .deb whose files only root can read installs fine and then cannot be started by anyone else (0.5.0).
scripts/lib/check-deb-modes.sh "$DEB"

(cd "$OUT" && sha256sum "$(basename "$APPIMAGE")" "$(basename "$DEB")" > SHA256SUMS.txt && cat SHA256SUMS.txt)

if [[ "${UPLOAD:-0}" == "1" ]]; then
  # Replace by hand rather than with --clobber: gh uploads the files side by side, and clobbering them together can leave only the smallest one.
  for file in "$APPIMAGE" "$DEB" "$OUT/SHA256SUMS.txt"; do
    gh release delete-asset "$TAG" "$(basename "$file")" --yes >/dev/null 2>&1 || true
  done
  gh release upload "$TAG" "$APPIMAGE" "$DEB" "$OUT/SHA256SUMS.txt"
  for file in "$APPIMAGE" "$DEB" "$OUT/SHA256SUMS.txt"; do
    state="$(gh release view "$TAG" --json assets --jq ".assets[] | select(.name == \"$(basename "$file")\") | .state")"
    [[ "$state" == "uploaded" ]] || { echo "$(basename "$file") is not on release $TAG (state: '$state')" >&2; exit 1; }
  done
  echo "Attached the packages to release $TAG"
else
  echo "Built and checked the $VERSION packages in $OUT (not uploaded; UPLOAD=1 attaches them to release $TAG)"
fi
