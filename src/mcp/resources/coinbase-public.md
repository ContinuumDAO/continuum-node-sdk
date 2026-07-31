# Coinbase Advanced Trade (public)

Built-in MCP on **continuum-mcp** at `/mcp/coinbase-public`. Catalog id **`coinbase-public`**.

Load only when the operator chooses Coinbase — see skill **`chart-ohlcv-sources`**.

## Tools

| Tool | Purpose |
|------|---------|
| **`get_product_candles`** | Spot OHLCV → Continuum bars `{ time, open, high, low, close, volume? }`, `dataSource: coinbase_candles` |
| **`list_products`** / **`search_products`** | Discover `BTC-USD`-style product ids |
| **`get_product_ticker`** | Last trade / price |
| **`get_product_book`** | Spot book as **NormalizedDepthSnapshot** under `book` |

Pass the full **`get_product_candles`** result to **`prepare_chart_from_rows`** / **`analyze_*`** as `toolResult`. Do not rewrite bars.

## Auth

- **Default:** keyless public market endpoints (`/api/v3/brokerage/market/...`).
- **Optional premium:** set Variables **`COINBASE_CDP_API_KEY_NAME`** and **`COINBASE_CDP_API_PRIVATE_KEY`** (ECDSA PEM; literal `\n` escapes OK). When both are set, tools prefer authenticated brokerage routes; public tools still work if unset.

Never pass secret values in tool args. Agents see names / `envConfigured` only.

## Liquidity depth

Use **`continuum__analyze_liquidity_depth`** with `depthExchangeId: "coinbase"` and the same OHLCV session (product id like `BTC-USD`). Averaged spot walls only — not a Trade Idea.

## Trade ideas

Coinbase OHLCV is a valid candle source for analyze → trade ideas (`ds=cb`). Build Trade execution stays Hyperliquid / Arcus / GMX / Uniswap.
