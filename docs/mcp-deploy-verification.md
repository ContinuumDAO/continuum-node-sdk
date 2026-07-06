# MCP deploy verification (Phase 2+3)

Ship **continuum-mcp** and **mpc-auth** together when enabling deferred loading.

## Pre-deploy checklist

- [ ] `MCP_DEFER_LOADING` unset or non-zero (default **on**)
- [ ] Optional: `MCP_DEFER_PIN_GROUPS=discovery,node_info,management_signer,defi_discovery`
- [ ] Rebuild continuum-mcp image from continuum-node-sdk
- [ ] Rebuild mpc-auth with hub `list_changed` + turn audit log

## Post-deploy verification

1. `GET /agent/mcp/tools` — `toolCount` ≤ 40 at fresh session
2. Agent chat: “What is node health?” — first MCP call within 30s; audit log shows `agent turn audit`
3. `search_continuum_tools` + `activate_tool_group` for `chart` — tool count grows; mpc-auth log shows list refresh
4. SSE `usage.contextPercent` at turn start < 70% for typical queries

## Rollback

Set `MCP_DEFER_LOADING=0` on continuum-mcp and redeploy (legacy full tool list).
