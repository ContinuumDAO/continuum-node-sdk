import assert from 'node:assert/strict';
import test from 'node:test';
import {buildRangeVolatilityTradeSetup} from '../dist/core/chart/analysis/trade-setups/range-volatility-trade-setup.js';
import {tradeIdeaFromAnalyzeOutput} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';

test('buildRangeVolatilityTradeSetup marks expanding upper-range breakouts clear long', () => {
	const setup = buildRangeVolatilityTradeSetup({
		lastClose: 118,
		rangeHigh: 120,
		rangeLow: 100,
		rangePct: 16.9,
		atr: 2.1,
		atrPct: 1.78,
		compression: 'expanding',
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.entryPrice, 118);
});

test('buildRangeVolatilityTradeSetup stays unclear when compressing', () => {
	const setup = buildRangeVolatilityTradeSetup({
		lastClose: 110,
		rangeHigh: 120,
		rangeLow: 100,
		rangePct: 18,
		atr: 1.5,
		atrPct: 1.36,
		compression: 'compressing',
	});
	assert.ok(setup);
	assert.equal(setup!.status, 'unclear');
	assert.equal(setup!.side, 'neutral');
	assert.equal(setup!.entryPrice, undefined);
});

test('buildRangeVolatilityTradeSetup stable range edge stays unclear without entry', () => {
	const setup = buildRangeVolatilityTradeSetup({
		lastClose: 119.5,
		rangeHigh: 120,
		rangeLow: 100,
		rangePct: 16.3,
		atr: 1.2,
		atrPct: 1.0,
		compression: 'stable',
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'short');
	assert.equal(setup!.status, 'unclear');
	assert.equal(setup!.entryPrice, undefined);
	const idea = tradeIdeaFromAnalyzeOutput('analyze_range_volatility', {
		rangeVolatilityTradeSetup: setup,
	});
	assert.ok(idea);
	assert.equal(idea!.entry, undefined);
	assert.equal(idea!.completeness, 'none');
});

test('tradeIdeaFromAnalyzeOutput accepts rangeVolatilityTradeSetup', () => {
	const idea = tradeIdeaFromAnalyzeOutput('analyze_range_volatility', {
		rangeVolatilityTradeSetup: buildRangeVolatilityTradeSetup({
			lastClose: 118,
			rangeHigh: 120,
			rangeLow: 100,
			rangePct: 16.9,
			atr: 2.1,
			atrPct: 1.78,
			compression: 'expanding',
		}),
	});
	assert.ok(idea);
	assert.equal(idea!.source.analysisType, 'range_volatility');
});
