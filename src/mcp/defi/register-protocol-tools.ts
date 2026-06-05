import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {McpToolDefinition} from '@continuumdao/ctm-mpc-defi/agent';
import {getMcpToolDefinitions} from '@continuumdao/ctm-mpc-defi/agent';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {DefiProtocolContext} from './context.js';
import {executeDefiMcpTool} from './handler.js';
import {MCP_NON_SUBMIT_TOOL_NAMES} from './catalog-adapter.js';
import {MCP_LOOSE_OBJECT_SCHEMA} from '../tool-utils.js';
import {MULTISIGN_CREATE_GAS_GUIDANCE} from '../mpc-gas-docs.js';
import {
	UNISWAP_V4_API_KEY_TOOL_NAMES,
	UNISWAP_API_KEY_ENV,
	UNISWAP_API_KEY_SIGNUP_URL,
} from './uniswap-api-key.js';

/** Register every DeFi catalog tool; calls are gated by DefiProtocolContext.load state. */
export function registerAllDefiProtocolTools(
	server: McpServer,
	config: NodeSdkConfig,
	defiContext: DefiProtocolContext,
): void {
	const byProtocol = new Map<string, string[]>();
	for (const tool of getMcpToolDefinitions()) {
		registerDefiTool(server, config, defiContext, tool);
		const list = byProtocol.get(tool.protocolId) ?? [];
		list.push(tool.name);
		byProtocol.set(tool.protocolId, list);
	}
	for (const [protocolId, toolNames] of byProtocol) {
		if (defiContext.isLoaded(protocolId)) {
			defiContext.markLoaded(protocolId, toolNames);
		}
	}
}

function registerDefiTool(
	server: McpServer,
	config: NodeSdkConfig,
	defiContext: DefiProtocolContext,
	tool: McpToolDefinition,
): void {
	const description = [
		tool.description,
		!MCP_NON_SUBMIT_TOOL_NAMES.has(tool.name) ? MULTISIGN_CREATE_GAS_GUIDANCE : '',
		UNISWAP_V4_API_KEY_TOOL_NAMES.has(tool.name)
			? `Uses ${UNISWAP_API_KEY_ENV} from Node → AI Agent → Variables (get a key at ${UNISWAP_API_KEY_SIGNUP_URL}). Do not pass uniswapApiKey in tool input.`
			: '',
		tool.prerequisites.length
			? `Prerequisites: ${tool.prerequisites.join('; ')}`
			: '',
		tool.followUp.length ? `Follow-up: ${tool.followUp.join('; ')}` : '',
	]
		.filter(Boolean)
		.join('\n');

	server.registerTool(
		tool.name,
		{
			description,
			inputSchema: MCP_LOOSE_OBJECT_SCHEMA,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async input => executeDefiMcpTool(config, defiContext, tool, input),
	);
}

export function markProtocolLoaded(
	defiContext: DefiProtocolContext,
	protocolId: string,
): string[] {
	const toolNames = getMcpToolDefinitions()
		.filter(t => t.protocolId === protocolId)
		.map(t => t.name);
	if (toolNames.length === 0) {
		throw new Error(`Unknown or empty DeFi protocol: ${protocolId}`);
	}
	defiContext.markLoaded(protocolId, toolNames);
	return toolNames;
}
