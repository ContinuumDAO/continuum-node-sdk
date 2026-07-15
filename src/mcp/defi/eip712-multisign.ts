import {isEip712BodyForSign} from '../../core/mpc/eip712-sign-request.js';
import {
	isUniswapLimitOrderMultisignTool,
	UNISWAP_V4_BUILD_LIMIT_ORDER_MULTISIGN_TOOL_NAME,
} from './uniswap-limit-order-input.js';

export const HYPERLIQUID_STATIC_EIP712_MULTISIGN_TOOLS = new Set([
	'ctm_hyperliquid_build_update_leverage_multisign',
	'ctm_hyperliquid_build_bridge_withdraw_multisign',
]);

export const HYPERLIQUID_LIMIT_ORDER_MULTISIGN_TOOL =
	'ctm_hyperliquid_build_limit_order_multisign';

const HYPERLIQUID_EXCHANGE_EIP712_FOLLOW_UP =
	'Do not call this build tool again. EIP-712 digest (not EVM tx, no gas): trigger_sign_result without txParams; broadcast_sign_result POSTs signature to Hyperliquid /exchange.';

const UNISWAP_LIMIT_ORDER_EIP712_FOLLOW_UP =
	'Do not call this build tool again. EIP-712 digest (not EVM tx, no gas): trigger_sign_result without txParams; broadcast_sign_result POSTs the signed order to Uniswap Trade API /v1/order. If limitPrice or orderDeadline changed, re-quote before building again.';

const HYPERLIQUID_BRACKET_EIP712_FOLLOW_UP =
	`${HYPERLIQUID_EXCHANGE_EIP712_FOLLOW_UP} Bracket uses normalTpsl grouping — if entry price/size or TP/SL triggers change, build a fresh request (do not reuse stale params).`;

export function hyperliquidLimitOrderUsesEip712(input: Record<string, unknown>): boolean {
	const tp = String(input.takeProfitTriggerPxHuman ?? '').trim();
	const sl = String(input.stopLossTriggerPxHuman ?? '').trim();
	return Boolean(tp || sl);
}

/** True when multisign build must not attach useCustomGas / customGasChainDetails. */
export function shouldStripCustomGasForMultisignBuild(
	toolName: string,
	input: Record<string, unknown> = {},
): boolean {
	if (isUniswapLimitOrderMultisignTool(toolName)) {
		return true;
	}
	if (HYPERLIQUID_STATIC_EIP712_MULTISIGN_TOOLS.has(toolName)) {
		return true;
	}
	if (toolName === HYPERLIQUID_LIMIT_ORDER_MULTISIGN_TOOL) {
		return hyperliquidLimitOrderUsesEip712(input);
	}
	return false;
}

/** EIP-712 sign requests do not use EVM gas at trigger/broadcast. */
export function eip712MultisignEnrichedFields(enriched: {
	keyGen: unknown;
	executorAddress: string;
	chainId: number;
	rpcUrl: string;
	chainDetail: Record<string, unknown>;
}): {
	keyGen: unknown;
	executorAddress: string;
	chainId: number;
	rpcUrl: string;
	chainDetail: Record<string, unknown>;
	useCustomGas: false;
} {
	return {
		keyGen: enriched.keyGen,
		executorAddress: enriched.executorAddress,
		chainId: enriched.chainId,
		rpcUrl: enriched.rpcUrl,
		chainDetail: enriched.chainDetail,
		useCustomGas: false,
	};
}

export function eip712MultisignKeyGenHint(toolName: string): string | undefined {
	if (isUniswapLimitOrderMultisignTool(toolName)) {
		return 'keyGenId is required. Pass keyGenId + chainId 1 + purposeText + fullLimitQuote from a fresh ctm_uniswap_v4_limit_order_quote (re-quote when limitPrice or orderDeadline changes). EIP-712 only — do not pass useCustomGas.';
	}
	if (HYPERLIQUID_STATIC_EIP712_MULTISIGN_TOOLS.has(toolName)) {
		return 'keyGenId is required. EIP-712 only — do not pass useCustomGas or call get_multi_sign_gas_options. trigger_sign_result without txParams; broadcast_sign_result POSTs to Hyperliquid /exchange.';
	}
	if (toolName === HYPERLIQUID_LIMIT_ORDER_MULTISIGN_TOOL) {
		return 'keyGenId is required. Plain limit (no TP/SL): CoreWriter EVM — pass useCustomGas. With takeProfitTriggerPxHuman and/or stopLossTriggerPxHuman: EIP-712 bracket — do not pass useCustomGas.';
	}
	return undefined;
}

export function eip712MultisignFollowUp(
	toolName: string,
	bodyForSign: Record<string, unknown>,
): string | null {
	if (isUniswapLimitOrderMultisignTool(toolName)) {
		return UNISWAP_LIMIT_ORDER_EIP712_FOLLOW_UP;
	}
	if (HYPERLIQUID_STATIC_EIP712_MULTISIGN_TOOLS.has(toolName)) {
		return HYPERLIQUID_EXCHANGE_EIP712_FOLLOW_UP;
	}
	if (
		toolName === HYPERLIQUID_LIMIT_ORDER_MULTISIGN_TOOL &&
		isEip712BodyForSign(bodyForSign)
	) {
		return HYPERLIQUID_BRACKET_EIP712_FOLLOW_UP;
	}
	if (isEip712BodyForSign(bodyForSign)) {
		return HYPERLIQUID_EXCHANGE_EIP712_FOLLOW_UP;
	}
	return null;
}

export function isKnownEip712MultisignTool(toolName: string): boolean {
	return (
		isUniswapLimitOrderMultisignTool(toolName) ||
		HYPERLIQUID_STATIC_EIP712_MULTISIGN_TOOLS.has(toolName) ||
		toolName === HYPERLIQUID_LIMIT_ORDER_MULTISIGN_TOOL
	);
}

export {UNISWAP_V4_BUILD_LIMIT_ORDER_MULTISIGN_TOOL_NAME};
