import assert from 'node:assert/strict';
import test from 'node:test';
import {applyChartDrawings} from '../dist/core/chart/apply-chart-drawings.js';
import {calculateTrendLines} from '../dist/core/chart/levels/calculate-tools.js';
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
