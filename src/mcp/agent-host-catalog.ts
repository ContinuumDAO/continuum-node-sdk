/**
 * Continuum MCP metadata for external agent hosts (e.g. mpc-auth) that auto-call tools
 * without an LLM activate_tool_group step. Keep in sync via dist/agent-host-catalog.json.
 */
import {
	resolveToolGroupId,
	stripMcpToolServerPrefix,
	TOOL_GROUP_BY_NAME,
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
	'submit_trade_from_consensus',
] as const;

/** UI / build_trade protocolId → load_defi_protocol / activate_tool_group defi bundle id. */
export const TRADE_BUILD_PROTOCOL_TO_DEFI_PROTOCOL_ID: Record<string, string> = {
	hyperliquid: 'hyperliquid',
	gmx: 'gmx',
	uniswap: 'uniswap-v4',
	lighter: 'lighter',
};

export const TRADE_BUILD_PROTOCOL_IDS = ['hyperliquid', 'gmx', 'uniswap', 'lighter'] as const;

/** MCP meta tools that expand tools/list — hosts should not auto-activate bundles after these. */
export const CONTINUUM_DISCOVERY_EXPANSION_TOOL_NAMES = [
	'activate_tool_group',
	'deactivate_tool_group',
	'load_defi_protocol',
	'unload_defi_protocol',
] as const;

const withoutOhlcvBind = new Set<string>(CONTINUUM_TOOLS_WITHOUT_OHLCV_SESSION_BIND);
const buildTradeTools = new Set<string>(CONTINUUM_BUILD_TRADE_TOOL_NAMES);
const discoveryExpansion = new Set<string>(CONTINUUM_DISCOVERY_EXPANSION_TOOL_NAMES);

export function continuumBareToolName(llmOrBareName: string): string {
	return stripMcpToolServerPrefix(llmOrBareName.trim());
}

export function continuumToolGroupId(toolName: string): string {
	return resolveToolGroupId(continuumBareToolName(toolName));
}

export function continuumToolNeedsOhlcvSessionBind(toolName: string): boolean {
	const bare = continuumBareToolName(toolName);
	if (withoutOhlcvBind.has(bare)) {
		return false;
	}
	return continuumToolGroupId(bare) === 'chart';
}

export function continuumToolNeedsDeferredAutoActivate(toolName: string): boolean {
	const bare = continuumBareToolName(toolName);
	if (discoveryExpansion.has(bare)) {
		return false;
	}
	const group = continuumToolGroupId(bare);
	return group === 'chart';
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
	if (group && group !== 'unknown' && group !== 'discovery' && !group.startsWith('defi:')) {
		out.push(group);
	}
	if (buildTradeTools.has(bare) && options?.tradeBuildProtocolId?.trim()) {
		const defiId = tradeBuildProtocolToDefiProtocolId(options.tradeBuildProtocolId);
		if (defiId) {
			out.push(`defi:${defiId}`);
		}
	}
	return [...new Set(out)];
}

export type AgentHostCatalogJson = {
	version: number;
	toolGroupByName: Record<string, string>;
	toolsWithoutOhlcvSessionBind: string[];
	buildTradeToolNames: string[];
	tradeBuildProtocolIds: string[];
	tradeBuildProtocolToDefiProtocolId: Record<string, string>;
	discoveryExpansionToolNames: string[];
};

export function buildAgentHostCatalogJson(): AgentHostCatalogJson {
	return {
		version: 1,
		toolGroupByName: {...TOOL_GROUP_BY_NAME},
		toolsWithoutOhlcvSessionBind: [...CONTINUUM_TOOLS_WITHOUT_OHLCV_SESSION_BIND],
		buildTradeToolNames: [...CONTINUUM_BUILD_TRADE_TOOL_NAMES],
		tradeBuildProtocolIds: [...TRADE_BUILD_PROTOCOL_IDS],
		tradeBuildProtocolToDefiProtocolId: {...TRADE_BUILD_PROTOCOL_TO_DEFI_PROTOCOL_ID},
		discoveryExpansionToolNames: [...CONTINUUM_DISCOVERY_EXPANSION_TOOL_NAMES],
	};
}
