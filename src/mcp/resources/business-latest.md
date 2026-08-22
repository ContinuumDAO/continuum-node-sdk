# Business Latest RSS

Built-in MCP on **continuum-mcp** at `/mcp/business-latest`. Catalog id **`business-latest`**. **`initialLoad: false`**. No API key.

Load per chat with **`agent_load_mcp_server({ serverId: "business-latest" })`** only when the operator chooses it. Tools are **`business-latest__*`**.

## Sources (free RSS)

| id | Outlet | Feed |
|----|--------|------|
| **`bbc-business`** | BBC Business | `https://feeds.bbci.co.uk/news/business/rss.xml` |
| **`cnbc-business`** | CNBC Business | CNBC combined CMS RSS `id=10000664` |
| **`marketwatch`** | MarketWatch Top Stories | `https://feeds.marketwatch.com/marketwatch/topstories/` |
| **`forbes-business`** | Forbes Business | `https://www.forbes.com/business/feed/` |
| **`reuters-world`** | Reuters World | Google News RSS `site:reuters.com world` |

Reuters has no public first-party RSS; the catalog uses Google News search RSS as specified.

## Tools

1. **`list_business_sources`** — source ids and feed URLs
2. **`get_business_latest`** — optional **`sourceId`**, **`limit`** (1–25, default 8)
3. **`search_business_latest`** — required **`query`**, optional **`sourceId`** / **`limit`**

Not an OHLCV source — do not pass results to **`prepare_chart_from_rows`**.
