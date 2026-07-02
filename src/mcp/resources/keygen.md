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
  - Get the MPC key generation result for a completed KeyGen (`GET /getKeyGenResultById`).
  - Input: `id` (KeyGen ID).
  - Returns the result payload (shape varies by key type and status). For **`secp256k1`**, the EVM executor/wallet address is **`ethereumaddress`** — use it as-is; do **not** derive an address from `pubkeyhex` or from `pubKey` on `get_preferred_key_gen`.
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
  - Returns `keyGenId`, `pubKey`, and `keyType` only (no EVM address). Empty strings when nothing is stored or the KeyGen is no longer valid. For executor address, chain with `fetch_key_gen_result` — see **EVM executor address** below.
- `post_preferred_key_gen`
  - Store a multi-agree KeyGen request id as the agent default for composing multiSignRequest payloads (`POST /postPreferredKeyGen`).
  - Input: `keyGenId` (KeyGen request ID).
  - Signs and POSTs internally.
  - Returns `message`, `selectedSigningKey`, and `signingMessage`.
- `send_key_gen_message`
  - Send a top-level or reply message in a KeyGen channel (`POST /sendMessage`).
  - Input: `keyGenId`, `body`, and either `title` (top-level) or `replyTo` (reply).
  - **Orchestration sub-agents:** one reply with `replyTo` set to the top-level message id and `mpc-task-result v1` in the body (not `mpc-orchestrate-task`; no `@agent`). Include human-readable findings for the KeyGen group. Reference charts via `charts[].attachmentId` from **`post_key_gen_chart_attachment`** — do not paste chart JSON in the body. **Orchestrator synthesis:** post a reply to the same top-level id when all tasks finish. Do not poll `list_key_gen_messages` for orchestration completion.
  - Body max **65536** UTF-8 chars; rate limit 6/min per keyGen.
  - Signs and POSTs internally.
  - Returns `message`, `selectedSigningKey`, and `signingMessage`.
- `post_key_gen_chart_attachment`
  - Upload a **`continuum/chart/v1`** JSON blob (`POST /postKeyGenChartAttachment`). Returns `attachmentId` and `sha256` for `mpc-task-result` `charts[]` refs.
  - Input: `keyGenId`, `bytes` (full prepare_chart JSON); optional `messageId`, `kind`.
- `get_key_gen_message_attachment`
  - Fetch attachment bytes by id (`GET /getKeyGenMessageAttachment`).
  - Input: `keyGenId`, `attachmentId`.
- `list_key_gen_messages`
  - List KeyGen channel messages (`GET /listMessages`).
  - Input: `keyGenId`; optional `unread`, `topLevel`, `fromTime`, `toTime`, `pagenum`, `pagesize`.
  - Returns `{ list, total }`.
- `get_key_gen_message_by_id`
  - Get one message (`GET /getMessageById`).
  - Input: `keyGenId`, `messageId`.
- `get_key_gen_message_thread`
  - Get a top-level message and nested replies (`GET /getMessageThread`).
  - Input: `keyGenId`, `messageId` (top-level id).
- `mark_key_gen_message_read`
  - Mark one message read for this node (`POST /markMessageRead`).
  - Input: `keyGenId`, `messageId`; optional `signature` for the read receipt.
  - Signs and POSTs internally.
  - Returns `message` (`ok`), `selectedSigningKey`, and `signingMessage`.
- `multi_mark_key_gen_messages_read`
  - Mark multiple messages read (`POST /multiMarkMessagesRead`).
  - Input: `keyGenId`, `messageIds` (non-empty); optional `signature`.
  - Signs and POSTs internally.
  - Returns `marked`, `notFound`, `selectedSigningKey`, and `signingMessage`.
  - Intended for external inbox poll scripts, not orchestration sub-agent return paths.
- `delete_key_gen_message`
  - Soft-delete a message and its reply tree (`POST /deleteMessage`). Originator only.
  - Input: `keyGenId`, `messageId`.
  - Signs and POSTs internally.
  - Returns `deleted`, `selectedSigningKey`, and `signingMessage`.
- `multi_delete_key_gen_messages`
  - Batch soft-delete messages and reply trees (`POST /multiDeleteMessages`). Originator only per id.
  - Input: `keyGenId`, `messageIds` (non-empty).
  - Signs and POSTs internally.
  - Returns `deleted`, `notFound`, `forbidden`, `selectedSigningKey`, and `signingMessage`.

SDK-only helpers (`buildCreateKeyGenRequest`, `buildAcceptKeyGenRequest`, `buildPostPreferredKeyGen`, `buildSendKeyGenMessage`, `buildMarkKeyGenMessageRead`, `buildMultiMarkKeyGenMessagesRead`, `buildDeleteKeyGenMessage`, `buildMultiDeleteKeyGenMessages`) are **not** registered as MCP tools.

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
   - For `secp256k1`, read **`ethereumaddress`** from the result when you need the on-chain MPC wallet (executor).
   - Optionally call `fetch_global_nonce_by_key_gen_id` or `get_key_gen_parent_group_id` for follow-up workflows.

## EVM executor address (preferred KeyGen)

When the user asks for the **Ethereum address** of the **preferred** KeyGen (or “MPC wallet” / “executor” for EVM txs):

1. `get_preferred_key_gen` → `keyGenId` (ignore `pubKey` for address answers).
2. `fetch_key_gen_result` with `{ "id": "<keyGenId>" }` → **`ethereumaddress`**.

Do **not** (even when `fetch_key_gen_result` errors):

- Convert `pubKey` or `pubkeyhex` to an address (Keccak-256 in the model is wrong often; never “derive manually”).
- Explain how derivation works instead of fixing the lookup.
- Infer the address from past transaction `from` / swapper fields.

On **`fetch_key_gen_result` failure**, report the exact tool error, suggest **retry**, and point to the **node UI** KeyGen result page. A request can show **success** before this node returns a result object from `/getKeyGenResultById`.

`get_preferred_key_gen` intentionally omits `ethereumaddress` so the full result stays on `/getKeyGenResultById`.

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

- For EVM executor address questions, use **EVM executor address** above (`get_preferred_key_gen` then `fetch_key_gen_result`).
- Show users the `requestId` immediately after creation (format: `KeyGen…`).
- Keep the request ID available for accept and query tools.
- Check `agreementChecks` or `agreementRequired` before prompting a user to accept.
- Prefer explicit polling over assumptions about completion timing.
- Load `management-signer.md` if signing fails due to missing or unavailable local keys.
