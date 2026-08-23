# User folder (workspace)

The node **user_folder** is the agent workspace on disk (container `/app/user_folder`; on the host it is the `user_folder/` directory beside your node config). MCP tools operate on **relative paths** inside that tree — the SDK and node reject absolute paths, `..` traversal, and loose files at the root.

## MCP tools

### Read (GET)

- `list_user_folder` — directory listing; optional **path** (default `.` for root)
- `get_user_folder_file` — read one file as UTF-8 text by **path**

### Write (management-signed POST)

- `write_user_folder_file` — upsert one UTF-8 text file (**path**, **content**)

## Path rules (SDK + node)

| Rule | Detail |
|------|--------|
| Relative only | No `/app/...`, drive letters, or `~` |
| No traversal | Reject `..` segments |
| Writes need a subtree | Path must include `/` (e.g. `evm/script/Deploy.s.sol`, not `notes.txt` at root) |
| Browse first | Use `list_user_folder` to confirm directories before writing |

The node enforces the same constraints on `/writeUserFolderFile`; SDK validation fails fast with the same messages.

## Recommended layout

| Subtree | Use |
|---------|-----|
| `evm/` | Foundry project (`foundry.toml`, `src/`, `script/`, `lib/`, `broadcast/`) |
| `data/` | General data, SDK artifact mirrors (`data/artifacts/...`) |
| `.mcp-foundry-workspace/` | Foundry MCP forge script output |

## Suggested workflow

1. **`list_user_folder`** — start at `.`, then drill into subdirs (`evm/`, `data/`, …).
2. **`write_user_folder_file`** — upload or edit a file under an existing subdirectory.
3. **`get_user_folder_file`** — read back or download content for inspection.
4. Downstream tools (forge import, join multisign) accept **paths under user_folder** — use the same relative paths returned here.

## Operator UI

**AI Agent → Workspace** provides the same browse/upload/download experience in the browser. MCP tools are the agent-automation equivalent.
