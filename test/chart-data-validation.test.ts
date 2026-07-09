import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	rejectMangledChartDataToolResult,
	rejectTitleLookbackVsBarTimes,
	rejectTitleLookbackVsTimeSeriesPoints,
	validateTimeSeriesPointsFromToolResult,
} from '../dist/core/chart/chart-data-validation.js';
import {validateOhlcvBarsFromToolResult} from '../dist/core/chart/ohlcv-window.js';
import {
	CHART_DATA_SHAPE_PAYLOADS,
	mixedTimelineBars,
	mixedTimelineLinePoints,
	type ChartDataShapeId,
} from './fixtures/chart-data-shapes.ts';

const MANGLED_SHAPES: ChartDataShapeId[] = [
	'mangled-item-wrapper',
	'mangled-interval-without-metadata',
];

const VALID_INTERVAL_SHAPES: ChartDataShapeId[] = [
	'valid-interval-with-window',
	'valid-interval-with-lookback',
	'flat-symbol-envelope',
];

const NON_INTERVAL_SHAPES: ChartDataShapeId[] = [
	'bare-ohlcv-bar-array',
	'market-chart-price-volume',
	'nested-execute-with-bars',
	'line-series-with-title',
];

test('rejectMangledChartDataToolResult rejects known mangled interval shapes', () => {
	for (const shape of MANGLED_SHAPES) {
		const result = rejectMangledChartDataToolResult(CHART_DATA_SHAPE_PAYLOADS[shape]);
		assert.equal(result.ok, false, `expected mangled: ${shape}`);
	}
});

test('rejectMangledChartDataToolResult accepts valid interval fetch metadata', () => {
	for (const shape of VALID_INTERVAL_SHAPES) {
		const result = rejectMangledChartDataToolResult(CHART_DATA_SHAPE_PAYLOADS[shape]);
		assert.equal(result.ok, true, `expected valid: ${shape}`);
	}
});

test('rejectMangledChartDataToolResult accepts non-interval chart data shapes', () => {
	for (const shape of NON_INTERVAL_SHAPES) {
		const result = rejectMangledChartDataToolResult(CHART_DATA_SHAPE_PAYLOADS[shape]);
		assert.equal(result.ok, true, `expected valid: ${shape}`);
	}
});

test('rejectMangledChartDataToolResult rejects series.item wrapper', () => {
	const result = rejectMangledChartDataToolResult({
		title: 'Metric — last 7d',
		series: {item: [{time: 1, value: 2}]},
	});
	assert.equal(result.ok, false);
});

test('rejectTitleLookbackVsBarTimes rejects mixed OHLCV timelines', () => {
	const result = rejectTitleLookbackVsBarTimes('ASSET 1H — last 7d', mixedTimelineBars());
	assert.equal(result.ok, false);
});

test('rejectTitleLookbackVsTimeSeriesPoints rejects mixed line timelines', () => {
	const result = rejectTitleLookbackVsTimeSeriesPoints(
		'Metric — last 7d',
		mixedTimelineLinePoints(),
	);
	assert.equal(result.ok, false);
});

test('validateOhlcvBarsFromToolResult rejects mangled item wrapper for any interval shape', () => {
	const bars = mixedTimelineBars();
	const result = validateOhlcvBarsFromToolResult(
		bars,
		CHART_DATA_SHAPE_PAYLOADS['mangled-item-wrapper'],
		'ASSET 1H — last 7d',
	);
	assert.equal(result.ok, false);
});

test('validateTimeSeriesPointsFromToolResult rejects mangled series.item wrapper', () => {
	const points = mixedTimelineLinePoints();
	const result = validateTimeSeriesPointsFromToolResult(
		points,
		{title: 'Metric — last 7d', series: {item: points}},
		'Metric — last 7d',
	);
	assert.equal(result.ok, false);
});

test('validateTimeSeriesPointsFromToolResult rejects mixed timelines for title lookback', () => {
	const result = validateTimeSeriesPointsFromToolResult(
		mixedTimelineLinePoints(),
		CHART_DATA_SHAPE_PAYLOADS['line-series-with-title'],
		'Metric — last 7d',
	);
	assert.equal(result.ok, false);
});
