import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	assessChartOhlcvLoad,
	chartLoadAgentWarnings,
	parseLookbackDaysFromChartTitle,
} from '../dist/core/chart/chart-ohlcv-load-status.js';
import {prepareChartFromRows} from '../dist/core/chart/prepare-from-rows.js';

function ohlcvCandle(timestampMs: number, close: string) {
	return {
		timestampMs,
		open: close,
		high: close,
		low: close,
		close,
		volume: '100',
	};
}

test('parseLookbackDaysFromChartTitle reads common patterns', () => {
	assert.equal(parseLookbackDaysFromChartTitle('ETH-PERP 1H — last 7d'), 7);
	assert.equal(parseLookbackDaysFromChartTitle('BTC 4h last 14 days'), 14);
	assert.equal(parseLookbackDaysFromChartTitle('SOL spot price'), null);
});

test('assessChartOhlcvLoad flags bar count mismatch in dataIssues only', () => {
	const startMs = 1_782_658_800_000;
	const candles = Array.from({length: 100}, (_, i) =>
		ohlcvCandle(startMs + i * 3_600_000, '1700'),
	);
	const toolResult = {
		ohlcv: {
			coin: 'ETH',
			interval: '1h',
			startTimeMs: startMs,
			endTimeMs: startMs + 168 * 3_600_000,
			expectedBars: 168,
			candleCount: 168,
			candles,
		},
	};
	const status = assessChartOhlcvLoad({
		bars: candles,
		toolResult,
		live: {providerId: 'hyperliquid.allMids', bucketSec: 3600, params: {coin: 'ETH'}},
	});
	assert.equal(status.dataComplete, false);
	assert.equal(status.liveReady, false);
	assert.ok(status.dataIssues.some(i => /Incomplete OHLCV/i.test(i)));
	assert.ok(status.dataIssues.some(i => /Never shorten OHLCV/i.test(i)));
});

test('assessChartOhlcvLoad flags title lookback vs short data span', () => {
	const startMs = 1_782_658_800_000;
	const candles = Array.from({length: 73}, (_, i) =>
		ohlcvCandle(startMs + i * 3_600_000, '1700'),
	);
	const endMs = startMs + 72 * 3_600_000;
	const toolResult = {
		ohlcv: {
			coin: 'ETH',
			interval: '1h',
			lookbackDays: 3,
			startTimeMs: startMs,
			endTimeMs: endMs,
			expectedBars: 73,
			candleCount: 73,
			candles,
		},
	};
	const status = assessChartOhlcvLoad({
		bars: candles,
		toolResult,
		title: 'ETH-PERP 1H — last 7d',
	});
	assert.equal(status.requestedLookbackDaysFromTitle, 7);
	assert.ok(status.actualSpanDays != null && status.actualSpanDays < 4);
	assert.equal(status.dataComplete, false);
	assert.ok(status.dataIssues.some(i => /Chart title requests ~7 day/i.test(i)));
	assert.ok(status.dataIssues.some(i => /Never shorten OHLCV/i.test(i)));
});

test('assessChartOhlcvLoad flags timestamp gaps as data issue', () => {
	const startSec = 1_782_658_800;
	const bars = [
		{timestampMs: startSec * 1000, open: '1', high: '1', low: '1', close: '1', volume: '1'},
		{timestampMs: (startSec + 3600) * 1000, open: '1', high: '1', low: '1', close: '1', volume: '1'},
		{timestampMs: (startSec + 7200) * 1000, open: '1', high: '1', low: '1', close: '1', volume: '1'},
		{timestampMs: (startSec + 14_400) * 1000, open: '1', high: '1', low: '1', close: '1', volume: '1'},
	];
	const status = assessChartOhlcvLoad({
		bars,
		toolResult: {ohlcv: {coin: 'ETH', interval: '1h', candles: bars}},
		live: {providerId: 'hyperliquid.allMids', bucketSec: 3600, params: {coin: 'ETH'}},
	});
	assert.equal(status.hasTimestampGaps, true);
	assert.equal(status.liveReady, false);
	assert.ok(status.dataIssues.some(i => /gaps detected/i.test(i)));
});

test('chartLoadAgentWarnings prompts reload for incomplete data without live binding', () => {
	const warnings = chartLoadAgentWarnings({
		dataComplete: false,
		liveReady: false,
		barCount: 50,
		expectedBarCount: 168,
		windowExpectedBarCount: 168,
		requestedLookbackDaysFromTitle: 7,
		actualSpanDays: 2.1,
		skippedBarCount: 0,
		hasTimestampGaps: false,
		liveBindingAttached: false,
		liveBindingExpected: false,
		dataIssues: ['Incomplete OHLCV: charted 50 bars but ~168 expected for the fetch window.'],
		liveIssues: [],
		issues: ['Incomplete OHLCV: charted 50 bars but ~168 expected for the fetch window.'],
	});
	assert.ok(warnings.some(w => /did not fully load/i.test(w)));
	assert.ok(warnings.some(w => /switch to another data source/i.test(w)));
});

test('chartLoadAgentWarnings prompts live guidance when binding attached', () => {
	const warnings = chartLoadAgentWarnings({
		dataComplete: true,
		liveReady: true,
		barCount: 168,
		expectedBarCount: 168,
		windowExpectedBarCount: 168,
		requestedLookbackDaysFromTitle: 7,
		actualSpanDays: 7,
		skippedBarCount: 0,
		hasTimestampGaps: false,
		liveBindingAttached: true,
		liveBindingExpected: true,
		dataIssues: [],
		liveIssues: [],
		issues: [],
	});
	assert.ok(warnings.some(w => /Do not tell the operator live updates are active/i.test(w)));
});

test('prepareChartFromRows warns when title says 7d but data is 3 days', () => {
	const startMs = 1_782_658_800_000;
	const candles = Array.from({length: 73}, (_, i) =>
		ohlcvCandle(startMs + i * 3_600_000, String(1700 + i)),
	);
	const result = prepareChartFromRows({
		title: 'ETH-PERP 1H — last 7d',
		toolResult: {
			ohlcv: {
				coin: 'ETH',
				interval: '1h',
				lookbackDays: 3,
				startTimeMs: startMs,
				endTimeMs: startMs + 72 * 3_600_000,
				expectedBars: 73,
				candleCount: 73,
				candles,
			},
		},
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.meta?.loadStatus?.dataComplete, false);
	assert.ok(result.data.meta?.warnings?.some(w => /Chart title requests ~7 day/i.test(w)));
	assert.ok(result.data.meta?.warnings?.some(w => /Never shorten OHLCV/i.test(w)));
});

test('prepareChartFromRows passes when title and data both cover 7 days', () => {
	const startMs = 1_782_658_800_000;
	const candles = Array.from({length: 168}, (_, i) =>
		ohlcvCandle(startMs + i * 3_600_000, String(1700 + i)),
	);
	const result = prepareChartFromRows({
		title: 'ETH-PERP 1H — last 7d',
		toolResult: {
			ohlcv: {
				coin: 'ETH',
				interval: '1h',
				lookbackDays: 7,
				startTimeMs: startMs,
				endTimeMs: startMs + 167 * 3_600_000,
				expectedBars: 168,
				candleCount: 168,
				candles,
			},
		},
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.meta?.loadStatus?.dataComplete, true);
	assert.equal(result.data.meta?.loadStatus?.requestedLookbackDaysFromTitle, 7);
});
