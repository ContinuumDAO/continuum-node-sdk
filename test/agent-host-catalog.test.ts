import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	resolveActivateGroupIds,
	resolveToolGroupId,
} from '../dist/mcp/deferred/tool-group-map.js';
import {
	activateGroupIdsForContinuumTool,
	buildAgentHostCatalogJson,
	continuumToolNeedsDeferredAutoActivate,
	continuumToolNeedsOhlcvSessionBind,
	tradeBuildProtocolToDefiProtocolId,
} from '../dist/mcp/agent-host-catalog.js';

test('trade build tools map to chart:trade pack', () => {
	assert.equal(resolveToolGroupId('build_trade_from_trade_idea'), 'chart:trade');
	assert.equal(resolveToolGroupId('list_trade_ideas'), 'chart:trade');
});

test('catalog tools skip OHLCV session bind', () => {
	assert.equal(continuumToolNeedsOhlcvSessionBind('list_chart_analysis_options'), false);
	assert.equal(continuumToolNeedsOhlcvSessionBind('list_ohlcv_sources'), false);
	assert.equal(continuumToolNeedsOhlcvSessionBind('analyze_momentum'), true);
	assert.equal(continuumToolNeedsOhlcvSessionBind('build_trade_from_trade_idea'), true);
});

test('trade build protocol maps to defi bundle id', () => {
	assert.equal(tradeBuildProtocolToDefiProtocolId('uniswap'), 'uniswap-v4');
	assert.equal(tradeBuildProtocolToDefiProtocolId('hyperliquid'), 'hyperliquid');
});

test('activateGroupIdsForContinuumTool includes chart:trade and defi packs for trade build', () => {
	const groups = activateGroupIdsForContinuumTool('build_trade_from_trade_idea', {
		tradeBuildProtocolId: 'uniswap',
	});
	assert.deepEqual(groups, [
		'chart:trade',
		'defi:uniswap-v4:trading',
		'defi:uniswap-v4:market-data',
	]);
});

test('resolveActivateGroupIds expands chart and defi aliases', () => {
	assert.deepEqual(resolveActivateGroupIds('chart'), ['chart:core']);
	assert.deepEqual(resolveActivateGroupIds('defi:hyperliquid'), [
		'defi:hyperliquid:market-data',
	]);
	assert.deepEqual(resolveActivateGroupIds('chart:analyze'), ['chart:analyze']);
});

test('deferred auto activate covers chart group trade tools', () => {
	assert.equal(continuumToolNeedsDeferredAutoActivate('build_trade_from_trade_idea'), true);
	assert.equal(continuumToolNeedsDeferredAutoActivate('activate_tool_group'), false);
});

test('buildAgentHostCatalogJson is serializable', () => {
	const catalog = buildAgentHostCatalogJson();
	assert.equal(catalog.version, 3);
	assert.equal(catalog.toolGroupByName.build_trade_from_trade_idea, 'chart:trade');
	assert.equal(catalog.toolGroupByName.prepare_chart, 'chart:core');
	assert.equal(catalog.toolGroupByName.send_telegram_message, 'agent_telegram');
	assert.ok(catalog.toolsWithoutOhlcvSessionBind.includes('list_chart_analysis_options'));
	assert.ok(catalog.toolsWithoutOhlcvSessionBind.includes('list_ohlcv_sources'));
	assert.deepEqual(catalog.groupActivateAliases?.chart, ['chart:core']);
});

test('buildAgentHostCatalogJson embeds group and tool search tags', () => {
	const catalog = buildAgentHostCatalogJson();
	assert.ok(catalog.groupSearchTags['chart:core'].includes('ohlcv'));
	assert.ok(catalog.groupSearchTags.registry_address_book.includes('contact'));
	assert.ok(catalog.toolSearchTags.get_address_book_registry.includes('contacts'));
});
