import assert from 'node:assert/strict';
import test from 'node:test';
import {extractOhlcvBarsFromUnknown} from '../dist/core/chart/fetch-result.js';
import {normalizeKlineCandleTuple, normalizeKlineCandles} from '../dist/core/coinmarketcap/kline.js';
import {getGlobalMetricsLatest, getKlineCandles, getCryptoOhlcvHistorical} from '../dist/core/coinmarketcap/public-api.js';

test('normalizeKlineCandleTuple maps CMC k-line tuple to chart row', () => {
	const candle = normalizeKlineCandleTuple([
		3780.75,
		3798.47,
		3760.24,
		3762.48,
		3199707.73,
		1_753_750_800_000,
		null,
	]);
	assert.deepEqual(candle, {
		time: 1_753_750_800,
		open: 3780.75,
		high: 3798.47,
		low: 3760.24,
		close: 3762.48,
		volume: 3199707.73,
	});
});

test('normalizeKlineCandles skips invalid tuples', () => {
	assert.deepEqual(normalizeKlineCandles([['bad'], null, []]), []);
});

test('extractOhlcvBarsFromUnknown reads coinmarketcap-public get_kline_candles shape', () => {
	const extracted = extractOhlcvBarsFromUnknown({
		platform: 'ethereum',
		address: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
		interval: '1h',
		candles: [
			{time: 1_753_750_800, open: 100, high: 110, low: 90, close: 105, volume: 1000},
		],
	});
	assert.equal(extracted?.length, 1);
});

test('getKlineCandles validates input', async () => {
	const result = await getKlineCandles({});
	assert.equal(result.ok, false);
});

test('getCryptoOhlcvHistorical validates input', async () => {
	const result = await getCryptoOhlcvHistorical({});
	assert.equal(result.ok, false);
});

test('getCryptoOhlcvHistorical requires COINMARKETCAP_API_KEY', async () => {
	const prior = process.env.COINMARKETCAP_API_KEY;
	delete process.env.COINMARKETCAP_API_KEY;
	try {
		const result = await getCryptoOhlcvHistorical({id: '1027'});
		assert.equal(result.ok, false);
		if (!result.ok) {
			assert.match(result.reason, /COINMARKETCAP_API_KEY/);
		}
	} finally {
		if (prior != null) {
			process.env.COINMARKETCAP_API_KEY = prior;
		}
	}
});

test('getGlobalMetricsLatest accepts empty input with USD default', async () => {
	const result = await getGlobalMetricsLatest({});
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.ok(result.data && typeof result.data === 'object');
	}
});
