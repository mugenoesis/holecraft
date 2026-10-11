#!/usr/bin/env bash
# Checks the Docker image's recipe and contents, in throwaway containers (nothing running is touched):
#   1. hadolint reads docker/Dockerfile for mistakes and bad practice (pinning, caching, layers, shell pitfalls);
#   2. trivy scans the Dockerfile for risky configuration, and the built image for known vulnerabilities and
#      leaked secrets. Only HIGH and CRITICAL findings that have a fix available fail the check: those are the
#      ones that can be acted on by updating something.
# Needs Docker and network access (the first run downloads the two tools and trivy's vulnerability database,
# which is kept in the "holecraft-trivy-cache" volume).
#
# Usage: scripts/docker-lint.sh [image]      (default holecraft:dev; build it first with scripts/docker-smoke.sh)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
IMAGE="${1:-holecraft:dev}"

step() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

step "hadolint: docker/Dockerfile"
docker run --rm -i hadolint/hadolint hadolint --failure-threshold warning - < docker/Dockerfile
echo "Dockerfile is clean"

step "trivy: Dockerfile configuration"
docker run --rm -v "$ROOT/docker:/scan:ro" -v holecraft-trivy-cache:/root/.cache aquasec/trivy:latest \
  config --severity HIGH,CRITICAL --exit-code 1 /scan

step "trivy: $IMAGE (vulnerabilities with a fix, and secrets)"
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Image $IMAGE not found: build it first (scripts/docker-smoke.sh builds holecraft:dev)." >&2
  exit 2
fi
TAR="$(mktemp --suffix=.tar)"
trap 'rm -f "$TAR"' EXIT
docker save "$IMAGE" -o "$TAR"
chmod 644 "$TAR"
docker run --rm -v "$TAR:/image.tar:ro" -v holecraft-trivy-cache:/root/.cache aquasec/trivy:latest \
  image --input /image.tar --scanners vuln,secret --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1

printf '\nDocker checks passed\n'
