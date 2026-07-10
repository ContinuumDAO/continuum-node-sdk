import {DEFAULT_ENTRY_PROXIMITY_PCT, withinEntryProximity} from './pattern-limit-entry.js';

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
