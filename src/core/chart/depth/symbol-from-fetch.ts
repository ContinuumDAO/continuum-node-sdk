import {COINBASE_DATA_SOURCE} from '../../coinbase/schemas.js';
import {extractChartMetadataFromFetchPayload} from '../fetch-metadata.js';
import type {DepthExchangeId} from './schemas.js';

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function isCoinbaseFetch(record: Record<string, unknown> | null): boolean {
	if (!record) {
		return false;
	}
	if (record.dataSource === COINBASE_DATA_SOURCE) {
		return true;
	}
	if (typeof record.productId === 'string' && record.productId.includes('-')) {
		return true;
	}
	return false;
}

function normalizeBinanceSymbol(raw: string): string {
	return raw.trim().toUpperCase().replace(/[-/]/g, '');
}

function normalizeCoinbaseProductId(raw: string): string {
	return raw.trim().toUpperCase();
}

/** Infer a venue spot symbol from OHLCV fetch / title / explicit arg. */
export function resolveDepthSymbol(input: {
	symbol?: string;
	toolResult?: unknown;
	title?: string;
	label?: string;
	exchangeId?: DepthExchangeId;
}): string | null {
	const toolRecord = asRecord(input.toolResult);
	const coinbase =
		input.exchangeId === 'coinbase' ||
		isCoinbaseFetch(toolRecord) ||
		(typeof input.symbol === 'string' && input.symbol.includes('-'));

	const normalize = coinbase ? normalizeCoinbaseProductId : normalizeBinanceSymbol;

	const explicit = input.symbol?.trim();
	if (explicit) {
		return normalize(explicit);
	}

	if (toolRecord) {
		const productId = toolRecord.productId ?? toolRecord.product_id;
		if (typeof productId === 'string' && productId.trim()) {
			return normalize(productId);
		}
		for (const key of ['symbol', 'pair', 'market'] as const) {
			const raw = toolRecord[key];
			if (typeof raw === 'string' && raw.trim()) {
				return normalize(raw);
			}
		}
		const ohlcv = asRecord(toolRecord.ohlcv);
		if (ohlcv) {
			for (const key of ['symbol', 'coin', 'market', 'productId'] as const) {
				const raw = ohlcv[key];
				if (typeof raw === 'string' && raw.trim()) {
					const s = raw.trim().toUpperCase();
					if (coinbase) {
						return normalizeCoinbaseProductId(s.includes('-') ? s : `${s}-USD`);
					}
					if (s.includes('USDT') || s.includes('USD') || s.includes('BTC') || s.length >= 6) {
						return normalizeBinanceSymbol(s);
					}
					if (/^[A-Z0-9]{2,10}$/.test(s)) {
						return `${s}USDT`;
					}
				}
			}
		}
	}

	const meta = extractChartMetadataFromFetchPayload(input.toolResult);
	const label = (input.label ?? meta.label ?? '').trim().toUpperCase();
	if (label) {
		if (coinbase && (label.includes('-') || /USD|USDT|USDC/.test(label))) {
			if (label.includes('-')) {
				return normalizeCoinbaseProductId(label);
			}
			const base = label.replace(/[^A-Z0-9]/g, '').replace(/(USD|USDT|USDC)$/i, '');
			if (base) {
				return `${base}-USD`;
			}
		}
		if (!coinbase && /USDT|USD|BUSD|USDC/.test(label)) {
			return label.replace(/[^A-Z0-9]/g, '');
		}
	}
	const title = (input.title ?? meta.title ?? '').trim().toUpperCase();
	if (coinbase) {
		const productMatch = title.match(/\b([A-Z0-9]{2,15}-[A-Z0-9]{2,15})\b/);
		if (productMatch?.[1]) {
			return productMatch[1];
		}
		const baseMatch = title.match(/\b([A-Z]{2,10})\b/);
		if (baseMatch?.[1] && !['H', 'D', 'W', 'M', 'LAST'].includes(baseMatch[1])) {
			return `${baseMatch[1]}-USD`;
		}
		return null;
	}
	const titleMatch = title.match(/\b([A-Z0-9]{2,15}USDT)\b/);
	if (titleMatch?.[1]) {
		return titleMatch[1];
	}
	const baseMatch = title.match(/\b([A-Z]{2,10})\b/);
	if (baseMatch?.[1] && !['H', 'D', 'W', 'M', 'LAST'].includes(baseMatch[1])) {
		return `${baseMatch[1]}USDT`;
	}
	return null;
}

/** Infer depth exchange from OHLCV fetch when desk/tool arg omitted. */
export function inferDepthExchangeId(toolResult: unknown): DepthExchangeId | undefined {
	const record = asRecord(toolResult);
	if (!record) {
		return undefined;
	}
	if (isCoinbaseFetch(record)) {
		return 'coinbase';
	}
	if (Array.isArray(record.klines) && typeof record.symbol === 'string') {
		return 'binance';
	}
	// Bound session payloads sometimes keep productId without dataSource after slim/meta merge.
	const productId = record.productId ?? record.product_id;
	if (typeof productId === 'string' && productId.includes('-')) {
		return 'coinbase';
	}
	return undefined;
}
