# Agent MCP servers

Tools for optional MCP servers on the node. Catalog templates come from the bind-mounted mpc-config file **`agent_llm_config.defaults/MCP_servers.json`** (not from this SDK).

**To add a new catalog server:** edit that JSON in the mpc-config repo — see **`mpc-config/agent_llm_config.defaults/CATALOG.md`**. Use **Variables** for secrets (`apiKeyEnvVar` / `envVars` names only — never inline `apiKey`). The agent must not see Variable values.

## Suggested workflow

1. **`list_mcp_servers`** — **every** MCP server: active servers plus **`availableCatalog`** / **`addableTemplates`** from the repository file (entries not yet on this node). For **OHLCV-capable sources only** (MCP + DeFi), use **`list_ohlcv_sources`**.
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

Default generic spot OHLCV: skill **`chart-ohlcv-sources`** — use loaded providers only; load CMC **only when the operator chooses CoinMarketCap** (never auto-load for generic chart requests).

### CoinMarketCap full (`coinmarketcap`)

Catalog-only ([official CMC MCP](https://coinmarketcap.com/api/documentation/ai-agent-hub/mcp)). Activate with **`add_mcp_server_from_catalog`**, set **`COINMARKETCAP_API_KEY`** in Variables. Use for TA, news, narratives — **not** for Uniswap DEX klines (those stay on **`coinmarketcap-public`**). **`resolve_coinmarketcap_mcp_server`** picks public when both are active.

### Financial Modeling Prep (`financial-modeling-prep`)

Catalog-only ([official FMP MCP](https://site.financialmodelingprep.com/developer/docs/mcp-server)). Activate with **`add_mcp_server_from_catalog`**, set **`FMP_API_KEY`** in Variables (`apiKeyHeader`: `apikey` — never put the key in the catalog URL). **`initialLoad: false`**. Load per chat with **`agent_load_mcp_server({ serverId: "financial-modeling-prep" })`** only when the operator chooses FMP. Tools are **`financial-modeling-prep__*`**.

OHLCV / historical chart tools return vendor rows with **`date`** (EOD `YYYY-MM-DD` or intraday datetime) plus **`open`/`high`/`low`/`close`/`volume`**. Envelopes may be `{ symbol, historical: […] }` or `{ data: […] }`. Pass the **full** tool result to **`prepare_chart_from_rows`** / **`analyze_*`** — do not rewrite **`date`**. Chart live ticks use **`fmp.quote`** (poll FMP quote; same **`FMP_API_KEY`**). See skill **`chart-ohlcv-sources`**.

### Alpaca v2 (`alpaca`)

Catalog-only ([official Alpaca MCP v2](https://github.com/alpacahq/alpaca-mcp-server)). STDIO via **`uvx alpaca-mcp-server@2`**. Activate with **`add_mcp_server_from_catalog`**, set Variables **`ALPACA_API_KEY`** and **`ALPACA_SECRET_KEY`**. **`initialLoad: false`**. Load per chat with **`agent_load_mcp_server({ serverId: "alpaca" })`** only when the operator chooses Alpaca. Tools are **`alpaca__*`**. Pin **`@2`** — v1 tool names are not compatible. Paper trading is the server default (`ALPACA_PAPER_TRADE`); do not force live in the catalog.

OHLCV tools **`get_stock_bars`**, **`get_crypto_bars`**, **`get_option_bars`** return vendor rows with **`t`/`o`/`h`/`l`/`c`/`v`** (array or `{ bars: { TICKER: […] } }`). Pass the **full** tool result to **`prepare_chart_from_rows`** / **`analyze_*`** — do not rewrite **`t`**. Chart live ticks use **`alpaca.latestTrade`** (same keys on continuum-mcp / node-app). See skill **`chart-ohlcv-sources`**.

### Equibles (`equibles`)

Catalog-only ([open-source Equibles](https://github.com/daniel3303/Equibles); hosted MCP at [equibles.com/mcp](https://equibles.com/mcp)). Streamable HTTP: `https://mcp.equibles.com/mcp`. Activate with **`add_mcp_server_from_catalog`**, set **`EQUIBLES_API_KEY`** in Variables (`eq_…` key; default Bearer — do not put the key in the catalog URL). Free tier is 100 requests/day (no card). **`initialLoad: false`**. Load per chat with **`agent_load_mcp_server({ serverId: "equibles" })`** only when the operator chooses Equibles. Tools are **`equibles__*`**.

Research tools: SEC filings, XBRL financials, 13F holdings, insider and congressional trades, short interest, FRED, CFTC/CBOE, earnings transcripts (hosted). Prices: **`GetStockPrices`** (daily OHLCV), **`GetLatestPrices`** (latest close/change/volume), hosted **`GetLiveQuote`**. Pass the **full** **`GetStockPrices`** result to **`prepare_chart_from_rows`** / **`analyze_*`** — markdown tables or `{ data: [{ date, open, high, low, close, volume }] }`. Keep **`date`**. No chart live poller (the free quota is shared with MCP/REST). See skill **`chart-ohlcv-sources`**.

### EdgarTools (`edgartools`)

Catalog-only ([EdgarTools MCP](https://www.edgartools.io/edgartools-mcp-for-sec-filings/)). STDIO via **`uvx --from edgartools[ai] edgartools-mcp`**. Activate with **`add_mcp_server_from_catalog`**, set Variable **`EDGAR_IDENTITY`** to a name and email (SEC fair-access User-Agent — not an API key). **`initialLoad: false`**. Load per chat with **`agent_load_mcp_server({ serverId: "edgartools" })`** only when the operator chooses EdgarTools. Tools are **`edgartools__*`**.

SEC filings and company research: **`edgar_company`**, **`edgar_search`**, **`edgar_trends`**, **`edgar_ownership`**, **`edgar_monitor`**, and related tools. MIT-licensed, no paywall. Not an OHLCV source — do not pass results to **`prepare_chart_from_rows`**.

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
