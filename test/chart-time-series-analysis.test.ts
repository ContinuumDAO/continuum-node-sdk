import assert from 'node:assert/strict';
import test from 'node:test';
import {listChartAnalysisOptions} from '../dist/core/chart/analysis/analysis-catalog.js';
import {analyzeTrendStructure} from '../dist/core/chart/analysis/analyze-tools.js';
import {extractTimeSeriesFromUnknown} from '../dist/core/chart/analysis/time-series-input.js';
import {
	analyzeTimeSeriesMomentum,
	analyzeTimeSeriesStats,
	analyzeTimeSeriesTrend,
} from '../dist/core/chart/analysis/time-series-analyze-tools.js';

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

test('listChartAnalysisOptions includes time-series analyses', () => {
	const catalog = listChartAnalysisOptions();
	const timeSeries = catalog.analyses.filter(a => a.dataKind === 'time_series');
	assert.equal(timeSeries.length, 3);
	assert.ok(timeSeries.some(a => a.id === 'time_series_trend'));
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

test('analyzeTimeSeriesTrend returns structured JSON', () => {
	const result = analyzeTimeSeriesTrend({rows: linePoints, title: 'TVL 30d'});
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.ok('analysis' in result.data);
		assert.ok(['rising', 'falling', 'flat'].includes(result.data.analysis.bias));
	}
});

test('analyzeTimeSeriesMomentum returns rsi block', () => {
	const result = analyzeTimeSeriesMomentum({rows: linePoints});
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.ok(result.data.analysis.rsi);
	}
});

test('analyzeTimeSeriesStats returns compression', () => {
	const result = analyzeTimeSeriesStats({rows: linePoints});
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.ok(['compressing', 'expanding', 'stable'].includes(result.data.analysis.compression));
	}
});

test('analyzeTrendStructure rejects line-only rows', async () => {
	const result = await analyzeTrendStructure({rows: linePoints});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.reason, /time_series/i);
	}
});
