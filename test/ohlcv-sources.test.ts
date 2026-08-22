import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	OHLCV_MCP_SOURCE_CATALOG,
	listOhlcvSources,
	ohlcvMcpSourceSpec,
} from '../dist/core/chart/ohlcv-sources.js';
import {continuumToolNeedsOhlcvSessionBind} from '../dist/mcp/agent-host-catalog.js';
import {resolveToolGroupId} from '../dist/mcp/deferred/tool-group-map.js';

test('ohlcvMcpSourceSpec covers catalog OHLCV MCP ids', () => {
	assert.ok(ohlcvMcpSourceSpec('alpaca'));
	assert.ok(ohlcvMcpSourceSpec('equibles'));
	assert.ok(ohlcvMcpSourceSpec('financial-modeling-prep'));
	assert.equal(ohlcvMcpSourceSpec('vpn'), undefined);
	assert.ok(OHLCV_MCP_SOURCE_CATALOG.some(s => s.serverId === 'binance'));
});

test('listOhlcvSources splits MCP active vs repository', () => {
	const result = listOhlcvSources({
		activeServers: [
			{id: 'binance', displayName: 'Binance', initialLoad: false, envConfigured: true},
			{id: 'vpn', displayName: 'VPN'},
		],
		availableCatalog: [
			{id: 'alpaca', displayName: 'Alpaca (v2)', initialLoad: false, envConfigured: false},
			{id: 'duckduckgo', displayName: 'DuckDuckGo'},
		],
	});
	assert.deepEqual(
		result.active.map(r => (r.kind === 'mcp' ? r.serverId : r.protocolId)),
		['binance'],
	);
	assert.equal(result.active[0]?.enable, 'agent_load_mcp_server');
	assert.deepEqual(
		result.repository.map(r => (r.kind === 'mcp' ? r.serverId : r.protocolId)),
		['alpaca'],
	);
	assert.equal(result.repository[0]?.enable, 'add_mcp_server_from_catalog');
	assert.equal(result.repository[0]?.kind === 'mcp' && result.repository[0].liveProviderId, 'alpaca.latestTrade');
});

test('listOhlcvSources puts loaded DeFi in active and the rest in repository', () => {
	const result = listOhlcvSources({
		loadedProtocolIds: ['hyperliquid'],
		defiProtocols: [
			{protocolId: 'hyperliquid', fetchTool: 'ctm_hyperliquid_fetch_ohlcv'},
			{protocolId: 'gmx', fetchTool: 'ctm_gmx_fetch_ohlcv'},
			{protocolId: 'aave-v4'},
		],
	});
	const activeIds = result.active.filter(r => r.kind === 'defi').map(r => r.protocolId);
	const repoIds = result.repository.filter(r => r.kind === 'defi').map(r => r.protocolId);
	assert.deepEqual(activeIds, ['hyperliquid']);
	assert.deepEqual(repoIds, ['gmx']);
	assert.equal(result.active[0]?.enable, 'load_defi_protocol');
});

test('listOhlcvSources skips catalog MCP already on the node', () => {
	const result = listOhlcvSources({
		activeServers: [{id: 'coingecko', initialLoad: false}],
		availableCatalog: [{id: 'coingecko', initialLoad: false}],
	});
	assert.equal(result.active.length, 1);
	assert.equal(result.repository.length, 0);
});

test('list_ohlcv_sources is a discovery inventory tool without session bind', () => {
	assert.equal(resolveToolGroupId('list_ohlcv_sources'), 'discovery');
	assert.equal(continuumToolNeedsOhlcvSessionBind('list_ohlcv_sources'), false);
});
