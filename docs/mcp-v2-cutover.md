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
| DeFi load gate | Process-scoped `DefiProtocolContext` shared across per-request servers (`server/index.ts`) — `load_defi_protocol` must survive into later `tools/call` |
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
| Supervisor / spawn (D) | Shared **supervisor → specialist → compress** runtime (not LangGraph). See below |

## Track D — Supervisor → sub-agent → compress

Continuum keeps Plan/KeyGen orchestration and adds a slim nested loop for specialists. Ordinary single-domain chat (including simple charts) stays one ReAct turn with slim packs — **no mandatory spawn**.

```text
Interactive supervisor  →  agent_spawn_sub_agent  →  runAgentSubLoop (leaf)
                        →  agent_join_sub_agents  →  compressed summaries only

Plan mode (skill)       →  mpc-orchestrate v1 (toolGroups/budget)
Execute / KeyGen        →  [Sub-agent] hooks use the same runAgentSubLoop
                        →  mpc-task-result compress → [Orchestrator] synthesis
Plan follow-on          →  POST /agent/plan/start rollup (new manifesto)
Continue in Orchestrator→  same [Orchestrator] thread for post-synthesis execution
```

| Piece | Location / behavior |
|-------|---------------------|
| Node contract | `toolGroups`, `skills`, `budget` (maxRounds / maxWallClockMs); specialists are **leaves** (`maxChildSpawns=0`) |
| Slim loop | `runAgentSubLoop` in mpc-auth — bounded rounds, pack-scoped tools, discovery off by default, compress `{summary,errors,artifacts}` |
| Group isolation | Snapshot/restore `continuumLLMGroups` around each specialist |
| Interactive spawn | Meta-tools `agent_spawn_sub_agent` / `agent_join_sub_agents` (not in Plan mode or `[Sub-agent]` threads) |
| Cron spawn | Same meta-tools on **cron** turns: parent owns `fetch_ohlcv` + `submit_trade_from_consensus`; leaf specialists run `analyze_*` with OHLCV bind + `tradeIdeas[]` upsert on the parent `[Cron]` conversation; submit/build/prepare blocked in specialists |
| Spawn hints | Always-on supervisor hint + host “consider spawning” note on expansion language (research, multi-step, compare, deep dive, …). Cron: multi-`analyze_*` messages also suggest spawn. Carve-outs for simple chart/menu asks. LLM still chooses whether to spawn; durable KeyGen multi-task → Plan mode |
| KeyGen path | `[Sub-agent]` hooks set `SlimSubLoop`; always include `keygen` pack for `mpc-task-result` |
| Fan-out scaffold | `agent_chat_spawn_turn.go` (budget, enqueue, activate, join) |

## Related docs

- `docs/mcp-deferred-tool-loading.md` — historical deferred-visibility design; wire model superseded by static list + host filter
- Anthropic Tool Search analogue: mid-turn `search_continuum_tools` + host expand
- Plan skill: `orchestration_planning` (mpc-config Skills) for durable KeyGen graphs
