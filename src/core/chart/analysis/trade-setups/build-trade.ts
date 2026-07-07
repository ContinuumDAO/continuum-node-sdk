import {getMcpToolDefinitions} from '@continuumdao/ctm-mpc-defi/agent';
import type {NodeSdkConfig} from '../../../../config/schema.js';
import type {SdkResult} from '../../../result.js';
import type {DefiProtocolContext} from '../../../../mcp/defi/context.js';
import {executeDefiMcpTool} from '../../../../mcp/defi/handler.js';
import type {TradeIdea} from './trade-idea.js';

export type BuildTradeProtocolId = 'hyperliquid' | 'gmx';

export type BuildTradeFromTradeIdeaInput = {
	tradeIdea: TradeIdea;
	protocolId: BuildTradeProtocolId;
	keyGenId: string;
	chainId: number;
	purposeText: string;
	useCustomGas?: boolean;
	entryOffsetPct?: number;
	szHuman?: string;
	sizeUsdHuman?: string;
	collateralToken?: string;
	collateralAmountHuman?: string;
	marketKind?: 'perp' | 'spot';
	tif?: 'alo' | 'gtc' | 'ioc';
	slippageBps?: number;
};

export type BuildTradeFromTradeIdeaOutput = {
	requestId: string;
	tradeIdeaId: string;
	mappedTool: string;
	protocolId: BuildTradeProtocolId;
	entryPriceHuman: string;
	side: TradeIdea['side'];
};

const DEFAULT_CHAIN_BY_PROTOCOL: Record<BuildTradeProtocolId, number> = {
	hyperliquid: 999,
	gmx: 42161,
};

const HYPERLIQUID_LIMIT_TOOL = 'ctm_hyperliquid_build_limit_order_multisign';
const GMX_INCREASE_TOOL = 'ctm_gmx_build_increase_multisign';

function applyEntryOffset(price: number, side: TradeIdea['side'], offsetPct?: number): number {
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

function formatHumanPrice(price: number): string {
	const abs = Math.abs(price);
	if (abs >= 1000) {
		return price.toFixed(2);
	}
	if (abs >= 1) {
		return price.toFixed(4);
	}
	return price.toFixed(6);
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
	const entryPx = applyEntryOffset(idea.entry.price, idea.side, input.entryOffsetPct);
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
	const symbol = resolveCoinSymbol(idea);
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
	const triggerPx = applyEntryOffset(idea.entry.price, idea.side, input.entryOffsetPct);
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
			...(input.slippageBps != null ? {slippageBps: input.slippageBps} : {}),
		},
	};
}

export async function buildTradeFromTradeIdea(
	config: NodeSdkConfig,
	defiContext: DefiProtocolContext,
	input: BuildTradeFromTradeIdeaInput,
): Promise<SdkResult<BuildTradeFromTradeIdeaOutput>> {
	const idea = input.tradeIdea;
	if (idea.status !== 'clear' && !input.purposeText.toLowerCase().includes('force')) {
		return {
			ok: false,
			reason: `Trade idea ${idea.id} status is ${idea.status}${idea.unclearReason ? `: ${idea.unclearReason}` : ''}.`,
		};
	}
	const protocolId = input.protocolId;
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
	const entryPx = applyEntryOffset(idea.entry.price, idea.side, input.entryOffsetPct);
	return {
		ok: true,
		data: {
			requestId,
			tradeIdeaId: idea.id,
			mappedTool,
			protocolId,
			entryPriceHuman: formatHumanPrice(entryPx),
			side: idea.side,
		},
	};
}
