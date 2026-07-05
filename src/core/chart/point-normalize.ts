import type {ChartTime} from './schemas.js';

/** Coerce finite numbers from JSON numbers or numeric strings (DeFi APIs often stringify OHLC). */
export function coerceFiniteNumber(raw: unknown): number | null {
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return raw;
	}
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (!trimmed) {
			return null;
		}
		const n = Number(trimmed);
		if (Number.isFinite(n)) {
			return n;
		}
	}
	return null;
}

export function parseChartTime(raw: unknown): ChartTime | null {
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		if (/^\d+$/.test(trimmed)) {
			const n = Number(trimmed);
			if (Number.isFinite(n)) {
				return parseChartTime(n);
			}
		}
		if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
			const [year, month, day] = trimmed.split('-').map(Number);
			if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
				return null;
			}
			return {year, month, day};
		}
		const ms = Date.parse(trimmed);
		if (Number.isFinite(ms)) {
			return Math.floor(ms / 1000);
		}
		return null;
	}
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		if (raw > 1e12) {
			return Math.floor(raw / 1000);
		}
		if (raw >= 0) {
			return Math.floor(raw);
		}
	}
	return null;
}

/** Map alternate OHLC field names (Uniswap subgraph, Syve, CoinGecko execute shorthand, etc.). */
function mapOhlcFieldAliases(raw: Record<string, unknown>): Record<string, unknown> {
	return {
		...raw,
		...(raw.time == null && raw.t != null ? {time: raw.t} : {}),
		...(raw.time == null && raw.periodStartUnix != null ? {time: raw.periodStartUnix} : {}),
		...(raw.open == null && raw.o != null ? {open: raw.o} : {}),
		...(raw.open == null && raw.price_open != null ? {open: raw.price_open} : {}),
		...(raw.high == null && raw.h != null ? {high: raw.h} : {}),
		...(raw.high == null && raw.price_high != null ? {high: raw.price_high} : {}),
		...(raw.low == null && raw.l != null ? {low: raw.l} : {}),
		...(raw.low == null && raw.price_low != null ? {low: raw.price_low} : {}),
		...(raw.close == null && raw.c != null ? {close: raw.c} : {}),
		...(raw.close == null && raw.price_close != null ? {close: raw.price_close} : {}),
		...(raw.volume == null && raw.v != null ? {volume: raw.v} : {}),
		...(raw.volume == null && raw.volumeUSD != null ? {volume: raw.volumeUSD} : {}),
		...(raw.volume == null && raw.volumeUsd != null ? {volume: raw.volumeUsd} : {}),
	};
}

/** CMC OHLCV: `{ time_open, quote: { USD: { open, high, low, close, volume } } }`. */
function flattenVendorCandleRow(raw: Record<string, unknown>): Record<string, unknown> {
	const quote = raw.quote;
	if (quote && typeof quote === 'object' && !Array.isArray(quote)) {
		const bucket = quote as Record<string, unknown>;
		const currency =
			bucket.USD ?? bucket.usd ?? Object.values(bucket).find(v => typeof v === 'object' && v != null);
		if (currency && typeof currency === 'object' && !Array.isArray(currency)) {
			const c = currency as Record<string, unknown>;
			return {
				time: raw.time_open ?? raw.time_close ?? c.timestamp ?? raw.timestamp,
				open: c.open,
				high: c.high,
				low: c.low,
				close: c.close,
				volume: c.volume,
			};
		}
	}
	return raw;
}

function prepareCandleSourceRow(raw: Record<string, unknown>): Record<string, unknown> {
	return mapOhlcFieldAliases(flattenVendorCandleRow(raw));
}

/**
 * Exchange tuple candles: `[openTime_ms, open, high, low, close, volume?, ...]`
 * (Binance, Bybit, Bitget REST / some MCP wrappers).
 */
export function ohlcvTupleToRow(raw: unknown): Record<string, unknown> | null {
	if (!Array.isArray(raw) || raw.length < 5) {
		return null;
	}
	const row: Record<string, unknown> = {
		time: raw[0],
		open: raw[1],
		high: raw[2],
		low: raw[3],
		close: raw[4],
	};
	if (raw[5] != null) {
		row.volume = raw[5];
	}
	return row;
}

/** Read a chart time from common OHLCV row shapes (CoinGecko, Hyperliquid, GMX, Binance klines). */
export function parseChartTimeFromRow(raw: Record<string, unknown>): ChartTime | null {
	// Prefer millisecond epoch vendor fields before generic `time` — agents often add wrong `time`.
	const preferredKeys = [
		'timestampMs',
		'openTime',
		'startTime',
		'timestamp',
		'time_open',
		'periodStartUnix',
		'timestamp_open',
		't',
	] as const;
	for (const key of preferredKeys) {
		if (key in raw) {
			const parsed = parseChartTime(raw[key]);
			if (parsed != null) {
				return parsed;
			}
		}
	}
	if ('time' in raw) {
		const parsed = parseChartTime(raw.time);
		if (parsed != null) {
			return parsed;
		}
	}
	return null;
}

export function normalizeCandleRow(
	raw: Record<string, unknown>,
): {time: ChartTime; open: number; high: number; low: number; close: number; volume?: number} | null {
	const flat = prepareCandleSourceRow(raw);
	const time = parseChartTimeFromRow(flat);
	const open = coerceFiniteNumber(flat.open);
	const high = coerceFiniteNumber(flat.high);
	const low = coerceFiniteNumber(flat.low);
	const close = coerceFiniteNumber(flat.close);
	if (time == null || open == null || high == null || low == null || close == null) {
		return null;
	}
	const volume = coerceFiniteNumber(
		flat.volume ?? flat.volumeUSD ?? flat.volumeUsd,
	);
	return {
		time,
		open,
		high,
		low,
		close,
		...(volume != null && volume >= 0 ? {volume} : {}),
	};
}

export function normalizeLineRow(
	raw: Record<string, unknown>,
): {time: ChartTime; value: number} | null {
	const mapped =
		raw.value == null && raw.close != null ? {...raw, value: raw.close} : raw;
	const time = parseChartTimeFromRow(mapped);
	const value = coerceFiniteNumber(mapped.value);
	if (time == null || value == null) {
		return null;
	}
	return {time, value};
}

export function normalizeHistogramRow(
	raw: Record<string, unknown>,
): {time: ChartTime; value: number; color?: string} | null {
	const time = parseChartTimeFromRow(raw);
	const value = coerceFiniteNumber(raw.value ?? raw.volume);
	if (time == null || value == null) {
		return null;
	}
	const color = raw.color;
	return {
		time,
		value,
		...(typeof color === 'string' && color.trim() ? {color: color.trim()} : {}),
	};
}
