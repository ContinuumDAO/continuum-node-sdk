import {
	getMcpToolDefinitions,
	getProtocolSkill as getDefiProtocolSkill,
	getProtocolSupportAdvisor as getDefiProtocolSupportAdvisor,
	type McpToolDefinition,
} from '@continuumdao/ctm-mpc-defi/agent';

export function getProtocolSkill(protocolId: string): string | undefined {
	return getDefiProtocolSkill(protocolId);
}

export function getProtocolSupportAdvisor(protocolId: string) {
	return getDefiProtocolSupportAdvisor(protocolId);
}

function isNonSubmitTool(tool: McpToolDefinition): boolean {
	const props = tool.outputSchema.properties;
	return !(props && 'requestId' in props);
}

/** Tools that return data directly (quote/swap prep) rather than { requestId } via multiSign POST. */
export const MCP_NON_SUBMIT_TOOL_NAMES = new Set(
	getMcpToolDefinitions().filter(isNonSubmitTool).map(tool => tool.name),
);

export function getToolsForProtocol(protocolId: string): readonly McpToolDefinition[] {
	return getMcpToolDefinitions().filter(tool => tool.protocolId === protocolId);
}
