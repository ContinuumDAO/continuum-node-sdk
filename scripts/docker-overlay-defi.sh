#!/usr/bin/env bash
# Overlay @continuumdao/ctm-mpc-defi in node_modules for MCP Docker builds.
# Prefers pre-synced vendor/; otherwise builds sibling ctm-mpc-defi from build context.
set -euo pipefail

ROOT="${1:-/app}"
cd "$ROOT"

overlay_src=""
if [[ -f vendor/ctm-mpc-defi/dist/index.js ]]; then
  overlay_src=vendor/ctm-mpc-defi
  echo "docker-overlay-defi: using pre-synced vendor/ctm-mpc-defi"
elif [[ -f ctm-mpc-defi-sibling/dist/index.js ]]; then
  overlay_src=ctm-mpc-defi-sibling
  echo "docker-overlay-defi: using built sibling ctm-mpc-defi-sibling"
elif [[ -f ctm-mpc-defi-sibling/package.json ]]; then
  echo "docker-overlay-defi: building ctm-mpc-defi from sibling source …"
  (cd ctm-mpc-defi-sibling && npm ci && NODE_OPTIONS=--max-old-space-size=8192 npm run build)
  overlay_src=ctm-mpc-defi-sibling
fi

if [[ -n "$overlay_src" ]]; then
  dest=node_modules/@continuumdao/ctm-mpc-defi
  echo "docker-overlay-defi: overlaying $dest from $overlay_src (preserving package node_modules)"
  mkdir -p node_modules/@continuumdao
  # npm ci leaves a broken symlink for file:../ctm-mpc-defi before the sibling is copied in.
  rm -rf "$dest"
  mkdir -p "$dest"
  (cd "$overlay_src" && tar cf - --exclude=node_modules .) | (cd "$dest" && tar xf -)
  mkdir -p vendor/ctm-mpc-defi
  (cd "$overlay_src" && tar cf - --exclude=node_modules .) | (cd vendor/ctm-mpc-defi && tar xf -)
  echo "docker-overlay-defi: installing defi runtime deps (keeps zod@3 for MCP tool schemas) …"
  (cd "$dest" && npm install --omit=dev --ignore-scripts)
  exit 0
fi

echo "docker-overlay-defi: no vendor/ or sibling ctm-mpc-defi — using npm lock version only" >&2
echo "  Publish @continuumdao/ctm-mpc-defi with SDK-required exports, or build from Code/ with sibling ctm-mpc-defi." >&2
