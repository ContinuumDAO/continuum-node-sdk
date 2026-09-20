import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	chooseCatalogMcpEnablement,
	CONTINUUMDAO_TOKENOMICS_MCP_SERVER_ID,
	ETHERSCAN_MCP_SERVER_ID,
	FOUNDRY_MCP_SERVER_ID,
	formatAgentDefaultsFirstReplyHint,
	MULLVAD_BROWSER_MCP_SERVER_ID,
} from '../dist/core/agent/catalog-mcp-enablement.js';

test('tokenomics required server in catalog asks to add from repository', () => {
	const result = chooseCatalogMcpEnablement({
		toolset: 'continuumdao-tokenomics',
		activeServerIds: ['continuum', 'etherscan'],
		catalogServerIds: [CONTINUUMDAO_TOKENOMICS_MCP_SERVER_ID],
	});
	assert.equal(result.toolset, 'continuumdao-tokenomics');
	assert.equal(result.firstReplyHint, null);
	assert.equal(result.missingHint, null);
	const required = result.servers.find((row) => row.role === 'required');
	assert.ok(required);
	assert.equal(required.serverId, CONTINUUMDAO_TOKENOMICS_MCP_SERVER_ID);
	assert.equal(required.availability, 'repository');
	assert.equal(required.askOperator, false);
	assert.deepEqual(required.enable.addFromCatalog, {id: CONTINUUMDAO_TOKENOMICS_MCP_SERVER_ID});
	assert.deepEqual(required.enable.agentLoadMcpServer, {
		serverId: CONTINUUMDAO_TOKENOMICS_MCP_SERVER_ID,
	});
	assert.match(required.note, /[Nn]ot the continuum-dao-tokenomics skill/);
	const desirable = result.servers.find((row) => row.role === 'desirable');
	assert.ok(desirable);
	assert.equal(desirable.serverId, ETHERSCAN_MCP_SERVER_ID);
	assert.equal(desirable.availability, 'active');
	assert.equal(desirable.askOperator, true);
	assert.equal(desirable.enable.addFromCatalog, undefined);
	assert.deepEqual(desirable.enable.agentLoadMcpServer, {serverId: ETHERSCAN_MCP_SERVER_ID});
});

test('tokenomics required server already active only asks to load', () => {
	const result = chooseCatalogMcpEnablement({
		toolset: 'continuumdao-tokenomics',
		activeServerIds: [CONTINUUMDAO_TOKENOMICS_MCP_SERVER_ID],
		catalogServerIds: [],
	});
	const required = result.servers.find((row) => row.role === 'required');
	assert.ok(required);
	assert.equal(required.availability, 'active');
	assert.equal(required.enable.addFromCatalog, undefined);
	assert.deepEqual(required.enable.agentLoadMcpServer, {
		serverId: CONTINUUMDAO_TOKENOMICS_MCP_SERVER_ID,
	});
	const etherscan = result.servers.find((row) => row.serverId === ETHERSCAN_MCP_SERVER_ID);
	assert.ok(etherscan);
	assert.equal(etherscan.availability, 'missing');
	assert.equal(etherscan.askOperator, true);
	assert.deepEqual(etherscan.enable.addFromCatalog, {id: ETHERSCAN_MCP_SERVER_ID});
	assert.match(result.missingHint ?? '', /update the MPA Wallet code in the Maintenance section/);
	assert.doesNotMatch(result.missingHint ?? '', /mpc-config/);
});

test('compose requires etherscan and foundry', () => {
	const result = chooseCatalogMcpEnablement({
		toolset: 'continuum-dao-compose',
		activeServerIds: ['continuum'],
		catalogServerIds: [ETHERSCAN_MCP_SERVER_ID, FOUNDRY_MCP_SERVER_ID],
	});
	assert.equal(result.servers.length, 2);
	assert.ok(result.servers.every((row) => row.role === 'required' && row.askOperator === false));
	assert.ok(result.servers.every((row) => row.availability === 'repository'));
	assert.match(result.guidance, /Both etherscan and foundry/);
});

test('block-explorer does not auto-pick etherscan vs blockscout', () => {
	const result = chooseCatalogMcpEnablement({
		toolset: 'block-explorer',
		activeServerIds: [],
		catalogServerIds: [ETHERSCAN_MCP_SERVER_ID, 'blockscout'],
	});
	assert.ok(result.servers.every((row) => row.role === 'desirable' && row.askOperator === true));
	assert.match(result.guidance, /Pick one family/);
});

test('dune and sec-filings are single required servers', () => {
	const dune = chooseCatalogMcpEnablement({
		toolset: 'dune-analytics',
		activeServerIds: [],
		catalogServerIds: ['dune'],
	});
	assert.equal(dune.servers[0]?.serverId, 'dune');
	assert.equal(dune.servers[0]?.role, 'required');
	assert.equal(dune.servers[0]?.availability, 'repository');

	const edgar = chooseCatalogMcpEnablement({
		toolset: 'sec-filings',
		activeServerIds: ['edgartools'],
		catalogServerIds: [],
	});
	assert.equal(edgar.servers[0]?.serverId, 'edgartools');
	assert.equal(edgar.servers[0]?.availability, 'active');
	assert.equal(edgar.servers[0]?.enable.addFromCatalog, undefined);
});

test('agent-defaults treats gecko as satisfying the browser recommendation', () => {
	const result = chooseCatalogMcpEnablement({
		toolset: 'agent-defaults',
		activeServerIds: ['continuum', 'gecko'],
		catalogServerIds: [MULLVAD_BROWSER_MCP_SERVER_ID],
		defaultSearchMcp: 'duckduckgo',
	});
	const browser = result.servers.find((row) => row.serverId === MULLVAD_BROWSER_MCP_SERVER_ID);
	assert.ok(browser);
	assert.equal(browser.availability, 'active');
	assert.deepEqual(browser.enable.agentLoadMcpServer, {serverId: 'gecko'});
	assert.equal(result.firstReplyHint, null);
});

test('agent-defaults treats firefox as satisfying the browser recommendation', () => {
	const result = chooseCatalogMcpEnablement({
		toolset: 'agent-defaults',
		activeServerIds: ['continuum', 'firefox'],
		catalogServerIds: [MULLVAD_BROWSER_MCP_SERVER_ID],
		defaultSearchMcp: 'firefox',
	});
	const browser = result.servers.find((row) => row.serverId === MULLVAD_BROWSER_MCP_SERVER_ID);
	assert.ok(browser);
	assert.equal(browser.availability, 'active');
	assert.equal(browser.enable.addFromCatalog, undefined);
	assert.deepEqual(browser.enable.agentLoadMcpServer, {serverId: 'firefox'});
	assert.equal(result.firstReplyHint, null);
	assert.match(result.guidance, /first assistant reply/);
});

test('first-reply hint calls out a missing browser MCP', () => {
	assert.match(
		formatAgentDefaultsFirstReplyHint({
			activeServerIds: ['continuum', 'duckduckgo'],
			defaultSearchMcp: 'duckduckgo',
		}) ?? '',
		/No browser MCP is active/,
	);
	assert.doesNotMatch(
		formatAgentDefaultsFirstReplyHint({
			activeServerIds: ['continuum', 'duckduckgo'],
			defaultSearchMcp: 'duckduckgo',
		}) ?? '',
		/Firefox or Mullvad/,
	);
	assert.equal(
		formatAgentDefaultsFirstReplyHint({
			activeServerIds: ['firefox'],
			defaultSearchMcp: 'duckduckgo',
		}),
		null,
	);
	assert.equal(
		formatAgentDefaultsFirstReplyHint({
			activeServerIds: ['gecko'],
			defaultSearchMcp: 'duckduckgo',
		}),
		null,
	);
	assert.equal(
		formatAgentDefaultsFirstReplyHint({
			activeServerIds: ['custom-browser'],
			defaultSearchMcp: 'exa',
		}),
		null,
	);
	assert.match(
		formatAgentDefaultsFirstReplyHint({
			activeServerIds: ['gecko'],
			defaultSearchMcp: '',
		}) ?? '',
		/No default search MCP is set/,
	);
	assert.equal(
		formatAgentDefaultsFirstReplyHint({
			activeServerIds: ['mullvad-browser'],
			defaultSearchMcp: 'mullvad-browser',
		}),
		null,
	);
	assert.equal(
		formatAgentDefaultsFirstReplyHint({
			activeServerIds: ['continuum'],
			defaultSearchMcp: '',
			setupHints: 'off',
		}),
		null,
	);
});
