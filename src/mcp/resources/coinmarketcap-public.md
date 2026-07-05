# CoinMarketCap public (keyless)

Built-in MCP server on **continuum-mcp** at `/mcp/cmc-public`. **Not the same** as catalog server **`coinmarketcap`** (external full MCP — requires **`COINMARKETCAP_API_KEY`** in Variables). See skill **`chart-ohlcv-sources`**.

## Which CMC MCP to load

When the operator asks for CoinMarketCap, **always call `continuum__resolve_coinmarketcap_mcp_server` first**, then **`agent_load_mcp_server`** with the returned `agentLoadMcpServer.serverId`:

| Condition | Load |
|-----------|------|
| **`COINMARKETCAP_API_KEY`** configured **and** catalog **`coinmarketcap`** is active | **`coinmarketcap`** (full pro MCP — TA, news, narratives, OHLCV) |
| Otherwise, **`coinmarketcap-public`** is active | **`coinmarketcap-public`** (keyless + Pro OHLCV when key is in Variables) |
| Pro active but key missing | Add Variable first, or activate/use **`coinmarketcap-public`** |
| Neither active | **`list_mcp_servers`** → **`add_mcp_server_from_catalog`** |

Do **not** load **`coinmarketcap-public`** when the pro key is set and **`coinmarketcap`** is active.

Uses the [CoinMarketCap Keyless Public API](https://pro.coinmarketcap.com/api/documentation/pro-api-reference/keyless-public-api) — **no API key, no signup** for keyless tools below.

**`coinmarketcap-public`** is a repository catalog MCP server, usually already in **`activeServers`**, **`initialLoad: false`**. Load when needed via **`agent_load_mcp_server`** after **`resolve_coinmarketcap_mcp_server`**; for generic spot OHLCV use when **no other OHLCV source is loaded** in the chat (skill **`chart-ohlcv-sources`**), or when the operator asks for CMC.

**Tools are prefixed** `coinmarketcap-public__` when loaded (e.g. `coinmarketcap-public__get_kline_candles`).

## When to use

| Use case | Tool | API key |
|----------|------|---------|
| **DEX pool OHLCV** (Uniswap, etc.) | `get_kline_candles` | **None** |
| **CEX aggregate OHLCV** (BTC/ETH index + volume) | `get_crypto_ohlcv_historical` | **`COINMARKETCAP_API_KEY`** in **Node → AI Agent → Variables** (`add_environment_variable`) |
| **Market snapshot** (cap, volume, dominance) | `get_global_metrics_latest` | None |
| **Fear & Greed** (latest + history) | `get_fear_and_greed_latest`, `get_fear_and_greed_historical` | None |
| **CMC100 / Altcoin Season** | `get_cmc100_latest`, `get_altcoin_season_index_latest` | None |
| DEX token search, pools, pair quotes | `search_dex_tokens`, `get_dex_token_pools`, `get_dex_pair_quotes` | None |
| CEX spot price / latest quotes | `get_simple_price`, `get_crypto_quotes_latest` | None |

For **TA, news, narratives, on-chain metrics**: catalog **`coinmarketcap`** + Variables key — optional, separate from OHLCV defaults.

## Market snapshot workflow

For a quick “how is the market?” briefing without an API key:

1. **`get_global_metrics_latest`** — total market cap, volume, BTC dominance
2. **`get_fear_and_greed_latest`** — sentiment index
3. **`get_altcoin_season_index_latest`** — alt vs BTC rotation signal
4. Optional: **`get_cmc100_latest`** — broad large-cap index

## Chart workflow (generic spot — default)

**No API key:** DEX pool klines first:

1. **`get_kline_candles`** — `platform`, pool `address`, `interval`, `limit` ≤ 400.
2. **`continuum__prepare_chart_from_rows`** with full tool result as `toolResult`.

**With Pro key in Variables:** CEX aggregate OHLCV via **`get_crypto_ohlcv_historical`**, then **`prepare_chart_from_rows`**:

```json
{
  "title": "ETH/USD 1H — last 45d",
  "toolResult": {
    "id": "1027",
    "convert": "USD",
    "timePeriod": "hourly",
    "result": [{ "time_open": "2025-01-08T00:00:00.000Z", "quote": { "USD": { "open": 100, "high": 110, "low": 90, "close": 105, "volume": 1000 } } }]
  }
}
```

**Keyless fallback:** DEX pool klines (above). **CoinGecko** only if CMC fetch fails — see **`chart-ohlcv-sources`**.

## Chart workflow (DEX OHLCV)

1. Resolve pool address — e.g. `get_dex_token_pools` on WETH (`platform: "ethereum"`, token address) → pick Uniswap pool `addr`.
2. **`get_kline_candles`** — `platform`, pool `address`, `interval` (`1h`, `4h`, `1d`, …). **Always bound the window** — the API returns **oldest** bars when `from`/`to` are omitted:
   - **`lookbackDays: 7`** — simplest for “last 7 days”
   - or **`from`** / **`to`** (Unix **seconds**) + **`limit`**
3. **`continuum__prepare_chart_from_rows`** — pass the **full object** from step 2 as **`toolResult`** (not a JSON string). Include `title` with asset + interval + window.

```json
{
  "platform": "ethereum",
  "address": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
  "interval": "1h",
  "lookbackDays": 7
}
```

```json
{
  "title": "ETH/USDC Uniswap v3 — 1H last 7d",
  "toolResult": {
    "platform": "ethereum",
    "address": "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
    "interval": "1h",
    "window": { "from": 1782000000, "to": 1782604800, "limit": 168, "lookbackDays": 7 },
    "candles": [{ "time": 1782541200, "open": 3780.75, "high": 3798.47, "low": 3760.24, "close": 3762.48, "volume": 3199707.73 }]
  }
}
```

## Platform names

`ethereum`, `solana`, `bsc`, `base`, `arbitrum`, `polygon`, `optimism`, `avalanche`.

## CMC cryptocurrency IDs

Resolve symbols via `/v1/cryptocurrency/map` (keyless) or use known ids: **1** = BTC, **1027** = ETH, **5426** = SOL.

## Rate limits

Keyless API is IP-rate-limited. On HTTP 429, retry with exponential backoff. A **free** [CMC API key](https://pro.coinmarketcap.com/signup) raises limits and enables Pro OHLCV + catalog **`coinmarketcap`** (TA, news, narratives). Never pass the key in tool input — use Variables / continuum-mcp env only.
