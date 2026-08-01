# MCP 2026-07-28 cutover + catalog discovery

Clean cut to protocol revision **2026-07-28** — no legacy `initialize` / `Mcp-Session-Id` dual-serve.

## Architecture

```text
Wire tools/list  = static full Continuum catalog (SDK)
LLM tools        = host filter: core + search-expanded groups (mpc-auth)
Discovery        = host catalog search each turn + mid-turn search_continuum_tools expand
```

## continuum-node-sdk (server)

| Piece | Behavior |
|-------|----------|
| Dependency | `@modelcontextprotocol/server` (+ `express`, `node`) v2 |
| HTTP | `createMcpHandler(factory, { legacy: 'reject' })` + `toNodeHandler` in `src/mcp/server/http-transport.ts` |
| STDIO (TA) | `serveStdio(() => createTaMcpServer(), { legacy: 'reject' })` |
| `tools/list` | **Static** full catalog (tools stay enabled). `activate_tool_group` updates search/loaded bookkeeping only — does **not** mutate the wire list |
| Discovery | `search_continuum_tools` / `list_tool_groups` / `activate_tool_group`; tags in `tool-group-map.ts` (`GROUP_SEARCH_TAGS` / `TOOL_SEARCH_TAGS`) |
| Host catalog | `npm run build` → `scripts/gen-agent-host-catalog.mjs` syncs `mpc-auth/node/continuum_agent_host_catalog.json` |
| OHLCV | Explicit **`ohlcvDigest`** handles in `ohlcv-session-store` (digest index + TTL). Follow-ups pass `{ title, ohlcvDigest }` from `meta.sessionBind` — not transport session ids |

## mpc-auth (host)

| Piece | Behavior |
|-------|----------|
| Go SDK | `github.com/modelcontextprotocol/go-sdk` **v1.7.0** (discovers `2026-07-28` first) |
| LLM tool filter | `continuumLLMGroups` on `agentMcpHub` (starts as pinned defaults). Wire list is full; **LLM only sees** tools in expanded groups |
| Turn setup | `continuumCatalogSearchGroups` → `activateContinuumToolGroups` / mark LLM groups |
| Mid-turn | Successful `search_continuum_tools` → expand hit groups into LLM filter |
| Unknown tool | Auto-expand catalog group for any known Continuum tool |
| Affinity (C) | Bounded phrase→group store boosts search scores only; written on successful tool outcomes; optional `CONTINUUM_AFFINITY_PATH` |
| Overseer (C) | Async proposals after a turn (`continuumOverseerObserveTurnAsync`); HITL apply via `continuumAffinityApplyProposal` — never auto-applied |
| Spawn turns (D) | Scaffold in `agent_chat_spawn_turn.go` (budgets, enqueue, group activate + exec callback, join) — orchestration above discovery |

## Related docs

- `docs/mcp-deferred-tool-loading.md` — historical deferred-visibility design; wire model superseded by static list + host filter
- Anthropic Tool Search analogue: mid-turn `search_continuum_tools` + host expand
