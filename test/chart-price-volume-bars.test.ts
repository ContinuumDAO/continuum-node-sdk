import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildOhlcvBarsFromPriceVolumeSeries} from '../dist/core/chart/price-volume-bars.js';

test('buildOhlcvBarsFromPriceVolumeSeries builds hourly bars with volume', () => {
	const prices = [
		[1_000_000, 100],
		[3_600_000, 110],
		[7_200_000, 105],
	];
	const volumes = [
		[1_000_000, 1000],
		[3_600_000, 1500],
		[7_200_000, 1200],
	];
	const bars = buildOhlcvBarsFromPriceVolumeSeries(prices, volumes);
	assert.equal(bars.length, 3);
	assert.equal(bars[0]!.volume, 1000);
	assert.equal(bars[1]!.open, 100);
	assert.equal(bars[1]!.close, 110);
});

test('buildOhlcvBarsFromPriceVolumeSeries buckets to 4h', () => {
	const t0 = 14_400;
	const prices = [
		[t0, 10],
		[t0 + 3600, 12],
		[t0 + 7200, 11],
		[t0 + 14_400, 13],
	];
	const volumes = [
		[t0, 1],
		[t0 + 3600, 2],
		[t0 + 7200, 3],
		[t0 + 14_400, 4],
	];
	const bars = buildOhlcvBarsFromPriceVolumeSeries(prices, volumes, {
		bucketSec: 4 * 3600,
	});
	assert.equal(bars.length, 2);
	assert.equal(bars[0]!.volume, 6);
	assert.equal(bars[1]!.volume, 4);
});
