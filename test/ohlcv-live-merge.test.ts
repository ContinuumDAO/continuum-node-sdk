import assert from 'node:assert/strict';
import {test} from 'node:test';
import {analyzeTrendStructure} from '../dist/core/chart/analysis/analyze-tools.js';
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

test('prepareOhlcvBarsForAnalysis re-merges on each call with fresh liveTick (same toolResult)', async () => {
	const lastTimeSec = Math.floor(Date.now() / 1000 / 3600) * 3600;
	const bars = hyperliquidBars(1700, lastTimeSec);
	const sharedInput = {
		toolResult: {...toolResult, ohlcv: {...toolResult.ohlcv, candles: bars}},
		rows: bars,
	};

	const first = await prepareOhlcvBarsForAnalysis({
		...sharedInput,
		liveTick: {timeMs: Date.now(), price: 1785.5},
	});
	const second = await prepareOhlcvBarsForAnalysis({
		...sharedInput,
		liveTick: {timeMs: Date.now() + 1000, price: 1792.25},
	});

	assert.equal(first.ok, true);
	assert.equal(second.ok, true);
	if (!first.ok || !second.ok) {
		return;
	}
	assert.equal(first.data.liveMerge.merged, true);
	assert.equal(second.data.liveMerge.merged, true);
	assert.equal(Number(first.data.bars[first.data.bars.length - 1]!.close), 1785.5);
	assert.equal(Number(second.data.bars[second.data.bars.length - 1]!.close), 1792.25);
	assert.equal(Number(bars[bars.length - 1]!.close), 1700, 'source candles unchanged');
});

test('prepareOhlcvBarsForAnalysis skips liveTick merge for historical window', async () => {
	const lastTimeSec = Math.floor(Date.now() / 1000 / 3600) * 3600;
	const bars = hyperliquidBars(1700, lastTimeSec);
	const historical = {
		ohlcv: {
			...toolResult.ohlcv,
			endTimeMs: Date.now() - 7 * 86_400_000,
			candles: bars,
		},
	};
	const result = await prepareOhlcvBarsForAnalysis({
		toolResult: historical,
		rows: bars,
		liveTick: {timeMs: Date.now(), price: 9999},
	});
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.liveMerge.merged, false);
	assert.match(result.data.liveMerge.skippedReason ?? '', /historical/i);
	assert.equal(Number(result.data.bars[result.data.bars.length - 1]!.close), 1700);
});

test('shouldMergeLiveForAnalysis merges when fetch window is current', () => {
	const lastTimeSec = Math.floor(Date.now() / 1000 / 3600) * 3600;
	const bars = hyperliquidBars(1700, lastTimeSec);
	const decision = shouldMergeLiveForAnalysis(bars, toolResult, undefined);
	assert.equal(decision.merge, true);
	assert.equal(decision.skippedReason, undefined);
});

function buildTrendBars(count: number, lastClose: number, lastTimeSec: number) {
	const bars = [];
	for (let i = 0; i < count; i++) {
		const close = lastClose - (count - 1 - i) * 0.5;
		bars.push({
			timestampMs: (lastTimeSec - (count - 1 - i) * 3600) * 1000,
			open: String(close - 0.2),
			high: String(close + 0.5),
			low: String(close - 0.5),
			close: String(close),
			volume: '1',
		});
	}
	return bars;
}

test('analyzeTrendStructure exposes liveMerge meta on each call with fresh tick', async () => {
	const lastTimeSec = Math.floor(Date.now() / 1000 / 3600) * 3600;
	const bars = buildTrendBars(20, 1700, lastTimeSec);
	const shared = {
		toolResult: {...toolResult, ohlcv: {...toolResult.ohlcv, candles: bars}},
		mergeLive: true as const,
	};

	const first = await analyzeTrendStructure({
		...shared,
		liveTick: {timeMs: Date.now(), price: 1785.5},
	});
	const second = await analyzeTrendStructure({
		...shared,
		liveTick: {timeMs: Date.now() + 1000, price: 1792.25},
	});

	assert.equal(first.ok, true);
	assert.equal(second.ok, true);
	if (!first.ok || !second.ok) {
		return;
	}
	assert.equal(first.data.meta.liveMerge?.merged, true);
	assert.equal(second.data.meta.liveMerge?.merged, true);
	assert.equal(first.data.meta.ohlcvSummary?.lastClose, 1785.5);
	assert.equal(second.data.meta.ohlcvSummary?.lastClose, 1792.25);
});
