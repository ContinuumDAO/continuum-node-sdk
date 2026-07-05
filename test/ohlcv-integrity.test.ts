import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareChartFromRows} from '../dist/core/chart/prepare-from-rows.js';
import {analyzeChartPatterns} from '../dist/core/chart/analysis/chart-patterns-tools.js';
import {
	buildOhlcvFingerprint,
	rejectRowsOnlyWithoutFetch,
	runOhlcvIntegrityPipeline,
	validateOhlcvBarIntegrity,
} from '../dist/core/chart/ohlcv-integrity.js';

function sampleBars(count = 30, start = 100) {
	const bars = [];
	for (let i = 0; i < count; i++) {
		const o = start + i;
		bars.push({
			time: i * 3600,
			open: o,
			high: o + 2,
			low: o - 1,
			close: o + 1,
		});
	}
	return bars;
}

test('rejectRowsOnlyWithoutFetch rejects rows without toolResult', () => {
	const result = rejectRowsOnlyWithoutFetch({rows: sampleBars(5)});
	assert.equal(result.ok, false);
});

test('rejectRowsOnlyWithoutFetch allows rows with allowRowsOnly', () => {
	const result = rejectRowsOnlyWithoutFetch({rows: sampleBars(5), allowRowsOnly: true});
	assert.equal(result.ok, true);
});

test('validateOhlcvBarIntegrity rejects screenshot-style corrupt bar', () => {
	const bars = sampleBars(30);
	bars.push({
		time: 30 * 3600,
		open: 1700.7,
		high: 1784.2,
		low: 1700,
		close: 1703.7,
	});
	const result = validateOhlcvBarIntegrity(bars);
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.reason, /upper wick/i);
	}
});

test('validateOhlcvBarIntegrity rejects high below close', () => {
	const bars = [{time: 0, open: 10, high: 9, low: 8, close: 10}];
	const result = validateOhlcvBarIntegrity(bars);
	assert.equal(result.ok, false);
});

test('buildOhlcvFingerprint is stable for same bars', () => {
	const bars = sampleBars(10);
	const a = buildOhlcvFingerprint(bars);
	const b = buildOhlcvFingerprint(bars);
	assert.ok(a && b);
	assert.equal(a!.digest, b!.digest);
});

test('prepareChartFromRows rejects rows-only without toolResult', () => {
	const result = prepareChartFromRows({
		title: 'TEST 1H — last 7d',
		rows: sampleBars(40),
	});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.reason, /toolResult/i);
	}
});

test('prepareChartFromRows accepts rows-only with allowRowsOnly option', () => {
	const result = prepareChartFromRows({
		title: 'TEST 1H',
		rows: sampleBars(40),
		options: {allowRowsOnly: true},
	});
	assert.equal(result.ok, true);
	assert.ok(result.data.meta?.ohlcvFingerprint?.digest);
});

test('analyzeChartPatterns rejects rows-only without toolResult', async () => {
	const result = await analyzeChartPatterns({
		title: 'TEST',
		rows: sampleBars(45),
		mergeLive: false,
	});
	assert.equal(result.ok, false);
});

test('runOhlcvIntegrityPipeline passes valid hyperliquid-shaped toolResult', () => {
	const candles = sampleBars(20).map(b => ({
		timestampMs: b.time * 1000,
		open: String(b.open),
		high: String(b.high),
		low: String(b.low),
		close: String(b.close),
	}));
	const toolResult = {ohlcv: {coin: 'ETH', interval: '1h', candles}};
	const bars = candles;
	const result = runOhlcvIntegrityPipeline(bars, {toolResult});
	assert.equal(result.ok, true);
	assert.ok(result.data.fingerprint?.digest.startsWith('v1:'));
});
