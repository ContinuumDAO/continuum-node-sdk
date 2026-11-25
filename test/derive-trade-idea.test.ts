import assert from 'node:assert/strict';
import test from 'node:test';
import {mapTradeIdeaToDerivePerpInput} from '../dist/core/chart/analysis/trade-setups/build-trade.js';

const idea = {
	id: 'drv',
	source: {analysisType: 'trend_structure', toolName: 'analyze_trend_structure'},
	status: 'clear' as const,
	completeness: 'full' as const,
	side: 'long' as const,
	confidence: 0.8,
	lastClose: 100,
	symbol: 'ETH',
	entry: {price: 100, label: 'entry'},
	target: {price: 110, label: 'target'},
	invalidation: {price: 95, label: 'stop'},
	analysisSetup: {
		kind: 'trend_structure' as const,
		setup: {
			status: 'clear' as const,
			source: 'trend_structure',
			lastClose: 100,
			side: 'long' as const,
			confidence: 0.8,
			triggerPrice: 100,
			entryOffsetMode: 'bounce' as const,
			setupPurposeCode: 'trend-ret',
		},
	},
	createdAtSec: 1,
};

test('derive trade ideas map a perp and reject a universe mismatch', () => {
	const mapped = mapTradeIdeaToDerivePerpInput(idea, {
		tradeIdea: idea,
		protocolId: 'derive',
		keyGenId: 'kg',
		chainId: 1,
		purposeText: 'test',
		szHuman: '0.2',
		subaccountId: 9,
	});
	assert.equal(mapped.ok, true);
	if (mapped.ok) {
		assert.equal(mapped.data.instrumentName, 'ETH-PERP');
		assert.equal(mapped.data.direction, 'buy');
		assert.equal(mapped.data.subaccountId, 9);
		assert.equal(mapped.data.chainId, 1);
	}
	const mismatch = mapTradeIdeaToDerivePerpInput(idea, {
		tradeIdea: idea,
		protocolId: 'derive',
		keyGenId: 'kg',
		chainId: 1,
		purposeText: 'test',
		szHuman: '0.2',
		subaccountId: 9,
		subaccountUniverseId: 1,
		instrumentUniverseId: 4,
	});
	assert.equal(mismatch.ok, false);
	if (!mismatch.ok) assert.match(mismatch.reason, /transfer_spot/);
	const option = mapTradeIdeaToDerivePerpInput(
		{...idea, symbol: 'NVDA-20261218-180-C'},
		{
			tradeIdea: idea,
			protocolId: 'derive',
			keyGenId: 'kg',
			chainId: 1,
			purposeText: 'test',
			szHuman: '1',
			subaccountId: 9,
		},
	);
	assert.equal(option.ok, false);
});
