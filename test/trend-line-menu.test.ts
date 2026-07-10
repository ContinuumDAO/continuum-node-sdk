import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeTrendStructure} from '../dist/core/chart/analysis/analyze-tools.js';
import {applyTrendLineDrawings} from '../dist/core/chart/analysis/trend-line-drawings-tools.js';
import {
	buildTrendLineMenu,
	pickTrendLineByNumber,
	trendLineMenuLabel,
} from '../dist/core/chart/analysis/trend-line-menu-summary.js';
import {buildTrendStructureTradeSetup} from '../dist/core/chart/analysis/trade-setups/trend-structure-trade-setup.js';
import {calculateTrendLinesFromBars} from '../dist/core/chart/levels/trend-lines.js';
import {prepareChart} from '../dist/core/chart/prepare.js';

function syntheticBars(count: number): Record<string, unknown>[] {
	const bars: Record<string, unknown>[] = [];
	let price = 100;
	for (let i = 0; i < count; i++) {
		const wave = Math.sin(i / 3) * 4;
		const drift = i * 0.35;
		const open = price;
		const close = price + wave + 0.2;
		const high = Math.max(open, close) + 1.5;
		const low = Math.min(open, close) - 1.5;
		bars.push({
			time: 1_700_000_000 + i * 3600,
			open,
			high,
			low,
			close,
			volume: 1000 + i,
		});
		price = close + drift * 0.05;
	}
	return bars;
}

test('analyzeTrendStructure returns trendLineMenu and trendStructureTradeSetup', async () => {
	const bars = syntheticBars(48);
	const result = await analyzeTrendStructure({
		rows: bars,
		title: 'TEST 1H',
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const analysis = result.data.analysis;
	assert.ok(Array.isArray(analysis.trendLineMenu));
	assert.ok('summary' in analysis);
	assert.ok('interpretation' in analysis);
	assert.ok(Array.isArray(analysis.drawableTrendLines));
	if (analysis.trendLineMenu.length > 0) {
		const row = analysis.trendLineMenu[0]!;
		assert.equal(row.trendLineNumber, 1);
		assert.ok(row.isPrimary);
		assert.ok(row.barSpan.barCount >= 1);
		assert.ok(typeof analysis.trendStructureTradeSetup === 'object');
		if (analysis.trendStructureTradeSetup?.trendLineNumber != null) {
			assert.match(analysis.interpretation, /Trade setup uses Trend #/);
		}
	}
});

test('buildTrendLineMenu ranks primary by highest score', () => {
	const bars = syntheticBars(48);
	const lines = calculateTrendLinesFromBars(bars, {});
	const menu = buildTrendLineMenu(lines, bars);
	if (menu.length < 2) {
		return;
	}
	const topScore = Math.max(...menu.map(row => row.score));
	assert.equal(menu[0]!.score, topScore);
	assert.equal(menu.filter(row => row.isPrimary).length, menu.filter(row => row.score === topScore).length);
});

test('pickTrendLineByNumber and trendLineMenuLabel', () => {
	const line = {
		kind: 'support' as const,
		pointA: {time: 100, price: 99},
		pointB: {time: 200, price: 101},
		slope: 0.02,
		touchCount: 3,
		score: 4.5,
	};
	assert.equal(trendLineMenuLabel(line, 2), 'Trend #2 Support');
	assert.equal(pickTrendLineByNumber([line], 1), line);
	assert.equal(pickTrendLineByNumber([line], 2), undefined);
});

test('buildTrendStructureTradeSetup omits normalizedConfidence field', () => {
	const bars = syntheticBars(48);
	const lines = calculateTrendLinesFromBars(bars, {});
	const setup = buildTrendStructureTradeSetup({
		bias: 'bullish',
		structure: 'higher_highs',
		lastClose: 120,
		swingHigh: {price: 125},
		swingLow: {price: 110},
		primaryTrendLine: lines[0] ?? null,
		bars,
	});
	if (!setup) {
		return;
	}
	assert.ok('confidence' in setup);
	assert.equal((setup as {normalizedConfidence?: unknown}).normalizedConfidence, undefined);
});

test('applyTrendLineDrawings merges trend overlays incrementally', async () => {
	const bars = syntheticBars(48);
	const analysisResult = await analyzeTrendStructure({
		rows: bars,
		title: 'Trend apply',
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(analysisResult.ok, true);
	if (!analysisResult.ok || analysisResult.data.analysis.trendLineMenu.length < 1) {
		return;
	}
	const prepared = prepareChart({
		title: 'Trend apply',
		bars,
		options: {skipDefaultOverlays: true},
	});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const first = await applyTrendLineDrawings({
		rows: bars,
		prepareReplay: prepared.data.prepareReplay,
		trendLineNumber: 1,
		analysis: analysisResult.data.analysis,
	});
	assert.equal(first.ok, true);
	if (!first.ok) {
		return;
	}
	const label = trendLineMenuLabel(
		analysisResult.data.analysis.drawableTrendLines[0]!,
		1,
	);
	const firstSeries = first.data.chart.series.filter(s => s.label === label);
	assert.equal(firstSeries.length, 1);

	if (analysisResult.data.analysis.trendLineMenu.length < 2) {
		return;
	}
	const second = await applyTrendLineDrawings({
		rows: bars,
		prepareReplay: first.data.prepareReplay,
		trendLineNumber: 2,
		analysis: analysisResult.data.analysis,
	});
	assert.equal(second.ok, true);
	if (!second.ok) {
		return;
	}
	const label2 = trendLineMenuLabel(
		analysisResult.data.analysis.drawableTrendLines[1]!,
		2,
	);
	const merged = second.data.chart.series.filter(
		s => s.label === label || s.label === label2,
	);
	assert.equal(merged.length, 2);
});
