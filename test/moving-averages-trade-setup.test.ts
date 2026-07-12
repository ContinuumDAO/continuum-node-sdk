import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildMovingAveragesTradeSetup,
	buildMovingAveragesTradeSummary,
	detectMaCrossover,
	movingAveragesTradeIdeaContextFromSetup,
} from '../dist/core/chart/analysis/trade-setups/moving-averages-trade-setup.js';
import {tradeIdeaFromAnalyzeOutput} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';
import {tradeIdeaToListItem} from '../dist/core/chart/analysis/trade-setups/trade-idea-list.js';

test('detectMaCrossover finds bullish crossover on last bar', () => {
	const fast = [98, 99, 100, 103];
	const slow = [100, 100, 100, 100];
	const result = detectMaCrossover(fast, slow);
	assert.equal(result.crossoverState, 'bullish');
	assert.equal(result.barsSinceCrossover, 0);
});

test('detectMaCrossover finds bearish crossover', () => {
	const fast = [102, 101, 100, 97];
	const slow = [100, 100, 100, 100];
	const result = detectMaCrossover(fast, slow);
	assert.equal(result.crossoverState, 'bearish');
	assert.equal(result.barsSinceCrossover, 0);
});

test('buildMovingAveragesTradeSetup clear crossover long at last close', () => {
	const setup = buildMovingAveragesTradeSetup({
		lastClose: 105,
		fastMa: 104,
		slowMa: 100,
		fastPeriod: 50,
		slowPeriod: 200,
		maType: 'sma',
		crossoverState: 'bullish',
		barsSinceCrossover: 1,
		freshCrossoverMaxBars: 5,
	});
	assert.ok(setup);
	assert.equal(setup!.strategy, 'crossover');
	assert.equal(setup!.crossoverLabel, 'golden_cross');
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.entryPrice, 105);
	assert.equal(setup!.setupPurposeCode, 'ma-cross');
	assert.match(setup!.tradeSummary, /Golden cross/i);
	assert.match(setup!.tradeSummary, /last close/i);
});

test('buildMovingAveragesTradeSetup clear proximity retest at slow MA', () => {
	const bars = Array.from({length: 220}, (_, i) => ({
		time: i,
		open: 100,
		high: 101,
		low: 99,
		close: 100.5,
	}));
	const setup = buildMovingAveragesTradeSetup({
		lastClose: 100.4,
		fastMa: 101,
		slowMa: 100,
		fastPeriod: 50,
		slowPeriod: 200,
		maType: 'sma',
		crossoverState: 'none',
		barsSinceCrossover: null,
		bars,
		entryProximityPct: 1,
		entryProximityMode: 'price',
	});
	assert.ok(setup);
	assert.equal(setup!.strategy, 'proximity_retest');
	assert.equal(setup!.proximityType, 'slow_ma_retest_bullish');
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.entryPrice, 100);
	assert.equal(setup!.setupPurposeCode, 'ma-ret');
	assert.match(setup!.tradeSummary, /Proximity \+ retest/i);
	assert.match(setup!.tradeSummary, /bullish regime/i);
});

test('buildMovingAveragesTradeSetup unclear when far from slow MA retest', () => {
	const setup = buildMovingAveragesTradeSetup({
		lastClose: 110,
		fastMa: 108,
		slowMa: 100,
		fastPeriod: 50,
		slowPeriod: 200,
		maType: 'sma',
		crossoverState: 'none',
		barsSinceCrossover: null,
		entryProximityPct: 1,
		entryProximityMode: 'price',
	});
	assert.ok(setup);
	assert.equal(setup!.status, 'unclear');
	assert.equal(setup!.entryPrice, undefined);
	assert.match(setup!.tradeSummary, /Proximity \+ retest/i);
});

test('buildMovingAveragesTradeSetup stale crossover stays unclear without proximity', () => {
	const setup = buildMovingAveragesTradeSetup({
		lastClose: 110,
		fastMa: 108,
		slowMa: 100,
		fastPeriod: 50,
		slowPeriod: 200,
		maType: 'sma',
		crossoverState: 'bullish',
		barsSinceCrossover: 10,
		freshCrossoverMaxBars: 5,
		entryProximityPct: 1,
	});
	assert.ok(setup);
	assert.equal(setup!.status, 'unclear');
	assert.equal(setup!.entryPrice, undefined);
	assert.match(setup!.tradeSummary, /Golden cross 10 bars ago/i);
});

test('tradeIdeaFromAnalyzeOutput buildable only when clear with entry', () => {
	const setup = buildMovingAveragesTradeSetup({
		lastClose: 105,
		fastMa: 104,
		slowMa: 100,
		fastPeriod: 50,
		slowPeriod: 200,
		maType: 'sma',
		crossoverState: 'bullish',
		barsSinceCrossover: 0,
	});
	assert.ok(setup);
	const idea = tradeIdeaFromAnalyzeOutput('analyze_moving_averages', {
		movingAveragesTradeSetup: setup,
	});
	assert.ok(idea);
	assert.equal(idea!.status, 'clear');
	assert.ok(idea!.entry?.price);
	const item = tradeIdeaToListItem(idea!, 1);
	assert.match(item.tradeSummary ?? '', /Golden cross/i);
});

test('buildMovingAveragesTradeSummary death cross short', () => {
	const summary = buildMovingAveragesTradeSummary({
		maType: 'sma',
		fastPeriod: 50,
		slowPeriod: 200,
		strategy: 'crossover',
		crossoverLabel: 'death_cross',
		proximityType: 'none',
		side: 'short',
		status: 'clear',
		barsSinceCrossover: 0,
	});
	assert.match(summary, /Death cross/i);
	assert.match(summary, /short entry at last close/i);
});

test('movingAveragesTradeIdeaContextFromSetup exposes strategy fields', () => {
	const setup = buildMovingAveragesTradeSetup({
		lastClose: 95,
		fastMa: 96,
		slowMa: 100,
		fastPeriod: 50,
		slowPeriod: 200,
		maType: 'sma',
		crossoverState: 'bearish',
		barsSinceCrossover: 0,
	});
	assert.ok(setup);
	const ctx = movingAveragesTradeIdeaContextFromSetup(setup!);
	assert.equal(ctx.strategy, 'crossover');
	assert.equal(ctx.crossoverLabel, 'death_cross');
	assert.ok(ctx.tradeSummary.length > 0);
});
