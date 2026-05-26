# Continuum Node SDK

When adding functions to the SDK, place them in the correct file for the category:

1. Management Signer: `src/detops/management-signer.ts`
2. Groups: `src/detops/groups.ts`
3. KeyGen: `src/detops/keygen.ts`
4. Known Addresses: `src/detops/registry/address-book.ts`
5. Chain Config: `src/detops/registry/networks.ts`
6. Saved Tokens: `src/detops/registry/tokens.ts`
7. MPC (multi-sign): `src/detops/mpc/` — create, Get Sig, Execute, transfers, MPA, bump

Use strongly-typed input/output schemas using zod (`strict()`).

When adding an SDK function, add its equivalent tool wrapper in `src/mcp/`.
