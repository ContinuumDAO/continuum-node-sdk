import type {ChartLiveBinding, ChartLiveTick} from './schemas.js';
import {
	CHART_LIVE_PROVIDER_ARCUS_ALL_MIDS,
	CHART_LIVE_PROVIDER_BINANCE_TICKER,
	CHART_LIVE_PROVIDER_COINBASE_PRODUCT_TICKER,
	CHART_LIVE_PROVIDER_FMP_QUOTE,
	CHART_LIVE_PROVIDER_ALPACA_LATEST_TRADE,
	CHART_LIVE_PROVIDER_COINGECKO_SIMPLE,
	CHART_LIVE_PROVIDER_GMX_MARK_PRICE,
	CHART_LIVE_PROVIDER_HYPERLIQUID_ALL_MIDS,
	CHART_LIVE_PROVIDER_UNISWAP_V4_POOL_PRICE,
} from './schemas.js';
import {arcusFetchAllMids, arcusLookupMidFromMids} from '@continuumdao/ctm-mpc-defi/protocols/evm/arcus';
import {fetchUniswapV4ChartLivePrice} from '@continuumdao/ctm-mpc-defi/protocols/evm/uniswap-v4';

const HYPERLIQUID_INFO_URL = 'https://api.hyperliquid.xyz/info';
const COINGECKO_SIMPLE_PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price';
/** Same public data host as the Binance MCP catalog server. */
const BINANCE_TICKER_PRICE_URL = 'https://data-api.binance.vision/api/v3/ticker/price';
/** Public Exchange ticker (ACAO *); Advanced Trade market ticker lacks browser CORS. */
const COINBASE_EXCHANGE_PRODUCT_TICKER_URL = 'https://api.exchange.coinbase.com/products';
const FMP_QUOTE_URL = 'https://financialmodelingprep.com/stable/quote';
const FMP_API_KEY_ENV = 'FMP_API_KEY';
const ALPACA_STOCK_LATEST_TRADE_URL = 'https://data.alpaca.markets/v2/stocks';
const ALPACA_CRYPTO_LATEST_TRADES_URL = 'https://data.alpaca.markets/v1beta3/crypto/us/latest/trades';
const ALPACA_API_KEY_ENV = 'ALPACA_API_KEY';
const ALPACA_SECRET_KEY_ENV = 'ALPACA_SECRET_KEY';
const LIVE_TICK_FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), LIVE_TICK_FETCH_TIMEOUT_MS);
	try {
		return await fetch(url, {...init, signal: controller.signal});
	} finally {
		clearTimeout(timer);
	}
}

async function fetchArcusAllMidsTick(binding: ChartLiveBinding): Promise<ChartLiveTick | null> {
	const market = String(binding.params.market ?? binding.params.coin ?? '').trim();
	if (!market) {
		return null;
	}
	const chainIdRaw = binding.params.chainId;
	const chainId =
		typeof chainIdRaw === 'number' && Number.isFinite(chainIdRaw) && chainIdRaw > 0
			? chainIdRaw
			: 4663;
	try {
		const mids = await arcusFetchAllMids({chainId});
		const price = Number(arcusLookupMidFromMids(mids, market));
		if (!Number.isFinite(price)) {
			return null;
		}
		return {timeMs: Date.now(), price};
	} catch {
		return null;
	}
}

async function fetchHyperliquidAllMidsTick(binding: ChartLiveBinding): Promise<ChartLiveTick | null> {
	const coin = String(binding.params.coin ?? '').trim();
	if (!coin) {
		return null;
	}
	const body: Record<string, unknown> = {type: 'allMids'};
	const dex = binding.params.dex;
	if (typeof dex === 'string' && dex.trim()) {
		body.dex = dex.trim();
	}
	const resp = await fetchWithTimeout(HYPERLIQUID_INFO_URL, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify(body),
	});
	if (!resp.ok) {
		return null;
	}
	const mids = (await resp.json()) as Record<string, string>;
	const price = Number(mids[coin]);
	if (!Number.isFinite(price)) {
		return null;
	}
	return {timeMs: Date.now(), price};
}

async function fetchCoingeckoSimpleTick(binding: ChartLiveBinding): Promise<ChartLiveTick | null> {
	const coinId = String(binding.params.coinId ?? '').trim();
	if (!coinId) {
		return null;
	}
	const vs = String(binding.params.vsCurrency ?? 'usd').trim() || 'usd';
	const url =
		`${COINGECKO_SIMPLE_PRICE_URL}?ids=${encodeURIComponent(coinId)}` +
		`&vs_currencies=${encodeURIComponent(vs)}`;
	const resp = await fetchWithTimeout(url, {});
	if (!resp.ok) {
		return null;
	}
	const data = (await resp.json()) as Record<string, Record<string, number>>;
	const price = data[coinId]?.[vs];
	if (typeof price !== 'number' || !Number.isFinite(price)) {
		return null;
	}
	return {timeMs: Date.now(), price};
}

async function fetchBinanceTickerTick(binding: ChartLiveBinding): Promise<ChartLiveTick | null> {
	const symbol = String(binding.params.symbol ?? '').trim().toUpperCase();
	if (!symbol) {
		return null;
	}
	const url = `${BINANCE_TICKER_PRICE_URL}?symbol=${encodeURIComponent(symbol)}`;
	const resp = await fetchWithTimeout(url, {});
	if (!resp.ok) {
		return null;
	}
	const data = (await resp.json()) as {price?: string | number};
	const price = Number(data.price);
	if (!Number.isFinite(price)) {
		return null;
	}
	return {timeMs: Date.now(), price};
}

async function fetchCoinbaseProductTickerTick(
	binding: ChartLiveBinding,
): Promise<ChartLiveTick | null> {
	const productId = String(binding.params.productId ?? '').trim().toUpperCase();
	if (!productId) {
		return null;
	}
	const url = `${COINBASE_EXCHANGE_PRODUCT_TICKER_URL}/${encodeURIComponent(productId)}/ticker`;
	const resp = await fetchWithTimeout(url, {
		headers: {Accept: 'application/json', 'Cache-Control': 'no-cache'},
	});
	if (!resp.ok) {
		return null;
	}
	const data = (await resp.json()) as {price?: string | number};
	const price = Number(data.price);
	if (!Number.isFinite(price)) {
		return null;
	}
	return {timeMs: Date.now(), price};
}


export function parseFmpQuoteTick(raw: unknown, fallbackTimeMs = Date.now()): ChartLiveTick | null {
	const rows = Array.isArray(raw)
		? raw
		: raw && typeof raw === 'object' && Array.isArray((raw as {data?: unknown}).data)
			? (raw as {data: unknown[]}).data
			: raw && typeof raw === 'object'
				? [raw]
				: [];
	const first = rows[0];
	if (!first || typeof first !== 'object' || Array.isArray(first)) {
		return null;
	}
	const record = first as Record<string, unknown>;
	const price = Number(record.price ?? record.last ?? record.close);
	if (!Number.isFinite(price) || price <= 0) {
		return null;
	}
	const volumeRaw = record.volume;
	const volume = Number(volumeRaw);
	const ts = Number(record.timestamp);
	const timeMs =
		Number.isFinite(ts) && ts > 0
			? ts > 1e12
				? Math.floor(ts)
				: Math.floor(ts * 1000)
			: fallbackTimeMs;
	return {
		timeMs,
		price,
		...(Number.isFinite(volume) && volume >= 0 ? {volume} : {}),
	};
}

function resolveFmpApiKey(): string | undefined {
	const key = process.env[FMP_API_KEY_ENV]?.trim();
	return key || undefined;
}

async function fetchFmpQuoteTick(binding: ChartLiveBinding): Promise<ChartLiveTick | null> {
	const symbol = String(binding.params.symbol ?? '').trim().toUpperCase();
	if (!symbol) {
		return null;
	}
	const apiKey = resolveFmpApiKey();
	if (!apiKey) {
		return null;
	}
	const url = `${FMP_QUOTE_URL}?symbol=${encodeURIComponent(symbol)}`;
	const resp = await fetchWithTimeout(url, {
		headers: {Accept: 'application/json', apikey: apiKey},
	});
	if (!resp.ok) {
		return null;
	}
	return parseFmpQuoteTick(await resp.json());
}

function tickFromAlpacaTrade(
	trade: Record<string, unknown>,
	fallbackTimeMs: number,
): ChartLiveTick | null {
	const price = Number(trade.p ?? trade.price);
	if (!Number.isFinite(price) || price <= 0) {
		return null;
	}
	const volume = Number(trade.s ?? trade.size);
	const t = trade.t ?? trade.timestamp;
	let timeMs = fallbackTimeMs;
	if (typeof t === 'string') {
		const parsed = Date.parse(t);
		if (Number.isFinite(parsed)) {
			timeMs = parsed;
		}
	} else if (typeof t === 'number' && Number.isFinite(t) && t > 0) {
		timeMs = t > 1e12 ? Math.floor(t) : Math.floor(t * 1000);
	}
	return {
		timeMs,
		price,
		...(Number.isFinite(volume) && volume >= 0 ? {volume} : {}),
	};
}

/** Stock `{ trade: { t, p, s } }` or crypto `{ trades: { "BTC/USD": { t, p, s } } }`. */
export function parseAlpacaLatestTradeTick(
	raw: unknown,
	symbol?: string,
	fallbackTimeMs = Date.now(),
): ChartLiveTick | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const record = raw as Record<string, unknown>;
	const trade = record.trade;
	if (trade && typeof trade === 'object' && !Array.isArray(trade)) {
		return tickFromAlpacaTrade(trade as Record<string, unknown>, fallbackTimeMs);
	}
	const trades = record.trades;
	if (trades && typeof trades === 'object' && !Array.isArray(trades)) {
		const map = trades as Record<string, unknown>;
		const key =
			symbol && map[symbol] != null
				? symbol
				: Object.keys(map).find(k => map[k] != null && typeof map[k] === 'object');
		const row = key != null ? map[key] : undefined;
		if (row && typeof row === 'object' && !Array.isArray(row)) {
			return tickFromAlpacaTrade(row as Record<string, unknown>, fallbackTimeMs);
		}
	}
	return null;
}

function resolveAlpacaKeys(): {apiKey: string; secretKey: string} | undefined {
	const apiKey = process.env[ALPACA_API_KEY_ENV]?.trim();
	const secretKey = process.env[ALPACA_SECRET_KEY_ENV]?.trim();
	if (!apiKey || !secretKey) {
		return undefined;
	}
	return {apiKey, secretKey};
}

function alpacaAuthHeaders(keys: {apiKey: string; secretKey: string}): Record<string, string> {
	return {
		Accept: 'application/json',
		'APCA-API-KEY-ID': keys.apiKey,
		'APCA-API-SECRET-KEY': keys.secretKey,
	};
}

async function fetchAlpacaLatestTradeTick(binding: ChartLiveBinding): Promise<ChartLiveTick | null> {
	const symbol = String(binding.params.symbol ?? '').trim();
	if (!symbol) {
		return null;
	}
	const keys = resolveAlpacaKeys();
	if (!keys) {
		return null;
	}
	const assetClassRaw = String(binding.params.assetClass ?? '').trim().toLowerCase();
	const isCrypto = assetClassRaw === 'crypto' || symbol.includes('/');
	const feedRaw = String(binding.params.feed ?? 'iex').trim().toLowerCase() || 'iex';
	const url = isCrypto
		? `${ALPACA_CRYPTO_LATEST_TRADES_URL}?symbols=${encodeURIComponent(symbol)}`
		: `${ALPACA_STOCK_LATEST_TRADE_URL}/${encodeURIComponent(symbol)}/trades/latest?feed=${encodeURIComponent(feedRaw)}`;
	const resp = await fetchWithTimeout(url, {headers: alpacaAuthHeaders(keys)});
	if (!resp.ok) {
		return null;
	}
	return parseAlpacaLatestTradeTick(await resp.json(), symbol);
}

async function fetchUniswapV4PoolPriceTick(binding: ChartLiveBinding): Promise<ChartLiveTick | null> {
	const poolReference = String(binding.params.poolReference ?? '').trim();
	if (!poolReference) {
		return null;
	}
	const chainIdRaw = binding.params.chainId;
	const chainId =
		typeof chainIdRaw === 'number' && Number.isFinite(chainIdRaw) && chainIdRaw > 0
			? chainIdRaw
			: 42161;
	const priceQuoteRaw = binding.params.priceQuote;
	const priceQuote =
		priceQuoteRaw === 'token1PerToken0' ? 'token1PerToken0' : 'token0PerToken1';
	const dataSource =
		typeof binding.params.dataSource === 'string' ? binding.params.dataSource.trim() : undefined;
	const interval =
		typeof binding.params.interval === 'string' ? binding.params.interval.trim() : undefined;
	try {
		const price = await fetchUniswapV4ChartLivePrice({
			chainId,
			poolReference,
			priceQuote,
			dataSource,
			interval,
		});
		if (price == null || !Number.isFinite(price) || price <= 0) {
			return null;
		}
		return {timeMs: Date.now(), price};
	} catch {
		return null;
	}
}

/** Fetch one live price tick for a chart live binding (same adapters as chart UI polling). */
export async function fetchChartLiveTick(binding: ChartLiveBinding): Promise<ChartLiveTick | null> {
	switch (binding.providerId) {
		case CHART_LIVE_PROVIDER_HYPERLIQUID_ALL_MIDS:
			return fetchHyperliquidAllMidsTick(binding);
		case CHART_LIVE_PROVIDER_ARCUS_ALL_MIDS:
			return fetchArcusAllMidsTick(binding);
		case CHART_LIVE_PROVIDER_COINGECKO_SIMPLE:
			return fetchCoingeckoSimpleTick(binding);
		case CHART_LIVE_PROVIDER_BINANCE_TICKER:
			return fetchBinanceTickerTick(binding);
		case CHART_LIVE_PROVIDER_COINBASE_PRODUCT_TICKER:
			return fetchCoinbaseProductTickerTick(binding);
		case CHART_LIVE_PROVIDER_FMP_QUOTE:
			return fetchFmpQuoteTick(binding);
		case CHART_LIVE_PROVIDER_ALPACA_LATEST_TRADE:
			return fetchAlpacaLatestTradeTick(binding);
		case CHART_LIVE_PROVIDER_GMX_MARK_PRICE:
			// GMX mark price needs chainId + SDK — pass `liveTick` from chart or re-fetch OHLCV via defi MCP.
			return null;
		case CHART_LIVE_PROVIDER_UNISWAP_V4_POOL_PRICE:
			return fetchUniswapV4PoolPriceTick(binding);
		default:
			return null;
	}
}
