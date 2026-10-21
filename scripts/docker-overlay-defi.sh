#!/usr/bin/env bash
# Overlay @continuumdao/ctm-mpc-defi in node_modules for MCP Docker builds.
# Prefers pre-synced vendor/; otherwise builds sibling ctm-mpc-defi from build context.
set -euo pipefail

ROOT="${1:-/app}"
cd "$ROOT"

defi_dts_ready() {
  local dir="$1"
  [[ -f "$dir/dist/index.js" && -f "$dir/dist/index.d.ts" && -f "$dir/dist/agent/catalog.d.ts" ]]
}

# A sibling dist can be older than source. Private transfer needs the fee quote
# and a spending-wallet note scan; an older bundle quotes nothing and then proves
# against an empty wallet.
railgun_fee_exported() {
  local dir="$1"
  local bundle="$dir/dist/protocols/evm/railgun/index.js"
  [[ -f "$bundle" ]] && grep -q "quoteRailgunFee" "$bundle" && grep -q "scanSpendingWalletNotes" "$bundle"
}

overlay_src=""
if defi_dts_ready vendor/ctm-mpc-defi && railgun_fee_exported vendor/ctm-mpc-defi; then
  overlay_src=vendor/ctm-mpc-defi
  echo "docker-overlay-defi: using pre-synced vendor/ctm-mpc-defi"
elif defi_dts_ready ctm-mpc-defi-sibling && railgun_fee_exported ctm-mpc-defi-sibling; then
  overlay_src=ctm-mpc-defi-sibling
  echo "docker-overlay-defi: using built sibling ctm-mpc-defi-sibling"
elif [[ -f ctm-mpc-defi-sibling/package.json ]]; then
  echo "docker-overlay-defi: building ctm-mpc-defi from sibling source (JS+DTS) …"
  # Runner Docker stage sets NODE_ENV=production; npm ci would omit devDeps (tsup) without --include=dev.
  # waku-broadcaster-client-web@10 peers wallet ~11.1; this package uses wallet 11.2.
  (cd ctm-mpc-defi-sibling && npm ci --include=dev --legacy-peer-deps && NODE_OPTIONS=--max-old-space-size=8192 npm run build)
  if ! defi_dts_ready ctm-mpc-defi-sibling; then
    echo "docker-overlay-defi: sibling build did not emit dist/*.d.ts (SDK tsc needs them)" >&2
    exit 1
  fi
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
  (cd "$dest" && npm install --omit=dev --ignore-scripts --legacy-peer-deps)
  # Wallet nests graphql 16 beside the hoisted graphql 15 that GraphQL Mesh uses.
  # Two copies make the Railgun note index throw, and the scan then dies on an RPC log walk.
  if [[ -d "$dest/node_modules/graphql" && -d "$dest/node_modules/@railgun-community/wallet/node_modules/graphql" ]]; then
    rm -rf "$dest/node_modules/@railgun-community/wallet/node_modules/graphql"
    echo "docker-overlay-defi: removed nested Railgun graphql so the note index uses one copy"
  fi
  exit 0
fi

echo "docker-overlay-defi: no vendor/ or sibling ctm-mpc-defi — using npm lock version only" >&2
echo "  Publish @continuumdao/ctm-mpc-defi with SDK-required exports, or build from Code/ with sibling ctm-mpc-defi." >&2
