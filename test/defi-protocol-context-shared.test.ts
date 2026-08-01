import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DefiProtocolContext} from '../dist/mcp/defi/context.js';
import {createContinuumMcpServer} from '../dist/mcp/register.js';

test('shared DefiProtocolContext survives across createContinuumMcpServer instances', () => {
	const shared = new DefiProtocolContext();
	createContinuumMcpServer({}, {defiContext: shared, deferLoading: false});
	shared.markLoaded('hyperliquid', ['ctm_hyperliquid_fetch_ohlcv']);
	assert.equal(shared.isLoaded('hyperliquid'), true);
	// Recreating the per-request server must keep the gate open (HTTP handler factory).
	createContinuumMcpServer({}, {defiContext: shared, deferLoading: false});
	assert.equal(shared.isLoaded('hyperliquid'), true);
	assert.ok(shared.getToolNames('hyperliquid').includes('ctm_hyperliquid_fetch_ohlcv'));
});

test('default createContinuumMcpServer uses isolated DefiProtocolContext', () => {
	const aCtx = new DefiProtocolContext();
	createContinuumMcpServer({}, {defiContext: aCtx, deferLoading: false});
	aCtx.markLoaded('hyperliquid', ['ctm_hyperliquid_fetch_ohlcv']);
	const bCtx = new DefiProtocolContext();
	createContinuumMcpServer({}, {defiContext: bCtx, deferLoading: false});
	assert.equal(bCtx.isLoaded('hyperliquid'), false);
});
