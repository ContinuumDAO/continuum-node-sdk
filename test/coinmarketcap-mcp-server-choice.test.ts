import assert from 'node:assert/strict';
import test from 'node:test';
import {
	chooseCoinMarketCapMcpServer,
	CMC_FULL_MCP_SERVER_ID,
	CMC_PUBLIC_MCP_SERVER_ID,
} from '../dist/core/coinmarketcap/mcp-server-choice.js';

test('chooseCoinMarketCapMcpServer prefers pro when key configured and coinmarketcap active', () => {
	const choice = chooseCoinMarketCapMcpServer({
		activeServerIds: [CMC_FULL_MCP_SERVER_ID, CMC_PUBLIC_MCP_SERVER_ID],
		apiKeyConfigured: true,
	});
	assert.equal(choice.variant, 'pro');
	assert.equal(choice.serverId, CMC_FULL_MCP_SERVER_ID);
	assert.equal(choice.agentLoadMcpServer?.serverId, CMC_FULL_MCP_SERVER_ID);
	assert.match(choice.rationale, /do not load coinmarketcap-public/i);
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
	assert.match(choice.rationale, /not active/i);
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
