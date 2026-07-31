import {coerceFiniteNumber, parseChartTime} from '../chart/point-normalize.js';
import type {CoinbaseNormalizedCandle} from './schemas.js';

/** Normalize one Coinbase Advanced Trade candle `{ start, open, high, low, close, volume }`. */
export function normalizeCoinbaseCandle(raw: unknown): CoinbaseNormalizedCandle | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const record = raw as Record<string, unknown>;
	const time = parseChartTime(record.start ?? record.time ?? record.timestamp);
	if (typeof time !== 'number') {
		return null;
	}
	const open = coerceFiniteNumber(record.open);
	const high = coerceFiniteNumber(record.high);
	const low = coerceFiniteNumber(record.low);
	const close = coerceFiniteNumber(record.close);
	if (open == null || high == null || low == null || close == null) {
		return null;
	}
	const volume = coerceFiniteNumber(record.volume);
	return {
		time,
		open,
		high,
		low,
		close,
		...(volume != null && volume >= 0 ? {volume} : {}),
	};
}

export function normalizeCoinbaseCandles(raw: unknown): CoinbaseNormalizedCandle[] {
	const list = Array.isArray(raw)
		? raw
		: raw && typeof raw === 'object' && Array.isArray((raw as {candles?: unknown}).candles)
			? (raw as {candles: unknown[]}).candles
			: [];
	const out: CoinbaseNormalizedCandle[] = [];
	for (const row of list) {
		const candle = normalizeCoinbaseCandle(row);
		if (candle) {
			out.push(candle);
		}
	}
	out.sort((a, b) => a.time - b.time);
	return out;
}

/** Keep newest N bars after ascending sort. */
export function trimCoinbaseCandles(
	candles: CoinbaseNormalizedCandle[],
	limit: number,
): CoinbaseNormalizedCandle[] {
	if (candles.length <= limit) {
		return candles;
	}
	return candles.slice(candles.length - limit);
}
