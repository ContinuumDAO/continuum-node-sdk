import type {EntryOffsetMode} from './pattern-limit-entry.js';
import {DEFAULT_ENTRY_PROXIMITY_PCT, withinEntryProximity} from './pattern-limit-entry.js';
import type {TradeSetupSide} from './shared.js';
import {
	DEFAULT_TRADE_DESK_ENTRY_OFFSET_PCT,
	type TradeDeskDefaultPctFields,
	tradeDeskDefaultPcts,
} from './trade-desk-defaults.js';

export {DEFAULT_ENTRY_PROXIMITY_PCT, withinEntryProximity};

export type EntryProximityGateInput = {
	lastClose: number;
	entryPrice: number;
	entryProximityPct?: number;
	skipProximity?: boolean;
};

export function passesEntryProximityGate(input: EntryProximityGateInput): boolean {
	if (input.skipProximity) {
		return true;
	}
	return withinEntryProximity(
		input.lastClose,
		input.entryPrice,
		input.entryProximityPct ?? DEFAULT_ENTRY_PROXIMITY_PCT,
	);
}

export function entryProximityUnclearReason(pct = DEFAULT_ENTRY_PROXIMITY_PCT): string {
	return `Price not within ${pct}% of entry — idea suppressed until price is actionable.`;
}

function entryOffsetBandPrice(
	price: number,
	side: TradeSetupSide,
	offsetPct: number,
	mode: EntryOffsetMode,
): number {
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

/** Retest offset band from trade-defaults §3 (pullback toward broken level). */
export function passesRetestEntryOffsetBand(input: {
	lastClose: number;
	entryPrice: number;
	side: TradeSetupSide;
	entryOffsetPct?: number;
}): boolean {
	const offsetPct = input.entryOffsetPct ?? DEFAULT_TRADE_DESK_ENTRY_OFFSET_PCT;
	const band = entryOffsetBandPrice(input.entryPrice, input.side, offsetPct, 'retest');
	if (input.side === 'long') {
		return input.lastClose >= input.entryPrice && input.lastClose <= band;
	}
	if (input.side === 'short') {
		return input.lastClose <= input.entryPrice && input.lastClose >= band;
	}
	return false;
}

export function retestEntryOffsetUnclearReason(offsetPct = DEFAULT_TRADE_DESK_ENTRY_OFFSET_PCT): string {
	return `Price not within ${offsetPct}% retest band of entry — wait for pullback to broken level.`;
}

export type AssessTradeSetupEntryInput = {
	lastClose: number;
	entryPrice: number;
	side: TradeSetupSide;
	entryOffsetMode: EntryOffsetMode;
	entryProximityPct?: number;
	entryOffsetPct?: number;
	/** Break continuation / build-time retest — skip proximity (trade-defaults §2). */
	skipProximityGate?: boolean;
};

export function assessTradeSetupEntryActionability(
	input: AssessTradeSetupEntryInput,
): {ok: true; deskPcts: TradeDeskDefaultPctFields} | {ok: false; unclearReason: string; deskPcts: TradeDeskDefaultPctFields} {
	const deskPcts = tradeDeskDefaultPcts({
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
	});

	if (input.skipProximityGate) {
		return {ok: true, deskPcts};
	}

	if (input.entryOffsetMode === 'retest') {
		if (
			passesRetestEntryOffsetBand({
				lastClose: input.lastClose,
				entryPrice: input.entryPrice,
				side: input.side,
				entryOffsetPct: deskPcts.entryOffsetPct,
			}) ||
			withinEntryProximity(input.lastClose, input.entryPrice, deskPcts.entryProximityPct)
		) {
			return {ok: true, deskPcts};
		}
		return {
			ok: false,
			unclearReason: retestEntryOffsetUnclearReason(deskPcts.entryOffsetPct),
			deskPcts,
		};
	}

	if (
		passesEntryProximityGate({
			lastClose: input.lastClose,
			entryPrice: input.entryPrice,
			entryProximityPct: deskPcts.entryProximityPct,
		})
	) {
		return {ok: true, deskPcts};
	}

	return {
		ok: false,
		unclearReason: entryProximityUnclearReason(deskPcts.entryProximityPct),
		deskPcts,
	};
}
