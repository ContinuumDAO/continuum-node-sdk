import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeTrendStructure} from '../dist/core/chart/analysis/analyze-tools.js';
import {
	buildTrendStructureTradeSetup,
	normalizeTrendStructureTradeSetup,
} from '../dist/core/chart/analysis/trade-setups/trend-structure-trade-setup.js';
import {
	pickTrendLineForTradeSetup,
	trendLineForTradeSetupByNumber,
} from '../dist/core/chart/analysis/trend-line-menu-summary.js';
import {calculateTrendLinesFromBars, type TrendLine} from '../dist/core/chart/levels/trend-lines.js';
import {tradeIdeaFromAnalyzeOutput} from '../dist/core/chart/analysis/trade-setups/trade-idea.js';
import {tradeSetupPurposeCode} from '../dist/core/chart/analysis/trade-setups/trade-purpose-format.js';

function syntheticBars(count: number): Record<string, unknown>[] {
	const bars: Record<string, unknown>[] = [];
	let price = 100;
	for (let i = 0; i < count; i++) {
		const wave = Math.sin(i / 3) * 4;
		const open = price;
		const close = price + wave + 0.2;
		bars.push({
			time: 1_700_000_000 + i * 14_400,
			open,
			high: Math.max(open, close) + 2,
			low: Math.min(open, close) - 2,
			close,
			volume: 1000 + i,
		});
		price = close + i * 0.02;
	}
	return bars;
}

test('pickTrendLineForTradeSetup prefers support for bullish bias', () => {
	const lines = calculateTrendLinesFromBars(syntheticBars(80), {maxLines: 6});
	assert.ok(lines.length >= 2);
	const top = lines[0]!;
	const bars = syntheticBars(80);
	const lastClose = Number(bars[bars.length - 1]!.close);
	const picked = pickTrendLineForTradeSetup('bullish', lines, bars, lastClose);
	assert.ok(picked.line);
	assert.equal(picked.line!.kind, 'support');
	assert.ok(picked.trendLineNumber != null && picked.trendLineNumber >= 1);
	const menuIndex = lines.findIndex(line => line === picked.line);
	assert.equal(picked.trendLineNumber, menuIndex + 1);
	if (top.kind === 'resistance') {
		assert.notEqual(picked.line!.kind, top.kind);
	}
});

test('pickTrendLineForTradeSetup rejects stale resistance below spot for short', () => {
	const bars: Record<string, unknown>[] = [];
	const t0 = 1_700_000_000;
	for (let i = 0; i < 40; i++) {
		bars.push({
			time: t0 + i * 14_400,
			open: 1700 + i * 2,
			high: 1710 + i * 2,
			low: 1690 + i * 2,
			close: 1705 + i * 2,
			volume: 1000,
		});
	}
	const lastClose = 1777;
	const staleResistance: TrendLine = {
		kind: 'resistance',
		pointA: {time: t0, price: 2200},
		pointB: {time: t0 + 20 * 14_400, price: 1500},
		slope: (1500 - 2200) / (20 * 14_400),
		touchCount: 5,
		score: 12,
	};
	const picked = pickTrendLineForTradeSetup('bearish', [staleResistance], bars, lastClose);
	assert.equal(picked.line, null);
});

test('trendLineForTradeSetupByNumber honors explicit menu override', () => {
	const lines: TrendLine[] = [
		{
			kind: 'support',
			pointA: {time: 1, price: 100},
			pointB: {time: 2, price: 110},
			slope: 10,
			touchCount: 5,
			score: 40,
		},
		{
			kind: 'support',
			pointA: {time: 1, price: 120},
			pointB: {time: 2, price: 130},
			slope: 10,
			touchCount: 3,
			score: 20,
		},
	];
	const bars = [
		{time: 1, open: 125, high: 126, low: 124, close: 125},
		{time: 2, open: 125, high: 126, low: 124, close: 125},
	];
	const auto = pickTrendLineForTradeSetup('bullish', lines, bars, 125);
	assert.equal(auto.trendLineNumber, 1);
	const explicit = trendLineForTradeSetupByNumber(lines, 2);
	assert.equal(explicit.trendLineNumber, 2);
	assert.equal(explicit.line, lines[1]);
});

test('pickTrendLineForTradeSetup prefers valid overhead retest for short', () => {
	const bars: Record<string, unknown>[] = [];
	const t0 = 1_700_000_000;
	for (let i = 0; i < 40; i++) {
		bars.push({
			time: t0 + i * 14_400,
			open: 1700 + i * 2,
			high: 1710 + i * 2,
			low: 1690 + i * 2,
			close: 1705 + i * 2,
			volume: 1000,
		});
	}
	const lastClose = 1777;
	const staleResistance: TrendLine = {
		kind: 'resistance',
		pointA: {time: t0, price: 2200},
		pointB: {time: t0 + 20 * 14_400, price: 1500},
		slope: (1500 - 2200) / (20 * 14_400),
		touchCount: 5,
		score: 12,
	};
	const nearResistance: TrendLine = {
		kind: 'resistance',
		pointA: {time: t0 + 25 * 14_400, price: 1820},
		pointB: {time: t0 + 35 * 14_400, price: 1785},
		slope: (1785 - 1820) / (10 * 14_400),
		touchCount: 3,
		score: 6,
	};
	const brokenSupport: TrendLine = {
		kind: 'support',
		pointA: {time: t0, price: 1511},
		pointB: {time: t0 + 39 * 14_400, price: 1806},
		slope: (1806 - 1511) / (39 * 14_400),
		touchCount: 19,
		score: 38,
	};
	const lines = [staleResistance, brokenSupport, nearResistance];
	const picked = pickTrendLineForTradeSetup('bearish', lines, bars, lastClose);
	assert.ok(picked.line);
	assert.equal(picked.line, brokenSupport);
	assert.equal(picked.trendLineNumber, 2);
	const entry = buildTrendStructureTradeSetup({
		bias: 'bearish',
		structure: 'lower_lows',
		lastClose,
		swingHigh: {price: 1829},
		swingLow: {price: 1600},
		primaryTrendLine: picked.line,
		trendLineNumber: picked.trendLineNumber,
		bars,
	});
	assert.ok(entry);
	assert.ok(entry!.triggerPrice != null && entry!.triggerPrice > 1750);
	assert.ok(entry!.triggerPrice! < 1850);
	assert.match(entry!.triggerLabel ?? '', /broken support/i);
});

test('buildTrendStructureTradeSetup includes retest purpose metadata', () => {
	const bars = syntheticBars(80);
	const lines = calculateTrendLinesFromBars(bars, {maxLines: 4});
	const lastClose = Number(bars[bars.length - 1]!.close);
	const pick = pickTrendLineForTradeSetup('bullish', lines, bars, lastClose);
	const line = pick.line;
	const trendLineNumber = pick.trendLineNumber;
	const setup = buildTrendStructureTradeSetup({
		bias: 'bullish',
		structure: 'higher_highs',
		lastClose: 200,
		swingHigh: {price: 220},
		swingLow: {price: 180},
		primaryTrendLine: line,
		trendLineNumber,
		bars,
	});
	assert.ok(setup);
	assert.equal(setup!.entryOffsetMode, 'retest');
	assert.equal(setup!.setupPurposeCode, 'trend-ret');
	if (trendLineNumber != null) {
		assert.equal(setup!.trendLineNumber, trendLineNumber);
	}
	assert.equal(tradeSetupPurposeCode({analysisType: 'trend_structure'}), 'trend-ret');
});

test('analyzeTrendStructure upserts trend_structure trade idea', async () => {
	const bars = syntheticBars(80);
	const result = await analyzeTrendStructure({
		rows: bars,
		title: 'ETH 4H',
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.ok(result.data.analysis.trendStructureTradeSetup);
	const setup = result.data.analysis.trendStructureTradeSetup!;
	if (result.data.analysis.trendLineMenu.length > 0 && setup.trendLineNumber != null) {
		assert.ok(setup.trendLineNumber >= 1);
		assert.ok(setup.trendLineNumber <= result.data.analysis.trendLineMenu.length);
	}
	const idea = tradeIdeaFromAnalyzeOutput('analyze_trend_structure', result.data.analysis, {
		symbol: 'ETH',
	});
	assert.ok(idea);
	assert.equal(idea!.source.analysisType, 'trend_structure');
	assert.ok(idea!.entry.price > 0);
	const normalized = normalizeTrendStructureTradeSetup(result.data.analysis.trendStructureTradeSetup!);
	assert.match(normalized.entry.label ?? '', /trend|close/i);
});
