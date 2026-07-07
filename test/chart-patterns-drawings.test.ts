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

function ethToolResult(rows: ReturnType<typeof bar>[]) {
	const startTimeMs = rows[0]!.time * 1000;
	const endTimeMs = rows[rows.length - 1]!.time * 1000 + 3_600_000;
	return {
		ohlcv: {
			coin: 'ETH',
			interval: '1h',
			startTimeMs,
			endTimeMs,
			candles: rows.map(b => ({
				timestampMs: b.time * 1000,
				open: String(b.open),
				high: String(b.high),
				low: String(b.low),
				close: String(b.close),
			})),
		},
	};
}

function buildDoubleTopBars(): ReturnType<typeof bar>[] {
	const bars: ReturnType<typeof bar>[] = [];
	let t = 1_700_000_000;
	const push = (o: number, h: number, l: number, c: number) => {
		bars.push(bar(t, o, h, l, c));
		t += 3600;
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

test('calculateChartPatternDrawings returns patternOverlay bundle', async () => {
	const rows = buildDoubleTopBars();
	const result = await calculateChartPatternDrawings({
		toolResult: ethToolResult(rows),
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

test('applyChartPatternDrawings merges overlay into chart', async () => {
	const rows = buildDoubleTopBars();
	const prepared = prepareChartFromRows({title: 'Pattern test', toolResult: ethToolResult(rows)});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const calc = await calculateChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
	});
	assert.equal(calc.ok, true);
	if (!calc.ok) {
		return;
	}
	const applied = await applyChartPatternDrawings({
		toolResult: ethToolResult(rows),
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

test('applyChartPatternDrawings normalizes neckline kind in patternOverlay levels', async () => {
	const rows = buildDoubleTopBars();
	const calc = await calculateChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
	});
	assert.equal(calc.ok, true);
	if (!calc.ok) {
		return;
	}
	const overlay = calc.data.drawings.patternOverlay as {
		levels?: Array<{price: number; label?: string; kind?: string}>;
	};
	const applied = await applyChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		prepareReplay: {overlays: []},
		drawings: {
			patternOverlay: {
				...overlay,
				levels: overlay.levels?.map(l => ({...l, kind: 'neckline'})),
			},
		},
	});
	assert.equal(applied.ok, true);
});

test('applyChartPatternDrawings accepts stringified analysis JSON', async () => {
	const rows = buildDoubleTopBars();
	const hits = scanChartPatterns(rows, {patterns: ['double_top'], minConfidence: 0.35});
	assert.ok(hits[0]);
	const applied = await applyChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		analysis: JSON.stringify({pattern: hits[0]}),
	});
	assert.equal(applied.ok, true);
});

test('applyChartPatternDrawings preserves live binding and prepareReplay overlays', async () => {
	const rows = buildDoubleTopBars();
	const toolResult = ethToolResult(rows);
	toolResult.ohlcv.candles = toolResult.ohlcv.candles.map(c => ({...c, volume: '100'}));
	const prepared = prepareChartFromRows({
		title: 'ETH-PERP 1H — double top overlay',
		toolResult,
	});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const calc = await calculateChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
	});
	assert.equal(calc.ok, true);
	if (!calc.ok) {
		return;
	}
	const applied = await applyChartPatternDrawings({
		title: 'ETH-PERP 1H — double top overlay',
		toolResult,
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

test('applyChartPatternDrawings accepts full calculate response at top level', async () => {
	const rows = buildDoubleTopBars();
	const calc = await calculateChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
	});
	assert.equal(calc.ok, true);
	if (!calc.ok) {
		return;
	}
	const applied = await applyChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		pattern: calc.data.pattern,
		drawings: calc.data.drawings,
	});
	assert.equal(applied.ok, true);
});

test('applyChartPatternDrawings normalizes partial patternOverlay without type', async () => {
	const rows = buildDoubleTopBars();
	const calc = await calculateChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
	});
	assert.equal(calc.ok, true);
	if (!calc.ok) {
		return;
	}
	const overlay = calc.data.drawings.patternOverlay as Record<string, unknown>;
	const applied = await applyChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		prepareReplay: {overlays: []},
		drawings: JSON.stringify({
			patternOverlay: {
				patternName: overlay.patternName,
				lines: overlay.lines ?? [],
				points: overlay.points ?? [],
				markers: overlay.markers,
				levels: overlay.levels,
			},
		}),
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	assert.ok(applied.data.chart.series.some(s => s.id.startsWith('pattern_')));
	assert.ok(applied.data.prepareReplay?.overlays?.some(o => o.type === 'chart_pattern'));
});

test('applyChartPatternDrawings accepts calculate patternOverlay on apply', async () => {
	const rows = buildDoubleTopBars();
	const calc = await calculateChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
	});
	assert.equal(calc.ok, true);
	if (!calc.ok) {
		return;
	}
	const applied = await applyChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		prepareReplay: {overlays: []},
		pattern: calc.data.pattern,
		drawings: {
			patternOverlay: calc.data.drawings.patternOverlay,
		},
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	assert.ok(applied.data.chart.series.some(s => s.id.startsWith('pattern_')));
});

test('applyChartPatternDrawings rejects candles outside fetch window when toolResult is mangled', async () => {
	const rows = Array.from({length: 30}, (_, i) => bar(1_700_000_000 + i * 3600, 100, 101, 99, 100));
	const calc = await calculateChartPatternDrawings({rows, patternId: 'double_top'});
	if (!calc.ok) {
		return;
	}
	const applied = await applyChartPatternDrawings({
		title: 'ETH-PERP 1H',
		toolResult: {
			ohlcv: {
				interval: '1h',
				startTimeMs: 1_782_655_200_000,
				endTimeMs: 1_783_260_000_000,
				candles: rows.map(r => ({
					time: 1_752_446_400 + rows.indexOf(r) * 3600,
					open: r.open,
					high: r.high,
					low: r.low,
					close: r.close,
				})),
			},
		},
		drawings: calc.data.drawings,
		pattern: calc.data.pattern,
	});
	assert.equal(applied.ok, false);
	if (!applied.ok) {
		assert.match(applied.reason, /fetch window|timestampMs/i);
	}
});

test('applyChartPatternDrawings resolves geometry from analysis.patterns without calculate step', async () => {
	const rows = buildDoubleTopBars();
	const hits = scanChartPatterns(rows, {patterns: ['double_top'], minConfidence: 0.35});
	assert.ok(hits[0]);
	const applied = await applyChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		analysis: {
			primaryPattern: {id: hits[0]!.id, name: hits[0]!.name},
			patterns: hits,
		},
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	assert.ok(applied.data.chart.series.some(s => s.id.startsWith('pattern_')));
	assert.match(applied.data.meta?.warnings?.join('\n') ?? '', /overlay applied/i);
});

test('applyChartPatternDrawings remaps bar-index overlay times to candle unix times', async () => {
	const rows = buildDoubleTopBars();
	const calc = await calculateChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
	});
	assert.equal(calc.ok, true);
	if (!calc.ok) {
		return;
	}
	const overlay = calc.data.drawings.patternOverlay as {
		markers?: Array<{time: number; price: number; label?: string}>;
		levels?: Array<{price: number; label?: string}>;
		lines?: unknown[];
	};
	const applied = await applyChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		drawings: {
			patternOverlay: {
				type: 'chart_pattern',
				patternName: 'Double Top',
				points: [],
				lines: overlay.lines ?? [],
				markers: (overlay.markers ?? []).map((pt, i) => ({...pt, time: 10 + i * 5})),
				levels: overlay.levels,
			},
		},
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	const markerSeries = applied.data.chart.series.filter(s => s.id.startsWith('pattern_mk_'));
	assert.ok(markerSeries.length > 0);
	const drawnSec = markerSeries[0]?.data[0]?.time;
	assert.ok(typeof drawnSec === 'number');
	assert.notEqual(drawnSec, 10);
	assert.ok(drawnSec > 1_000_000, 'expected unix chart time, not bar index');
});

test('applyChartPatternDrawings fails when no pattern geometry supplied', async () => {
	const rows = Array.from({length: 30}, (_, i) => bar(1_700_000_000 + i * 3600, 100, 101, 99, 100));
	const applied = await applyChartPatternDrawings({toolResult: ethToolResult(rows), rows});
	assert.equal(applied.ok, false);
	if (!applied.ok) {
		assert.match(applied.reason, /No pattern overlay/);
	}
});

test('applyChartPatternDrawings accepts prepareReplay plus rows without toolResult', async () => {
	const rows = buildDoubleTopBars();
	const prepared = prepareChartFromRows({title: 'Pattern test', toolResult: ethToolResult(rows)});
	assert.equal(prepared.ok, true);
	if (!prepared.ok) {
		return;
	}
	const hits = scanChartPatterns(rows, {patterns: ['double_top'], minConfidence: 0.35});
	assert.ok(hits[0]);
	const applied = await applyChartPatternDrawings({
		rows,
		prepareReplay: prepared.data.prepareReplay,
		analysis: {pattern: hits[0]!, patterns: hits},
		patternId: 'double_top',
	});
	assert.equal(applied.ok, true);
	if (!applied.ok) {
		return;
	}
	assert.ok(applied.data.chart.series.some(s => s.id.startsWith('pattern_')));
});

test('applyChartPatternDrawings rejects overlay without chart context', async () => {
	const rows = buildDoubleTopBars();
	const hits = scanChartPatterns(rows, {patterns: ['double_top'], minConfidence: 0.35});
	const applied = await applyChartPatternDrawings({
		rows,
		analysis: {pattern: hits[0]!, patterns: hits},
		patternId: 'double_top',
	});
	assert.equal(applied.ok, false);
	if (!applied.ok) {
		assert.match(applied.reason, /prepareReplay|toolResult/i);
	}
});

test('calculateChartPatternDrawings accepts nested analysis.patternId', async () => {
	const rows = buildDoubleTopBars();
	const result = await calculateChartPatternDrawings({
		toolResult: ethToolResult(rows),
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
		analysis: {
			patternId: 'double_top',
			selectionMode: 'primary',
		},
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal((result.data.pattern as {id?: string}).id, 'double_top');
});
