# Coin Bureau Newsletters

Built-in MCP on **continuum-mcp** at `/mcp/coin-bureau-newsletters`. Catalog id **`coin-bureau-newsletters`**. **`initialLoad: false`**. No API key.

Load per chat with **`agent_load_mcp_server({ serverId: "coin-bureau-newsletters" })`** only when the operator chooses it. Tools are **`coin-bureau-newsletters__*`**.

Coin Bureau does **not** publish a public RSS or Atom feed. This server reads the public archive listing and the newsletter sitemap:

| Source | URL |
|--------|-----|
| Archive | `https://coinbureau.com/newsletters` |
| Sitemap | `https://coinbureau.com/server-sitemap-newsletters.xml` |

Archive cards include title, short blurb, and display date (these are the newest issues). The sitemap adds older slugs and `lastmod` when the archive page only shows a short first page. Newest issues can appear on the archive before the sitemap updates — archive wins on merge.

## Tools

1. **`get_coin_bureau_latest`** — optional **`limit`** (1–25, default 8)
2. **`search_coin_bureau_newsletters`** — required **`query`**, optional **`limit`**

Returns title, URL, date, and archive blurb only — not the full newsletter body.

Not an OHLCV source — do not pass results to **`prepare_chart_from_rows`**. Not **crypto-latest** (RSS headlines) and not CryptoPanic.
