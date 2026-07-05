import assert from 'node:assert/strict';
import test from 'node:test';
import {
	resolveKlineQueryWindow,
	trimKlineCandlesToWindow,
} from '../dist/core/coinmarketcap/kline-window.js';

const NOW = 1_780_000_000;

test('resolveKlineQueryWindow defaults to recent window from limit', () => {
	const window = resolveKlineQueryWindow({
		interval: '1h',
		limit: 168,
		nowSec: NOW,
	});
	assert.equal(window.to, NOW);
	assert.equal(window.from, NOW - 168 * 3600);
	assert.equal(window.limit, 168);
});

test('resolveKlineQueryWindow maps lookbackDays to bar count', () => {
	const window = resolveKlineQueryWindow({
		interval: '1h',
		lookbackDays: 7,
		nowSec: NOW,
	});
	assert.equal(window.limit, 168);
	assert.equal(window.lookbackDays, 7);
	assert.equal(window.to, NOW);
});

test('trimKlineCandlesToWindow keeps newest bars in window', () => {
	const window = resolveKlineQueryWindow({
		interval: '1h',
		limit: 3,
		nowSec: NOW,
	});
	const candles = trimKlineCandlesToWindow(
		[
			{time: NOW - 10_000, open: 1, high: 1, low: 1, close: 1},
			{time: NOW - 7200, open: 2, high: 2, low: 2, close: 2},
			{time: NOW - 3600, open: 3, high: 3, low: 3, close: 3},
			{time: NOW - 1800, open: 4, high: 4, low: 4, close: 4},
		],
		window,
	);
	assert.deepEqual(
		candles.map(c => c.time),
		[NOW - 7200, NOW - 3600, NOW - 1800],
	);
});

test('trimKlineCandlesToWindow drops stale bars outside window', () => {
	const window = resolveKlineQueryWindow({
		interval: '1h',
		lookbackDays: 7,
		nowSec: NOW,
	});
	const candles = trimKlineCandlesToWindow(
		[
			{time: 1_753_149_600, open: 1, high: 1, low: 1, close: 1},
			{time: NOW - 3600, open: 2, high: 2, low: 2, close: 2},
		],
		window,
	);
	assert.equal(candles.length, 1);
	assert.equal(candles[0]!.time, NOW - 3600);
});
