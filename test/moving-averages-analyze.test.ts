import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveMovingAveragePeriods} from '../dist/core/chart/analysis/moving-averages-analyze-tools.js';
import {analyzeMovingAverages} from '../dist/core/chart/analysis/moving-averages-analyze-tools.js';

test('resolveMovingAveragePeriods rejects defaults when too few bars', () => {
	const resolved = resolveMovingAveragePeriods(181);
	assert.equal(resolved.ok, false);
	if (resolved.ok) {
		return;
	}
	assert.match(resolved.reason, /181 bar/);
	assert.match(resolved.reason, /slow period 200/);
	assert.match(resolved.reason, /OHLCV session is still bound/);
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

test('resolveMovingAveragePeriods accepts shorter explicit periods', () => {
	const resolved = resolveMovingAveragePeriods(181, 20, 50);
	assert.equal(resolved.ok, true);
	if (!resolved.ok) {
		return;
	}
	assert.equal(resolved.fastPeriod, 20);
	assert.equal(resolved.slowPeriod, 50);
});

test('analyzeMovingAverages accepts desk-prefixed periods', async () => {
	const rows: Record<string, unknown>[] = [];
	for (let i = 0; i < 220; i++) {
		const close = 100 + i * 0.1;
		rows.push({
			time: 1_700_000_000 + i * 14_400,
			open: close - 1,
			high: close + 2,
			low: close - 2,
			close,
		});
	}
	const result = await analyzeMovingAverages({
		rows,
		allowRowsOnly: true,
		maFastPeriod: 20,
		maSlowPeriod: 50,
		maType: 'ema',
		maFreshCrossoverMaxBars: 3,
	});
	assert.equal(result.ok, true, result.ok ? '' : result.reason);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.analysis.fastPeriod, 20);
	assert.equal(result.data.analysis.slowPeriod, 50);
	assert.equal(result.data.analysis.maType, 'ema');
});

test('analyzeMovingAverages rejects default periods on 181 synthetic bars', async () => {
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
	assert.equal(result.ok, false);
	if (result.ok) {
		return;
	}
	assert.match(result.reason, /181 bar/);
	assert.match(result.reason, /slow period 200/);
});
