# Group Operations

This document explains how to create and manage MPC groups with this server.

## Purpose

Groups define which node IDs can participate in key generation and signing.
A valid group must include your node and at least one peer. Group creation is unanimous: all requested nodes must accept before the group is formed. The originator is auto-agreed when creating the request and does not perform a separate accept step.

## MCP tools

- `list_group_requests`
  - List MPC group requests with an optional filter (`all`, `pending`, `success`, `failed`; default `all`).
  - Returns `groupRequests` entries with request ID, group ID, key list, status, originator, and signatures.
- `list_group_results`
  - List completed MPC group results.
  - Returns `groups` with `groupId` and `nodeKeys`.
- `create_group_request`
  - Create a new MPC group request for the given `nodeIds` (minimum 2).
  - Signs and POSTs internally with Ed25519 management signing.
  - Returns `groupRequestId`, `selectedSigningKey`, and `signingMessage`.
- `accept_group_request`
  - Accept a pending MPC group request by `requestId`.
  - Signs and POSTs internally with Ed25519 management signing.
  - Returns `message`, `selectedSigningKey`, and `signingMessage`.

SDK-only helpers (`availableNodeIds`, `validGroupNodeSets`, `buildCreateGroupRequest`, `buildAcceptGroupRequest`) are **not** registered as MCP tools. Use `node_id` to read this node's ID and pass explicit `nodeIds` to `create_group_request`; the server validates them against configured nodes.

## Create group flow

1. Read this node's ID
   - Call `node_id`.
2. Ask the user which peer node IDs to include
   - `nodeIds` must be 128-character hex node IDs from configured nodes.
3. (Optional) set preferred signer
   - Call `set_preferred_management_signer`.
4. Submit group request
   - Call `create_group_request` with `nodeIds`.
5. Group peers accept
   - Other members call `accept_group_request` with the pending `requestId`.
   - All requested nodes must accept; otherwise group creation does not complete. The originator is already counted as agreed at creation time.
6. Verify completion
   - Use `list_group_results`, or filter `list_group_requests` with `success`.

## Validation rules enforced

`create_group_request` validates before signing:

- `nodeIds` must contain at least 2 unique values (duplicates are normalized away).
- Every ID must be a configured node ID (including this node).
- This node's ID must be included in `nodeIds`.
- A group with the same node set must not already exist.

`accept_group_request` validates before signing:

- `requestId` must be a valid group request ID (`NewGroup` + 25 hex characters). A hex suffix without the prefix is accepted and normalized automatically.
- The request must exist and have status `pending`.

## Signing behavior

`create_group_request` and `accept_group_request` sign and submit internally. Clients only pass business arguments (`nodeIds` or `requestId`). Do not use separate signing or build/sign/post tools.

Successful responses may include `selectedSigningKey` (the Ed25519 key used) and `signingMessage` (canonical JSON that was signed).

## Notes for MCP clients

- Prompt users for concrete node-ID choices, not free text.
- Use `list_group_requests` with `filter: "pending"` to find requests awaiting acceptance.
- Treat tool responses as source of truth for IDs and status.
- Load `management-signer.md` if signing fails due to missing or unavailable local keys.
