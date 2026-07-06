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
	defiOhlcvAnalysisWorkflowReminder,
	defiOhlcvChartWorkflowReminder,
	defiOhlcvWorkflowReminder,
	defiProtocolFetchOhlcvToolName,
} from './ohlcv-chart-workflow.js';
import {
	isUniswapApiKeyConfigured,
	UNISWAP_API_KEY_ENV,
	UNISWAP_API_KEY_SIGNUP_URL,
} from './uniswap-api-key.js';
import type {DeferredToolSession} from '../deferred/session.js';

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
	deferredSession?: DeferredToolSession,
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
				'Load DeFi protocol tools on the continuum MCP server (e.g. hyperliquid, gmx, aave-v4). ' +
				'Use this — NOT agent_load_mcp_server — when the operator names a DeFi venue. ' +
				'Then call ctm_<protocol>_fetch_ohlcv etc. Read-only fetch/chart needs no wallet/RPC setup. Idempotent.',
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
					ohlcvWorkflow: z.string().optional(),
					analysisWorkflow: z.string().optional(),
					chartWorkflow: z.string().optional(),
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
			const fetchOhlcvTool = defiProtocolFetchOhlcvToolName(protocolId);
			const analysisWorkflow = fetchOhlcvTool
				? defiOhlcvAnalysisWorkflowReminder(protocolId, fetchOhlcvTool)
				: undefined;
			const chartWorkflow = fetchOhlcvTool
				? defiOhlcvChartWorkflowReminder(protocolId, fetchOhlcvTool)
				: undefined;
			const ohlcvWorkflow = fetchOhlcvTool
				? defiOhlcvWorkflowReminder(protocolId, fetchOhlcvTool)
				: undefined;

			const buildPayload = (toolNames: string[]) => {
				const advisor = getProtocolSupportAdvisor(protocolId);
				const skill = getProtocolSkill(protocolId);
				return {
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
					...(ohlcvWorkflow ? {ohlcvWorkflow} : {}),
					...(analysisWorkflow ? {analysisWorkflow} : {}),
					...(chartWorkflow ? {chartWorkflow} : {}),
					...uniswapExtras,
				};
			};

			if (defiContext.isLoaded(protocolId)) {
				const payload = buildPayload(defiContext.getToolNames(protocolId));
				return {
					content: [{type: 'text' as const, text: JSON.stringify(payload)}],
					structuredContent: payload,
				};
			}

			const toolNames = markProtocolLoaded(defiContext, protocolId);
			if (deferredSession?.deferLoading) {
				deferredSession.activateGroup(`defi:${protocolId}`);
			}
			const payload = buildPayload(toolNames);
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
			if (deferredSession?.deferLoading) {
				deferredSession.deactivateGroup(`defi:${protocolId}`);
			}
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
				'Layer C: tokens supported by a protocol on a chain. rpcUrl is resolved from get_chain_registry rpcGateway for chainId (do not pass a public RPC URL).',
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
		async ({protocolId, chainId}) => {
			const advisor = getProtocolSupportAdvisor(protocolId);
			if (!advisor) {
				return {
					content: [
						{type: 'text' as const, text: `No support advisor for: ${protocolId}`},
					],
					isError: true,
				};
			}
			const chain = await resolveChainRegistryEntry(config, chainId);
			const resolvedRpc = chain.ok
				? String(chain.data.rpcGateway ?? '').trim() || undefined
				: undefined;
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
