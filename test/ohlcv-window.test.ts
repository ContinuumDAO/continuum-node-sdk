import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	extractOhlcvFetchWindow,
	validateBarsAgainstFetchWindow,
	validateOhlcvBarsFromToolResult,
} from '../dist/core/chart/ohlcv-window.js';
import {parseChartTimeFromRow} from '../dist/core/chart/point-normalize.js';
import {CHART_DATA_SHAPE_PAYLOADS, mixedTimelineBars} from './fixtures/chart-data-shapes.ts';

test('parseChartTimeFromRow prefers timestampMs over wrong time', () => {
	const parsed = parseChartTimeFromRow({
		timestampMs: 1_782_655_200_000,
		time: 1_752_446_400,
	});
	assert.equal(parsed, Math.floor(1_782_655_200_000 / 1000));
});

test('extractOhlcvFetchWindow reads nested interval metadata', () => {
	const window = extractOhlcvFetchWindow(CHART_DATA_SHAPE_PAYLOADS['valid-interval-with-window']);
	assert.equal(window?.startTimeMs, 1_782_655_200_000);
	assert.equal(window?.intervalSec, 3600);
});

test('validateBarsAgainstFetchWindow rejects wholly mismatched times', () => {
	const window = extractOhlcvFetchWindow(
		CHART_DATA_SHAPE_PAYLOADS['valid-interval-with-window'],
	)!;
	const check = validateBarsAgainstFetchWindow(
		[{time: 1_752_446_400, open: 1, high: 1, low: 1, close: 1}],
		window,
	);
	assert.equal(check.ok, false);
});

test('validateBarsAgainstFetchWindow accepts timestampMs bars in window', () => {
	const window = extractOhlcvFetchWindow(
		CHART_DATA_SHAPE_PAYLOADS['valid-interval-with-window'],
	)!;
	const check = validateBarsAgainstFetchWindow(
		[
			{timestampMs: 1_782_655_200_000, open: 1, high: 1, low: 1, close: 1},
			{timestampMs: 1_782_658_800_000, open: 1, high: 1, low: 1, close: 1},
		],
		window,
	);
	assert.equal(check.ok, true);
});

test('validateBarsAgainstFetchWindow rejects dual timeline (wrong cluster + live tail)', () => {
	const window = extractOhlcvFetchWindow(
		CHART_DATA_SHAPE_PAYLOADS['valid-interval-with-window'],
	)!;
	const wrongCluster = Array.from({length: 160}, (_, i) => ({
		time: 1_752_446_400 + i * 3600,
		open: 1,
		high: 1,
		low: 1,
		close: 1,
	}));
	const liveTail = Array.from({length: 9}, (_, i) => ({
		timestampMs: 1_783_252_800_000 + i * 3_600_000,
		open: 1,
		high: 1,
		low: 1,
		close: 1,
	}));
	const check = validateBarsAgainstFetchWindow([...wrongCluster, ...liveTail], window);
	assert.equal(check.ok, false);
});

test('validateOhlcvBarsFromToolResult rejects mangled payload with mixed timeline bars', () => {
	const check = validateOhlcvBarsFromToolResult(
		mixedTimelineBars(),
		CHART_DATA_SHAPE_PAYLOADS['mangled-item-wrapper'],
		'ASSET 1H — last 7d',
	);
	assert.equal(check.ok, false);
});
