import type {z} from 'zod';
import type {CmcKlineCandle} from './kline.js';
import type {CmcKlineIntervalSchema} from './schemas.js';

type CmcKlineInterval = z.infer<typeof CmcKlineIntervalSchema>;

const INTERVAL_SEC: Record<CmcKlineInterval, number> = {
	'1s': 1,
	'5s': 5,
	'30s': 30,
	'1min': 60,
	'3min': 180,
	'5min': 300,
	'15min': 900,
	'30min': 1800,
	'1h': 3600,
	'2h': 7200,
	'4h': 14_400,
	'6h': 21_600,
	'8h': 28_800,
	'12h': 43_200,
	'1d': 86_400,
	'3d': 259_200,
	'1w': 604_800,
	'1m': 2_592_000,
};

export type KlineQueryWindow = {
	from: number;
	to: number;
	limit: number;
	lookbackDays?: number;
};

export function cmcIntervalToSeconds(interval: CmcKlineInterval): number {
	return INTERVAL_SEC[interval];
}

export function resolveKlineQueryWindow(input: {
	interval: CmcKlineInterval;
	from?: number;
	to?: number;
	limit?: number;
	lookbackDays?: number;
	nowSec?: number;
}): KlineQueryWindow {
	const intervalSec = cmcIntervalToSeconds(input.interval);
	const to = input.to ?? input.nowSec ?? Math.floor(Date.now() / 1000);

	let limit = input.limit;
	if (input.lookbackDays != null) {
		limit = Math.ceil((input.lookbackDays * 86_400) / intervalSec);
	}
	if (limit == null) {
		limit = Math.ceil((7 * 86_400) / intervalSec);
	}
	limit = Math.min(Math.max(1, limit), 1000);

	const from =
		input.from ?? to - limit * intervalSec;

	return {
		from,
		to,
		limit,
		...(input.lookbackDays != null ? {lookbackDays: input.lookbackDays} : {}),
	};
}

/** Sort ascending and keep the newest N bars (keyless API — no from/to on wire). */
export function trimKlineCandlesToRecentLimit(
	candles: CmcKlineCandle[],
	limit: number,
): CmcKlineCandle[] {
	if (!candles.length) {
		return candles;
	}
	const sorted = [...candles].sort((a, b) => a.time - b.time);
	return sorted.slice(-Math.max(1, limit));
}

export function klineDataStalenessWarning(
	candles: CmcKlineCandle[],
	nowSec = Math.floor(Date.now() / 1000),
): string | undefined {
	if (!candles.length) {
		return undefined;
	}
	const latest = candles[candles.length - 1]!.time;
	const ageHours = (nowSec - latest) / 3600;
	if (ageHours <= 48) {
		return undefined;
	}
	const ageDays = Math.round(ageHours / 24);
	return (
		`CMC keyless DEX k-lines end at ${new Date(latest * 1000).toISOString()} ` +
		`(~${ageDays}d ago). The keyless API does not support from/to time filters and may lag. ` +
		'For current ETH/BTC spot OHLCV, ask the operator which source to use (CoinGecko, CMC Pro get_crypto_ohlcv_historical, DeFi venue) — see chart-ohlcv-sources.'
	);
}

/** Sort ascending and keep the newest bars inside the requested window. */
export function trimKlineCandlesToWindow(
	candles: CmcKlineCandle[],
	window: KlineQueryWindow,
): CmcKlineCandle[] {
	if (!candles.length) {
		return candles;
	}
	const sorted = [...candles].sort((a, b) => a.time - b.time);
	const inWindow = sorted.filter(c => c.time >= window.from && c.time <= window.to);
	const pool = inWindow.length > 0 ? inWindow : sorted;
	return pool.slice(-window.limit);
}
