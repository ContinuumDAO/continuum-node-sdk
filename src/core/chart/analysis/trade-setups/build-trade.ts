import {getMcpToolDefinitions} from '@continuumdao/ctm-mpc-defi/agent';
import type {NodeSdkConfig} from '../../../../config/schema.js';
import type {SdkResult} from '../../../result.js';
import type {DefiProtocolContext} from '../../../../mcp/defi/context.js';
import {executeDefiMcpTool} from '../../../../mcp/defi/handler.js';
import type {EntryOffsetMode, EntryProximityMode} from './pattern-limit-entry.js';
import type {TradeIdea} from './trade-idea.js';
import {tradeIdeaWithFibSideOverride} from './trade-idea.js';
import {buildUniswapSpotSwapFromTradeIdea} from './build-trade-uniswap.js';
import {buildUniswapLimitOrderFromTradeIdea} from './build-trade-uniswap-limit.js';
import {passesEntryProximityGate} from './trade-entry-gates.js';
import {
	hyperliquidTradeDeskDefaults,
	type HyperliquidTpslExecMode,
} from './trade-desk-defaults.js';

export type BuildTradeProtocolId = 'hyperliquid' | 'arcus' | 'gmx' | 'uniswap';

/** Trend structure take-profit base before desk targetOffsetPct (default: impulse-leg measured move). */
export type TakeProfitSource = 'swing' | 'impulse_leg';

export const DEFAULT_TREND_TAKE_PROFIT_SOURCE: TakeProfitSource = 'impulse_leg';

export type BuildTradeFromTradeIdeaInput = {
	tradeIdea: TradeIdea;
	protocolId: BuildTradeProtocolId;
	keyGenId: string;
	/** Arcus paired ed25519 KeyGen id (same GroupId as secp256k1 keyGenId). */
	ed25519KeyGenId?: string;
	chainId: number;
	purposeText: string;
	useCustomGas?: boolean;
	/** Uniswap mainnet: market spot swap (default) or UniswapX limit order. */
	orderKind?: 'market' | 'limit';
	/** When true, include TP/SL monitor cron registration hints in output (Uniswap). */
	enableTpslMonitor?: boolean;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	targetOffsetPct?: number;
	targetOffsetMode?: EntryProximityMode;
	/** Trend structure only: impulse-leg measured move (default) or recent swing target. */
	takeProfitSource?: TakeProfitSource;
	tpslExecMode?: HyperliquidTpslExecMode;
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
	takeProfitPriceHuman?: string;
	stopLossPriceHuman?: string;
	side: TradeIdea['side'];
	/** Set when enableTpslMonitor registered a cron job after build. */
	tpslMonitorCron?: {name: string; jobId: string};
	/** When enableTpslMonitor was requested but cron could not be created. */
	tpslMonitorWarning?: string;
};

const DEFAULT_CHAIN_BY_PROTOCOL: Record<BuildTradeProtocolId, number> = {
	hyperliquid: 999,
	arcus: 4663,
	gmx: 42161,
	uniswap: 42161,
};

const HYPERLIQUID_LIMIT_TOOL = 'ctm_hyperliquid_build_limit_order_multisign';
const ARCUS_PERP_PLACE_TOOL = 'ctm_arcus_build_place_order_multisign';
const ARCUS_SPOT_RFQ_TOOL = 'ctm_arcus_spot_build_rfq_multisign';
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

function takeProfitBasePrice(
	idea: TradeIdea,
	input: BuildTradeFromTradeIdeaInput,
): number | undefined {
	const source = input.takeProfitSource ?? DEFAULT_TREND_TAKE_PROFIT_SOURCE;
	if (idea.analysisSetup.kind === 'trend_structure') {
		if (source === 'impulse_leg') {
			const mm = idea.analysisSetup.setup.measuredMove;
			if (mm != null && Number.isFinite(mm.targetPrice)) {
				return mm.targetPrice;
			}
		}
		if (source === 'swing') {
			return idea.target?.price;
		}
	}
	return idea.target?.price;
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

function atrAtLastBarFromTradeIdea(idea: TradeIdea): number | null {
	const setup = idea.analysisSetup.setup;
	if ('atrAtLastBar' in setup) {
		const v = setup.atrAtLastBar;
		if (v != null && Number.isFinite(v) && v > 0) {
			return v;
		}
	}
	if ('atr' in setup) {
		const v = setup.atr;
		if (v != null && Number.isFinite(v) && v > 0) {
			return v;
		}
	}
	return null;
}

export function applyTargetOffset(
	price: number,
	side: TradeIdea['side'],
	offsetPct?: number,
	mode: EntryProximityMode = 'price',
	atr?: number | null,
): number {
	if (offsetPct == null || !Number.isFinite(offsetPct) || offsetPct === 0) {
		return price;
	}
	const isShort = side === 'short';
	const isLong = side === 'long';
	if (mode === 'atr' && atr != null && Number.isFinite(atr) && atr > 0) {
		const delta = (atr * offsetPct) / 100;
		if (isLong) {
			return price - delta;
		}
		if (isShort) {
			return price + delta;
		}
		return price;
	}
	const factor = offsetPct / 100;
	if (isLong) {
		return price * (1 - factor);
	}
	if (isShort) {
		return price * (1 + factor);
	}
	return price;
}

function resolveEffectivePrices(
	idea: TradeIdea,
	input: BuildTradeFromTradeIdeaInput,
): {entry: number; invalidation?: number; target?: number} | null {
	if (!idea.entry) {
		return null;
	}
	const hlDesk = hyperliquidTradeDeskDefaults();
	const mode = entryOffsetModeFromIdea(idea);
	const entry = applyEntryOffset(idea.entry.price, idea.side, input.entryOffsetPct, mode);
	const invalidation =
		idea.invalidation != null
			? applyInvalidationOffset(idea.invalidation.price, idea.side, input.invalidationOffsetPct)
			: undefined;
	const targetBase = takeProfitBasePrice(idea, input);
	const target =
		targetBase != null
			? (() => {
					const offsetPct = input.targetOffsetPct ?? hlDesk.targetOffsetPct;
					const mode = input.targetOffsetMode ?? hlDesk.targetOffsetMode;
					const atr = mode === 'atr' ? atrAtLastBarFromTradeIdea(idea) : null;
					const effectiveMode = mode === 'atr' && atr == null ? 'price' : mode;
					return applyTargetOffset(
						targetBase,
						idea.side,
						offsetPct,
						effectiveMode,
						atr,
					);
				})()
			: undefined;
	return {entry, invalidation, target};
}

export function validateBuildTradePrices(
	idea: TradeIdea,
	input: BuildTradeFromTradeIdeaInput,
): SdkResult<{entry: number; invalidation?: number; target?: number}> {
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
	const {entry, invalidation, target} = resolved;
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
	if (target != null) {
		if (idea.side === 'long' && target <= entry) {
			return {
				ok: false,
				reason: 'Adjusted take-profit must sit above adjusted entry for long setups.',
			};
		}
		if (idea.side === 'short' && target >= entry) {
			return {
				ok: false,
				reason: 'Adjusted take-profit must sit below adjusted entry for short setups.',
			};
		}
	}
	if (input.protocolId === 'hyperliquid' && (target != null || invalidation != null)) {
		if (invalidation != null && target != null) {
			if (idea.side === 'long' && !(invalidation < entry && entry < target)) {
				return {ok: false, reason: 'Long bracket requires SL < entry < TP after desk offsets.'};
			}
			if (idea.side === 'short' && !(target < entry && entry < invalidation)) {
				return {ok: false, reason: 'Short bracket requires TP < entry < SL after desk offsets.'};
			}
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
	return {ok: true, data: {entry, invalidation, target}};
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

function resolveArcusMarket(idea: TradeIdea): string | null {
	const symbol = idea.symbol?.trim();
	if (!symbol) return null;
	if (symbol.includes('-')) return symbol.toUpperCase();
	return `${symbol.toUpperCase()}-USD`;
}

function resolveArcusSpotTicker(idea: TradeIdea): string | null {
	const symbol = idea.symbol?.trim();
	if (!symbol) return null;
	return symbol.split('-')[0]!.toUpperCase();
}

function arcusKeyGenFields(input: BuildTradeFromTradeIdeaInput): SdkResult<{
	secp256k1KeyGenId: string;
	ed25519KeyGenId: string;
}> {
	const secp256k1KeyGenId = input.keyGenId.trim();
	const ed25519KeyGenId = input.ed25519KeyGenId?.trim() ?? '';
	if (!secp256k1KeyGenId) {
		return {ok: false, reason: 'keyGenId (secp256k1) is required for Arcus trades.'};
	}
	if (!ed25519KeyGenId) {
		return {
			ok: false,
			reason: 'ed25519KeyGenId is required for Arcus trades (paired KeyGen, same GroupId).',
		};
	}
	return {ok: true, data: {secp256k1KeyGenId, ed25519KeyGenId}};
}

export function mapTradeIdeaToArcusPerpPlaceOrderInput(
	idea: TradeIdea,
	input: BuildTradeFromTradeIdeaInput,
): SdkResult<Record<string, unknown>> {
	if (idea.side !== 'long' && idea.side !== 'short') {
		return {ok: false, reason: 'Trade idea side must be long or short for Arcus perp orders.'};
	}
	const market = resolveArcusMarket(idea);
	if (!market) {
		return {ok: false, reason: 'Trade idea is missing symbol/market for Arcus mapping.'};
	}
	if (!input.szHuman?.trim()) {
		return {ok: false, reason: 'szHuman is required for Arcus perp orders.'};
	}
	const keys = arcusKeyGenFields(input);
	if (!keys.ok) return keys;
	const validated = validateBuildTradePrices(idea, input);
	if (!validated.ok) {
		return validated;
	}
	const entryPx = validated.data!.entry;
	const tpPx = validated.data!.target;
	const slPx = validated.data!.invalidation;
	return {
		ok: true,
		data: {
			secp256k1KeyGenId: keys.data!.secp256k1KeyGenId,
			ed25519KeyGenId: keys.data!.ed25519KeyGenId,
			chainId: input.chainId || DEFAULT_CHAIN_BY_PROTOCOL.arcus,
			purposeText: input.purposeText,
			market,
			isBuy: idea.side === 'long',
			limitPxHuman: formatHumanPrice(entryPx),
			szHuman: input.szHuman.trim(),
			...(tpPx != null ? {takeProfitTriggerPxHuman: formatHumanPrice(tpPx)} : {}),
			...(slPx != null ? {stopLossTriggerPxHuman: formatHumanPrice(slPx)} : {}),
			...(input.expiryDate != null && input.expiryDate > 0 ? {expiryDate: Math.floor(input.expiryDate)} : {}),
		},
	};
}

export function mapTradeIdeaToArcusSpotRfqInput(
	idea: TradeIdea,
	input: BuildTradeFromTradeIdeaInput,
): SdkResult<Record<string, unknown>> {
	if (idea.side !== 'long' && idea.side !== 'short') {
		return {ok: false, reason: 'Trade idea side must be long or short for Arcus spot RFQ.'};
	}
	const ticker = resolveArcusSpotTicker(idea);
	if (!ticker) {
		return {ok: false, reason: 'Trade idea is missing symbol/ticker for Arcus spot mapping.'};
	}
	if (!input.szHuman?.trim()) {
		return {ok: false, reason: 'szHuman is required for Arcus spot RFQ (sizeHuman).'};
	}
	const keys = arcusKeyGenFields(input);
	if (!keys.ok) return keys;
	const validated = validateBuildTradePrices(idea, input);
	if (!validated.ok) {
		return validated;
	}
	const entryPx = validated.data!.entry;
	return {
		ok: true,
		data: {
			secp256k1KeyGenId: keys.data!.secp256k1KeyGenId,
			ed25519KeyGenId: keys.data!.ed25519KeyGenId,
			chainId: input.chainId || DEFAULT_CHAIN_BY_PROTOCOL.arcus,
			purposeText: input.purposeText,
			ticker,
			isBuy: idea.side === 'long',
			sizeHuman: input.szHuman.trim(),
			limitPxHuman: formatHumanPrice(entryPx),
			...(input.expiryDate != null && input.expiryDate > 0 ? {expiryDate: Math.floor(input.expiryDate)} : {}),
		},
	};
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
	const tpPx = validated.data!.target;
	const slPx = validated.data!.invalidation;
	const hlDesk = hyperliquidTradeDeskDefaults();
	const tpslExecMode = input.tpslExecMode ?? hlDesk.tpslExecMode;
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
			...(tpPx != null ? {takeProfitTriggerPxHuman: formatHumanPrice(tpPx)} : {}),
			...(slPx != null ? {stopLossTriggerPxHuman: formatHumanPrice(slPx)} : {}),
			...(tpPx != null || slPx != null ? {tpslExecMode} : {}),
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
	const tpPx = validated.data!.target;
	const slPx = validated.data!.invalidation;
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
			...(tpPx != null ? {takeProfitPriceUsdHuman: formatHumanPrice(tpPx)} : {}),
			...(slPx != null ? {stopLossPriceUsdHuman: formatHumanPrice(slPx)} : {}),
			...(slPx != null ? {patternFailureUsdHuman: formatHumanPrice(slPx)} : {}),
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
		const orderKind = input.orderKind ?? 'market';
		if (orderKind === 'limit') {
			const built = await buildUniswapLimitOrderFromTradeIdea(config, defiContext, idea, input);
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
					...(proximity.data!.invalidation != null
						? {
								invalidationPriceHuman: formatHumanPrice(proximity.data!.invalidation),
								stopLossPriceHuman: formatHumanPrice(proximity.data!.invalidation),
							}
						: {}),
					...(proximity.data!.target != null
						? {takeProfitPriceHuman: formatHumanPrice(proximity.data!.target)}
						: {}),
					side: idea.side,
				},
			};
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
				...(proximity.data!.invalidation != null
					? {
							invalidationPriceHuman: formatHumanPrice(proximity.data!.invalidation),
							stopLossPriceHuman: formatHumanPrice(proximity.data!.invalidation),
						}
					: {}),
				...(proximity.data!.target != null
					? {takeProfitPriceHuman: formatHumanPrice(proximity.data!.target)}
					: {}),
				side: idea.side,
			},
		};
	}
	const mappedTool =
		protocolId === 'hyperliquid'
			? HYPERLIQUID_LIMIT_TOOL
			: protocolId === 'arcus'
				? (input.marketKind ?? 'perp') === 'spot'
					? ARCUS_SPOT_RFQ_TOOL
					: ARCUS_PERP_PLACE_TOOL
				: GMX_INCREASE_TOOL;
	const tool = findDefiTool(mappedTool);
	if (!tool) {
		return {ok: false, reason: `DeFi tool ${mappedTool} is not registered.`};
	}
	const mapped =
		protocolId === 'hyperliquid'
			? mapTradeIdeaToHyperliquidLimitInput(idea, input)
			: protocolId === 'arcus'
				? (input.marketKind ?? 'perp') === 'spot'
					? mapTradeIdeaToArcusSpotRfqInput(idea, input)
					: mapTradeIdeaToArcusPerpPlaceOrderInput(idea, input)
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
				? {
						invalidationPriceHuman: formatHumanPrice(validated.data!.invalidation),
						stopLossPriceHuman: formatHumanPrice(validated.data!.invalidation),
					}
				: {}),
			...(validated.data!.target != null
				? {takeProfitPriceHuman: formatHumanPrice(validated.data!.target)}
				: {}),
			side: idea.side,
		},
	};
}
