# Agent cron jobs

Scheduled agent tasks stored under `agent_llm_config/cron/jobs.json`. Each job gets a fixed **conversationId**; every run appends to that thread.

## MCP tools

### Read (GET)

- `list_cron_jobs` — summaries only (no message body)
- `get_cron_job` — full job by **id** or **name** (includes message)
- `list_cron_job_runs` — recent run history for **jobId** (optional **limit**, default 50)

### Write (management-signed POST, preferred Ed25519 signer)

- `add_cron_job` — create job (**name**, **message**, **schedule**; optional **enabled**, **deleteAfterRun**)
- `update_cron_job` — update schedule/message/metadata only (not **enabled**)
- `activate_cron_job` / `deactivate_cron_job` — enable or disable without deleting
- `remove_cron_job` — delete job; optional **deleteConversation** (default false)
- `run_cron_job` — manual async trigger (works when deactivated)

## Schedule kinds

| kind | fields | behavior |
|------|--------|----------|
| `cron` | `expr` (5-field), optional `tz` (default UTC) | clock-anchored cron |
| `every` | `everyMs` | fixed interval from activation |
| `at` | `at` (RFC3339) | one-shot; defaults **deleteAfterRun: true** |

## Suggested workflow

1. **`list_cron_jobs`** — inspect schedules, enabled state, last/next run.
2. **`get_cron_job`** — read the instruction message before editing.
3. **`add_cron_job`** or **`update_cron_job`** — set or change the agent prompt and schedule.
4. **`activate_cron_job`** / **`deactivate_cron_job`** — pause or resume scheduling.
5. **`run_cron_job`** — test immediately; then **`list_cron_job_runs`** for outcome.
6. **`remove_cron_job`** when retiring a task.

## Notes

- Scheduler can be disabled node-wide via `EnableAgentCron: false` or `MPC_AUTH_ENABLE_AGENT_CRON=0`; CRUD and manual runs still work.
- Cron runs use the full agent turn but fail if MCP elicitation would block on human input.
- Job **name**: lowercase `a-z`, digits, hyphen, underscore; max 64 chars.
