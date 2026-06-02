# Agent skills

Markdown or plain-text guidance stored under `agent_llm_config/Skills/` (manifest `skills.json` plus one file per skill). Skills are local to this node and are not propagated between nodes.

## MCP tools

### Read (GET)

- `list_skills` — skill names only (no content)
- `get_skill` — full skill by **name** (content, **initialLoad**, **format**)

### Write (management-signed POST, preferred Ed25519 signer)

- `add_skill` — upsert skill (**name**, **content**, **initialLoad**; optional **format** `md`|`txt`, default `md`)
- `remove_skill` — delete skill by **name**

## initialLoad

| Value | Behavior |
|-------|----------|
| `true` | Content injected as a **system** message at chat startup |
| `false` | Agent may load the skill during the session via `agent_load_skill` |

## Suggested workflow

1. **`list_skills`** — see what is configured.
2. **`get_skill`** — read existing content before editing.
3. **`add_skill`** — create or update a skill file and manifest entry.
4. **`remove_skill`** — retire a skill when no longer needed.

## Validation

- **name**: lowercase `a-z`, digits, hyphen, underscore; max 64 chars
- **content**: required; max **512 KiB**
- **format**: `md` (default) or `txt`
