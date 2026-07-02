import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ohlcvToPrepareChartInput} from '../dist/core/chart/ohlcv.js';
import {prepareChart} from '../dist/core/chart/prepare.js';

test('ohlcvToPrepareChartInput maps rows to candlestick series', () => {
	const input = ohlcvToPrepareChartInput(
		[
			{timeMs: 1_700_000_000_000, open: 100, high: 110, low: 90, close: 105},
			{timeSec: 1_700_086_400, open: 105, high: 115, low: 100, close: 110, volume: 42},
		],
		{title: 'BTC', label: 'BTC-USD', height: 200},
	);

	assert.equal(input.title, 'BTC');
	assert.equal(input.height, 200);
	assert.equal(input.series.length, 2);
	assert.equal(input.series[0]!.type, 'candlestick');
	assert.equal(input.series[0]!.label, 'BTC-USD');
	assert.equal(input.series[1]!.type, 'histogram');

	const result = prepareChart(input);
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.chart.series[0]!.data.length, 2);
});
