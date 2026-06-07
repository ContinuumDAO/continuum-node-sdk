import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {AnySchema} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type {McpToolDefinition} from '@continuumdao/ctm-mpc-defi/agent';
import {getMcpToolDefinitions} from '@continuumdao/ctm-mpc-defi/agent';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {DefiProtocolContext} from './context.js';
import {executeDefiMcpTool} from './handler.js';
import {MCP_NON_SUBMIT_TOOL_NAMES} from './catalog-adapter.js';
import {MULTISIGN_CREATE_GAS_GUIDANCE} from '../mpc-gas-docs.js';
import {
	UNISWAP_V4_API_KEY_TOOL_NAMES,
	UNISWAP_API_KEY_ENV,
	UNISWAP_API_KEY_SIGNUP_URL,
} from './uniswap-api-key.js';
import {defiToolInputSchema, defiToolOutputSchema} from './tool-schemas.js';

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
		!MCP_NON_SUBMIT_TOOL_NAMES.has(tool.name)
			? `Pass keyGenId + chainId + purposeText (server resolves keyGen, executorAddress, rpcUrl from get_chain_registry rpcGateway, chainDetail). Do not pass rpcUrl. ${MULTISIGN_CREATE_GAS_GUIDANCE}`
			: '',
		UNISWAP_V4_API_KEY_TOOL_NAMES.has(tool.name)
			? `Uses ${UNISWAP_API_KEY_ENV} from Node → AI Agent → Variables (get a key at ${UNISWAP_API_KEY_SIGNUP_URL}). The server injects the API key automatically — do not pass uniswapApiKey. Check configuration with list_environment_variables.${
					tool.name === 'ctm_uniswap_v4_quote'
						? ' Pass keyGenId (preferred KeyGen id) or swapper. Quote defaults match the node app: permit2Disabled true, slippage 0.5, native ETH tokenIn 0x0.'
						: ''
				}`
			: '',
		tool.prerequisites.length
			? `Prerequisites: ${tool.prerequisites.join('; ')}`
			: '',
		tool.followUp.length ? `Follow-up: ${tool.followUp.join('; ')}` : '',
	]
		.filter(Boolean)
		.join('\n');

	// Cast avoids TS2589 when vendored ctm-mpc-defi Zod types cross package boundaries.
	const schemaSource = tool as unknown as {
		name: string;
		inputZod: AnySchema;
		outputZod: AnySchema;
	};
	registerDefiToolOnServer(server, tool.name, {
		description,
		inputSchema: defiToolInputSchema(schemaSource),
		outputSchema: defiToolOutputSchema(schemaSource),
		handler: input => executeDefiMcpTool(config, defiContext, tool, input),
	});
}

type DefiToolRegistration = {
	description: string;
	inputSchema: AnySchema;
	outputSchema: AnySchema;
	handler: (input: unknown) => ReturnType<typeof executeDefiMcpTool>;
};

function registerDefiToolOnServer(
	server: McpServer,
	name: string,
	registration: DefiToolRegistration,
): void {
	server.registerTool(
		name,
		{
			description: registration.description,
			inputSchema: registration.inputSchema,
			outputSchema: registration.outputSchema,
		},
		registration.handler,
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
