import type {EntryOffsetMode, EntryProximityMode} from './pattern-limit-entry.js';
import type {TradeSetupSide} from './shared.js';
import {
	DEFAULT_TRADE_DESK_ENTRY_OFFSET_PCT,
	DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT,
	DEFAULT_HYPERLIQUID_TARGET_OFFSET_MODE,
} from './trade-desk-defaults.js';

export function applyEntryOffset(
	price: number,
	side: TradeSetupSide,
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
	side: TradeSetupSide,
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

export function applyTargetOffset(
	price: number,
	side: TradeSetupSide,
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

export type DeskOffsetPriceInput = {
	side: TradeSetupSide;
	entry: number;
	target?: number;
	invalidation?: number;
	entryOffsetMode?: EntryOffsetMode;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	/** When omitted, target is left unadjusted (analysis-level check). */
	targetOffsetPct?: number;
	targetOffsetMode?: EntryProximityMode;
	atr?: number | null;
};

/** Apply desk offsets; defaults match trade-desk entry/invalidation pcts. */
export function pricesAfterDeskOffsets(input: DeskOffsetPriceInput): {
	entry: number;
	target?: number;
	invalidation?: number;
} {
	const side = input.side;
	const entryMode = input.entryOffsetMode ?? 'bounce';
	const entryOffsetPct = input.entryOffsetPct ?? DEFAULT_TRADE_DESK_ENTRY_OFFSET_PCT;
	const invalidationOffsetPct =
		input.invalidationOffsetPct ?? DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT;
	const entry = applyEntryOffset(input.entry, side, entryOffsetPct, entryMode);
	const invalidation =
		input.invalidation != null
			? applyInvalidationOffset(input.invalidation, side, invalidationOffsetPct)
			: undefined;
	let target = input.target;
	if (target != null && input.targetOffsetPct != null) {
		const mode = input.targetOffsetMode ?? DEFAULT_HYPERLIQUID_TARGET_OFFSET_MODE;
		const atr = mode === 'atr' ? input.atr : null;
		const effectiveMode = mode === 'atr' && atr == null ? 'price' : mode;
		target = applyTargetOffset(target, side, input.targetOffsetPct, effectiveMode, atr);
	}
	return {
		entry,
		...(target != null ? {target} : {}),
		...(invalidation != null ? {invalidation} : {}),
	};
}

/** Convenience: analysis-time check uses entry/invalidation desk defaults, not TP band. */
export function pricesAfterDefaultDeskOffsets(input: {
	side: TradeSetupSide;
	entry: number;
	target?: number;
	invalidation?: number;
	entryOffsetMode?: EntryOffsetMode;
}): {
	entry: number;
	target?: number;
	invalidation?: number;
} {
	return pricesAfterDeskOffsets({
		...input,
		entryOffsetPct: DEFAULT_TRADE_DESK_ENTRY_OFFSET_PCT,
		invalidationOffsetPct: DEFAULT_TRADE_DESK_INVALIDATION_OFFSET_PCT,
		// Leave analysis target unadjusted; TP band is applied only at build time.
		targetOffsetPct: undefined,
	});
}
