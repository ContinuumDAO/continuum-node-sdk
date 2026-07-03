import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	CHART_LIVE_PROVIDER_HYPERLIQUID_ALL_MIDS,
	extractLiveBindingFromFetchPayload,
	mergeLiveTickIntoBars,
} from '../dist/core/chart/live/index.js';

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

test('mergeLiveTickIntoBars appends at most one bar across a multi-period gap', () => {
	const bars = [
		{time: 1_700_000_000, open: 100, high: 105, low: 99, close: 102},
	];
	const twoPeriodsLaterMs = (1_700_000_000 + 7200) * 1000;
	const {bars: out, barRolledOver} = mergeLiveTickIntoBars(
		bars,
		{timeMs: twoPeriodsLaterMs, price: 110},
		{bucketSec: 3600},
	);
	assert.equal(barRolledOver, true);
	assert.equal(out.length, 2);
	assert.equal(out[1]!.time, 1_700_000_000 + 3600);
	assert.equal(out[1]!.open, 102);
	assert.equal(out[1]!.close, 110);
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

test('extractLiveBindingFromFetchPayload reads Hyperliquid ohlcv wrapper', () => {
	const binding = extractLiveBindingFromFetchPayload({
		ohlcv: {coin: 'ETH', interval: '1h', candles: []},
	});
	assert.ok(binding);
	assert.equal(binding!.providerId, CHART_LIVE_PROVIDER_HYPERLIQUID_ALL_MIDS);
	assert.equal(binding!.bucketSec, 3600);
	assert.equal(binding!.params.coin, 'ETH');
});

test('extractLiveBindingFromFetchPayload reads GMX flat candles shape', () => {
	const binding = extractLiveBindingFromFetchPayload({
		symbol: 'ETH/USD',
		timeframe: '15m',
		candles: [],
	});
	assert.ok(binding);
	assert.equal(binding!.providerId, 'gmx.markPrice');
	assert.equal(binding!.bucketSec, 900);
});
