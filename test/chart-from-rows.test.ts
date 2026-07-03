import assert from 'node:assert/strict';
import {test} from 'node:test';
import {extractOhlcvBarsFromUnknown} from '../dist/core/chart/fetch-result.js';
import {prepareChartFromRows} from '../dist/core/chart/prepare-from-rows.js';
import {PrepareChartFromRowsInputSchema} from '../dist/core/chart/prepare-from-rows.js';

const bars = [
	{time: 1_700_000_000, open: 100, high: 110, low: 90, close: 105, volume: 1000},
	{time: 1_700_014_400, open: 105, high: 115, low: 100, close: 110, volume: 900},
];

test('extractOhlcvBarsFromUnknown reads nested result arrays', () => {
	const extracted = extractOhlcvBarsFromUnknown({result: bars});
	assert.deepEqual(extracted, bars);
});

test('extractOhlcvBarsFromUnknown reads hyperliquid ohlcv.candles wrapper', () => {
	const hlCandles = [
		{timestampMs: 1_700_000_000_000, open: '2051.9', high: '2059.6', low: '2048.0', close: '2052.8', volume: '16528.435'},
		{timestampMs: 1_700_014_400_000, open: '2052.8', high: '2060.0', low: '2050.0', close: '2058.0', volume: '12000.1'},
	];
	const extracted = extractOhlcvBarsFromUnknown({
		ohlcv: {coin: 'ETH', interval: '4h', candleCount: 2, candles: hlCandles},
	});
	assert.deepEqual(extracted, hlCandles);
});

test('extractOhlcvBarsFromUnknown reads bitget timestamp rows', () => {
	const extracted = extractOhlcvBarsFromUnknown({
		result: [
			{
				timestamp: 1_695_835_800_000,
				open: '26210.5',
				high: '26210.5',
				low: '26194.5',
				close: '26194.5',
				volume: '26.26',
			},
		],
	});
	assert.equal(extracted?.length, 1);
});

test('extractOhlcvBarsFromUnknown walks unknown wrapper keys', () => {
	const bars = [
		{time: 1_700_000_000, open: 100, high: 110, low: 90, close: 105},
	];
	const extracted = extractOhlcvBarsFromUnknown({
		vendorResponse: {payload: {items: bars}},
	});
	assert.deepEqual(extracted, bars);
});

test('extractOhlcvBarsFromUnknown reads cmc nested quote rows', () => {
	const extracted = extractOhlcvBarsFromUnknown({
		result: [
			{
				time_open: '2025-01-08T00:00:00.000Z',
				quote: {USD: {open: 100, high: 110, low: 90, close: 105, volume: 1000}},
			},
		],
	});
	assert.equal(extracted?.length, 1);
});

test('extractOhlcvBarsFromUnknown reads coingecko execute t/o/h/l/c shorthand', () => {
	const shorthand = [
		{t: 1_777_276_800, o: 2322.93, h: 2323.78, l: 2311.6, c: 2320.96, v: 0},
		{t: 1_777_291_200, o: 2320.59, h: 2327.9, l: 2307.62, c: 2314.8, v: 0},
	];
	const extracted = extractOhlcvBarsFromUnknown({result: shorthand});
	assert.deepEqual(extracted, shorthand);
});

test('extractOhlcvBarsFromUnknown reads coingecko ohlc tuple rows', () => {
	const tuples = [
		[1_775_253_600_000, 2053.27, 2058.39, 2053.27, 2058.39],
		[1_775_257_200_000, 2057.08, 2057.08, 2051.19, 2051.96],
	];
	const extracted = extractOhlcvBarsFromUnknown({result: tuples});
	assert.deepEqual(extracted, tuples);
});

test('extractOhlcvBarsFromUnknown reads coingecko marketChart prices + total_volumes', () => {
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
	const ohlcOnly = [
		{time: 1_700_000_000, open: 100, high: 110, low: 90, close: 105},
		{time: 1_700_014_400, open: 105, high: 115, low: 100, close: 110},
	];
	const result = prepareChartFromRows({
		title: 'ETH/USD 4H',
		rows: ohlcOnly,
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
		title: 'ETH/USD 4H',
		toolResult: {result: marketChart},
		options: {bucketSec: 4 * 3600},
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.ok(result.data.chart.panes?.some(p => p.id === 'volume'));
});

test('prepareChartFromRows accepts stringified toolResult JSON', () => {
	const result = prepareChartFromRows({
		title: 'ETH/USD 4H',
		toolResult: JSON.stringify({
			result: [{t: 1_700_000_000, o: 100, h: 110, l: 90, c: 105, v: 0}],
		}),
	});
	assert.equal(result.ok, true);
});

test('prepareChartFromRows accepts hyperliquid ohlcv.candles wrapper', () => {
	const result = prepareChartFromRows({
		title: 'ETH-PERP 4H',
		toolResult: {
			ohlcv: {
				candles: [
					{timestampMs: 1_700_000_000_000, open: '100', high: '110', low: '90', close: '105', volume: '1000'},
					{timestampMs: 1_700_014_400_000, open: '105', high: '115', low: '100', close: '110', volume: '900'},
				],
			},
		},
	});
	assert.equal(result.ok, true);
});

test('prepareChartFromRows accepts gmx flat symbol timeframe candles', () => {
	const result = prepareChartFromRows({
		title: 'ETH/USD 1H',
		toolResult: {
			symbol: 'ETH/USD [WETH-USDC]',
			timeframe: '1h',
			candles: [
				{timestampMs: 1_700_000_000_000, open: '3200', high: '3250', low: '3180', close: '3225', timeLabel: 'Jan 1'},
				{timestampMs: 1_700_003_600_000, open: '3225', high: '3280', low: '3210', close: '3270', timeLabel: 'Jan 1'},
			],
		},
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.ok(result.data.meta?.warnings?.some(w => w.includes('volume')));
});

test('prepareChartFromRows strips bucketSec when rows are already provided', () => {
	const result = prepareChartFromRows({
		title: 'ETH/USD 4H',
		rows: bars,
		options: {bucketSec: 14_400},
	});
	assert.equal(result.ok, true);
});

test('prepareChartFromRows accepts rows directly', () => {
	const result = prepareChartFromRows({
		title: 'ETH/USD 4H',
		rows: bars,
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.ok(result.data.chart.panes?.some(p => p.id === 'volume'));
});

test('prepareChartFromRows accepts toolResult wrapper', () => {
	const result = prepareChartFromRows({
		title: 'ETH/USD 4H',
		toolResult: {result: bars},
	});
	assert.equal(result.ok, true);
});

test('prepareChartFromRows reads title from fetch toolResult metadata', () => {
	const result = prepareChartFromRows({
		toolResult: {
			title: 'ETH/USD 4H — last 90d',
			label: 'ETH/USD',
			result: bars,
		},
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.data.chart.title, 'ETH/USD 4H — last 90d');
});

test('PrepareChartFromRowsInputSchema rejects missing title', () => {
	const parsed = PrepareChartFromRowsInputSchema.safeParse({rows: bars});
	assert.equal(parsed.success, false);
});

test('PrepareChartFromRowsInputSchema rejects empty input', () => {
	const parsed = PrepareChartFromRowsInputSchema.safeParse({});
	assert.equal(parsed.success, false);
});
