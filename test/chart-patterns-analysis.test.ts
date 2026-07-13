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
	assert.equal(catalog.analyses.length, 12);
	assert.ok(catalog.analyses.some(a => a.analyzeTool === 'analyze_chart_patterns'));
});

test('analyzeChartPatterns returns empty state without chart envelope', async () => {
	const result = await analyzeChartPatterns({
		title: 'Flat',
		rows: buildFlatTrendBars(),
		allowRowsOnly: true,
		mergeLive: false,
	});
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

test('analyzeChartPatterns rejects too few bars', async () => {
	const result = await analyzeChartPatterns({
		rows: buildFlatTrendBars(10),
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, false);
	if (result.ok) {
		return;
	}
	assert.match(result.reason, /at least/i);
});

test('scanChartPatterns skips mid-rally pseudo double top on bullish ETH-shaped series', () => {
	const rows: ReturnType<typeof bar>[] = [];
	let t = 1_782_676_800;
	const push = (o: number, h: number, l: number, c: number) => {
		rows.push(bar(t, o, h, l, c));
		t += 14_400;
	};
	for (let i = 0; i < 8; i++) {
		push(1550 + i * 8, 1555 + i * 8, 1548 + i * 8, 1552 + i * 8);
	}
	push(1650.3, 1724.2, 1647.4, 1697.2);
	push(1697.2, 1707.7, 1686.8, 1700.4);
	push(1700.4, 1707.0, 1692.5, 1701.3);
	push(1701.2, 1719.0, 1695.2, 1706.5);
	push(1706.6, 1722.6, 1702.1, 1718.4);
	push(1718.5, 1749.7, 1716.4, 1743.2);
	push(1743.3, 1753.3, 1729.2, 1731.9);
	push(1731.9, 1753.7, 1728.5, 1746.2);
	push(1746.0, 1776.3, 1744.0, 1759.3);
	for (let i = 0; i < 8; i++) {
		push(1760 + i * 5, 1780 + i * 5, 1755 + i * 5, 1775 + i * 5);
	}
	push(1790, 1809, 1788, 1796.5);
	const hits = scanChartPatterns(rows, {patterns: ['double_top'], minConfidence: 0.35});
	const bad = hits.find(h => {
		if (h.id !== 'double_top') {
			return false;
		}
		const t1 = h.points.find(p => p.label === 'T1')?.price;
		return t1 != null && Math.abs(t1 - 1724.2) < 1;
	});
	assert.equal(bad, undefined, 'expected mid-rally spike pair to be rejected');
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

test('analyzeChartPatterns includes interpretation on hit', async () => {
	const rows = buildDoubleTopBars();
	const result = await analyzeChartPatterns({
		title: 'Double top test',
		rows,
		patterns: ['double_top'],
		minConfidence: 0.35,
		allowRowsOnly: true,
		mergeLive: false,
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
