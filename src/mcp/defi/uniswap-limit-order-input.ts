export const UNISWAP_V4_LIMIT_ORDER_QUOTE_TOOL_NAME = 'ctm_uniswap_v4_limit_order_quote';
export const UNISWAP_V4_FETCH_LIMIT_ORDERS_TOOL_NAME = 'ctm_uniswap_v4_fetch_limit_orders';
export const UNISWAP_V4_BUILD_LIMIT_ORDER_MULTISIGN_TOOL_NAME =
	'ctm_uniswap_v4_build_limit_order_multisign';

export function isUniswapLimitOrderKeyTool(toolName: string): boolean {
	return (
		toolName === UNISWAP_V4_LIMIT_ORDER_QUOTE_TOOL_NAME ||
		toolName === UNISWAP_V4_FETCH_LIMIT_ORDERS_TOOL_NAME
	);
}

export function isUniswapLimitOrderMultisignTool(toolName: string): boolean {
	return toolName === UNISWAP_V4_BUILD_LIMIT_ORDER_MULTISIGN_TOOL_NAME;
}

/** @deprecated Use eip712MultisignEnrichedFields from ./eip712-multisign.js */
export {eip712MultisignEnrichedFields as limitOrderMultisignEnrichedFields} from './eip712-multisign.js';

/** Order expiry from limit_order_quote JSON (quote.orderInfo.deadline). */
export function orderDeadlineFromLimitQuote(fullLimitQuote: unknown): number | undefined {
	if (!fullLimitQuote || typeof fullLimitQuote !== 'object' || Array.isArray(fullLimitQuote)) {
		return undefined;
	}
	const root = fullLimitQuote as Record<string, unknown>;
	const quote =
		root.quote && typeof root.quote === 'object' && !Array.isArray(root.quote)
			? (root.quote as Record<string, unknown>)
			: root;
	const orderInfo =
		quote.orderInfo &&
		typeof quote.orderInfo === 'object' &&
		!Array.isArray(quote.orderInfo)
			? (quote.orderInfo as Record<string, unknown>)
			: undefined;
	const deadline = orderInfo?.deadline ?? quote.deadline ?? root.deadline;
	if (typeof deadline === 'number' && Number.isFinite(deadline) && deadline > 0) {
		return Math.floor(deadline);
	}
	if (typeof deadline === 'string' && deadline.trim()) {
		const parsed = Number(deadline);
		if (Number.isFinite(parsed) && parsed > 0) {
			return Math.floor(parsed);
		}
	}
	return undefined;
}
