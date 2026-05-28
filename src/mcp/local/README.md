# Local Docker build and registry push

Build and publish **`continuumdao/continuum-mcp-server`** from **continuum-node-sdk** (`src/mcp` tools + `src/mcp/server` HTTP entrypoint). Operators run the container via **`mpc-config`** `docker-compose.yml` (service **`continuum-mcp`**), merged from **`configs.yaml`** **`ContinuumMcpServer`** by **`process_config.sh`**.

## Build / push

From the **continuum-node-sdk** repository root:

```bash
chmod +x src/mcp/local/push-image.sh
./src/mcp/local/push-image.sh v1.0.0 --tag-latest
```

- **`Dockerfile`** — `npm run build` → `dist/`, production `npm ci --omit=dev`, runs `node dist/mcp/server/index.js`
- **`push-image.sh`** — `docker build -f src/mcp/local/Dockerfile` and push (default `continuumdao/continuum-mcp-server`)
- **`env.docker-registry.example`** — optional `IMAGE_NAME` for `../mpc-config/.env.docker-registry`

Local run without push:

```bash
docker build -f src/mcp/local/Dockerfile -t continuum-mcp:local .
docker run --rm -p 8446:8446 -v "$HOME/.mpa:/app/.mpa" continuum-mcp:local
```

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
| `KEY_ROOT` | `/app/.mpa` (bind-mount host `./.mpa/management_keys`) |
| `HOME` | `/app` (so SDK resolves keys under `KEY_ROOT`) |

**mpc-config** `process_config.sh` hard-links `./.mpa/management_keys/ed25519_private.hex` to `./bootstrap_key/ed25519_private.hex` (same inode; symlinks break inside the bind mount).
