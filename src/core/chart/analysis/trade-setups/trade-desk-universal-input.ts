import {z} from 'zod';
import type {EntryProximityMode} from './pattern-limit-entry.js';
import type {TradeDeskConfig} from './trade-desk-defaults.js';

/** Optional universal desk fields accepted on analyze_* tool inputs (from trade-desk.yaml on the node). */
export const tradeDeskUniversalInputSchema = z
	.object({
		entryProximityPct: z.number().min(0).max(100).optional(),
		entryProximityMode: z.enum(['price', 'atr']).optional(),
		entryProximityAtrPeriod: z.number().int().min(2).max(100).optional(),
		entryOffsetPct: z.number().min(0).max(50).optional(),
		invalidationOffsetPct: z.number().min(0).max(50).optional(),
	})
	.strict();

export type TradeDeskUniversalInput = z.infer<typeof tradeDeskUniversalInputSchema>;

export function pickTradeDeskUniversalFromInput(
	input: TradeDeskUniversalInput | undefined,
): Partial<TradeDeskConfig> {
	if (!input) {
		return {};
	}
	return {
		entryProximityPct: input.entryProximityPct,
		entryProximityMode: input.entryProximityMode as EntryProximityMode | undefined,
		entryProximityAtrPeriod: input.entryProximityAtrPeriod,
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
	};
}
