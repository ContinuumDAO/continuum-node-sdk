# Agent inbound webhooks

Tools for **inbound HTTP webhooks** that trigger agent chat turns (`POST /hooks/inbound/{id}` on the hook listener port, default `127.0.0.1:18090`).

Active webhooks live in MongoDB (`LocalAgentWebhooks`). Repository catalog templates are in `agent_llm_config.defaults/hooks/webhooks.json` (bind-mounted from mpc-config).

**Secrets:** use **`add_environment_variable`** for `WEBHOOK_SECRET_*` and `TELEGRAM_BOT_TOKEN`. The agent must not see Variable values — only names and `*Configured` flags in listings.

## Suggested workflow

1. **`list_webhooks`** — `activeWebhooks` plus `availableCatalog` (templates not yet on the node).
2. **`add_webhook_from_catalog`** or **`add_webhook`** (custom) — creates job + auto-generated secret env var name.
4. **`add_environment_variable`** — set provider signing secret (Stripe `whsec_`, Slack signing secret, etc.) before enabling.
5. **`activate_webhook`** — enable after secrets are configured.
6. **`run_webhook`** — manual test trigger.

## Types

`generic`, `github`, `gmail`, `proton`, `stripe`, `slack`, `telegram` — each verifies inbound auth differently. See mpc-config `docs/AGENT_HOOKS.md` for provider setup.
