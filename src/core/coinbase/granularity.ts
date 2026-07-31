import type {CoinbaseGranularity, CoinbaseIntervalLabel} from './schemas.js';

const LABEL_TO_GRANULARITY: Record<string, CoinbaseGranularity> = {
	'1m': 'ONE_MINUTE',
	'5m': 'FIVE_MINUTE',
	'15m': 'FIFTEEN_MINUTE',
	'30m': 'THIRTY_MINUTE',
	'1h': 'ONE_HOUR',
	'1H': 'ONE_HOUR',
	'2h': 'TWO_HOUR',
	'2H': 'TWO_HOUR',
	'4h': 'FOUR_HOUR',
	'4H': 'FOUR_HOUR',
	'6h': 'SIX_HOUR',
	'6H': 'SIX_HOUR',
	'1d': 'ONE_DAY',
	'1D': 'ONE_DAY',
};

const GRANULARITY_SEC: Record<CoinbaseGranularity, number> = {
	ONE_MINUTE: 60,
	FIVE_MINUTE: 300,
	FIFTEEN_MINUTE: 900,
	THIRTY_MINUTE: 1800,
	ONE_HOUR: 3600,
	TWO_HOUR: 7200,
	FOUR_HOUR: 14_400,
	SIX_HOUR: 21_600,
	ONE_DAY: 86_400,
};

const GRANULARITY_TO_INTERVAL: Record<CoinbaseGranularity, string> = {
	ONE_MINUTE: '1m',
	FIVE_MINUTE: '5m',
	FIFTEEN_MINUTE: '15m',
	THIRTY_MINUTE: '30m',
	ONE_HOUR: '1H',
	TWO_HOUR: '2H',
	FOUR_HOUR: '4H',
	SIX_HOUR: '6H',
	ONE_DAY: '1D',
};

export function resolveCoinbaseGranularity(input: {
	interval?: CoinbaseIntervalLabel | string;
	granularity?: CoinbaseGranularity;
}): CoinbaseGranularity | null {
	if (input.granularity) {
		return input.granularity;
	}
	const label = input.interval?.trim();
	if (!label) {
		return null;
	}
	return LABEL_TO_GRANULARITY[label] ?? LABEL_TO_GRANULARITY[label.toLowerCase()] ?? null;
}

export function coinbaseGranularityToSeconds(granularity: CoinbaseGranularity): number {
	return GRANULARITY_SEC[granularity];
}

export function coinbaseGranularityToIntervalLabel(granularity: CoinbaseGranularity): string {
	return GRANULARITY_TO_INTERVAL[granularity];
}

export function resolveCoinbaseCandleWindow(input: {
	granularity: CoinbaseGranularity;
	lookbackDays?: number;
	limit?: number;
	start?: number;
	end?: number;
	nowSec?: number;
}): {start: number; end: number; limit: number} {
	const intervalSec = coinbaseGranularityToSeconds(input.granularity);
	const end = input.end ?? input.nowSec ?? Math.floor(Date.now() / 1000);
	let limit = input.limit;
	if (input.lookbackDays != null) {
		limit = Math.ceil((input.lookbackDays * 86_400) / intervalSec);
	}
	if (limit == null) {
		limit = Math.ceil((7 * 86_400) / intervalSec);
	}
	limit = Math.min(Math.max(1, limit), 350);
	const start = input.start ?? end - limit * intervalSec;
	return {start, end, limit};
}
