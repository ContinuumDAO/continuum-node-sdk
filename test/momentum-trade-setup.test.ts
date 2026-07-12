import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildMomentumTradeSetup} from '../dist/core/chart/analysis/trade-setups/momentum-trade-setup.js';
import {tradeIdeaFromAnalyzeOutput} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';

test('buildMomentumTradeSetup neutral unclear omits entry price', () => {
	const setup = buildMomentumTradeSetup({
		lastClose: 100,
		rsi: {period: 14, value: 45, zone: 'neutral'},
		macd: {crossover: 'none'},
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'neutral');
	assert.equal(setup!.status, 'unclear');
	assert.equal(setup!.entryPrice, undefined);
	const idea = tradeIdeaFromAnalyzeOutput('analyze_momentum', {momentumTradeSetup: setup});
	assert.ok(idea);
	assert.equal(idea!.entry, undefined);
	assert.equal(idea!.completeness, 'none');
});

test('buildMomentumTradeSetup clear long includes entry at last close', () => {
	const setup = buildMomentumTradeSetup({
		lastClose: 2500,
		rsi: {period: 14, value: 28, zone: 'oversold'},
		macd: {crossover: 'bullish'},
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.entryPrice, 2500);
	const idea = tradeIdeaFromAnalyzeOutput('analyze_momentum', {momentumTradeSetup: setup});
	assert.ok(idea);
	assert.equal(idea!.entry?.price, 2500);
	assert.equal(idea!.completeness, 'partial');
});
