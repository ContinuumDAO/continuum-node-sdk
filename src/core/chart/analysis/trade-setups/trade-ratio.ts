import type {TradeSetupSide} from './shared.js';
import {isFiniteTradePrice} from './shared.js';

/** Minimum reward/risk (Trade Ratio) for a clear idea. Desk default. */
export const DEFAULT_MIN_TRADE_RATIO = 3;

/** Assumed isolated leverage for analysis-time liquidation estimate (perps only). Desk default. */
export const DEFAULT_ASSUMED_LEVERAGE = 10;

/** Spot venues with no liquidation estimate (e.g. Uniswap V4). */
export function tradeIdeaSupportsLiquidationEstimate(
	protocolId?: string | null,
	chartDataSource?: string | null,
): boolean {
	const ds = chartDataSource?.trim().toLowerCase() ?? '';
	if (ds === 'uni') {
		return false;
	}
	const proto = protocolId?.trim().toLowerCase() ?? '';
	if (!proto) {
		return true;
	}
	return proto !== 'uniswap' && proto !== 'uniswap-v4' && proto !== 'uni';
}

/**
 * Isolated-style liquidation estimate from entry and leverage (perp venues only).
 * long: entry × (1 − 1/leverage); short: entry × (1 + 1/leverage).
 */
export function estimateLiquidationPrice(input: {
	side: 'long' | 'short';
	entry: number;
	leverage?: number;
}): number | undefined {
	const leverage = input.leverage ?? DEFAULT_ASSUMED_LEVERAGE;
	if (!isFiniteTradePrice(input.entry) || !isFiniteTradePrice(leverage) || leverage <= 1) {
		return undefined;
	}
	const factor = 1 / leverage;
	if (input.side === 'long') {
		const price = input.entry * (1 - factor);
		return isFiniteTradePrice(price) && price > 0 ? price : undefined;
	}
	const price = input.entry * (1 + factor);
	return isFiniteTradePrice(price) && price > 0 ? price : undefined;
}

/**
 * Trade Ratio using invalidation as risk distance:
 * long (target − entry) / (entry − invalidation);
 * short (entry − target) / (invalidation − entry).
 */
export function computeTradeRatio(input: {
	side: 'long' | 'short';
	entry: number;
	target: number;
	invalidation: number;
}): number | undefined {
	const {side, entry, target, invalidation} = input;
	if (
		!isFiniteTradePrice(entry) ||
		!isFiniteTradePrice(target) ||
		!isFiniteTradePrice(invalidation)
	) {
		return undefined;
	}
	if (side === 'long') {
		const reward = target - entry;
		const risk = entry - invalidation;
		if (!(reward > 0) || !(risk > 0)) {
			return undefined;
		}
		return reward / risk;
	}
	const reward = entry - target;
	const risk = invalidation - entry;
	if (!(reward > 0) || !(risk > 0)) {
		return undefined;
	}
	return reward / risk;
}

export function tradeLevelsLiquidationAndRatio(input: {
	side: TradeSetupSide;
	entry?: number;
	target?: number;
	invalidation?: number;
	leverage?: number;
	/** When false (Uniswap / spot), skip liquidation estimate. Default true when unset. */
	includeLiquidation?: boolean;
	protocolId?: string | null;
	chartDataSource?: string | null;
}): {liquidationPrice?: number; tradeRatio?: number; assumedLeverage?: number} {
	const includeLiquidation =
		input.includeLiquidation ??
		tradeIdeaSupportsLiquidationEstimate(input.protocolId, input.chartDataSource);
	const assumedLeverage = includeLiquidation
		? (input.leverage ?? DEFAULT_ASSUMED_LEVERAGE)
		: undefined;
	if (input.side !== 'long' && input.side !== 'short') {
		return assumedLeverage != null ? {assumedLeverage} : {};
	}
	if (
		!isFiniteTradePrice(input.entry) ||
		!isFiniteTradePrice(input.target) ||
		!isFiniteTradePrice(input.invalidation)
	) {
		return assumedLeverage != null ? {assumedLeverage} : {};
	}
	const tradeRatio = computeTradeRatio({
		side: input.side,
		entry: input.entry,
		target: input.target,
		invalidation: input.invalidation,
	});
	const liquidationPrice =
		includeLiquidation && assumedLeverage != null
			? estimateLiquidationPrice({
					side: input.side,
					entry: input.entry,
					leverage: assumedLeverage,
				})
			: undefined;
	return {
		...(liquidationPrice != null ? {liquidationPrice} : {}),
		...(tradeRatio != null ? {tradeRatio} : {}),
		...(assumedLeverage != null ? {assumedLeverage} : {}),
	};
}

/**
 * When Trade Ratio is available and below min, return an unclearReason.
 * Skipped when levels/ratio cannot be computed.
 */
export function tradeRatioUnclearReason(input: {
	side: TradeSetupSide;
	entry?: number;
	target?: number;
	invalidation?: number;
	minTradeRatio?: number;
}): string | undefined {
	if (input.side !== 'long' && input.side !== 'short') {
		return undefined;
	}
	const min = input.minTradeRatio ?? DEFAULT_MIN_TRADE_RATIO;
	if (!isFiniteTradePrice(min) || min <= 0) {
		return undefined;
	}
	if (
		!isFiniteTradePrice(input.entry) ||
		!isFiniteTradePrice(input.target) ||
		!isFiniteTradePrice(input.invalidation)
	) {
		return undefined;
	}
	const ratio = computeTradeRatio({
		side: input.side,
		entry: input.entry,
		target: input.target,
		invalidation: input.invalidation,
	});
	if (ratio == null) {
		return undefined;
	}
	if (ratio < min) {
		return `Trade Ratio ${ratio.toFixed(2)} below minimum ${min}.`;
	}
	return undefined;
}
