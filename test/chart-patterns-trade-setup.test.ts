import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildChartPatternTradeSetupFromSummary} from '../dist/core/chart/analysis/trade-setups/chart-pattern-trade-setup.js';
import {
	tradeIdeaFromAnalyzeOutput,
	wrapAnalysisTradeSetup,
} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';
import {tradeIdeaToListItem} from '../dist/core/chart/analysis/trade-setups/trade-idea-list.js';
import {buildKeyLevelsTradeSetup} from '../dist/core/chart/analysis/trade-setups/key-levels-trade-setup.js';
import {buildKeyLevelMenu} from '../dist/core/chart/analysis/key-level-menu-summary.js';
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
				formula: 'pattern_height projected from break side',
			},
	};
	// Post-breakout retest: entry (R2) and invalidation (S2) are distinct before/after offsets.
	const setup = buildChartPatternTradeSetupFromSummary(summary, 1810, 1, 'completed');
	assert.equal(setup.status, 'clear');
	assert.equal(setup.side, 'long');
	assert.equal(setup.triggerPrice, 1800);
	assert.equal(setup.invalidationPrice, 1700);
	assert.equal(setup.targetPrice, 1940);
	assert.equal(setup.targetFormula, 'pattern_height projected from break side');
});

test('buildChartPatternTradeSetupFromSummary keeps upside target after breakout retest long', () => {
	const setup = buildChartPatternTradeSetupFromSummary(
		{
			id: 'symmetrical_triangle',
			name: 'Symmetrical Triangle',
			classification: 'neutral',
			confidence: 0.69,
			interpretation: 'test',
			barSpan: {fromIndex: 0, toIndex: 29, barCount: 30},
			keyLevels: [
				{price: 63516, label: 'S2'},
				{price: 64147, label: 'R2'},
			],
			measuredMove: {
				referencePrice: 66420,
				targetPrice: 70137,
				direction: 'up',
				status: 'active',
				formula: 'pattern_height projected from break side',
			},
		},
		// Clear of 0.1% break tolerance above R2.
		65000,
		1,
		'completed',
	);
	assert.equal(setup.status, 'clear');
	assert.equal(setup.side, 'long');
	assert.equal(setup.triggerPrice, 64147);
	assert.equal(setup.targetPrice, 70137);
	assert.equal(setup.targetDirection, 'up');
	assert.equal(setup.targetFormula, 'pattern_height projected from break side');
	const idea = wrapAnalysisTradeSetup(
		{kind: 'chart_pattern', setup},
		{toolName: 'analyze_chart_patterns', symbol: 'BTC'},
	);
	const item = tradeIdeaToListItem(idea, 1);
	assert.equal(item.targetBasis, 'Target: pattern_height projected from break side');
	assert.equal(item.invalidationBasis, 'Invalidation: S2 pattern fail');
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
		1810,
		1,
		'completed',
	);
	const idea = wrapAnalysisTradeSetup(
		{kind: 'chart_pattern', setup},
		{toolName: 'analyze_chart_patterns', symbol: 'ETH'},
	);
	assert.equal(idea.source.analysisType, 'chart_pattern');
	assert.equal(idea.status, 'clear');
	assert.equal(idea.entry?.price, 1800);
	assert.equal(idea.invalidation?.price, 1700);
	assert.equal(idea.target?.price, 1940);
	assert.equal(idea.completeness, 'full');
});

test('wrapAnalysisTradeSetup marks unclear when long levels are out of order', () => {
	const idea = wrapAnalysisTradeSetup(
		{
			kind: 'chart_pattern',
			setup: {
				status: 'clear',
				source: 'primary_pattern',
				patternNumber: 1,
				patternId: 'symmetrical_triangle',
				patternName: 'Symmetrical Triangle',
				classification: 'neutral',
				confidence: 0.7,
				side: 'long',
				lastClose: 65000,
				triggerPrice: 64147,
				triggerLabel: 'R2 retest',
				targetPrice: 58985,
				targetDirection: 'up',
				targetStatus: 'active',
				invalidationPrice: 63516,
				invalidationLabel: 'S2 pattern fail',
				entryOffsetMode: 'retest',
			},
		},
		{toolName: 'analyze_chart_patterns', symbol: 'BTC'},
	);
	assert.equal(idea.status, 'unclear');
	assert.match(idea.unclearReason ?? '', /target > entry > invalidation/i);
	assert.match(idea.unclearReason ?? '', /after desk offsets/i);
	assert.equal(idea.entry?.price, 64147);
	assert.equal(idea.target?.price, 58985);
	assert.equal(idea.invalidation?.price, 63516);
});

test('wrapAnalysisTradeSetup marks unclear when short levels are out of order', () => {
	const idea = wrapAnalysisTradeSetup(
		{
			kind: 'chart_pattern',
			setup: {
				status: 'clear',
				source: 'primary_pattern',
				patternNumber: 1,
				patternId: 'descending_triangle',
				patternName: 'Descending Triangle',
				classification: 'bearish',
				confidence: 0.7,
				side: 'short',
				lastClose: 90,
				triggerPrice: 100,
				triggerLabel: 'S2 retest',
				targetPrice: 120,
				targetDirection: 'down',
				targetStatus: 'projected',
				invalidationPrice: 110,
				invalidationLabel: 'R2 pattern fail',
				entryOffsetMode: 'retest',
			},
		},
		{toolName: 'analyze_chart_patterns', symbol: 'ETH'},
	);
	assert.equal(idea.status, 'unclear');
	assert.match(idea.unclearReason ?? '', /target < entry < invalidation/i);
	assert.match(idea.unclearReason ?? '', /after desk offsets/i);
});

test('wrapAnalysisTradeSetup marks unclear when bounce entry equals invalidation after offsets', () => {
	const idea = wrapAnalysisTradeSetup(
		{
			kind: 'chart_pattern',
			setup: {
				status: 'clear',
				source: 'primary_pattern',
				patternNumber: 1,
				patternId: 'falling_wedge',
				patternName: 'Falling Wedge',
				classification: 'bullish',
				confidence: 0.72,
				side: 'long',
				lastClose: 1705,
				triggerPrice: 1700,
				triggerLabel: 'S2 bounce',
				targetPrice: 1940,
				targetDirection: 'up',
				targetStatus: 'projected',
				invalidationPrice: 1700,
				invalidationLabel: 'S2 pattern fail',
				entryOffsetMode: 'bounce',
			},
		},
		{toolName: 'analyze_chart_patterns', symbol: 'ETH'},
	);
	assert.equal(idea.status, 'unclear');
	assert.match(idea.unclearReason ?? '', /target > entry > invalidation/i);
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
	const levels = [
		{price: 98, kind: 'support' as const, strength: 80, touchCount: 3},
		{price: 105, kind: 'resistance' as const, strength: 70, touchCount: 2},
	];
	const levelMenu = buildKeyLevelMenu(levels, 100);
	const setup = buildKeyLevelsTradeSetup({
		lastClose: 100,
		nearestSupport: {price: 98, strength: 80},
		nearestResistance: {price: 105, strength: 70},
		levels,
		levelMenu,
		fibPairs: [],
		bars: [{time: 1000, open: 100, high: 101, low: 99, close: 100}],
		entryProximityPct: 5,
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
