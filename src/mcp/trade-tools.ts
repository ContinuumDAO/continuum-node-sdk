import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	buildTradeFromTradeIdea,
	type BuildTradeProtocolId,
} from '../core/chart/analysis/trade-setups/build-trade.js';
import {
	evaluateTradeConsensus,
	type AnalysisTradeSetupKind,
	type TradeIdea,
} from '../core/chart/analysis/trade-setups/index.js';
import type {DefiProtocolContext} from './defi/context.js';
import {MCP_LOOSE_OBJECT_SCHEMA, camelToSnake, sdkResultToCallToolResult, wrapSdk} from './tool-utils.js';

const tradeIdeaSchema = MCP_LOOSE_OBJECT_SCHEMA;

const buildTradeBaseSchema = z
	.object({
		tradeIdea: tradeIdeaSchema.optional(),
		tradeIdeaId: z.string().trim().min(1).optional(),
		protocolId: z.enum(['hyperliquid', 'gmx']),
		keyGenId: z.string().trim().min(1),
		chainId: z.number().int().positive(),
		purposeText: z.string().trim().min(1),
		useCustomGas: z.boolean().optional(),
		entryOffsetPct: z.number().optional(),
		szHuman: z.string().trim().min(1).optional(),
		sizeUsdHuman: z.string().trim().min(1).optional(),
		collateralToken: z.string().trim().min(1).optional(),
		collateralAmountHuman: z.string().trim().min(1).optional(),
		marketKind: z.enum(['perp', 'spot']).optional(),
		tif: z.enum(['alo', 'gtc', 'ioc']).optional(),
		slippageBps: z.number().optional(),
	})
	.strict();

const submitConsensusSchema = buildTradeBaseSchema
	.extend({
		tradeIdeaId: z.string().trim().min(1),
		force: z.boolean().optional(),
		tradeIdeas: z.array(tradeIdeaSchema).optional(),
		tradeConsensus: MCP_LOOSE_OBJECT_SCHEMA.optional(),
	})
	.strict();

function parseTradeIdea(raw: unknown): TradeIdea | null {
	if (!raw || typeof raw !== 'object') {
		return null;
	}
	const idea = raw as TradeIdea;
	if (typeof idea.id !== 'string' || !idea.entry || typeof idea.entry.price !== 'number') {
		return null;
	}
	return idea;
}

function resolveTradeIdea(input: {
	tradeIdea?: unknown;
	tradeIdeaId?: string;
	tradeIdeas?: unknown[];
	analysisType?: AnalysisTradeSetupKind;
}): TradeIdea | null {
	if (input.tradeIdea) {
		return parseTradeIdea(input.tradeIdea);
	}
	const id = input.tradeIdeaId?.trim();
	if (!id || !Array.isArray(input.tradeIdeas)) {
		return null;
	}
	const ideas = input.tradeIdeas
		.map(parseTradeIdea)
		.filter((item): item is TradeIdea => item != null);
	if (input.analysisType) {
		return ideas.find(item => item.id === id && item.source.analysisType === input.analysisType) ?? null;
	}
	return ideas.find(item => item.id === id) ?? null;
}

function registerBuildTradeTool(
	server: McpServer,
	config: NodeSdkConfig,
	defiContext: DefiProtocolContext,
	name: string,
	description: string,
	analysisType?: AnalysisTradeSetupKind,
): void {
	server.registerTool(
		name,
		{
			description,
			inputSchema: buildTradeBaseSchema,
		},
		async input => {
			const idea = resolveTradeIdea({
				tradeIdea: input.tradeIdea,
				tradeIdeaId: input.tradeIdeaId,
				tradeIdeas: (input as {tradeIdeas?: unknown[]}).tradeIdeas,
				analysisType,
			});
			if (!idea) {
				return sdkResultToCallToolResult({
					ok: false,
					reason: analysisType
						? `No ${analysisType} trade idea found — pass tradeIdeaId from conversation.tradeIdeas or a bound tradeIdea object.`
						: 'No trade idea found — pass tradeIdeaId from conversation.tradeIdeas or a bound tradeIdea object.',
				});
			}
			return wrapSdk(
				buildTradeFromTradeIdea(config, defiContext, {
					tradeIdea: idea,
					protocolId: input.protocolId as BuildTradeProtocolId,
					keyGenId: input.keyGenId,
					chainId: input.chainId,
					purposeText: input.purposeText,
					useCustomGas: input.useCustomGas,
					entryOffsetPct: input.entryOffsetPct,
					szHuman: input.szHuman,
					sizeUsdHuman: input.sizeUsdHuman,
					collateralToken: input.collateralToken,
					collateralAmountHuman: input.collateralAmountHuman,
					marketKind: input.marketKind,
					tif: input.tif,
					slippageBps: input.slippageBps,
				}),
			);
		},
	);
}

export function registerTradeTools(
	server: McpServer,
	config: NodeSdkConfig,
	defiContext: DefiProtocolContext,
): void {
	registerBuildTradeTool(
		server,
		config,
		defiContext,
		'build_trade_from_trade_idea',
		'Submit a multisign trade draft from a TradeIdea registry entry (bound tradeIdeas[] or explicit tradeIdea). Maps entry/side to Hyperliquid limit or GMX increase via DeFi bridge. Returns { requestId }.',
	);
	registerBuildTradeTool(
		server,
		config,
		defiContext,
		'build_trade_from_chart_pattern',
		'Like build_trade_from_trade_idea but filters conversation.tradeIdeas to chart_pattern analysisType.',
		'chart_pattern',
	);
	registerBuildTradeTool(
		server,
		config,
		defiContext,
		'build_trade_from_candlestick',
		'Like build_trade_from_trade_idea but filters conversation.tradeIdeas to candlestick analysisType.',
		'candlestick',
	);
	registerBuildTradeTool(
		server,
		config,
		defiContext,
		'build_trade_from_key_levels',
		'Like build_trade_from_trade_idea but filters conversation.tradeIdeas to key_levels analysisType.',
		'key_levels',
	);
	registerBuildTradeTool(
		server,
		config,
		defiContext,
		'build_trade_from_momentum',
		'Like build_trade_from_trade_idea but filters conversation.tradeIdeas to momentum analysisType.',
		'momentum',
	);

	server.registerTool(
		'submit_trade_from_consensus',
		{
			description:
				'Cron-only: after tradeConsensus gate, submit multisign for agent-selected tradeIdeaId. Re-evaluates consensus unless force=true. Delegates to build_trade_from_trade_idea bridge.',
			inputSchema: submitConsensusSchema,
		},
		async input => {
			const ideas = (input.tradeIdeas ?? [])
				.map(parseTradeIdea)
				.filter((item): item is TradeIdea => item != null);
			const consensus = evaluateTradeConsensus(
				ideas,
				(input.tradeConsensus as Record<string, unknown> | undefined) ?? {},
			);
			if (consensus.gate === 'BLOCKED' && !input.force) {
				return sdkResultToCallToolResult({
					ok: false,
					reason: `Consensus gate BLOCKED: ${consensus.blockers.join(' ')}`,
				});
			}
			const idea = resolveTradeIdea({
				tradeIdeaId: input.tradeIdeaId,
				tradeIdeas: ideas,
			});
			if (!idea) {
				return sdkResultToCallToolResult({
					ok: false,
					reason: `tradeIdeaId ${input.tradeIdeaId} not found in bound tradeIdeas registry.`,
				});
			}
			if (idea.status !== 'clear' && !input.force) {
				return sdkResultToCallToolResult({
					ok: false,
					reason: `Trade idea ${idea.id} status is ${idea.status}${idea.unclearReason ? `: ${idea.unclearReason}` : ''}.`,
				});
			}
			const built = await buildTradeFromTradeIdea(config, defiContext, {
				tradeIdea: idea,
				protocolId: input.protocolId as BuildTradeProtocolId,
				keyGenId: input.keyGenId,
				chainId: input.chainId,
				purposeText: input.purposeText,
				useCustomGas: input.useCustomGas,
				entryOffsetPct: input.entryOffsetPct,
				szHuman: input.szHuman,
				sizeUsdHuman: input.sizeUsdHuman,
				collateralToken: input.collateralToken,
				collateralAmountHuman: input.collateralAmountHuman,
				marketKind: input.marketKind,
				tif: input.tif,
				slippageBps: input.slippageBps,
			});
			if (!built.ok) {
				return sdkResultToCallToolResult(built);
			}
			return sdkResultToCallToolResult({
				ok: true,
				data: {
					...built.data,
					consensusGate: consensus.gate,
					consensusBlockers: consensus.blockers,
				},
			});
		},
	);
}

export {camelToSnake};
