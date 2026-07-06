import assert from 'node:assert/strict';
import {test} from 'node:test';
import {slimChartOutputForAgent} from '../dist/core/chart/chart-agent-view.js';
import {rejectStringToolResultInput} from '../dist/core/chart/analysis/ohlcv-input.js';
import {
	bindOhlcvSessionFetch,
	clearOhlcvSession,
	resolveOhlcvSessionInput,
} from '../dist/core/chart/ohlcv-session-store.js';
import {prepareOhlcvBarsForAnalysis} from '../dist/core/chart/analysis/ohlcv-live-merge.js';

function buildBars(count = 20) {
	const bars = [];
	let t = 1_782_658_800;
	for (let i = 0; i < count; i++) {
		const price = 100 + i;
		bars.push({
			timestampMs: t + i * 3_600_000,
			open: String(price - 0.2),
			high: String(price + 0.5),
			low: String(price - 0.5),
			close: String(price),
			volume: '1',
		});
	}
	return bars;
}

test('bindOhlcvSessionFetch + resolve by ohlcvDigest reuses toolResult', () => {
	const sessionKey = 'test-session';
	clearOhlcvSession(sessionKey);
	const toolResult = {ohlcv: {coin: 'ETH', interval: '1h', candles: buildBars(30)}};
	const bound = bindOhlcvSessionFetch(sessionKey, toolResult, {
		title: 'ETH-PERP 1H — last 7d',
	});
	assert.ok(bound?.fingerprint?.digest);

	const resolved = resolveOhlcvSessionInput(sessionKey, {
		title: 'ETH-PERP 1H — last 7d',
		ohlcvDigest: bound!.fingerprint!.digest,
	});
	assert.equal(resolved.ok, true);
	if (!resolved.ok) {
		return;
	}
	assert.equal(resolved.data.toolResult, toolResult);
	clearOhlcvSession(sessionKey);
});

test('session ohlcvDigest stays valid after live merge updates lastClose', async () => {
	const sessionKey = 'live-session';
	clearOhlcvSession(sessionKey);
	const lastTimeSec = Math.floor(Date.now() / 1000 / 3600) * 3600;
	const bars = buildBars(20);
	bars[bars.length - 1] = {
		timestampMs: lastTimeSec * 1000,
		open: '1699',
		high: '1701',
		low: '1698',
		close: '1700',
		volume: '1',
	};
	const toolResult = {
		ohlcv: {
			coin: 'ETH',
			interval: '1h',
			startTimeMs: Date.now() - 7 * 86_400_000,
			endTimeMs: Date.now(),
			candles: bars,
		},
	};
	const bound = bindOhlcvSessionFetch(sessionKey, toolResult, {title: 'ETH-PERP 1H — last 7d'});
	assert.ok(bound?.fingerprint?.digest);

	const merged = await prepareOhlcvBarsForAnalysis({
		toolResult,
		liveTick: {timeMs: Date.now(), price: 1785.5},
	});
	assert.equal(merged.ok, true);
	if (!merged.ok) {
		return;
	}
	assert.equal(merged.data.fingerprint?.digest, bound!.fingerprint!.digest);
	assert.equal(Number(merged.data.bars[merged.data.bars.length - 1]!.close), 1785.5);

	const resolved = resolveOhlcvSessionInput(sessionKey, {
		title: 'ETH-PERP 1H — last 7d',
		ohlcvDigest: bound!.fingerprint!.digest,
	});
	assert.equal(resolved.ok, true);
	clearOhlcvSession(sessionKey);
});

test('resolveOhlcvSessionInput rejects string toolResult', () => {
	const rejected = resolveOhlcvSessionInput('default', {
		toolResult: '{"ohlcv":{"candles":[',
	});
	assert.equal(rejected.ok, false);
});

test('rejectStringToolResultInput rejects complete JSON string', () => {
	const result = rejectStringToolResultInput({
		toolResult: JSON.stringify({ohlcv: {candles: []}}),
	});
	assert.equal(result.ok, false);
});

test('slimChartOutputForAgent omits series data points', () => {
	const slim = slimChartOutputForAgent({
		kind: 'continuum/chart/v1',
		chart: {
			title: 'ETH 1H',
			series: [
				{
					id: 'candles',
					type: 'candlestick',
					label: 'ETH',
					data: [
						{time: 1, open: 1, high: 2, low: 0.5, close: 1.5},
						{time: 2, open: 1.5, high: 2.5, low: 1, close: 2},
					],
				},
			],
		},
	});
	assert.equal(slim.agentView, 'slim');
	const series = (slim.chart as {series: Array<{pointCount: number; data?: unknown}>}).series;
	assert.equal(series[0]?.pointCount, 2);
	assert.equal(series[0]?.data, undefined);
});
