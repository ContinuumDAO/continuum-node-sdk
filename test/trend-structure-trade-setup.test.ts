import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeTrendStructure} from '../dist/core/chart/analysis/analyze-tools.js';
import {
	buildTrendStructureTradeSetup,
	normalizeTrendStructureTradeSetup,
} from '../dist/core/chart/analysis/trade-setups/trend-structure-trade-setup.js';
import {
	pickTrendLineForTradeSetup,
} from '../dist/core/chart/analysis/trend-line-menu-summary.js';
import {calculateTrendLinesFromBars} from '../dist/core/chart/levels/trend-lines.js';
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
	const picked = pickTrendLineForTradeSetup('bullish', lines);
	assert.ok(picked);
	assert.equal(picked!.kind, 'support');
	if (top.kind === 'resistance') {
		assert.notEqual(picked!.kind, top.kind);
	}
});

test('buildTrendStructureTradeSetup includes retest purpose metadata', () => {
	const bars = syntheticBars(80);
	const lines = calculateTrendLinesFromBars(bars, {maxLines: 4});
	const line = pickTrendLineForTradeSetup('bullish', lines);
	const setup = buildTrendStructureTradeSetup({
		bias: 'bullish',
		structure: 'higher_highs',
		lastClose: 200,
		swingHigh: {price: 220},
		swingLow: {price: 180},
		primaryTrendLine: line,
		bars,
	});
	assert.ok(setup);
	assert.equal(setup!.entryOffsetMode, 'retest');
	assert.equal(setup!.setupPurposeCode, 'trend-ret');
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
	const idea = tradeIdeaFromAnalyzeOutput('analyze_trend_structure', result.data.analysis, {
		symbol: 'ETH',
	});
	assert.ok(idea);
	assert.equal(idea!.source.analysisType, 'trend_structure');
	assert.ok(idea!.entry.price > 0);
	const normalized = normalizeTrendStructureTradeSetup(result.data.analysis.trendStructureTradeSetup!);
	assert.match(normalized.entry.label ?? '', /trend|close/i);
});
