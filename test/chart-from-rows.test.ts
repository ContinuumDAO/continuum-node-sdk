import assert from 'node:assert/strict';
import {test} from 'node:test';
import {extractOhlcvBarsFromUnknown} from '../dist/core/chart/fetch-result.js';
import {prepareChartFromRows} from '../dist/core/chart/prepare-from-rows.js';
import {PrepareChartFromRowsInputSchema} from '../dist/core/chart/prepare-from-rows.js';

const bars = [
	{time: 1_700_000_000, open: 100, high: 110, low: 90, close: 105, volume: 1000},
	{time: 1_700_014_400, open: 105, high: 115, low: 100, close: 110, volume: 900},
];

test('extractOhlcvBarsFromUnknown reads nested result arrays', () => {
	const extracted = extractOhlcvBarsFromUnknown({result: bars});
	assert.deepEqual(extracted, bars);
});

test('extractOhlcvBarsFromUnknown reads hyperliquid-style list key', () => {
	const extracted = extractOhlcvBarsFromUnknown({list: bars});
	assert.deepEqual(extracted, bars);
});

test('prepareChartFromRows accepts rows directly', () => {
	const result = prepareChartFromRows({
		title: 'ETH/USD 4H',
		rows: bars,
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.ok(result.data.chart.panes?.some(p => p.id === 'volume'));
});

test('prepareChartFromRows accepts toolResult wrapper', () => {
	const result = prepareChartFromRows({
		title: 'ETH/USD 4H',
		toolResult: {result: bars},
	});
	assert.equal(result.ok, true);
});

test('PrepareChartFromRowsInputSchema rejects empty input', () => {
	const parsed = PrepareChartFromRowsInputSchema.safeParse({});
	assert.equal(parsed.success, false);
});
