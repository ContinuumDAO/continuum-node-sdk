import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildCloudIchimokuSetup,
	buildIchimokuTradeSetup,
	buildTkCrossIchimokuSetup,
	currentCloudFromPoints,
	type IchimokuPoint,
} from '../dist/core/chart/analysis/trade-setups/ichimoku-trade-setup.js';
import {tradeIdeaFromAnalyzeOutput} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';

function makePoints(
	n: number,
	current: IchimokuPoint,
	cloudSource: IchimokuPoint,
	displacement: number,
): Array<IchimokuPoint | null> {
	const out: Array<IchimokuPoint | null> = Array.from({length: n}, () => ({
		conversion: 100,
		base: 100,
		spanA: 99,
		spanB: 98,
	}));
	const cloudIdx = n - 1 - displacement;
	if (cloudIdx >= 0) {
		out[cloudIdx] = cloudSource;
	}
	out[n - 1] = current;
	return out;
}

test('currentCloudFromPoints reads spans displacement bars ago', () => {
	const points = makePoints(
		30,
		{conversion: 110, base: 108, spanA: 111, spanB: 112},
		{conversion: 100, base: 100, spanA: 102, spanB: 98},
		26,
	);
	const cloud = currentCloudFromPoints(points, 26);
	assert.ok(cloud);
	assert.equal(cloud!.spanA, 102);
	assert.equal(cloud!.spanB, 98);
	assert.equal(cloud!.top, 102);
	assert.equal(cloud!.bottom, 98);
});

test('buildTkCrossIchimokuSetup clear long with bullish TK and price above cloud', () => {
	const setup = buildTkCrossIchimokuSetup({
		lastClose: 110,
		conversion: 109,
		base: 107,
		cloudTop: 102,
		cloudBottom: 98,
		spanA: 102,
		spanB: 98,
		barsSinceTkCross: 0,
		conversionPeriod: 9,
		basePeriod: 26,
		spanPeriod: 52,
		displacement: 26,
		atr: 2,
		targetAtrMultiple: 3,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.setupPurposeCode, 'ichi-tk');
	assert.equal(setup!.entryPrice, 110);
	assert.equal(setup!.targetPrice, 116);
});

test('buildCloudIchimokuSetup clear on kijun retest above cloud', () => {
	const setup = buildCloudIchimokuSetup({
		lastClose: 107.2,
		conversion: 108,
		base: 107,
		cloudTop: 102,
		cloudBottom: 98,
		spanA: 102,
		spanB: 98,
		barsSinceTkCross: 10,
		conversionPeriod: 9,
		basePeriod: 26,
		spanPeriod: 52,
		displacement: 26,
		entryProximityPct: 1,
		atr: 1.5,
		targetAtrMultiple: 3,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.setupPurposeCode, 'ichi-cloud');
	assert.equal(setup!.entryPrice, 107);
});

test('buildIchimokuTradeSetup primary tk_cross with cloud alternate', () => {
	const displacement = 5;
	const closes = Array.from({length: 20}, (_, i) => 100 + i);
	const points = makePoints(
		20,
		{conversion: 118, base: 116, spanA: 119, spanB: 120},
		{conversion: 100, base: 100, spanA: 105, spanB: 100},
		displacement,
	);
	// Force a TK cross on last bar vs prior
	points[18] = {conversion: 114, base: 116, spanA: 110, spanB: 108};
	points[19] = {conversion: 118, base: 116, spanA: 119, spanB: 120};
	closes[19] = 120;

	const setup = buildIchimokuTradeSetup({
		closes,
		points,
		conversionPeriod: 9,
		basePeriod: 26,
		spanPeriod: 52,
		displacement,
		atr: 2,
		entryProximityPct: 5,
	});
	assert.ok(setup);
	assert.equal(setup!.strategy, 'tk_cross');
	assert.ok(setup!.cloudAlternative);
});

test('tradeIdeaFromAnalyzeOutput maps ichimoku setup', () => {
	const idea = tradeIdeaFromAnalyzeOutput('analyze_ichimoku', {
		ichimokuTradeSetup: {
			status: 'clear',
			source: 'ichimoku',
			strategy: 'tk_cross',
			lastClose: 110,
			conversion: 109,
			base: 107,
			cloudTop: 102,
			cloudBottom: 98,
			spanA: 102,
			spanB: 98,
			conversionPeriod: 9,
			basePeriod: 26,
			spanPeriod: 52,
			displacement: 26,
			tkState: 'bullish',
			cloudPosition: 'above',
			entryProximityPct: 1,
			entryOffsetMode: 'bounce',
			entryOffsetPct: 1,
			invalidationOffsetPct: 1,
			targetAtrMultiple: 3,
			setupPurposeCode: 'ichi-tk',
			invalidated: false,
			side: 'long',
			barsSinceTkCross: 0,
			entryPrice: 110,
			entryLabel: 'last close (TK cross)',
			targetPrice: 116,
			targetLabel: 'entry + 3× ATR',
			invalidationPrice: 98,
			invalidationLabel: 'Below cloud / kijun',
			conditionalNote: 'Bullish TK cross',
			confidence: 0.6,
		},
	});
	assert.ok(idea);
	assert.equal(idea!.source.analysisType, 'ichimoku');
	assert.equal(idea!.side, 'long');
	assert.equal(idea!.entry?.price, 110);
});
