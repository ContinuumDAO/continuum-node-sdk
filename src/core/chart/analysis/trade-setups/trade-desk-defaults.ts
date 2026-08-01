import {
	DEFAULT_ENTRY_PROXIMITY_MODE,
	DEFAULT_ENTRY_PROXIMITY_PCT,
	type EntryProximityMode,
} from './pattern-limit-entry.js';

import {
	DEFAULT_ASSUMED_LEVERAGE,
	DEFAULT_MIN_TRADE_RATIO,
} from './trade-ratio.js';

/** Desk defaults from trade-defaults skill (§2). */
export const DEFAULT_TRADE_DESK_ENTRY_PROXIMITY_PCT = DEFAULT_ENTRY_PROXIMITY_PCT;
export const DEFAULT_TRADE_DESK_ENTRY_OFFSET_PCT = 1;
export const DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT = 1;
/** Default invalidationOffsetPct when invalidationOffsetMode is atr (% of one ATR bar). */
export const DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT_ATR = 25;
export const DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_MODE: EntryProximityMode = 'price';
export const DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD = 14;
export {DEFAULT_MIN_TRADE_RATIO, DEFAULT_ASSUMED_LEVERAGE};
export const DEFAULT_TRADE_DESK_MIN_TRADE_RATIO = DEFAULT_MIN_TRADE_RATIO;
export const DEFAULT_TRADE_DESK_ASSUMED_LEVERAGE = DEFAULT_ASSUMED_LEVERAGE;

export type {EntryProximityMode};

export type TradeDeskDefaultPctFields = {
	entryProximityPct: number;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
};

/**
 * Resolve invalidationOffsetPct for the given mode.
 * Omitted pct → 1 (price) or 25 (atr). Explicit pct is kept as-is.
 */
export function resolveInvalidationOffsetPct(
	mode: EntryProximityMode | undefined,
	pct?: number,
): number {
	if (pct != null && Number.isFinite(pct)) {
		return pct;
	}
	const resolvedMode = mode ?? DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_MODE;
	if (resolvedMode === 'atr') {
		return DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT_ATR;
	}
	return DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT;
}

export function tradeDeskDefaultPcts(
	overrides?: Partial<TradeDeskDefaultPctFields> & {
		invalidationOffsetMode?: EntryProximityMode;
	},
): TradeDeskDefaultPctFields {
	const mode = overrides?.invalidationOffsetMode ?? DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_MODE;
	return {
		entryProximityPct:
			overrides?.entryProximityPct ?? DEFAULT_TRADE_DESK_ENTRY_PROXIMITY_PCT,
		entryOffsetPct: overrides?.entryOffsetPct ?? DEFAULT_TRADE_DESK_ENTRY_OFFSET_PCT,
		invalidationOffsetPct: resolveInvalidationOffsetPct(mode, overrides?.invalidationOffsetPct),
	};
}

export type TradeDeskConfig = TradeDeskDefaultPctFields & {
	entryProximityMode: EntryProximityMode;
	entryProximityAtrPeriod: number;
	invalidationOffsetMode: EntryProximityMode;
	minTradeRatio: number;
	assumedLeverage: number;
	hyperliquid: HyperliquidTradeDeskConfig;
};

export type HyperliquidTpslExecMode = 'limit_at_trigger' | 'market';

export type HyperliquidTradeDeskConfig = {
	tpslExecMode: HyperliquidTpslExecMode;
	/** Conservative TP band inside analysis target (long: below target; short: above). */
	targetOffsetPct: number;
	targetOffsetMode: EntryProximityMode;
};

export const DEFAULT_HYPERLIQUID_TPSL_EXEC_MODE: HyperliquidTpslExecMode = 'limit_at_trigger';
export const DEFAULT_HYPERLIQUID_TARGET_OFFSET_PCT = 0.1;
export const DEFAULT_HYPERLIQUID_TARGET_OFFSET_MODE: EntryProximityMode = 'price';

export function hyperliquidTradeDeskDefaults(
	overrides?: Partial<HyperliquidTradeDeskConfig>,
): HyperliquidTradeDeskConfig {
	return {
		tpslExecMode: overrides?.tpslExecMode ?? DEFAULT_HYPERLIQUID_TPSL_EXEC_MODE,
		targetOffsetPct: overrides?.targetOffsetPct ?? DEFAULT_HYPERLIQUID_TARGET_OFFSET_PCT,
		targetOffsetMode: overrides?.targetOffsetMode ?? DEFAULT_HYPERLIQUID_TARGET_OFFSET_MODE,
	};
}

export function tradeDeskConfig(overrides?: Partial<TradeDeskConfig>): TradeDeskConfig {
	const invalidationOffsetMode =
		overrides?.invalidationOffsetMode ?? DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_MODE;
	return {
		...tradeDeskDefaultPcts({...overrides, invalidationOffsetMode}),
		entryProximityMode: overrides?.entryProximityMode ?? DEFAULT_ENTRY_PROXIMITY_MODE,
		entryProximityAtrPeriod:
			overrides?.entryProximityAtrPeriod ?? DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD,
		invalidationOffsetMode,
		minTradeRatio: overrides?.minTradeRatio ?? DEFAULT_TRADE_DESK_MIN_TRADE_RATIO,
		assumedLeverage: overrides?.assumedLeverage ?? DEFAULT_TRADE_DESK_ASSUMED_LEVERAGE,
		hyperliquid: hyperliquidTradeDeskDefaults(overrides?.hyperliquid),
	};
}
