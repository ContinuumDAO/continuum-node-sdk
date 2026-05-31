# MPC Operations

This document covers MPC multi-sign request creation, agreement, Get Sig, Execute, and related workflows exposed through this server.

## Purpose

After KeyGen completes, group members use MPC keys to propose and execute on-chain actions via `multiSignRequest`. This server wraps those flows as MCP tools: building proposals, submitting sign requests, coordinating multi-agree approval, triggering MPC signatures (Get Sig), broadcasting transactions (Execute), and managing MPA wallet setup on Linea.

Most create tools return a new `requestId`. Lifecycle and execution tools operate on that ID through pending → ready → signed → executed states.

Prerequisites: a formed group, completed KeyGen (`fetch_key_gen_result`), configured chain registry entries where needed, and available management signing (`management-signer.md`).

## MCP tools

### Gas options (create + Get Sig)

- `get_multi_sign_gas_options`
  - Resolve Custom Gas Config and fee tier choices before creating or triggering Get Sig.
  - Input: `chainId` (for create planning) and/or `requestId` (for Get Sig planning).
  - Returns `chainRegistryCustomGas`, `defaultGetSigFeeSpeed`, `proposalUsedCustomGas` / `proposalCustomGas` when the sign request used `useCustomGas`, plus guidance for `useCustomGas` and `feeSpeedTier`.

### MultiSign request creation

All create tools below return `{ requestId }` unless noted.

Shared optional fields on most create inputs: `purpose`, `useCustomGas`, `startingNonce` (all require `keyGenId`).

- **`useCustomGas`** (default `false`): `false` = live RPC gas at proposal time; `true` = apply Custom Gas Config from the chain registry. Call `get_multi_sign_gas_options({ chainId })` and ask the user before creating.

- `register_key_gen_on_linea`
  - Register KeyGen with MultiSignAgentWallet on Linea (59144).
  - Input: `keyGenId`; optional `purpose`, `useCustomGas`, `startingNonce`.
- `transfer_native_gas`
  - Native gas transfer (send gas).
  - Input: `keyGenId`, `chainId`, `toAddress`, `amountWei`; optional shared fields.
- `transfer_erc20`
  - ERC-20 transfer.
  - Input: `keyGenId`, `chainId`, `tokenAddress`, `toAddress`, `amountWei`; optional `transferSig` and shared fields.
- `transfer_erc721`
  - ERC-721 `transferFrom`.
  - Input: `keyGenId`, `chainId`, `tokenAddress`, `toAddress`, `tokenId`; optional `fromAddress`, `transferSig`, and shared fields.
- `transfer_ctm_erc20`
  - Same-chain Continuum ERC-20 transfer.
  - Input: same shape as `transfer_erc20`.
- `transfer_ctm_erc20_cross_chain`
  - Cross-chain `c3transfer`.
  - Input: `keyGenId`, `chainId`, `tokenAddress`, `toStr`, `amountWei`, `toChainIdStr`; optional `transferSig` and shared fields.
- `create_compose_multi_sign_request`
  - Build a request from one or more compose actions (custom contract calls).
  - Input: `keyGenId`, `chainId`, `actions[]` (`signature`, `contractAddress`, `args[]`, optional `valueWei`); optional shared fields.
- `create_forge_multi_sign_request`
  - Build a request from Foundry broadcast JSON.
  - Input: `keyGenId`, `broadcast` (`transactions[]` with `transaction` or `tx` objects); optional `destinationChainID`, `overrideSender`, `startingNonce`, and shared fields.

### MPA wallet (Linea)

- `get_mpa_wallet_status`
  - Read MPA wallet registration and signing credits for a KeyGen.
  - Input: `keyGenId`.
  - Returns registration state, free transactions, deposit info, fee token, nonces, and optional error.
- `create_mpa_top_up_multi_sign_request`
  - Create batch `multiSignRequest` (approve + deposit) to top up MPA credits on Linea.
  - Input: `keyGenId`, `amountWei`; optional shared fields.
  - Fee token must be on the KeyGen executor.

### Sign request lifecycle

List/get tools return **compact summaries** by default (small fields: `requestId`, status, purpose, chain, keyGenId, timestamps). Use `get_sign_request_by_id({ requestId, compact: false })` only when you need the full API record.

- `list_sign_requests`
  - List sign requests with optional filter and pagination (Join/History tab).
  - Input: optional `filter`, `pagenum`, `pagesize` (default 20, max 50), `fromTime`, `toTime`.
  - Returns compact `requests[]` summaries and optional `total`.
- `get_sign_request_by_id`
  - Fetch a sign request by ID.
  - Input: `requestId`; optional `compact` (default `true`), `txParams: true` to include transaction params from the API.
  - Returns a compact summary by default, or the full sign request record when `compact: false`.
- `get_sign_request_status`
  - Combined lifecycle + broadcast readiness (preferred status check).
  - Input: `requestId`.
  - Returns `{ lifecycleStatus, getSigTriggered, hasSignature, executedOnChain, readyToBroadcast, ... }`.
  - **`lifecycleStatus: "success"` means MPC quorum agreed — not on-chain executed.** Use `executedOnChain` and `readyToBroadcast` before calling `broadcast_sign_result`.
- `tx_params_from_get_sign_request_id_data`
  - Parse tx params from GET `/getSignRequestById` data.
  - Input: `requestId`; optional `txParams`.
  - Returns `{ txParams }` with `nonce`, `gasLimit`, `txType` (`eip1559` or `legacy`), and fee fields.
- `sign_request_agree`
  - Agree to or reject a multi-agree sign request.
  - Input: `requestId`; optional `accept` (default agree), `thoughts` (max 256 chars).
  - Signs internally with Ed25519 management signing.
  - Returns `{ message }`.
- `shelve_sign_request`
  - Shelve a sign request (originator only).
  - Input: `requestId`.
  - Signs internally with Ed25519 management signing.
  - Returns `{ message }`.

### Get Sig / Execute

- `list_sign_requests_ready`
  - List sign requests ready for Get Sig / Execute.
  - Input: optional `pagenum`, `pagesize`.
  - Returns compact `{ requests[] }` summaries.
- `wait_for_sign_request_ready`
  - Poll until a sign request appears in the ready list.
  - Input: `requestId`; optional `pollMs`, `timeoutMs`.
  - Returns `{ ready, detail? }` where `detail` is a compact summary when ready.
- `trigger_sign_result`
  - Get Sig: trigger MPC signing with fresh tx params (does **not** broadcast). **Originator node only** — verify via the sign request `Purpose` key / originator fields, not merely `node_id`.
  - Input: `requestId`; optional `feeSpeedTier` (`slow`, `normal`, `fast`, `advanced`; default = chain `defaultGetSigFeeSpeed` from `get_multi_sign_gas_options`) and advanced fee overrides in gwei when tier is `advanced`.
  - Call `get_multi_sign_gas_options({ requestId })` first to show the user Custom Gas / default tier choices.
  - Returns `{ requestId, signResultSummary }` (compact — not the full sign result blob).
- `get_sign_result_summary`
  - Fetch a compact sign-result summary for broadcast planning.
  - Input: `requestId`.
  - Returns `{ requestId, signResultSummary }` with `executedOnChain`, `readyToBroadcast`, `hasSignature`, optional `transactionHashes`.
  - **`readyToBroadcast: true` and `executedOnChain: false`** → call `broadcast_sign_result`.
- `broadcast_sign_result`
  - Execute: broadcast signed tx(s) and mark sign result executed.
  - Input: `requestId` only in most cases; optional `signResultId`, `slowBatch`.
  - After Get Sig succeeds, call **only** `broadcast_sign_result({ requestId })` — do not re-load full sign requests/results unless debugging.
  - Returns `{ requestId, txHashes, status: "executed" }`.
- `bump_or_cancel_sign_result`
  - Bump or cancel stuck pending txs by creating a new `multiSignRequest`.
  - Input: `sourceRequestId`, `keyGenId`; optional `purposeNote`, `cancelPendingTx`.
  - Returns `{ requestId }`.

## Typical multi-sign flow

1. Create a proposal — call a create tool (e.g. `transfer_erc20`, `create_compose_multi_sign_request`) with a completed `keyGenId`.
2. Coordinate agreement — if the KeyGen uses multi-agree policy, peers call `sign_request_agree` until enough members accept (gate threshold applies to signing, not unanimous keygen-style agreement).
3. Track status — `list_sign_requests`, `get_sign_request_by_id`, or `get_sign_request_status`.
4. Wait for execution readiness — `list_sign_requests_ready` or `wait_for_sign_request_ready`.
5. Get Sig — `trigger_sign_result` (optionally tune fee tier). Use the returned `signResultSummary`; avoid pulling full sign-result payloads into chat context.
6. Execute — `broadcast_sign_result({ requestId })` only. Use `get_sign_result_summary` if you need execution details before broadcasting.
7. If txs are stuck — `bump_or_cancel_sign_result` to submit a replacement/cancel request.

## MPA on Linea flow

1. Complete KeyGen and fetch the result (`fetch_key_gen_result`).
2. Register on Linea — `register_key_gen_on_linea`.
3. Check wallet — `get_mpa_wallet_status`.
4. Top up credits if needed — `create_mpa_top_up_multi_sign_request`, then run the multi-sign flow above for that new request.

## List filters

`list_sign_requests` accepts optional `filter`:

- `all`, `pending`, `success`, `failed`, `originator`, `live`, `shelved`, `blocked`

Optional pagination: `pagenum`, `pagesize`. Optional time range: `fromTime`, `toTime` (Unix timestamps).

## Validation and behavior notes

- Create tools validate inputs against strict schemas (EVM addresses as `0x` + 40 hex chars, positive `chainId`, non-empty wei amounts as strings).
- `sign_request_agree` and `shelve_sign_request` use Ed25519 management signing internally; other create/execute tools build and submit `multiSignRequest` payloads through the MPC API layer.
- `trigger_sign_result` refreshes fee params and triggers MPC signing but does not broadcast on-chain.
- `broadcast_sign_result` submits signed transactions and marks the sign result executed.
- Shelving is restricted to the request originator.

## Client guidance

- Always retain `requestId` from create tools for lifecycle, Get Sig, and Execute steps.
- Resolve `keyGenId` from KeyGen tools before any MPC create call.
- Prefer compact list/get tools and `get_sign_result_summary` in agent flows; use `get_sign_request_by_id({ compact: false })` only when debugging.
- Inspect `tx_params_from_get_sign_request_id_data` before Get Sig when showing users nonce/gas details.
- Poll `wait_for_sign_request_ready` or list ready requests instead of assuming immediate executability.
- Load `keygen.md` for KeyGen setup and `registry/networks.md` for chain configuration dependencies.
- Load `management-signer.md` if management-signed agree/shelve operations fail.
