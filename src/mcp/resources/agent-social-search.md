# Agent social search

Search **public** social channels on supported platforms. **Telegram** is the first platform (`social:telegram` tool group). Notify/DM uses the bot token — see `agent-telegram.md`.

## Telegram setup (one-time)

1. [my.telegram.org](https://my.telegram.org/apps) → create app → Node Variables **`TELEGRAM_API_ID`**, **`TELEGRAM_API_HASH`**
2. **AI Agent → MCP Servers → Continuum → Social search → Telegram** — enter phone and login code (management-signed; no SSH). Sets **`TELEGRAM_SESSION_PATH`** automatically (default `/app/user_folder/data/telegram/continuum_search`).
3. Optional: edit bundled **`telegram-channels.yaml`** (channels + ticker allowlist)

Requires **Python 3** + Telethon in the **continuum-mcp** image (`scripts/telegram-search/requirements.txt`).

Activate with **`activate_tool_group({ groupId: "social:telegram" })`** or alias **`social_search`** / **`social`**.

## Telegram MCP tools

- **`search_telegram_messages`** — **query** (required), optional **channels**, **maxResults**, **maxMessagesPerChannel**, **regex**, **since** (ISO date). Default channels from YAML.
- **`search_telegram_tickers`** — optional **tickers** (YAML default; `[]` = any detected ticker), **channels**, **maxResults**, **maxMessagesPerChannel**, **since**. Each hit includes **matched_tickers**.

Results are sorted **most recent first**, capped by **maxResults**.

## YAML

`telegram-channels.yaml`: **channels** list, optional **tickers** allowlist, **ticker_detection** (min/max length, bare caps, exclude list).

Tickers match `$SYM`, `#SYM`, or bare uppercase (length 2–10, blocklist excludes common words like TVL, APR).
