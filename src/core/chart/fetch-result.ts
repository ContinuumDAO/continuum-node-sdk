/** Vendor-agnostic OHLCV bar extraction from MCP tool results (any fetch/execute payload). */

function parseJsonIfString(raw: unknown): unknown {
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
	const hasPrice = 'open' in r || 'high' in r || 'low' in r || 'close' in r;
	const hasTime =
		'time' in r ||
		'timestampMs' in r ||
		'openTime' in r ||
		'startTime' in r ||
		'periodStartUnix' in r;
	return hasPrice && hasTime;
}

function barArrayFromParsed(parsed: unknown): unknown[] | null {
	if (!Array.isArray(parsed) || parsed.length === 0) {
		return null;
	}
	return looksLikeOhlcvBar(parsed[0]) ? parsed : null;
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
 * Accepts a bar array, `{ result: [...] }`, stringified JSON, or common API wrapper shapes.
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
