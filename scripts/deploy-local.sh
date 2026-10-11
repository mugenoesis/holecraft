#!/usr/bin/env bash
# Rebuilds the Docker image from origin/main and (re)starts the local test container, so the
# latest merged phase can be tried by hand in a browser.
#
# Usage: scripts/deploy-local.sh [port]            default port 8200 (or $HOLECRAFT_DEPLOY_PORT)
#        REF=origin/some-branch scripts/deploy-local.sh   preview something that is not merged yet
#
# - Builds from a clean `git archive` of the ref, so it deploys exactly what is on GitHub no
#   matter which branch or uncommitted changes are in this working copy.
# - Only ever touches the container named `holecraft`, and keeps its `holecraft-data` volume.
# - Refuses to run if the port is held by anything other than that container.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${1:-${HOLECRAFT_DEPLOY_PORT:-8200}}"
REF="${REF:-origin/main}"
NAME=holecraft
VOLUME=holecraft-data
TAG=holecraft:deployed

# Refresh the ref. A failed fetch (offline, no credentials) is only a warning: use what we have.
if [[ "$REF" == origin/* ]]; then
  git -c credential.helper= -c 'credential.helper=!gh auth git-credential' fetch --quiet origin "${REF#origin/}" \
    || echo "warning: could not fetch $REF; using the local copy" >&2
fi
COMMIT="$(git rev-parse --short "$REF")"
SUBJECT="$(git log -1 --format=%s "$REF")"

# Make sure the port is free, or already ours.
if docker ps --filter "name=^${NAME}\$" --format '{{.Ports}}' | grep -q ":${PORT}->"; then
  :
elif ss -ltn | grep -qE ":${PORT}\b"; then
  echo "error: port $PORT is in use by something other than the '$NAME' container." >&2
  echo "       Pick another with: scripts/deploy-local.sh <port>" >&2
  exit 1
fi

echo "Building $REF ($COMMIT: $SUBJECT)"
git archive --format=tar "$REF" | docker build -q -f docker/Dockerfile -t "$TAG" - >/dev/null

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --restart unless-stopped \
  --label "holecraft.commit=$COMMIT" \
  -p "$PORT:8080" -v "$VOLUME:/data" "$TAG" >/dev/null

for _ in $(seq 1 30); do
  if curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    HOST="$(hostname -I | awk '{print $1}')"
    echo "Holecraft ($COMMIT) is running: http://$HOST:$PORT"
    exit 0
  fi
  sleep 1
done

echo "error: the container did not become healthy; its log:" >&2
docker logs "$NAME" >&2
exit 1
