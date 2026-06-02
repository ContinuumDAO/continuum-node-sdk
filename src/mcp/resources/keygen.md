# Key Generation

This document covers MPC key generation request lifecycle in this server.

## Purpose

After a group is formed, keygen creates one MPC keypair shared across group members. KeyGen creation itself is unanimous: all requested group members must accept the request. The originator auto-agrees when creating the request and does not need a separate accept step.
That key can later be used in signing workflows.

## MCP tools

- `create_key_gen_request`
  - Initiate a request to members of a group to generate a new MPC key pair.
  - Input: `groupId`, `gate` (integer ≥ 2), `msgCheck`, `keyType`.
  - Signs and POSTs internally with Ed25519 management signing.
  - Returns `requestId`, `selectedSigningKey`, and `signingMessage`.
- `accept_key_gen_request`
  - Accept a pending MPC key generation request.
  - Input: `requestId` (KeyGen ID).
  - Signs and POSTs internally.
  - Returns `message`, `selectedSigningKey`, and `signingMessage`.
- `list_key_gen_requests`
  - List MPC key generation requests with optional filter and pagination.
  - Input: optional `filter`, `pagenum`, `pagesize`.
  - Returns `localNodeId`, `requests`, and `agreementChecks` (whether this node must accept each request).
- `get_key_gen_request_by_id`
  - Get a single MPC key generation request by ID.
  - Input: `id` (KeyGen ID).
  - Returns `request`, `localNodeId`, `isOriginatorLocal`, `agreementRequired`, and `note`.
- `fetch_key_gen_result`
  - Get a single MPC key generation result document by request ID.
  - Input: `id` (KeyGen ID).
  - Returns the result payload from `/getKeyGenResultById` (shape varies by key type and status).
- `get_key_gen_parent_group_id`
  - Get the parent group ID for a key generation request.
  - Input: `id` (KeyGen ID).
  - Returns `requestid` and `groupId`.
- `fetch_global_nonce_by_key_gen_id`
  - Get the global nonce for a key generation request.
  - Input: `id` (KeyGen ID).
  - Returns `globalNonce`.
- `get_preferred_key_gen`
  - Get the default multi-agree KeyGen for agent `POST /multiSignRequest` (`GET /getPreferredKeyGen`).
  - Input: none.
  - Returns `keyGenId`, `pubKey`, and `keyType` while the stored KeyGen is still eligible; empty strings when nothing is stored or the KeyGen is no longer valid.
- `post_preferred_key_gen`
  - Store a multi-agree KeyGen request id as the agent default for composing multiSignRequest payloads (`POST /postPreferredKeyGen`).
  - Input: `keyGenId` (KeyGen request ID).
  - Signs and POSTs internally.
  - Returns `message`, `selectedSigningKey`, and `signingMessage`.

SDK-only helpers (`buildCreateKeyGenRequest`, `buildAcceptKeyGenRequest`, `buildPostPreferredKeyGen`) are **not** registered as MCP tools.

## Create keygen flow

1. Ensure group exists and members agreed
   - Validate via group tools (`list_group_results`) before keygen.
2. (Optional) set preferred signer
   - Call `set_preferred_management_signer`.
3. Create request
   - Call `create_key_gen_request` with:
     - `groupId` — 64-character hex group ID
     - `gate` — signing threshold: minimum number of group members that must participate to sign (CGGMP24/FROST)
     - `msgCheck` — `multi-agree` or `tx-check`
     - `keyType` — `ed25519` or `secp256k1`
4. Peers accept
   - Each non-originator group member calls `accept_key_gen_request` with the pending `requestId`.
   - KeyGen is formed only when all requested members have agreed; originator agreement is automatic on request creation.
   - Use `list_key_gen_requests` or `get_key_gen_request_by_id` to read `agreementRequired` / `isOriginatorLocal`.
5. Track progress
   - Poll `list_key_gen_requests` (optional filters below) or `get_key_gen_request_by_id`.
6. Read result
   - Call `fetch_key_gen_result` when the request has completed successfully.
   - Optionally call `fetch_global_nonce_by_key_gen_id` or `get_key_gen_parent_group_id` for follow-up workflows.

## Inputs that matter

- `groupId`: target group to generate a key for.
- `gate`: CGGMP24/FROST signing threshold (minimum nodes required to sign after KeyGen completes). Sent to the API as `threshold`. Gate does not change unanimous agreement requirements for group or keygen creation.
- `msgCheck`: downstream signing policy mode (`multi-agree` or `tx-check`).
- `keyType`: MPC key curve/type (`ed25519` or `secp256k1`).

## List filters

`list_key_gen_requests` accepts optional `filter`:

- `all`
- `pending`
- `success`
- `failed`
- `agree`
- `originator`

Optional pagination: `pagenum` (non-negative integer), `pagesize` (positive integer).

## Signing behavior

`create_key_gen_request` and `accept_key_gen_request` sign and submit internally. Pass business arguments only (`groupId`, `gate`, `msgCheck`, `keyType`, or `requestId`); do not orchestrate signing manually.

Successful responses may include `selectedSigningKey` (the Ed25519 key used) and `signingMessage` (canonical JSON that was signed).

## Status expectations

Keygen requests can move through states such as:

- `pending`
- `agree`
- `success`
- `failed`

Exact transitions depend on group member participation and backend processing.

## Client guidance

- Show users the `requestId` immediately after creation (format: `KeyGen…`).
- Keep the request ID available for accept and query tools.
- Check `agreementChecks` or `agreementRequired` before prompting a user to accept.
- Prefer explicit polling over assumptions about completion timing.
- Load `management-signer.md` if signing fails due to missing or unavailable local keys.
