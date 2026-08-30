import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	classifyDefiToolPack,
	DEFAULT_PINNED_GROUPS,
	PINNED_TOOL_NAMES,
	isToolPinnedAtInit,
	resolveToolGroupId,
	TOOL_GROUP_BY_NAME,
} from '../dist/mcp/deferred/tool-group-map.js';
import {mcpDeferLoadingFromEnv} from '../dist/mcp/deferred/session.js';
import {searchContinuumToolsSuggestion} from '../dist/mcp/deferred/discovery-tools.js';

test('mcpDeferLoadingFromEnv defaults to on', () => {
	const prev = process.env['MCP_DEFER_LOADING'];
	delete process.env['MCP_DEFER_LOADING'];
	assert.equal(mcpDeferLoadingFromEnv(), true);
	process.env['MCP_DEFER_LOADING'] = '0';
	assert.equal(mcpDeferLoadingFromEnv(), false);
	if (prev === undefined) {
		delete process.env['MCP_DEFER_LOADING'];
	} else {
		process.env['MCP_DEFER_LOADING'] = prev;
	}
});

test('resolveToolGroupId maps known tools and defi protocols', () => {
	assert.equal(resolveToolGroupId('version'), 'node_info');
	assert.equal(resolveToolGroupId('create_compose_multi_sign_request'), 'compose:multisign');
	assert.equal(resolveToolGroupId('create_compose_eip712_multi_sign_request'), 'compose:multisign');
	assert.equal(resolveToolGroupId('create_forge_multi_sign_request'), 'compose:forge');
	assert.equal(resolveToolGroupId('ctm_aave_v4_foo', {protocolId: 'aave-v4'}), 'defi:aave-v4:other');
	assert.equal(
		resolveToolGroupId('ctm_aave_v4_fetch_markets', {protocolId: 'aave-v4'}),
		'defi:aave-v4:market-data',
	);
	assert.equal(
		resolveToolGroupId('ctm_aave_v4_fetch_market', {protocolId: 'aave-v4'}),
		'defi:aave-v4:market-data',
	);
	assert.equal(
		resolveToolGroupId('ctm_maple_fetch_markets', {protocolId: 'maple-syrup'}),
		'defi:maple-syrup:market-data',
	);
	assert.equal(
		resolveToolGroupId('ctm_hyperliquid_fetch_ohlcv', {protocolId: 'hyperliquid'}),
		'defi:hyperliquid:market-data',
	);
	assert.equal(resolveToolGroupId('prepare_chart'), 'chart:core');
	assert.equal(resolveToolGroupId('analyze_elliott_waves'), 'chart:structure');
	assert.equal(resolveToolGroupId('analyze_momentum'), 'chart:indicators');
	assert.equal(resolveToolGroupId('analyze_candlestick_patterns'), 'chart:patterns');
	assert.equal(resolveToolGroupId('apply_elliott_wave_drawings'), 'chart:drawings');
	assert.equal(resolveToolGroupId('build_trade_from_trade_idea'), 'chart:trade');
	assert.equal(resolveToolGroupId('get_kline_candles'), 'unknown');
	assert.equal(resolveToolGroupId('set_vpn_enabled'), 'unknown');
});

test('classifyDefiToolPack splits continuum-dao, hyperliquid, and uniswap packs', () => {
	assert.equal(classifyDefiToolPack('ctm_continuum_dao_forum_create_topic'), 'forum');
	assert.equal(classifyDefiToolPack('ctm_continuum_dao_fetch_proposals'), 'governance-read');
	assert.equal(classifyDefiToolPack('ctm_continuum_dao_build_approve_multisign'), 'governance-write');
	assert.equal(classifyDefiToolPack('ctm_hyperliquid_build_limit_order_multisign'), 'orders');
	assert.equal(classifyDefiToolPack('ctm_hyperliquid_fetch_delegations'), 'staking');
	assert.equal(classifyDefiToolPack('ctm_uniswap_v4_lp_create_position'), 'lp');
	assert.equal(classifyDefiToolPack('ctm_uniswap_v4_build_swap_multisign'), 'swaps');
	assert.equal(classifyDefiToolPack('ctm_uniswap_v4_fetch_ohlcv'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_uniswap_v4_lp_collect'), 'rewards');
	assert.equal(classifyDefiToolPack('ctm_uniswap_v4_build_collect_fees_multisign'), 'rewards');
	assert.equal(classifyDefiToolPack('ctm_morpho_build_vault_deposit_multisign'), 'vault');
	assert.equal(classifyDefiToolPack('ctm_morpho_build_blue_borrow_multisign'), 'blue');
	assert.equal(classifyDefiToolPack('ctm_morpho_build_midnight_lend_offer_multisign'), 'midnight');
	assert.equal(classifyDefiToolPack('ctm_morpho_build_midnight_cancel_lend_offer_multisign'), 'midnight');
	assert.equal(classifyDefiToolPack('ctm_morpho_build_merkl_claim_multisign'), 'rewards');
	assert.equal(classifyDefiToolPack('ctm_arcus_build_place_order_multisign'), 'orders');
	assert.equal(classifyDefiToolPack('ctm_arcus_spot_build_rfq_multisign'), 'spot');
	assert.equal(classifyDefiToolPack('ctm_gmx_build_increase_multisign'), 'perps');
	assert.equal(classifyDefiToolPack('ctm_gmx_build_gm_deposit_multisign'), 'liquidity');
	assert.equal(classifyDefiToolPack('ctm_compound_v3_fetch_markets'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_compound_v3_fetch_market'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_compound_v3_fetch_account'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_compound_v3_build_withdraw_multisign'), 'trading');
	assert.equal(classifyDefiToolPack('ctm_aave_v4_fetch_markets'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_aave_v4_fetch_market'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_aave_v4_build_deposit_multisign'), 'trading');
	assert.equal(classifyDefiToolPack('ctm_maple_fetch_markets'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_maple_fetch_market'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_maple_build_deposit_multisign'), 'trading');
	assert.equal(classifyDefiToolPack('ctm_lido_fetch_steth_apr'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_sky_fetch_susds_rate'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_ethena_fetch_susde_apy'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_euler_v2_fetch_earn_vaults'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_aerodrome_fetch_lp_yields'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_aerodrome_fetch_stock_lp_yields'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_curve_dao_fetch_important_pools'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_curve_dao_fetch_lp_yields'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_hyperliquid_fetch_stock_markets'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_hyperliquid_fetch_vault_apys'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_curve_dao_build_add_liquidity_multisign'), 'trading');
	assert.equal(classifyDefiToolPack('ctm_pendle_fetch_markets'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_pendle_fetch_prices'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_pendle_search_assets'), 'market-data');
	assert.equal(classifyDefiToolPack('ctm_pendle_quote_mint_py'), 'mint-redeem');
	assert.equal(classifyDefiToolPack('ctm_pendle_build_redeem_sy_multisign'), 'mint-redeem');
	assert.equal(classifyDefiToolPack('ctm_pendle_quote_swap'), 'swaps');
	assert.equal(classifyDefiToolPack('ctm_pendle_build_swap_multisign'), 'swaps');
	assert.equal(classifyDefiToolPack('ctm_pendle_quote_add_liquidity'), 'lp');
	assert.equal(classifyDefiToolPack('ctm_pendle_build_remove_liquidity_multisign'), 'lp');
	assert.equal(classifyDefiToolPack('ctm_pendle_fetch_merkle_rewards'), 'rewards');
	assert.equal(classifyDefiToolPack('ctm_pendle_build_redeem_rewards_multisign'), 'rewards');
});

test('pinned init tool count stays bounded', () => {
	const pinnedGroups = new Set(DEFAULT_PINNED_GROUPS);
	let pinnedCount = 0;
	for (const [name, group] of Object.entries(TOOL_GROUP_BY_NAME)) {
		if (isToolPinnedAtInit(name, group, pinnedGroups)) {
			pinnedCount++;
		}
	}
	for (const name of PINNED_TOOL_NAMES) {
		if (!TOOL_GROUP_BY_NAME[name] && !name.startsWith('list_') && name !== 'search_continuum_tools') {
			// discovery-only names still counted in PINNED_TOOL_NAMES
		}
	}
	assert.ok(pinnedCount <= 40, `expected <=40 pinned mapped tools, got ${pinnedCount}`);
	assert.ok(PINNED_TOOL_NAMES.size <= 40);
	assert.equal(
		isToolPinnedAtInit('import_forge_dry_run_multi_sign_request', 'compose:forge', pinnedGroups),
		false,
	);
});

test('searchContinuumToolsSuggestion names forge file-import tool', () => {
	const inactive = () => false;
	const unloaded = searchContinuumToolsSuggestion('foundry compose import', undefined, inactive);
	assert.ok(unloaded?.includes('import_forge_dry_run_multi_sign_request'));
	assert.ok(unloaded?.includes('not create_forge_multi_sign_request'));
	assert.ok(!unloaded?.includes('activate_tool_group'));
	const active = (id: string) => id === 'mpc_compose';
	const loaded = searchContinuumToolsSuggestion('import foundry script', undefined, active);
	assert.ok(loaded?.includes('import_forge_dry_run_multi_sign_request'));
	assert.ok(!loaded?.includes('activate_tool_group'));
});

test('searchContinuumToolsSuggestion recommends load_defi_protocol for defi groups', () => {
	const inactive = () => false;
	const s = searchContinuumToolsSuggestion(
		'hyperliquid ohlcv',
		{group: 'defi:hyperliquid:market-data', loaded: false},
		inactive,
	);
	assert.ok(s?.includes('load_defi_protocol'));
	assert.ok(s?.includes('hyperliquid'));
	assert.ok(s?.includes('Do not use activate_tool_group'));
});

test('searchContinuumToolsSuggestion says wire callable for non-defi groups', () => {
	const inactive = () => false;
	const s = searchContinuumToolsSuggestion(
		'peer relay mqtt',
		{group: 'node_config', loaded: false},
		inactive,
	);
	assert.ok(s?.includes('tools/list'));
	assert.ok(s?.includes('node_config'));
	assert.ok(!s?.includes('activate_tool_group'));
	assert.ok(!s?.includes('to enable these tools'));
});

test('searchContinuumToolsSuggestion recommends load_defi_protocol for Compound III', () => {
	const inactive = () => false;
	const s = searchContinuumToolsSuggestion('compound iii borrow against usdc', undefined, inactive);
	assert.ok(s?.includes('load_defi_protocol'));
	assert.ok(s?.includes('compound-v3'));
	assert.ok(s?.includes('Do not use activate_tool_group'));
});

test('searchContinuumToolsSuggestion prefers load_defi_protocol when query names a venue', () => {
	const inactive = () => false;
	const s = searchContinuumToolsSuggestion(
		'hyperliquid ohlcv',
		{group: 'chart:core', loaded: false},
		inactive,
	);
	assert.ok(s?.includes('load_defi_protocol'));
	assert.ok(s?.includes('hyperliquid'));
	assert.ok(s?.includes('not activate_tool_group') || s?.includes('Do not use activate_tool_group'));
});
