import assert from 'node:assert/strict';
import {test} from 'node:test';
import {scanChartPatterns} from '../dist/core/chart-patterns/scan.js';
import {analyzeChartPatterns} from '../dist/core/chart/analysis/chart-patterns-tools.js';
import {listChartAnalysisOptions} from '../dist/core/chart/analysis/analysis-catalog.js';

function bar(time: number, o: number, h: number, l: number, c: number) {
	return {time, open: o, high: h, low: l, close: c};
}

/** Synthetic double top: two peaks near 120 with valley near 100. */
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

/** Uptrend with no obvious classic pattern. */
function buildFlatTrendBars(count = 45): ReturnType<typeof bar>[] {
	const bars: ReturnType<typeof bar>[] = [];
	let t = 1000;
	let price = 100;
	for (let i = 0; i < count; i++) {
		const delta = 0.3;
		price += delta;
		bars.push(bar(t, price - 0.2, price + 0.5, price - 0.5, price));
		t += 1000;
	}
	return bars;
}

test('listChartAnalysisOptions includes chart_patterns', () => {
	const catalog = listChartAnalysisOptions();
	assert.equal(catalog.analyses.length, 9);
	assert.ok(catalog.analyses.some(a => a.analyzeTool === 'analyze_chart_patterns'));
});

test('analyzeChartPatterns returns empty state without chart envelope', () => {
	const result = analyzeChartPatterns({title: 'Flat', rows: buildFlatTrendBars()});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.analysis.summary, 'No obvious recent pattern found');
	assert.equal(result.data.analysis.classification, null);
	assert.equal(result.data.analysis.pattern, null);
	assert.ok(result.data.analysis.interpretation.length > 20);
	assert.equal((result.data as {kind?: string}).kind, undefined);
});

test('analyzeChartPatterns rejects too few bars', () => {
	const result = analyzeChartPatterns({rows: buildFlatTrendBars(10)});
	assert.equal(result.ok, false);
	if (result.ok) {
		return;
	}
	assert.match(result.reason, /at least/i);
});

test('scanChartPatterns detects double top on synthetic fixture', () => {
	const rows = buildDoubleTopBars();
	const hits = scanChartPatterns(rows, {patterns: ['double_top'], minConfidence: 0.35});
	const hit = hits.find(h => h.id === 'double_top');
	assert.ok(hit, 'expected double_top hit');
	assert.equal(hit!.direction, 'bearish');
	assert.ok(hit!.interpretation.length > 20);
	assert.ok(hit!.points.length >= 3);
});

test('analyzeChartPatterns includes interpretation on hit', () => {
	const rows = buildDoubleTopBars();
	const result = analyzeChartPatterns({
		title: 'Double top test',
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	if (result.data.analysis.pattern) {
		assert.ok(result.data.analysis.interpretation.length > 20);
		assert.ok(['bullish', 'moderately_bullish', 'neutral', 'moderately_bearish', 'bearish'].includes(
			result.data.analysis.classification!,
		));
	}
});
