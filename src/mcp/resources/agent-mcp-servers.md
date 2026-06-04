# Agent MCP servers

Tools for the node's **agent LLM** MCP catalog (`agent_llm_config/MCP_default_servers.json` + `MCP_servers.json`). These are separate from **continuum** node MCP tools (groups, keygen, MPC signing).

**Adding another bundled MCP server:** mirror `src/core/agent/mcp-servers-catalog.ts` and mpc-config `agent_llm_config.defaults/MCP_servers.json`. Use **Variables** for all API keys and secrets (`apiKeyEnvVar` / `envVars` names only in JSON — never inline `apiKey`). The **AI agent must not see Variable values**, only names and `envConfigured`.

## Suggested workflow

1. **`list_mcp_servers`** — configured servers on this node (`defaultServers`, `userServers`, merged `servers`) plus **`addableTemplates`** (bundled catalog entries not yet configured).
2. **`list_bundled_mcp_server_templates`** — full bundled catalog (mpc-config `MCP_servers.json` parity) when you need every template definition.
3. For a template that needs API keys or env vars (`apiKeyEnvVar`, `envVars`), ensure variables are set on the node (Node UI → AI Agent → Variables) before setting **`initialLoad`: true**.
4. **`add_mcp_server`** — add or update a user server (management-signed, preferred Ed25519 signer). Copy fields from a template or from **`get_mcp_server`** when updating. Strict schema: HTTP requires **url**, STDIO requires **command**; no inline **apiKey**. Use **`add_environment_variable`** for secret values referenced by **apiKeyEnvVar** / **envVars**.
5. **`remove_mcp_server`** — remove a **user** server only (not built-in defaults such as **continuum**).

## IDs and transports

- **id**: lowercase `a-z`, digits, hyphen, underscore; max 64 chars.
- **http**: requires **url** (except reserved defaults resolved by the node).
- **stdio**: requires **command**; optional **args**, **envVars**, **useUserFolder**, **runtime**.

## Auth

- Prefer **`apiKeyEnvVar`** (HTTP) or **`envVars`** (STDIO, required before load when listed) over inline **`apiKey`** so secrets live in the agent Variables store (`POST /addEnvironmentVariable`), not JSON on disk. The agent only sees variable **names** in MCP server listings, never values.
- **binance**: public Spot market data via **`uv`** + [danishashko/binance-mcp-server](https://github.com/danishashko/binance-mcp-server); no API key. Tools are prefixed **`binance_`** (e.g. `binance_get_klines` for OHLC). Requires **`uv`** on the node (`runtime.requireCommands`).
- After **`add_mcp_server`**, the node's **agent chat** can load servers with **`agent_load_mcp_server`** when they are not set to initial load.
