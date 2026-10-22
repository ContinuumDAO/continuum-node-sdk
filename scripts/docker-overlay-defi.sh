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
# against an empty wallet. The note tree also has to be LevelDB. A bundle from
# before that change always calls `new memdown()`, so a mounted railgun_data/engine
# stays empty even when RAILGUN_DATA_DIR is set. Balances also have to be stored
# per wallet. A bundle that keeps one list per chain writes one 0zk's spendable
# amount onto the next KeyGen when that scan stops early.
railgun_bundle() {
  printf '%s/dist/protocols/evm/railgun/index.js' "$1"
}

railgun_fee_exported() {
  local bundle
  bundle="$(railgun_bundle "$1")"
  [[ -f "$bundle" ]] && grep -q "quoteRailgunFee" "$bundle" && grep -q "scanSpendingWalletNotes" "$bundle"
}

railgun_disk_exported() {
  local bundle
  bundle="$(railgun_bundle "$1")"
  [[ -f "$bundle" ]] && grep -q "leveldown" "$bundle"
}

railgun_balances_per_wallet() {
  local bundle
  bundle="$(railgun_bundle "$1")"
  [[ -f "$bundle" ]] && grep -q "recordRailgunWalletBalance" "$bundle"
}

railgun_bundle_current() {
  defi_dts_ready "$1" && railgun_fee_exported "$1" && railgun_disk_exported "$1" && railgun_balances_per_wallet "$1"
}

overlay_src=""
if railgun_bundle_current vendor/ctm-mpc-defi; then
  overlay_src=vendor/ctm-mpc-defi
  echo "docker-overlay-defi: using pre-synced vendor/ctm-mpc-defi"
elif railgun_bundle_current ctm-mpc-defi-sibling; then
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
  if ! railgun_disk_exported ctm-mpc-defi-sibling; then
    echo "docker-overlay-defi: sibling build did not emit a LevelDB Railgun engine" >&2
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
  # The note tree is a LevelDB on disk. The leveldown package ships N-API prebuilds.
  # npm install --ignore-scripts leaves those prebuilds in place; rebuild only if none are present.
  if [[ -d "$dest/node_modules/leveldown" ]]; then
    leveldown_binding() {
      find "$dest/node_modules/leveldown" \( -name 'leveldown.node' -o -name 'node.napi*.node' \) -print -quit
    }
    if [[ -z "$(leveldown_binding)" ]]; then
      echo "docker-overlay-defi: building leveldown for the Railgun note tree …"
      apt-get update
      apt-get install -y --no-install-recommends make g++ python3
      (cd "$dest" && npm rebuild leveldown)
      apt-get purge -y make g++
      apt-get autoremove -y
      rm -rf /var/lib/apt/lists/*
    fi
    if [[ -z "$(leveldown_binding)" ]]; then
      echo "docker-overlay-defi: leveldown native module is missing" >&2
      exit 1
    fi
  fi
  exit 0
fi

echo "docker-overlay-defi: no vendor/ or sibling ctm-mpc-defi — using npm lock version only" >&2
echo "  Publish @continuumdao/ctm-mpc-defi with SDK-required exports, or build from Code/ with sibling ctm-mpc-defi." >&2
