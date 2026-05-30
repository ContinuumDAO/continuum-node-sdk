import {
	getMcpToolDefinitions,
	getProtocolModules,
	getProtocolSkill,
	type McpToolDefinition,
} from '@continuumdao/ctm-mpc-defi/agent';

export { getProtocolSkill };

/** Common EVM chain IDs probed via ProtocolModule.isChainSupported. */
const CANDIDATE_EVM_CHAIN_IDS = [
	1, 5, 10, 56, 137, 480, 130, 196, 324, 480, 1868, 4217, 7777777, 81457,
	8453, 84531, 84532, 10143, 42161, 421613, 43114, 42220, 44787, 59144,
	11155111, 420, 80001,
] as const;

export type ProtocolSupportAdvisor = {
	tokenFilter?: string;
	supportedChainIds(): Promise<number[]>;
	supportedTokens(
		chainId: number,
		options?: {rpcUrl?: string},
	): Promise<{
		tokens: Array<Record<string, unknown>>;
		nativeWrapped?: string;
		notes?: string;
	}>;
};

function isNonSubmitTool(tool: McpToolDefinition): boolean {
	const props = tool.outputSchema.properties;
	return !(
		props &&
		'bodyForSign' in props &&
		'messageToSign' in props
	);
}

/** Tools that return data directly (quote/swap prep) rather than { requestId } via multiSign POST. */
export const MCP_NON_SUBMIT_TOOL_NAMES = new Set(
	getMcpToolDefinitions().filter(isNonSubmitTool).map(tool => tool.name),
);

export function getToolsForProtocol(protocolId: string): readonly McpToolDefinition[] {
	return getMcpToolDefinitions().filter(tool => tool.protocolId === protocolId);
}

export function getProtocolSupportAdvisor(
	protocolId: string,
): ProtocolSupportAdvisor | undefined {
	const mod = getProtocolModules().find(p => p.id === protocolId);
	if (!mod) {
		return undefined;
	}

	return {
		tokenFilter: mod.chainCategory,
		async supportedChainIds() {
			if (mod.chainCategory !== 'evm') {
				return [];
			}
			const chainIds: number[] = [];
			for (const chainId of CANDIDATE_EVM_CHAIN_IDS) {
				if (
					await mod.isChainSupported({
						chainCategory: 'evm',
						chainId,
					})
				) {
					chainIds.push(chainId);
				}
			}
			return [...new Set(chainIds)].sort((a, b) => a - b);
		},
		async supportedTokens(chainId, options) {
			const rpcUrl = options?.rpcUrl?.trim();
			const chainOk = await mod.isChainSupported({
				chainCategory: mod.chainCategory,
				chainId,
			});
			if (!chainOk) {
				return {
					tokens: [],
					notes: `${protocolId} does not support chain ${chainId}.`,
				};
			}
			return {
				tokens: [],
				notes: rpcUrl
					? `On-chain token discovery for ${protocolId} is not implemented in the vendored defi catalog. Use get_token_registry or protocol tool inputs.`
					: `Configure chain ${chainId} in get_chain_registry (rpcGateway) before token discovery. Token lists are not bundled for ${protocolId}.`,
			};
		},
	};
}
