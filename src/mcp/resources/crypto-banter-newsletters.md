# Crypto Banter Newsletters

Built-in MCP on **continuum-mcp** at `/mcp/crypto-banter-newsletters`. Catalog id **`crypto-banter-newsletters`**. **`initialLoad: false`**. No API key.

Load per chat with **`agent_load_mcp_server({ serverId: "crypto-banter-newsletters" })`** only when the operator chooses it. Tools are **`crypto-banter-newsletters__*`**.

Crypto Banter’s site has no official RSS. These three Substack publications do:

| id | Newsletter | Feed |
|----|------------|------|
| **`the-insider`** | The Insider | `https://theinsiderletter.substack.com/feed` |
| **`good-morning-crypto`** | Good Morning Crypto | `https://goodmorningcrypto.substack.com/feed` |
| **`the-daily-candle`** | The Daily Candle | `https://dailycandle.substack.com/feed` |

The Insider is Ran Neuner’s weekly research letter. Good Morning Crypto is the daily news digest (also in **crypto-latest** as `good-morning-crypto`). The Daily Candle is the traders’ journal. Public `/feed` URLs carry free posts and public previews (paywalled subscriber text is not included).

## Tools

1. **`list_crypto_banter_sources`** — source ids and feed URLs
2. **`get_crypto_banter_latest`** — optional **`sourceId`**, **`limit`** (1–25, default 8)
3. **`search_crypto_banter_newsletters`** — required **`query`**, optional **`sourceId`** / **`limit`**

Returns title, URL, date, and a short summary — not the full newsletter body.

Not an OHLCV source — do not pass results to **`prepare_chart_from_rows`**. Not **crypto-latest** (news-wire RSS) and not CryptoPanic.
