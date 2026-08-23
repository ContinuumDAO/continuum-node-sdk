#!/usr/bin/env bash
# Run a command with CONTINUUM_NODE_HEAP_MB / NODE_OPTIONS applied.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=set-node-heap.sh
source "$ROOT/scripts/set-node-heap.sh"
exec "$@"
