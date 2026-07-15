import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	attachFetchMetaToPayload,
	buildFetchLoadMeta,
	slimFetchOutputForAgent,
} from '../dist/core/chart/fetch-agent-view.js';
import {bindOhlcvSessionFetch, buildOhlcvSessionBindHint, clearOhlcvSession} from '../dist/core/chart/ohlcv-session-store.js';

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

test('buildFetchLoadMeta returns ohlcvSummary and sessionBind', () => {
	const toolResult = {ohlcv: {coin: 'ETH', interval: '1h', candles: buildBars(30)}};
	const sessionKey = 'fetch-meta';
	clearOhlcvSession(sessionKey);
	const bound = bindOhlcvSessionFetch(sessionKey, toolResult, {title: 'ETH 1H — last 7d'});
	const bindHint = bound ? buildOhlcvSessionBindHint(bound) : undefined;
	const meta = buildFetchLoadMeta(toolResult, {
		title: 'ETH 1H — last 7d',
		fingerprint: bound?.fingerprint,
		sessionBind: bindHint,
	});
	assert.ok(meta);
	assert.equal(meta!.barCount, 30);
	assert.ok(meta!.ohlcvSummary);
	assert.equal(meta!.ohlcvSummary!.lastClose, 129);
	assert.ok(meta!.sessionBind?.ohlcvDigest);
	assert.match(meta!.dataPolicy, /sessionBind/i);
	clearOhlcvSession(sessionKey);
});

test('slimFetchOutputForAgent omits candle rows', () => {
	const toolResult = {ohlcv: {coin: 'ETH', interval: '1h', candles: buildBars(5)}};
	const meta = buildFetchLoadMeta(toolResult, {title: 'ETH 1H'});
	assert.ok(meta);
	const slim = slimFetchOutputForAgent(toolResult, meta!);
	assert.equal(slim.agentView, 'slim');
	assert.equal((slim.fetch as {barCount: number}).barCount, 5);
	assert.equal((slim.fetch as {title: string}).title, 'ETH 1H');
	assert.equal((slim as Record<string, unknown>).ohlcv, undefined);
	assert.equal((slim as Record<string, unknown>).candles, undefined);
});

test('attachFetchMetaToPayload keeps candles and adds meta sibling', () => {
	const toolResult = {ohlcv: {coin: 'ETH', interval: '1h', candles: buildBars(3)}};
	const meta = buildFetchLoadMeta(toolResult)!;
	const attached = attachFetchMetaToPayload(toolResult, meta);
	assert.equal((attached.ohlcv as {candles: unknown[]}).candles.length, 3);
	assert.equal((attached.meta as {barCount: number}).barCount, 3);
});
