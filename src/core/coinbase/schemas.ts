import {z} from 'zod';

/** Coinbase Advanced Trade candle granularities (public/authenticated). */
export const CoinbaseGranularitySchema = z.enum([
	'ONE_MINUTE',
	'FIVE_MINUTE',
	'FIFTEEN_MINUTE',
	'THIRTY_MINUTE',
	'ONE_HOUR',
	'TWO_HOUR',
	'FOUR_HOUR',
	'SIX_HOUR',
	'ONE_DAY',
]);
export type CoinbaseGranularity = z.infer<typeof CoinbaseGranularitySchema>;

/** Operator-friendly interval labels accepted by get_product_candles. */
export const CoinbaseIntervalLabelSchema = z.enum([
	'1m',
	'5m',
	'15m',
	'30m',
	'1h',
	'2h',
	'4h',
	'6h',
	'1d',
	'1H',
	'2H',
	'4H',
	'6H',
	'1D',
]);
export type CoinbaseIntervalLabel = z.infer<typeof CoinbaseIntervalLabelSchema>;

export const COINBASE_DATA_SOURCE = 'coinbase_candles' as const;

export const CoinbaseNormalizedCandleSchema = z
	.object({
		time: z.number().finite(),
		open: z.number().finite(),
		high: z.number().finite(),
		low: z.number().finite(),
		close: z.number().finite(),
		volume: z.number().finite().nonnegative().optional(),
	})
	.strict();

export type CoinbaseNormalizedCandle = z.infer<typeof CoinbaseNormalizedCandleSchema>;

export const GetProductCandlesInputSchema = z
	.object({
		productId: z.string().trim().min(3).max(32),
		interval: CoinbaseIntervalLabelSchema.optional(),
		granularity: CoinbaseGranularitySchema.optional(),
		lookbackDays: z.number().positive().max(365).optional(),
		limit: z.number().int().min(1).max(350).optional(),
		start: z.number().int().positive().optional(),
		end: z.number().int().positive().optional(),
	})
	.strict()
	.refine(v => v.interval != null || v.granularity != null, {
		message: 'Pass interval (e.g. 1h) or granularity (e.g. ONE_HOUR).',
	});

export const GetProductCandlesOutputSchema = z
	.object({
		dataSource: z.literal(COINBASE_DATA_SOURCE),
		productId: z.string(),
		granularity: CoinbaseGranularitySchema,
		interval: z.string(),
		candles: z.array(CoinbaseNormalizedCandleSchema).max(350),
		count: z.number().int().nonnegative(),
		meta: z
			.object({
				window: z
					.object({
						start: z.number().int(),
						end: z.number().int(),
						limit: z.number().int(),
					})
					.strict()
					.optional(),
				authMode: z.enum(['public', 'authenticated']).optional(),
				warnings: z.array(z.string()).optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

export const ListProductsInputSchema = z
	.object({
		limit: z.number().int().min(1).max(500).optional(),
		productType: z.enum(['SPOT', 'FUTURE']).optional(),
	})
	.strict();

export const SearchProductsInputSchema = z
	.object({
		query: z.string().trim().min(1).max(64),
		limit: z.number().int().min(1).max(100).optional(),
	})
	.strict();

export const GetProductTickerInputSchema = z
	.object({
		productId: z.string().trim().min(3).max(32),
		limit: z.number().int().min(1).max(100).optional(),
	})
	.strict();

export const GetProductBookInputSchema = z
	.object({
		productId: z.string().trim().min(3).max(32),
		limit: z.number().int().min(1).max(5000).optional(),
	})
	.strict();
