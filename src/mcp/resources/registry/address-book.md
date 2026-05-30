# Address Book Registry

This document covers the known-address registry (address book) managed through this server.

## Purpose

The address book stores operator-curated recipient and contract addresses with optional labels and chain scope. The node uses these entries in MPC signing workflows.

Read operations are unsigned GETs. Add and remove operations sign and POST internally with Ed25519 management signing.

## MCP tools

- `get_address_book_registry`
  - Get known addresses from the address book registry.
  - Optional query: `chain_type`, `chain_id`, `is_contract` (`"0"` or `"1"`).
  - Returns entries keyed by chain type (each entry includes `address`, optional `name`, `chainIds`, `isContract`, `updatedAt`).
- `add_to_address_book_registry`
  - Add an address to the address book registry.
  - Input: `chainType`, `address`; optional `name`, `chainIds`, `isContract`.
  - Signs and POSTs to `/addKnownAddress`.
  - Returns `message`, `selectedSigningKey`, and `signingMessage`.
- `remove_from_address_book_registry`
  - Remove an address from the address book registry.
  - Input: `chainType`, `address`.
  - Signs and POSTs to `/removeKnownAddress`.
  - Returns `message`, `selectedSigningKey`, and `signingMessage`.

SDK-only helpers (`buildAddToAddressBookRegistry`, `buildRemoveFromAddressBookRegistry`) are **not** registered as MCP tools.

## Address book flow

1. (Optional) set preferred signer — `set_preferred_management_signer`.
2. List current entries — `get_address_book_registry` (optionally filter by `chain_type` / `chain_id`).
3. Add or remove — `add_to_address_book_registry` or `remove_from_address_book_registry`.
4. Verify — `get_address_book_registry` with the same filters.

## Validation rules enforced

- Query fields must match schema (`is_contract` only `"0"` or `"1"` when provided).
- `chainType` and `address` are required for add/remove.
- `chainType` is normalized to lowercase. Addresses are normalized per chain type before POST.

## Signing behavior

`add_to_address_book_registry` and `remove_from_address_book_registry` sign and submit internally. Clients pass business arguments only; do not orchestrate signing manually.

Successful responses may include `selectedSigningKey` (the Ed25519 key used) and `signingMessage` (canonical JSON that was signed).

## Client guidance

- Fetch registry state before add/remove to avoid duplicate entries or stale assumptions.
- Pass concrete `chainType` and `address` values from user selection or prior GET responses.
- Load `management-signer.md` if signed operations fail due to missing or unavailable local keys.
