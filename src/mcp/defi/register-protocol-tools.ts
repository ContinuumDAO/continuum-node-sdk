import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {McpToolDefinition} from '@continuumdao/ctm-mpc-defi/agent';
import {getMcpToolDefinitions} from '@continuumdao/ctm-mpc-defi/agent';
import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {DefiProtocolContext} from './context.js';
import {executeDefiMcpTool} from './handler.js';

const looseInputSchema = z.record(z.string(), z.unknown());

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
			inputSchema: looseInputSchema,
			outputSchema: z.record(z.string(), z.unknown()),
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
