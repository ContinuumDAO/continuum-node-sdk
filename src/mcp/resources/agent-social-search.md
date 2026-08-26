# Agent social search

Search social channels on **Telegram**, **Discord**, and **Reddit** via deferred tool groups (`social:telegram`, `social:discord`, `social:reddit`). Telegram notify/DM uses the bot token — see `agent-telegram.md`.

Activate all platforms with **`activate_tool_group({ groupId: "social_search" })`** or alias **`social_search`** / **`social`**.

Configuration lives in bundled **`social-search.yaml`** (shared **tickers**, **ticker_detection**, and platform slices).

---

## Telegram

1. [my.telegram.org](https://my.telegram.org/apps) → **`TELEGRAM_API_ID`**, **`TELEGRAM_API_HASH`**
2. **AI Agent → MCP Servers → Continuum → Social search → Telegram** — phone login wizard → **`TELEGRAM_SESSION_PATH`**
3. Edit **`social-search.yaml`** → **`telegram.channels`**

Requires Python 3 + Telethon (`scripts/telegram-search/requirements.txt`).

**Tools:** `search_telegram_messages`, `search_telegram_tickers`

---

## Discord

1. [Discord Developer Portal](https://discord.com/developers/applications) → bot token → **`DISCORD_BOT_TOKEN`**
2. Enable **MESSAGE_CONTENT** privileged intent; invite bot with **View Channels** + **Read Message History**
3. Edit **`social-search.yaml`** → **`discord.guilds[]`** / **`channels[]`**; optional **`discord.mention_user_id`**

**Tools:** `search_discord_messages`, `search_discord_tickers`

---

## Reddit

1. [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) → create **script** app
2. Variables: **`REDDIT_CLIENT_ID`**, **`REDDIT_CLIENT_SECRET`**, **`REDDIT_USER_AGENT`** (unique string, e.g. `continuum-node:social-search:1.0 (by /u/you)`)
3. Edit **`social-search.yaml`** → **`reddit.subreddits`**

Requires Python 3 + PRAW (`scripts/reddit-search/requirements.txt`).

**Tools:** `search_reddit_posts`, `search_reddit_tickers`, `get_reddit_thread`

Optional **`includeComments`** on search tools (default off via **`reddit.comments.include_on_search`**). Use **`get_reddit_thread`** when full ranked reply context is needed.

---

## YAML shape (`social-search.yaml`)

```yaml
defaults:
  max_results: 50
tickers: [ETH, UNI, BTC]
ticker_detection: { min_length, max_length, include_bare_caps, exclude[] }
telegram:
  max_messages_per_channel: 500
  channels: [{ username, category?, notes? }]
discord:
  max_messages_per_channel: 500
  mention_user_id: ""
  include_nsfw: false
  guilds: [{ guild_id, name?, channels: [{ channel_id, name? }] }]
reddit:
  max_posts_per_subreddit: 100
  sort: new | top
  time_filter: month   # when sort=top
  subreddits: [{ name, category?, sort?, time_filter? }]
  comments:
    include_on_search: false
    max_per_post: 10
    max_per_thread: 200
    max_depth: 3
    sort: top
    replace_more_limit: 0
```

Tickers match `$SYM`, `#SYM`, or bare uppercase (2–10 chars, shared blocklist excludes TVL, APR, etc.). Empty **`tickers: []`** = open detection on ticker scan tools.

Results are capped by **`maxResults`** (default 50). Telegram/Discord message search and Reddit post search return **most recent first** unless Reddit **`sort: top`** (score desc).
