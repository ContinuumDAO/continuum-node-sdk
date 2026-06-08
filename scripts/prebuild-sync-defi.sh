#!/usr/bin/env bash
# Sync sibling ctm-mpc-defi into node_modules before tsc (local dev only).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${CONTINUUM_SKIP_VENDOR_SYNC:-}" == "1" ]]; then
  exit 0
fi

if [[ -f "$ROOT/../ctm-mpc-defi/package.json" ]]; then
  bash "$ROOT/scripts/sync-vendor-defi.sh"
fi
