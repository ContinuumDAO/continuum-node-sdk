import assert from 'node:assert/strict';
import {test} from 'node:test';
import {slimChartOutputForAgent} from '../dist/core/chart/chart-agent-view.js';
import {rejectStringToolResultInput} from '../dist/core/chart/analysis/ohlcv-input.js';
import {
	bindOhlcvSessionFetch,
	clearOhlcvDigestHandle,
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
	// Digest is a resolve handle only — strip so .strict() analyze schemas without the field succeed.
	assert.equal(resolved.data.ohlcvDigest, undefined);
	clearOhlcvSession(sessionKey);
});

test('session ohlcvDigest stays valid after live merge updates lastClose', async () => {
	const sessionKey = 'live-session';
	clearOhlcvSession(sessionKey);
	const lastTimeMs = Math.floor(Date.now() / 3_600_000) * 3_600_000;
	const bars = [];
	for (let i = 0; i < 20; i++) {
		const price = 100 + i;
		bars.push({
			timestampMs: lastTimeMs - (19 - i) * 3_600_000,
			open: String(price - 0.2),
			high: String(price + 0.5),
			low: String(price - 0.5),
			close: String(price),
			volume: '1',
		});
	}
	bars[bars.length - 1] = {
		timestampMs: lastTimeMs,
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
			startTimeMs: lastTimeMs - 7 * 86_400_000,
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

test('resolveOhlcvSessionInput accepts title suffix mismatch', () => {
	const sessionKey = 'title-fuzzy';
	clearOhlcvSession(sessionKey);
	const toolResult = {ohlcv: {coin: 'ETH', interval: '1h', candles: buildBars(30)}};
	bindOhlcvSessionFetch(sessionKey, toolResult, {
		title: 'ETH-PERP 1H — last 7d (Hyperliquid)',
	});

	const resolved = resolveOhlcvSessionInput(sessionKey, {
		title: 'ETH-PERP 1H — last 7d',
	});
	assert.equal(resolved.ok, true);
	if (!resolved.ok) {
		return;
	}
	assert.equal(resolved.data.toolResult, toolResult);
	clearOhlcvSession(sessionKey);
});

test('resolveOhlcvSessionInput accepts ETH-PERP vs ETH and lookback mismatch', () => {
	const sessionKey = 'title-perp';
	clearOhlcvSession(sessionKey);
	const toolResult = {ohlcv: {coin: 'ETH', interval: '4h', candles: buildBars(30)}};
	bindOhlcvSessionFetch(sessionKey, toolResult, {title: 'ETH 4H'});

	const resolved = resolveOhlcvSessionInput(sessionKey, {
		title: 'ETH-PERP 4H — last 30d',
	});
	assert.equal(resolved.ok, true);
	if (resolved.ok) {
		assert.equal(resolved.data.title, 'ETH 4H');
		assert.equal(resolved.data.toolResult, toolResult);
	}
	clearOhlcvSession(sessionKey);
});

test('resolveOhlcvSessionInput digest match ignores title', () => {
	const sessionKey = 'title-digest-wins';
	clearOhlcvSession(sessionKey);
	const toolResult = {ohlcv: {coin: 'ETH', interval: '4h', candles: buildBars(30)}};
	const bound = bindOhlcvSessionFetch(sessionKey, toolResult, {title: 'ETH 4H'});
	assert.ok(bound?.fingerprint?.digest);

	const resolved = resolveOhlcvSessionInput(sessionKey, {
		title: 'SOL-PERP 1H — last 7d',
		ohlcvDigest: bound!.fingerprint!.digest,
	});
	assert.equal(resolved.ok, true);
	if (resolved.ok) {
		assert.equal(resolved.data.title, 'ETH 4H');
	}
	clearOhlcvDigestHandle(bound!.fingerprint!.digest);
	clearOhlcvSession(sessionKey);
});

test('resolveOhlcvSessionInput rejects string toolResult', () => {
	const rejected = resolveOhlcvSessionInput('default', {
		toolResult: '{"ohlcv":{"candles":[',
	});
	assert.equal(rejected.ok, false);
});

test('ohlcvDigest handle resolves across different session keys', () => {
	const bindKey = 'http-request-a';
	const followUpKey = 'http-request-b';
	clearOhlcvSession(bindKey);
	clearOhlcvSession(followUpKey);
	const toolResult = {ohlcv: {coin: 'ETH', interval: '1h', candles: buildBars(30)}};
	const bound = bindOhlcvSessionFetch(bindKey, toolResult, {title: 'ETH 1H'});
	assert.ok(bound?.fingerprint?.digest);
	const digest = bound!.fingerprint!.digest;

	// Simulate a new HTTP request (new ALS key) that only has the explicit digest handle.
	clearOhlcvSession(bindKey);
	const resolved = resolveOhlcvSessionInput(followUpKey, {
		title: 'ETH 1H',
		ohlcvDigest: digest,
	});
	assert.equal(resolved.ok, true);
	if (resolved.ok) {
		assert.equal(resolved.data.toolResult, toolResult);
	}
	clearOhlcvDigestHandle(digest);
	clearOhlcvSession(followUpKey);
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
