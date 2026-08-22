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

### GDELT Cloud (`gdelt-cloud`)

Catalog-only ([GDELT Cloud MCP](https://gdeltcloud.com/product/mcp)). Streamable HTTP: `https://gdelt-cloud-mcp.fastmcp.app/mcp`. Activate with **`add_mcp_server_from_catalog`**, set Variable **`GDELT_API_KEY`** (`gdelt_sk_…` from [gdeltcloud.com/api-keys](https://gdeltcloud.com/api-keys); default Bearer — do not put the key in the catalog URL). Requires a GDELT Cloud plan with API/MCP access. **`initialLoad: false`**. Load per chat with **`agent_load_mcp_server({ serverId: "gdelt-cloud" })`** only when the operator chooses GDELT Cloud. Tools are **`gdelt-cloud__*`**.

Agents discover tools via **`gdelt_cloud_tool_list`**, inspect a schema with **`gdelt_cloud_tool_get`**, then call **`gdelt_cloud_tool_call`** (events, stories, entities, summaries). Other categories: Energy Data, macro finance, prediction markets, web research. Not an OHLCV source — do not pass results to **`prepare_chart_from_rows`**.

### Business Latest RSS (`business-latest`)

Repository catalog server on continuum-mcp **`/mcp/business-latest`**. **`initialLoad: false`**. No API key. Load per chat with **`agent_load_mcp_server({ serverId: "business-latest" })`** only when the operator chooses it. Tools are **`business-latest__*`**. See **`business_latest_docs`**.

Free RSS: BBC Business, CNBC Business, MarketWatch Top Stories, Forbes Business, Reuters World (Google News `site:reuters.com`). Tools: **`list_business_sources`**, **`get_business_latest`**, **`search_business_latest`**. Not an OHLCV source.

### World Affairs RSS (`world-affairs`)

Repository catalog server on continuum-mcp **`/mcp/world-affairs`**. **`initialLoad: false`**. No API key. Load per chat with **`agent_load_mcp_server({ serverId: "world-affairs" })`** only when the operator chooses it. Tools are **`world-affairs__*`**. See **`world_affairs_docs`**.

Free RSS: BBC World, Al Jazeera, The Guardian World, DW World, France 24, NPR News, CNN World. Tools: **`list_world_affairs_sources`**, **`get_world_affairs_latest`**, **`search_world_affairs_latest`**.

When citing a source, include **`biasNote`** if present: The Guardian — **Left wing bias**; NPR and CNN — **Some political left wing bias**. Not an OHLCV source.

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

### Mullvad Browser / Gecko (`mullvad-browser`, `gecko`)

Catalog-only ([gecko-mcp](https://github.com/Frumane/gecko-mcp)). STDIO via **`npx -y gecko-mcp`**. Two catalog ids run the same server: **`mullvad-browser`** (Mullvad Browser; valid default search id) and **`gecko`** (Floorp / Firefox / LibreWolf / Zen — browser automation only, not a search engine). Activate with **`add_mcp_server_from_catalog`**. **`initialLoad: false`**. Load per chat with **`agent_load_mcp_server`**. Tools are **`mullvad-browser__*`** or **`gecko__*`**.

No API key. The operator must run a Gecko browser with automation enabled: Mullvad Browser **`mullvad-browser -marionette`**, or Floorp with **`floorp.mcp.enabled=true`**. Optional Variable **`GECKO_MCP_BACKEND=marionette`** forces the Marionette backend. OS keyboard/mouse tools stay locked unless the operator unlocks them.

**Default search:** after **`mullvad-browser`** is on the node and **AI Ready**, set Variable **`AGENT_DEFAULT_SEARCH_MCP=mullvad-browser`**. This is browser search (open [Mullvad Leta](https://leta.mullvad.net) in the live session), not a keyless search API.

### Exa (`exa`)

Catalog-only ([Exa MCP](https://exa.ai/docs/reference/exa-mcp); [Search API](https://exa.ai/docs/reference/search)). Streamable HTTP: `https://mcp.exa.ai/mcp`. **No key required** for casual use (hosted free-plan rate limits). Do **not** put `?exaApiKey=` in the catalog URL. For higher limits, set Variable **`EXA_API_KEY`** and `apiKeyHeader`: `x-api-key` on the **active** server (not in the catalog — `apiKeyEnvVar` would block load when unset). **`initialLoad: false`**. Load per chat with **`agent_load_mcp_server({ serverId: "exa" })`**. Tools are **`exa__*`** (`web_search_exa`, `web_fetch_exa`).

**Default search:** after **`exa`** is on the node and **AI Ready**, set Variable **`AGENT_DEFAULT_SEARCH_MCP=exa`**.

### Tavily (`tavily`)

Catalog-only ([Tavily](https://www.tavily.com/); [MCP docs](https://docs.tavily.com/documentation/mcp)). Streamable HTTP: `https://mcp.tavily.com/mcp`. Activate with **`add_mcp_server_from_catalog`**, set Variable **`TAVILY_API_KEY`** (`tvly-…`; default Bearer — do **not** put `?tavilyApiKey=` in the catalog URL). **`initialLoad: false`**. Load per chat with **`agent_load_mcp_server({ serverId: "tavily" })`**. Tools are **`tavily__*`** (`tavily-search`, `tavily-extract`, `tavily-map`, `tavily-crawl`).

**Default search:** after **`tavily`** is on the node and **AI Ready**, set Variable **`AGENT_DEFAULT_SEARCH_MCP=tavily`**.

### Kagi (`kagi`)

Catalog-only ([official Kagi MCP](https://github.com/kagisearch/kagimcp); [API](https://help.kagi.com/kagi/api/overview.html)). Streamable HTTP: `https://mcp.kagi.com/mcp`. Activate with **`add_mcp_server_from_catalog`**, set Variable **`KAGI_API_KEY`** from [kagi.com/api/keys](https://kagi.com/api/keys) (default Bearer). API usage is billed separately from a Kagi subscription — add funds on the API portal. **`initialLoad: false`**. Load per chat with **`agent_load_mcp_server({ serverId: "kagi" })`**. Tools are **`kagi__*`** (`kagi_search_fetch`, `kagi_extract`).

**Default search:** after **`kagi`** is on the node and **AI Ready**, set Variable **`AGENT_DEFAULT_SEARCH_MCP=kagi`**.

### SerpApi (`serpapi`)

Catalog-only ([official SerpApi MCP](https://serpapi.com/integrations/mcp); [GitHub](https://github.com/serpapi/serpapi-mcp)). Streamable HTTP: `https://mcp.serpapi.com/mcp`. Activate with **`add_mcp_server_from_catalog`**, set Variable **`SERPAPI_API_KEY`** from [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key) (default Bearer — do **not** put the key in the catalog URL). Free plan is 250 searches/month. **`initialLoad: false`**. Load per chat with **`agent_load_mcp_server({ serverId: "serpapi" })`**. Tools are **`serpapi__*`** (`search`; optional `search_table` / `search_dashboard` on MCP Apps hosts).

**Default search:** after **`serpapi`** is on the node and **AI Ready**, set Variable **`AGENT_DEFAULT_SEARCH_MCP=serpapi`**.

### Perplexity (`perplexity`)

Catalog-only ([official Perplexity MCP](https://docs.perplexity.ai/docs/getting-started/integrations/mcp-server); [GitHub](https://github.com/perplexityai/modelcontextprotocol)). Streamable HTTP: `https://api.perplexity.ai/mcp`. Activate with **`add_mcp_server_from_catalog`**, set Variable **`PERPLEXITY_API_KEY`** from [console.perplexity.ai](https://console.perplexity.ai) (default Bearer). A Perplexity Pro subscription is not this key — tool calls are billed at API rates. **`initialLoad: false`**. Load per chat with **`agent_load_mcp_server({ serverId: "perplexity" })`**. Tools are **`perplexity__*`** (`perplexity_search`, `perplexity_ask`, `perplexity_research`, `perplexity_reason`).

**Default search:** after **`perplexity`** is on the node and **AI Ready**, set Variable **`AGENT_DEFAULT_SEARCH_MCP=perplexity`**.

### Firefox (`firefox`)

Catalog-only ([firefox-mcp-server](https://github.com/JediLuke/firefox-mcp-server)). STDIO via **`npx -y firefox-mcp-server`**. Activate with **`add_mcp_server_from_catalog`**. **`initialLoad: false`**. Load per chat with **`agent_load_mcp_server({ serverId: "firefox" })`**. Tools are **`firefox__*`** (`browser_launch`, `page_navigate`, `html_extract`, …).

No API key. Playwright downloads its own Firefox binary — the operator must run **`npx playwright install firefox`** once on the node if launch fails with a missing executable. This is **not** gecko-mcp / the operator’s logged-in Firefox profile.

**Default search:** after **`firefox`** is on the node and **AI Ready**, set Variable **`AGENT_DEFAULT_SEARCH_MCP=firefox`**.

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
