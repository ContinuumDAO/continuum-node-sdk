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
	assert.equal(resolveToolGroupId('ctm_aave_v4_foo', {protocolId: 'aave-v4'}), 'defi:aave-v4');
	assert.equal(resolveToolGroupId('prepare_chart'), 'chart');
	assert.equal(resolveToolGroupId('build_trade_from_trade_idea'), 'chart');
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
});
