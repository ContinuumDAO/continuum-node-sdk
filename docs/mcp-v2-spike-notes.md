# MCP v2 RC spike notes (Phase 5)

Parallel evaluation — does not block deferred loading.

## Packages

| Component | Current | Spike |
|-----------|---------|-------|
| continuum-node-sdk | `@modelcontextprotocol/sdk` ^1.29.0 | `@modelcontextprotocol/server@beta` |
| mpc-auth | `go-sdk` v1.6.0 | `v1.7.0-pre.1` |

## Focus areas

1. `RegisteredTool.enable()` / `disable()` — already available in v1.29; verify parity in v2
2. Stateless HTTP transport for continuum-mcp
3. `notifications/tools/list_changed` — mpc-auth hub now handles via `ToolListChangedHandler`
4. **Tasks extension** — follow-on for long chart/analysis agent turns (not in this spike)

## Outcome

Track findings in a future PR; no dependency on v2 for deferred loading shipped in Phase 2.
