import assert from 'node:assert/strict';
import {test} from 'node:test';
import {downsampleSeriesRowsForDisplay} from '../dist/core/chart/display-downsample.js';

test('downsampleSeriesRowsForDisplay preserves first and last bar times for candles', () => {
	const rows = Array.from({length: 721}, (_, i) => ({
		time: 1_780_912_800 + i * 3600,
		open: 100 + i * 0.1,
		high: 101 + i * 0.1,
		low: 99 + i * 0.1,
		close: 100.5 + i * 0.1,
	}));
	const out = downsampleSeriesRowsForDisplay(rows, 400, 'candlestick');
	assert.equal(out.length, 400);
	assert.equal(out[0]!.time, rows[0]!.time);
	assert.equal(out.at(-1)!.time, rows.at(-1)!.time);
});
