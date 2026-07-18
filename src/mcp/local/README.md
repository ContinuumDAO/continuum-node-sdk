# Local Docker build and registry push

Build and publish **`continuumdao/continuum-mcp-server`** from **continuum-node-sdk** (`src/mcp` tools + `src/mcp/server` HTTP entrypoint). Operators run the container via **`mpc-config`** `docker-compose.yml` (service **`continuum-mcp`**), merged from **`configs.yaml`** **`ContinuumMcpServer`** by **`process_config.sh`**.

## Build / push

From the **continuum-node-sdk** repository root. Docker build context is the **parent `Code/` directory** — sibling **`ctm-mpc-defi/`** must exist next to **`continuum-node-sdk/`** until unreleased defi APIs (e.g. UniswapX limit submit) are published to npm:

```bash
chmod +x src/mcp/local/push-image.sh
./src/mcp/local/push-image.sh v1.0.0 --tag-latest
```

- **`Dockerfile`** — `npm ci` from **`package.json`** / **`package-lock.json`**, then **`scripts/docker-overlay-defi.sh`** builds sibling **`ctm-mpc-defi`** and overlays **`node_modules/@continuumdao/ctm-mpc-defi`** before SDK `tsc`. Production runner stage repeats the overlay, copies **`dist/`**, then **`scripts/docker-link-sdk-self.sh`** wires **`@continuumdao/continuum-node-sdk`** for defi runtime imports.
- **`push-image.sh`** — build context is the **parent directory** of `continuum-node-sdk/`. Uses **`docker build --network=host`** on Linux so `npm ci` can reach the registry (bridge DNS often hangs ~10 min). Override: **`CONTINUUM_MCP_DOCKER_BUILD_NETWORK=default`**
- **Release from node-app** — prefer **`npm run release:mcp`** in **`continuumdao-node-app`** (preflight rejects SDK lock with `file:../ctm-mpc-defi`; smoke test before push). See **`continuumdao-node-app/scripts/release/README.md`**.
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

Local `npm install` may use sibling `file:../ctm-mpc-defi`. The **Docker image** overlays sibling **`ctm-mpc-defi`** during build (see **`scripts/docker-overlay-defi.sh`**) so runtime matches unpublished SDK imports; after publishing **`@continuumdao/ctm-mpc-defi`**, bump the SDK lock and the overlay remains a no-op when npm already satisfies exports.

**Uniswap V4:** set `UNISWAP_API_KEY` in the node app **Node → AI Agent → Variables** tab (`POST /addEnvironmentVariable`). MCP tools fetch it via **`GET /getEnvironmentVariable?name=UNISWAP_API_KEY`** on mpc-auth. Required for `ctm_uniswap_v4_quote` and `ctm_uniswap_v4_create_swap`. Create a key at [Uniswap Developers](https://developers.uniswap.org/dashboard/welcome).

## Runtime (mpc-config)

After push, set **`ContinuumMcpServer.Image`** / **`Tag`** in **`configs.yaml`** (defaults in **`configs-original.yaml`**), run **`process_config.sh`**, then **`docker compose pull`** and **`docker compose up -d`**.

Loopback URL for MCP clients on the host: **`http://127.0.0.1:<HostPort><HttpPath>`** (default **`http://127.0.0.1:8446/mcp`**). Optional catalog MCP on the same container: **VPN** **`/mcp/vpn`**, **technical indicators** **`/mcp/ta`** (both **`initialLoad: false`** by default).

Inside the compose network, mpc-auth and other services reach **`http://continuum-mcp:<Port><HttpPath>`** (VPN: **`/mcp/vpn`**, TA: **`/mcp/ta`**).

Default container env (override in compose merge):

| Variable | Default |
|----------|---------|
| `MCP_HTTP_HOST` | `0.0.0.0` |
| `MCP_HTTP_PORT` | `8446` |
| `MCP_HTTP_PATH` | `/mcp` |
| `MCP_HTTP_VPN_PATH` | `/mcp/vpn` (VPN admin + egress; catalog opt-in) |
| `MCP_HTTP_TA_PATH` | `/mcp/ta` (technical indicators; catalog opt-in) |
| `MPC_AUTH_URL` | `http://app` |
| `MPC_AUTH_PORT` | `8080` (management API) |
| `HOME` | `/app` (fixed in image; keys at `/app/added_keys`, `/app/bootstrap_key`) |
| `MPC_DEFAULT_SIGNER_KEY` | `bootstrap` (when no preferred signer stored on node) |
| `MCP_DEFER_LOADING` | **on** (unset = deferred bundles); set `0` or `false` for legacy full `tools/list` |
| `MCP_PINNED_GROUPS` | Optional comma list overriding default pinned bundles (`discovery`, `node_info`, `management_signer`, `defi_discovery`) |

**mpc-config** bind-mounts `./added_keys` and `./bootstrap_key` (read-only on continuum-mcp) beside `configs.yaml`. No `KEY_ROOT` env — the MCP server always uses `/app`.
