import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	geometryToleranceForOhlcvSummary,
	rejectGeometryOutsideOhlcvSummary,
} from '../dist/core/chart/ohlcv-integrity.js';
import {ohlcvSummaryWithLiveMark} from '../dist/core/chart/chart-ohlcv-summary.js';
import {patternDetectionPriceBounds} from '../dist/core/chart-patterns/smoothing.js';

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

test('expanded detection bounds pass geometry for swing above raw OHLCV high', () => {
	const summary = {
		barCount: 181,
		timeStartSec: 1_700_000_000,
		timeEndSec: 1_700_864_000,
		low: 1511,
		high: 1955.9,
		lastClose: 1941.6,
	};
	const swingPrice = 2006.6;
	const strict = rejectGeometryOutsideOhlcvSummary(summary, [swingPrice]);
	assert.equal(strict.ok, false);

	const expanded = {...summary, high: Math.max(summary.high, swingPrice)};
	const relaxed = rejectGeometryOutsideOhlcvSummary(expanded, [swingPrice]);
	assert.equal(relaxed.ok, true);
});

test('patternDetectionPriceBounds returns smoothed envelope for H&S scan', () => {
	const rows: Record<string, unknown>[] = [];
	for (let i = 0; i < 40; i++) {
		const close = 1900 + Math.sin(i / 6) * 15;
		rows.push({
			time: 1_700_000_000 + i * 14_400,
			open: close - 1,
			high: close + 3,
			low: close - 3,
			close,
		});
	}
	const bounds = patternDetectionPriceBounds(rows);
	assert.ok(bounds);
	assert.ok(Number.isFinite(bounds!.high));
	assert.ok(Number.isFinite(bounds!.low));
});
