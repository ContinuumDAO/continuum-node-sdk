import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {
	getProtocolSkill,
	getProtocolSupportAdvisor,
	getToolsForProtocol,
} from './catalog-adapter.js';
import {getProtocolModules} from '@continuumdao/ctm-mpc-defi/agent';
import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import {resolveChainRegistryEntry} from '../../core/registry/networks.js';
import type {DefiProtocolContext} from './context.js';
import {markProtocolLoaded} from './register-protocol-tools.js';
import {
	isUniswapApiKeyConfigured,
	UNISWAP_API_KEY_ENV,
	UNISWAP_API_KEY_SIGNUP_URL,
} from './uniswap-api-key.js';

const protocolIdSchema = z.object({
	protocolId: z.string().min(1),
});

const protocolChainSchema = z.object({
	protocolId: z.string().min(1),
	chainId: z.number().int().positive(),
	rpcUrl: z.string().optional(),
});

export function registerDefiDiscoveryTools(
	server: McpServer,
	config: NodeSdkConfig,
	defiContext: DefiProtocolContext,
): void {
	server.registerTool(
		'list_defi_protocols',
		{
			description:
				'List DeFi protocols available for load_defi_protocol, grouped by chain category.',
			inputSchema: z.object({}).strict(),
			outputSchema: z
				.object({
					protocols: z.array(
						z.object({
							protocolId: z.string(),
							chainCategory: z.string(),
							loaded: z.boolean(),
							actionCount: z.number(),
							toolCount: z.number(),
						}),
					),
				})
				.strict(),
		},
		async () => {
			const protocols = getProtocolModules().map(p => ({
				protocolId: p.id,
				chainCategory: p.chainCategory,
				loaded: defiContext.isLoaded(p.id),
				actionCount: p.actions.length,
				toolCount: getToolsForProtocol(p.id).length,
			}));
			return {
				content: [{type: 'text' as const, text: JSON.stringify({protocols})}],
				structuredContent: {protocols},
			};
		},
	);

	server.registerTool(
		'load_defi_protocol',
		{
			description:
				'Load MCP tools and advisory context for a DeFi protocol (e.g. aave-v4, uniswap-v4). Idempotent. For uniswap-v4, response includes uniswapApiKeyConfigured (from UNISWAP_API_KEY Variable). Use list_environment_variables to inspect Variables.',
			inputSchema: protocolIdSchema,
			outputSchema: z
				.object({
					loaded: z.boolean(),
					protocolId: z.string(),
					toolNames: z.array(z.string()),
					tokenFilter: z.string().optional(),
					advisoryTools: z.array(z.string()),
					skillPreview: z.string().optional(),
					skillHint: z.string().optional(),
					uniswapApiKeyConfigured: z.boolean().optional(),
					uniswapApiKeyEnvVar: z.string().optional(),
					uniswapApiKeySignupUrl: z.string().optional(),
				})
				.strict(),
		},
		async ({protocolId}) => {
			const mod = getProtocolModules().find(p => p.id === protocolId);
			if (!mod) {
				return {
					content: [{type: 'text' as const, text: `Unknown protocol: ${protocolId}`}],
					isError: true,
				};
			}
			const uniswapExtras =
				protocolId === 'uniswap-v4'
					? {
							uniswapApiKeyConfigured: await isUniswapApiKeyConfigured(config),
							uniswapApiKeyEnvVar: UNISWAP_API_KEY_ENV,
							uniswapApiKeySignupUrl: UNISWAP_API_KEY_SIGNUP_URL,
						}
					: {};

			if (defiContext.isLoaded(protocolId)) {
				const advisor = getProtocolSupportAdvisor(protocolId);
				const skill = getProtocolSkill(protocolId);
				const payload = {
					loaded: true,
					protocolId,
					toolNames: defiContext.getToolNames(protocolId),
					tokenFilter: advisor?.tokenFilter,
					advisoryTools: [
						'get_defi_protocol_supported_chains',
						'get_defi_protocol_supported_tokens',
						'get_defi_protocol_skill',
					],
					skillPreview: skill?.slice(0, 500),
					skillHint: skill
						? 'Call get_defi_protocol_skill for full SKILL.md workflow guidance.'
						: undefined,
					...uniswapExtras,
				};
				return {
					content: [{type: 'text' as const, text: JSON.stringify(payload)}],
					structuredContent: payload,
				};
			}

			const toolNames = markProtocolLoaded(defiContext, protocolId);
			const advisor = getProtocolSupportAdvisor(protocolId);
			const skill = getProtocolSkill(protocolId);
			const payload = {
				loaded: true,
				protocolId,
				toolNames,
				tokenFilter: advisor?.tokenFilter,
				advisoryTools: [
					'get_defi_protocol_supported_chains',
					'get_defi_protocol_supported_tokens',
					'get_defi_protocol_skill',
				],
				skillPreview: skill?.slice(0, 500),
				skillHint: skill
					? 'Call get_defi_protocol_skill for full SKILL.md workflow guidance.'
					: undefined,
				...uniswapExtras,
			};
			void server.server.sendToolListChanged?.().catch(() => undefined);
			return {
				content: [{type: 'text' as const, text: JSON.stringify(payload)}],
				structuredContent: payload,
			};
		},
	);

	server.registerTool(
		'unload_defi_protocol',
		{
			description:
				'Unload DeFi protocol context. Protocol tools remain registered but return errors until reloaded (soft unload).',
			inputSchema: protocolIdSchema,
			outputSchema: z
				.object({
					unloaded: z.boolean(),
					protocolId: z.string(),
					removedToolNames: z.array(z.string()),
					remainingLoaded: z.array(z.string()),
				})
				.strict(),
		},
		async ({protocolId}) => {
			if (!defiContext.isLoaded(protocolId)) {
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify({
								unloaded: false,
								protocolId,
								removedToolNames: [],
								remainingLoaded: defiContext.getLoadedProtocols(),
							}),
						},
					],
					structuredContent: {
						unloaded: false,
						protocolId,
						removedToolNames: [],
						remainingLoaded: defiContext.getLoadedProtocols(),
					},
				};
			}
			const removedToolNames = defiContext.markUnloaded(protocolId);
			const payload = {
				unloaded: true,
				protocolId,
				removedToolNames,
				remainingLoaded: defiContext.getLoadedProtocols(),
			};
			return {
				content: [{type: 'text' as const, text: JSON.stringify(payload)}],
				structuredContent: payload,
			};
		},
	);

	server.registerTool(
		'get_defi_protocol_skill',
		{
			description: 'Return SKILL.md markdown for a DeFi protocol.',
			inputSchema: protocolIdSchema,
			outputSchema: z.object({protocolId: z.string(), skill: z.string()}).strict(),
		},
		async ({protocolId}) => {
			const skill = getProtocolSkill(protocolId);
			if (!skill) {
				return {
					content: [
						{type: 'text' as const, text: `No SKILL.md for protocol: ${protocolId}`},
					],
					isError: true,
				};
			}
			const payload = {protocolId, skill};
			return {
				content: [{type: 'text' as const, text: skill}],
				structuredContent: payload,
			};
		},
	);

	server.registerTool(
		'get_defi_protocol_supported_chains',
		{
			description:
				'Layer B: chain IDs supported by a DeFi protocol. Intersect with get_chain_registry.',
			inputSchema: protocolIdSchema,
			outputSchema: z
				.object({
					protocolId: z.string(),
					chainIds: z.array(z.number()),
					tokenFilter: z.string().optional(),
				})
				.strict(),
		},
		async ({protocolId}) => {
			const advisor = getProtocolSupportAdvisor(protocolId);
			if (!advisor) {
				return {
					content: [
						{type: 'text' as const, text: `No support advisor for: ${protocolId}`},
					],
					isError: true,
				};
			}
			const chainIds = await advisor.supportedChainIds();
			const payload = {
				protocolId,
				chainIds,
				tokenFilter: advisor.tokenFilter,
			};
			return {
				content: [{type: 'text' as const, text: JSON.stringify(payload)}],
				structuredContent: payload,
			};
		},
	);

	server.registerTool(
		'get_defi_protocol_supported_tokens',
		{
			description:
				'Layer C: tokens supported by a protocol on a chain. Optional rpcUrl overrides chain registry lookup.',
			inputSchema: protocolChainSchema,
			outputSchema: z
				.object({
					protocolId: z.string(),
					chainId: z.number(),
					tokens: z.array(z.record(z.string(), z.unknown())),
					nativeWrapped: z.string().optional(),
					notes: z.string().optional(),
				})
				.strict(),
		},
		async ({protocolId, chainId, rpcUrl}) => {
			const advisor = getProtocolSupportAdvisor(protocolId);
			if (!advisor) {
				return {
					content: [
						{type: 'text' as const, text: `No support advisor for: ${protocolId}`},
					],
					isError: true,
				};
			}
			let resolvedRpc = rpcUrl?.trim();
			if (!resolvedRpc) {
				const chain = await resolveChainRegistryEntry(config, chainId);
				if (chain.ok) {
					resolvedRpc = String(chain.data.rpcGateway ?? '').trim() || undefined;
				}
			}
			const result = await advisor.supportedTokens(chainId, {
				rpcUrl: resolvedRpc,
			});
			const payload = {
				protocolId,
				chainId,
				tokens: result.tokens,
				nativeWrapped: result.nativeWrapped,
				notes: result.notes,
			};
			return {
				content: [{type: 'text' as const, text: JSON.stringify(payload)}],
				structuredContent: payload,
			};
		},
	);
}
