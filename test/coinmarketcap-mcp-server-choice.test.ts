import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildKlineFallbackReason,
	isKlineDataTooStaleForWindow,
} from '../dist/core/coinmarketcap/kline-fallback.js';
import {
	chooseCoinMarketCapMcpServer,
	CMC_FULL_MCP_SERVER_ID,
	CMC_PUBLIC_MCP_SERVER_ID,
} from '../dist/core/coinmarketcap/mcp-server-choice.js';

test('chooseCoinMarketCapMcpServer keeps public for DEX charts even when pro catalog and key are set', () => {
	const choice = chooseCoinMarketCapMcpServer({
		activeServerIds: [CMC_FULL_MCP_SERVER_ID, CMC_PUBLIC_MCP_SERVER_ID],
		apiKeyConfigured: true,
	});
	assert.equal(choice.variant, 'public');
	assert.equal(choice.serverId, CMC_PUBLIC_MCP_SERVER_ID);
	assert.match(choice.rationale, /coinmarketcap-public/i);
});

test('chooseCoinMarketCapMcpServer uses public when no key', () => {
	const choice = chooseCoinMarketCapMcpServer({
		activeServerIds: [CMC_FULL_MCP_SERVER_ID, CMC_PUBLIC_MCP_SERVER_ID],
		apiKeyConfigured: false,
	});
	assert.equal(choice.variant, 'public');
	assert.equal(choice.serverId, CMC_PUBLIC_MCP_SERVER_ID);
});

test('chooseCoinMarketCapMcpServer uses public when key set but pro not active', () => {
	const choice = chooseCoinMarketCapMcpServer({
		activeServerIds: [CMC_PUBLIC_MCP_SERVER_ID],
		apiKeyConfigured: true,
	});
	assert.equal(choice.variant, 'public');
	assert.equal(choice.serverId, CMC_PUBLIC_MCP_SERVER_ID);
	assert.match(choice.rationale, /get_crypto_ohlcv_historical/i);
});

test('chooseCoinMarketCapMcpServer pro only when public inactive', () => {
	const choice = chooseCoinMarketCapMcpServer({
		activeServerIds: [CMC_FULL_MCP_SERVER_ID],
		apiKeyConfigured: true,
	});
	assert.equal(choice.variant, 'pro');
	assert.equal(choice.serverId, CMC_FULL_MCP_SERVER_ID);
});

test('chooseCoinMarketCapMcpServer none when pro active without key and public inactive', () => {
	const choice = chooseCoinMarketCapMcpServer({
		activeServerIds: [CMC_FULL_MCP_SERVER_ID],
		apiKeyConfigured: false,
	});
	assert.equal(choice.variant, 'none');
	assert.equal(choice.serverId, null);
	assert.equal(choice.agentLoadMcpServer, null);
});

test('chooseCoinMarketCapMcpServer none when neither CMC server active', () => {
	const choice = chooseCoinMarketCapMcpServer({
		activeServerIds: ['continuum', 'technical-indicators'],
		apiKeyConfigured: true,
	});
	assert.equal(choice.variant, 'none');
	assert.equal(choice.serverId, null);
});

test('isKlineDataTooStaleForWindow fails old data for 7d lookback', () => {
	const now = 1_780_000_000;
	const stale = isKlineDataTooStaleForWindow(
		[{time: now - 86400 * 30, open: 1, high: 1, low: 1, close: 1}],
		{from: now - 86400 * 7, to: now, limit: 168, lookbackDays: 7},
		now,
	);
	assert.equal(stale, true);
});

test('buildKlineFallbackReason tells agent not to retry CMC DEX', () => {
	const reason = buildKlineFallbackReason({
		action: 'switch_ohlcv_source',
		doNotRetry: ['coinmarketcap-public__get_kline_candles'],
		nextSteps: ['Ask the operator which OHLCV source to use', 'Do not burn tool rounds'],
	});
	assert.match(reason, /operator/i);
	assert.match(reason, /tool rounds/i);
});
