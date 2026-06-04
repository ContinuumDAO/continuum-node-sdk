# Continuum Node SDK

SDK functions live under `src/core/`; MCP tool wrappers live under `src/mcp/` and call into core.

When adding functions to the SDK, place them in the correct file for the category:

1. Management Signer: `src/core/management-signer.ts`
2. Groups: `src/core/groups.ts`
3. KeyGen: `src/core/keygen.ts`
4. Known Addresses: `src/core/registry/address-book.ts`
5. Chain Config: `src/core/registry/networks.ts`
6. Saved Tokens: `src/core/registry/tokens.ts`
7. MPC (multi-sign): `src/core/mpc/` — create, Get Sig, Execute, transfers, MPA, bump

Use strongly-typed input/output schemas using zod (`strict()`).

When adding a new SDK function, add its equivalent tool wrapper in `src/mcp/`.
Management signing uses SDK vocabulary `ed25519` and `eip191` only (`ManagementSigningMethod`).
MCP tools pass `{ kind: 'ed25519' }` implicitly; do not add EIP-191 wallet signing tools to MCP.

## Signed management POST pattern

For functions that require management signatures, use a three-step API for UI integration:

1. **`build<ActionName>`** — validation + unsigned POST body (`clientSig: ''`, `nonce`, `nodeKey`, route fields). Returns `BuiltManagementPostRequest` with `path`, `unsignedBody`, and `canonicalJson`.
2. **`managementSign(config, signing, unsignedBody)`** — sign and return the POST-ready body (adds `signedMessage` for EIP-191).
3. **`managementPost(config, path, signedBody)`** — transmit the request.

Naming: prefix `build` onto the full action name (e.g. `createGroupRequest` → `buildCreateGroupRequest`).

All-in-one exports (e.g. `createGroupRequest`) compose the three steps internally with `DEFAULT_MANAGEMENT_SIGNING` (ed25519). **MCP tool wrappers call the all-in-one functions**, not the build/sign/post steps directly.

Shared helpers: `buildManagementPostRequest`, `buildManagementCanonicalJson`, `buildManagementUnsignedBody`.

Don't account for migration/backwards compatibility/deprecated functions. Assume
the SDK has not shipped, nor its dependents.

## Agent MCP / webhook catalogs (repository only)

Add templates only in mpc-config (`agent_llm_config.defaults/MCP_servers.json`, `hooks/webhooks.json`). See **`mpc-config/agent_llm_config.defaults/CATALOG.md`**. Do not duplicate catalogs in this SDK — use **`GET /listMcpServers`** / **`GET /listWebhooks`** → **`availableCatalog`**.

- **Secrets:** agent **Variables** only; never inline `apiKey` in JSON.
- **Agent visibility:** names and `envConfigured` only, never secret values.
