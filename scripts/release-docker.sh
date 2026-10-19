#!/usr/bin/env bash
# Builds the release Docker image, smoke-tests it, and (with PUSH=1) pushes it to Docker Hub.
#
# Usage: scripts/release-docker.sh              # build + smoke test, tags mugenoesis/holecraft:<version> and :latest locally
#        PUSH=1 scripts/release-docker.sh       # ...and push both tags (run `docker login` first)
#        IMAGE=me/holecraft scripts/release-docker.sh   # another repository name
#
# - The version is the one in package.json, and the working tree must be clean and on a commit that is on
#   origin/main, so what is pushed is exactly what was merged.
# - The image is amd64 only (multi-arch is on the roadmap).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

IMAGE="${IMAGE:-mugenoesis/holecraft}"
VERSION="$(node -p "require('./package.json').version")"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "package.json version '$VERSION' is not x.y.z" >&2; exit 1; }

[[ -z "$(git status --porcelain)" ]] || { echo "The working tree is not clean; commit or stash first." >&2; exit 1; }
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' fetch --quiet origin main
git merge-base --is-ancestor HEAD origin/main || { echo "HEAD is not on origin/main; check out the merged commit." >&2; exit 1; }
COMMIT="$(git rev-parse --short HEAD)"

echo "Building $IMAGE:$VERSION from $COMMIT"
docker build -f docker/Dockerfile \
  --build-arg "VERSION=$VERSION" --build-arg "REVISION=$(git rev-parse HEAD)" \
  -t "$IMAGE:$VERSION" -t "$IMAGE:latest" .

# Test the image just built, not a rebuild: the smoke test's own build would replace the version tag with one that has no version or revision labels.
SKIP_BUILD=1 scripts/docker-smoke.sh "$IMAGE:$VERSION"

if [[ "${PUSH:-0}" == "1" ]]; then
  docker push "$IMAGE:$VERSION"
  docker push "$IMAGE:latest"
  echo "Pushed $IMAGE:$VERSION and $IMAGE:latest"
else
  echo "Built and checked $IMAGE:$VERSION (not pushed; PUSH=1 pushes it)"
fi
