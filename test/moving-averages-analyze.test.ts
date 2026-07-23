import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveMovingAveragePeriods} from '../dist/core/chart/analysis/moving-averages-analyze-tools.js';
import {analyzeMovingAverages} from '../dist/core/chart/analysis/moving-averages-analyze-tools.js';

test('resolveMovingAveragePeriods auto-fits defaults for 181 bars', () => {
	const resolved = resolveMovingAveragePeriods(181);
	assert.equal(resolved.ok, true);
	if (!resolved.ok) {
		return;
	}
	assert.equal(resolved.slowPeriod, 180);
	assert.equal(resolved.fastPeriod, 50);
	assert.equal(resolved.adapted, true);
});

test('resolveMovingAveragePeriods keeps explicit slowPeriod error when too few bars', () => {
	const resolved = resolveMovingAveragePeriods(181, undefined, 200);
	assert.equal(resolved.ok, false);
	if (resolved.ok) {
		return;
	}
	assert.match(resolved.reason, /181 bar/);
	assert.match(resolved.reason, /OHLCV session is still bound/);
});

test('analyzeMovingAverages succeeds on 181 synthetic bars with default periods', async () => {
	const rows: Record<string, unknown>[] = [];
	for (let i = 0; i < 181; i++) {
		const close = 1900 + Math.sin(i / 8) * 20 + i * 0.05;
		rows.push({
			time: 1_700_000_000 + i * 14_400,
			open: close - 2,
			high: close + 5,
			low: close - 5,
			close,
		});
	}
	const result = await analyzeMovingAverages({rows, allowRowsOnly: true});
	assert.equal(result.ok, true, result.ok ? '' : result.reason);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.analysis.slowPeriod, 180);
	assert.match(result.data.analysis.interpretation, /auto-fitted/i);
});
