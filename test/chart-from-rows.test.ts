import assert from 'node:assert/strict';
import {test} from 'node:test';
import {extractOhlcvBarsFromUnknown} from '../dist/core/chart/fetch-result.js';
import {prepareChartFromRows} from '../dist/core/chart/prepare-from-rows.js';
import {PrepareChartFromRowsInputSchema} from '../dist/core/chart/prepare-from-rows.js';
import {
	CHART_DATA_SHAPE_PAYLOADS,
	SAMPLE_NUMERIC_BARS,
	SAMPLE_STRING_MS_CANDLES,
	SAMPLE_STRING_MS_CANDLES_NO_VOLUME,
	type ChartDataShapeId,
} from './fixtures/chart-data-shapes.ts';

const bars = [...SAMPLE_NUMERIC_BARS];

const EXTRACT_SHAPE_IDS: ChartDataShapeId[] = [
	'bare-ohlcv-bar-array',
	'nested-interval-with-candle-array',
	'vendor-wrapper-walk',
	'cmc-quote-nested-rows',
	'ohlc-shorthand-rows',
	'ohlc-tuple-rows',
	'timestamp-field-rows',
];

test('extractOhlcvBarsFromUnknown reads nested result arrays', () => {
	const extracted = extractOhlcvBarsFromUnknown({result: bars});
	assert.deepEqual(extracted, bars);
});

for (const shape of EXTRACT_SHAPE_IDS) {
	test(`extractOhlcvBarsFromUnknown reads ${shape}`, () => {
		const extracted = extractOhlcvBarsFromUnknown(CHART_DATA_SHAPE_PAYLOADS[shape]);
		assert.ok(extracted?.length, `expected bars from ${shape}`);
	});
}

test('extractOhlcvBarsFromUnknown reads market-chart price + volume pairs', () => {
	const marketChart = {
		prices: [
			[1_000_000, 100],
			[3_600_000, 110],
		],
		total_volumes: [
			[1_000_000, 500],
			[3_600_000, 700],
		],
	};
	const extracted = extractOhlcvBarsFromUnknown({result: marketChart});
	assert.equal(extracted?.length, 2);
	assert.equal((extracted![0] as {volume?: number}).volume, 500);
});

test('prepareChartFromRows warns when rows lack volume', () => {
	const ohlcOnly = bars.map(({volume: _volume, ...rest}) => rest);
	const result = prepareChartFromRows({
		title: 'ASSET/USD 4H',
		rows: ohlcOnly,
		options: {allowRowsOnly: true},
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.ok(result.data.meta?.warnings?.some(w => w.includes('marketChart')));
	assert.equal(result.data.chart.panes?.some(p => p.id === 'volume'), false);
});

test('prepareChartFromRows accepts marketChart toolResult with bucketSec', () => {
	const t0 = 14_400;
	const marketChart = {
		prices: [
			[t0, 10],
			[t0 + 3600, 12],
			[t0 + 7200, 11],
			[t0 + 14_400, 13],
		],
		total_volumes: [
			[t0, 1],
			[t0 + 3600, 2],
			[t0 + 7200, 3],
			[t0 + 14_400, 4],
		],
	};
	const result = prepareChartFromRows({
		title: 'ASSET/USD 4H',
		toolResult: {result: marketChart},
		options: {bucketSec: 4 * 3600},
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.ok(result.data.chart.panes?.some(p => p.id === 'volume'));
});

test('prepareChartFromRows rejects stringified toolResult JSON', () => {
	const result = prepareChartFromRows({
		title: 'ASSET/USD 4H',
		toolResult: JSON.stringify({
			result: [{t: 1_700_000_000, o: 100, h: 110, l: 90, c: 105, v: 0}],
		}),
	});
	assert.equal(result.ok, false);
	if (result.ok) {
		return;
	}
	assert.match(result.reason, /object|ohlcvDigest|truncated/i);
});

test('prepareChartFromRows accepts nested-interval-envelope ohlcv.candles wrapper', () => {
	const result = prepareChartFromRows({
		title: 'ASSET 4H',
		toolResult: {
			ohlcv: {candles: [...SAMPLE_STRING_MS_CANDLES]},
		},
	});
	assert.equal(result.ok, true);
});

test('prepareChartFromRows accepts flat-symbol-envelope candles', () => {
	const candles = [...SAMPLE_STRING_MS_CANDLES_NO_VOLUME];
	const result = prepareChartFromRows({
		title: 'ASSET/USD 1H',
		toolResult: {
			symbol: 'ASSET/USD [PAIR]',
			timeframe: '1h',
			startTimeMs: candles[0]!.timestampMs,
			endTimeMs: candles[1]!.timestampMs,
			candles,
		},
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.ok(result.data.meta?.warnings?.some(w => w.includes('volume')));
});

test('prepareChartFromRows strips bucketSec when rows are already provided', () => {
	const result = prepareChartFromRows({
		title: 'ASSET/USD 4H',
		rows: bars,
		options: {bucketSec: 14_400, allowRowsOnly: true},
	});
	assert.equal(result.ok, true);
});

test('prepareChartFromRows accepts rows directly', () => {
	const result = prepareChartFromRows({
		title: 'ASSET/USD 4H',
		rows: bars,
		options: {allowRowsOnly: true},
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.ok(result.data.chart.panes?.some(p => p.id === 'volume'));
});

test('prepareChartFromRows accepts toolResult wrapper', () => {
	const result = prepareChartFromRows({
		title: 'ASSET/USD 4H',
		toolResult: {result: bars},
	});
	assert.equal(result.ok, true);
});

test('prepareChartFromRows reads title from fetch toolResult metadata', () => {
	const result = prepareChartFromRows({
		toolResult: {
			title: 'ASSET/USD 4H',
			label: 'ASSET/USD',
			result: bars,
		},
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.data.chart.title, 'ASSET/USD 4H');
});

test('prepareChartFromRows accepts nested-execute-with-bars wrapper', () => {
	const result = prepareChartFromRows({
		title: 'ASSET/USD 4H',
		toolResult: CHART_DATA_SHAPE_PAYLOADS['nested-execute-with-bars'],
	});
	assert.equal(result.ok, true);
});

test('PrepareChartFromRowsInputSchema rejects missing title', () => {
	const parsed = PrepareChartFromRowsInputSchema.safeParse({rows: bars});
	assert.equal(parsed.success, false);
});

test('PrepareChartFromRowsInputSchema rejects empty input', () => {
	const parsed = PrepareChartFromRowsInputSchema.safeParse({});
	assert.equal(parsed.success, false);
});

test('prepareChartFromRows prefers timestampMs over agent-rewritten time', () => {
	const startTimeMs = 1_782_655_200_000;
	const endTimeMs = startTimeMs + 2 * 3_600_000;
	const result = prepareChartFromRows({
		title: 'ASSET 1H',
		toolResult: {
			ohlcv: {
				coin: 'ASSET',
				interval: '1h',
				startTimeMs,
				endTimeMs,
				candles: [
					{
						timestampMs: startTimeMs,
						time: 1_752_446_400,
						open: '100',
						high: '110',
						low: '90',
						close: '105',
						volume: '1',
					},
					{
						timestampMs: startTimeMs + 3_600_000,
						time: 1_752_450_000,
						open: '105',
						high: '115',
						low: '100',
						close: '110',
						volume: '1',
					},
				],
			},
		},
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const candleSeries = result.data.chart.series.find(s => s.type === 'candlestick');
	assert.equal(candleSeries?.data[0]?.time, Math.floor(startTimeMs / 1000));
});

test('prepareChartFromRows rejects invalid string toolResult', () => {
	const result = prepareChartFromRows({
		title: 'ASSET 1H',
		toolResult: '{"ohlcv":{"coin":"ASSET","candles":[',
	});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.reason, /truncated|invalid JSON/i);
	}
});

test('prepareChartFromRows prefers toolResult over mangled rows', () => {
	const startTimeMs = 1_782_658_800_000;
	const endTimeMs = startTimeMs + 2 * 3_600_000;
	const goodCandles = [
		{
			timestampMs: startTimeMs,
			open: '1580.9',
			high: '1584.2',
			low: '1576.4',
			close: '1579.6',
			volume: '4644',
		},
		{
			timestampMs: startTimeMs + 3_600_000,
			open: '1579.7',
			high: '1580.9',
			low: '1565.6',
			close: '1571.8',
			volume: '5000',
		},
	];
	const toolResult = {
		ohlcv: {
			coin: 'ASSET',
			interval: '1h',
			startTimeMs,
			endTimeMs,
			candleCount: 2,
			candles: goodCandles,
		},
	};
	const mangledRows = goodCandles.map(c => ({
		...c,
		time: 1_752_446_400,
		open: 2030,
		high: 2035,
		low: 2020,
		close: 2032,
	}));
	const result = prepareChartFromRows({
		title: 'ASSET 1H',
		toolResult,
		rows: mangledRows,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const candleSeries = result.data.chart.series.find(s => s.type === 'candlestick');
	const highs = candleSeries?.data.map(p => p.high as number) ?? [];
	assert.ok(highs.every(h => h < 2000));
	assert.ok(result.data.meta?.warnings?.some(w => w.includes('Chart data:')));
});

test('prepareChartFromRows rejects interval fetch with time-only rewrite (missing timestampMs)', () => {
	const startTimeMs = 1_782_658_800_000;
	const endTimeMs = 1_783_263_600_000;
	const result = prepareChartFromRows({
		title: 'ASSET 1H',
		toolResult: {
			ohlcv: {
				coin: 'ASSET',
				interval: '1h',
				startTimeMs,
				endTimeMs,
				candles: [
					{
						timestampMs: startTimeMs,
						open: '100',
						high: '110',
						low: '90',
						close: '105',
						volume: '1',
					},
					{
						time: Math.floor(startTimeMs / 1000) + 3600,
						open: '105',
						high: '115',
						low: '100',
						close: '110',
						volume: '1',
					},
				],
			},
		},
	});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.reason, /timestampMs|generic `time` fields/i);
	}
});

test('prepareChartFromRows rejects candles outside fetch window when only wrong time is present', () => {
	const result = prepareChartFromRows({
		title: 'ASSET 1H',
		toolResult: {
			ohlcv: {
				interval: '1h',
				startTimeMs: 1_782_655_200_000,
				endTimeMs: 1_783_260_000_000,
				candles: [{time: 1_752_446_400, open: '100', high: '110', low: '90', close: '105', volume: '1'}],
			},
		},
	});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.match(result.reason, /fetch window|timestampMs/i);
});

test('prepareChartFromRows rejects title-only without fetch and tells operator to fetch first', () => {
	const parsed = PrepareChartFromRowsInputSchema.safeParse({title: 'ASSET/USD 4H — last 7d'});
	assert.equal(parsed.success, false);
	if (parsed.success) return;
	assert.match(parsed.error.message, /sessionBind|OHLCV fetch/i);

	const result = prepareChartFromRows({title: 'ASSET/USD 4H — last 7d'});
	assert.equal(result.ok, false);
	if (result.ok) return;
	assert.match(result.reason, /sessionBind|OHLCV fetch/i);
});
