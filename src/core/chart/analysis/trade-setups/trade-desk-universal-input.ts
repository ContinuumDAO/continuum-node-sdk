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
		invalidationOffsetMode: z.enum(['price', 'atr']).optional(),
		/** Per-leg strength/100 gate for key-level Fib strongest-bracket (default 0.35). */
		fibKeyLevelMinConfidence: z.number().min(0).max(1).optional(),
		/** Donchian channel length (bars); also bound as analyze `period` when unset. */
		donchianPeriod: z.number().int().min(2).max(500).optional(),
		/** Donchian primary entry style: retest (default) | immediate. */
		donchianEntryMode: z.enum(['retest', 'immediate']).optional(),
		/** Donchian target distance as multiple of ATR (default 3): entry ± multiple × ATR. */
		donchianTargetAtrMultiple: z.number().min(0.1).max(50).optional(),
		/** Supertrend ATR length; also bound as analyze `period` when unset. */
		supertrendPeriod: z.number().int().min(2).max(500).optional(),
		/** Supertrend ATR multiplier; also bound as analyze `multiplier` when unset. */
		supertrendMultiplier: z.number().positive().max(20).optional(),
		/** Supertrend primary entry style: flip (default) | retest. */
		supertrendEntryMode: z.enum(['flip', 'retest']).optional(),
		/** Supertrend target distance as multiple of ATR (default 3). */
		supertrendTargetAtrMultiple: z.number().min(0.1).max(50).optional(),
		/** Ichimoku Tenkan length. */
		ichimokuConversionPeriod: z.number().int().min(2).max(500).optional(),
		/** Ichimoku Kijun length. */
		ichimokuBasePeriod: z.number().int().min(2).max(500).optional(),
		/** Ichimoku Senkou Span B length. */
		ichimokuSpanPeriod: z.number().int().min(2).max(500).optional(),
		/** Ichimoku cloud / chikou displacement. */
		ichimokuDisplacement: z.number().int().min(1).max(200).optional(),
		/** Ichimoku target distance as multiple of ATR (default 3). */
		ichimokuTargetAtrMultiple: z.number().min(0.1).max(50).optional(),
		/** Z-score SMA/SD lookback (bars); also bound as analyze `period` when unset. */
		zScorePeriod: z.number().int().min(2).max(500).optional(),
		/** Enter when |Z| ≥ this threshold (default 2). */
		zScoreEntry: z.number().positive().max(20).optional(),
		/** Target when Z returns to this level vs mean (default 0.5). */
		zScoreExit: z.number().min(0).max(10).optional(),
		/** Invalidation distance as multiple of ATR (default 2). */
		zScoreStopAtrMultiple: z.number().min(0.1).max(50).optional(),
		/** Optional ATR contraction gate: none | contracting. */
		zScoreAtrFilter: z.enum(['none', 'contracting']).optional(),
		/** Divergence detector oscillator mode when analyze arg omitted. */
		divergenceOscillator: z.enum(['rsi', 'stochasticrsi', 'both']).optional(),
		/** Max bars between paired price/oscillator pivots (default 3). */
		divergenceMaxLag: z.number().int().min(1).max(20).optional(),
		/** Spot depth sampler exchange (v1: binance). */
		depthExchangeId: z.enum(['binance', 'coinbase']).optional(),
		/** Seconds between depth polls (default 12). */
		depthSampleIntervalSec: z.number().int().min(5).max(300).optional(),
		/** Rolling average window seconds (default 300). */
		depthAverageWindowSec: z.number().int().min(30).max(3_600).optional(),
		/** Venue depth limit (Binance enum; default 500). */
		depthLimit: z.number().int().min(5).max(5_000).optional(),
		/** Rows in liquidity depth levelMenu (default 8). */
		depthLevelCount: z.number().int().min(1).max(32).optional(),
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
		invalidationOffsetMode: input.invalidationOffsetMode as EntryProximityMode | undefined,
	};
}

export function pickFibKeyLevelMinConfidenceFromInput(
	input: TradeDeskUniversalInput | undefined,
): number | undefined {
	return input?.fibKeyLevelMinConfidence;
}
