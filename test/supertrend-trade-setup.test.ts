import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildFlipSupertrendSetup,
	buildRetestSupertrendSetup,
	buildSupertrendTradeSetup,
	type SupertrendPoint,
} from '../dist/core/chart/analysis/trade-setups/supertrend-trade-setup.js';
import {tradeIdeaFromAnalyzeOutput} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';

test('buildFlipSupertrendSetup clear long on fresh bullish flip', () => {
	const setup = buildFlipSupertrendSetup({
		lastClose: 110,
		supertrend: 105,
		direction: 1,
		prevDirection: -1,
		barsSinceFlip: 0,
		period: 10,
		multiplier: 3,
		entryProximityPct: 5,
		atr: 2,
		targetAtrMultiple: 3,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.setupPurposeCode, 'st-flip');
	assert.equal(setup!.entryPrice, 110);
	assert.equal(setup!.targetPrice, 116);
	assert.equal(setup!.invalidationPrice, 105);
	assert.equal(setup!.flippedOnLastBar, true);
});

test('buildRetestSupertrendSetup clear when price near trail in trend', () => {
	const setup = buildRetestSupertrendSetup({
		lastClose: 105.5,
		supertrend: 105,
		direction: 1,
		barsSinceFlip: 4,
		period: 10,
		multiplier: 3,
		entryProximityPct: 1,
		atr: 1.5,
		targetAtrMultiple: 3,
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.status, 'clear');
	assert.equal(setup!.setupPurposeCode, 'st-ret');
	assert.equal(setup!.entryPrice, 105);
	assert.equal(setup!.targetPrice, 109.5);
	assert.equal(setup!.invalidationPrice, 105);
});

test('buildRetestSupertrendSetup invalidated when close breaks trail', () => {
	const setup = buildRetestSupertrendSetup({
		lastClose: 104,
		supertrend: 105,
		direction: 1,
		barsSinceFlip: 2,
		period: 10,
		multiplier: 3,
		entryProximityPct: 1,
	});
	assert.ok(setup);
	assert.equal(setup!.invalidated, true);
	assert.equal(setup!.status, 'unclear');
	assert.equal(setup!.side, 'neutral');
});

test('buildSupertrendTradeSetup defaults to flip primary with retest alternate', () => {
	const closes = [100, 101, 102, 103, 104, 110];
	const points: Array<SupertrendPoint | null> = [
		{supertrend: 98, direction: -1},
		{supertrend: 99, direction: -1},
		{supertrend: 100, direction: -1},
		{supertrend: 101, direction: -1},
		{supertrend: 102, direction: -1},
		{supertrend: 105, direction: 1},
	];
	const setup = buildSupertrendTradeSetup({
		closes,
		points,
		period: 10,
		multiplier: 3,
		entryProximityPct: 5,
		atr: 2,
	});
	assert.ok(setup);
	assert.equal(setup!.entryMode, 'flip');
	assert.equal(setup!.setupPurposeCode, 'st-flip');
	assert.ok(setup!.retestAlternative);
});

test('tradeIdeaFromAnalyzeOutput maps supertrend setup', () => {
	const idea = tradeIdeaFromAnalyzeOutput('analyze_supertrend', {
		supertrendTradeSetup: {
			status: 'clear',
			source: 'supertrend',
			entryMode: 'flip',
			lastClose: 110,
			supertrend: 105,
			direction: 1,
			period: 10,
			multiplier: 3,
			entryProximityPct: 1,
			entryOffsetMode: 'bounce',
			entryOffsetPct: 1,
			invalidationOffsetPct: 1,
			targetAtrMultiple: 3,
			setupPurposeCode: 'st-flip',
			invalidated: false,
			side: 'long',
			flippedOnLastBar: true,
			barsSinceFlip: 0,
			entryPrice: 110,
			entryLabel: 'last close (flip)',
			// Far enough for desk minTradeRatio (3) after 1% bounce/invalidation offsets.
			targetPrice: 130,
			targetLabel: 'entry + 3× ATR',
			invalidationPrice: 105,
			invalidationLabel: 'Supertrend trail',
			conditionalNote: 'Fresh flip',
			confidence: 0.62,
		},
	});
	assert.ok(idea);
	assert.equal(idea!.source.analysisType, 'supertrend');
	assert.equal(idea!.side, 'long');
	assert.equal(idea!.status, 'clear');
	assert.equal(idea!.entry?.price, 110);
	assert.equal(idea!.invalidation?.price, 105);
});
