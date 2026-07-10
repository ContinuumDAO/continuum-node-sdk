import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildChartPatternTradeSetupFromSummary} from '../dist/core/chart/analysis/trade-setups/chart-pattern-trade-setup.js';
import {
	tradeIdeaFromAnalyzeOutput,
	wrapAnalysisTradeSetup,
} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';
import {buildKeyLevelsTradeSetup} from '../dist/core/chart/analysis/trade-setups/key-levels-trade-setup.js';
import {evaluateTradeConsensus} from '../dist/core/chart/analysis/trade-setups/trade-consensus.js';

test('buildChartPatternTradeSetupFromSummary marks clear long setup with measured move', () => {
	const summary = {
		id: 'falling_wedge',
		name: 'Falling Wedge',
		classification: 'bullish' as const,
		confidence: 0.72,
		interpretation: 'test',
		barSpan: {fromIndex: 10, toIndex: 40, barCount: 31},
		keyLevels: [
			{price: 1800, label: 'R2'},
			{price: 1700, label: 'S2'},
		],
		measuredMove: {
			referencePrice: 1800,
			targetPrice: 1940,
			direction: 'up' as const,
			status: 'projected' as const,
		},
	};
	const setup = buildChartPatternTradeSetupFromSummary(summary, 1705, 1, 'forming');
	assert.equal(setup.status, 'clear');
	assert.equal(setup.side, 'long');
	assert.equal(setup.triggerPrice, 1700);
	assert.equal(setup.targetPrice, 1940);
});

test('unclear chart pattern setup omits invalid prices from JSON', () => {
	const setup = buildChartPatternTradeSetupFromSummary(
		{
			id: 'symmetrical_triangle',
			name: 'Symmetrical Triangle',
			classification: 'neutral',
			confidence: 0.55,
			interpretation: 'test',
			barSpan: {fromIndex: 5, toIndex: 20, barCount: 16},
			keyLevels: [
				{price: 1700, label: 'S2'},
				{price: 1800, label: 'R2'},
			],
		},
		1750,
		1,
	);
	assert.equal(setup.status, 'unclear');
	const json = JSON.parse(JSON.stringify(setup)) as Record<string, unknown>;
	assert.equal(json.triggerPrice, undefined);
	assert.equal(json.invalidationPrice, undefined);
	assert.ok(json.unclearReason);
});

test('buildChartPatternTradeSetupFromSummary marks unclear for neutral without direction', () => {
	const summary = {
		id: 'symmetrical_triangle',
		name: 'Symmetrical Triangle',
		classification: 'neutral' as const,
		confidence: 0.55,
		interpretation: 'test',
		barSpan: {fromIndex: 5, toIndex: 20, barCount: 16},
		keyLevels: [{price: 100, label: 'upper trendline'}],
	};
	const setup = buildChartPatternTradeSetupFromSummary(summary, 105, 1);
	assert.equal(setup.status, 'unclear');
	assert.equal(setup.side, 'neutral');
});

test('wrapAnalysisTradeSetup normalizes chart pattern entry/target/invalidation', () => {
	const setup = buildChartPatternTradeSetupFromSummary(
		{
			id: 'falling_wedge',
			name: 'Falling Wedge',
			classification: 'bullish',
			confidence: 0.72,
			interpretation: 'test',
			barSpan: {fromIndex: 10, toIndex: 40, barCount: 31},
			keyLevels: [
				{price: 1800, label: 'R2'},
				{price: 1700, label: 'S2'},
			],
			measuredMove: {
				referencePrice: 1800,
				targetPrice: 1940,
				direction: 'up',
				status: 'projected',
			},
		},
		1705,
		1,
	);
	const idea = wrapAnalysisTradeSetup(
		{kind: 'chart_pattern', setup},
		{toolName: 'analyze_chart_patterns', symbol: 'ETH'},
	);
	assert.equal(idea.source.analysisType, 'chart_pattern');
	assert.equal(idea.entry.price, 1700);
	assert.equal(idea.target?.price, 1940);
	assert.equal(idea.completeness, 'full');
});

test('extractTradeSetupFromAnalyzeOutput maps chartPatternTradeSetup field', () => {
	const idea = tradeIdeaFromAnalyzeOutput('analyze_chart_patterns', {
		chartPatternTradeSetup: {
			status: 'clear',
			source: 'primary_pattern',
			patternNumber: 1,
			patternId: 'falling_wedge',
			patternName: 'Falling Wedge',
			classification: 'bullish',
			confidence: 0.7,
			side: 'long',
			lastClose: 100,
			triggerPrice: 99,
			triggerLabel: 'neckline',
			targetPrice: 110,
			invalidationPrice: 95,
			invalidationLabel: 'low',
		},
	});
	assert.ok(idea);
	assert.equal(idea!.source.analysisType, 'chart_pattern');
});

test('buildKeyLevelsTradeSetup produces bounce framing near support', () => {
	const setup = buildKeyLevelsTradeSetup({
		lastClose: 100,
		nearestSupport: {price: 98, strength: 80},
		nearestResistance: {price: 105, strength: 70},
		levels: [
			{price: 98, kind: 'support', strength: 80, touchCount: 3},
			{price: 105, kind: 'resistance', strength: 70, touchCount: 2},
		],
	});
	assert.ok(setup);
	assert.equal(setup!.side, 'long');
	assert.equal(setup!.entryPrice, 98);
});

test('evaluateTradeConsensus blocks conflicting sides', () => {
	const ideas = [
		wrapAnalysisTradeSetup(
			{
				kind: 'chart_pattern',
				setup: {
					status: 'clear',
					source: 'primary_pattern',
					patternNumber: 1,
					patternId: 'a',
					patternName: 'A',
					classification: 'bullish',
					confidence: 0.7,
					side: 'long',
					lastClose: 100,
					triggerPrice: 99,
					triggerLabel: 't',
					invalidationPrice: 95,
					invalidationLabel: 'i',
				},
			},
			{toolName: 'analyze_chart_patterns'},
		),
		wrapAnalysisTradeSetup(
			{
				kind: 'momentum',
				setup: {
					status: 'clear',
					source: 'rsi_macd',
					rsiPeriod: 14,
					rsiValue: 75,
					rsiZone: 'overbought',
					macdCrossover: 'bearish',
					lastClose: 100,
					side: 'short',
					entryPrice: 100,
					entryLabel: 'last close',
					conditionalNote: 'test',
					confidence: 0.5,
				},
			},
			{toolName: 'analyze_momentum'},
		),
	];
	const result = evaluateTradeConsensus(ideas, {
		requiredSources: ['chart_pattern', 'momentum'],
		minAgree: 2,
		blockOnConflict: true,
	});
	assert.equal(result.gate, 'BLOCKED');
	assert.ok(result.blockers.some(item => item.includes('Conflicting')));
});
