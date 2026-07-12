import type {EntryOffsetMode, EntryProximityMode, WithinEntryProximityOptions} from './pattern-limit-entry.js';
import {
	DEFAULT_ENTRY_PROXIMITY_MODE,
	DEFAULT_ENTRY_PROXIMITY_PCT,
	entryProximityGateLabel,
	withinEntryProximity,
} from './pattern-limit-entry.js';
import type {TradeSetupSide} from './shared.js';
import {
	DEFAULT_TRADE_DESK_ENTRY_OFFSET_PCT,
	type TradeDeskConfig,
	tradeDeskConfig,
} from './trade-desk-defaults.js';

export {DEFAULT_ENTRY_PROXIMITY_PCT, withinEntryProximity};

export type EntryProximityGateInput = {
	lastClose: number;
	entryPrice: number;
	entryProximityPct?: number;
	entryProximityMode?: EntryProximityMode;
	entryProximityAtr?: number | null;
	skipProximity?: boolean;
};

function proximityOptionsFromGate(input: EntryProximityGateInput): WithinEntryProximityOptions {
	return {
		mode: input.entryProximityMode ?? DEFAULT_ENTRY_PROXIMITY_MODE,
		atr: input.entryProximityAtr,
	};
}

export function passesEntryProximityGate(input: EntryProximityGateInput): boolean {
	if (input.skipProximity) {
		return true;
	}
	return withinEntryProximity(
		input.lastClose,
		input.entryPrice,
		input.entryProximityPct ?? DEFAULT_ENTRY_PROXIMITY_PCT,
		proximityOptionsFromGate(input),
	);
}

export function entryProximityUnclearReason(
	pct = DEFAULT_ENTRY_PROXIMITY_PCT,
	mode: EntryProximityMode = DEFAULT_ENTRY_PROXIMITY_MODE,
): string {
	return `Price not within ${entryProximityGateLabel(pct, mode)} — idea suppressed until price is actionable.`;
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
	entryProximityMode?: EntryProximityMode;
	entryProximityAtr?: number | null;
	entryOffsetPct?: number;
	/** Break continuation / build-time retest — skip proximity (trade-defaults §2). */
	skipProximityGate?: boolean;
};

export function assessTradeSetupEntryActionability(
	input: AssessTradeSetupEntryInput,
): {ok: true; deskPcts: TradeDeskConfig} | {ok: false; unclearReason: string; deskPcts: TradeDeskConfig} {
	const deskPcts = tradeDeskConfig({
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
		entryProximityMode: input.entryProximityMode,
	});
	const proximityOptions = proximityOptionsFromGate({
		lastClose: input.lastClose,
		entryPrice: input.entryPrice,
		entryProximityPct: deskPcts.entryProximityPct,
		entryProximityMode: deskPcts.entryProximityMode,
		entryProximityAtr: input.entryProximityAtr,
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
			withinEntryProximity(
				input.lastClose,
				input.entryPrice,
				deskPcts.entryProximityPct,
				proximityOptions,
			)
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
			entryProximityMode: deskPcts.entryProximityMode,
			entryProximityAtr: input.entryProximityAtr,
		})
	) {
		return {ok: true, deskPcts};
	}

	return {
		ok: false,
		unclearReason: entryProximityUnclearReason(
			deskPcts.entryProximityPct,
			deskPcts.entryProximityMode,
		),
		deskPcts,
	};
}
