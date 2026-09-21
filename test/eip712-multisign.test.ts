import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
	eip712MultisignFollowUp,
	HYPERLIQUID_STATIC_EIP712_MULTISIGN_TOOLS,
	shouldStripCustomGasForMultisignBuild,
} from '../dist/mcp/defi/eip712-multisign.js';
import {EIP712_SIGN_REQUEST_KIND} from '../dist/core/mpc/eip712-sign-request.js';

describe('shouldStripCustomGasForMultisignBuild', () => {
	it('strips gas for Uniswap limit order build', () => {
		assert.equal(
			shouldStripCustomGasForMultisignBuild('ctm_uniswap_v4_build_limit_order_multisign', {}),
			true,
		);
	});

	it('strips gas for Hyperliquid update leverage and bridge withdraw', () => {
		for (const tool of HYPERLIQUID_STATIC_EIP712_MULTISIGN_TOOLS) {
			assert.equal(shouldStripCustomGasForMultisignBuild(tool, {}), true);
		}
	});

	it('strips gas for Hyperliquid limit only when TP/SL or trailing is set', () => {
		const tool = 'ctm_hyperliquid_build_limit_order_multisign';
		assert.equal(shouldStripCustomGasForMultisignBuild(tool, {}), false);
		assert.equal(
			shouldStripCustomGasForMultisignBuild(tool, {takeProfitTriggerPxHuman: '100000'}),
			true,
		);
		assert.equal(
			shouldStripCustomGasForMultisignBuild(tool, {stopLossTriggerPxHuman: '90000'}),
			true,
		);
		assert.equal(
			shouldStripCustomGasForMultisignBuild(tool, {trailingOffsetHuman: '2'}),
			true,
		);
	});

	it('includes trailing stop in static EIP-712 tools', () => {
		assert.equal(
			HYPERLIQUID_STATIC_EIP712_MULTISIGN_TOOLS.has(
				'ctm_hyperliquid_build_trailing_stop_multisign',
			),
			true,
		);
		assert.equal(
			shouldStripCustomGasForMultisignBuild('ctm_hyperliquid_build_trailing_stop_multisign', {}),
			true,
		);
	});

	it('does not strip gas for GMX increase with TP/SL', () => {
		assert.equal(
			shouldStripCustomGasForMultisignBuild('ctm_gmx_build_increase_multisign', {
				takeProfitPriceUsdHuman: '3100',
				stopLossPriceUsdHuman: '2850',
			}),
			false,
		);
	});
});

describe('eip712MultisignFollowUp', () => {
	it('returns Hyperliquid exchange follow-up for update leverage', () => {
		const followUp = eip712MultisignFollowUp(
			'ctm_hyperliquid_build_update_leverage_multisign',
			{},
		);
		assert.match(followUp ?? '', /Hyperliquid \/exchange/);
		assert.match(followUp ?? '', /no gas/i);
	});

	it('returns bracket follow-up when limit order body is EIP-712', () => {
		const followUp = eip712MultisignFollowUp('ctm_hyperliquid_build_limit_order_multisign', {
			extraJSON: {
				signRequestKind: EIP712_SIGN_REQUEST_KIND,
				eip712: [{primaryType: 'Agent', delivery: {kind: 'hyperliquid_exchange'}}],
			},
		});
		assert.match(followUp ?? '', /normalTpsl/);
	});
});
