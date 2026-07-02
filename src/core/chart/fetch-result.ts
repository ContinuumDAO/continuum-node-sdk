/** Vendor-agnostic OHLCV bar extraction from MCP tool results (any fetch/execute payload). */

import {
	buildOhlcvBarsFromPriceVolumeSeries,
	type BuildOhlcvBarsFromPriceVolumeOptions,
} from './price-volume-bars.js';
import {coerceFiniteNumber, ohlcvTupleToRow} from './point-normalize.js';

export type ExtractOhlcvBarsOptions = BuildOhlcvBarsFromPriceVolumeOptions;

export function parseJsonIfString(raw: unknown): unknown {
	if (typeof raw !== 'string') {
		return raw;
	}
	const trimmed = raw.trim();
	if (!trimmed) {
		return raw;
	}
	if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
		try {
			return JSON.parse(trimmed) as unknown;
		} catch {
			return raw;
		}
	}
	return raw;
}

export function looksLikeOhlcvBar(row: unknown): boolean {
	if (!row || typeof row !== 'object' || Array.isArray(row)) {
		return false;
	}
	const r = row as Record<string, unknown>;
	const hasPrice =
		'open' in r ||
		'high' in r ||
		'low' in r ||
		'close' in r ||
		'o' in r ||
		'h' in r ||
		'l' in r ||
		'c' in r;
	const hasTime =
		'time' in r ||
		't' in r ||
		'timestampMs' in r ||
		'openTime' in r ||
		'startTime' in r ||
		'periodStartUnix' in r;
	return hasPrice && hasTime;
}

function looksLikeOhlcvTuple(row: unknown): boolean {
	if (!Array.isArray(row) || row.length < 5) {
		return false;
	}
	return coerceFiniteNumber(row[1]) != null && coerceFiniteNumber(row[4]) != null;
}

function barArrayFromParsed(parsed: unknown): unknown[] | null {
	if (!Array.isArray(parsed) || parsed.length === 0) {
		return null;
	}
	if (looksLikeOhlcvBar(parsed[0]) || looksLikeOhlcvTuple(parsed[0])) {
		return parsed;
	}
	return null;
}

const NESTED_BAR_KEYS = [
	'result',
	'rows',
	'bars',
	'candles',
	'data',
	'ohlcv',
	'list',
	'klines',
	'candlesticks',
] as const;

function looksLikePriceVolumePoint(row: unknown): boolean {
	return Array.isArray(row) && row.length >= 2 && coerceFiniteNumber(row[1]) != null;
}

function looksLikeMarketChart(record: Record<string, unknown>): boolean {
	const prices = record.prices;
	return Array.isArray(prices) && prices.length > 0 && looksLikePriceVolumePoint(prices[0]);
}

function extractMarketChartBars(
	record: Record<string, unknown>,
	options: ExtractOhlcvBarsOptions,
): unknown[] | null {
	if (!looksLikeMarketChart(record)) {
		return null;
	}
	const bars = buildOhlcvBarsFromPriceVolumeSeries(
		record.prices as unknown[],
		record.total_volumes as unknown[] | undefined,
		options,
	);
	return bars.length > 0 ? bars : null;
}

/** True when at least one row carries a usable volume field (including zero). */
export function barRowsHaveVolume(rows: unknown[]): boolean {
	for (const raw of rows) {
		const row = Array.isArray(raw) ? ohlcvTupleToRow(raw) : raw;
		if (!row || typeof row !== 'object') {
			continue;
		}
		const r = row as Record<string, unknown>;
		const hasVolumeKey =
			'volume' in r ||
			'v' in r ||
			'volumeUSD' in r ||
			'volumeUsd' in r ||
			(Array.isArray(raw) && raw.length >= 6);
		if (!hasVolumeKey) {
			continue;
		}
		const volume = coerceFiniteNumber(
			r.volume ?? r.volumeUSD ?? r.volumeUsd ?? r.v ?? (Array.isArray(raw) ? raw[5] : undefined),
		);
		if (volume != null && volume >= 0) {
			return true;
		}
	}
	return false;
}

/**
 * Pull candle rows from a prior OHLCV fetch tool result (CoinGecko execute, DeFi fetch_ohlcv, etc.).
 * Accepts bar objects, OHLC tuples, `{ result: [...] }`, spot `{ prices, total_volumes }` (marketChart),
 * stringified JSON, or common API wrappers.
 */
export function extractOhlcvBarsFromUnknown(
	payload: unknown,
	options: ExtractOhlcvBarsOptions = {},
): unknown[] | null {
	const parsed = parseJsonIfString(payload);
	const direct = barArrayFromParsed(parsed);
	if (direct) {
		return direct;
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return null;
	}
	const record = parsed as Record<string, unknown>;
	const fromMarketChart = extractMarketChartBars(record, options);
	if (fromMarketChart?.length) {
		return fromMarketChart;
	}
	for (const key of NESTED_BAR_KEYS) {
		if (!(key in record)) {
			continue;
		}
		const child = record[key];
		if (child && typeof child === 'object' && !Array.isArray(child)) {
			const fromNestedMarketChart = extractMarketChartBars(
				child as Record<string, unknown>,
				options,
			);
			if (fromNestedMarketChart?.length) {
				return fromNestedMarketChart;
			}
		}
		const nested = extractOhlcvBarsFromUnknown(child, options);
		if (nested?.length) {
			return nested;
		}
	}
	return null;
}
