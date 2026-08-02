import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createContinuumMcpServer} from '../dist/mcp/register.js';
import {DefiProtocolContext} from '../dist/mcp/defi/context.js';
import {coerceAgentInputValue} from '../dist/mcp/agent-input-coerce.js';

test('coerceAgentInputValue allowlists numbers/bools and preserves wei strings', () => {
	const out = coerceAgentInputValue({
		lookbackDays: '30',
		useCustomGas: 'true',
		amountWei: '1000000000000000000',
		nested: {limit: '5', valueWei: '1'},
	}) as Record<string, unknown>;
	assert.equal(out.lookbackDays, 30);
	assert.equal(out.useCustomGas, true);
	assert.equal(out.amountWei, '1000000000000000000');
	const nested = out.nested as Record<string, unknown>;
	assert.equal(nested.limit, 5);
	assert.equal(nested.valueWei, '1');
});

test('Continuum Zod tools accept string numbers/bools after coerce wrapper', async () => {
	const server = createContinuumMcpServer(
		{},
		{defiContext: new DefiProtocolContext(), deferLoading: true},
	);
	const prepare = server._registeredTools['prepare_chart_from_rows'];
	const data = await server.validateToolInput(
		prepare,
		{
			title: 'BTC',
			height: '400',
			toolResult: {ohlcv: {candles: [{time: 1, open: 1, high: 1, low: 1, close: 1}]}},
		},
		'prepare_chart_from_rows',
	);
	assert.equal((data as {height?: number}).height, 400);

	const analyze = server._registeredTools['analyze_momentum'];
	const analyzed = await server.validateToolInput(
		analyze,
		{
			title: 'BTC',
			lookback: '10',
			toolResult: {ohlcv: {candles: [{time: 1, open: 1, high: 1, low: 1, close: 1}]}},
		},
		'analyze_momentum',
	);
	assert.equal((analyzed as {lookback?: number}).lookback, 10);

	const pools = server._registeredTools['ctm_uniswap_v4_list_lp_pools'];
	await server.validateToolInput(
		pools,
		{chainId: '1', permissioned: 'true'},
		'ctm_uniswap_v4_list_lp_pools',
	);

	const ohlcv = server._registeredTools['ctm_hyperliquid_fetch_ohlcv'];
	await server.validateToolInput(
		ohlcv,
		{
			coin: 'BTC',
			interval: '4h',
			lookbackDays: '30',
			chainId: '999',
			startTimeMs: '1719792000000',
			endTimeMs: '1722384000000',
		},
		'ctm_hyperliquid_fetch_ohlcv',
	);
});
