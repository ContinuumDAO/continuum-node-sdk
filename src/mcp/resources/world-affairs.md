# World Affairs RSS

Built-in MCP on **continuum-mcp** at `/mcp/world-affairs`. Catalog id **`world-affairs`**. **`initialLoad: false`**. No API key.

Load per chat with **`agent_load_mcp_server({ serverId: "world-affairs" })`** only when the operator chooses it. Tools are **`world-affairs__*`**.

When a source has **`biasNote`**, include that warning when citing or summarizing that outlet.

## Sources (free RSS)

| id | Outlet | Feed | biasNote |
|----|--------|------|----------|
| **`bbc-world`** | BBC World | `https://feeds.bbci.co.uk/news/world/rss.xml` | |
| **`aljazeera`** | Al Jazeera | `https://www.aljazeera.com/xml/rss/all.xml` | |
| **`guardian-world`** | The Guardian World | `https://www.theguardian.com/world/rss` | **Left wing bias** |
| **`dw-world`** | DW World | `https://rss.dw.com/xml/rss-en-world` | |
| **`france24`** | France 24 | `https://www.france24.com/en/rss` | |
| **`npr`** | NPR News | `https://feeds.npr.org/1001/rss.xml` | **Some political left wing bias** |
| **`cnn-world`** | CNN World | `http://rss.cnn.com/rss/edition_world.rss` | **Some political left wing bias** |
| **`rt-news`** | RT News | `https://www.rt.com/rss/news` | **Potential bias** |

## Tools

1. **`list_world_affairs_sources`** — source ids, feed URLs, and **`biasNote`**
2. **`get_world_affairs_latest`** — optional **`sourceId`**, **`limit`** (1–25, default 8)
3. **`search_world_affairs_latest`** — required **`query`**, optional **`sourceId`** / **`limit`**

Not an OHLCV source — do not pass results to **`prepare_chart_from_rows`**.
