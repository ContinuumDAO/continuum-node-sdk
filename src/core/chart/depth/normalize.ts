import {coerceFiniteNumber} from '../point-normalize.js';
import type {DepthExchangeId, NormalizedDepthLevel, NormalizedDepthSnapshot} from './schemas.js';

function levelFromTuple(row: unknown): NormalizedDepthLevel | null {
	if (!Array.isArray(row) || row.length < 2) {
		return null;
	}
	const price = coerceFiniteNumber(row[0]);
	const size = coerceFiniteNumber(row[1]);
	if (price == null || size == null || size < 0) {
		return null;
	}
	return {price, size};
}

function levelFromObject(row: unknown): NormalizedDepthLevel | null {
	if (!row || typeof row !== 'object' || Array.isArray(row)) {
		return null;
	}
	const record = row as Record<string, unknown>;
	const price = coerceFiniteNumber(record.price);
	const size = coerceFiniteNumber(record.size ?? record.quantity ?? record.qty);
	if (price == null || size == null || size < 0) {
		return null;
	}
	return {price, size};
}

function normalizeLevels(raw: unknown): NormalizedDepthLevel[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const out: NormalizedDepthLevel[] = [];
	for (const row of raw) {
		const level = Array.isArray(row) ? levelFromTuple(row) : levelFromObject(row);
		if (level) {
			out.push(level);
		}
	}
	return out;
}

function midFromBook(bids: NormalizedDepthLevel[], asks: NormalizedDepthLevel[]): number | undefined {
	const bestBid = bids[0]?.price;
	const bestAsk = asks[0]?.price;
	if (bestBid == null || bestAsk == null || !(bestAsk >= bestBid)) {
		return undefined;
	}
	return (bestBid + bestAsk) / 2;
}

/**
 * Normalize Binance `/api/v3/depth` JSON:
 * `{ lastUpdateId, bids: [[price, qty], …], asks: […] }`.
 */
export function normalizeBinanceDepth(
	raw: unknown,
	options: {symbol: string; asOfMs?: number},
): NormalizedDepthSnapshot | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const record = raw as Record<string, unknown>;
	const symbol = options.symbol.trim().toUpperCase();
	if (!symbol) {
		return null;
	}
	const bids = normalizeLevels(record.bids);
	const asks = normalizeLevels(record.asks);
	if (!bids.length && !asks.length) {
		return null;
	}
	const mid = midFromBook(bids, asks);
	const asOfMs = options.asOfMs ?? Date.now();
	const updateId = record.lastUpdateId;
	return {
		exchangeId: 'binance',
		market: 'spot',
		symbol,
		asOfMs,
		bids,
		asks,
		...(mid != null ? {mid} : {}),
		...(typeof updateId === 'number' || typeof updateId === 'string' ? {updateId} : {}),
	};
}

/**
 * Normalize Coinbase Advanced Trade public product book (for later adapter):
 * `{ pricebook: { product_id, bids: [{price,size}], asks }, mid_market? }`.
 */
export function normalizeCoinbaseProductBook(
	raw: unknown,
	options: {symbol?: string; asOfMs?: number} = {},
): NormalizedDepthSnapshot | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const root = raw as Record<string, unknown>;
	const book =
		root.pricebook && typeof root.pricebook === 'object' && !Array.isArray(root.pricebook)
			? (root.pricebook as Record<string, unknown>)
			: root;
	const productId =
		(typeof book.product_id === 'string' && book.product_id.trim()) ||
		(typeof options.symbol === 'string' && options.symbol.trim()) ||
		'';
	if (!productId) {
		return null;
	}
	const bids = normalizeLevels(book.bids);
	const asks = normalizeLevels(book.asks);
	if (!bids.length && !asks.length) {
		return null;
	}
	const midFromVenue = coerceFiniteNumber(root.mid_market ?? book.mid_market);
	const mid = midFromVenue ?? midFromBook(bids, asks);
	let asOfMs = options.asOfMs ?? Date.now();
	const timeRaw = book.time ?? root.time;
	if (typeof timeRaw === 'string') {
		const parsed = Date.parse(timeRaw);
		if (Number.isFinite(parsed)) {
			asOfMs = parsed;
		}
	}
	return {
		exchangeId: 'coinbase',
		market: 'spot',
		symbol: productId.toUpperCase(),
		asOfMs,
		bids,
		asks,
		...(mid != null ? {mid} : {}),
	};
}

export function normalizeDepthSnapshot(
	exchangeId: DepthExchangeId,
	raw: unknown,
	options: {symbol: string; asOfMs?: number},
): NormalizedDepthSnapshot | null {
	if (exchangeId === 'binance') {
		return normalizeBinanceDepth(raw, options);
	}
	if (exchangeId === 'coinbase') {
		return normalizeCoinbaseProductBook(raw, options);
	}
	return null;
}
