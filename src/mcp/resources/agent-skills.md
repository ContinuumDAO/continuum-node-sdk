# Agent skills

Markdown or plain-text guidance stored under `agent_llm_config/Skills/` (manifest `skills.json` plus one file per skill). Skills are local to this node and are not propagated between nodes.

## MCP tools

### Read (GET)

- `list_skills` — skill **names** on this node plus **`availableCatalog`** (bundled defaults not yet installed; no content)
- `get_skill` — full skill by **name** (content, **initialLoad**, **format**)

### Write (management-signed POST, preferred Ed25519 signer)

- `add_skill_from_catalog` — copy one repository default by **name** from `agent_llm_config.defaults/Skills/` (fails if already installed or not in the catalog)
- `add_skill` — upsert a custom skill (**name**, **content**, **initialLoad**; optional **format** `md`|`txt`, default `md`)
- `remove_skill` — delete skill by **name**
- `reset_skills_from_defaults` — overwrite **all** bundled default files; custom names are kept

## initialLoad

| Value | Behavior |
|-------|----------|
| `true` | Content injected as a **system** message at chat startup |
| `false` | Agent may load the skill during the session via `agent_load_skill` |

## Suggested workflow

1. **`list_skills`** — see installed **names** and **`availableCatalog`**.
2. **`add_skill_from_catalog`** — install one bundled default by name (same pattern as `add_mcp_server_from_catalog`).
3. **`get_skill`** — read existing content before editing.
4. **`add_skill`** — create or update a custom skill file and manifest entry.
5. **`reset_skills_from_defaults`** — refresh every bundled default at once.
6. **`remove_skill`** — retire a skill when no longer needed.

## Validation

- **name**: lowercase `a-z`, digits, hyphen, underscore; max 64 chars
- **content**: required; max **512 KiB**
- **format**: `md` (default) or `txt`
