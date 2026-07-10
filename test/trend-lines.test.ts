import assert from 'node:assert/strict';
import test from 'node:test';
import {applyChartDrawings} from '../dist/core/chart/apply-chart-drawings.js';
import {calculateTrendLines} from '../dist/core/chart/levels/calculate-tools.js';
import {calculateTrendLinesFromBars} from '../dist/core/chart/levels/trend-lines.js';
import {prepareChart} from '../dist/core/chart/prepare.js';
import {nestedIntervalToolResult} from './fixtures/chart-data-shapes.ts';

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

test('calculateTrendLinesFromBars returns diagonal candidates', () => {
	const bars = syntheticBars(48);
	const lines = calculateTrendLinesFromBars(bars, {minTouches: 2, maxLines: 4});
	assert.ok(lines.length >= 1);
	for (const line of lines) {
		assert.ok(line.pointB.time > line.pointA.time);
		assert.ok(Number.isFinite(line.slope));
		assert.ok(line.touchCount >= 2);
	}
});

test('calculateTrendLines MCP wrapper parses rows input', () => {
	const bars = syntheticBars(40);
	const result = calculateTrendLines({rows: bars});
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.ok(Array.isArray(result.data.trendLines));
	}
});

test('prepareChart expands trend_lines overlay to diagonal line series', () => {
	const bars = syntheticBars(40);
	const calc = calculateTrendLines({rows: bars});
	assert.equal(calc.ok, true);
	if (!calc.ok || !calc.data.trendLines.length) {
		return;
	}
	const line = calc.data.trendLines[0]!;
	const prepared = prepareChart({
		title: 'Trend test',
		bars,
		overlays: [
			{
				type: 'trend_lines',
				lines: [
					{
						kind: line.kind,
						pointA: line.pointA,
						pointB: line.pointB,
					},
				],
			},
		],
		options: {skipDefaultOverlays: true},
	});
	assert.equal(prepared.ok, true);
	if (prepared.ok) {
		const trendSeries = prepared.data.chart.series.filter(s => /trend_/i.test(s.id));
		assert.equal(trendSeries.length, 1);
		assert.equal(trendSeries[0]?.data.length, 2);
		assert.notEqual(trendSeries[0]?.data[0]?.value, trendSeries[0]?.data[1]?.value);
		assert.equal(trendSeries[0]?.style?.lineStyle, 'solid');
		assert.ok((trendSeries[0]?.style?.lineWidth ?? 0) >= 3);
	}
});

test('applyChartDrawings merges trendLines into prepare output', () => {
	const bars = syntheticBars(40);
	const calc = calculateTrendLines({rows: bars});
	assert.equal(calc.ok, true);
	if (!calc.ok || !calc.data.trendLines.length) {
		return;
	}
	const applied = applyChartDrawings({
		title: 'Trend apply',
		toolResult: nestedIntervalToolResult(
			bars.map(b => ({
				timestampMs: Number(b.time) * 1000,
				open: String(b.open),
				high: String(b.high),
				low: String(b.low),
				close: String(b.close),
				volume: String(b.volume ?? 0),
			})),
			{
				coin: 'ASSET',
				interval: '1h',
				startTimeMs: Number(bars[0]!.time) * 1000,
				endTimeMs: Number(bars.at(-1)!.time) * 1000,
			},
		),
		rows: bars,
		trendLines: calc.data.trendLines.map(line => ({
			kind: line.kind,
			pointA: line.pointA,
			pointB: line.pointB,
		})),
	});
	assert.equal(applied.ok, true);
	if (applied.ok) {
		assert.ok(applied.data.chart.series.some(s => /trend_/i.test(s.id)));
		assert.ok(applied.data.prepareReplay?.overlays?.some(o => o.type === 'trend_lines'));
	}
});

test('applyChartDrawings preserves nested-interval-envelope live binding from toolResult', () => {
	const bars = syntheticBars(40);
	const calc = calculateTrendLines({rows: bars});
	assert.equal(calc.ok, true);
	if (!calc.ok || !calc.data.trendLines.length) {
		return;
	}
	const toolResult = nestedIntervalToolResult(
		bars.map(b => ({
			timestampMs: (b.time as number) * 1000,
			open: String(b.open),
			high: String(b.high),
			low: String(b.low),
			close: String(b.close),
			volume: String(b.volume),
		})),
		{coin: 'ASSET', interval: '1h'},
	);
	const applied = applyChartDrawings({
		title: 'BTC live',
		toolResult,
		trendLines: calc.data.trendLines.map(line => ({
			kind: line.kind,
			pointA: line.pointA,
			pointB: line.pointB,
		})),
	});
	assert.equal(applied.ok, true);
	if (applied.ok) {
		assert.equal(applied.data.live?.providerId, 'hyperliquid.allMids');
		assert.equal(applied.data.live?.params.coin, 'ASSET');
	}
});

test('applyChartDrawings rejects candles outside fetch window when toolResult is mangled', () => {
	const bars = syntheticBars(40);
	const calc = calculateTrendLines({rows: bars});
	assert.equal(calc.ok, true);
	if (!calc.ok || !calc.data.trendLines.length) {
		return;
	}
	const startTimeMs = 1_782_655_200_000;
	const endTimeMs = 1_783_260_000_000;
	const applied = applyChartDrawings({
		title: 'ETH-PERP 1H',
		toolResult: {
			ohlcv: {
				interval: '1h',
				startTimeMs,
				endTimeMs,
				candles: bars.map(b => ({
					time: 1_752_446_400 + (bars.indexOf(b) * 3600),
					open: b.open,
					high: b.high,
					low: b.low,
					close: b.close,
					volume: b.volume,
				})),
			},
		},
		trendLines: calc.data.trendLines.map(line => ({
			kind: line.kind,
			pointA: line.pointA,
			pointB: line.pointB,
		})),
	});
	assert.equal(applied.ok, false);
	if (!applied.ok) {
		assert.match(applied.reason, /fetch window|timestampMs/i);
	}
});

test('applyChartDrawings rejects analyze-style trendLines without geometry', () => {
	const bars = syntheticBars(40);
	const applied = applyChartDrawings({
		toolResult: nestedIntervalToolResult(
			bars.map(b => ({
				timestampMs: Number(b.time) * 1000,
				open: String(b.open),
				high: String(b.high),
				low: String(b.low),
				close: String(b.close),
				volume: String(b.volume ?? 0),
			})),
			{
				coin: 'ASSET',
				interval: '1h',
				startTimeMs: Number(bars[0]!.time) * 1000,
				endTimeMs: Number(bars.at(-1)!.time) * 1000,
			},
		),
		rows: bars,
		trendLines: [{kind: 'support', score: 49, touchCount: 24} as never],
	});
	assert.equal(applied.ok, false);
	if (!applied.ok) {
		assert.match(applied.reason, /calculate_trend_lines/);
	}
});
