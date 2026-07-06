import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PrepareChartOutputSchema} from '../dist/core/chart/schemas.js';

test('PrepareChartOutputSchema accepts integrity meta on chart responses', () => {
	const parsed = PrepareChartOutputSchema.safeParse({
		kind: 'continuum/chart/v1',
		chart: {
			series: [
				{
					id: 'candles',
					type: 'candlestick',
					label: 'ETH',
					data: [{time: 1, open: 1, high: 2, low: 0.5, close: 1.5}],
				},
			],
		},
		meta: {
			dataPolicy: 'test',
			fetchContext: {interval: '1h', lookbackDays: 7, intervalSec: 3600, lookbackHours: null, lookbackLabel: '7d', coin: 'ETH', declaredBarCount: 169, windowExpectedBarCount: 168, expectedBarCount: 168},
			windowExpectation: {
				interval: '1h',
				intervalSec: 3600,
				lookbackLabel: '7d',
				expectedBarCount: 168,
				minBarCount: null,
				sources: ['title'],
			},
			ohlcvFingerprint: {
				version: 1,
				barCount: 169,
				timeStartSec: 100,
				timeEndSec: 200,
				low: 1,
				high: 2,
				lastClose: 1.5,
				digest: 'abc123',
			},
			loadStatus: {
				dataComplete: true,
				liveReady: false,
				barCount: 169,
				displayBarCount: 169,
				liveBindingAttached: false,
				liveBindingExpected: false,
				dataIssues: [],
				liveIssues: [],
				issues: [],
			},
		},
	});
	assert.equal(parsed.success, true, parsed.success ? '' : parsed.error.message);
});
