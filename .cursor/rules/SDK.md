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

When adding an SDK function, add its equivalent tool wrapper in `src/mcp/`.
Management signing uses SDK vocabulary `ed25519` and `eip191` only (`ManagementSigningMethod`).
MCP tools pass `{ kind: 'ed25519' }` implicitly; do not add EIP-191 wallet signing tools to MCP.
