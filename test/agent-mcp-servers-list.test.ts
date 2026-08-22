import assert from 'node:assert/strict';
import test from 'node:test';
import {
	ListMcpServersActiveResultSchema,
	ListMcpServersCatalogResultSchema,
	ListMcpServersResultSchema,
} from '../dist/schemas/extended.js';

/** mpc-auth offloads tool results above ~12k runes (~12k UTF-16 code units in JSON). */
const AGENT_OFFLOAD_RUNE_THRESHOLD = 12_000;

function catalogRow(id: string) {
	return {
		id,
		displayName: id,
		transport: 'http' as const,
		url: `http://continuum-mcp:8446/mcp/${id}`,
		initialLoad: false,
		aiReady: false,
		source: 'catalog' as const,
		removable: false,
	};
}

function loadListMcpServersFixture(): unknown {
	return {
		activeServers: [
			{
				id: 'continuum',
				displayName: 'Continuum node MCP',
				transport: 'http',
				url: 'http://continuum-mcp:8446/mcp',
				initialLoad: true,
				aiReady: true,
				builtin: true,
				source: 'default',
				removable: false,
			},
			{
				id: 'edgartools',
				displayName: 'EdgarTools (SEC filings)',
				transport: 'stdio',
				command: 'uvx',
				args: ['--from', 'edgartools[ai]', 'edgartools-mcp'],
				envVars: ['EDGAR_IDENTITY'],
				initialLoad: true,
				aiReady: true,
				source: 'user',
				removable: true,
			},
		],
		availableCatalog: Array.from({length: 29}, (_, i) => catalogRow(`catalog-${i + 1}`)),
		defaultServers: [
			{
				id: 'continuum',
				displayName: 'Continuum node MCP',
				transport: 'http',
				url: 'http://continuum-mcp:8446/mcp',
				initialLoad: true,
				aiReady: true,
				builtin: true,
				source: 'default',
				removable: false,
			},
		],
		userServers: [
			{
				id: 'edgartools',
				displayName: 'EdgarTools (SEC filings)',
				transport: 'stdio',
				command: 'uvx',
				args: ['--from', 'edgartools[ai]', 'edgartools-mcp'],
				envVars: ['EDGAR_IDENTITY'],
				initialLoad: true,
				aiReady: true,
				source: 'user',
				removable: true,
			},
		],
		servers: [
			{
				id: 'continuum',
				displayName: 'Continuum node MCP',
				transport: 'http',
				url: 'http://continuum-mcp:8446/mcp',
				initialLoad: true,
				aiReady: true,
				builtin: true,
				source: 'default',
				removable: false,
			},
			{
				id: 'edgartools',
				displayName: 'EdgarTools (SEC filings)',
				transport: 'stdio',
				command: 'uvx',
				args: ['--from', 'edgartools[ai]', 'edgartools-mcp'],
				envVars: ['EDGAR_IDENTITY'],
				initialLoad: true,
				aiReady: true,
				source: 'user',
				removable: true,
			},
		],
	};
}

function stubListMcpFetch(): () => void {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (input: RequestInfo | URL) => {
		if (String(input).includes('/listMcpServers')) {
			return new Response(
				JSON.stringify({code: 0, data: loadListMcpServersFixture()}),
				{status: 200, headers: {'Content-Type': 'application/json'}},
			);
		}
		return originalFetch(input);
	};
	return () => {
		globalThis.fetch = originalFetch;
	};
}

const testConfig = {
	node: {baseUrl: 'http://127.0.0.1', managementPort: 8080, mpcConfigPath: ''},
	signer: {defaultKey: 'bootstrap', defaultKeyPath: null},
};

test('listMcpServers defaults to active scope under offload threshold', async () => {
	const {listMcpServers} = await import('../dist/core/agent/mcp-servers.js');
	const restore = stubListMcpFetch();
	try {
		const active = await listMcpServers(testConfig);
		const catalog = await listMcpServers(testConfig, {scope: 'catalog'});
		assert.equal(active.ok, true);
		assert.equal(catalog.ok, true);
		if (!active.ok || !catalog.ok) {
			return;
		}
		const activeJson = JSON.stringify(active.data);
		const catalogJson = JSON.stringify(catalog.data);
		assert.ok(
			activeJson.length < AGENT_OFFLOAD_RUNE_THRESHOLD,
			`active scope too large: ${activeJson.length}`,
		);
		assert.ok(
			catalogJson.length < AGENT_OFFLOAD_RUNE_THRESHOLD,
			`catalog scope too large: ${catalogJson.length}`,
		);
		assert.equal(active.data.scope, 'active');
		assert.equal(active.data.activeServers.length, 2);
		assert.equal(active.data.activeServers[1]?.id, 'edgartools');
		assert.ok(!('command' in (active.data.activeServers[1] ?? {})));
		assert.equal(ListMcpServersActiveResultSchema.safeParse(active.data).success, true);
		assert.equal(ListMcpServersCatalogResultSchema.safeParse(catalog.data).success, true);
		assert.equal(ListMcpServersResultSchema.safeParse(active.data).success, true);
	} finally {
		restore();
	}
});

test('listMcpServers catalog scope includes addableTemplates', async () => {
	const {listMcpServers} = await import('../dist/core/agent/mcp-servers.js');
	const restore = stubListMcpFetch();
	try {
		const catalog = await listMcpServers(testConfig, {scope: 'catalog'});
		assert.equal(catalog.ok, true);
		if (!catalog.ok) {
			return;
		}
		assert.equal(catalog.data.scope, 'catalog');
		assert.ok(catalog.data.availableCatalog.length > 0);
		assert.ok(catalog.data.addableTemplates.length > 0);
	} finally {
		restore();
	}
});
