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

### CoinMarketCap public (`coinmarketcap-public`)

Repository catalog server on continuum-mcp **`/mcp/cmc-public`**, typically already in **`activeServers`**; **`initialLoad: false`**. **Before loading**, call **`continuum__resolve_coinmarketcap_mcp_server`** → load **`coinmarketcap-public`** for DEX klines and market data. A Pro key in Variables unlocks **`get_crypto_ohlcv_historical`** on this **same** server — it does not replace public. Catalog **`coinmarketcap`** is optional (TA/news only). **`agent_load_mcp_server({ serverId: "coinmarketcap-public" })`**. Tools are **`coinmarketcap-public__*`**. See **`coinmarketcap_public_docs`** resource.

Key tools: **`coinmarketcap-public__get_crypto_ohlcv_historical`** (CEX OHLCV with volume; requires **`COINMARKETCAP_API_KEY`** in **Variables**), **`get_kline_candles`** (DEX OHLCV / Uniswap pools), **`get_global_metrics_latest`**, **`get_fear_and_greed_latest`**, **`get_dex_token_pools`**, **`search_dex_tokens`**, **`get_simple_price`**.

Default generic spot OHLCV priority: skill **`chart-ohlcv-sources`** — use loaded providers first; resolve + load CMC when the operator asks or no other OHLCV source is loaded in the session.

### CoinMarketCap full (`coinmarketcap`)

Catalog-only ([official CMC MCP](https://coinmarketcap.com/api/documentation/ai-agent-hub/mcp)). Activate with **`add_mcp_server_from_catalog`**, set **`COINMARKETCAP_API_KEY`** in Variables. Use for TA, news, narratives — **not** for Uniswap DEX klines (those stay on **`coinmarketcap-public`**). **`resolve_coinmarketcap_mcp_server`** picks public when both are active.

## IDs and transports

- **id**: lowercase `a-z`, digits, hyphen, underscore; max 64 chars.
- **http**: requires **url**
- **stdio**: requires **command**; optional **args**, **envVars**, **useUserFolder**, **runtime**

## Default active vs repository catalog

| Source file | On node | In `availableCatalog`? |
|-------------|---------|-------------------------|
| **`MCP_default_servers.json`** | Seeded as active builtin (`source`: default) | No |
| **`MCP_servers.json`** | Listed in catalog; activate via **Add from repository** / `add_mcp_server_from_catalog` | Yes, until activated |

**`coinmarketcap-public`** is in **`MCP_servers.json`** and is seeded active on new nodes via **`MCP_default_servers.json`**, **`initialLoad: false`**. Load per chat with **`agent_load_mcp_server`**. Catalog **`coinmarketcap`** (full CMC MCP, API key) is a separate optional entry.
