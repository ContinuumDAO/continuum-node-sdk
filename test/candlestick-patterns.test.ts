import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PATTERN_CATALOG, resolvePatternId} from '../dist/core/candlestick-patterns/catalog.js';
import {
	DETECTORS,
	barsToSeries,
	buildPatternRecommendation,
	scanCandlestickPatterns,
} from '../dist/core/candlestick-patterns/index.js';

function baseTrendBars(count: number, start = 100) {
	const bars = [];
	for (let i = 0; i < count; i++) {
		const o = start + i;
		bars.push({time: i, open: o, high: o + 2, low: o - 1, close: o + 1});
	}
	return bars;
}

test('PATTERN_CATALOG has 18 entries with name and description', () => {
	assert.equal(PATTERN_CATALOG.length, 18);
	for (const entry of PATTERN_CATALOG) {
		assert.ok(entry.name.length > 0);
		assert.ok(entry.description.length > 10);
		assert.ok(entry.taLibName.startsWith('CDL'));
	}
});

test('resolvePatternId accepts slug and TA-Lib names', () => {
	assert.equal(resolvePatternId('hammer'), 'hammer');
	assert.equal(resolvePatternId('CDLDOJI'), 'doji');
	assert.equal(resolvePatternId('spinning_top'), 'spinning_top');
});

test('detectDoji on synthetic indecision bar', () => {
	const bars = baseTrendBars(14);
	bars[13] = {time: 13, open: 113, high: 116, low: 110, close: 113.01};
	const hits = scanCandlestickPatterns(bars, {patternIds: ['doji'], barIndex: 13});
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.name, 'Doji');
	assert.equal(hits[0]!.direction, 'neutral');
	assert.equal(hits[0]!.signal, 100);
});

test('detectSpinningTop on synthetic bar', () => {
	const bars = baseTrendBars(14);
	bars[13] = {time: 13, open: 113, high: 118, low: 108, close: 113.2};
	const hits = scanCandlestickPatterns(bars, {patternIds: ['spinning_top'], barIndex: 13});
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.name, 'Spinning Top');
	assert.match(hits[0]!.description, /indecision/i);
});

test('detectEngulfing bullish two-bar pattern', () => {
	const bars = baseTrendBars(14);
	bars[12] = {time: 12, open: 115, high: 116, low: 112, close: 113};
	bars[13] = {time: 13, open: 112, high: 117, low: 111, close: 116};
	const hits = scanCandlestickPatterns(bars, {patternIds: ['engulfing'], barIndex: 13});
	assert.equal(hits.length, 1);
	assert.equal(hits[0]!.name, 'Engulfing');
	assert.equal(hits[0]!.direction, 'bullish');
	assert.ok(hits[0]!.confidence >= 0.8);
});

test('lookback bars return no signal before warm-up', () => {
	const bars = baseTrendBars(14);
	const signals = DETECTORS.doji!(barsToSeries(bars));
	for (let i = 0; i < 10; i++) {
		assert.equal(signals[i], 0);
	}
});

test('buildPatternRecommendation cites primary pattern name', () => {
	const hits = scanCandlestickPatterns(
		(() => {
			const bars = baseTrendBars(14);
			bars[12] = {time: 12, open: 115, high: 116, low: 112, close: 113};
			bars[13] = {time: 13, open: 112, high: 117, low: 111, close: 116};
			return bars;
		})(),
		{barIndex: 13},
	);
	const rec = buildPatternRecommendation(hits);
	assert.ok(rec.primaryPattern);
	assert.equal(rec.primaryPattern!.name, 'Engulfing');
	assert.match(rec.rationale, /Engulfing detected/);
	assert.equal(rec.recommendation, 'buy');
});

test('buildPatternRecommendation hold when no patterns', () => {
	const rec = buildPatternRecommendation([]);
	assert.equal(rec.recommendation, 'hold');
	assert.equal(rec.primaryPattern, null);
});
