# Agent Telegram notify

Push a text message to the operator’s Telegram chat from any agent turn (`POST /sendTelegramMessage`).

This is **not** a reply to an inbound Telegram update. Replies to live chat still go out automatically after a Telegram webhook turn. Use **`send_telegram_message`** when the operator is not currently messaging the bot (cron, web chat, orchestration, or “notify me when X”).

## Prerequisites

1. Bot token in Variables: **`TELEGRAM_BOT_TOKEN`**
2. The operator must **`/start`** the bot once (Telegram blocks unsolicited DMs)
3. Destination chat id in Variables: **`TELEGRAM_OPERATOR_CHAT_ID`**
   - Set it manually, or send any message to the bot so mpc-auth stores the private chat id on first inbound

## MCP tool

- **`send_telegram_message`** — **text** (required). Optional **webhookName** (use that telegram webhook’s bot token). Optional **chatIdEnvVar** (read chat id from a different Variable).

The tool never returns the bot token. Success includes **chatId** and **chunks** (long text is split at 4096 characters).
