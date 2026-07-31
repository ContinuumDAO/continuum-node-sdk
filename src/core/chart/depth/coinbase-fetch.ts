import {normalizeCoinbaseProductBook} from './normalize.js';
import type {NormalizedDepthSnapshot} from './schemas.js';

const COINBASE_PRODUCT_BOOK_URL =
	'https://api.coinbase.com/api/v3/brokerage/market/product_book';
const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_COINBASE_DEPTH_LIMIT = 500;

export function resolveCoinbaseDepthLimit(limit: number | undefined): number {
	if (limit == null || !Number.isFinite(limit)) {
		return DEFAULT_COINBASE_DEPTH_LIMIT;
	}
	return Math.min(Math.max(1, Math.floor(limit)), 5000);
}

export async function fetchCoinbaseDepthSnapshot(options: {
	productId: string;
	limit?: number;
}): Promise<NormalizedDepthSnapshot | null> {
	const productId = options.productId.trim().toUpperCase();
	if (!productId) {
		return null;
	}
	const limit = resolveCoinbaseDepthLimit(options.limit);
	const url =
		`${COINBASE_PRODUCT_BOOK_URL}?product_id=${encodeURIComponent(productId)}` +
		`&limit=${limit}`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const resp = await fetch(url, {
			signal: controller.signal,
			headers: {Accept: 'application/json', 'Cache-Control': 'no-cache'},
		});
		if (!resp.ok) {
			return null;
		}
		const raw = (await resp.json()) as unknown;
		return normalizeCoinbaseProductBook(raw, {symbol: productId, asOfMs: Date.now()});
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}
