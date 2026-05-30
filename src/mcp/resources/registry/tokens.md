# Token Registry

This document covers the saved token registry managed through this server.

## Purpose

The token registry stores saved token contract metadata (ERC-20, ERC-721, and Continuum token types) keyed by chain type and chain ID. The node uses these entries in MPC signing workflows.

Read operations are unsigned GETs. Add and remove operations sign and POST internally with Ed25519 management signing.

## MCP tools

- `get_token_registry`
  - Get token registry entries.
  - Optional query: `chainType`, `chain_id`.
  - Returns token lists keyed by chain type (array of token records).
- `add_to_token_registry`
  - Add a token to the token registry.
  - Input: `chainType`, `chainId`, `tokenType`, `contract`; optional `transferSig`, `transferNames`.
  - Signs and POSTs to `/addToken`.
  - Returns `message`, `selectedSigningKey`, and `signingMessage`.
- `remove_from_token_registry`
  - Remove a token from the token registry.
  - Input: `chainType`, `chainId`, `tokenType`, `contractAddress`; optional `tokenId`.
  - Signs and POSTs to `/removeToken`.
  - Returns `message`, `selectedSigningKey`, and `signingMessage`.

SDK-only helpers (`buildAddToTokenRegistry`, `buildRemoveFromTokenRegistry`) are **not** registered as MCP tools.

## Token registry flow

1. (Optional) set preferred signer — `set_preferred_management_signer`.
2. List current tokens — `get_token_registry` (optionally filter by `chainType` / `chain_id`).
3. Add token — `add_to_token_registry` with:
   - `chainType` — e.g. `ethereum` (normalized to lowercase)
   - `chainId` — string or non-negative integer
   - `tokenType` — `ERC20`, `ERC721`, `CTMERC20`, or `CTMRWA1`
   - `contract` — at minimum `contractAddress`; optional `name`, `symbol`, `symbolURL`, `decimals`, `tokenURI`, `tokenId`, and passthrough fields
   - optional `transferSig`, `transferNames`
4. Remove token — `remove_from_token_registry` with matching `chainType`, `chainId`, `tokenType`, and `contractAddress`.
5. Verify — `get_token_registry`.

## Validation rules enforced

- `tokenType` must be one of: `ERC20`, `ERC721`, `CTMERC20`, `CTMRWA1`.
- `contract.contractAddress` is required on add.
- On remove, `tokenId` is **required** when `tokenType` is `ERC721`.
- Ethereum contract addresses are normalized to lowercase `0x…` form when applicable.

## Signing behavior

`add_to_token_registry` and `remove_from_token_registry` sign and submit internally. Clients pass business arguments only; do not orchestrate signing manually.

Successful responses may include `selectedSigningKey` (the Ed25519 key used) and `signingMessage` (canonical JSON that was signed).

## Client guidance

- Fetch registry state before add/remove to avoid duplicate entries or stale assumptions.
- Pass concrete `chainType`, `chainId`, and contract values from user selection or prior GET responses.
- For ERC-721 tokens, always include `tokenId` on remove (and in `contract` on add when applicable).
- Configure chain registry entries (`registry/networks.md`) before workflows that depend on chain configuration.
- Load `management-signer.md` if signed operations fail due to missing or unavailable local keys.
