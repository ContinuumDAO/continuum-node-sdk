import {normalizeBinanceDepth} from './normalize.js';
import {
	BINANCE_DEPTH_LIMITS,
	DEFAULT_DEPTH_LIMIT,
	type BinanceDepthLimit,
	type NormalizedDepthSnapshot,
} from './schemas.js';

const BINANCE_DEPTH_URL = 'https://data-api.binance.vision/api/v3/depth';
const FETCH_TIMEOUT_MS = 10_000;

export function resolveBinanceDepthLimit(limit: number | undefined): BinanceDepthLimit {
	if (limit != null && (BINANCE_DEPTH_LIMITS as readonly number[]).includes(limit)) {
		return limit as BinanceDepthLimit;
	}
	return DEFAULT_DEPTH_LIMIT;
}

export async function fetchBinanceDepthSnapshot(options: {
	symbol: string;
	limit?: number;
}): Promise<NormalizedDepthSnapshot | null> {
	const symbol = options.symbol.trim().toUpperCase();
	if (!symbol) {
		return null;
	}
	const limit = resolveBinanceDepthLimit(options.limit);
	const url = `${BINANCE_DEPTH_URL}?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const resp = await fetch(url, {signal: controller.signal});
		if (!resp.ok) {
			return null;
		}
		const raw = (await resp.json()) as unknown;
		return normalizeBinanceDepth(raw, {symbol, asOfMs: Date.now()});
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}
