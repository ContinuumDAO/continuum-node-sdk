import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	CHART_LIVE_PROVIDER_BINANCE_TICKER,
	CHART_LIVE_PROVIDER_FMP_QUOTE,
	CHART_LIVE_PROVIDER_ALPACA_LATEST_TRADE,
	CHART_LIVE_PROVIDER_HYPERLIQUID_ALL_MIDS,
	extractLiveBindingFromFetchPayload,
	parseAlpacaLatestTradeTick,
	parseFmpQuoteTick,
	mergeBarsByTimestamp,
	mergeLiveTickIntoBars,
	refreshChartFromLiveTick,
	seriesHasTimestampGaps,
} from '../dist/core/chart/live/index.js';
import {prepareChart} from '../dist/core/chart/prepare.js';
import {CHART_DATA_SHAPE_PAYLOADS} from './fixtures/chart-data-shapes.ts';

test('mergeLiveTickIntoBars updates last bar in same bucket', () => {
	const bars = [
		{time: 1_700_000_000, open: 100, high: 105, low: 99, close: 102},
	];
	const {bars: out, barRolledOver} = mergeLiveTickIntoBars(
		bars,
		{timeMs: 1_700_000_000 * 1000 + 30_000, price: 106},
		{bucketSec: 3600},
	);
	assert.equal(barRolledOver, false);
	assert.equal(out.length, 1);
	assert.equal(out[0]!.close, 106);
	assert.equal(out[0]!.high, 106);
});

test('mergeLiveTickIntoBars does not bridge a multi-period gap', () => {
	const bars = [
		{time: 1_700_000_000, open: 100, high: 105, low: 99, close: 102},
	];
	const twoPeriodsLaterMs = (1_700_000_000 + 7200) * 1000;
	const {bars: out, barRolledOver} = mergeLiveTickIntoBars(
		bars,
		{timeMs: twoPeriodsLaterMs, price: 110},
		{bucketSec: 3600},
	);
	assert.equal(barRolledOver, false);
	assert.equal(out.length, 1);
	assert.equal(out[0]!.close, 102);
});

test('mergeLiveTickIntoBars appends one bar on next period rollover', () => {
	const bars = [
		{time: 1_700_000_000, open: 100, high: 105, low: 99, close: 102},
	];
	const nextBucketMs = (1_700_000_000 + 3600) * 1000;
	const {bars: out, barRolledOver} = mergeLiveTickIntoBars(
		bars,
		{timeMs: nextBucketMs, price: 110},
		{bucketSec: 3600},
	);
	assert.equal(barRolledOver, true);
	assert.equal(out.length, 2);
	assert.equal(out[1]!.time, 1_700_000_000 + 3600);
	assert.equal(out[1]!.open, 102);
	assert.equal(out[1]!.close, 110);
});

test('mergeLiveTickIntoBars uses bar spacing when binding bucketSec is wrong', () => {
	const bars = [
		{time: 1_700_000_000, open: 100, high: 105, low: 99, close: 102},
		{time: 1_700_003_600, open: 102, high: 108, low: 101, close: 105},
	];
	const {bars: out, barRolledOver} = mergeLiveTickIntoBars(
		bars,
		{timeMs: (1_700_003_600 + 1800) * 1000, price: 106},
		{bucketSec: 900},
	);
	assert.equal(barRolledOver, false);
	assert.equal(out.length, 2);
	assert.equal(out[1]!.close, 106);
});

test('mergeBarsByTimestamp unions by time with incoming winning', () => {
	const existing = [
		{time: 100, open: 1, high: 2, low: 0, close: 1.5},
		{time: 200, open: 2, high: 3, low: 1, close: 2.5},
	];
	const incoming = [
		{time: 200, open: 9, high: 10, low: 8, close: 9.5},
		{time: 300, open: 3, high: 4, low: 2, close: 3.5},
	];
	const merged = mergeBarsByTimestamp(existing, incoming);
	assert.equal(merged.length, 3);
	assert.equal(merged[1]!.open, 9);
	assert.equal(merged[2]!.time, 300);
});

test('seriesHasTimestampGaps detects irregular tail spacing', () => {
	const bars = [
		{time: 100, open: 1, high: 2, low: 0, close: 1},
		{time: 200, open: 1, high: 2, low: 0, close: 1},
		{time: 500, open: 1, high: 2, low: 0, close: 1},
	];
	assert.equal(seriesHasTimestampGaps(bars, 100), true);
	assert.equal(seriesHasTimestampGaps(bars.slice(0, 2), 100), false);
});

test('extractLiveBindingFromFetchPayload reads nested-interval-envelope', () => {
	const binding = extractLiveBindingFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['nested-interval-envelope'],
	);
	assert.ok(binding);
	assert.equal(binding!.providerId, CHART_LIVE_PROVIDER_HYPERLIQUID_ALL_MIDS);
	assert.equal(binding!.bucketSec, 3600);
	assert.equal(binding!.params.coin, 'ASSET');
});

test('extractLiveBindingFromFetchPayload reads uniswap flat envelope', () => {
	const binding = extractLiveBindingFromFetchPayload({
		symbol: 'ETH/USDC',
		timeframe: '15m',
		chainId: 42161,
		poolReference: '0xabc123',
		dataSource: 'subgraph_native',
		priceQuote: 'token0PerToken1',
		candles: [],
	});
	assert.ok(binding);
	assert.equal(binding!.providerId, 'uniswapV4.poolPrice');
	assert.equal(binding!.params.poolReference, '0xabc123');
});

test('extractLiveBindingFromFetchPayload reads flat-symbol-envelope', () => {
	const binding = extractLiveBindingFromFetchPayload({
		symbol: 'ASSET/USD',
		timeframe: '15m',
		candles: [],
	});
	assert.ok(binding);
	assert.equal(binding!.providerId, 'gmx.markPrice');
	assert.equal(binding!.bucketSec, 900);
});

test('extractLiveBindingFromFetchPayload reads symbol-interval-klines-envelope', () => {
	const binding = extractLiveBindingFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['symbol-interval-klines-envelope'],
	);
	assert.ok(binding);
	assert.equal(binding!.providerId, CHART_LIVE_PROVIDER_BINANCE_TICKER);
	assert.equal(binding!.bucketSec, 3600);
	assert.equal(binding!.params.symbol, 'BTCUSDT');
	assert.equal(binding!.params.interval, '1h');
});

test('extractLiveBindingFromFetchPayload reads date-field historical envelope as fmp.quote', () => {
	const binding = extractLiveBindingFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['date-field-historical-envelope'],
	);
	assert.ok(binding);
	assert.equal(binding!.providerId, CHART_LIVE_PROVIDER_FMP_QUOTE);
	assert.equal(binding!.params.symbol, 'BTCUSD');
	assert.equal(binding!.bucketSec, 86_400);
});

test('extractLiveBindingFromFetchPayload reads date-field data array as fmp.quote', () => {
	const binding = extractLiveBindingFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['date-field-data-array'],
	);
	assert.ok(binding);
	assert.equal(binding!.providerId, CHART_LIVE_PROVIDER_FMP_QUOTE);
	assert.equal(binding!.params.symbol, 'AAPL');
	assert.equal(binding!.bucketSec, 3600);
});

test('extractLiveBindingFromFetchPayload reads symbol-timeframe-bars envelope as alpaca.latestTrade', () => {
	const binding = extractLiveBindingFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['symbol-timeframe-bars-envelope'],
	);
	assert.ok(binding);
	assert.equal(binding!.providerId, CHART_LIVE_PROVIDER_ALPACA_LATEST_TRADE);
	assert.equal(binding!.params.symbol, 'AAPL');
	assert.equal(binding!.params.assetClass, 'stock');
	assert.equal(binding!.bucketSec, 86_400);
});

test('extractLiveBindingFromFetchPayload reads symbol-keyed ohlc bars as alpaca.latestTrade', () => {
	const binding = extractLiveBindingFromFetchPayload(
		CHART_DATA_SHAPE_PAYLOADS['symbol-keyed-ohlc-bars'],
	);
	assert.ok(binding);
	assert.equal(binding!.providerId, CHART_LIVE_PROVIDER_ALPACA_LATEST_TRADE);
	assert.equal(binding!.params.symbol, 'AAPL');
	assert.equal(binding!.bucketSec, 86_400);
});

test('extractLiveBindingFromFetchPayload treats slash symbol as crypto', () => {
	const binding = extractLiveBindingFromFetchPayload({
		symbol: 'BTC/USD',
		timeframe: '1Hour',
		bars: [{t: '2024-01-04T12:00:00Z', o: 42_000, h: 42_100, l: 41_900, c: 42_050, v: 12}],
	});
	assert.ok(binding);
	assert.equal(binding!.providerId, CHART_LIVE_PROVIDER_ALPACA_LATEST_TRADE);
	assert.equal(binding!.params.assetClass, 'crypto');
	assert.equal(binding!.bucketSec, 3600);
});

test('parseAlpacaLatestTradeTick reads stock trade and crypto trades map', () => {
	const stock = parseAlpacaLatestTradeTick(
		{symbol: 'AAPL', trade: {t: '2024-01-04T15:00:00Z', p: 186.2, s: 100}},
		'AAPL',
		1,
	);
	assert.equal(stock?.price, 186.2);
	assert.equal(stock?.volume, 100);
	assert.equal(stock?.timeMs, Date.parse('2024-01-04T15:00:00Z'));
	const crypto = parseAlpacaLatestTradeTick(
		{trades: {'BTC/USD': {t: '2024-01-04T15:00:00Z', p: 42_000, s: 0.01}}},
		'BTC/USD',
		99,
	);
	assert.equal(crypto?.price, 42_000);
	assert.equal(crypto?.volume, 0.01);
});

test('parseFmpQuoteTick reads array and data-wrapper quote shapes', () => {
	const fromArray = parseFmpQuoteTick(
		[{symbol: 'AAPL', price: 186.2, volume: 1_000, timestamp: 1_700_000_000}],
		1,
	);
	assert.equal(fromArray?.price, 186.2);
	assert.equal(fromArray?.volume, 1_000);
	assert.equal(fromArray?.timeMs, 1_700_000_000_000);
	const fromData = parseFmpQuoteTick({data: [{symbol: 'BTCUSD', price: 42_000}]}, 99);
	assert.equal(fromData?.price, 42_000);
	assert.equal(fromData?.timeMs, 99);
});

test('extractLiveBindingFromFetchPayload does not treat klines as gmx candles', () => {
	const binding = extractLiveBindingFromFetchPayload({
		symbol: 'ETHUSDT',
		interval: '4h',
		klines: [{openTime: 1_700_000_000_000, open: '1', high: '1', low: '1', close: '1'}],
	});
	assert.ok(binding);
	assert.equal(binding!.providerId, CHART_LIVE_PROVIDER_BINANCE_TICKER);
	assert.notEqual(binding!.providerId, 'gmx.markPrice');
});

test('refreshChartFromLiveTick replays custom overlays via prepareReplay', () => {
	const initial = prepareChart({
		series: [
			{
				id: 'btc',
				type: 'candlestick',
				label: 'BTC',
				data: Array.from({length: 60}, (_, i) => ({
					time: 1_700_000_000 + i * 3600,
					open: 100 + i,
					high: 110 + i,
					low: 90 + i,
					close: 105 + i,
				})),
			},
		],
		overlays: [{type: 'macd', sourceSeriesId: 'btc'}],
	});
	assert.equal(initial.ok, true);
	if (!initial.ok) {
		return;
	}
	assert.ok(initial.data.prepareReplay?.overlays?.some(o => o.type === 'macd'));

	const refreshed = refreshChartFromLiveTick(
		initial.data.chart,
		{timeMs: (1_700_000_000 + 59 * 3600) * 1000 + 30_000, price: 200},
		{providerId: 'test', bucketSec: 3600, params: {}},
		initial.data.prepareReplay,
	);
	assert.ok(refreshed);
	assert.ok(refreshed!.chart.series.some(s => s.label.includes('MACD')));
});
