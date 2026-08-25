#!/usr/bin/env bash
# Shared MCP Docker release checks (preflight + smoke test).
#
# Source after setting:
#   MCP_RELEASE_SDK_DIR       continuum-node-sdk root
#   MCP_RELEASE_DEFI_DIR        sibling ctm-mpc-defi root
#   MCP_RELEASE_BUILD_CTX       Docker build context (parent Code/)
#   MCP_RELEASE_DOCKERFILE      path to MCP Dockerfile
# Optional:
#   MCP_RELEASE_IMAGE_NAME      default continuumdao/continuum-mcp-server
#   MCP_RELEASE_DEFI_REGISTRY   default ^0.2.29 (lock fix hint in errors)
#   MCP_RELEASE_DEFI_BUILD_HINT message when sibling dist/*.d.ts is missing

: "${MCP_RELEASE_IMAGE_NAME:=continuumdao/continuum-mcp-server}"
: "${MCP_RELEASE_DEFI_REGISTRY:=^0.2.29}"
: "${MCP_RELEASE_DEFI_BUILD_HINT:=(cd ../ctm-mpc-defi && npm run build)}"

_mcp_release_lock_has_local_file_in() {
  local file="$1"
  local pattern="$2"
  if [[ -f "$file" ]] && grep -q "$pattern" "$file"; then
    echo 'yes'
  else
    echo 'no'
  fi
}

_mcp_release_defi_sibling_dist_dts_ready() {
  local dir="$1"
  [[ -f "$dir/dist/index.js" && -f "$dir/dist/index.d.ts" && -f "$dir/dist/agent/catalog.d.ts" ]]
}

release_preflight_mcp() {
  local errors=0

  if [[ -z "${MCP_RELEASE_SDK_DIR:-}" || -z "${MCP_RELEASE_DEFI_DIR:-}" || -z "${MCP_RELEASE_BUILD_CTX:-}" || -z "${MCP_RELEASE_DOCKERFILE:-}" ]]; then
    echo "error: mcp-release-lib.sh requires MCP_RELEASE_SDK_DIR, MCP_RELEASE_DEFI_DIR, MCP_RELEASE_BUILD_CTX, MCP_RELEASE_DOCKERFILE" >&2
    return 1
  fi

  if [[ ! -f "$MCP_RELEASE_SDK_DIR/package.json" ]]; then
    echo "error: continuum-node-sdk not found at $MCP_RELEASE_SDK_DIR" >&2
    errors=$((errors + 1))
  fi
  if [[ ! -f "$MCP_RELEASE_DEFI_DIR/package.json" ]]; then
    echo "error: ctm-mpc-defi not found at $MCP_RELEASE_DEFI_DIR (required for MCP Docker overlay)" >&2
    errors=$((errors + 1))
  fi
  if [[ ! -f "$MCP_RELEASE_DOCKERFILE" ]]; then
    echo "error: MCP Dockerfile missing at $MCP_RELEASE_DOCKERFILE" >&2
    errors=$((errors + 1))
  fi

  if [[ -f "$MCP_RELEASE_SDK_DIR/package-lock.json" ]]; then
    if [[ "$(_mcp_release_lock_has_local_file_in "$MCP_RELEASE_SDK_DIR/package-lock.json" 'file:\.\./ctm-mpc-defi')" == 'yes' ]]; then
      echo "error: continuum-node-sdk/package-lock.json contains file:../ctm-mpc-defi" >&2
      echo "  MCP Docker overlay drops hoisted @continuumdao/continuum-node-sdk → crash loop on startup." >&2
      echo "  Fix from continuum-node-sdk:" >&2
      echo "    npm install @continuumdao/ctm-mpc-defi@${MCP_RELEASE_DEFI_REGISTRY#^}" >&2
      echo "    git add package-lock.json && commit" >&2
      errors=$((errors + 1))
    fi
    if [[ "$(_mcp_release_lock_has_local_file_in "$MCP_RELEASE_SDK_DIR/package-lock.json" 'file:\.\./continuum-node-sdk')" == 'yes' ]]; then
      echo "error: continuum-node-sdk/package-lock.json contains file:../continuum-node-sdk" >&2
      errors=$((errors + 1))
    fi
  fi

  if [[ -f "$MCP_RELEASE_SDK_DIR/package.json" ]]; then
    local sdk_defi
    sdk_defi="$(node -p "require('$MCP_RELEASE_SDK_DIR/package.json').dependencies['@continuumdao/ctm-mpc-defi']" 2>/dev/null || echo '')"
    if [[ "$sdk_defi" == file:* ]]; then
      echo "error: continuum-node-sdk/package.json uses $sdk_defi — use registry range before MCP release" >&2
      errors=$((errors + 1))
    fi
  fi

  if [[ "$errors" -gt 0 ]]; then
    return 1
  fi

  if [[ -f "$MCP_RELEASE_DEFI_DIR/package.json" ]] && ! _mcp_release_defi_sibling_dist_dts_ready "$MCP_RELEASE_DEFI_DIR"; then
    echo "warning: sibling ctm-mpc-defi dist/ is incomplete (missing index.js, index.d.ts, or agent/catalog.d.ts)" >&2
    echo "  MCP Docker will rebuild defi inside the image (slower; needs tsup in devDependencies)." >&2
    echo "  Fix: $MCP_RELEASE_DEFI_BUILD_HINT" >&2
  fi

  echo "release preflight (MCP): ok"
  echo "  build context:  $MCP_RELEASE_BUILD_CTX"
  echo "  SDK:            $MCP_RELEASE_SDK_DIR ($(node -p "require('$MCP_RELEASE_SDK_DIR/package.json').version"))"
  echo "  defi sibling:   $MCP_RELEASE_DEFI_DIR"
  echo "  image:          $MCP_RELEASE_IMAGE_NAME"
}

smoke_test_mcp_image() {
  local image="$1"
  local cid=''
  local attempt

  echo "==> Smoke test $image (listen + MCP initialize)"
  cid="$(docker run -d --rm "$image")"

  cleanup() {
    docker rm -f "$cid" >/dev/null 2>&1 || true
  }
  trap cleanup RETURN

  for attempt in $(seq 1 30); do
    if docker logs "$cid" 2>&1 | grep -q 'Continuum MCP Server listening on http://0.0.0.0:8446/mcp'; then
      break
    fi
    if ! docker ps -q --filter "id=$cid" | grep -q .; then
      echo "error: MCP container exited during smoke test:" >&2
      docker logs "$cid" 2>&1 | tail -30 >&2
      return 1
    fi
    sleep 1
  done

  if ! docker logs "$cid" 2>&1 | grep -q 'Continuum MCP Server listening on http://0.0.0.0:8446/mcp'; then
    echo "error: MCP smoke test timed out (no listen log in 30s):" >&2
    docker logs "$cid" 2>&1 | tail -30 >&2
    return 1
  fi

  if ! docker exec "$cid" node -e "
const http = require('http');
const body = JSON.stringify({jsonrpc:'2.0',id:1,method:'server/discover',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientInfo':{name:'smoke',version:'1'},'io.modelcontextprotocol/clientCapabilities':{}}}});
const req = http.request({hostname:'127.0.0.1',port:8446,path:'/mcp',method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'server/discover','Content-Length':Buffer.byteLength(body)}}, res => {
  res.resume();
  res.on('end', () => process.exit(res.statusCode === 200 ? 0 : 1));
});
req.on('error', () => process.exit(1));
req.end(body);
setTimeout(() => process.exit(2), 8000);
" >/dev/null 2>&1; then
    echo "error: MCP server/discover returned non-200 (check docker logs for Zod/defi schema errors):" >&2
    docker logs "$cid" 2>&1 | tail -30 >&2
    return 1
  fi

  echo "smoke test: ok (listening + server/discover 200)"
}
