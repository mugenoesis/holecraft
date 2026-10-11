#!/usr/bin/env bash
# Builds the Docker image, starts a throwaway container, and checks that it
# serves the app, answers the health check, and reports healthy.
#
# Usage: scripts/docker-smoke.sh [image-tag]    (default: holecraft:dev)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${1:-holecraft:dev}"
NAME="holecraft-smoke-$$"
PORT="${HOLECRAFT_SMOKE_PORT:-18081}"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker build -q -f "$ROOT/docker/Dockerfile" -t "$TAG" "$ROOT" >/dev/null
docker run -d --name "$NAME" -p "$PORT:8080" "$TAG" >/dev/null

for _ in $(seq 1 30); do
  curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null && break
  sleep 1
done

fail() { echo "FAIL: $*"; docker logs "$NAME"; exit 1; }

curl -fs "http://127.0.0.1:$PORT/api/health" | grep -q '"status":"ok"' || fail "health endpoint"
curl -fs "http://127.0.0.1:$PORT/" | grep -q '<title>Holecraft</title>' || fail "index page"
[[ "$(docker inspect --format '{{.Config.User}}' "$NAME")" == "node" ]] || fail "container should run as non-root"

# The geometry worker needs its WebAssembly file, served as application/wasm.
WASM="$(docker exec "$NAME" sh -c 'ls apps/web/dist/assets/*.wasm 2>/dev/null | head -1 | xargs -n1 basename')"
[[ -n "$WASM" ]] || fail "the geometry WebAssembly file is missing from the image"
curl -sI "http://127.0.0.1:$PORT/assets/$WASM" | tr -d '\r' | grep -qi '^content-type: application/wasm' || fail "$WASM is not served as application/wasm"

for _ in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$NAME")"
  [[ "$status" == "healthy" ]] && break
  sleep 2
done
[[ "$status" == "healthy" ]] || fail "healthcheck status: $status"

echo "OK: $TAG serves the app and is healthy ($(docker image ls "$TAG" --format '{{.Size}}'))"
