# Agent MCP servers

Tools for optional MCP servers on the node. Catalog templates come from the bind-mounted mpc-config file **`agent_llm_config.defaults/MCP_servers.json`** (not from this SDK).

**To add a new catalog server:** edit that JSON in the mpc-config repo — see **`mpc-config/agent_llm_config.defaults/CATALOG.md`**. Use **Variables** for secrets (`apiKeyEnvVar` / `envVars` names only — never inline `apiKey`). The agent must not see Variable values.

## Suggested workflow

1. **`list_mcp_servers`** — active servers plus **`availableCatalog`** / **`addableTemplates`** from the repository file (entries not yet on this node).
2. Activate a catalog row with **`add_mcp_server_from_catalog`** (management-signed), or **`add_mcp_server`** for a custom definition.
3. Set **Variables** before **`initialLoad`: true** when `apiKeyEnvVar` / `envVars` are required.
4. **`remove_mcp_server`** — user/catalog-activated servers only (not builtin **continuum**).

## Agent chat (interactive UI)

Adding or activating a catalog server in the node database does **not** by itself expose that server’s tools to the LLM.

| Mechanism | When tools appear |
|-----------|-------------------|
| **`initialLoad: true`** on the server row | At **new** agent chat startup (existing chats unchanged) |
| **`agent_load_mcp_server`** meta-tool | Current conversation, after the agent calls it with `{ "serverId": "<id>" }` |
| **`agent_unload_mcp_server`** | Removes that server’s tools from the current conversation |

Tools from non-**continuum** servers are prefixed: **`{serverId}__{toolName}`** (e.g. **`technical-indicators__calculate_technical_indicator`**).

The chat UI “MCP tools” preview from **`GET /agent/mcp/tools`** lists **continuum** (`/mcp`) only. After a chat turn starts, the SSE **`tools`** event shows the merged tool set for that session.

### Technical indicators (`technical-indicators`)

HTTP on continuum-mcp **`/mcp/ta`**. Default **`initialLoad: false`**. Enable **Initial load** and open a **new chat**, or have the agent call **`agent_load_mcp_server`** for **`technical-indicators`**, then:

1. **`technical-indicators__list_technical_indicators`** — catalog of ids and input profiles
2. **`technical-indicators__calculate_technical_indicator`** — compute one indicator

SMA (close series) example:

```json
{
  "indicator": "sma",
  "params": { "period": 50 },
  "input": { "values": [42000, 42100, 42200] },
  "options": { "trimWarmup": true }
}
```

OHLCV candles: use `"input": { "candles": [{ "open", "high", "low", "close", "volume?" }] }` or parallel `"open"`, `"high"`, `"low"`, `"close"`, `"volume"` arrays. Indicator ids are **lowercase** (`sma`, not `SMA`). There is no `data` / `column` / `period` top-level shape — `period` goes in **`params`**, series in **`input`**.

## IDs and transports

- **id**: lowercase `a-z`, digits, hyphen, underscore; max 64 chars.
- **http**: requires **url**
- **stdio**: requires **command**; optional **args**, **envVars**, **useUserFolder**, **runtime**
