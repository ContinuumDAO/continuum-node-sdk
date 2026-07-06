# CoinMarketCap public (keyless)

Built-in MCP server on **continuum-mcp** at `/mcp/cmc-public`. **Not the same** as catalog server **`coinmarketcap`** (external full MCP — requires **`COINMARKETCAP_API_KEY`** in Variables). See skill **`chart-ohlcv-sources`**.

## Which CMC MCP to load

When the operator asks for CoinMarketCap, **always call `continuum__resolve_coinmarketcap_mcp_server` first**, then **`agent_load_mcp_server`** with the returned `agentLoadMcpServer.serverId`:

| Condition | Load |
|-----------|------|
| **`coinmarketcap-public`** is active | **`coinmarketcap-public`** always — DEX klines, keyless tools, and **`get_crypto_ohlcv_historical`** when **`COINMARKETCAP_API_KEY`** is in Variables |
| Only catalog **`coinmarketcap`** active + key | **`coinmarketcap`** (official CMC MCP — TA, news; no built-in DEX klines) |
| Pro active but key missing | Add Variable first, or use **`coinmarketcap-public`** |

**Adding a Pro API key does not replace `coinmarketcap-public`.** The key unlocks Pro OHLCV on the same public server. Do **not** skip public for DEX/Uniswap charts.

Do **not** load only catalog **`coinmarketcap`** when the operator wants Uniswap pool charts — use **`coinmarketcap-public`**.

Uses the [CoinMarketCap Keyless Public API](https://pro.coinmarketcap.com/api/documentation/pro-api-reference/keyless-public-api) — **no API key, no signup** for keyless tools below.

**`coinmarketcap-public`** is a repository catalog MCP server, usually already in **`activeServers`**, **`initialLoad: false`**. Load via **`agent_load_mcp_server`** only when the **operator chooses CoinMarketCap** (after **`resolve_coinmarketcap_mcp_server`**). Do **not** auto-load for generic chart requests when no OHLCV source is loaded — ask the operator first (skill **`chart-ohlcv-sources`**).

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

**Stale DEX k-lines:** keyless pool data may lag (check **`meta.latestBarTime`**). Tell the operator and offer alternative sources (CoinGecko, CMC Pro historical, DeFi venue) — do **not** auto-switch without their choice.

## Chart workflow (DEX OHLCV)

1. Resolve pool address — e.g. `get_dex_token_pools` on WETH (`platform: "ethereum"`, token address) → pick Uniswap pool `addr`.
2. **`get_kline_candles`** — `platform`, pool `address`, `interval` (`1h`, `4h`, `1d`, …). **Do not pass `from`/`to`** — the keyless API returns **HTTP 403** for time filters. Use **`lookbackDays: 7`** or **`limit`** only (maps to bar count, not calendar filter on the wire).
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
