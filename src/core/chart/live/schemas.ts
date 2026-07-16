import {z} from 'zod';

export const CHART_LIVE_DEFAULT_POLL_MS = 4_000;

export const ChartLiveTickSchema = z
	.object({
		timeMs: z.number().finite(),
		price: z.number().finite(),
		volume: z.number().finite().nonnegative().optional(),
	})
	.strict();

export const ChartLiveBindingSchema = z
	.object({
		providerId: z.string().min(1).max(128),
		bucketSec: z.number().int().min(60).max(86_400 * 7),
		pollMs: z.number().int().min(1_000).max(300_000).optional(),
		maxPoints: z.number().int().min(2).max(5_000).optional(),
		params: z.record(z.string(), z.unknown()),
	})
	.strict();

export type ChartLiveTick = z.infer<typeof ChartLiveTickSchema>;
export type ChartLiveBinding = z.infer<typeof ChartLiveBindingSchema>;

/** Well-known tick provider ids (adapters register under these in node-app). */
export const CHART_LIVE_PROVIDER_HYPERLIQUID_ALL_MIDS = 'hyperliquid.allMids' as const;
export const CHART_LIVE_PROVIDER_LIGHTER_MARKET_SNAPSHOT = 'lighter.marketSnapshot' as const;
export const CHART_LIVE_PROVIDER_GMX_MARK_PRICE = 'gmx.markPrice' as const;
export const CHART_LIVE_PROVIDER_COINGECKO_SIMPLE = 'coingecko.simple' as const;
