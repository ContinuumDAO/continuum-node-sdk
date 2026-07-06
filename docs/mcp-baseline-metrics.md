# MCP baseline metrics and golden-path QA

Use before/after each phase of the [MCP context redesign](/home/marcel/.cursor/plans/mcp_context_redesign_23ef51aa.plan.md).

## SLO targets

| Metric | Target | How to measure |
|--------|--------|----------------|
| Tool count at session init | ≤40 visible tools | `GET /agent/mcp/tools`, hub `ToolSummaries()`, continuum-mcp `tools/list` |
| Time to first `tools/call` | <30s | mpc-auth turn audit log (`agent turn audit`) |
| Context usage at turn start | <70% of 500k char budget | SSE `usage` event (`contextCharBudget`, `contextCharsUsed`) |
| LLM latency per round (no tools) | <60s p95 | Turn audit log |

## Baseline inventory script

```bash
node scripts/mcp-tool-inventory.mjs
node scripts/mcp-tool-inventory.mjs --defer   # pinned-only count estimate
```

## Golden-path manual QA

1. **Node health** — Agent chat: “What is the node version and health?” Expect `version` / `get_health` within first tool round; init tool count ≤40 with defer on.
2. **DeFi bundle** — `search_continuum_tools` → `activate_tool_group` for one protocol → one read-only DeFi tool. Verify `list_changed` in mpc-auth logs and tool count grows.
3. **Multi-server hub** — Load continuum + catalog server; combined visible count stays bounded until activation.
4. **Direct MCP client** — Connect to `http://continuum-mcp:8446/mcp`; initial `tools/list` small; after `activate_tool_group`, refresh list grows.

## VPS measurement checklist

- [ ] Record `toolCount` from `GET /agent/mcp/tools` before deploy
- [ ] Record SSE `usage.contextPercent` at turn start for a typical query
- [ ] Record time-to-first-tool from audit log after Phase 1
- [ ] Re-run after Phase 2+3 deploy
