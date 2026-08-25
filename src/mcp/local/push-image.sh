#!/usr/bin/env bash
# Build, smoke-test, and push the Continuum MCP server image from continuum-node-sdk
# (default IMAGE_NAME=continuumdao/continuum-mcp-server → Docker Hub continuumdao/continuum-mcp-server).
#
# Prerequisite: docker login (e.g. docker login docker.io for the continuumdao org).
#
# Optional overrides:
# export IMAGE_NAME=continuumdao/continuum-mcp-server
# export CONTINUUM_MCP_DOCKER_BUILD_NETWORK=default   # if --network=host is unavailable
# Or source ../../../mpc-config/.env.docker-registry (see env.docker-registry.example).
#
# Usage:
# ./src/mcp/local/push-image.sh v1.0.0 [--tag-latest] [--build-only]
#
# Examples:
# ./src/mcp/local/push-image.sh v1.0.0
# ./src/mcp/local/push-image.sh v1.0.0 --tag-latest
# ./src/mcp/local/push-image.sh v1.0.local --build-only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BUILD_CTX="$(cd "$REPO_ROOT/.." && pwd)"
DEFI_DIR="$BUILD_CTX/ctm-mpc-defi"
DOCKERFILE="$REPO_ROOT/src/mcp/local/Dockerfile"

OPTIONAL_REGISTRY_ENV="$REPO_ROOT/../mpc-config/.env.docker-registry"
if [[ -f "$OPTIONAL_REGISTRY_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$OPTIONAL_REGISTRY_ENV"
  set +a
fi

IMAGE_NAME="${IMAGE_NAME:-${DOCKER_IMAGE:-continuumdao/continuum-mcp-server}}"

VERSION=""
TAG_LATEST=0
BUILD_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --tag-latest) TAG_LATEST=1 ;;
    --build-only) BUILD_ONLY=1 ;;
    -*) echo "Unknown option: $arg" >&2; exit 1 ;;
    *)
      if [[ -z "$VERSION" ]]; then
        VERSION="$arg"
      else
        echo "Unexpected extra argument: $arg" >&2
        exit 1
      fi
      ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version> [--tag-latest] [--build-only]" >&2
  echo "" >&2
  echo "Builds \${IMAGE_NAME}:\${version} (default IMAGE_NAME=continuumdao/continuum-mcp-server)." >&2
  echo "Runs release preflight + smoke test before push (same as continuumdao-node-app release:mcp)." >&2
  echo "Override: export IMAGE_NAME=... or set it in ../mpc-config/.env.docker-registry" >&2
  exit 1
fi

FULL_IMAGE="${IMAGE_NAME}:${VERSION}"

MCP_RELEASE_SDK_DIR="$REPO_ROOT"
MCP_RELEASE_DEFI_DIR="$DEFI_DIR"
MCP_RELEASE_BUILD_CTX="$BUILD_CTX"
MCP_RELEASE_DOCKERFILE="$DOCKERFILE"
MCP_RELEASE_IMAGE_NAME="$IMAGE_NAME"
MCP_RELEASE_DEFI_BUILD_HINT="(cd ../ctm-mpc-defi && npm run build)  — or from continuumdao-node-app: npm run deps:local"
# shellcheck source=../../../scripts/mcp-release-lib.sh
source "$REPO_ROOT/scripts/mcp-release-lib.sh"

release_preflight_mcp

# Default bridge DNS often hangs npm ci during build (~10 min then "Exit handler never called!").
# host uses the host network stack (Linux). Override: CONTINUUM_MCP_DOCKER_BUILD_NETWORK=default
if [[ -n "${CONTINUUM_MCP_DOCKER_BUILD_NETWORK+x}" ]]; then
  DOCKER_BUILD_NETWORK="${CONTINUUM_MCP_DOCKER_BUILD_NETWORK}"
else
  DOCKER_BUILD_NETWORK=host
fi

cd "$BUILD_CTX"

DOCKER_BUILD_NETWORK_ARGS=()
if [[ -n "${DOCKER_BUILD_NETWORK}" ]]; then
  DOCKER_BUILD_NETWORK_ARGS=(--network="${DOCKER_BUILD_NETWORK}")
  echo "docker build --network=${DOCKER_BUILD_NETWORK} (override: CONTINUUM_MCP_DOCKER_BUILD_NETWORK=…)"
fi

echo "==> Building ${FULL_IMAGE}"
docker build "${DOCKER_BUILD_NETWORK_ARGS[@]}" \
  -f "$DOCKERFILE" \
  -t "${FULL_IMAGE}" \
  "$BUILD_CTX"

smoke_test_mcp_image "${FULL_IMAGE}"

if [[ "$BUILD_ONLY" -eq 1 ]]; then
  echo "Build + smoke test ok (--build-only; not pushed)."
  exit 0
fi

echo "==> Pushing ${FULL_IMAGE}"
docker push "${FULL_IMAGE}"

if [[ "$TAG_LATEST" -eq 1 ]]; then
  docker tag "${FULL_IMAGE}" "${IMAGE_NAME}:latest"
  docker push "${IMAGE_NAME}:latest"
fi

echo "Pushed ${FULL_IMAGE}$([[ $TAG_LATEST -eq 1 ]] && echo " and ${IMAGE_NAME}:latest")"

echo "Removing older local images for ${IMAGE_NAME} (keeping ${FULL_IMAGE}) …"
while IFS= read -r tag; do
  [[ -z "$tag" ]] && continue
  [[ "$tag" == "${FULL_IMAGE}" ]] && continue
  if [[ "$TAG_LATEST" -eq 1 && "$tag" == "${IMAGE_NAME}:latest" ]]; then
    continue
  fi
  docker rmi -f "$tag" 2>/dev/null || true
done < <(docker images "${IMAGE_NAME}" --format '{{.Repository}}:{{.Tag}}' | grep -v '<none>')

echo "Pruning dangling build layers …"
docker image prune -f
