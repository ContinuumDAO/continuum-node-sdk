# Crypto Latest RSS

Built-in MCP on **continuum-mcp** at `/mcp/crypto-latest`. Catalog id **`crypto-latest`**. **`initialLoad: false`**. No API key.

Load per chat with **`agent_load_mcp_server({ serverId: "crypto-latest" })`** only when the operator chooses it. Tools are **`crypto-latest__*`**.

Add more outlets in **`src/core/crypto-latest/sources.ts`** (and the matching Zod enum) after the feed URL is confirmed to return RSS or Atom.

## Sources (free RSS)

| id | Outlet | Feed |
|----|--------|------|
| **`coindesk`** | CoinDesk | `https://www.coindesk.com/arc/outboundfeeds/rss/` |
| **`the-block`** | The Block | `https://www.theblock.co/rss.xml` |
| **`cointelegraph`** | Cointelegraph | `https://cointelegraph.com/rss` |
| **`decrypt`** | Decrypt | `https://decrypt.co/feed` |
| **`blockworks`** | Blockworks | `https://blockworks.co/feed` |
| **`the-defiant`** | The Defiant | `https://thedefiant.io/feed` |
| **`bitcoin-magazine`** | Bitcoin Magazine | `https://bitcoinmagazine.com/feed` |
| **`crypto-potato`** | Crypto Potato | `https://cryptopotato.com/feed/` |
| **`crypto-slate`** | CryptoSlate | `https://cryptoslate.com/feed/` |
| **`good-morning-crypto`** | Good Morning Crypto | `https://goodmorningcrypto.substack.com/feed` |
| **`openzeppelin`** | OpenZeppelin | `https://www.openzeppelin.com/news/rss.xml` |

CoinDesk `/feed` is an HTML page — use the Arc outbound RSS URL above. Crypto Potato and CryptoSlate are WordPress `/feed/`; Cloudflare may return 429 under burst traffic. Good Morning Crypto is the Crypto Banter daily digest (also in **crypto-banter-newsletters**). OpenZeppelin’s current news RSS is `/news/rss.xml` (legacy `/blog/feed` 404s).

## Tools

1. **`list_crypto_sources`** — source ids and feed URLs
2. **`get_crypto_latest`** — optional **`sourceId`**, **`limit`** (1–25, default 16)
3. **`search_crypto_latest`** — required **`query`**, optional **`sourceId`** / **`limit`**

Not an OHLCV source — do not pass results to **`prepare_chart_from_rows`**. Not CryptoPanic (no API key).
