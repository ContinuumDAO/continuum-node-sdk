import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chartPatternHitToOverlay} from '../dist/core/chart-patterns/geometry-to-overlay.js';
import {scanChartPatterns} from '../dist/core/chart-patterns/scan.js';
import {
	applyChartPatternDrawings,
	calculateChartPatternDrawings,
} from '../dist/core/chart/analysis/chart-patterns-drawings-tools.js';
import {prepareChartFromRows} from '../dist/core/chart/prepare-from-rows.js';

function bar(time: number, o: number, h: number, l: number, c: number) {
	return {time, open: o, high: h, low: l, close: c};
}

function buildDoubleTopBars(): ReturnType<typeof bar>[] {
	const bars: ReturnType<typeof bar>[] = [];
	let t = 1000;
	const push = (o: number, h: number, l: number, c: number) => {
		bars.push(bar(t, o, h, l, c));
		t += 1000;
	};
	for (let i = 0; i < 10; i++) {
		push(90 + i * 2, 92 + i * 2, 89 + i * 2, 91 + i * 2);
	}
	push(114, 120, 113, 118);
	push(112, 115, 100, 102);
	push(103, 108, 101, 106);
	push(108, 120, 107, 117);
	push(116, 118, 110, 112);
	for (let i = 0; i < 12; i++) {
		push(111 - i * 0.5, 113 - i * 0.5, 108 - i * 0.5, 110 - i * 0.5);
	}
	return bars;
}

test('chartPatternHitToOverlay produces chart_pattern overlay', () => {
	const rows = buildDoubleTopBars();
	const hits = scanChartPatterns(rows, {patterns: ['double_top'], minConfidence: 0.35});
	const hit = hits[0];
	assert.ok(hit);
	const overlay = chartPatternHitToOverlay(hit!);
	assert.equal(overlay.type, 'chart_pattern');
	assert.equal(overlay.patternName, hit!.name);
	assert.ok(overlay.points.length > 0);
});

test('calculateChartPatternDrawings returns patternOverlay bundle', () => {
	const rows = buildDoubleTopBars();
	const result = calculateChartPatternDrawings({
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.ok(result.data.drawings.patternOverlay);
	assert.equal((result.data.drawings.patternOverlay as {type: string}).type, 'chart_pattern');
});

test('applyChartPatternDrawings merges overlay into chart', () => {
	const rows = buildDoubleTopBars();
	const prepared = prepareChartFromRows({title: 'Pattern test', rows});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const calc = calculateChartPatternDrawings({
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
	});
	assert.equal(calc.ok, true);
	if (!calc.ok) {
		return;
	}
	const applied = applyChartPatternDrawings({
		rows,
		prepareReplay: prepared.data.prepareReplay,
		drawings: calc.data.drawings,
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	assert.match(applied.data.chart.title ?? '', /Double Top|Pattern test/);
	const overlaySeries = applied.data.chart.series.filter(s => s.id.startsWith('pattern_'));
	assert.ok(overlaySeries.length > 0);
});

test('applyChartPatternDrawings normalizes neckline kind in horizontalLevels', () => {
	const rows = buildDoubleTopBars();
	const calc = calculateChartPatternDrawings({
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
	});
	assert.equal(calc.ok, true);
	if (!calc.ok) {
		return;
	}
	const applied = applyChartPatternDrawings({
		rows,
		drawings: {
			horizontalLevels: calc.data.pattern.levels as Array<{
				price: number;
				label?: string;
				kind?: string;
			}>,
			patternOverlay: calc.data.drawings.patternOverlay,
		},
	});
	assert.equal(applied.ok, true);
});

test('applyChartPatternDrawings accepts stringified analysis JSON', () => {
	const rows = buildDoubleTopBars();
	const hits = scanChartPatterns(rows, {patterns: ['double_top'], minConfidence: 0.35});
	assert.ok(hits[0]);
	const applied = applyChartPatternDrawings({
		rows,
		analysis: JSON.stringify({pattern: hits[0]}),
	});
	assert.equal(applied.ok, true);
});

test('applyChartPatternDrawings preserves live binding and prepareReplay overlays', () => {
	const rows = buildDoubleTopBars();
	const prepared = prepareChartFromRows({
		title: 'ETH-PERP 1H — last 7d',
		toolResult: {
			ohlcv: {
				coin: 'ETH',
				interval: '1h',
				candles: rows.map(b => ({
					timestampMs: b.time * 1000,
					open: String(b.open),
					high: String(b.high),
					low: String(b.low),
					close: String(b.close),
					volume: '100',
				})),
			},
		},
	});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const calc = calculateChartPatternDrawings({
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
	});
	assert.equal(calc.ok, true);
	if (!calc.ok) {
		return;
	}
	const applied = applyChartPatternDrawings({
		title: 'ETH-PERP 1H — last 7d',
		toolResult: {
			ohlcv: {
				coin: 'ETH',
				interval: '1h',
				candles: rows.map(b => ({
					timestampMs: b.time * 1000,
					open: String(b.open),
					high: String(b.high),
					low: String(b.low),
					close: String(b.close),
					volume: '100',
				})),
			},
		},
		prepareReplay: prepared.data.prepareReplay,
		live: prepared.data.live,
		drawings: calc.data.drawings,
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	assert.equal(applied.data.live?.providerId, 'hyperliquid.allMids');
	assert.ok(applied.data.chart.series.some(s => s.id.startsWith('pattern_')));
	assert.ok(applied.data.prepareReplay?.overlays?.some(o => o.type === 'chart_pattern'));
});

test('applyChartPatternDrawings accepts full calculate response at top level', () => {
	const rows = buildDoubleTopBars();
	const calc = calculateChartPatternDrawings({
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
	});
	assert.equal(calc.ok, true);
	if (!calc.ok) {
		return;
	}
	const applied = applyChartPatternDrawings({
		rows,
		pattern: calc.data.pattern,
		drawings: calc.data.drawings,
	});
	assert.equal(applied.ok, true);
});

test('applyChartPatternDrawings fails when no pattern geometry supplied', () => {
	const rows = Array.from({length: 30}, (_, i) => bar(1000 + i * 1000, 100, 101, 99, 100));
	const applied = applyChartPatternDrawings({rows});
	assert.equal(applied.ok, false);
	if (!applied.ok) {
		assert.match(applied.reason, /No pattern overlay/);
	}
});
