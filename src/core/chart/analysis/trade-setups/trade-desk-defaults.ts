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

export type TradeDeskConfig = TradeDeskDefaultPctFields & {
	entryProximityMode: EntryProximityMode;
	entryProximityAtrPeriod: number;
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

export function tradeDeskConfig(overrides?: Partial<TradeDeskConfig>): TradeDeskConfig {
	return {
		...tradeDeskDefaultPcts(overrides),
		entryProximityMode: overrides?.entryProximityMode ?? DEFAULT_ENTRY_PROXIMITY_MODE,
		entryProximityAtrPeriod:
			overrides?.entryProximityAtrPeriod ?? DEFAULT_ENTRY_PROXIMITY_ATR_PERIOD,
	};
}
