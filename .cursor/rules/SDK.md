# Continuum Node SDK

When adding functions to the SDK, they should be placed in the correct file for
the category in question:

1. Management Signer: src/detops/management-keys.ts
2. Groups: src/detops/group.ts
3. KeyGen: src/detops/keygen.ts
4. Known Addresses: src/detops/registry/address-book.ts
5. Chain Config: src/detops/registry/networks.ts
6. Saved Tokens: src/detops/registry/tokens.ts

Use strongly-typed input/output schemas using zod.

When adding an SDK function, add its equivalent tool wrapper in src/mcp.
