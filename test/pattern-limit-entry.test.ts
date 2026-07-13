import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	boundaryAtRightEdge,
	patternPhase,
	resolvePatternLimitLevels,
	withinEntryProximity,
} from '../dist/core/chart/analysis/trade-setups/pattern-limit-entry.js';
import {
	applyEntryOffset,
	applyInvalidationOffset,
	validateBuildTradePrices,
} from '../dist/core/chart/analysis/trade-setups/build-trade.js';
import {
	formatTradePurposeMetaCtm1,
	parseTradePurposeMetaCtm1,
} from '../dist/core/chart/analysis/trade-setups/trade-purpose-format.js';
import {buildChartPatternTradeSetupFromSummary} from '../dist/core/chart/analysis/trade-setups/chart-pattern-trade-setup.js';

test('falling wedge inside long uses support bounce entry', () => {
	const levels = boundaryAtRightEdge([
		{price: 1700, label: 'S2'},
		{price: 1800, label: 'R2'},
	]);
	assert.ok(levels);
	assert.equal(patternPhase(1705, levels.support, levels.resistance), 'inside');
	const resolved = resolvePatternLimitLevels({
		patternId: 'falling_wedge',
		lastClose: 1705,
		keyLevels: [
			{price: 1700, label: 'S2'},
			{price: 1800, label: 'R2'},
		],
		classificationSide: 'long',
	});
	assert.equal(resolved.ok, true);
	if (resolved.ok) {
		assert.equal(resolved.levels.triggerPrice, 1700);
		assert.equal(resolved.levels.invalidationPrice, 1700);
		assert.equal(resolved.levels.entryPhase, 'inside_pattern');
		assert.equal(resolved.levels.entryOffsetMode, 'bounce');
	}
});

test('falling wedge post-breakout retest uses upper boundary', () => {
	const resolved = resolvePatternLimitLevels({
		patternId: 'falling_wedge',
		lastClose: 1810,
		keyLevels: [
			{price: 1700, label: 'S2'},
			{price: 1800, label: 'R2'},
		],
		classificationSide: 'long',
	});
	assert.equal(resolved.ok, true);
	if (resolved.ok) {
		assert.equal(resolved.levels.triggerPrice, 1800);
		assert.equal(resolved.levels.invalidationPrice, 1700);
		assert.equal(resolved.levels.entryPhase, 'post_breakout_retest');
		assert.equal(resolved.levels.entryOffsetMode, 'retest');
	}
});

test('symmetrical triangle suppresses inside pattern', () => {
	const resolved = resolvePatternLimitLevels({
		patternId: 'symmetrical_triangle',
		lastClose: 1750,
		keyLevels: [
			{price: 1700, label: 'S2'},
			{price: 1800, label: 'R2'},
		],
		classificationSide: 'neutral',
	});
	assert.equal(resolved.ok, false);
});

test('symmetrical triangle long after break above', () => {
	const resolved = resolvePatternLimitLevels({
		patternId: 'symmetrical_triangle',
		lastClose: 1810,
		keyLevels: [
			{price: 1700, label: 'S2'},
			{price: 1800, label: 'R2'},
		],
		classificationSide: 'neutral',
	});
	assert.equal(resolved.ok, true);
	if (resolved.ok) {
		assert.equal(resolved.levels.limitSide, 'long');
		assert.equal(resolved.levels.triggerPrice, 1800);
		assert.equal(resolved.levels.invalidationPrice, 1700);
	}
});

test('invalidation offset widens stop beyond failure level', () => {
	assert.equal(applyInvalidationOffset(1700, 'long', 1), 1683);
	assert.equal(applyInvalidationOffset(1831, 'short', 1), 1849.31);
});

test('entry offset retest vs bounce', () => {
	assert.equal(applyEntryOffset(1831, 'long', 1, 'retest'), 1831 * 1.01);
	assert.equal(applyEntryOffset(1700, 'long', 1, 'bounce'), 1700 * 0.99);
});

test('withinEntryProximity default 1%', () => {
	assert.equal(withinEntryProximity(1708, 1700, 1), true);
	assert.equal(withinEntryProximity(1777, 1700, 1), false);
});

test('withinEntryProximity ATR mode uses pct of ATR as absolute distance', () => {
	const options = {mode: 'atr' as const, atr: 100};
	assert.equal(withinEntryProximity(100.5, 100, 1, options), true);
	assert.equal(withinEntryProximity(102, 100, 1, options), false);
});

test('ctm1 purpose format parses pfE and side', () => {
	const {meta} = formatTradePurposeMetaCtm1({
		protocol: 'gmx',
		side: 'long',
		setup: 'fw-ret',
		entryEffective: 1851,
		patternFailureEffective: 1683,
		symbolShort: 'ETH',
		entryBase: 1831,
		patternFailureBase: 1700,
	});
	assert.ok(meta.startsWith('ctm1|gmx|L|fw-ret|'));
	assert.ok([...meta].length <= 256);
	const parsed = parseTradePurposeMetaCtm1(meta);
	assert.ok(parsed);
	assert.equal(parsed!.side, 'long');
	assert.equal(parsed!.patternFailureEffective, 1683);
	assert.equal(parsed!.setup, 'fw-ret');
});

test('buildChartPatternTradeSetupFromSummary uses pattern limits', () => {
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
		'forming',
	);
	assert.equal(setup.status, 'clear');
	assert.equal(setup.side, 'long');
	assert.equal(setup.triggerPrice, 1700);
	assert.equal(setup.targetPrice, 1940);
	assert.equal(setup.setupPurposeCode, 'fw-bnc');
});

test('validateBuildTradePrices allows short retest limit below last close', () => {
	const validated = validateBuildTradePrices(
		{
			id: 'trend-short-retest',
			source: {analysisType: 'trend_structure', toolName: 'analyze_trend_structure'},
			status: 'clear',
			completeness: 'full',
			side: 'short',
			confidence: 0.7,
			lastClose: 2100,
			entry: {price: 2050, label: 'resistance trend retest'},
			invalidation: {price: 2120, label: 'recent swing high'},
			analysisSetup: {
				kind: 'trend_structure',
				setup: {
					status: 'clear',
					source: 'trend_structure',
					bias: 'bearish',
					structure: 'lower_lows',
					lastClose: 2100,
					side: 'short',
					confidence: 0.7,
					triggerPrice: 2050,
					entryOffsetMode: 'retest',
					setupPurposeCode: 'trend-ret',
				},
			},
			createdAtSec: 1,
		},
		{
			tradeIdea: {} as never,
			protocolId: 'hyperliquid',
			keyGenId: 'kg',
			chainId: 999,
			purposeText: 'test',
			entryOffsetPct: 1,
			szHuman: '0.1',
		},
	);
	assert.equal(validated.ok, true);
	if (validated.ok) {
		assert.ok(validated.data.entry < 2100);
	}
});

test('validateBuildTradePrices still rejects bounce short below last close', () => {
	const validated = validateBuildTradePrices(
		{
			id: 'bounce-short',
			source: {analysisType: 'key_levels', toolName: 'analyze_key_levels'},
			status: 'clear',
			completeness: 'full',
			side: 'short',
			confidence: 0.7,
			lastClose: 2100,
			entry: {price: 2050, label: 'resistance bounce'},
			analysisSetup: {
				kind: 'key_levels',
				setup: {
					status: 'clear',
					source: 'nearest_resistance',
					lastClose: 2100,
					side: 'short',
					confidence: 0.7,
					entryPrice: 2050,
					framing: 'bounce',
					entryOffsetMode: 'bounce',
				},
			},
			createdAtSec: 1,
		},
		{
			tradeIdea: {} as never,
			protocolId: 'hyperliquid',
			keyGenId: 'kg',
			chainId: 999,
			purposeText: 'test',
			szHuman: '0.1',
		},
	);
	assert.equal(validated.ok, false);
	if (!validated.ok) {
		assert.match(validated.reason, /below last close/i);
	}
});
