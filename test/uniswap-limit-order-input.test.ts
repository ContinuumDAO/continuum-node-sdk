import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
	orderDeadlineFromLimitQuote,
	UNISWAP_V4_LIMIT_ORDER_QUOTE_TOOL_NAME,
} from '../dist/mcp/defi/uniswap-limit-order-input.js';

describe('orderDeadlineFromLimitQuote', () => {
	it('reads quote.orderInfo.deadline', () => {
		const deadline = orderDeadlineFromLimitQuote({
			quote: {
				orderInfo: {deadline: 1772758014},
			},
		});
		assert.equal(deadline, 1772758014);
	});

	it('returns undefined when deadline is missing', () => {
		assert.equal(orderDeadlineFromLimitQuote({quote: {}}), undefined);
		assert.equal(orderDeadlineFromLimitQuote(null), undefined);
	});
});

describe('UNISWAP_V4_LIMIT_ORDER_QUOTE_TOOL_NAME', () => {
	it('matches MCP catalog tool name', () => {
		assert.equal(
			UNISWAP_V4_LIMIT_ORDER_QUOTE_TOOL_NAME,
			'ctm_uniswap_v4_limit_order_quote',
		);
	});
});
