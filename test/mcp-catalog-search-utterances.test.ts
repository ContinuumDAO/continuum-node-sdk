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

test('utterance → keygen', () => {
	assertGroupInTopN('what is my preferred keygen', 'keygen');
});

test('utterance → compose / transfer', () => {
	assertGroupInTopN('compose a native gas transfer multisign', 'mpc_compose');
});

test('utterance → defi discovery', () => {
	assertGroupInTopN('load uniswap defi protocol tools', 'defi_discovery');
});

test('utterance → agent cron', () => {
	assertGroupInTopN('schedule a cron job for the agent', 'agent_cron');
});

test('utterance → agent skills', () => {
	assertGroupInTopN('list agent skills markdown guidance', 'agent_skills');
});
