import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareChartFromRows} from '../dist/core/chart/prepare-from-rows.js';
import {analyzeChartPatterns} from '../dist/core/chart/analysis/chart-patterns-tools.js';
import {
	buildOhlcvFingerprint,
	parseIntervalLabelFromChartTitle,
	rejectIntervalMismatchTitleVsFetch,
	rejectTitleLookbackBarCountMismatch,
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
	const bars = [];
	for (let i = 0; i < 10; i++) {
		const base = 1800 + i;
		bars.push({
			time: i * 3600,
			open: base,
			high: base + 10,
			low: base - 5,
			close: base + 5,
		});
	}
	bars.push({
		time: 10 * 3600,
		open: 1700.7,
		high: 1784.2,
		low: 1700,
		close: 1703.7,
	});
	const result = validateOhlcvBarIntegrity(bars);
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.reason, /stale\/mixed composite/i);
	}
});

test('validateOhlcvBarIntegrity allows long wicks when body matches prior bar', () => {
	const bars = [];
	for (let i = 0; i < 20; i++) {
		bars.push({
			time: i * 3600,
			open: 1570 + i * 0.1,
			high: 1573.7,
			low: 1551.3,
			close: 1572.4,
		});
	}
	const result = validateOhlcvBarIntegrity(bars);
	assert.equal(result.ok, true);
});

test('parseIntervalLabelFromChartTitle reads 1H and 12 hour', () => {
	assert.equal(parseIntervalLabelFromChartTitle('ETH-PERP 1H — last 7d'), '1h');
	assert.equal(parseIntervalLabelFromChartTitle('ETH perp 12 hour last week'), '12h');
});

test('rejectIntervalMismatchTitleVsFetch rejects 12h fetch for 1H title', () => {
	const result = rejectIntervalMismatchTitleVsFetch('ETH-PERP 1H — last 7d', {
		ohlcv: {coin: 'ETH', interval: '12h', candles: []},
	});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.reason, /does not match fetch interval/i);
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

test('rejectTitleLookbackBarCountMismatch rejects 102 bars for 1H 7d title', () => {
	const result = rejectTitleLookbackBarCountMismatch('ETH-PERP 1H — last 7d', 102, {
		ohlcv: {coin: 'ETH', interval: '1h', lookbackDays: 7, candles: []},
	});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.reason, /~168|169|170/i);
		assert.match(result.reason, /truncate|Expected ~168/i);
	}
});

test('rejectTitleLookbackBarCountMismatch accepts 169 bars for 1H 7d title', () => {
	const result = rejectTitleLookbackBarCountMismatch('ETH-PERP 1H — last 7d', 169, {
		ohlcv: {coin: 'ETH', interval: '1h', lookbackDays: 7, candles: []},
	});
	assert.equal(result.ok, true);
});

test('analyzeChartPatterns rejects truncated 1H title with too few bars', async () => {
	const bars = sampleBars(102);
	const toolResult = {
		ohlcv: {coin: 'ETH', interval: '1h', lookbackDays: 7, candles: bars},
	};
	const result = await analyzeChartPatterns({
		title: 'ETH-PERP 1H — last 7d',
		toolResult,
		mergeLive: false,
	});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.reason, /Expected ~168|only 102 loaded/i);
	}
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
