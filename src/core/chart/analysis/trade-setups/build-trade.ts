import {getMcpToolDefinitions} from '@continuumdao/ctm-mpc-defi/agent';
import type {NodeSdkConfig} from '../../../../config/schema.js';
import type {SdkResult} from '../../../result.js';
import type {DefiProtocolContext} from '../../../../mcp/defi/context.js';
import {executeDefiMcpTool} from '../../../../mcp/defi/handler.js';
import type {EntryOffsetMode, EntryProximityMode} from './pattern-limit-entry.js';
import type {TradeIdea} from './trade-idea.js';
import {tradeIdeaWithFibSideOverride} from './trade-idea.js';
import {buildUniswapSpotSwapFromTradeIdea} from './build-trade-uniswap.js';
import {passesEntryProximityGate} from './trade-entry-gates.js';

export type BuildTradeProtocolId = 'hyperliquid' | 'gmx' | 'uniswap';

export type BuildTradeFromTradeIdeaInput = {
	tradeIdea: TradeIdea;
	protocolId: BuildTradeProtocolId;
	keyGenId: string;
	chainId: number;
	purposeText: string;
	useCustomGas?: boolean;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	entryProximityPct?: number;
	entryProximityMode?: EntryProximityMode;
	szHuman?: string;
	sizeUsdHuman?: string;
	collateralToken?: string;
	collateralAmountHuman?: string;
	marketKind?: 'perp' | 'spot';
	tif?: 'alo' | 'gtc' | 'ioc';
	slippageBps?: number;
	/** Fib trade ideas: override desk default long/short before mapping limits. */
	side?: 'long' | 'short';
	/** Optional Unix seconds (UTC) for MPC multiSignRequest expiryDate. */
	expiryDate?: number;
};

export type BuildTradeFromTradeIdeaOutput = {
	requestId: string;
	tradeIdeaId: string;
	mappedTool: string;
	protocolId: BuildTradeProtocolId;
	entryPriceHuman: string;
	invalidationPriceHuman?: string;
	side: TradeIdea['side'];
};

const DEFAULT_CHAIN_BY_PROTOCOL: Record<BuildTradeProtocolId, number> = {
	hyperliquid: 999,
	gmx: 42161,
	uniswap: 42161,
};

const HYPERLIQUID_LIMIT_TOOL = 'ctm_hyperliquid_build_limit_order_multisign';
const GMX_INCREASE_TOOL = 'ctm_gmx_build_increase_multisign';

function proximityFromSetup(idea: TradeIdea): {
	entryProximityPct?: number;
	entryProximityMode?: EntryProximityMode;
	entryProximityAtr?: number | null;
} {
	const setup = idea.analysisSetup.setup;
	if (!('entryProximityPct' in setup)) {
		return {};
	}
	return {
		entryProximityPct: setup.entryProximityPct,
		entryProximityMode:
			'entryProximityMode' in setup ? setup.entryProximityMode : undefined,
		entryProximityAtr: 'atrAtLastBar' in setup ? setup.atrAtLastBar ?? null : null,
	};
}

function entryOffsetModeFromIdea(idea: TradeIdea): EntryOffsetMode {
	const setup = idea.analysisSetup;
	if (setup.kind === 'chart_pattern' && setup.setup.entryOffsetMode) {
		return setup.setup.entryOffsetMode;
	}
	if (setup.kind === 'key_levels') {
		return setup.setup.framing === 'break' ? 'retest' : 'bounce';
	}
	if (setup.kind === 'key_level_fibonacci') {
		const mode = setup.setup.entryOffsetMode;
		if (mode === 'bounce' || mode === 'retest') {
			return mode;
		}
		return setup.setup.framing === 'break' ? 'retest' : 'bounce';
	}
	if (setup.kind === 'trend_structure') {
		return setup.setup.entryOffsetMode ?? 'retest';
	}
	if (setup.kind === 'bollinger_bands') {
		return setup.setup.entryOffsetMode ?? 'bounce';
	}
	if (setup.kind === 'moving_averages') {
		return setup.setup.entryOffsetMode ?? 'bounce';
	}
	return 'bounce';
}

export function applyEntryOffset(
	price: number,
	side: TradeIdea['side'],
	offsetPct: number | undefined,
	mode: EntryOffsetMode,
): number {
	if (offsetPct == null || !Number.isFinite(offsetPct) || offsetPct === 0) {
		return price;
	}
	const factor = offsetPct / 100;
	if (mode === 'retest') {
		if (side === 'long') {
			return price * (1 + factor);
		}
		if (side === 'short') {
			return price * (1 - factor);
		}
		return price;
	}
	if (side === 'long') {
		return price * (1 - factor);
	}
	if (side === 'short') {
		return price * (1 + factor);
	}
	return price;
}

export function applyInvalidationOffset(
	price: number,
	side: TradeIdea['side'],
	offsetPct?: number,
): number {
	if (offsetPct == null || !Number.isFinite(offsetPct) || offsetPct === 0) {
		return price;
	}
	const factor = offsetPct / 100;
	if (side === 'long') {
		return price * (1 - factor);
	}
	if (side === 'short') {
		return price * (1 + factor);
	}
	return price;
}

export function formatHumanPrice(price: number): string {
	const abs = Math.abs(price);
	if (abs >= 1000) {
		return price.toFixed(2);
	}
	if (abs >= 1) {
		return price.toFixed(4);
	}
	return price.toFixed(6);
}

function resolveEffectivePrices(
	idea: TradeIdea,
	input: BuildTradeFromTradeIdeaInput,
): {entry: number; invalidation?: number} | null {
	if (!idea.entry) {
		return null;
	}
	const mode = entryOffsetModeFromIdea(idea);
	const entry = applyEntryOffset(idea.entry.price, idea.side, input.entryOffsetPct, mode);
	const invalidation =
		idea.invalidation != null
			? applyInvalidationOffset(idea.invalidation.price, idea.side, input.invalidationOffsetPct)
			: undefined;
	return {entry, invalidation};
}

export function validateBuildTradePrices(
	idea: TradeIdea,
	input: BuildTradeFromTradeIdeaInput,
): SdkResult<{entry: number; invalidation?: number}> {
	if (idea.side !== 'long' && idea.side !== 'short') {
		return {ok: false, reason: 'Trade idea side must be long or short for limit builds.'};
	}
	if (!idea.entry) {
		return {ok: false, reason: 'Trade idea has no entry level — cannot build limit order.'};
	}
	const resolved = resolveEffectivePrices(idea, input);
	if (!resolved) {
		return {ok: false, reason: 'Trade idea has no entry level — cannot build limit order.'};
	}
	const {entry, invalidation} = resolved;
	const lastClose = idea.lastClose;
	const mode = entryOffsetModeFromIdea(idea);
	if (mode !== 'retest') {
		if (idea.side === 'long' && entry > lastClose) {
			return {
				ok: false,
				reason: `Adjusted long entry ${formatHumanPrice(entry)} is above last close ${formatHumanPrice(lastClose)}.`,
			};
		}
		if (idea.side === 'short' && entry < lastClose) {
			return {
				ok: false,
				reason: `Adjusted short entry ${formatHumanPrice(entry)} is below last close ${formatHumanPrice(lastClose)}.`,
			};
		}
	}
	if (invalidation != null) {
		if (idea.side === 'long' && invalidation >= entry) {
			return {
				ok: false,
				reason: 'Adjusted invalidation must sit below adjusted entry for long setups.',
			};
		}
		if (idea.side === 'short' && invalidation <= entry) {
			return {
				ok: false,
				reason: 'Adjusted invalidation must sit above adjusted entry for short setups.',
			};
		}
	}
	if (
		input.protocolId === 'uniswap' &&
		!passesEntryProximityGate({
			lastClose,
			entryPrice: idea.entry.price,
			entryProximityPct: input.entryProximityPct ?? proximityFromSetup(idea).entryProximityPct,
			entryProximityMode: input.entryProximityMode ?? proximityFromSetup(idea).entryProximityMode,
			entryProximityAtr: proximityFromSetup(idea).entryProximityAtr,
		})
	) {
		return {ok: false, reason: 'Uniswap swap requires price within entry proximity of the idea entry.'};
	}
	return {ok: true, data: {entry, invalidation}};
}

function resolveGmxSymbol(idea: TradeIdea): string | null {
	const symbol = idea.symbol?.trim();
	return symbol || null;
}

function resolveCoinSymbol(idea: TradeIdea): string | null {
	const symbol = idea.symbol?.trim();
	if (symbol) {
		return symbol.toUpperCase();
	}
	return null;
}

function findDefiTool(toolName: string) {
	return getMcpToolDefinitions().find(tool => tool.name === toolName) ?? null;
}

export function mapTradeIdeaToHyperliquidLimitInput(
	idea: TradeIdea,
	input: BuildTradeFromTradeIdeaInput,
): SdkResult<Record<string, unknown>> {
	if (idea.side !== 'long' && idea.side !== 'short') {
		return {ok: false, reason: 'Trade idea side must be long or short for Hyperliquid limit orders.'};
	}
	const coin = resolveCoinSymbol(idea);
	if (!coin) {
		return {ok: false, reason: 'Trade idea is missing symbol/coin for Hyperliquid mapping.'};
	}
	if (!input.szHuman?.trim()) {
		return {ok: false, reason: 'szHuman is required for Hyperliquid limit orders.'};
	}
	const validated = validateBuildTradePrices(idea, input);
	if (!validated.ok) {
		return validated;
	}
	const entryPx = validated.data!.entry;
	return {
		ok: true,
		data: {
			keyGenId: input.keyGenId,
			chainId: input.chainId || DEFAULT_CHAIN_BY_PROTOCOL.hyperliquid,
			purposeText: input.purposeText,
			useCustomGas: input.useCustomGas ?? false,
			coin,
			isBuy: idea.side === 'long',
			limitPxHuman: formatHumanPrice(entryPx),
			szHuman: input.szHuman.trim(),
			marketKind: input.marketKind ?? 'perp',
			tif: input.tif ?? 'gtc',
			...(input.expiryDate != null && input.expiryDate > 0 ? {expiryDate: Math.floor(input.expiryDate)} : {}),
		},
	};
}

export function mapTradeIdeaToGmxIncreaseInput(
	idea: TradeIdea,
	input: BuildTradeFromTradeIdeaInput,
): SdkResult<Record<string, unknown>> {
	if (idea.side !== 'long' && idea.side !== 'short') {
		return {ok: false, reason: 'Trade idea side must be long or short for GMX increase orders.'};
	}
	const symbol = resolveGmxSymbol(idea);
	if (!symbol) {
		return {ok: false, reason: 'Trade idea is missing symbol for GMX mapping.'};
	}
	if (!input.sizeUsdHuman?.trim()) {
		return {ok: false, reason: 'sizeUsdHuman is required for GMX increase orders.'};
	}
	if (!input.collateralToken?.trim() || !input.collateralAmountHuman?.trim()) {
		return {
			ok: false,
			reason: 'collateralToken and collateralAmountHuman are required for GMX increase orders.',
		};
	}
	const validated = validateBuildTradePrices(idea, input);
	if (!validated.ok) {
		return validated;
	}
	const triggerPx = validated.data!.entry;
	const pfE = validated.data!.invalidation;
	return {
		ok: true,
		data: {
			keyGenId: input.keyGenId,
			chainId: input.chainId || DEFAULT_CHAIN_BY_PROTOCOL.gmx,
			purposeText: input.purposeText,
			useCustomGas: input.useCustomGas ?? false,
			symbol,
			direction: idea.side,
			orderType: 'limit',
			sizeUsdHuman: input.sizeUsdHuman.trim(),
			collateralToken: input.collateralToken.trim(),
			collateralAmountHuman: input.collateralAmountHuman.trim(),
			triggerPriceUsdHuman: formatHumanPrice(triggerPx),
			...(pfE != null ? {patternFailureUsdHuman: formatHumanPrice(pfE)} : {}),
			...(input.slippageBps != null ? {slippageBps: input.slippageBps} : {}),
			...(input.expiryDate != null && input.expiryDate > 0 ? {expiryDate: Math.floor(input.expiryDate)} : {}),
		},
	};
}

export async function buildTradeFromTradeIdea(
	config: NodeSdkConfig,
	defiContext: DefiProtocolContext,
	input: BuildTradeFromTradeIdeaInput,
): Promise<SdkResult<BuildTradeFromTradeIdeaOutput>> {
	const idea = tradeIdeaWithFibSideOverride(input.tradeIdea, input.side);
	if (idea.status !== 'clear' && !input.purposeText.toLowerCase().includes('force')) {
		return {
			ok: false,
			reason: `Trade idea ${idea.id} status is ${idea.status}${idea.unclearReason ? `: ${idea.unclearReason}` : ''}.`,
		};
	}
	const protocolId = input.protocolId;
	if (protocolId === 'uniswap') {
		const proximity = validateBuildTradePrices(idea, input);
		if (!proximity.ok) {
			return proximity;
		}
		const built = await buildUniswapSpotSwapFromTradeIdea(config, defiContext, idea, input);
		if (!built.ok) {
			return built;
		}
		return {
			ok: true,
			data: {
				requestId: built.data.requestId,
				tradeIdeaId: idea.id,
				mappedTool: built.data.mappedTool,
				protocolId,
				entryPriceHuman: formatHumanPrice(proximity.data!.entry),
				side: idea.side,
			},
		};
	}
	const mappedTool = protocolId === 'hyperliquid' ? HYPERLIQUID_LIMIT_TOOL : GMX_INCREASE_TOOL;
	const tool = findDefiTool(mappedTool);
	if (!tool) {
		return {ok: false, reason: `DeFi tool ${mappedTool} is not registered.`};
	}
	const mapped =
		protocolId === 'hyperliquid'
			? mapTradeIdeaToHyperliquidLimitInput(idea, input)
			: mapTradeIdeaToGmxIncreaseInput(idea, input);
	if (!mapped.ok) {
		return mapped;
	}
	const result = await executeDefiMcpTool(config, defiContext, tool, mapped.data);
	if (result.isError) {
		const text = result.content?.[0]?.type === 'text' ? result.content[0].text : 'DeFi bridge failed.';
		return {ok: false, reason: text};
	}
	const structured =
		result.structuredContent && typeof result.structuredContent === 'object'
			? (result.structuredContent as Record<string, unknown>)
			: {};
	const requestId = String(structured.requestId ?? '').trim();
	if (!requestId) {
		return {ok: false, reason: 'DeFi bridge did not return requestId.'};
	}
	const validated = validateBuildTradePrices(idea, input);
	if (!validated.ok) {
		return validated;
	}
	return {
		ok: true,
		data: {
			requestId,
			tradeIdeaId: idea.id,
			mappedTool,
			protocolId,
			entryPriceHuman: formatHumanPrice(validated.data!.entry),
			...(validated.data!.invalidation != null
				? {invalidationPriceHuman: formatHumanPrice(validated.data!.invalidation)}
				: {}),
			side: idea.side,
		},
	};
}
