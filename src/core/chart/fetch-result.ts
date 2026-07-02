/** Vendor-agnostic OHLCV bar extraction from MCP tool results (any fetch/execute payload). */

import {coerceFiniteNumber} from './point-normalize.js';

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

/**
 * Pull candle rows from a prior OHLCV fetch tool result (CoinGecko execute, DeFi fetch_ohlcv, etc.).
 * Accepts bar objects, OHLC tuples, `{ result: [...] }`, stringified JSON, or common API wrappers.
 */
export function extractOhlcvBarsFromUnknown(payload: unknown): unknown[] | null {
	const parsed = parseJsonIfString(payload);
	const direct = barArrayFromParsed(parsed);
	if (direct) {
		return direct;
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return null;
	}
	const record = parsed as Record<string, unknown>;
	for (const key of NESTED_BAR_KEYS) {
		if (!(key in record)) {
			continue;
		}
		const nested = extractOhlcvBarsFromUnknown(record[key]);
		if (nested?.length) {
			return nested;
		}
	}
	return null;
}
