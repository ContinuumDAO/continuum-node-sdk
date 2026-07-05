import assert from 'node:assert/strict';
import test from 'node:test';
import {listChartAnalysisOptions} from '../dist/core/chart/analysis/analysis-catalog.js';
import {
	analyzeKeyLevels,
	analyzeMomentum,
	analyzeRangeVolatility,
	analyzeTrendStructure,
} from '../dist/core/chart/analysis/analyze-tools.js';

const sampleBars = [
	{time: 1000, open: 100, high: 102, low: 99, close: 101, volume: 1000},
	{time: 2000, open: 101, high: 103, low: 100, close: 102, volume: 1100},
	{time: 3000, open: 102, high: 104, low: 101, close: 103, volume: 1200},
	{time: 4000, open: 103, high: 105, low: 102, close: 104, volume: 1300},
	{time: 5000, open: 104, high: 106, low: 103, close: 105, volume: 1400},
	{time: 6000, open: 105, high: 107, low: 104, close: 106, volume: 1500},
	{time: 7000, open: 106, high: 108, low: 105, close: 107, volume: 1600},
	{time: 8000, open: 107, high: 109, low: 106, close: 108, volume: 1700},
	{time: 9000, open: 108, high: 110, low: 107, close: 109, volume: 1800},
	{time: 10000, open: 109, high: 111, low: 108, close: 110, volume: 1900},
	{time: 11000, open: 110, high: 112, low: 109, close: 111, volume: 2000},
	{time: 12000, open: 111, high: 113, low: 110, close: 112, volume: 2100},
	{time: 13000, open: 112, high: 114, low: 111, close: 113, volume: 2200},
	{time: 14000, open: 113, high: 115, low: 112, close: 114, volume: 2300},
	{time: 15000, open: 114, high: 116, low: 113, close: 115, volume: 2400},
	{time: 16000, open: 115, high: 117, low: 114, close: 116, volume: 2500},
	{time: 17000, open: 116, high: 118, low: 115, close: 117, volume: 2600},
	{time: 18000, open: 117, high: 119, low: 116, close: 118, volume: 2700},
	{time: 19000, open: 118, high: 120, low: 117, close: 119, volume: 2800},
	{time: 20000, open: 119, high: 121, low: 118, close: 120, volume: 2900},
];

test('listChartAnalysisOptions returns analysis catalog entries', () => {
	const catalog = listChartAnalysisOptions();
	assert.equal(catalog.analyses.length, 9);
	assert.ok(catalog.analyses.some(a => a.analyzeTool === 'analyze_trend_structure'));
	assert.ok(catalog.analyses.some(a => a.dataKind === 'ohlcv'));
});

test('analyzeTrendStructure accepts optional label from fetch metadata', async () => {
	const result = await analyzeTrendStructure({
		rows: sampleBars,
		title: 'ETH/USD 1H',
		label: 'ETH/USD',
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
});

test('analyzeTrendStructure accepts coingecko-shaped string toolResult with label', async () => {
	const result = await analyzeTrendStructure({
		title: 'ETH/USD 1H',
		label: 'ETH/USD',
		toolResult: JSON.stringify({label: 'ETH/USD', result: sampleBars}),
		mergeLive: false,
	});
	assert.equal(result.ok, true);
});

test('analyzeTrendStructure returns structured JSON not chart envelope', async () => {
	const result = await analyzeTrendStructure({
		rows: sampleBars,
		title: 'TEST 1H',
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.ok('analysis' in result.data);
		assert.ok('bias' in result.data.analysis);
		assert.equal((result.data as {kind?: string}).kind, undefined);
	}
});

test('analyzeKeyLevels returns levels and nearest support/resistance', async () => {
	const result = await analyzeKeyLevels({
		rows: sampleBars,
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.data.analysis.lastClose, 120);
		assert.ok(Array.isArray(result.data.analysis.levels));
	}
});

test('analyzeMomentum returns rsi and macd blocks', async () => {
	const result = await analyzeMomentum({
		rows: sampleBars,
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.ok(result.data.analysis.rsi);
		assert.ok(result.data.analysis.macd);
	}
});

test('analyzeRangeVolatility returns range and compression', async () => {
	const result = await analyzeRangeVolatility({
		rows: sampleBars,
		allowRowsOnly: true,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.ok(result.data.analysis.rangeHigh >= result.data.analysis.rangeLow);
		assert.ok(['compressing', 'expanding', 'stable'].includes(result.data.analysis.compression));
	}
});
