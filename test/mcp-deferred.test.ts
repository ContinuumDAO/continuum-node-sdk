import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
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
	assert.equal(resolveToolGroupId('create_compose_multi_sign_request'), 'mpc_compose');
	assert.equal(resolveToolGroupId('create_compose_eip712_multi_sign_request'), 'mpc_compose');
	assert.equal(resolveToolGroupId('ctm_aave_v4_foo', {protocolId: 'aave-v4'}), 'defi:aave-v4:other');
	assert.equal(
		resolveToolGroupId('ctm_hyperliquid_fetch_ohlcv', {protocolId: 'hyperliquid'}),
		'defi:hyperliquid:market-data',
	);
	assert.equal(resolveToolGroupId('prepare_chart'), 'chart:core');
	assert.equal(resolveToolGroupId('analyze_elliott_waves'), 'chart:analyze');
	assert.equal(resolveToolGroupId('apply_elliott_wave_drawings'), 'chart:drawings');
	assert.equal(resolveToolGroupId('build_trade_from_trade_idea'), 'chart:trade');
	assert.equal(resolveToolGroupId('get_kline_candles'), 'unknown');
	assert.equal(resolveToolGroupId('set_vpn_enabled'), 'unknown');
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
		isToolPinnedAtInit('import_forge_dry_run_multi_sign_request', 'mpc_compose', pinnedGroups),
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
