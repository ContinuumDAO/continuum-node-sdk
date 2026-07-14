import {
	DEFAULT_ENTRY_PROXIMITY_MODE,
	DEFAULT_ENTRY_PROXIMITY_PCT,
	type EntryProximityMode,
} from './pattern-limit-entry.js';

/** Desk defaults from trade-defaults skill (§2). */
export const DEFAULT_TRADE_DESK_ENTRY_PROXIMITY_PCT = DEFAULT_ENTRY_PROXIMITY_PCT;
export const DEFAULT_TRADE_DESK_ENTRY_OFFSET_PCT = 1;
export const DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT = 1;
export const DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD = 14;

export type {EntryProximityMode};

export type TradeDeskDefaultPctFields = {
	entryProximityPct: number;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
};

export function tradeDeskDefaultPcts(
	overrides?: Partial<TradeDeskDefaultPctFields>,
): TradeDeskDefaultPctFields {
	return {
		entryProximityPct:
			overrides?.entryProximityPct ?? DEFAULT_TRADE_DESK_ENTRY_PROXIMITY_PCT,
		entryOffsetPct: overrides?.entryOffsetPct ?? DEFAULT_TRADE_DESK_ENTRY_OFFSET_PCT,
		invalidationOffsetPct:
			overrides?.invalidationOffsetPct ?? DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT,
	};
}

export type TradeDeskConfig = TradeDeskDefaultPctFields & {
	entryProximityMode: EntryProximityMode;
	entryProximityAtrPeriod: number;
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
export const DEFAULT_HYPERLIQUID_TARGET_OFFSET_PCT = 1;
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
	return {
		...tradeDeskDefaultPcts(overrides),
		entryProximityMode: overrides?.entryProximityMode ?? DEFAULT_ENTRY_PROXIMITY_MODE,
		entryProximityAtrPeriod:
			overrides?.entryProximityAtrPeriod ?? DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD,
		hyperliquid: hyperliquidTradeDeskDefaults(overrides?.hyperliquid),
	};
}
