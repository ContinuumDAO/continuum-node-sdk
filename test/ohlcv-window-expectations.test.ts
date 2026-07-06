import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	parseIntervalLabelFromChartTitle,
	parseLookbackSpanFromChartTitle,
	rejectOhlcvWindowMismatch,
	resolveOhlcvWindowExpectation,
} from '../dist/core/chart/ohlcv-window-expectations.js';

test('parseIntervalLabelFromChartTitle supports minutes through weeks', () => {
	assert.equal(parseIntervalLabelFromChartTitle('ETH-PERP 15m — last 24 hours'), '15m');
	assert.equal(parseIntervalLabelFromChartTitle('BTC 4H — last 30d'), '4h');
	assert.equal(parseIntervalLabelFromChartTitle('SOL 1d — 6 months'), '1d');
});

test('parseLookbackSpanFromChartTitle supports hours days weeks months', () => {
	assert.deepEqual(parseLookbackSpanFromChartTitle('ETH 15m — last 24 hours'), {
		label: '24h',
		spanSec: 86_400,
	});
	assert.deepEqual(parseLookbackSpanFromChartTitle('ETH-PERP 1H — last 7d'), {
		label: '7d',
		spanSec: 7 * 86_400,
	});
	assert.deepEqual(parseLookbackSpanFromChartTitle('BTC 4h — last 30 days'), {
		label: '30d',
		spanSec: 30 * 86_400,
	});
	assert.deepEqual(parseLookbackSpanFromChartTitle('ETH 1d — 6 months'), {
		label: '6mo',
		spanSec: 6 * 30 * 86_400,
	});
});

test('resolveOhlcvWindowExpectation computes bar counts for varied windows', () => {
	const cases: Array<{title: string; toolResult?: unknown; expected: number}> = [
		{
			title: 'ETH-PERP 1H — last 7d',
			toolResult: {ohlcv: {coin: 'ETH', interval: '1h', lookbackDays: 7}},
			expected: 168,
		},
		{
			title: 'ETH 15m — last 24 hours',
			toolResult: {ohlcv: {coin: 'ETH', interval: '15m', lookbackHours: 24}},
			expected: 96,
		},
		{
			title: 'BTC 4H — last 30d',
			toolResult: {ohlcv: {coin: 'BTC', interval: '4h', lookbackDays: 30}},
			expected: 180,
		},
		{
			title: 'ETH 1d — 6 months',
			toolResult: {ohlcv: {coin: 'ETH', interval: '1d', lookbackDays: 180}},
			expected: 180,
		},
	];
	for (const {title, toolResult, expected} of cases) {
		const exp = resolveOhlcvWindowExpectation(title, toolResult);
		assert.ok(exp, title);
		assert.equal(exp!.expectedBarCount, expected, title);
	}
});

test('rejectOhlcvWindowMismatch rejects truncated or wrong-interval payloads', () => {
	const toolResult = {ohlcv: {coin: 'ETH', interval: '1h', lookbackDays: 7, candles: []}};

	const truncated = rejectOhlcvWindowMismatch({
		title: 'ETH-PERP 1H — last 7d',
		barCount: 102,
		toolResult,
	});
	assert.equal(truncated.ok, false);

	const wrongInterval = rejectOhlcvWindowMismatch({
		title: 'ETH-PERP 1H — last 7d',
		barCount: 169,
		toolResult: {ohlcv: {coin: 'ETH', interval: '2h', lookbackDays: 7}},
	});
	assert.equal(wrongInterval.ok, false);

	const ok = rejectOhlcvWindowMismatch({
		title: 'ETH-PERP 1H — last 7d',
		barCount: 169,
		toolResult,
	});
	assert.equal(ok.ok, true);

	const ok15m = rejectOhlcvWindowMismatch({
		title: 'ETH 15m — last 24 hours',
		barCount: 96,
		toolResult: {ohlcv: {coin: 'ETH', interval: '15m', lookbackHours: 24}},
	});
	assert.equal(ok15m.ok, true);
});

test('rejectTitleLookbackMismatchVsFetch rejects title 3d when fetch used lookbackDays 7', () => {
	const result = rejectOhlcvWindowMismatch({
		title: 'ETH-PERP 1H — last 3d',
		barCount: 169,
		toolResult: {ohlcv: {coin: 'ETH', interval: '1h', lookbackDays: 7, candleCount: 169}},
	});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.reason, /title lookback \(3d\).*fetch window \(7d\)/i);
	}
});

test('rejectTitleLookbackMismatchVsFetch accepts matching title and fetch lookback', () => {
	const result = rejectOhlcvWindowMismatch({
		title: 'ETH-PERP 1H — last 7d',
		barCount: 169,
		toolResult: {ohlcv: {coin: 'ETH', interval: '1h', lookbackDays: 7, candleCount: 169}},
	});
	assert.equal(result.ok, true);
});
