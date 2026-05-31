# Chain Registry

This document covers the chain (network) configuration registry managed through this server.

## Purpose

The chain registry stores RPC endpoints, block explorers, and gas/fee defaults for EVM-compatible chains. The node uses these entries when resolving chain context for signing and transaction workflows.

Read operations are unsigned GETs. Add and remove operations sign and POST internally with Ed25519 management signing.

## MCP tools

- `get_chain_registry`
  - Get chain registry entries.
  - Optional query: `chain_id`, `chainName` (case-insensitive name filter — preferred over guessing IDs).
  - Call with no args to list all configured chains.
  - Returns `chains` (array of chain configuration records).
- `add_to_chain_registry`
  - Add chain details to the chain registry.
  - Input: `chainName`, `chainId`, `rpcGateway`; optional `explorer`, `legacy`, `testnet`, gas/fee fields (see below).
  - Signs and POSTs to `/postChainDetails`.
  - Returns `message`, `selectedSigningKey`, and `signingMessage`.
- `remove_from_chain_registry`
  - Remove chain details from the chain registry.
  - Input: `chainId`.
  - Signs and POSTs to `/removeChainDetails`.
  - Returns `message`, `selectedSigningKey`, and `signingMessage`.

SDK-only helpers (`buildAddToChainRegistry`, `buildRemoveFromChainRegistry`, `resolveChainRegistryEntry`) are **not** registered as MCP tools.

## Chain registry flow

1. (Optional) set preferred signer — `set_preferred_management_signer`.
2. List configured chains — `get_chain_registry` (optionally filter by `chain_id`).
3. Add chain — `add_to_chain_registry` with required fields:
   - `chainName`, `chainId`, `rpcGateway`
   - optional: `explorer`, `legacy` (default `false`), `testnet` (default `false`)
   - optional gas/fee tuning: `gasName`, `gasLimit`, `baseFee`, `priorityFee`, `baseFeeMultiplier` (min 100), `gasMultiplier`, `gasPrice`, `defaultGetSigFeeSpeed` (`slow`, `normal`, or `fast`)
4. Remove chain — `remove_from_chain_registry` with `chainId`.
5. Verify — `get_chain_registry`.

## Validation rules enforced

- `chainName`, `chainId`, and `rpcGateway` are required on add.
- `chainId` must be a non-empty string or non-negative integer on add/remove.
- `baseFeeMultiplier`, when provided, must be ≥ 100.

## Signing behavior

`add_to_chain_registry` and `remove_from_chain_registry` sign and submit internally. Clients pass business arguments only; do not orchestrate signing manually.

Successful responses may include `selectedSigningKey` (the Ed25519 key used) and `signingMessage` (canonical JSON that was signed).

## Client guidance

- Fetch registry state before add/remove to avoid duplicate entries or stale assumptions.
- Pass concrete `chainId` and RPC values from user selection or prior GET responses.
- Configure chain registry entries before token or signing workflows that depend on RPC/gas defaults.
- Load `management-signer.md` if signed operations fail due to missing or unavailable local keys.
