import type {SdkResult} from '../result.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import {normalizeCoinbaseProductBook} from '../chart/depth/normalize.js';
import type {NormalizedDepthSnapshot} from '../chart/depth/schemas.js';
import {normalizeCoinbaseCandles, trimCoinbaseCandles} from './candles.js';
import {coinbaseGet} from './client.js';
import {resolveCoinbaseCdpCredentials} from './credentials.js';
import {
	coinbaseGranularityToIntervalLabel,
	resolveCoinbaseCandleWindow,
	resolveCoinbaseGranularity,
} from './granularity.js';
import {
	COINBASE_DATA_SOURCE,
	GetProductBookInputSchema,
	GetProductCandlesInputSchema,
	GetProductCandlesOutputSchema,
	GetProductTickerInputSchema,
	ListProductsInputSchema,
	SearchProductsInputSchema,
} from './schemas.js';
import {z} from 'zod';

export type GetProductCandlesOutput = z.infer<typeof GetProductCandlesOutputSchema>;

function normalizeProductId(raw: string): string {
	return raw.trim().toUpperCase();
}

export async function getProductCandles(
	input: unknown,
	options: {config?: NodeSdkConfig} = {},
): Promise<SdkResult<GetProductCandlesOutput>> {
	const parsed = GetProductCandlesInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.issues.map(i => i.message).join('; ')};
	}
	const data = parsed.data;
	const productId = normalizeProductId(data.productId);
	const granularity = resolveCoinbaseGranularity(data);
	if (!granularity) {
		return {ok: false, reason: 'Unrecognized interval/granularity for Coinbase candles.'};
	}
	const window = resolveCoinbaseCandleWindow({
		granularity,
		lookbackDays: data.lookbackDays,
		limit: data.limit,
		start: data.start,
		end: data.end,
	});
	const qs = new URLSearchParams({
		start: String(window.start),
		end: String(window.end),
		granularity,
		limit: String(window.limit),
	});
	const credentials = await resolveCoinbaseCdpCredentials(options.config);
	const marketPath = `/products/${encodeURIComponent(productId)}/candles?${qs}`;
	const authPath = `/products/${encodeURIComponent(productId)}/candles?${qs}`;
	const result = await coinbaseGet({
		marketPath,
		authPath,
		credentials,
	});
	if (!result.ok) {
		return {
			ok: false,
			reason: `Coinbase candles failed: ${result.reason ?? `HTTP ${result.status}`}`,
		};
	}
	const candles = trimCoinbaseCandles(normalizeCoinbaseCandles(result.data), window.limit);
	if (!candles.length) {
		return {ok: false, reason: `No candles returned for ${productId}.`};
	}
	const interval = coinbaseGranularityToIntervalLabel(granularity);
	return {
		ok: true,
		data: {
			dataSource: COINBASE_DATA_SOURCE,
			productId,
			granularity,
			interval,
			candles,
			count: candles.length,
			meta: {
				window: {start: window.start, end: window.end, limit: window.limit},
				authMode: result.authMode,
			},
		},
	};
}

export async function listProducts(
	input: unknown,
	options: {config?: NodeSdkConfig} = {},
): Promise<SdkResult<{products: unknown[]; count: number; authMode: string}>> {
	const parsed = ListProductsInputSchema.safeParse(input ?? {});
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.issues.map(i => i.message).join('; ')};
	}
	const qs = new URLSearchParams();
	if (parsed.data.productType) {
		qs.set('product_type', parsed.data.productType);
	}
	if (parsed.data.limit != null) {
		qs.set('limit', String(parsed.data.limit));
	}
	const suffix = qs.size ? `?${qs}` : '';
	const credentials = await resolveCoinbaseCdpCredentials(options.config);
	const result = await coinbaseGet({
		marketPath: `/products${suffix}`,
		authPath: `/products${suffix}`,
		credentials,
	});
	if (!result.ok) {
		return {ok: false, reason: `Coinbase list products failed: ${result.reason}`};
	}
	const root = result.data as {products?: unknown[]} | unknown[];
	let products = Array.isArray(root)
		? root
		: Array.isArray(root?.products)
			? root.products
			: [];
	if (parsed.data.limit != null) {
		products = products.slice(0, parsed.data.limit);
	}
	return {
		ok: true,
		data: {products, count: products.length, authMode: result.authMode},
	};
}

export async function searchProducts(
	input: unknown,
	options: {config?: NodeSdkConfig} = {},
): Promise<SdkResult<{products: unknown[]; count: number; query: string}>> {
	const parsed = SearchProductsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.issues.map(i => i.message).join('; ')};
	}
	const listed = await listProducts({limit: 500, productType: 'SPOT'}, options);
	if (!listed.ok) {
		return listed;
	}
	const q = parsed.data.query.trim().toUpperCase();
	const limit = parsed.data.limit ?? 25;
	const products = listed.data.products
		.filter(row => {
			if (!row || typeof row !== 'object') {
				return false;
			}
			const r = row as Record<string, unknown>;
			const id = String(r.product_id ?? r.productId ?? '').toUpperCase();
			const base = String(r.base_currency_id ?? r.base_name ?? '').toUpperCase();
			const quote = String(r.quote_currency_id ?? r.quote_name ?? '').toUpperCase();
			return id.includes(q) || base.includes(q) || quote.includes(q) || `${base}-${quote}` === q;
		})
		.slice(0, limit);
	return {
		ok: true,
		data: {products, count: products.length, query: parsed.data.query.trim()},
	};
}

export async function getProductTicker(
	input: unknown,
	options: {config?: NodeSdkConfig} = {},
): Promise<
	SdkResult<{
		productId: string;
		price: number | null;
		trades: unknown[];
		authMode: string;
	}>
> {
	const parsed = GetProductTickerInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.issues.map(i => i.message).join('; ')};
	}
	const productId = normalizeProductId(parsed.data.productId);
	const limit = parsed.data.limit ?? 1;
	const qs = new URLSearchParams({limit: String(limit)});
	const credentials = await resolveCoinbaseCdpCredentials(options.config);
	const path = `/products/${encodeURIComponent(productId)}/ticker?${qs}`;
	const result = await coinbaseGet({
		marketPath: path,
		authPath: path,
		credentials,
	});
	if (!result.ok) {
		return {ok: false, reason: `Coinbase ticker failed: ${result.reason}`};
	}
	const root = result.data as {trades?: unknown[]; price?: unknown} | null;
	const trades = Array.isArray(root?.trades) ? root.trades : [];
	let price: number | null = null;
	const top = trades[0];
	if (top && typeof top === 'object') {
		const p = Number((top as {price?: unknown}).price);
		if (Number.isFinite(p)) {
			price = p;
		}
	}
	if (price == null && root && 'price' in root) {
		const p = Number(root.price);
		if (Number.isFinite(p)) {
			price = p;
		}
	}
	return {
		ok: true,
		data: {productId, price, trades, authMode: result.authMode},
	};
}

export async function getProductBook(
	input: unknown,
	options: {config?: NodeSdkConfig} = {},
): Promise<SdkResult<{book: NormalizedDepthSnapshot; authMode: string}>> {
	const parsed = GetProductBookInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: parsed.error.issues.map(i => i.message).join('; ')};
	}
	const productId = normalizeProductId(parsed.data.productId);
	const limit = parsed.data.limit ?? 500;
	const qs = new URLSearchParams({
		product_id: productId,
		limit: String(limit),
	});
	const credentials = await resolveCoinbaseCdpCredentials(options.config);
	const marketPath = `/product_book?${qs}`;
	const authPath = `/product_book?${qs}`;
	const result = await coinbaseGet({
		marketPath,
		authPath,
		credentials,
	});
	if (!result.ok) {
		return {ok: false, reason: `Coinbase product book failed: ${result.reason}`};
	}
	const book = normalizeCoinbaseProductBook(result.data, {
		symbol: productId,
		asOfMs: Date.now(),
	});
	if (!book) {
		return {ok: false, reason: `Could not normalize Coinbase book for ${productId}.`};
	}
	return {ok: true, data: {book, authMode: result.authMode}};
}
