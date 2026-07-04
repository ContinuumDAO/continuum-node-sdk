import {z} from 'zod';

export const CmcPlatformSchema = z.enum([
	'ethereum',
	'solana',
	'bsc',
	'base',
	'arbitrum',
	'polygon',
	'optimism',
	'avalanche',
]);

export const CmcKlineIntervalSchema = z.enum([
	'1s',
	'5s',
	'30s',
	'1min',
	'3min',
	'5min',
	'15min',
	'30min',
	'1h',
	'2h',
	'4h',
	'6h',
	'8h',
	'12h',
	'1d',
	'3d',
	'1w',
	'1m',
]);

export const CmcKlineUnitSchema = z.enum(['usd', 'native', 'quote']);

export const GetKlineCandlesInputSchema = z
	.object({
		platform: CmcPlatformSchema,
		address: z.string().min(1),
		interval: CmcKlineIntervalSchema.default('1h'),
		from: z.number().int().optional(),
		to: z.number().int().optional(),
		limit: z.number().int().positive().max(1000).optional(),
		unit: CmcKlineUnitSchema.optional(),
	})
	.strict();

export const SearchDexTokensInputSchema = z
	.object({
		keyword: z.string().min(1),
		limit: z.number().int().positive().max(100).optional(),
	})
	.strict();

export const GetDexTokenInputSchema = z
	.object({
		platform: CmcPlatformSchema,
		address: z.string().min(1),
	})
	.strict();

export const GetDexTokenPoolsInputSchema = z
	.object({
		platform: CmcPlatformSchema,
		address: z.string().min(1),
		limit: z.number().int().positive().max(100).optional(),
	})
	.strict();

export const GetDexPairQuotesInputSchema = z
	.object({
		networkId: z.number().int().positive(),
		contractAddress: z.string().min(1),
	})
	.strict();

export const GetSimplePriceInputSchema = z
	.object({
		ids: z.string().min(1),
		convert: z.string().min(1).default('USD'),
	})
	.strict();

export const GetCryptoQuotesLatestInputSchema = z
	.object({
		id: z.string().min(1),
		convert: z.string().min(1).default('USD'),
	})
	.strict();

export const GetGlobalMetricsLatestInputSchema = z
	.object({
		convert: z.string().min(1).default('USD'),
	})
	.strict();

export const GetFearAndGreedLatestInputSchema = z.object({}).strict();

export const GetFearAndGreedHistoricalInputSchema = z
	.object({
		start: z.number().int().optional(),
		limit: z.number().int().positive().max(500).optional(),
	})
	.strict();

export const GetCmc100LatestInputSchema = z.object({}).strict();

export const GetAltcoinSeasonIndexLatestInputSchema = z.object({}).strict();

export const CmcOhlcvTimePeriodSchema = z.enum(['hourly', 'daily', 'weekly', 'monthly']);

export const GetCryptoOhlcvHistoricalInputSchema = z
	.object({
		id: z.string().min(1),
		convert: z.string().min(1).default('USD'),
		timePeriod: CmcOhlcvTimePeriodSchema.default('hourly'),
		count: z.number().int().positive().max(10000).optional(),
		interval: CmcOhlcvTimePeriodSchema.optional(),
	})
	.strict();

export const GetCryptoOhlcvHistoricalOutputSchema = z
	.object({
		id: z.string(),
		convert: z.string(),
		timePeriod: CmcOhlcvTimePeriodSchema,
		result: z.array(z.record(z.string(), z.unknown())),
	})
	.strict();

export const CmcKlineCandleSchema = z
	.object({
		time: z.number(),
		open: z.number(),
		high: z.number(),
		low: z.number(),
		close: z.number(),
		volume: z.number().optional(),
		traders: z.number().optional(),
	})
	.strict();

export const GetKlineCandlesOutputSchema = z
	.object({
		platform: CmcPlatformSchema,
		address: z.string(),
		interval: CmcKlineIntervalSchema,
		candles: z.array(CmcKlineCandleSchema),
	})
	.strict();
