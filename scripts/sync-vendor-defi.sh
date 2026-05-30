#!/usr/bin/env bash
# Build sibling ctm-mpc-defi and copy into vendor/ for local SDK installs.
# Docker builds ctm-mpc-defi in-image; set CONTINUUM_SKIP_VENDOR_SYNC=1 there.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${DEFI_SRC:-$(cd "$ROOT/../ctm-mpc-defi" && pwd)}"
DST="$ROOT/vendor/ctm-mpc-defi"

if [[ "${CONTINUUM_SKIP_VENDOR_SYNC:-}" == "1" ]]; then
  if [[ ! -f "$DST/dist/index.js" ]]; then
    echo "vendor/ctm-mpc-defi not built (CONTINUUM_SKIP_VENDOR_SYNC=1)" >&2
    exit 1
  fi
  exit 0
fi

if [[ ! -f "$SRC/package.json" ]]; then
  echo "ctm-mpc-defi not found at $SRC (set DEFI_SRC to override)" >&2
  exit 1
fi

needs_build=0
if [[ ! -f "$SRC/dist/index.js" ]]; then
  needs_build=1
elif find "$SRC/src" -newer "$SRC/dist/index.js" -print -quit | grep -q .; then
  needs_build=1
fi

if [[ "$needs_build" == "1" ]]; then
  echo "Building ctm-mpc-defi at $SRC …"
  if [[ ! -d "$SRC/node_modules" ]]; then
    (cd "$SRC" && npm ci)
  fi
  (cd "$SRC" && npm run build)
else
  echo "Using existing ctm-mpc-defi build at $SRC"
fi

mkdir -p "$(dirname "$DST")"
echo "Vendoring into $DST …"
rsync -a --delete --exclude node_modules "$SRC/" "$DST/"
