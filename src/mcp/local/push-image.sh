#!/usr/bin/env bash
# Build and push the Continuum MCP server image from continuum-node-sdk
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
# ./src/mcp/local/push-image.sh v1.0.0 [--tag-latest]
#
# Examples:
# ./src/mcp/local/push-image.sh v1.0.0
# ./src/mcp/local/push-image.sh v1.0.0 --tag-latest

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BUILD_CTX="$(cd "$REPO_ROOT/.." && pwd)"
# Docker image installs @continuumdao/ctm-mpc-defi from npm (see Dockerfile ARG).
DEFI_ROOT="$BUILD_CTX/ctm-mpc-defi"

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
for arg in "$@"; do
  if [[ "$arg" == "--tag-latest" ]]; then
    TAG_LATEST=1
  elif [[ "$arg" == -* ]]; then
    echo "Unknown option: $arg" >&2
    exit 1
  elif [[ -z "$VERSION" ]]; then
    VERSION="$arg"
  else
    echo "Unexpected extra argument: $arg" >&2
    exit 1
  fi
done

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version> [--tag-latest]" >&2
  echo "" >&2
  echo "Pushes \${IMAGE_NAME}:\${version} (default IMAGE_NAME=continuumdao/continuum-mcp-server)." >&2
  echo "Override: export IMAGE_NAME=... or set it in ../mpc-config/.env.docker-registry" >&2
  exit 1
fi

FULL_IMAGE="${IMAGE_NAME}:${VERSION}"
DOCKERFILE="$REPO_ROOT/src/mcp/local/Dockerfile"

# Default bridge DNS often hangs npm ci during build (~10 min then "Exit handler never called!").
# host uses the host network stack (Linux). Override: CONTINUUM_MCP_DOCKER_BUILD_NETWORK=default
if [[ -n "${CONTINUUM_MCP_DOCKER_BUILD_NETWORK+x}" ]]; then
  DOCKER_BUILD_NETWORK="${CONTINUUM_MCP_DOCKER_BUILD_NETWORK}"
else
  DOCKER_BUILD_NETWORK=host
fi

if [[ ! -f "$DEFI_ROOT/package.json" ]]; then
  echo "Expected sibling ctm-mpc-defi at $DEFI_ROOT" >&2
  exit 1
fi

cd "$BUILD_CTX"

DOCKER_BUILD_NETWORK_ARGS=()
if [[ -n "${DOCKER_BUILD_NETWORK}" ]]; then
  DOCKER_BUILD_NETWORK_ARGS=(--network="${DOCKER_BUILD_NETWORK}")
  echo "docker build --network=${DOCKER_BUILD_NETWORK} (override: CONTINUUM_MCP_DOCKER_BUILD_NETWORK=…)"
fi

echo "Docker build context: $BUILD_CTX (continuum-node-sdk; ctm-mpc-defi from npm in image)"
docker build "${DOCKER_BUILD_NETWORK_ARGS[@]}" -f "$DOCKERFILE" -t "${FULL_IMAGE}" "$BUILD_CTX"
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
