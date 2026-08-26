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
		'defi:uniswap-v4:swaps',
		'defi:uniswap-v4:market-data',
	]);
	const gmxGroups = activateGroupIdsForContinuumTool('build_trade_from_trade_idea', {
		tradeBuildProtocolId: 'gmx',
	});
	assert.ok(gmxGroups.includes('defi:gmx:perps'));
	assert.ok(gmxGroups.includes('defi:gmx:market-data'));
});

test('resolveActivateGroupIds expands chart and defi aliases', () => {
	assert.deepEqual(resolveActivateGroupIds('chart'), ['chart:core']);
	assert.deepEqual(resolveActivateGroupIds('defi:hyperliquid'), [
		'defi:hyperliquid:market-data',
	]);
	assert.deepEqual(resolveActivateGroupIds('chart:analyze'), [
		'chart:patterns',
		'chart:indicators',
		'chart:structure',
	]);
	assert.deepEqual(resolveActivateGroupIds('hyperliquid:orders'), ['defi:hyperliquid:orders']);
	assert.deepEqual(resolveActivateGroupIds('hyperliquid:trading'), [
		'defi:hyperliquid:orders',
		'defi:hyperliquid:transfer',
		'defi:hyperliquid:staking',
	]);
	assert.deepEqual(resolveActivateGroupIds('continuum-dao:forum'), ['defi:continuum-dao:forum']);
	assert.deepEqual(resolveActivateGroupIds('uniswap:swap'), ['defi:uniswap-v4:swaps']);
	assert.deepEqual(resolveActivateGroupIds('uniswap:trading'), [
		'defi:uniswap-v4:swaps',
		'defi:uniswap-v4:lp',
		'defi:uniswap-v4:rewards',
	]);
	assert.deepEqual(resolveActivateGroupIds('morpho:trading'), [
		'defi:morpho:vault',
		'defi:morpho:blue',
		'defi:morpho:midnight',
		'defi:morpho:rewards',
	]);
	assert.deepEqual(resolveActivateGroupIds('arcus:orders'), ['defi:arcus:orders']);
	assert.deepEqual(resolveActivateGroupIds('gmx:liquidity'), ['defi:gmx:liquidity']);
	assert.deepEqual(resolveActivateGroupIds('mpc_compose'), [
		'compose:forge',
		'compose:transfer',
		'compose:multisign',
	]);
	assert.deepEqual(resolveActivateGroupIds('social'), [
		'social:telegram',
		'social:discord',
		'social:reddit',
	]);
	assert.deepEqual(resolveActivateGroupIds('social_search'), [
		'social:telegram',
		'social:discord',
		'social:reddit',
	]);
});

test('deferred auto activate covers chart group trade tools', () => {
	assert.equal(continuumToolNeedsDeferredAutoActivate('build_trade_from_trade_idea'), true);
	assert.equal(continuumToolNeedsDeferredAutoActivate('activate_tool_group'), false);
});

test('buildAgentHostCatalogJson is serializable', () => {
	const catalog = buildAgentHostCatalogJson();
	assert.equal(catalog.version, 4);
	assert.equal(catalog.toolGroupByName.build_trade_from_trade_idea, 'chart:trade');
	assert.equal(catalog.toolGroupByName.prepare_chart, 'chart:core');
	assert.equal(catalog.toolGroupByName.send_telegram_message, 'agent_telegram');
	assert.equal(catalog.toolGroupByName.search_telegram_messages, 'social:telegram');
	assert.equal(catalog.toolGroupByName.search_telegram_tickers, 'social:telegram');
	assert.equal(catalog.toolGroupByName.search_discord_messages, 'social:discord');
	assert.equal(catalog.toolGroupByName.search_reddit_posts, 'social:reddit');
	assert.ok(catalog.toolsWithoutOhlcvSessionBind.includes('list_chart_analysis_options'));
	assert.ok(catalog.toolsWithoutOhlcvSessionBind.includes('list_ohlcv_sources'));
	assert.deepEqual(catalog.groupActivateAliases?.chart, ['chart:core']);
	assert.deepEqual(catalog.groupActivateAliases?.['chart:analyze'], [
		'chart:patterns',
		'chart:indicators',
		'chart:structure',
	]);
	assert.deepEqual(catalog.groupActivateAliases?.['hyperliquid:orders'], [
		'defi:hyperliquid:orders',
	]);
	assert.ok((catalog.groupDescriptions['chart:core'] ?? '').length > 0);
});

test('buildAgentHostCatalogJson embeds group and tool search tags', () => {
	const catalog = buildAgentHostCatalogJson();
	assert.ok(catalog.groupSearchTags['chart:core'].includes('ohlcv'));
	assert.ok(catalog.groupSearchTags.registry_address_book.includes('contact'));
	assert.ok(catalog.toolSearchTags.get_address_book_registry.includes('contacts'));
});
