import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveToolGroupId} from '../dist/mcp/deferred/tool-group-map.js';
import {
	activateGroupIdsForContinuumTool,
	buildAgentHostCatalogJson,
	continuumToolNeedsDeferredAutoActivate,
	continuumToolNeedsOhlcvSessionBind,
	tradeBuildProtocolToDefiProtocolId,
} from '../dist/mcp/agent-host-catalog.js';

test('trade build tools map to chart group', () => {
	assert.equal(resolveToolGroupId('build_trade_from_trade_idea'), 'chart');
	assert.equal(resolveToolGroupId('list_trade_ideas'), 'chart');
});

test('catalog tools skip OHLCV session bind', () => {
	assert.equal(continuumToolNeedsOhlcvSessionBind('list_chart_analysis_options'), false);
	assert.equal(continuumToolNeedsOhlcvSessionBind('analyze_momentum'), true);
	assert.equal(continuumToolNeedsOhlcvSessionBind('build_trade_from_trade_idea'), true);
});

test('trade build protocol maps to defi bundle id', () => {
	assert.equal(tradeBuildProtocolToDefiProtocolId('uniswap'), 'uniswap-v4');
	assert.equal(tradeBuildProtocolToDefiProtocolId('hyperliquid'), 'hyperliquid');
});

test('activateGroupIdsForContinuumTool includes chart and defi for trade build', () => {
	const groups = activateGroupIdsForContinuumTool('build_trade_from_trade_idea', {
		tradeBuildProtocolId: 'uniswap',
	});
	assert.deepEqual(groups, ['chart', 'defi:uniswap-v4']);
});

test('deferred auto activate covers chart group trade tools', () => {
	assert.equal(continuumToolNeedsDeferredAutoActivate('build_trade_from_trade_idea'), true);
	assert.equal(continuumToolNeedsDeferredAutoActivate('activate_tool_group'), false);
});

test('buildAgentHostCatalogJson is serializable', () => {
	const catalog = buildAgentHostCatalogJson();
	assert.equal(catalog.version, 2);
	assert.equal(catalog.toolGroupByName.build_trade_from_trade_idea, 'chart');
	assert.ok(catalog.toolsWithoutOhlcvSessionBind.includes('list_chart_analysis_options'));
});

test('buildAgentHostCatalogJson embeds group and tool search tags', () => {
	const catalog = buildAgentHostCatalogJson();
	assert.ok(catalog.groupSearchTags.chart.includes('ohlcv'));
	assert.ok(catalog.groupSearchTags.registry_address_book.includes('contact'));
	assert.ok(catalog.toolSearchTags.get_address_book_registry.includes('contacts'));
});
