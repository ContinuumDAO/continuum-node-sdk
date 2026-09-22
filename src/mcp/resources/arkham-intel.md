# Arkham Intel API

Catalog id **`arkham-intel`**. Streamable HTTP on **`/mcp/arkham-intel`**. **`initialLoad: false`**.

Wraps the official [Arkham Intel API](https://arkm.com/api/docs) at `https://api.arkm.com`. There is no hosted Arkham MCP — this is the REST API behind one request tool, as [Arkham documents for agents](https://arkm.com/llms/guides/using-with-coding-agents.md).

Load per chat with **`agent_load_mcp_server({ serverId: "arkham-intel" })`** only when the operator chooses it. Tools are **`arkham-intel__*`**.

## API key (Variables)

Required for **`arkham_api_request`**. Name: **`ARKHAM_API_KEY`**. Header sent upstream: **`API-Key`**.

1. Request access at [arkm.com/api](https://arkm.com/api) (plan or trial).
2. Create a key under Settings → API Keys.
3. Store it with **`add_environment_variable`** (Node → AI Agent → Variables). Never put the key in chat or tool arguments.

`list_arkham_api_paths` does not need a key.

## Tools

1. **`list_arkham_api_paths`** — documented REST method + path + short description. Full reference: [arkm.com/llms.txt](https://arkm.com/llms.txt).
2. **`arkham_api_request`** — `method`, `path`, optional `query_params` / `body`.

Do not invent undocumented paths. `/transfers` is billed per row — keep time range and limit tight. WebSocket (`/ws…`) is not supported.

Not an OHLCV source — do not pass results to **`prepare_chart_from_rows`**.
