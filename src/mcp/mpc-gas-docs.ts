/** Shared MCP guidance for multiSignRequest create tools (useCustomGas). */
export const MULTISIGN_CREATE_GAS_GUIDANCE =
	'Call get_multi_sign_gas_options({ chainId }) before creating; ask the user whether useCustomGas should be false (live RPC, default) or true (Custom Gas Config from chain registry). Pass useCustomGas on this tool.';

/** Shared MCP guidance for Get Sig (feeSpeedTier). */
export const TRIGGER_SIGN_GAS_GUIDANCE =
	'Call get_multi_sign_gas_options({ requestId }) before Get Sig; ask the user for feeSpeedTier (default triggerSignResult.defaultFeeSpeedTier) or advanced gwei overrides. Proposal custom gas (useCustomGas at create) is applied automatically when present.';

/** Execute guidance — avoid bulky reads in the same turn. */
export const BROADCAST_SIGN_RESULT_GUIDANCE =
	'Broadcast on-chain: call broadcast_sign_result({ requestId }) when get_sign_request_status or get_sign_result_summary shows readyToBroadcast true and executedOnChain false. Sign-request lifecycleStatus "success" is quorum agreed only — not on-chain execution. Returns { requestId, txHashes, status: "executed" }.';
