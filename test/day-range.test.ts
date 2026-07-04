import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	computeDayHighLowFromBars,
	computeDayHighLowFromCandlestickSeries,
} from '../dist/core/chart/day-range.js';

test('computeDayHighLowFromBars uses UTC day of latest bar', () => {
	const dayStart = Math.floor(Date.UTC(2024, 0, 2) / 1000);
	const bars = [
		{time: dayStart, open: 100, high: 110, low: 95, close: 105},
		{time: dayStart + 3600, open: 105, high: 120, low: 100, close: 115},
		{time: dayStart + 7200, open: 115, high: 118, low: 90, close: 112},
	];
	const result = computeDayHighLowFromBars(bars);
	assert.ok(result);
	assert.equal(result!.dayHigh, 120);
	assert.equal(result!.dayLow, 90);
	assert.equal(result!.barCount, 3);
	assert.match(result!.dayLabelUtc, /2024-01-02 UTC$/);
});

test('computeDayHighLowFromBars ignores bars outside latest UTC day', () => {
	const dayStart = Math.floor(Date.UTC(2024, 0, 2) / 1000);
	const prevDay = dayStart - 3600;
	const bars = [
		{time: prevDay, open: 100, high: 200, low: 50, close: 105},
		{time: dayStart + 3600, open: 105, high: 120, low: 100, close: 115},
	];
	const result = computeDayHighLowFromBars(bars);
	assert.ok(result);
	assert.equal(result!.dayHigh, 120);
	assert.equal(result!.dayLow, 100);
	assert.equal(result!.barCount, 1);
});

test('computeDayHighLowFromCandlestickSeries reads primary candle series', () => {
	const dayStart = Math.floor(Date.UTC(2024, 0, 2) / 1000);
	const result = computeDayHighLowFromCandlestickSeries([
		{
			type: 'line',
			data: [{time: 1, value: 1}],
		},
		{
			type: 'candlestick',
			data: [
				{time: dayStart, open: 1, high: 5, low: 0.5, close: 2},
				{time: dayStart + 3600, open: 2, high: 6, low: 1, close: 3},
			],
		},
	]);
	assert.ok(result);
	assert.equal(result!.dayHigh, 6);
	assert.equal(result!.dayLow, 0.5);
});
