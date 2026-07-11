import {DEFAULT_ENTRY_PROXIMITY_PCT} from './pattern-limit-entry.js';

/** Desk defaults from trade-defaults skill (§2). */
export const DEFAULT_TRADE_DESK_ENTRY_PROXIMITY_PCT = DEFAULT_ENTRY_PROXIMITY_PCT;
export const DEFAULT_TRADE_DESK_ENTRY_OFFSET_PCT = 1;
export const DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT = 1;

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
