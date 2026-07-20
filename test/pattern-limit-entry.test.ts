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
	applyTargetOffset,
	mapTradeIdeaToHyperliquidLimitInput,
	mapTradeIdeaToGmxIncreaseInput,
	validateBuildTradePrices,
	formatHumanPrice,
} from '../dist/core/chart/analysis/trade-setups/build-trade.js';
import {
	composeTradePurposeText,
	formatTradePurposeMetaCtm1,
	parseTradePurposeMetaCtm1,
	splitSignRequestPurposeText,
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

test('ctm1 purpose format includes sz and szUsd and parses additional text', () => {
	const composed = composeTradePurposeText(
		formatTradePurposeMetaCtm1({
			protocol: 'hl',
			side: 'long',
			setup: 'trend-ret',
			entryEffective: 2950,
			patternFailureEffective: 2800,
			symbolShort: 'BTC',
			szHuman: '0.5',
		}).meta,
		'trend retest',
	);
	assert.ok(composed.text.includes('sz=0.5'));
	assert.ok(composed.text.includes(' · trend retest'));
	const parsed = parseTradePurposeMetaCtm1(composed.text);
	assert.ok(parsed);
	assert.equal(parsed!.protocol, 'hl');
	assert.equal(parsed!.szHuman, '0.5');
	assert.equal(parsed!.additionalText, 'trend retest');
	assert.equal(parsed!.symbolShort, 'BTC');

	const gmxMeta = formatTradePurposeMetaCtm1({
		protocol: 'gmx',
		side: 'long',
		setup: 'kl-bnc',
		entryEffective: 3400,
		symbolShort: 'ETH',
		sizeUsdHuman: '2500',
	}).meta;
	assert.ok(gmxMeta.includes('szUsd=2500'));
	assert.equal(parseTradePurposeMetaCtm1(gmxMeta)!.sizeUsdHuman, '2500');
});

test('splitSignRequestPurposeText separates ctm1 prefix and suffix', () => {
	const split = splitSignRequestPurposeText(
		'ctm1|hl|L|trend-ret|eE=2950|sz=0.5|BTC · Generated by cron',
	);
	assert.equal(split.ctm1Prefix, 'ctm1|hl|L|trend-ret|eE=2950|sz=0.5|BTC');
	assert.equal(split.additionalText, 'Generated by cron');
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

test('mapTradeIdeaToHyperliquidLimitInput includes bracket TP/SL when target and invalidation exist', () => {
	const idea = {
		id: 'hl-bracket',
		source: {analysisType: 'trend_structure', toolName: 'analyze_trend_structure'},
		status: 'clear' as const,
		completeness: 'full' as const,
		side: 'long' as const,
		confidence: 0.8,
		lastClose: 2950,
		symbol: 'ETH',
		entry: {price: 2900, label: 'support'},
		target: {price: 3100, label: 'measured move'},
		invalidation: {price: 2850, label: 'swing low'},
		analysisSetup: {
			kind: 'trend_structure' as const,
			setup: {
				status: 'clear' as const,
				source: 'trend_structure',
				lastClose: 2950,
				side: 'long' as const,
				confidence: 0.8,
				triggerPrice: 2900,
				entryOffsetMode: 'bounce' as const,
				setupPurposeCode: 'trend-ret',
			},
		},
		createdAtSec: 1,
	};
	const mapped = mapTradeIdeaToHyperliquidLimitInput(idea, {
		tradeIdea: idea,
		protocolId: 'hyperliquid',
		keyGenId: 'kg',
		chainId: 999,
		purposeText: 'test',
		szHuman: '0.5',
		targetOffsetPct: 1,
		tpslExecMode: 'limit_at_trigger',
	});
	assert.equal(mapped.ok, true);
	if (mapped.ok) {
		assert.equal(mapped.data.coin, 'ETH');
		assert.ok(mapped.data.takeProfitTriggerPxHuman);
		assert.ok(mapped.data.stopLossTriggerPxHuman);
		assert.equal(mapped.data.tpslExecMode, 'limit_at_trigger');
		const tp = applyTargetOffset(3100, 'long', 1);
		assert.equal(mapped.data.takeProfitTriggerPxHuman, formatHumanPrice(tp));
	}
});

test('applyTargetOffset atr mode pulls TP inside target by fraction of ATR', () => {
	assert.equal(applyTargetOffset(3100, 'long', 25, 'atr', 40), 3090);
	assert.equal(applyTargetOffset(3100, 'short', 25, 'atr', 40), 3110);
	assert.equal(applyTargetOffset(3100, 'long', 1, 'price'), 3100 * 0.99);
	assert.equal(applyTargetOffset(3100, 'short', 1, 'price'), 3100 * 1.01);
});

test('mapTradeIdeaToGmxIncreaseInput includes native TP/SL when target and invalidation exist', () => {
	const idea = {
		id: 'gmx-bracket',
		source: {analysisType: 'trend_structure', toolName: 'analyze_trend_structure'},
		status: 'clear' as const,
		completeness: 'full' as const,
		side: 'long' as const,
		confidence: 0.8,
		lastClose: 2950,
		symbol: 'ETH/USD [WETH-USDC]',
		entry: {price: 2900, label: 'support'},
		target: {price: 3100, label: 'measured move'},
		invalidation: {price: 2850, label: 'swing low'},
		analysisSetup: {
			kind: 'trend_structure' as const,
			setup: {
				status: 'clear' as const,
				source: 'trend_structure',
				lastClose: 2950,
				side: 'long' as const,
				confidence: 0.8,
				triggerPrice: 2900,
				entryOffsetMode: 'bounce' as const,
				setupPurposeCode: 'trend-ret',
			},
		},
		createdAtSec: 1,
	};
	const mapped = mapTradeIdeaToGmxIncreaseInput(idea, {
		tradeIdea: idea,
		protocolId: 'gmx',
		keyGenId: 'kg',
		chainId: 42161,
		purposeText: 'test',
		sizeUsdHuman: '500',
		collateralToken: 'USDC',
		collateralAmountHuman: '100',
		targetOffsetPct: 1,
	});
	assert.equal(mapped.ok, true);
	if (mapped.ok) {
		assert.equal(mapped.data.symbol, 'ETH/USD [WETH-USDC]');
		assert.ok(mapped.data.takeProfitPriceUsdHuman);
		assert.ok(mapped.data.stopLossPriceUsdHuman);
		assert.ok(mapped.data.patternFailureUsdHuman);
		const tp = applyTargetOffset(3100, 'long', 1);
		assert.equal(mapped.data.takeProfitPriceUsdHuman, formatHumanPrice(tp));
	}
});

test('mapTradeIdeaToHyperliquidLimitInput omits bracket fields for entry-only ideas', () => {
	const idea = {
		id: 'hl-entry-only',
		source: {analysisType: 'key_levels', toolName: 'analyze_key_levels'},
		status: 'clear' as const,
		completeness: 'full' as const,
		side: 'long' as const,
		confidence: 0.7,
		lastClose: 2950,
		symbol: 'ETH',
		entry: {price: 2900, label: 'support'},
		analysisSetup: {
			kind: 'key_levels' as const,
			setup: {
				status: 'clear' as const,
				source: 'nearest_support',
				lastClose: 2950,
				side: 'long' as const,
				confidence: 0.7,
				entryPrice: 2900,
				framing: 'bounce' as const,
				entryOffsetMode: 'bounce' as const,
			},
		},
		createdAtSec: 1,
	};
	const mapped = mapTradeIdeaToHyperliquidLimitInput(idea, {
		tradeIdea: idea,
		protocolId: 'hyperliquid',
		keyGenId: 'kg',
		chainId: 999,
		purposeText: 'test',
		szHuman: '0.5',
	});
	assert.equal(mapped.ok, true);
	if (mapped.ok) {
		assert.equal(mapped.data.takeProfitTriggerPxHuman, undefined);
		assert.equal(mapped.data.stopLossTriggerPxHuman, undefined);
		assert.equal(mapped.data.tpslExecMode, undefined);
	}
});
