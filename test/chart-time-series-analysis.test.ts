import assert from 'node:assert/strict';
import test from 'node:test';
import {listChartAnalysisOptions} from '../dist/core/chart/analysis/analysis-catalog.js';
import {analyzeTrendStructure} from '../dist/core/chart/analysis/analyze-tools.js';
import {analyzeBollingerBands} from '../dist/core/chart/analysis/bollinger-analyze-tools.js';
import {extractTimeSeriesFromUnknown} from '../dist/core/chart/analysis/time-series-input.js';
import {mixedTimelineLinePoints} from './fixtures/chart-data-shapes.ts';

const linePoints = [
	{time: 1000, value: 100},
	{time: 2000, value: 102},
	{time: 3000, value: 101},
	{time: 4000, value: 105},
	{time: 5000, value: 108},
	{time: 6000, value: 107},
	{time: 7000, value: 110},
	{time: 8000, value: 112},
	{time: 9000, value: 111},
	{time: 10000, value: 115},
	{time: 11000, value: 114},
	{time: 12000, value: 118},
	{time: 13000, value: 120},
	{time: 14000, value: 119},
	{time: 15000, value: 122},
	{time: 16000, value: 125},
	{time: 17000, value: 124},
	{time: 18000, value: 127},
	{time: 19000, value: 130},
	{time: 20000, value: 128},
];

test('listChartAnalysisOptions has no time-series analyses', () => {
	const catalog = listChartAnalysisOptions();
	assert.equal(catalog.analyses.some(a => a.dataKind === 'time_series'), false);
	assert.ok(catalog.analyses.some(a => a.id === 'bollinger_bands'));
});

test('listChartAnalysisOptions filters by dataKind', () => {
	const ohlcv = listChartAnalysisOptions({dataKind: 'ohlcv'});
	assert.ok(ohlcv.analyses.every(a => a.dataKind === 'ohlcv' || a.analyzeTool === 'analyze_bollinger_bands'));
	assert.ok(!ohlcv.analyses.some(a => a.dataKind === 'time_series'));
	assert.ok(ohlcv.analyses.some(a => a.id === 'trend_structure'));

	const timeSeries = listChartAnalysisOptions({dataKind: 'time_series'});
	assert.deepEqual(
		timeSeries.analyses.map(a => a.id),
		['bollinger_bands'],
	);
	assert.ok(!timeSeries.analyses.some(a => a.id === 'candlestick_patterns'));
});

test('extractTimeSeriesFromUnknown reads time value rows', () => {
	const extracted = extractTimeSeriesFromUnknown({series: linePoints});
	assert.equal(extracted?.length, linePoints.length);
	assert.equal(extracted?.[0]?.value, 100);
});

test('extractTimeSeriesFromUnknown reads tuples', () => {
	const extracted = extractTimeSeriesFromUnknown({
		result: [
			[1_700_000_000_000, 100],
			[1_700_086_400_000, 105],
		],
	});
	assert.equal(extracted?.length, 2);
});

test('extractTimeSeriesFromUnknown rejects OHLC rows', () => {
	const extracted = extractTimeSeriesFromUnknown([
		{time: 1, open: 1, high: 2, low: 1, close: 2},
	]);
	assert.equal(extracted, null);
});

test('analyzeTrendStructure rejects line-only rows', async () => {
	const result = await analyzeTrendStructure({rows: linePoints});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.reason, /time series/i);
	}
});

test('analyzeBollingerBands rejects mangled series.item wrapper', async () => {
	const points = mixedTimelineLinePoints();
	const result = await analyzeBollingerBands({
		title: 'Metric — last 7d',
		toolResult: {title: 'Metric — last 7d', series: {item: points}},
	});
	assert.equal(result.ok, false);
});

test('analyzeBollingerBands rejects mixed timeline for title lookback', async () => {
	const result = await analyzeBollingerBands({
		title: 'Metric — last 7d',
		toolResult: {title: 'Metric — last 7d', series: mixedTimelineLinePoints()},
	});
	assert.equal(result.ok, false);
});
