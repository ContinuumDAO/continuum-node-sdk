import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareOhlcvBarsForAnalysis, shouldMergeLiveForAnalysis} from '../dist/core/chart/analysis/ohlcv-live-merge.js';

function hyperliquidBars(lastClose: number, lastTimeSec: number) {
	return [
		{
			timestampMs: (lastTimeSec - 3600) * 1000,
			open: '100',
			high: '101',
			low: '99',
			close: '100',
			volume: '1',
		},
		{
			timestampMs: lastTimeSec * 1000,
			open: String(lastClose),
			high: String(lastClose + 1),
			low: String(lastClose - 1),
			close: String(lastClose),
			volume: '1',
		},
	];
}

const toolResult = {
	ohlcv: {
		coin: 'ETH',
		interval: '1h',
		startTimeMs: Date.now() - 7 * 86_400_000,
		endTimeMs: Date.now(),
		candles: [],
	},
};

test('shouldMergeLiveForAnalysis skips historical endTimeMs', () => {
	const bars = hyperliquidBars(1700, Math.floor(Date.now() / 1000) - 3600);
	const historical = {
		ohlcv: {
			...toolResult.ohlcv,
			endTimeMs: Date.now() - 7 * 86_400_000,
		},
	};
	const decision = shouldMergeLiveForAnalysis(bars, historical, undefined);
	assert.equal(decision.merge, false);
	assert.match(decision.skippedReason ?? '', /historical/i);
});

test('shouldMergeLiveForAnalysis skips when mergeLive is false', () => {
	const bars = hyperliquidBars(1700, Math.floor(Date.now() / 1000));
	const decision = shouldMergeLiveForAnalysis(bars, toolResult, false);
	assert.equal(decision.merge, false);
});

test('prepareOhlcvBarsForAnalysis merges provided liveTick into last bar', async () => {
	const lastTimeSec = Math.floor(Date.now() / 1000 / 3600) * 3600;
	const bars = hyperliquidBars(1700, lastTimeSec);
	const result = await prepareOhlcvBarsForAnalysis({
		toolResult: {...toolResult, ohlcv: {...toolResult.ohlcv, candles: bars}},
		rows: bars,
		liveTick: {timeMs: Date.now(), price: 1785.5},
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.liveMerge.merged, true);
	assert.equal(result.data.liveMerge.livePrice, 1785.5);
	assert.equal(Number(result.data.bars[result.data.bars.length - 1]!.close), 1785.5);
});

test('prepareOhlcvBarsForAnalysis respects mergeLive false without tick', async () => {
	const bars = hyperliquidBars(1700, Math.floor(Date.now() / 1000));
	const result = await prepareOhlcvBarsForAnalysis({
		toolResult: {...toolResult, ohlcv: {...toolResult.ohlcv, candles: bars}},
		rows: bars,
		mergeLive: false,
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.liveMerge.merged, false);
	assert.equal(Number(result.data.bars[result.data.bars.length - 1]!.close), 1700);
});
