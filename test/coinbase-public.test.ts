import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	normalizeCoinbaseCandle,
	normalizeCoinbaseCandles,
	resolveCoinbaseGranularity,
	COINBASE_DATA_SOURCE,
} from '../dist/core/coinbase/index.js';
import {extractChartMetadataFromFetchPayload} from '../dist/core/chart/fetch-metadata.js';
import {extractLiveBindingFromFetchPayload} from '../dist/core/chart/live/binding-extract.js';
import {CHART_LIVE_PROVIDER_COINBASE_PRODUCT_TICKER} from '../dist/core/chart/live/schemas.js';
import {prepareChart} from '../dist/core/chart/prepare.js';
import {normalizeCandleRow} from '../dist/core/chart/point-normalize.js';
import {
	chartDataSourceShortCodeFromFetchPayload,
	chartDataSourceShortCodeFromFetchToolName,
} from '../dist/core/chart/analysis/trade-setups/chart-data-purpose.js';
import {
	ingestDepthSnapshot,
	normalizeCoinbaseProductBook,
	resetDepthSamplersForTests,
	resolveDepthSymbol,
	inferDepthExchangeId,
	buildLiquidityDepthLevelMenu,
	getAveragedDepthProfile,
} from '../dist/core/chart/depth/index.js';
import {analyzeLiquidityDepth} from '../dist/core/chart/analysis/liquidity-depth-analyze-tools.js';

const sampleBars = Array.from({length: 20}, (_, i) => ({
	time: 1_700_000_000 + i * 3600,
	open: 100 + i,
	high: 101 + i,
	low: 99 + i,
	close: 100.5 + i,
	volume: 1 + i * 0.1,
}));

test('normalizeCoinbaseCandle maps start strings to Continuum time/OHLC numbers', () => {
	const candle = normalizeCoinbaseCandle({
		start: '1700000000',
		open: '42000.1',
		high: '42100',
		low: '41900',
		close: '42050.5',
		volume: '12.3',
	});
	assert.ok(candle);
	assert.equal(candle!.time, 1_700_000_000);
	assert.equal(candle!.open, 42000.1);
	assert.equal(candle!.volume, 12.3);
	assert.ok(normalizeCandleRow(candle!) != null);
});

test('normalizeCoinbaseCandles sorts ascending and drops invalid rows', () => {
	const candles = normalizeCoinbaseCandles({
		candles: [
			{start: '1700003600', open: '2', high: '2', low: '2', close: '2'},
			{start: '1700000000', open: '1', high: '1', low: '1', close: '1'},
			{start: 'bad', open: '1', high: '1', low: '1', close: '1'},
		],
	});
	assert.equal(candles.length, 2);
	assert.equal(candles[0]!.time, 1_700_000_000);
	assert.equal(candles[1]!.time, 1_700_003_600);
});

test('resolveCoinbaseGranularity maps interval labels', () => {
	assert.equal(resolveCoinbaseGranularity({interval: '1h'}), 'ONE_HOUR');
	assert.equal(resolveCoinbaseGranularity({interval: '4H'}), 'FOUR_HOUR');
	assert.equal(resolveCoinbaseGranularity({granularity: 'ONE_DAY'}), 'ONE_DAY');
});

test('fetch metadata and live binding from coinbase_candles envelope', () => {
	const toolResult = {
		dataSource: COINBASE_DATA_SOURCE,
		productId: 'BTC-USD',
		interval: '1H',
		candles: sampleBars,
		count: sampleBars.length,
	};
	const meta = extractChartMetadataFromFetchPayload(toolResult);
	assert.equal(meta.label, 'BTC-USD');
	assert.match(meta.title ?? '', /BTC-USD/);
	const live = extractLiveBindingFromFetchPayload(toolResult);
	assert.ok(live);
	assert.equal(live!.providerId, CHART_LIVE_PROVIDER_COINBASE_PRODUCT_TICKER);
	assert.equal(live!.params.productId, 'BTC-USD');
});

test('chart data purpose short codes cb and bn', () => {
	assert.equal(
		chartDataSourceShortCodeFromFetchToolName('coinbase-public__get_product_candles'),
		'cb',
	);
	assert.equal(chartDataSourceShortCodeFromFetchToolName('binance__binance_get_klines'), 'bn');
	assert.equal(
		chartDataSourceShortCodeFromFetchPayload({
			dataSource: 'coinbase_candles',
			productId: 'ETH-USD',
			candles: sampleBars,
		}),
		'cb',
	);
	assert.equal(
		chartDataSourceShortCodeFromFetchPayload({
			symbol: 'BTCUSDT',
			interval: '1h',
			klines: [{openTime: 1}],
		}),
		'bn',
	);
});

test('prepareChart accepts coinbase_candles toolResult shape via bars', () => {
	const prepared = prepareChart({
		title: 'BTC-USD 1H',
		bars: sampleBars,
		options: {skipDefaultOverlays: true},
	});
	assert.equal(prepared.ok, true);
});

test('Coinbase depth normalize + symbol resolution keep hyphens', () => {
	resetDepthSamplersForTests();
	const raw = {
		pricebook: {
			product_id: 'BTC-USD',
			bids: [{price: '100.00', size: '5'}],
			asks: [{price: '100.10', size: '2'}],
			time: '2026-07-31T16:47:23.695462Z',
		},
		mid_market: '100.05',
	};
	const snap = normalizeCoinbaseProductBook(raw, {});
	assert.ok(snap);
	assert.equal(snap!.exchangeId, 'coinbase');
	assert.equal(snap!.symbol, 'BTC-USD');
	assert.equal(snap!.mid, 100.05);

	const toolResult = {
		dataSource: COINBASE_DATA_SOURCE,
		productId: 'ETH-USD',
		candles: sampleBars,
	};
	assert.equal(inferDepthExchangeId(toolResult), 'coinbase');
	assert.equal(
		resolveDepthSymbol({toolResult, exchangeId: 'coinbase'}),
		'ETH-USD',
	);
});

test('analyzeLiquidityDepth prefers coinbase fetch over depthExchangeId binance default', async () => {
	resetDepthSamplersForTests();
	const now = Date.now();
	for (let i = 0; i < 6; i++) {
		const snap = normalizeCoinbaseProductBook(
			{
				pricebook: {
					product_id: 'BTC-USD',
					bids: [
						['100.00', '5'],
						['99.50', '40'],
					],
					asks: [
						['100.10', '3'],
						['100.80', '25'],
					],
				},
				mid_market: '100.05',
			},
			{symbol: 'BTC-USD', asOfMs: now - (5 - i) * 12_000},
		);
		assert.ok(snap);
		ingestDepthSnapshot({exchangeId: 'coinbase', symbol: 'BTC-USD'}, snap!);
	}
	const result = await analyzeLiquidityDepth({
		title: 'BTC-USD 1H',
		toolResult: {
			dataSource: COINBASE_DATA_SOURCE,
			productId: 'BTC-USD',
			interval: '1H',
			candles: sampleBars,
			count: sampleBars.length,
		},
		// Trade-desk yaml injects binance — fetch venue must win.
		depthExchangeId: 'binance',
		mergeLive: false,
		skipSampler: true,
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.data.analysis.exchangeId, 'coinbase');
	assert.equal(result.data.analysis.symbol, 'BTC-USD');
	resetDepthSamplersForTests();
});

test('analyzeLiquidityDepth works for coinbase with ingested snapshots', async () => {
	resetDepthSamplersForTests();
	const now = Date.now();
	for (let i = 0; i < 6; i++) {
		const snap = normalizeCoinbaseProductBook(
			{
				pricebook: {
					product_id: 'BTC-USD',
					bids: [
						['100.00', '5'],
						['99.50', '40'],
					],
					asks: [
						['100.10', '3'],
						['100.80', '25'],
					],
				},
				mid_market: '100.05',
			},
			{symbol: 'BTC-USD', asOfMs: now - (5 - i) * 12_000},
		);
		assert.ok(snap);
		ingestDepthSnapshot({exchangeId: 'coinbase', symbol: 'BTC-USD'}, snap!);
	}
	const result = await analyzeLiquidityDepth({
		title: 'BTC-USD 1H',
		rows: sampleBars,
		symbol: 'BTC-USD',
		depthExchangeId: 'coinbase',
		allowRowsOnly: true,
		mergeLive: false,
		skipSampler: true,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.analysis.exchangeId, 'coinbase');
	assert.equal(result.data.analysis.symbol, 'BTC-USD');
	assert.ok(result.data.analysis.levelMenu.length > 0);
	const profile = getAveragedDepthProfile({exchangeId: 'coinbase', symbol: 'BTC-USD'});
	assert.ok(profile);
	assert.ok(buildLiquidityDepthLevelMenu(profile!).length > 0);
	resetDepthSamplersForTests();
});
