#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS_REPO="${CONTINUUM_DOCS_REPO:-$ROOT/../ctmdao-docs}"
OUT_DIR="$ROOT/src/mcp/docs"
INDEX_SRC="$DOCS_REPO/search-index.json"
BUILD_SCRIPT="$DOCS_REPO/scripts/build-search-index.mjs"

if [[ ! -d "$DOCS_REPO" ]]; then
  echo "sync-ctmdao-docs-index: skip (missing $DOCS_REPO)" >&2
  exit 0
fi

if [[ -f "$BUILD_SCRIPT" ]]; then
  node "$BUILD_SCRIPT"
fi

if [[ ! -f "$INDEX_SRC" ]]; then
  echo "sync-ctmdao-docs-index: missing $INDEX_SRC after build" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
cp "$INDEX_SRC" "$OUT_DIR/search-index.json"
echo "synced bundled docs index to $OUT_DIR/search-index.json"
