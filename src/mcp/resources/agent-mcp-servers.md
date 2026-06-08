# Agent MCP servers

Tools for optional MCP servers on the node. Catalog templates come from the bind-mounted mpc-config file **`agent_llm_config.defaults/MCP_servers.json`** (not from this SDK).

**To add a new catalog server:** edit that JSON in the mpc-config repo — see **`mpc-config/agent_llm_config.defaults/CATALOG.md`**. Use **Variables** for secrets (`apiKeyEnvVar` / `envVars` names only — never inline `apiKey`). The agent must not see Variable values.

## Suggested workflow

1. **`list_mcp_servers`** — active servers plus **`availableCatalog`** / **`addableTemplates`** from the repository file (entries not yet on this node).
2. Activate a catalog row with **`add_mcp_server_from_catalog`** (management-signed), or **`add_mcp_server`** for a custom definition.
3. Set **Variables** before **`initialLoad`: true** when `apiKeyEnvVar` / `envVars` are required.
4. **`remove_mcp_server`** — user/catalog-activated servers only (not builtin **continuum**).

## IDs and transports

- **id**: lowercase `a-z`, digits, hyphen, underscore; max 64 chars.
- **http**: requires **url**
- **stdio**: requires **command**; optional **args**, **envVars**, **useUserFolder**, **runtime**
