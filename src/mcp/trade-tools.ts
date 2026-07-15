import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	buildTradeFromTradeIdea,
	type BuildTradeProtocolId,
} from '../core/chart/analysis/trade-setups/build-trade.js';
import type {EntryProximityMode} from '../core/chart/analysis/trade-setups/pattern-limit-entry.js';
import {
	evaluateTradeConsensus,
	listTradeIdeasFromRegistry,
	type AnalysisTradeSetupKind,
	type TradeIdea,
} from '../core/chart/analysis/trade-setups/index.js';
import {addCronJob} from '../core/agent/cron-jobs.js';
import {
	buildUniswapTpslMonitorCronMessage,
	evaluateUniswapTpslMonitor,
	uniswapTpslMonitorSchedule,
	uniswapTpslMonitorCronName,
	uniswapTpslPricesFromTradeIdea,
} from '../core/chart/analysis/trade-setups/uniswap-tpsl-monitor.js';
import {formatHumanPrice} from '../core/chart/analysis/trade-setups/build-trade.js';
import type {DefiProtocolContext} from './defi/context.js';
import {MCP_LOOSE_OBJECT_SCHEMA, camelToSnake, sdkResultToCallToolResult, wrapSdk} from './tool-utils.js';

const tradeIdeaSchema = MCP_LOOSE_OBJECT_SCHEMA;

const buildTradeBaseSchema = z
	.object({
		tradeIdea: tradeIdeaSchema.optional(),
		tradeIdeaId: z.string().trim().min(1).optional(),
		protocolId: z.enum(['hyperliquid', 'gmx', 'uniswap']),
		keyGenId: z.string().trim().min(1),
		chainId: z.number().int().positive(),
		purposeText: z.string().trim().min(1),
		useCustomGas: z.boolean().optional(),
		entryOffsetPct: z.number().optional(),
		invalidationOffsetPct: z.number().optional(),
		targetOffsetPct: z.number().optional(),
		targetOffsetMode: z.enum(['price', 'atr']).optional(),
		takeProfitSource: z.enum(['swing', 'impulse_leg']).optional(),
		tpslExecMode: z.enum(['limit_at_trigger', 'market']).optional(),
		entryProximityPct: z.number().optional(),
		szHuman: z.string().trim().min(1).optional(),
		sizeUsdHuman: z.string().trim().min(1).optional(),
		collateralToken: z.string().trim().min(1).optional(),
		collateralAmountHuman: z.string().trim().min(1).optional(),
		marketKind: z.enum(['perp', 'spot']).optional(),
		tif: z.enum(['alo', 'gtc', 'ioc']).optional(),
		slippageBps: z.number().optional(),
		orderKind: z.enum(['market', 'limit']).optional(),
		enableTpslMonitor: z.boolean().optional(),
		side: z.enum(['long', 'short']).optional(),
		expiryDate: z
			.number()
			.int()
			.positive()
			.optional()
			.describe(
				'Optional Unix seconds (UTC) for MPC sign request expiry. DeFi protocols default to 30 minutes when omitted.',
			),
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
			const built = await buildTradeFromTradeIdea(config, defiContext, {
				tradeIdea: idea,
				protocolId: input.protocolId as BuildTradeProtocolId,
				keyGenId: input.keyGenId,
				chainId: input.chainId,
				purposeText: input.purposeText,
				useCustomGas: input.useCustomGas,
				entryOffsetPct: input.entryOffsetPct,
				invalidationOffsetPct: input.invalidationOffsetPct,
				targetOffsetPct: input.targetOffsetPct,
				targetOffsetMode: input.targetOffsetMode as EntryProximityMode | undefined,
				takeProfitSource: input.takeProfitSource,
				tpslExecMode: input.tpslExecMode,
				entryProximityPct: input.entryProximityPct,
				szHuman: input.szHuman,
				sizeUsdHuman: input.sizeUsdHuman,
				collateralToken: input.collateralToken,
				collateralAmountHuman: input.collateralAmountHuman,
				marketKind: input.marketKind,
				tif: input.tif,
				slippageBps: input.slippageBps,
				orderKind: input.orderKind,
				enableTpslMonitor: input.enableTpslMonitor,
				side: input.side,
				expiryDate: input.expiryDate,
			});
			if (!built.ok) {
				return sdkResultToCallToolResult(built);
			}
			if (
				input.enableTpslMonitor &&
				input.protocolId === 'uniswap' &&
				(built.data.takeProfitPriceHuman || built.data.stopLossPriceHuman)
			) {
				const sizeUsd = input.sizeUsdHuman?.trim();
				const side =
					input.side ??
					(idea.side === 'long' || idea.side === 'short' ? idea.side : null);
				if (!sizeUsd || !side) {
					return sdkResultToCallToolResult({
						ok: true,
						data: {
							...built.data,
							tpslMonitorWarning:
								'enableTpslMonitor set but sizeUsdHuman or long/short side is missing — cron not registered.',
						},
					});
				}
				const cronName = uniswapTpslMonitorCronName(idea.id);
				const cronResult = await addCronJob(config, {
					name: cronName,
					message: buildUniswapTpslMonitorCronMessage({
						name: cronName,
						tradeIdeaId: idea.id,
						chainId: input.chainId,
						protocolId: 'uniswap',
						sizeUsdHuman: sizeUsd,
						keyGenId: input.keyGenId,
						pollEveryMinutes: 5,
						side,
						...(built.data.takeProfitPriceHuman
							? {takeProfitPriceHuman: built.data.takeProfitPriceHuman}
							: {}),
						...(built.data.stopLossPriceHuman
							? {stopLossPriceHuman: built.data.stopLossPriceHuman}
							: {}),
					}),
					schedule: uniswapTpslMonitorSchedule(5),
					enabled: true,
				});
				if (!cronResult.ok) {
					return sdkResultToCallToolResult({
						ok: true,
						data: {
							...built.data,
							tpslMonitorWarning: `Trade built but TP/SL cron registration failed: ${cronResult.reason}`,
						},
					});
				}
				return sdkResultToCallToolResult({
					ok: true,
					data: {
						...built.data,
						tpslMonitorCron: {
							name: cronName,
							jobId: cronResult.data.job.id,
						},
					},
				});
			}
			return sdkResultToCallToolResult(built);
		},
	);
}

const listTradeIdeasSchema = z
	.object({
		tradeIdeas: z.array(tradeIdeaSchema).optional(),
		status: z.enum(['clear', 'unclear']).optional(),
		analysisType: z
			.enum([
				'chart_pattern',
				'candlestick',
				'key_levels',
				'momentum',
				'trend_structure',
				'range_volatility',
				'time_series_trend',
				'time_series_momentum',
				'time_series_stats',
			])
			.optional(),
	})
	.strict();

const registerUniswapTpslMonitorSchema = z
	.object({
		name: z.string().trim().min(1).max(64),
		tradeIdeaId: z.string().trim().min(1),
		chainId: z.number().int().positive(),
		sizeUsdHuman: z.string().trim().min(1),
		keyGenId: z.string().trim().min(1),
		pollEveryMinutes: z.number().int().positive().max(24 * 60).optional(),
		takeProfitPriceHuman: z.string().trim().min(1).optional(),
		stopLossPriceHuman: z.string().trim().min(1).optional(),
		side: z.enum(['long', 'short']).optional(),
		tradeIdeas: z.array(tradeIdeaSchema).optional(),
		enabled: z.boolean().optional(),
	})
	.strict();

const evaluateUniswapTpslSchema = z
	.object({
		side: z.enum(['long', 'short']),
		lastPriceHuman: z.string().trim().min(1),
		takeProfitPriceHuman: z.string().trim().min(1).optional(),
		stopLossPriceHuman: z.string().trim().min(1).optional(),
	})
	.strict();

export function registerTradeTools(
	server: McpServer,
	config: NodeSdkConfig,
	defiContext: DefiProtocolContext,
): void {
	server.registerTool(
		'list_trade_ideas',
		{
			description:
				'List persisted trade ideas from analyze_* tools on the current chart dataset (bound tradeIdeas[]). Returns numbered menu rows (tradeIdeaNumber) with side, status, confidence, entry/target/invalidation, chartDataSource/chartInterval/chartBarCount, and measured-move % from entry. Required before synthesizing a conclusion or consensus across ideas — cite tradeIdeaNumber from items[] exactly. Use with build_trade_from_* to submit multisign.',
			inputSchema: listTradeIdeasSchema,
		},
		async input => {
			const ideas = (input.tradeIdeas ?? [])
				.map(parseTradeIdea)
				.filter((item): item is TradeIdea => item != null);
			const listed = listTradeIdeasFromRegistry({
				tradeIdeas: ideas,
				status: input.status,
				analysisType: input.analysisType as AnalysisTradeSetupKind | undefined,
			});
			return sdkResultToCallToolResult({ok: true, data: listed});
		},
	);

	registerBuildTradeTool(
		server,
		config,
		defiContext,
		'build_trade_from_trade_idea',
		'Submit a multisign trade draft from a TradeIdea registry entry (bound tradeIdeas[] or explicit tradeIdea). Hyperliquid/GMX limits; Uniswap spot (orderKind market) or UniswapX limit on mainnet (orderKind limit). Trend structure: takeProfitSource swing (default) or impulse_leg. Optional enableTpslMonitor + register_uniswap_tpsl_monitor_cron for agent-monitored TP/SL exits. Returns { requestId }.',
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
				invalidationOffsetPct: input.invalidationOffsetPct,
				targetOffsetPct: input.targetOffsetPct,
				targetOffsetMode: input.targetOffsetMode as EntryProximityMode | undefined,
				takeProfitSource: input.takeProfitSource,
				tpslExecMode: input.tpslExecMode,
				szHuman: input.szHuman,
				sizeUsdHuman: input.sizeUsdHuman,
				collateralToken: input.collateralToken,
				collateralAmountHuman: input.collateralAmountHuman,
				marketKind: input.marketKind,
				tif: input.tif,
				slippageBps: input.slippageBps,
				orderKind: input.orderKind,
				enableTpslMonitor: input.enableTpslMonitor,
				expiryDate: input.expiryDate,
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

	server.registerTool(
		'evaluate_uniswap_tpsl_monitor',
		{
			description:
				'Evaluate whether a spot Uniswap TP/SL monitor should trigger a market exit (price vs takeProfitPriceHuman / stopLossPriceHuman). Used by TP/SL cron jobs.',
			inputSchema: evaluateUniswapTpslSchema,
		},
		async input => {
			const lastPrice = Number.parseFloat(input.lastPriceHuman);
			if (!Number.isFinite(lastPrice)) {
				return sdkResultToCallToolResult({ok: false, reason: 'Invalid lastPriceHuman.'});
			}
			const tp = input.takeProfitPriceHuman
				? Number.parseFloat(input.takeProfitPriceHuman)
				: undefined;
			const sl = input.stopLossPriceHuman
				? Number.parseFloat(input.stopLossPriceHuman)
				: undefined;
			const evaluation = evaluateUniswapTpslMonitor({
				side: input.side,
				lastPrice,
				...(tp != null && Number.isFinite(tp) ? {takeProfitPrice: tp} : {}),
				...(sl != null && Number.isFinite(sl) ? {stopLossPrice: sl} : {}),
			});
			return sdkResultToCallToolResult({ok: true, data: evaluation});
		},
	);

	server.registerTool(
		'register_uniswap_tpsl_monitor_cron',
		{
			description:
				'Create an agent cron job that polls Uniswap pool price and triggers a market swap exit when TP/SL levels are crossed. Best-effort monitor — not on-chain resting orders.',
			inputSchema: registerUniswapTpslMonitorSchema,
		},
		async input => {
			const idea = resolveTradeIdea({
				tradeIdeaId: input.tradeIdeaId,
				tradeIdeas: (input as {tradeIdeas?: unknown[]}).tradeIdeas,
			});
			const side =
				input.side ??
				(idea?.side === 'long' || idea?.side === 'short' ? idea.side : null);
			if (!side) {
				return sdkResultToCallToolResult({
					ok: false,
					reason: 'side is required when trade idea is missing or neutral.',
				});
			}
			const prices =
				idea != null
					? uniswapTpslPricesFromTradeIdea(idea, {
							tradeIdea: idea,
							protocolId: 'uniswap',
							keyGenId: input.keyGenId,
							chainId: input.chainId,
							purposeText: 'TP/SL monitor',
						})
					: null;
			const tpHuman =
				input.takeProfitPriceHuman?.trim() ??
				(prices?.takeProfitPrice != null ? formatHumanPrice(prices.takeProfitPrice) : undefined);
			const slHuman =
				input.stopLossPriceHuman?.trim() ??
				(prices?.stopLossPrice != null ? formatHumanPrice(prices.stopLossPrice) : undefined);
			if (!tpHuman && !slHuman) {
				return sdkResultToCallToolResult({
					ok: false,
					reason: 'At least one of takeProfitPriceHuman or stopLossPriceHuman is required.',
				});
			}
			const pollEveryMinutes = input.pollEveryMinutes ?? 5;
			const message = buildUniswapTpslMonitorCronMessage({
				name: input.name,
				tradeIdeaId: input.tradeIdeaId,
				chainId: input.chainId,
				protocolId: 'uniswap',
				sizeUsdHuman: input.sizeUsdHuman,
				keyGenId: input.keyGenId,
				pollEveryMinutes,
				side,
				...(tpHuman ? {takeProfitPriceHuman: tpHuman} : {}),
				...(slHuman ? {stopLossPriceHuman: slHuman} : {}),
			});
			return wrapSdk(
				addCronJob(config, {
					name: input.name,
					message,
					schedule: uniswapTpslMonitorSchedule(pollEveryMinutes),
					enabled: input.enabled ?? true,
				}),
			);
		},
	);
}

export {camelToSnake};
