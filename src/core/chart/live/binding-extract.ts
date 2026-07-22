import {DEFAULT_CHART_MAX_POINTS} from '../schemas.js';
import {coerceFiniteNumber} from '../point-normalize.js';
import {intervalLabelToBucketSec} from './interval.js';
import {
	CHART_LIVE_DEFAULT_POLL_MS,
	CHART_LIVE_PROVIDER_ARCUS_ALL_MIDS,
	CHART_LIVE_PROVIDER_COINGECKO_SIMPLE,
	CHART_LIVE_PROVIDER_GMX_MARK_PRICE,
	CHART_LIVE_PROVIDER_HYPERLIQUID_ALL_MIDS,
	CHART_LIVE_PROVIDER_UNISWAP_V4_POOL_PRICE,
	type ChartLiveBinding,
} from './schemas.js';

export type ExtractLiveBindingOptions = {
	bucketSec?: number;
	maxPoints?: number;
	pollMs?: number;
};

function bindingFromArcusOhlcv(
	ohlcv: Record<string, unknown>,
	options: ExtractLiveBindingOptions,
): ChartLiveBinding | undefined {
	if (ohlcv.dataSource !== 'arcus') {
		return undefined;
	}
	const marketRaw = ohlcv.market ?? ohlcv.coin;
	const market = typeof marketRaw === 'string' ? marketRaw.trim() : '';
	if (!market) {
		return undefined;
	}
	const intervalRaw = ohlcv.interval ?? ohlcv.timeframe;
	const interval = typeof intervalRaw === 'string' ? intervalRaw.trim() : '';
	const bucketSec =
		options.bucketSec ??
		(interval ? intervalLabelToBucketSec(interval) : null) ??
		900;
	return {
		providerId: CHART_LIVE_PROVIDER_ARCUS_ALL_MIDS,
		bucketSec,
		pollMs: options.pollMs ?? CHART_LIVE_DEFAULT_POLL_MS,
		maxPoints: options.maxPoints ?? DEFAULT_CHART_MAX_POINTS,
		params: {
			market,
			chainId: 4663,
			...(interval ? {interval} : {}),
			...(ohlcv.marketKind === 'spot' ? {marketKind: 'spot'} : {}),
		},
	};
}

function bindingFromHyperliquidOhlcv(
	ohlcv: Record<string, unknown>,
	options: ExtractLiveBindingOptions,
): ChartLiveBinding | undefined {
	const coinRaw = ohlcv.coin ?? ohlcv.symbol;
	const coin = typeof coinRaw === 'string' ? coinRaw.trim() : '';
	if (!coin) {
		return undefined;
	}
	const intervalRaw = ohlcv.interval ?? ohlcv.timeframe;
	const interval = typeof intervalRaw === 'string' ? intervalRaw.trim() : '';
	const bucketSec =
		options.bucketSec ??
		(interval ? intervalLabelToBucketSec(interval) : null) ??
		900;
	const dexRaw = ohlcv.dex;
	return {
		providerId: CHART_LIVE_PROVIDER_HYPERLIQUID_ALL_MIDS,
		bucketSec,
		pollMs: options.pollMs ?? CHART_LIVE_DEFAULT_POLL_MS,
		maxPoints: options.maxPoints ?? DEFAULT_CHART_MAX_POINTS,
		params: {
			coin,
			...(interval ? {interval} : {}),
			...(typeof dexRaw === 'string' && dexRaw.trim() ? {dex: dexRaw.trim()} : {}),
		},
	};
}

function bindingFromUniswapFlat(
	record: Record<string, unknown>,
	options: ExtractLiveBindingOptions,
): ChartLiveBinding | undefined {
	if (!('candles' in record)) {
		return undefined;
	}
	const poolReferenceRaw = record.poolReference;
	const poolReference =
		typeof poolReferenceRaw === 'string' ? poolReferenceRaw.trim() : '';
	if (!poolReference) {
		return undefined;
	}
	const intervalRaw = record.timeframe ?? record.interval;
	const interval = typeof intervalRaw === 'string' ? intervalRaw.trim() : '15m';
	const bucketSec =
		options.bucketSec ?? intervalLabelToBucketSec(interval) ?? 900;
	const chainIdRaw = record.chainId;
	const chainId =
		typeof chainIdRaw === 'number' && Number.isFinite(chainIdRaw) && chainIdRaw > 0
			? chainIdRaw
			: undefined;
	const priceQuoteRaw = record.priceQuote;
	const priceQuote =
		priceQuoteRaw === 'token1PerToken0' ? 'token1PerToken0' : 'token0PerToken1';
	const dataSourceRaw = record.dataSource;
	const dataSource =
		typeof dataSourceRaw === 'string' && dataSourceRaw.trim()
			? dataSourceRaw.trim()
			: undefined;
	const symbolRaw = record.symbol;
	const symbol =
		typeof symbolRaw === 'string' && symbolRaw.trim() ? symbolRaw.trim() : undefined;
	return {
		providerId: CHART_LIVE_PROVIDER_UNISWAP_V4_POOL_PRICE,
		bucketSec,
		pollMs: options.pollMs ?? CHART_LIVE_DEFAULT_POLL_MS,
		maxPoints: options.maxPoints ?? DEFAULT_CHART_MAX_POINTS,
		params: {
			poolReference,
			priceQuote,
			interval,
			...(chainId != null ? {chainId} : {}),
			...(dataSource ? {dataSource} : {}),
			...(symbol ? {symbol} : {}),
		},
	};
}

function bindingFromGmxFlat(
	record: Record<string, unknown>,
	options: ExtractLiveBindingOptions,
): ChartLiveBinding | undefined {
	if (!('candles' in record)) {
		return undefined;
	}
	const symbolRaw = record.symbol;
	const symbol = typeof symbolRaw === 'string' ? symbolRaw.trim() : '';
	if (!symbol) {
		return undefined;
	}
	const intervalRaw = record.timeframe ?? record.interval;
	const interval = typeof intervalRaw === 'string' ? intervalRaw.trim() : '15m';
	const bucketSec =
		options.bucketSec ?? intervalLabelToBucketSec(interval) ?? 900;
	const collateralRaw = record.collateralSymbol ?? record.collateralToken;
	const collateralSymbol =
		typeof collateralRaw === 'string' && collateralRaw.trim()
			? collateralRaw.trim()
			: 'USDC';
	const chainIdRaw = record.chainId;
	const chainId =
		typeof chainIdRaw === 'number' && Number.isFinite(chainIdRaw) && chainIdRaw > 0
			? chainIdRaw
			: undefined;
	return {
		providerId: CHART_LIVE_PROVIDER_GMX_MARK_PRICE,
		bucketSec,
		pollMs: options.pollMs ?? CHART_LIVE_DEFAULT_POLL_MS,
		maxPoints: options.maxPoints ?? DEFAULT_CHART_MAX_POINTS,
		params: {
			symbol,
			collateralSymbol,
			interval,
			...(chainId != null ? {chainId} : {}),
		},
	};
}

function bindingFromCoinGecko(
	record: Record<string, unknown>,
	options: ExtractLiveBindingOptions,
): ChartLiveBinding | undefined {
	const coinIdRaw = record.coinId ?? record.id ?? record.coingeckoId;
	const coinId = typeof coinIdRaw === 'string' ? coinIdRaw.trim() : '';
	if (!coinId) {
		return undefined;
	}
	const bucketFromRecord = coerceFiniteNumber(record.bucketSec);
	const bucketSec =
		options.bucketSec ??
		(bucketFromRecord != null && bucketFromRecord > 0 ? bucketFromRecord : undefined) ??
		3600;
	return {
		providerId: CHART_LIVE_PROVIDER_COINGECKO_SIMPLE,
		bucketSec,
		pollMs: options.pollMs ?? CHART_LIVE_DEFAULT_POLL_MS,
		maxPoints: options.maxPoints ?? DEFAULT_CHART_MAX_POINTS,
		params: {
			coinId,
			vsCurrency: 'usd',
		},
	};
}

/**
 * Infer live tick binding from a fetch tool payload (extensible like fetch-metadata).
 * Returns undefined when the source is unknown or live tick fetch is not configured.
 */
export function extractLiveBindingFromFetchPayload(
	payload: unknown,
	options: ExtractLiveBindingOptions = {},
): ChartLiveBinding | undefined {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return undefined;
	}
	const record = payload as Record<string, unknown>;

	const fromUniswap = bindingFromUniswapFlat(record, options);
	if (fromUniswap) {
		return fromUniswap;
	}

	const fromGmx = bindingFromGmxFlat(record, options);
	if (fromGmx) {
		return fromGmx;
	}

	const ohlcv = record.ohlcv;
	if (ohlcv && typeof ohlcv === 'object' && !Array.isArray(ohlcv)) {
		const ohlcvRecord = ohlcv as Record<string, unknown>;
		const fromArcus = bindingFromArcusOhlcv(ohlcvRecord, options);
		if (fromArcus) {
			return fromArcus;
		}
		const fromHl = bindingFromHyperliquidOhlcv(ohlcvRecord, options);
		if (fromHl) {
			return fromHl;
		}
	}

	const fromCg = bindingFromCoinGecko(record, options);
	if (fromCg) {
		return fromCg;
	}

	const result = record.result;
	if (result && typeof result === 'object' && !Array.isArray(result)) {
		return extractLiveBindingFromFetchPayload(result, options);
	}

	return undefined;
}
