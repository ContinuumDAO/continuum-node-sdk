# Agent LLM config (bundled)

Operator tools for **mpc-config** repository defaults under `agent_llm_config.defaults/`: markdown **skills**, **cron** jobs, and runtime **host YAML** files. Not pinned at MCP init — load when managing node agent configuration.

## Activate the bundle

```text
activate_tool_group({ groupId: "agent_llm_config" })
```

Expands to **`agent_skills`**, **`agent_cron`**, and **`agent_host_yaml`**. You can also activate those subgroups individually. Environment variables remain in deferred group **`agent_config`** (separate).

Read this resource: **`agent_llm_config_docs`**. Detail: **`agent_skills_docs`**, **`agent_cron_jobs_docs`**.

## Skills (`agent_skills`)

| Tool | Purpose |
|------|---------|
| `list_skills` | Installed names, `availableCatalog`, `defaultsSync` (upgrade hints) |
| `get_skill` | Content + `defaultContent`, `upgradeAvailable`, `userModified` |
| `add_skill_from_catalog` | Install one repo default |
| `add_skill` | Custom upsert |
| `reset_skill_from_defaults` | Upgrade **one** bundled skill |
| `reset_skills_from_defaults` | Refresh **all** bundled skills |
| `remove_skill` | Remove |

## Cron jobs (`agent_cron`)

| Tool | Purpose |
|------|---------|
| `list_cron_jobs` | Jobs + `availableCatalog` |
| `add_cron_job_from_catalog` | Install one repo default job |
| `reset_cron_jobs_from_defaults` | Refresh all bundled cron jobs |
| `add_cron_job` / `update_cron_job` / lifecycle tools | Custom jobs |

## Host YAML (`agent_host_yaml`)

Runtime files in `agent_llm_config/` (not skill markdown). Same upgrade sidecar model as bundled skills (`*.meta.json`).

| kind | File (typical) |
|------|----------------|
| `trade-desk` | trade prefill defaults |
| `orchestration-plan` | plan modes / execution policy |
| `agent-intent-rules` | intent → pack hints |
| `continuum-dao-vote-policy` | vote policy defaults |
| `cron-trade` | node-wide tradeConsensus / tradeBuild for cron |

| Tool | Purpose |
|------|---------|
| `get_host_yaml_config` | Read `{ kind }` + upgrade metadata |
| `upsert_host_yaml_config` | Save validated YAML bytes |
| `reset_host_yaml_from_defaults` | Install or upgrade from defaults |

When **`upgradeAvailable`** is true: back up **`content`**, call **`reset_host_yaml_from_defaults`**, then re-apply operator edits with **`upsert_host_yaml_config`**. There is no automatic merge.

## Suggested workflow

1. **`activate_tool_group({ groupId: "agent_llm_config" })`**
2. **`list_skills`** / **`list_cron_jobs`** — see catalog gaps and `defaultsSync` / upgrades
3. **`add_*_from_catalog`** — install missing repo entries
4. **`get_skill`** or **`get_host_yaml_config`** — diff against `defaultContent` before reset
5. **`reset_skill_from_defaults`**, **`reset_host_yaml_from_defaults`**, or bulk reset tools — apply upstream defaults
6. Re-apply custom edits with **`add_skill`** or **`upsert_host_yaml_config`**

All writes use management-signed POST (preferred Ed25519 management signer).
