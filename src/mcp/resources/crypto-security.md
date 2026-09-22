# Crypto Security RSS

Built-in MCP on **continuum-mcp** at `/mcp/crypto-security`. Catalog id **`crypto-security`**. **`initialLoad: false`**. No API key.

Load per chat with **`agent_load_mcp_server({ serverId: "crypto-security" })`** only when the operator chooses it. Tools are **`crypto-security__*`**.

Hack analyses, exploit postmortems, and security research. Not **crypto-latest** (news-wire headlines).

Add more outlets in **`src/core/crypto-security/sources.ts`** (and the matching Zod enum) after the feed URL is confirmed to return RSS or Atom.

## Sources (free RSS)

| id | Outlet | Feed |
|----|--------|------|
| **`quillaudits`** | QuillAudits | `https://quillaudits.medium.com/feed` |
| **`slowmist`** | SlowMist | `https://slowmist.medium.com/feed` |
| **`immunefi`** | Immunefi | `https://immunefi.com/blog/rss/` |
| **`blocksec`** | BlockSec | `https://blocksecteam.medium.com/feed` |
| **`certik`** | CertiK | `https://certik.medium.com/feed` |
| **`rekt`** | Rekt | `https://www.rekt.news/rss/feed.xml` |
| **`trail-of-bits`** | Trail of Bits | `https://blog.trailofbits.com/feed/` |

QuillAudits and CertiK use Medium author RSS (official author feeds — not mixed publications). CertiK’s certik.com blog is Cloudflare-gated and has no public RSS. Rekt’s working feed is `/rss/feed.xml` (plain `/rss` returns 500). Medium feeds typically expose the latest ~10 posts; search is over the fetched window, not the full archive. Official PDF audit reports on GitHub are not in this mix.

## Tools

1. **`list_crypto_security_sources`** — source ids and feed URLs
2. **`get_crypto_security_latest`** — optional **`sourceId`**, **`limit`** (1–25, default 16)
3. **`search_crypto_security`** — required **`query`**, optional **`sourceId`** / **`limit`**

Returns title, URL, date, and a short summary — not the full article body.

Not an OHLCV source — do not pass results to **`prepare_chart_from_rows`**. Not CryptoPanic.
