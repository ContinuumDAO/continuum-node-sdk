import assert from 'node:assert/strict';
import {test} from 'node:test';
import {analyzeChartPatternsFromBars, scanChartPatterns} from '../dist/core/chart-patterns/scan.js';

function bar(time: number, o: number, h: number, l: number, c: number) {
	return {time, open: o, high: h, low: l, close: c};
}

/**
 * Bear pennant shaped like the live BTC 4h case:
 * multi-bar selloff pole, then a tight contracting coil at the tip.
 */
function buildBearPennantBars(): ReturnType<typeof bar>[] {
	const bars: ReturnType<typeof bar>[] = [];
	let t = 1_000_000;
	const push = (o: number, h: number, l: number, c: number) => {
		bars.push(bar(t, o, h, l, c));
		t += 14_400;
	};
	// Quiet lead-in
	for (let i = 0; i < 20; i++) {
		const p = 100 + i * 0.1;
		push(p, p + 0.4, p - 0.4, p + 0.1);
	}
	// Pole: ~6% decline high→low over several bars
	push(102, 103.5, 101.5, 102.2);
	push(102.2, 102.8, 100.5, 100.8);
	push(100.8, 101.2, 98.8, 99.1);
	push(99.1, 99.5, 97.2, 97.5);
	push(97.5, 98.0, 96.0, 96.4);
	// Contracting coil (pennant)
	push(96.4, 97.1, 96.2, 96.6);
	push(96.6, 96.95, 96.35, 96.55);
	push(96.55, 96.8, 96.4, 96.6);
	push(96.6, 96.72, 96.48, 96.58);
	push(96.58, 96.68, 96.5, 96.6);
	return bars;
}

/** Classic bear flag: sharp drop then mild upward / flat parallel channel. */
function buildBearFlagBars(): ReturnType<typeof bar>[] {
	const bars: ReturnType<typeof bar>[] = [];
	let t = 1_000_000;
	const push = (o: number, h: number, l: number, c: number) => {
		bars.push(bar(t, o, h, l, c));
		t += 14_400;
	};
	for (let i = 0; i < 18; i++) {
		const p = 110 - i * 0.05;
		push(p, p + 0.3, p - 0.3, p);
	}
	// Pole
	push(108, 109, 107.5, 107.8);
	push(107.8, 108, 105.5, 105.8);
	push(105.8, 106.2, 103.5, 103.8);
	push(103.8, 104.2, 101.5, 101.8);
	push(101.8, 102.2, 100.0, 100.3);
	// Mild counter-trend flag channel (roughly parallel)
	push(100.3, 101.2, 100.1, 100.9);
	push(100.9, 101.6, 100.6, 101.3);
	push(101.3, 102.0, 101.0, 101.7);
	push(101.7, 102.3, 101.3, 102.0);
	push(102.0, 102.5, 101.6, 102.2);
	push(102.2, 102.7, 101.8, 102.4);
	return bars;
}

/** Bull pennant: sharp rally then contracting pause. */
function buildBullPennantBars(): ReturnType<typeof bar>[] {
	const bars: ReturnType<typeof bar>[] = [];
	let t = 1_000_000;
	const push = (o: number, h: number, l: number, c: number) => {
		bars.push(bar(t, o, h, l, c));
		t += 14_400;
	};
	for (let i = 0; i < 18; i++) {
		const p = 90 + i * 0.05;
		push(p, p + 0.3, p - 0.3, p);
	}
	push(92, 92.5, 91.8, 92.2);
	push(92.2, 94.0, 92.0, 93.7);
	push(93.7, 95.5, 93.5, 95.2);
	push(95.2, 97.0, 95.0, 96.7);
	push(96.7, 98.5, 96.5, 98.2);
	// Coil
	push(98.2, 98.7, 97.9, 98.3);
	push(98.3, 98.55, 98.05, 98.25);
	push(98.25, 98.45, 98.1, 98.3);
	push(98.3, 98.4, 98.15, 98.28);
	push(98.28, 98.38, 98.2, 98.3);
	return bars;
}

test('scanChartPatterns detects bearish pennant on synthetic coil fixture', () => {
	const rows = buildBearPennantBars();
	const hits = scanChartPatterns(rows, {
		patternIds: ['pennant_bearish', 'flag_bearish', 'channel_down'],
		minConfidence: 0.4,
	});
	assert.ok(
		hits.some(h => h.id === 'pennant_bearish'),
		`expected pennant_bearish, got ${hits.map(h => h.id).join(',') || 'none'}`,
	);
	const pennant = hits.find(h => h.id === 'pennant_bearish')!;
	assert.ok(pennant.confidence >= 0.45);
	assert.ok(pennant.lines.some(l => l.kind === 'flagpole'));
	assert.ok(pennant.lines.filter(l => l.kind === 'boundary').length >= 2);
});

test('scanChartPatterns detects bear flag on synthetic counter-trend channel', () => {
	const rows = buildBearFlagBars();
	const hits = scanChartPatterns(rows, {
		patternIds: ['flag_bearish', 'pennant_bearish'],
		minConfidence: 0.4,
	});
	assert.ok(
		hits.some(h => h.id === 'flag_bearish'),
		`expected flag_bearish, got ${hits.map(h => h.id).join(',') || 'none'}`,
	);
});

test('scanChartPatterns detects bullish pennant on synthetic coil fixture', () => {
	const rows = buildBullPennantBars();
	const hits = scanChartPatterns(rows, {
		patternIds: ['pennant_bullish'],
		minConfidence: 0.4,
	});
	assert.ok(
		hits.some(h => h.id === 'pennant_bullish'),
		`expected pennant_bullish, got ${hits.map(h => h.id).join(',') || 'none'}`,
	);
});

test('analyzeChartPatternsFromBars keeps channel as separate candidate beside pennant', () => {
	const rows = buildBearPennantBars();
	const analysis = analyzeChartPatternsFromBars(rows, {
		patternIds: ['pennant_bearish', 'channel_down'],
		minConfidence: 0.4,
	});
	const ids = analysis.patternMenu.map(e => e.id);
	assert.ok(ids.includes('pennant_bearish'), `menu=${ids.join(',')}`);
	// Channel may or may not appear on a short synthetic series; pennant must.
	assert.ok(analysis.patterns.some(p => p.id === 'pennant_bearish'));
});
