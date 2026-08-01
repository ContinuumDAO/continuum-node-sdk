/**
 * Continuum MCP metadata for external agent hosts (e.g. mpc-auth) that auto-call tools
 * without an LLM activate_tool_group step. Keep in sync via dist/agent-host-catalog.json.
 */
import {getMcpToolDefinitions} from '@continuumdao/ctm-mpc-defi/agent';
import {
	classifyDefiToolPack,
	defiProtocolPackGroupId,
	GROUP_SEARCH_TAGS,
	isChartFamilyGroupId,
	resolveToolGroupId,
	stripMcpToolServerPrefix,
	TOOL_GROUP_BY_NAME,
	TOOL_SEARCH_TAGS,
} from './deferred/tool-group-map.js';

/** Catalog/chart tools with strict empty or non-OHLCV input — hosts must not inject toolResult. */
export const CONTINUUM_TOOLS_WITHOUT_OHLCV_SESSION_BIND = [
	'list_chart_analysis_options',
	'list_chart_customization_options',
	'list_trade_ideas',
] as const;

export const CONTINUUM_BUILD_TRADE_TOOL_NAMES = [
	'build_trade_from_trade_idea',
	'build_trade_from_chart_pattern',
	'build_trade_from_candlestick',
	'build_trade_from_key_levels',
	'build_trade_from_momentum',
	'build_trade_from_divergence',
	'submit_trade_from_consensus',
] as const;

/** UI / build_trade protocolId → load_defi_protocol / activate_tool_group defi bundle id. */
export const TRADE_BUILD_PROTOCOL_TO_DEFI_PROTOCOL_ID: Record<string, string> = {
	hyperliquid: 'hyperliquid',
	arcus: 'arcus',
	gmx: 'gmx',
	uniswap: 'uniswap-v4',
};

export const TRADE_BUILD_PROTOCOL_IDS = ['hyperliquid', 'arcus', 'gmx', 'uniswap'] as const;

/**
 * Host meta tools that only mutate visibility bookkeeping — do not treat these as
 * "unknown tool → auto-activate its catalog group" recovery targets.
 * load_defi_protocol is intentionally omitted: defi_discovery is no longer default-pinned,
 * so calling load_defi_protocol must be allowed to expand that group into the LLM filter.
 */
export const CONTINUUM_DISCOVERY_EXPANSION_TOOL_NAMES = [
	'activate_tool_group',
	'deactivate_tool_group',
] as const;

const withoutOhlcvBind = new Set<string>(CONTINUUM_TOOLS_WITHOUT_OHLCV_SESSION_BIND);
const buildTradeTools = new Set<string>(CONTINUUM_BUILD_TRADE_TOOL_NAMES);
const discoveryExpansion = new Set<string>(CONTINUUM_DISCOVERY_EXPANSION_TOOL_NAMES);

export function continuumBareToolName(llmOrBareName: string): string {
	return stripMcpToolServerPrefix(llmOrBareName.trim());
}

export function continuumToolGroupId(toolName: string): string {
	const bare = continuumBareToolName(toolName);
	if (TOOL_GROUP_BY_NAME[bare]) {
		return TOOL_GROUP_BY_NAME[bare];
	}
	if (bare.startsWith('ctm_')) {
		// Protocol id is encoded in tool names as ctm_<protocol>_… — prefer catalog map from build.
		return resolveToolGroupId(bare);
	}
	return resolveToolGroupId(bare);
}

export function continuumToolNeedsOhlcvSessionBind(toolName: string): boolean {
	const bare = continuumBareToolName(toolName);
	if (withoutOhlcvBind.has(bare)) {
		return false;
	}
	return isChartFamilyGroupId(continuumToolGroupId(bare));
}

export function continuumToolNeedsDeferredAutoActivate(toolName: string): boolean {
	const bare = continuumBareToolName(toolName);
	if (discoveryExpansion.has(bare)) {
		return false;
	}
	return isChartFamilyGroupId(continuumToolGroupId(bare));
}

export function tradeBuildProtocolToDefiProtocolId(protocolId: string): string {
	const key = protocolId.trim().toLowerCase();
	return TRADE_BUILD_PROTOCOL_TO_DEFI_PROTOCOL_ID[key] ?? key;
}

export function activateGroupIdsForContinuumTool(
	toolName: string,
	options?: {tradeBuildProtocolId?: string},
): string[] {
	const bare = continuumBareToolName(toolName);
	const out: string[] = [];
	const group = continuumToolGroupId(bare);
	if (group && group !== 'unknown' && group !== 'discovery') {
		out.push(group);
	}
	if (buildTradeTools.has(bare) && options?.tradeBuildProtocolId?.trim()) {
		const defiId = tradeBuildProtocolToDefiProtocolId(options.tradeBuildProtocolId);
		if (defiId) {
			out.push(defiProtocolPackGroupId(defiId, 'trading'));
			out.push(defiProtocolPackGroupId(defiId, 'market-data'));
		}
	}
	return [...new Set(out)];
}

/** Build static + DeFi ctm_* tool → pack group map for host filtering. */
export function buildToolGroupByNameWithDefi(): Record<string, string> {
	const out: Record<string, string> = {...TOOL_GROUP_BY_NAME};
	for (const tool of getMcpToolDefinitions()) {
		out[tool.name] = defiProtocolPackGroupId(
			tool.protocolId,
			classifyDefiToolPack(tool.name),
		);
	}
	return out;
}

export type AgentHostCatalogJson = {
	version: number;
	toolGroupByName: Record<string, string>;
	toolsWithoutOhlcvSessionBind: string[];
	buildTradeToolNames: string[];
	tradeBuildProtocolIds: string[];
	tradeBuildProtocolToDefiProtocolId: Record<string, string>;
	discoveryExpansionToolNames: string[];
	/** Per-group keyword tags for host-side (non-LLM) catalog search — mirrors DeferredToolSession.searchTools. */
	groupSearchTags: Record<string, string[]>;
	/** Per-tool keyword tags layered on top of groupSearchTags for host-side catalog search. */
	toolSearchTags: Record<string, string[]>;
	/** activate_tool_group aliases (e.g. chart → chart:core). */
	groupActivateAliases: Record<string, string[]>;
};

export function buildAgentHostCatalogJson(): AgentHostCatalogJson {
	const toolGroupByName = buildToolGroupByNameWithDefi();
	const toolSearchTags: Record<string, string[]> = Object.fromEntries(
		Object.entries(TOOL_SEARCH_TAGS).map(([name, tags]) => [name, [...tags]]),
	);
	// OHLCV / perp synonyms on market-data fetch tools for host catalog search.
	for (const [name, group] of Object.entries(toolGroupByName)) {
		if (!group.endsWith(':market-data')) continue;
		const extra = ['defi', 'protocol', 'ohlcv', 'perp', 'market data'];
		if (name.includes('fetch_ohlcv')) {
			extra.push('fetch ohlcv', 'candles', 'chart data', '4 hour', '4h');
		}
		if (name.includes('fetch_markets') || name.includes('search_markets')) {
			extra.push('markets', 'perp markets');
		}
		toolSearchTags[name] = [...new Set([...(toolSearchTags[name] ?? []), ...extra])];
	}
	return {
		version: 3,
		toolGroupByName,
		toolsWithoutOhlcvSessionBind: [...CONTINUUM_TOOLS_WITHOUT_OHLCV_SESSION_BIND],
		buildTradeToolNames: [...CONTINUUM_BUILD_TRADE_TOOL_NAMES],
		tradeBuildProtocolIds: [...TRADE_BUILD_PROTOCOL_IDS],
		tradeBuildProtocolToDefiProtocolId: {...TRADE_BUILD_PROTOCOL_TO_DEFI_PROTOCOL_ID},
		discoveryExpansionToolNames: [...CONTINUUM_DISCOVERY_EXPANSION_TOOL_NAMES],
		groupSearchTags: Object.fromEntries(
			Object.entries(GROUP_SEARCH_TAGS).map(([group, tags]) => [group, [...tags]]),
		),
		toolSearchTags,
		groupActivateAliases: {
			chart: ['chart:core'],
		},
	};
}
