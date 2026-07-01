# API reference

All SDK functions return **`SdkResult<T>`**: `{ ok: true, data: T }` or `{ ok: false, reason: string }`.

Most functions take **`config: NodeSdkConfig`** as the first argument. Signed management actions also accept optional **`signing: ManagementSigningMethod`** (defaults to `{ kind: 'ed25519' }`; use `{ kind: 'eip191', signMessage }` for wallet signing — see [eip191-wagmi-viem.md](./eip191-wagmi-viem.md)).

### Modular signed POST flow

For management-signed POSTs, the UI can run three atomic steps:

1. **`build<ActionName>(config, input, signing?)`** → `SdkResult<BuiltManagementPostRequest>` with `{ path, unsignedBody, canonicalJson, selectedSigningKey? }`
2. **`managementSign(config, signing, unsignedBody)`** → POST-ready signed body
3. **`managementPost(config, path, signedBody)`** → node response

All-in-one exports (e.g. `createGroupRequest`) run these steps internally. MCP tools call the all-in-one exports only.

Canonical JSON helpers: `buildManagementCanonicalJson`, `buildManagementUnsignedBody`.

---

## Config

### `parseNodeSdkConfig(input)`
Parse and validate config JSON.
- **Input:** `unknown`
- **Output:** `NodeSdkConfig` (throws on invalid input)

### `nodeSdkConfigSchema`
Zod schema for `NodeSdkConfig`:
```typescript
{ node: { baseUrl, managementPort, mpcConfigPath }, signer: { defaultKey, defaultKeyPath } }
```

---

## General

### `nodeId(config)`
Get this node's 128-char hex ID.
- **Output:** `SdkResult<{ nodeId: string }>`

### `version(config)`
Get node software version info.
- **Output:** `SdkResult<{ version, versionDate, cggmp24UpstreamGitRev }>`

---

## Groups

### `availableNodeIds(config)`
List configured peer node IDs and IPs.
- **Output:** `SdkResult<{ nodeIps: string[]; nodeIds: string[] }>`

### `validGroupNodeSets(config)`
Enumerate valid MPC group node sets including this node (min 2 nodes).
- **Output:** `SdkResult<{ nodeSets: string[][] }>`

### `listGroupRequests(config, filter?)`
List group formation requests.
- **Input:** `filter?: 'all' | 'pending' | 'success' | 'failed'`
- **Output:** `SdkResult<{ groupRequests: GroupRequest[] }>`

### `listGroupResults(config)`
List completed groups.
- **Output:** `SdkResult<{ groups: GroupResult[] }>`

### `createGroupRequest(config, { nodeIds }, signing?)` / `buildCreateGroupRequest(...)`
Create a new group request (signed).
- **Input:** `{ nodeIds: string[] }` (min 2, must include this node)
- **Output:** `SdkResult<{ groupRequestId, selectedSigningKey?, signingMessage }>` (all-in-one) or `BuiltManagementPostRequest` (build-only)

### `acceptGroupRequest(config, { requestId }, signing?)` / `buildAcceptGroupRequest(...)`
Agree to a pending group request (signed).
- **Input:** `{ requestId: string }` (`NewGroup…` format)
- **Output:** `SdkResult<{ message, selectedSigningKey?, signingMessage }>` or `BuiltManagementPostRequest`

---

## Management signer

### `getManagementSigners(config)`
List allowed Ed25519 management keys and signing options with nonces.
- **Output:** `SdkResult<{ managementKeys, signingOptions }>`

### `getPreferredManagementSigner(config)` / `getManagementSigner(config)`
Get preferred Ed25519 key; `getManagementSigner` also returns nonce and nodeKey.
- **Output:** `SdkResult<{ publicKey }>` or `SdkResult<ManagementKeyResult>`

### `getManagementSigningContext(config, signing)`
Fetch `{ nonce, nodeKey }` (and `publicKey` for ed25519) for signing.
- **Input:** `ManagementSigningMethod`
- **Output:** `SdkResult<ManagementSigningContext>`

### `managementSign(config, signing, unsignedBody, options?)`
Sign a full unsigned management POST body (`clientSig: ''`, `nonce`, `nodeKey`, route fields) and return the POST-ready body.
- **Output:** `SdkResult<Record<string, unknown>>`

### `managementSignEd25519` / `managementSignEIP191`
Lower-level signers; accept unsigned body; return `{ body, canonicalJson }`.

### `buildManagementPostRequest(config, { path, buildRequestFields }, signing?)`
Shared builder used by `build*` exports. Returns `BuiltManagementPostRequest`.

### `buildSetPreferredManagementSigner` / `setPreferredManagementSigner(config, publicKey, signing?)`
Set preferred Ed25519 signer (signed POST).
- **Output:** `SdkEmptyResult` (all-in-one) or `BuiltManagementPostRequest` (build-only)

### `hasEd25519ManagementSigner(config)` (alias: `hasManagementSigner`)
- **Output:** `SdkResult<{ hasEdDSAKey: boolean }>`

### `listManagementSignersDetailed(config)`
Signers with local private-key availability.
- **Output:** `SdkResult<{ preferredSigner?, keys[] }>`

### `createLocalManagementSigner(config)` (deprecated)
Generates a **local-only** keypair under `added_keys/`; does **not** register on the node. Prefer **`addManagementSigner`** (server generates the key via `POST /addManagementKey`).

### `buildAddManagementSigner` / `addManagementSigner(config, signing?)`
Ask the node to generate and register a new Ed25519 management key (signed `POST /addManagementKey`; canonical body `{nonce, clientSig:"", nodeKey}`). Bootstrap signing uses `bootstrap_key/ed25519_private.hex` when bind-mounted.
- **Output:** `SdkResult<{ success, publicKey, nodeKey, keySlot?, fileName?, privateKeyPath?, publicKeyPath? }>` or `BuiltManagementPostRequest`

### Helpers
| Function | Purpose |
|----------|---------|
| `managementPost` | POST JSON to the management API |
| `buildManagementQueryPath` | Build GET paths with query params |
| `buildManagementPostBody` | Add `signedMessage` for EIP-191 bodies |
| `buildManagementCanonicalJson` / `buildManagementUnsignedBody` | Canonical signing JSON |
| `toSelectedSigner` | Map `ManagementKeyOption` → `SelectedSigningKey` |
| `DEFAULT_MANAGEMENT_SIGNING` | `{ kind: 'ed25519' }` |
| `withManagementClientSig` / `normalizeManagementNodeKey` | Multi-sign POST body helpers |

---

## KeyGen

Continuum uses **CGGMP24** and **FROST** MPC. The signing **`threshold`** is the minimum number of group members that must participate to produce a signature (not a polynomial degree).

The SDK exposes this value as **`gate`** on create requests and as **`Gate`** / **`gate`** on KeyGen request/result records returned from the node. These names are equivalent to the backend **`threshold`** field — there is no `+1` offset.

### `buildCreateKeyGenRequest` / `createKeyGenRequest(config, { groupId, gate, msgCheck, keyType }, signing?)`
Request MPC key generation (signed).
- **Input:** `gate` ≥ 2 — minimum nodes required to sign (sent to the node as `threshold`); `keyType`: `'ed25519' | 'secp256k1'`; `msgCheck`: `'multi-agree' | 'tx-check'`
- **Output:** `SdkResult<{ requestId, selectedSigningKey?, signingMessage }>` or `BuiltManagementPostRequest`

### `buildAcceptKeyGenRequest` / `acceptKeyGenRequest(config, { requestId }, signing?)`
Agree to a pending KeyGen request (signed).
- **Output:** `SdkResult<{ message, selectedSigningKey?, signingMessage }>` or `BuiltManagementPostRequest`

### `listKeyGenRequests(config, { filter?, pagenum?, pagesize? }?)`
- **Input:** `filter?: 'all' | 'pending' | 'success' | 'failed'`
- **Output:** `SdkResult<{ localNodeId, requests, agreementChecks }>` — each request includes **`Gate`** (signing threshold)

### `getKeyGenRequestById(config, requestId)` / `getKeyGenParentGroupId(config, requestId)`
Fetch one request or its parent group ID. Request objects include **`Gate`** (signing threshold).

### `fetchKeyGenResult(config, keyGenId)` / `fetchGlobalNonceByKeyGenId(config, keyGenId)`
KeyGen result record (may include **`gate`**, the signing threshold) and on-chain global nonce. For **`secp256k1`**, the canonical EVM executor/wallet address is **`ethereumaddress`** on the result — do not derive it from `pubkeyhex`.

### `getPreferredKeyGen(config)` / `buildPostPreferredKeyGen` / `postPreferredKeyGen(config, { keyGenId }, signing?)`
Read or store the agent default multi-agree KeyGen for `POST /multiSignRequest` (`GET /getPreferredKeyGen`, `POST /postPreferredKeyGen`).
- **Output (get):** `SdkResult<{ keyGenId, pubKey, keyType }>` — empty strings when nothing stored or KeyGen no longer eligible. Does **not** include an EVM address; call `fetchKeyGenResult` with `keyGenId` and read **`ethereumaddress`**.
- **Output (post):** `SdkResult<{ message, selectedSigningKey?, signingMessage }>` or `BuiltManagementPostRequest`

### KeyGen messaging

| Function | Input | Output |
|----------|-------|--------|
| `sendKeyGenMessage(config, { keyGenId, body, title? \| replyTo? }, signing?)` | top-level needs `title`; reply needs `replyTo` | `SdkResult<{ message, selectedSigningKey?, signingMessage }>` |
| `buildSendKeyGenMessage(config, input, signing?)` | same | `BuiltManagementPostRequest` |
| `listKeyGenMessages(config, query)` | `keyGenId`, optional filters | `SdkResult<{ list, total }>` |
| `getKeyGenMessageById(config, { keyGenId, messageId })` | — | `SdkResult<KeyGenMessage>` |
| `getKeyGenMessageThread(config, { keyGenId, messageId })` | top-level id | `SdkResult<KeyGenMessageWithReplies>` |
| `markKeyGenMessageRead(config, { keyGenId, messageId, signature? }, signing?)` | — | `SdkResult<{ message: 'ok', selectedSigningKey?, signingMessage }>` |
| `buildMarkKeyGenMessageRead(config, input, signing?)` | same | `BuiltManagementPostRequest` |
| `multiMarkKeyGenMessagesRead(config, { keyGenId, messageIds, signature? }, signing?)` | non-empty `messageIds` | `SdkResult<{ marked, notFound, selectedSigningKey?, signingMessage }>` |
| `buildMultiMarkKeyGenMessagesRead(config, input, signing?)` | same | `BuiltManagementPostRequest` |
| `deleteKeyGenMessage(config, { keyGenId, messageId }, signing?)` | originator only | `SdkResult<{ deleted, selectedSigningKey?, signingMessage }>` |
| `buildDeleteKeyGenMessage(config, input, signing?)` | same | `BuiltManagementPostRequest` |
| `multiDeleteKeyGenMessages(config, { keyGenId, messageIds }, signing?)` | non-empty `messageIds` | `SdkResult<{ deleted, notFound, forbidden, selectedSigningKey?, signingMessage }>` |
| `buildMultiDeleteKeyGenMessages(config, input, signing?)` | same | `BuiltManagementPostRequest` |

Orchestration sub-agents should call `sendKeyGenMessage` once per task with `replyTo` set to the top-level orchestration message id and an `mpc-task-result v1` body (not `mpc-orchestrate-task`). The orchestrator posts synthesis as a KeyGen reply when all tasks are terminal. External inbox scripts may use `multiMarkKeyGenMessagesRead` after polling; sub-agents should not poll for orchestration completion.

---

## Node info

| Function | Input | Output data |
|----------|-------|-------------|
| `getMachineInfo(config, { refresh? })` | optional refresh flag | `MachineInfoSchema` |
| `getSuccessRate(config, { hours? })` | optional hours | `SuccessRateSchema` |
| `getSubscriptions(config)` | — | `SubscriptionSchema[]` |
| `getHealth(config)` | — | `HealthSchema` |
| `getConnectivityHealth(config)` | — | connectivity groups |
| `getLogs(config, { hours? })` | optional hours | `LogsSchema` |

---

## Registries

### Address book

| Function | Input | Output |
|----------|-------|--------|
| `getAddressBookRegistry(config, query?)` | `GetKnownAddressesQuery` | `GetKnownAddressesData` |
| `buildAddToAddressBookRegistry` / `addToAddressBookRegistry(...)` | `{ chainType, address, name?, chainIds?, isContract? }` | signed result or `BuiltManagementPostRequest` |
| `buildRemoveFromAddressBookRegistry` / `removeFromAddressBookRegistry(...)` | `{ chainType, address }` | same signed result shape |

### Token registry

| Function | Input | Output |
|----------|-------|--------|
| `getTokenRegistry(config, query?)` | `GetTokenRegistryQuery` | `GetTokenRegistryData` |
| `buildAddToTokenRegistry` / `addToTokenRegistry(...)` | `{ chainType, chainId, tokenType, contract, transferSig?, transferNames? }` | signed result or `BuiltManagementPostRequest` |
| `buildRemoveFromTokenRegistry` / `removeFromTokenRegistry(...)` | `{ chainType, chainId, tokenType, contractAddress, tokenId? }` | signed result |

Token types: `'ERC20' | 'ERC721' | 'CTMERC20' | 'CTMRWA1'`.

### Chain registry

| Function | Input | Output |
|----------|-------|--------|
| `getChainRegistry(config, query?)` | `{ chain_id? }` | `{ chains: ChainRegistryEntry[] }` |
| `resolveChainRegistryEntry(config, chainId)` | `number \| string` | `ChainRegistryEntry` |
| `buildAddToChainRegistry` / `addToChainRegistry(...)` | `AddChainRegistryInput` | signed result or `BuiltManagementPostRequest` |
| `buildRemoveFromChainRegistry` / `removeFromChainRegistry(...)` | `{ chainId }` | signed result |

---

## MPC (multi-sign)

Common create input fields (`MpcCommonCreateInputSchema`): `{ keyGenId, purpose?, useCustomGas?, startingNonce? }`.

### Create requests

| Function | Schema | Output |
|----------|--------|--------|
| `createComposeMultiSignRequest` | `CreateComposeInputSchema` (+ `chainId`, `actions[]`) | `{ requestId }` |
| `createForgeMultiSignRequest` | `CreateForgeInputSchema` (+ Foundry `broadcast`) | `{ requestId }` |
| `createJoinedMultiSignRequest` | `JoinMultiSignRequestsInputSchema` (`payloadA`, `payloadB`, `firstNonce`) | `{ requestId }` |
| `transferNativeGas` | `TransferNativeInputSchema` | `{ requestId }` |
| `transferErc20` / `transferErc721` | `TransferErc20/721InputSchema` | `{ requestId }` |
| `transferCtmErc20` | same as ERC20 | `{ requestId }` |
| `transferCtmErc20CrossChain` | `TransferC3InputSchema` | `{ requestId }` |
| `registerKeyGenOnLinea` | `RegisterKeyGenInputSchema` | `{ requestId }` |
| `createMpaTopUpMultiSignRequest` | `MpaTopUpInputSchema` (+ `amountWei`) | `{ requestId }` |
| `createMpaSyncBillingMultiSignRequest` | `MpaSyncBillingInputSchema` | `{ requestId }` |
| `createMpaOveragePurchaseMultiSignRequest` | `MpaOveragePurchaseInputSchema` (+ `signatureCount`) | `{ requestId }` |
| `registerVpnOnLinea` | `MpaVpnHostInputSchema` (+ `hostIpAddress`) | `{ requestId }` |
| `createMpaVpnDepositMultiSignRequest` | `MpaVpnDepositInputSchema` | `{ requestId }` |
| `createMpaSyncVpnBillingMultiSignRequest` | `MpaVpnHostInputSchema` | `{ requestId }` |
| `getMpaVpnStatus` | `MpaVpnStatusInputSchema` | VPN billing status object |
| `signAndSubmitMultiSignRequest` | `unsignedBody` or route-only fields, `signing?` | `{ requestId }` |

### Join / History lifecycle

| Function | Input | Output |
|----------|-------|--------|
| `listSignRequests(config, { filter?, pagenum?, pagesize?, fromTime?, toTime? })` | filter: `all`, `live`, `pending`, `success`, `blocked`, `shelved`; default `pagesize` 20 | compact `{ requests, total? }` via MCP; full rows from core |
| `listSignRequestsAwaitingJoin(config)` | none | `{ localNodeId, requests, joinAgreementChecks }` — Join tab (merges `live` + `pending`, same as node app) |
| `getSignRequestById(config, { requestId, compact?, txParams? })` | sign request ID; `compact` defaults true | compact `SignRequestSummary`, full record when `compact: false`, or `ProposalTxParams` when `txParams: true` |
| `buildSignRequestAgree` / `signRequestAgree(config, { requestId, accept?, thoughts? }, signing?)` | agree/reject body | `{ message }` or `BuiltManagementPostRequest` |
| `buildShelveSignRequest` / `buildUpdateSignResultStatusShelved` / `shelveSignRequest(config, { requestId }, signing?)` | originator shelve; auto-routes to `/shelveSignRequest` or `/updateSignResultStatusById` when a sign result exists | `{ message }` or `BuiltManagementPostRequest` |

### Get Sig → Execute

| Function | Input schema | Output |
|----------|--------------|--------|
| `listSignRequestsReady` | `ListReadyInputSchema` | compact `{ requests: SignRequestSummary[] }` |
| `waitForSignRequestReady` | `WaitReadyInputSchema` | `{ ready, detail? }` (compact summary when ready) |
| `getSignResultSummary` | `GetSignResultSummaryInputSchema` | `{ requestId, signResultSummary }` |
| `buildTriggerSignResult` / `triggerSignResult` | `TriggerSignResultInputSchema` | `{ requestId, signResultSummary }` or `BuiltManagementPostRequest` |
| `getMultiSignGasOptions` | `GetMultiSignGasOptionsInputSchema` | gas/tier guidance for create + Get Sig |
| `buildBroadcastSignResult` / `broadcastSignResult` | `BroadcastSignResultInputSchema` | `{ requestId, txHashes, status: 'executed' }` or `BuiltBroadcastSignResult` |
| `buildBroadcastSignResultStatusUpdate` | `{ requestId, txHashes }` | `BuiltManagementPostRequest` |
| `bumpOrCancelSignResult` | `BumpSignResultInputSchema` | `{ requestId }` |

### MPA wallet

### `getMpaWalletStatus(config, { keyGenId })`
Read MultiSignAgentWallet registration and credit state.
- **Output:** `SdkResult<MpaWalletStatusSchema>`

### `createMpaSyncBillingMultiSignRequest`, `createMpaOveragePurchaseMultiSignRequest`
KeyGen monthly billing activation and overage signature purchase on Linea.
- **Input:** `MpaSyncBillingInputSchema` or `MpaOveragePurchaseInputSchema`
- **Output:** `{ requestId }`

### `registerVpnOnLinea`, `createMpaVpnDepositMultiSignRequest`, `createMpaSyncVpnBillingMultiSignRequest`, `getMpaVpnStatus`
VPN billing registration, deposit, month sync, and status reads on Linea.
- **Input:** `MpaVpnHostInputSchema`, `MpaVpnDepositInputSchema`, or `MpaVpnStatusInputSchema`
- **Output:** `{ requestId }` for create tools; `MpaVpnStatusSchema` for status

### `computeVpnHostBinding(nodeKey, hostIpAddress)`
Returns `keccak256(encodePacked(nodeKey, hostIpAddress))` for VPN on-chain calls.

### Context helpers

| Function | Output |
|----------|--------|
| `createPublicClientForChain(config, chainId)` | `SdkResult<{ publicClient, chainDetail }>` |
| `executorAddressFromKeyGen(keyGenResult)` | executor `Address` |

### VPN (admin + egress)

| Function | Input | Output |
|----------|-------|--------|
| `getVpnStatus` | none | admin VPN status |
| `setVpnEnabled` | `SetVpnEnabledInputSchema` | set-enabled result + signing metadata |
| `downloadVpnAdminClientConfig` | `DownloadVpnAdminClientConfigInputSchema` | saved paths under user_folder |
| `getVpnEgressStatus` | none | egress provider status |
| `listVpnEgressExits` | none | `{ exits[] }` from other nodes |
| `setVpnEgressSharing` | `SetVpnEgressSharingInputSchema` | sharing apply result |
| `revokeVpnEgressPeer` | `RevokeVpnEgressPeerInputSchema` | revoke result |
| `downloadVpnEgressClientConfig` | `DownloadVpnEgressClientConfigInputSchema` | saved egress config paths |

User folder default: `MPC_AUTH_USER_FOLDER` or `/app/user_folder` (`resolveUserFolderPath`).
| `assertExecutorNativeSufficientForProposal` | gas preflight before MPC create |
| `doesOriginatorHaveSufficientNativeForValuePlusGasMax` | native balance check helper |

### Sign request utilities

| Function | Purpose |
|----------|---------|
| `isBatchSignRequest` | Detect batch sign requests |
| `buildBatchSignedTxsFromResult` | Build signed tx hexes from sign result |
| `txParamsFromGetSignRequestIdData` | Parse tx params from GET detail |
| `getSignRequestStatus` | Normalize lifecycle status string |
| `getSignRequestOriginatorNodeKey` | Originator node key from `Purpose` map |
| `joinClientAgreementProgress` | Count Join Accepts via `ClientSigs` / `KeyList` |
| `thisNodeHasJoinClientSigInSignRequest` | Whether local node already Join-agreed |
| `signRequestJoinAgreementState` | Local Accept/Reject pending state + note |
| `mergeSignRequestJoinListRows` | Merge live + pending Join-tab rows |
| `chainSnapshotForCustomGasExtraJSON` | Parse custom gas from ExtraJSON |
| `broadcastErrorMessage` | User-friendly broadcast error text |

---

## EVM helpers

| Function | Description | Output |
|----------|-------------|--------|
| `buildMultiSignProposal` | Build unsigned MPC proposal (canonical management body) | `BuiltMultiSignProposal` |
| `encodeActionCalldata` | ABI-encode contract call from signature + args | `{ data: hex }` |
| `fetchChainFeeParams` | EIP-1559 vs legacy fee discovery via RPC | `ChainFeeParams` |
| `resolveGetSigFeeWei` | Resolve fee tier for Get Sig | legacy or EIP-1559 fee struct |
| `normalizeGetSigFeeSpeedTier` | Normalize tier string | `'slow' \| 'normal' \| 'fast'` |
| `getDefaultGetSigFeeSpeedFromChainDetail` | Chain default Get Sig speed | tier |
| `fetchGetSigTierFeePreviewLines` | Human-readable fee preview lines | `string[]` |
| `composeFeePayloadToTxParams` | Map fee payload to tx params | `ProposalTxParams` |
| `gasLimitFromEstimateAndChainConfig` | Apply chain gas limit rules | `bigint` |
| `triggerTxParamsFromComposeBody` | Extract trigger params from compose body | tx params |
| `generateSignRequestWithFoundryScript` | Build sign-request payload from Foundry broadcast JSON | `SignRequestPayload` |
| `broadcastWithOverrideSender` | Rewrite broadcast txs with sender + nonce | `FoundryBroadcastJson` |

---

## Agent MCP servers

| Function | Description |
|----------|-------------|
| `listMcpServers` | GET `/listMcpServers` (`availableCatalog` from bind-mounted `agent_llm_config.defaults/MCP_servers.json`) |
| `getMcpServer` | GET `/getMcpServer` |
| `addMcpServerFromCatalog` | POST `/addMcpServerFromCatalog` (signed; activate one catalog id) |
| `addMcpServer` | POST `/addMcpServer` (signed; strict transport union: HTTP requires url, STDIO requires command) |
| `removeMcpServer` | POST `/removeMcpServer` (signed) |

## Agent environment variables

| Function | Description |
|----------|-------------|
| `addEnvironmentVariable` | POST `/addEnvironmentVariable` (signed); response omits secret value |

## Agent webhooks

| Function | Description |
|----------|-------------|
| `listWebhooks` | GET `/listWebhooks` (active + availableCatalog) |
| `getWebhook` | GET `/getWebhookById` |
| `addWebhook` | POST `/addWebhook` (strict Zod: name, type, prompt) |
| `addWebhookFromCatalog` | POST `/addWebhookFromCatalog` |
| `updateWebhook` | POST `/updateWebhook` |
| `activateWebhook` / `deactivateWebhook` | POST activate/deactivate |
| `removeWebhook` | POST `/removeWebhook` |
| `runWebhook` | POST `/runWebhook` (test trigger) |

---

## MCP

Thin wrappers over core functions (Ed25519 signing only).

| Function | Registers |
|----------|-----------|
| `createContinuumMcpServer(config)` | New MCP server with all tools |
| `registerContinuumTools(server, config)` | All tool groups below |
| `registerNodeTools` | `nodeId`, `version`, node info |
| `registerGroupTools` | group list/create/accept |
| `registerKeyGenTools` | KeyGen CRUD + preferred KeyGen |
| `registerManagementSignerTools` | management key admin |
| `registerAddressBookTools` / `registerTokenRegistryTools` / `registerChainRegistryTools` | registries |
| `registerAgentMcpServerTools` | agent MCP list / add from catalog / custom add / remove |
| `registerAgentEnvironmentVariableTools` | agent Variables (`add_environment_variable`) |
| `registerAgentWebhookTools` | inbound webhooks list / add / lifecycle |
| `registerMpcTools` | MPC create / Get Sig / Execute |

Utilities: `wrapSdk`, `sdkResultToCallToolResult`, `camelToSnake`.

---

## Key types & schemas

Exported Zod schemas include: `NodeIdSchema`, `GroupRequestSchema`, `GroupResultSchema`, `KeyGenRequestSchema`, `ManagementSigningMethodSchema`, `SelectedSigningKeySchema`, `ChainRegistryEntrySchema`, `AddChainRegistryInputSchema`, and MPC input schemas in `core/mpc/schemas.ts`.

**`ManagementSigningMethod`:** `{ kind: 'ed25519' }` or `{ kind: 'eip191', signMessage: (msg) => Promise<string> }`.

**`SdkResult<T>`** / **`SdkEmptyResult`** / **`SdkPreparedResult<T>`** — see `core/result.ts`.
