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

test('downsampleSeriesRowsForDisplay band uses last-in-bucket like lines', () => {
	const rows = Array.from({length: 10}, (_, i) => ({
		time: 1_000 + i,
		upper: 100 + i,
		lower: 50 + i,
		value: 100 + i,
	}));
	const band = downsampleSeriesRowsForDisplay(rows, 2, 'band');
	const line = downsampleSeriesRowsForDisplay(rows, 2, 'line');
	assert.equal(band.length, 2);
	assert.equal(line.length, 2);
	// Bucket 0: indices 0..4 → last upper/lower 104 / 54; time first = 1000
	assert.equal(band[0]!.time, 1_000);
	assert.equal(band[0]!.upper, 104);
	assert.equal(band[0]!.lower, 54);
	assert.equal(line[0]!.value, 104);
	// Bucket 1: indices 5..9 → last 109 / 59
	assert.equal(band[1]!.upper, 109);
	assert.equal(band[1]!.lower, 59);
	assert.equal(line[1]!.value, 109);
});
