import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	GROUP_DESCRIPTIONS,
	GROUP_SEARCH_TAGS,
	TOOL_GROUP_BY_NAME,
	TOOL_SEARCH_TAGS,
} from '../dist/mcp/deferred/tool-group-map.js';
import {searchToolCatalog} from '../dist/mcp/deferred/session.js';

type CatalogRow = {
	name: string;
	description: string;
	groupId: string;
	tags: string[];
};

function buildCatalogFromMap(): CatalogRow[] {
	return Object.entries(TOOL_GROUP_BY_NAME).map(([name, groupId]) => ({
		name,
		description: GROUP_DESCRIPTIONS[groupId] ?? groupId,
		groupId,
		tags: [
			groupId,
			...(GROUP_SEARCH_TAGS[groupId] ?? []),
			...(TOOL_SEARCH_TAGS[name] ?? []),
			...name.split('_'),
		],
	}));
}

function topGroups(utterance: string, limit = 8): string[] {
	const hits = searchToolCatalog(buildCatalogFromMap(), utterance, undefined, 24);
	const seen = new Set<string>();
	const groups: string[] = [];
	for (const h of hits) {
		if (seen.has(h.group)) continue;
		seen.add(h.group);
		groups.push(h.group);
		if (groups.length >= limit) break;
	}
	return groups;
}

function assertGroupInTopN(utterance: string, expectedGroup: string, n = 4): void {
	const groups = topGroups(utterance, n);
	assert.ok(
		groups.includes(expectedGroup),
		`expected group ${expectedGroup} in top ${n} for "${utterance}", got [${groups.join(', ')}]`,
	);
}

function topToolNames(utterance: string, limit = 8): string[] {
	const hits = searchToolCatalog(buildCatalogFromMap(), utterance, undefined, 24);
	return hits.slice(0, limit).map(h => h.name);
}

function assertToolInTopN(utterance: string, expectedTool: string, n = 6): void {
	const tools = topToolNames(utterance, n);
	assert.ok(
		tools.includes(expectedTool),
		`expected tool ${expectedTool} in top ${n} for "${utterance}", got [${tools.join(', ')}]`,
	);
}

test('utterance → contacts / address book', () => {
	assertGroupInTopN('show me my saved contacts', 'registry_address_book');
});

test('utterance → chain registry', () => {
	assertGroupInTopN('add a new evm chain rpc', 'registry_chains');
});

test('utterance → token registry', () => {
	assertGroupInTopN('save an erc20 token to the registry', 'registry_tokens');
});

test('utterance → chart / ohlcv', () => {
	assertGroupInTopN('plot ETH candlestick chart with bollinger', 'chart');
});

test('utterance → mpc groups', () => {
	assertGroupInTopN('create an mpc group with peers', 'group');
});

test('utterance → list my groups', () => {
	assertGroupInTopN('list my groups', 'group');
});

test('utterance → ichimoku overlay → chart', () => {
	assertGroupInTopN('add ichimoku overlay', 'chart');
});

test('utterance → keygen', () => {
	assertGroupInTopN('what is my preferred keygen', 'keygen');
});

test('utterance → compose / transfer', () => {
	assertGroupInTopN('compose a native gas transfer multisign', 'mpc_compose');
});

test('utterance → defi discovery', () => {
	assertGroupInTopN('load uniswap defi protocol tools', 'defi_discovery');
});

test('utterance → load Uniswap protocol', () => {
	assertGroupInTopN('load Uniswap protocol', 'defi_discovery');
});

test('utterance → add Hyperliquid chain prefers registry_chains over defi', () => {
	const groups = topGroups('add Hyperliquid chain to my node', 4);
	assert.ok(
		groups.includes('registry_chains'),
		`expected registry_chains in top 4 for add Hyperliquid chain, got [${groups.join(', ')}]`,
	);
	assert.notEqual(
		groups[0],
		'defi_discovery',
		`defi_discovery must not rank first for chain-add phrasing, got [${groups.join(', ')}]`,
	);
});

test('utterance → agent cron', () => {
	assertGroupInTopN('schedule a cron job for the agent', 'agent_cron');
});

test('utterance → agent skills', () => {
	assertGroupInTopN('list agent skills markdown guidance', 'agent_skills');
});

test('utterance → sign request → mpc_read', () => {
	assertGroupInTopN('list my sign requests', 'mpc_read');
});

test('utterance → agree to a sign request → sign_request_agree', () => {
	assertToolInTopN('agree to a sign request', 'sign_request_agree');
	assertGroupInTopN('agree to a sign request', 'mpc_agree');
});

test('utterance → keygen request → keygen', () => {
	assertGroupInTopN('list keygen requests', 'keygen');
});

test('utterance → agree to a keygen request → accept_key_gen_request', () => {
	assertToolInTopN('agree to a keygen request', 'accept_key_gen_request');
	assertGroupInTopN('agree to a keygen request', 'keygen');
});

test('utterance → group request → group', () => {
	assertGroupInTopN('list group requests', 'group');
});

test('utterance → agree to a group request → accept_group_request', () => {
	assertToolInTopN('agree to a group request', 'accept_group_request');
	assertGroupInTopN('agree to a group request', 'group');
});

test('utterance → send eth → transfer_native_gas', () => {
	assertToolInTopN('send eth native transfer', 'transfer_native_gas');
});

test('utterance → get sig → trigger_sign_result', () => {
	assertToolInTopN('trigger get sig', 'trigger_sign_result');
});

test('utterance → node health', () => {
	assertToolInTopN('node health check', 'get_health');
});
