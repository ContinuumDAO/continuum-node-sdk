/** Shared MCP guidance for multiSignRequest create tools (useCustomGas). */
export const MULTISIGN_CREATE_GAS_GUIDANCE =
	'Call get_multi_sign_gas_options({ chainId }) before creating; ask the user whether useCustomGas should be false (live RPC, default) or true (Custom Gas Config from chain registry). Pass useCustomGas on this tool.';

/** Shared MCP guidance for Get Sig (feeSpeedTier). */
export const TRIGGER_SIGN_GAS_GUIDANCE =
	'Call get_multi_sign_gas_options({ requestId }) before Get Sig; ask the user for feeSpeedTier (default triggerSignResult.defaultFeeSpeedTier) or advanced gwei overrides. Proposal custom gas (useCustomGas at create) is applied automatically when present.';

/** Execute guidance — avoid bulky reads in the same turn. */
export const BROADCAST_SIGN_RESULT_GUIDANCE =
	'Execute on-chain: call broadcast_sign_result({ requestId }) directly when Get Sig already completed. Do not call get_sign_request_by_id, list_sign_requests, or fetch full sign results first — use get_sign_result_summary if you only need readiness. Returns { requestId, txHashes, status: "executed" }.';
