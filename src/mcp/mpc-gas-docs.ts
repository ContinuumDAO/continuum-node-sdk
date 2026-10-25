/** Shared MCP guidance for multiSignRequest create tools (useCustomGas). */
export const MULTISIGN_CREATE_GAS_GUIDANCE =
	'Call get_multi_sign_gas_options({ chainId }) before creating; ask the user whether useCustomGas should be false (live RPC, default) or true (Custom Gas Config from chain registry). Pass useCustomGas on this tool.';

/** Forge dry-run import: do not block the import to ask about gas. */
export const MULTISIGN_FORGE_IMPORT_GAS_GUIDANCE =
	'Default useCustomGas false (live RPC). Call get_multi_sign_gas_options or ask only if the operator mentioned custom gas or fee config. Do not stop the import to ask.';

/** Shared MCP guidance for Get Sig (feeSpeedTier). */
export const TRIGGER_SIGN_GAS_GUIDANCE =
	'Call get_multi_sign_gas_options({ requestId }) before Get Sig; ask the user for feeSpeedTier (default triggerSignResult.defaultFeeSpeedTier) or advanced gwei overrides. Proposal custom gas (useCustomGas at create) is applied automatically when present.';

/** Execute guidance — avoid bulky reads in the same turn. */
export const BROADCAST_SIGN_RESULT_GUIDANCE =
	'Broadcast on-chain: call broadcast_sign_result({ requestId }) when get_sign_request_status or get_sign_result_summary shows readyToBroadcast true and executedOnChain false. Sign-request lifecycleStatus "success" is quorum agreed only — not on-chain execution. Bitcoin payments (native SegWit and Taproot key-path) use this same tool. When bitcoinSecurityCheck is off, the raw transaction is posted to Esplora and the returned txid must match the txid computed from that raw transaction. When it is on, this node sends the signed raw transaction to the Bitcoin security server and marks executed only after that server attests the exact transaction is in its mempool. Do not fee-bump a payment the security server refuses; rebroadcast the original raw transaction. Returns { requestId, txHashes, status: "executed" }.';
