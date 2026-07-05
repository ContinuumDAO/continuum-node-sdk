import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	averageTrueRangeSeries,
	retestBandKind,
	retestToleranceBands,
} from '../dist/core/chart-patterns/atr.js';
import {smoothBarsForHeadShoulders} from '../dist/core/chart-patterns/smoothing.js';
import {scanChartPatterns} from '../dist/core/chart-patterns/scan.js';

function bar(time: number, o: number, h: number, l: number, c: number) {
	return {time, open: o, high: h, low: l, close: c};
}

test('smoothBarsForHeadShoulders reduces high/low noise', () => {
	const bars = Array.from({length: 10}, (_, i) =>
		bar(1000 + i * 1000, 100, 100 + (i % 2 ? 3 : 0), 99, 100),
	);
	const normalized = bars.map((b, index) => ({
		index,
		time: b.time,
		timeSec: b.time,
		open: b.open,
		high: b.high,
		low: b.low,
		close: b.close,
	}));
	const smoothed = smoothBarsForHeadShoulders(normalized, 5);
	assert.equal(smoothed.length, normalized.length);
	assert.notEqual(smoothed[5]!.high, normalized[5]!.high);
});

test('scanChartPatterns accepts smoothHeadShoulders false without error', () => {
	const rows = Array.from({length: 40}, (_, i) =>
		bar(1000 + i * 1000, 100 + i * 0.2, 102 + i * 0.2, 99 + i * 0.2, 101 + i * 0.2),
	);
	const hits = scanChartPatterns(rows, {
		patterns: ['head_and_shoulders'],
		smoothHeadShoulders: false,
		minConfidence: 0.99,
	});
	assert.ok(Array.isArray(hits));
});

/** Flat resistance at 110 with touches, then bullish break + retest. */
function buildTrendlineBreakoutRetestBars(): ReturnType<typeof bar>[] {
	const rows: ReturnType<typeof bar>[] = [];
	let t = 1000;
	for (let i = 0; i < 22; i++) {
		const touch = i % 4 === 0;
		const high = touch ? 110 : 108.5;
		const low = 104 + (i % 3) * 0.2;
		const close = 106 + i * 0.15;
		rows.push(bar(t, close - 0.5, high, low, close));
		t += 1000;
	}
	rows.push(bar(t, 109, 113, 108, 112));
	t += 1000;
	rows.push(bar(t, 112, 115, 111, 114));
	t += 1000;
	rows.push(bar(t, 113, 113.5, 109.5, 111));
	t += 1000;
	return rows;
}

test('scanChartPatterns detects trendline breakout or retest on synthetic series', () => {
	const rows = buildTrendlineBreakoutRetestBars();
	const hits = scanChartPatterns(rows, {
		patterns: ['trendline_breakout_bullish', 'trendline_breakout_retest_bullish'],
		minConfidence: 0.35,
		retestTolerancePct: 0.15,
	});
	const hit = hits.find(
		h =>
			h.id === 'trendline_breakout_bullish' || h.id === 'trendline_breakout_retest_bullish',
	);
	assert.ok(hit, `expected trendline breakout hit, got ${hits.map(h => h.id).join(',')}`);
	assert.ok(hit!.points.some(p => p.role === 'breakout'));
});

test('retestToleranceBands combines excursion percent and ATR via max', () => {
	const bands = retestToleranceBands(50, 0.01, 4, 3);
	assert.equal(bands.excursionBand, 0.5);
	assert.equal(bands.atrBand, 12);
	assert.equal(bands.combined, 12);
	assert.equal(retestBandKind(2, bands), 'atr');
	const excursionOnly = retestToleranceBands(100, 0.05, 1, 2);
	assert.equal(retestBandKind(3, excursionOnly), 'excursion_pct');
});

test('averageTrueRangeSeries returns null until period is filled', () => {
	const bars = Array.from({length: 20}, (_, i) => ({
		index: i,
		time: 1000 + i * 1000,
		timeSec: 1000 + i * 1000,
		open: 100,
		high: 103,
		low: 97,
		close: 101,
	}));
	const atr = averageTrueRangeSeries(bars, 14);
	assert.equal(atr[12], null);
	assert.ok(atr[13] != null && atr[13]! > 0);
});

/** Small post-break move so excursion band is tight; retest needs ATR band. */
function buildAtrRetestBars(): ReturnType<typeof bar>[] {
	const rows: ReturnType<typeof bar>[] = [];
	let t = 1000;
	for (let i = 0; i < 22; i++) {
		const touch = i % 4 === 0;
		const high = touch ? 110 : 108.5;
		const low = 104 + (i % 3) * 0.2;
		const close = 106 + i * 0.15;
		rows.push(bar(t, close - 0.5, high, low, close));
		t += 1000;
	}
	rows.push(bar(t, 109, 110.5, 108, 110.2));
	t += 1000;
	rows.push(bar(t, 110.2, 110.8, 109.8, 110.5));
	t += 1000;
	rows.push(bar(t, 110.3, 110.6, 109.4, 110.1));
	t += 1000;
	return rows;
}

test('scanChartPatterns detects retest via ATR when excursion band is too tight', () => {
	const rows = buildAtrRetestBars();
	const withoutAtr = scanChartPatterns(rows, {
		patterns: ['trendline_breakout_retest_bullish'],
		minConfidence: 0.35,
		retestTolerancePct: 0.001,
		retestAtrMultiplier: 0.01,
	});
	const withAtr = scanChartPatterns(rows, {
		patterns: ['trendline_breakout_retest_bullish'],
		minConfidence: 0.35,
		retestTolerancePct: 0.001,
		retestAtrMultiplier: 6,
	});
	assert.equal(
		withoutAtr.find(h => h.id === 'trendline_breakout_retest_bullish'),
		undefined,
		'expected no retest when both bands are tight',
	);
	const atrHit = withAtr.find(h => h.id === 'trendline_breakout_retest_bullish');
	assert.ok(atrHit, `expected ATR retest hit, got ${withAtr.map(h => h.id).join(',')}`);
	assert.match(atrHit!.description, /ATR/);
});
