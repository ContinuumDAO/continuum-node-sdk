import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	type AgentHostCatalogJson,
	buildAgentHostCatalogJson,
} from '../dist/mcp/agent-host-catalog.js';
import {GROUP_DESCRIPTIONS} from '../dist/mcp/deferred/tool-group-map.js';
import {searchToolCatalog} from '../dist/mcp/deferred/session.js';

type CatalogRow = {
	name: string;
	description: string;
	groupId: string;
	tags: string[];
};

/** Mirrors host + DeferredToolSession search indexing over the embedded catalog JSON. */
function buildSearchCatalogFromHost(catalog: AgentHostCatalogJson): CatalogRow[] {
	return Object.entries(catalog.toolGroupByName).map(([name, groupId]) => ({
		name,
		description: catalog.groupDescriptions[groupId] ?? GROUP_DESCRIPTIONS[groupId] ?? groupId,
		groupId,
		tags: [
			groupId,
			...(catalog.groupSearchTags[groupId] ?? []),
			...(catalog.toolSearchTags[name] ?? []),
			...name.split('_'),
		],
	}));
}

function topGroupsFromHostCatalog(utterance: string, limit = 8): string[] {
	const catalog = buildAgentHostCatalogJson();
	const hits = searchToolCatalog(buildSearchCatalogFromHost(catalog), utterance, undefined, 24);
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

function assertGroupInTopN(utterance: string, expectedGroup: string, n = 6): void {
	const groups = topGroupsFromHostCatalog(utterance, n);
	assert.ok(
		groups.includes(expectedGroup),
		`expected group ${expectedGroup} in top ${n} for "${utterance}", got [${groups.join(', ')}]`,
	);
}

function assertToolInTopN(utterance: string, expectedTool: string, n = 6): void {
	const catalog = buildAgentHostCatalogJson();
	const hits = searchToolCatalog(buildSearchCatalogFromHost(catalog), utterance, undefined, n);
	const names = hits.map(h => h.name);
	assert.ok(
		names.includes(expectedTool),
		`expected tool ${expectedTool} in top ${n} for "${utterance}", got [${names.join(', ')}]`,
	);
}

test('host catalog includes hyperliquid pack slices', () => {
	const catalog = buildAgentHostCatalogJson();
	const groups = new Set(Object.values(catalog.toolGroupByName));
	for (const g of [
		'defi:hyperliquid:market-data',
		'defi:hyperliquid:orders',
		'defi:hyperliquid:transfer',
		'defi:hyperliquid:staking',
	]) {
		assert.ok(groups.has(g), `missing ${g} in host catalog`);
	}
});

test('host catalog utterance → hyperliquid ohlcv → market-data pack', () => {
	assertGroupInTopN('hyperliquid candles 4h', 'defi:hyperliquid:market-data');
	assertToolInTopN('hyperliquid candles 4h', 'ctm_hyperliquid_fetch_ohlcv', 3);
});

test('host catalog utterance → hyperliquid limit order → orders pack', () => {
	assertGroupInTopN('hyperliquid limit order on ETH', 'defi:hyperliquid:orders');
	assertToolInTopN(
		'hyperliquid limit order on ETH',
		'ctm_hyperliquid_build_limit_order_multisign',
	);
});

test('host catalog utterance → hyperliquid bridge → transfer pack', () => {
	assertGroupInTopN('bridge usdc to hyperliquid', 'defi:hyperliquid:transfer');
	assertToolInTopN(
		'bridge usdc to hyperliquid',
		'ctm_hyperliquid_build_bridge_deposit_multisign',
	);
});

test('host catalog utterance → hyperliquid stake → staking pack', () => {
	assertGroupInTopN('hyperliquid stake HYPE', 'defi:hyperliquid:staking');
	assertToolInTopN('hyperliquid stake HYPE', 'ctm_hyperliquid_build_stake_multisign');
});

test('host catalog utterance → load hyperliquid prefers defi_discovery not chain registry', () => {
	const groups = topGroupsFromHostCatalog('load hyperliquid protocol', 6);
	assert.ok(
		groups.includes('defi_discovery'),
		`expected defi_discovery in top 6, got [${groups.join(', ')}]`,
	);
	assert.ok(
		groups.indexOf('defi_discovery') < groups.indexOf('registry_chains') ||
			!groups.includes('registry_chains'),
		`defi_discovery should rank before registry_chains for load hyperliquid, got [${groups.join(', ')}]`,
	);
});

test('host catalog includes uniswap v4 pack slices', () => {
	const catalog = buildAgentHostCatalogJson();
	const groups = new Set(Object.values(catalog.toolGroupByName));
	for (const g of [
		'defi:uniswap-v4:market-data',
		'defi:uniswap-v4:swaps',
		'defi:uniswap-v4:lp',
		'defi:uniswap-v4:rewards',
	]) {
		assert.ok(groups.has(g), `missing ${g} in host catalog`);
	}
	assert.equal(
		Object.values(catalog.toolGroupByName).filter(g => g === 'defi:uniswap-v4:trading').length,
		0,
		'legacy uniswap trading pack should be empty after split',
	);
});

test('host catalog utterance → uniswap ohlcv → market-data pack', () => {
	assertGroupInTopN('uniswap v4 ohlcv candles', 'defi:uniswap-v4:market-data');
	assertToolInTopN('uniswap v4 ohlcv candles', 'ctm_uniswap_v4_fetch_ohlcv', 4);
});

test('host catalog utterance → uniswap swap quote → swaps pack', () => {
	assertGroupInTopN('uniswap swap quote ETH USDC', 'defi:uniswap-v4:swaps');
	assertToolInTopN('uniswap swap quote ETH USDC', 'ctm_uniswap_v4_quote', 4);
});

test('host catalog utterance → uniswap lp mint → lp pack', () => {
	assertGroupInTopN('uniswap liquidity provision mint', 'defi:uniswap-v4:lp');
	assertToolInTopN('uniswap liquidity provision mint', 'ctm_uniswap_v4_lp_create_position', 8);
});

test('host catalog utterance → uniswap collect fees → rewards pack', () => {
	assertGroupInTopN('uniswap collect lp fees', 'defi:uniswap-v4:rewards');
	assertToolInTopN('uniswap collect lp fees', 'ctm_uniswap_v4_lp_collect', 4);
});

test('host catalog includes morpho pack slices', () => {
	const catalog = buildAgentHostCatalogJson();
	const groups = new Set(Object.values(catalog.toolGroupByName));
	for (const g of [
		'defi:morpho:vault',
		'defi:morpho:blue',
		'defi:morpho:midnight',
		'defi:morpho:rewards',
	]) {
		assert.ok(groups.has(g), `missing ${g} in host catalog`);
	}
});

test('host catalog utterance → morpho vault → vault pack', () => {
	assertGroupInTopN('morpho earn vault deposit', 'defi:morpho:vault');
	assertToolInTopN('morpho earn vault deposit', 'ctm_morpho_build_vault_deposit_multisign', 6);
});

test('host catalog utterance → morpho blue borrow → blue pack', () => {
	assertGroupInTopN('morpho blue borrow collateral', 'defi:morpho:blue');
	assertToolInTopN('morpho blue borrow collateral', 'ctm_morpho_build_blue_borrow_multisign', 6);
});

test('host catalog utterance → morpho merkl claim → rewards pack', () => {
	assertGroupInTopN('morpho merkl claim rewards', 'defi:morpho:rewards');
	assertToolInTopN('morpho merkl claim rewards', 'ctm_morpho_build_merkl_claim_multisign', 4);
});

test('host catalog includes arcus pack slices', () => {
	const catalog = buildAgentHostCatalogJson();
	const groups = new Set(Object.values(catalog.toolGroupByName));
	for (const g of ['defi:arcus:orders', 'defi:arcus:transfer', 'defi:arcus:spot']) {
		assert.ok(groups.has(g), `missing ${g} in host catalog`);
	}
});

test('host catalog utterance → arcus perp order → orders pack', () => {
	assertGroupInTopN('arcus perp place order', 'defi:arcus:orders');
	assertToolInTopN('arcus perp place order', 'ctm_arcus_build_place_order_multisign', 6);
});

test('host catalog utterance → arcus deposit → transfer pack', () => {
	assertGroupInTopN('arcus deposit funds', 'defi:arcus:transfer');
	assertToolInTopN('arcus deposit funds', 'ctm_arcus_build_deposit_multisign', 4);
});

test('host catalog utterance → arcus spot rfq → spot pack', () => {
	assertGroupInTopN('arcus spot rfq quote', 'defi:arcus:spot');
	assertToolInTopN('arcus spot rfq quote', 'ctm_arcus_spot_build_rfq_multisign', 4);
});

test('host catalog includes gmx pack slices', () => {
	const catalog = buildAgentHostCatalogJson();
	const groups = new Set(Object.values(catalog.toolGroupByName));
	for (const g of ['defi:gmx:perps', 'defi:gmx:liquidity', 'defi:gmx:staking']) {
		assert.ok(groups.has(g), `missing ${g} in host catalog`);
	}
});

test('host catalog utterance → gmx perp increase → perps pack', () => {
	assertGroupInTopN('gmx perp increase position', 'defi:gmx:perps');
	assertToolInTopN('gmx perp increase position', 'ctm_gmx_build_increase_multisign', 6);
});

test('host catalog utterance → gmx gm liquidity → liquidity pack', () => {
	assertGroupInTopN('gmx gm pool liquidity deposit', 'defi:gmx:liquidity');
	assertToolInTopN('gmx gm pool liquidity deposit', 'ctm_gmx_build_gm_deposit_multisign', 6);
});

test('host catalog utterance → gmx stake → staking pack', () => {
	assertGroupInTopN('gmx stake gmx token', 'defi:gmx:staking');
	assertToolInTopN('gmx stake gmx token', 'ctm_gmx_build_stake_gmx_multisign', 4);
});

test('host catalog includes compound-v3 pack slices', () => {
	const catalog = buildAgentHostCatalogJson();
	const groups = new Set(Object.values(catalog.toolGroupByName));
	for (const g of ['defi:compound-v3:market-data', 'defi:compound-v3:trading']) {
		assert.ok(groups.has(g), `missing ${g} in host catalog`);
	}
	assert.equal(
		catalog.toolGroupByName.ctm_compound_v3_fetch_markets,
		'defi:compound-v3:market-data',
	);
	assert.equal(
		catalog.toolGroupByName.ctm_compound_v3_fetch_market,
		'defi:compound-v3:market-data',
	);
	assert.equal(
		catalog.toolGroupByName.ctm_compound_v3_fetch_account,
		'defi:compound-v3:market-data',
	);
	assert.equal(
		catalog.toolGroupByName.ctm_compound_v3_build_supply_multisign,
		'defi:compound-v3:trading',
	);
});

test('host catalog utterance → compound iii borrow against usdc → market-data', () => {
	assertGroupInTopN(
		'What assets can I borrow against USDC on Ethereum using Compound III protocol?',
		'defi:compound-v3:market-data',
	);
	assertToolInTopN(
		'What assets can I borrow against USDC on Ethereum using Compound III protocol?',
		'ctm_compound_v3_fetch_markets',
		8,
	);
	assertToolInTopN('compound iii markets', 'load_defi_protocol', 8);
});

test('host catalog utterance → load compound prefers defi_discovery', () => {
	assertGroupInTopN('load Compound III protocol', 'defi_discovery');
	assertToolInTopN('load Compound III protocol', 'load_defi_protocol', 6);
});

test('host catalog includes aave-v4 pack descriptions and aliases', () => {
	const catalog = buildAgentHostCatalogJson();
	assert.ok(
		(catalog.groupDescriptions['defi:aave-v4:market-data'] ?? '').includes('APY'),
		'aave-v4 market-data pack description must mention APY',
	);
	assert.deepEqual(catalog.groupActivateAliases['aave:market-data'], ['defi:aave-v4:market-data']);
	assert.deepEqual(catalog.groupActivateAliases['aave-v4:lending'], ['defi:aave-v4:trading']);
	assert.ok(
		(catalog.groupSearchTags['defi:aave-v4:market-data'] ?? []).includes('apr'),
		'aave-v4 market-data search tags must include apr',
	);
	if (catalog.toolGroupByName.ctm_aave_v4_fetch_markets) {
		assert.equal(
			catalog.toolGroupByName.ctm_aave_v4_fetch_markets,
			'defi:aave-v4:market-data',
		);
		assert.equal(catalog.toolGroupByName.ctm_aave_v4_fetch_market, 'defi:aave-v4:market-data');
	}
});

test('host catalog includes maple-syrup pack descriptions and aliases', () => {
	const catalog = buildAgentHostCatalogJson();
	assert.ok(
		(catalog.groupDescriptions['defi:maple-syrup:market-data'] ?? '').includes('APY'),
		'maple-syrup market-data pack description must mention APY',
	);
	assert.deepEqual(catalog.groupActivateAliases['maple:market-data'], [
		'defi:maple-syrup:market-data',
	]);
	assert.ok(
		(catalog.groupSearchTags['defi:maple-syrup:market-data'] ?? []).includes('syrup'),
		'maple-syrup market-data search tags must include syrup',
	);
	if (catalog.toolGroupByName.ctm_maple_fetch_markets) {
		assert.equal(
			catalog.toolGroupByName.ctm_maple_fetch_markets,
			'defi:maple-syrup:market-data',
		);
	}
});

test('host catalog includes lido/sky/ethena/curve yield pack tags', () => {
	const catalog = buildAgentHostCatalogJson();
	assert.ok(
		(catalog.groupDescriptions['defi:lido:market-data'] ?? '').includes('stETH'),
		'lido market-data description must mention stETH',
	);
	assert.ok((catalog.groupSearchTags['defi:sky:market-data'] ?? []).includes('susds'));
	assert.ok((catalog.groupSearchTags['defi:ethena:market-data'] ?? []).includes('susde'));
	assert.ok((catalog.groupSearchTags['defi:curve-dao:market-data'] ?? []).includes('lp apy'));
	assert.ok((catalog.groupSearchTags['defi_discovery'] ?? []).includes('best apy'));
	assert.deepEqual(catalog.groupActivateAliases['yield:compare'], ['defi_discovery']);
	assert.deepEqual(catalog.groupActivateAliases['lido:market-data'], ['defi:lido:market-data']);
});

test('host catalog includes node_database pack slices', () => {
	const catalog = buildAgentHostCatalogJson();
	const groups = new Set(Object.values(catalog.toolGroupByName));
	for (const g of ['node_database:backup', 'node_database:bootstrap', 'node_database:added-keys']) {
		assert.ok(groups.has(g), `missing ${g} in host catalog`);
	}
	assert.deepEqual(catalog.operatorApprovalToolNames, [
		'restore_database',
		'remove_bootstrap_key',
	]);
	assert.ok(
		(catalog.groupDescriptions['node_database:backup'] ?? '').includes('Mongo'),
		'host catalog must include pack descriptions for haystack alignment',
	);
});

test('host catalog utterance → restore mongodb backup → backup pack', () => {
	assertGroupInTopN('restore mongodb database backup', 'node_database:backup');
	assertToolInTopN('restore mongodb database backup', 'restore_database', 6);
});

test('host catalog utterance → bootstrap seed export → bootstrap pack', () => {
	assertGroupInTopN('export bootstrap seed key', 'node_database:bootstrap');
	assertToolInTopN('export bootstrap seed key', 'fetch_bootstrap_key', 6);
});

test('host catalog utterance → added management key → added-keys pack', () => {
	assertGroupInTopN('added management signer key file', 'node_database:added-keys');
	assertToolInTopN('added management signer key file', 'fetch_added_management_key', 6);
});
