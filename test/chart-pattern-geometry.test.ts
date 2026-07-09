import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	geometryToleranceForOhlcvSummary,
	rejectGeometryOutsideOhlcvSummary,
} from '../dist/core/chart/ohlcv-integrity.js';
import {ohlcvSummaryWithLiveMark} from '../dist/core/chart/chart-ohlcv-summary.js';

test('geometryToleranceForOhlcvSummary allows smoothed swing / live mark within 2%', () => {
	const summary = {
		barCount: 60,
		timeStartSec: 1_700_000_000,
		timeEndSec: 1_700_864_000,
		low: 1700,
		high: 1831.24,
		lastClose: 1830,
	};
	const tol = geometryToleranceForOhlcvSummary(summary);
	assert.ok(tol >= 36.6);
	const result = rejectGeometryOutsideOhlcvSummary(summary, [1840.86]);
	assert.equal(result.ok, true);
});

test('ohlcvSummaryWithLiveMark expands high for forming-bar live quotes', () => {
	const summary = {
		barCount: 1,
		timeStartSec: 1,
		timeEndSec: 2,
		low: 1800,
		high: 1831.24,
		lastClose: 1830,
	};
	const expanded = ohlcvSummaryWithLiveMark(summary, 1840.86);
	assert.equal(expanded.high, 1840.86);
});
