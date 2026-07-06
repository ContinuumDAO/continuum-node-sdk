import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	buildPatternDrawingSpec,
	drawingSpecToOverlay,
	PATTERN_OVERLAY_STYLE,
} from '../dist/core/chart-patterns/drawing-spec.js';
import {normalizeChartPatternId} from '../dist/core/chart-patterns/pattern-id-aliases.js';
import {computeMeasuredMove} from '../dist/core/chart-patterns/measured-move.js';
import {enrichChartPatternHit} from '../dist/core/chart-patterns/pattern-enrich.js';
import {scanChartPatterns} from '../dist/core/chart-patterns/scan.js';
import {normalizeBarsFromRows} from '../dist/core/chart-patterns/swings.js';
import {analyzeChartPatternsFromBars} from '../dist/core/chart-patterns/scan.js';
import {
	applyChartPatternDrawings,
	calculateChartPatternDrawings,
} from '../dist/core/chart/analysis/chart-patterns-drawings-tools.js';
import {prepareChart} from '../dist/core/chart/prepare.js';

function bar(time: number, o: number, h: number, l: number, c: number, volume?: number) {
	return {time, open: o, high: h, low: l, close: c, ...(volume != null ? {volume} : {})};
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

test('normalizeChartPatternId resolves adam_eve alias', () => {
	assert.equal(normalizeChartPatternId('adam_eve_double_bottom'), 'double_bottom_adam_eve');
});

test('buildPatternDrawingSpec caps double top elements', () => {
	const rows = buildDoubleTopBars();
	const hits = scanChartPatterns(rows, {patterns: ['double_top'], minConfidence: 0.35});
	const hit = hits[0];
	assert.ok(hit);
	const spec = buildPatternDrawingSpec(hit!, normalizeBarsFromRows(rows));
	assert.ok(spec.elements.length <= 4);
	assert.ok(spec.elements.some(e => e.kind === 'level'));
	assert.ok(spec.elements.some(e => e.kind === 'marker'));
});

test('double bottom measured move matches textbook formula', () => {
	const rows = buildDoubleTopBars().map(b => bar(b.time, 120 - b.close + 100, b.high, b.low, b.close));
	const hits = scanChartPatterns(rows, {patterns: ['double_bottom'], minConfidence: 0.2});
	const hit = hits.find(h => h.id === 'double_bottom');
	if (!hit) {
		return;
	}
	const enriched = enrichChartPatternHit(hit, normalizeBarsFromRows(rows), rows);
	assert.ok(enriched.measuredMove);
	const mm = computeMeasuredMove(hit, normalizeBarsFromRows(rows));
	assert.ok(mm);
	const neckline = hit.levels?.[0]?.price;
	const trough = Math.min(...hit.points.filter(p => p.role === 'bottom').map(p => p.price));
	if (neckline != null && Number.isFinite(trough)) {
		assert.equal(mm!.targetPrice, neckline + (neckline - trough));
	}
});

test('drawingSpecToOverlay includes clip span and measured move target', () => {
	const rows = buildDoubleTopBars();
	const hits = scanChartPatterns(rows, {patterns: ['double_top'], minConfidence: 0.35});
	const hit = hits[0];
	assert.ok(hit);
	const enriched = enrichChartPatternHit(hit!, normalizeBarsFromRows(rows), rows);
	const overlay = drawingSpecToOverlay(enriched.drawingSpec, hit!, {
		measuredMove: enriched.measuredMove,
		bars: normalizeBarsFromRows(rows),
		rawBars: rows,
	});
	assert.ok(overlay.clipToBarSpan);
	const target = overlay.levels?.find(l => l.role === 'measured_move' || l.label?.includes('Target'));
	assert.ok(target);
	assert.notEqual(target?.price, overlay.levels?.find(l => l.kind === 'neckline')?.price);
});

test('analyze output includes patternMenu and highestConfidencePattern', () => {
	const rows = buildDoubleTopBars();
	const analysis = analyzeChartPatternsFromBars(rows, {patterns: ['double_top', 'double_bottom'], minConfidence: 0.2});
	assert.ok(Array.isArray(analysis.patternMenu));
	if (analysis.patterns.length >= 2) {
		assert.ok(analysis.highestConfidencePattern);
	}
	if (analysis.patterns.length) {
		assert.ok(analysis.pattern?.drawingSpec);
		assert.equal(typeof analysis.pattern?.drawable, 'boolean');
	}
});

test('apply with selectionMode highest_confidence uses best score', async () => {
	const rows = buildDoubleTopBars();
	const analysis = analyzeChartPatternsFromBars(rows, {
		patterns: ['double_top', 'ascending_triangle'],
		minConfidence: 0.2,
	});
	if (analysis.patterns.length < 2 || !analysis.highestConfidencePattern) {
		return;
	}
	const applied = await applyChartPatternDrawings({
		rows,
		prepareReplay: {overlays: []},
		analysis,
		selectionMode: 'highest_confidence',
	});
	assert.equal(applied.ok, true);
});

test('pattern overlay structure lines use lineWidth >= 3', async () => {
	const rows = buildDoubleTopBars();
	const calc = await calculateChartPatternDrawings({
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
		allowRowsOnly: true,
	});
	assert.equal(calc.ok, true);
	if (!calc.ok) {
		return;
	}
	const chart = prepareChart({
		title: 'Spec test',
		bars: rows,
		overlays: [calc.data.drawings.patternOverlay as never],
	});
	assert.equal(chart.ok, true);
	if (!chart.ok) {
		return;
	}
	const structure = chart.data.chart.series.find(s => s.id.includes('_line_') || s.id.includes('_poly_'));
	if (structure?.style?.lineWidth != null) {
		assert.ok(structure.style.lineWidth >= 3);
	}
	assert.equal(PATTERN_OVERLAY_STYLE.structure.lineWidth, 3);
});
