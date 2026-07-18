#!/usr/bin/env bash
# Expose the in-image SDK build as @continuumdao/continuum-node-sdk for ctm-mpc-defi runtime imports.
# docker-overlay-defi replaces ctm-mpc-defi without nested node_modules; npm hoisting may be absent
# when package-lock.json uses file:../ctm-mpc-defi. Always link the built dist after COPY.
set -euo pipefail

ROOT="${1:-/app}"
cd "$ROOT"

if [[ ! -f dist/mcp/server/index.js ]]; then
  echo "docker-link-sdk-self: dist/mcp/server/index.js missing — run after SDK tsc build" >&2
  exit 1
fi

dest=node_modules/@continuumdao/continuum-node-sdk
mkdir -p node_modules/@continuumdao
rm -rf "$dest"
mkdir -p "$dest"
cp package.json "$dest/"
cp -r dist "$dest/dist"
echo "docker-link-sdk-self: wired $dest to built dist/ ($(node -p "require('./package.json').version"))"
