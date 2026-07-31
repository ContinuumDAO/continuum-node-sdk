import {z} from 'zod';

/** Extensible exchange ids for spot depth adapters. */
export const DepthExchangeIdSchema = z.enum(['binance', 'coinbase']);
export type DepthExchangeId = z.infer<typeof DepthExchangeIdSchema>;

export const NormalizedDepthLevelSchema = z
	.object({
		price: z.number().finite(),
		size: z.number().finite().nonnegative(),
	})
	.strict();

export type NormalizedDepthLevel = z.infer<typeof NormalizedDepthLevelSchema>;

/** Vendor-neutral L2 snapshot after adapter normalization. */
export const NormalizedDepthSnapshotSchema = z
	.object({
		exchangeId: DepthExchangeIdSchema,
		market: z.literal('spot'),
		symbol: z.string().trim().min(1).max(64),
		asOfMs: z.number().finite(),
		bids: z.array(NormalizedDepthLevelSchema).max(5_000),
		asks: z.array(NormalizedDepthLevelSchema).max(5_000),
		mid: z.number().finite().optional(),
		updateId: z.union([z.string(), z.number()]).optional(),
	})
	.strict();

export type NormalizedDepthSnapshot = z.infer<typeof NormalizedDepthSnapshotSchema>;

export const DepthProfileBinSchema = z
	.object({
		priceLo: z.number().finite(),
		priceHi: z.number().finite(),
		bidSize: z.number().finite().nonnegative(),
		askSize: z.number().finite().nonnegative(),
		totalSize: z.number().finite().nonnegative(),
	})
	.strict();

export type DepthProfileBin = z.infer<typeof DepthProfileBinSchema>;

export const AveragedDepthProfileSchema = z
	.object({
		exchangeId: DepthExchangeIdSchema,
		market: z.literal('spot'),
		symbol: z.string().trim().min(1).max(64),
		mid: z.number().finite().optional(),
		asOfMs: z.number().finite(),
		windowSec: z.number().int().positive(),
		sampleCount: z.number().int().nonnegative(),
		bins: z.array(DepthProfileBinSchema).max(2_000),
	})
	.strict();

export type AveragedDepthProfile = z.infer<typeof AveragedDepthProfileSchema>;

/** Binance-allowed depth limits. */
export const BINANCE_DEPTH_LIMITS = [5, 10, 20, 50, 100, 500, 1000, 5000] as const;
export type BinanceDepthLimit = (typeof BINANCE_DEPTH_LIMITS)[number];

export const DEFAULT_DEPTH_EXCHANGE_ID: DepthExchangeId = 'binance';
export const DEFAULT_DEPTH_SAMPLE_INTERVAL_SEC = 12;
export const DEFAULT_DEPTH_AVERAGE_WINDOW_SEC = 300;
export const DEFAULT_DEPTH_LIMIT: BinanceDepthLimit = 500;
export const DEFAULT_DEPTH_LEVEL_COUNT = 8;
export const DEFAULT_DEPTH_MIN_SAMPLES = 5;
