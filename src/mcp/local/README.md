# Local Docker build and registry push

Build and publish **`continuumdao/continuum-mcp-server`** from **continuum-node-sdk** (`src/mcp` tools + `src/mcp/server` HTTP entrypoint). Operators run the container via **`mpc-config`** `docker-compose.yml` (service **`continuum-mcp`**), merged from **`configs.yaml`** **`ContinuumMcpServer`** by **`process_config.sh`**.

## Build / push

From the **continuum-node-sdk** repository root (requires sibling **`ctm-mpc-defi`** at `../ctm-mpc-defi`):

```bash
chmod +x src/mcp/local/push-image.sh
./src/mcp/local/push-image.sh v1.0.0 --tag-latest
```

- **`Dockerfile`** — multi-stage: builds `ctm-mpc-defi`, vendors it under `vendor/ctm-mpc-defi`, runs SDK `npm run build` → `dist/`, production `npm ci --omit=dev`, runs `node dist/mcp/server/index.js`
- **`push-image.sh`** — build context is the **parent directory** (both `continuum-node-sdk/` and `ctm-mpc-defi/`). Uses **`docker build --network=host`** on Linux so `npm ci` can reach the registry (bridge DNS often hangs ~10 min). Override: **`CONTINUUM_MCP_DOCKER_BUILD_NETWORK=default`**
- **`env.docker-registry.example`** — optional `IMAGE_NAME` for `../mpc-config/.env.docker-registry`

Local run without push (from parent directory containing both repos):

```bash
cd ..
docker build --network=host -f continuum-node-sdk/src/mcp/local/Dockerfile -t continuum-mcp:local .
docker run --rm -p 8446:8446 \
  -v "$PWD/added_keys:/app/added_keys" \
  -v "$PWD/bootstrap_key:/app/bootstrap_key:ro" \
  continuum-mcp:local
```

## DeFi MCP (continuum-node-sdk)

The MCP server loads **base tools** plus **DeFi discovery** tools from `@continuumdao/ctm-mpc-defi`:

- `list_defi_protocols`, `load_defi_protocol`, `unload_defi_protocol`
- `get_defi_protocol_skill`, `get_defi_protocol_supported_chains`, `get_defi_protocol_supported_tokens`

After `load_defi_protocol({ protocolId: "aave-v4" })`, protocol action tools (e.g. `ctm_aave_v4_build_deposit_multisign`) accept `keyGenId` + `chainId` and return `{ requestId }` via management signing.

Local build vendors sibling [`ctm-mpc-defi`](../../ctm-mpc-defi) into `vendor/ctm-mpc-defi` via `npm install` / `scripts/sync-vendor-defi.sh`. The DeFi package is **not published to npm** — it ships inside this Docker image only.

Optional env: `UNISWAP_API_KEY` for Uniswap quote/swap tools.

## Runtime (mpc-config)

After push, set **`ContinuumMcpServer.Image`** / **`Tag`** in **`configs.yaml`** (defaults in **`configs-original.yaml`**), run **`process_config.sh`**, then **`docker compose pull`** and **`docker compose up -d`**.

Loopback URL for MCP clients on the host: **`http://127.0.0.1:<HostPort><HttpPath>`** (default **`http://127.0.0.1:8446/mcp`**).

Inside the compose network, mpc-auth and other services reach **`http://continuum-mcp:<Port><HttpPath>`**.

Default container env (override in compose merge):

| Variable | Default |
|----------|---------|
| `MCP_HTTP_HOST` | `0.0.0.0` |
| `MCP_HTTP_PORT` | `8446` |
| `MCP_HTTP_PATH` | `/mcp` |
| `MPC_AUTH_URL` | `http://app` |
| `MPC_AUTH_PORT` | `8080` (management API) |
| `HOME` | `/app` (fixed in image; keys at `/app/added_keys`, `/app/bootstrap_key`) |
| `MCP_DEFAULT_SIGNER_KEY` | `bootstrap` (when no preferred signer stored on node) |

**mpc-config** bind-mounts `./added_keys` and `./bootstrap_key` (read-only on continuum-mcp) beside `configs.yaml`. No `KEY_ROOT` env — the MCP server always uses `/app`.
