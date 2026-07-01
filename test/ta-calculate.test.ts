import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	calculateTechnicalIndicator,
	listTechnicalIndicators,
} from '../dist/core/ta/calculate.js';
import {resolveIndicatorId, suggestIndicator} from '../dist/core/ta/catalog.js';
import {normalizeInput} from '../dist/core/ta/normalize-input.js';

test('listTechnicalIndicators returns catalog entries', () => {
	const result = listTechnicalIndicators();
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.ok(result.data.indicators.length > 50);
	const sma = result.data.indicators.find(i => i.id === 'sma');
	assert.ok(sma);
	assert.equal(sma!.inputProfile, 'close_series');
});

test('normalizeInput derives OHLC from candles', () => {
	const normalized = normalizeInput('sma', 'close_series', {
		candles: [
			{open: 1, high: 2, low: 0.5, close: 1.5},
			{open: 1.5, high: 2.5, low: 1, close: 2},
		],
	});
	assert.deepEqual(normalized.values, [1.5, 2]);
	assert.equal(normalized.inputLength, 2);
});

test('SMA on small series with trimWarmup', () => {
	const result = calculateTechnicalIndicator({
		indicator: 'sma',
		params: {period: 3},
		input: {values: [1, 2, 3, 4, 5]},
		options: {trimWarmup: true, maxPoints: 100},
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.indicator, 'sma');
	assert.equal(result.data.warmupCount, 2);
	assert.deepEqual(result.data.result, [2, 3, 4]);
});

test('RSI returns numeric series', () => {
	const values = [
		44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89,
		46.03, 46.83, 46.69, 46.49, 46.26, 47.09, 46.66, 47.02, 46.62,
	];
	const result = calculateTechnicalIndicator({
		indicator: 'rsi',
		params: {period: 14},
		input: {values},
		options: {maxPoints: 100},
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const nums = result.data.result as number[];
	assert.ok(nums.some(v => typeof v === 'number' && !Number.isNaN(v)));
});

test('stochastic rejects mismatched array lengths', () => {
	const result = calculateTechnicalIndicator({
		indicator: 'stochastic',
		input: {
			high: [1, 2, 3],
			low: [1, 2],
			close: [1, 2, 3],
		},
	});
	assert.equal(result.ok, false);
	if (result.ok) {
		return;
	}
	assert.match(result.reason, /length mismatch/i);
});

test('ichimokucloud alias resolves to ichimokukinkouhyou', () => {
	assert.equal(resolveIndicatorId('ichimokucloud'), 'ichimokukinkouhyou');
	const result = calculateTechnicalIndicator({
		indicator: 'ichimokucloud',
		input: {
			high: [48, 49, 50, 51, 52, 53, 54, 55, 56, 57],
			low: [47, 48, 49, 50, 51, 52, 53, 54, 55, 56],
			close: [47.5, 48.5, 49.5, 50.5, 51.5, 52.5, 53.5, 54.5, 55.5, 56.5],
		},
		options: {maxPoints: 10},
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.indicator, 'ichimokukinkouhyou');
});

test('unknown indicator suggests close match', () => {
	const suggestion = suggestIndicator('stoch');
	assert.equal(suggestion, 'stochastic');
	const result = calculateTechnicalIndicator({
		indicator: 'not_an_indicator',
		input: {values: [1, 2, 3]},
	});
	assert.equal(result.ok, false);
	if (result.ok) {
		return;
	}
	assert.match(result.reason, /Unknown indicator/i);
});

test('fibonacci retracement returns levels', () => {
	const result = calculateTechnicalIndicator({
		indicator: 'fibonacciretracement',
		input: {range: {high: 100, low: 80, trend: 'up'}},
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.indicator, 'fibonacci');
	const levels = result.data.result as Array<Record<string, unknown>>;
	assert.ok(levels.length > 0);
	assert.ok('level' in levels[0]!);
});
