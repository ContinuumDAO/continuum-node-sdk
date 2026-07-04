import type {SdkResult} from '../result.js';
import {cmcKeylessGet, cmcProGet} from './client.js';
import {normalizeKlineCandles} from './kline.js';
import {
	GetAltcoinSeasonIndexLatestInputSchema,
	GetCmc100LatestInputSchema,
	GetCryptoQuotesLatestInputSchema,
	GetDexPairQuotesInputSchema,
	GetDexTokenInputSchema,
	GetDexTokenPoolsInputSchema,
	GetFearAndGreedHistoricalInputSchema,
	GetFearAndGreedLatestInputSchema,
	GetGlobalMetricsLatestInputSchema,
	GetCryptoOhlcvHistoricalInputSchema,
	GetCryptoOhlcvHistoricalOutputSchema,
	GetKlineCandlesInputSchema,
	GetSimplePriceInputSchema,
	SearchDexTokensInputSchema,
	type GetKlineCandlesOutputSchema,
} from './schemas.js';
import type {z} from 'zod';

type GetKlineCandlesOutput = z.infer<typeof GetKlineCandlesOutputSchema>;
type GetCryptoOhlcvHistoricalOutput = z.infer<typeof GetCryptoOhlcvHistoricalOutputSchema>;

function unwrapData(body: unknown): unknown {
	if (body && typeof body === 'object' && 'data' in body) {
		return (body as {data: unknown}).data;
	}
	return body;
}

function extractCmcOhlcvQuotes(data: unknown): unknown[] {
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return [];
	}
	const record = data as Record<string, unknown>;
	const quotes = record.quotes;
	if (Array.isArray(quotes)) {
		return quotes;
	}
	const nested = record.data;
	if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
		const innerQuotes = (nested as Record<string, unknown>).quotes;
		if (Array.isArray(innerQuotes)) {
			return innerQuotes;
		}
	}
	return [];
}

export async function getCryptoOhlcvHistorical(input: unknown): Promise<
	SdkResult<GetCryptoOhlcvHistoricalOutput>
> {
	const parsed = GetCryptoOhlcvHistoricalInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid get crypto OHLCV historical input.'};
	}

	const params: Record<string, string | number> = {
		id: parsed.data.id,
		convert: parsed.data.convert,
		time_period: parsed.data.timePeriod,
	};
	if (parsed.data.count != null) {
		params.count = parsed.data.count;
	}
	if (parsed.data.interval != null) {
		params.interval = parsed.data.interval;
	}

	const result = await cmcProGet('/v2/cryptocurrency/ohlcv/historical', params);
	if (!result.ok) {
		return result;
	}

	const quotes = extractCmcOhlcvQuotes(unwrapData(result.data));
	return {
		ok: true,
		data: {
			id: parsed.data.id,
			convert: parsed.data.convert,
			timePeriod: parsed.data.timePeriod,
			result: quotes as GetCryptoOhlcvHistoricalOutput['result'],
		},
	};
}

export async function getKlineCandles(input: unknown): Promise<SdkResult<GetKlineCandlesOutput>> {
	const parsed = GetKlineCandlesInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid get k-line candles input.'};
	}

	const result = await cmcKeylessGet('/v1/k-line/candles', {
		platform: parsed.data.platform,
		address: parsed.data.address,
		interval: parsed.data.interval,
		from: parsed.data.from,
		to: parsed.data.to,
		limit: parsed.data.limit,
		unit: parsed.data.unit,
	});
	if (!result.ok) {
		return result;
	}

	return {
		ok: true,
		data: {
			platform: parsed.data.platform,
			address: parsed.data.address,
			interval: parsed.data.interval,
			candles: normalizeKlineCandles(unwrapData(result.data)),
		},
	};
}

export async function searchDexTokens(input: unknown): Promise<SdkResult<unknown>> {
	const parsed = SearchDexTokensInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid search DEX tokens input.'};
	}

	const result = await cmcKeylessGet('/v1/dex/search', {
		keyword: parsed.data.keyword,
		limit: parsed.data.limit,
	});
	if (!result.ok) {
		return result;
	}
	return {ok: true, data: unwrapData(result.data)};
}

export async function getDexToken(input: unknown): Promise<SdkResult<unknown>> {
	const parsed = GetDexTokenInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid get DEX token input.'};
	}

	const result = await cmcKeylessGet('/v1/dex/token', {
		platform: parsed.data.platform,
		address: parsed.data.address,
	});
	if (!result.ok) {
		return result;
	}
	return {ok: true, data: unwrapData(result.data)};
}

export async function getDexTokenPools(input: unknown): Promise<SdkResult<unknown>> {
	const parsed = GetDexTokenPoolsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid get DEX token pools input.'};
	}

	const result = await cmcKeylessGet('/v1/dex/token/pools', {
		platform: parsed.data.platform,
		address: parsed.data.address,
		limit: parsed.data.limit,
	});
	if (!result.ok) {
		return result;
	}
	return {ok: true, data: unwrapData(result.data)};
}

export async function getDexPairQuotes(input: unknown): Promise<SdkResult<unknown>> {
	const parsed = GetDexPairQuotesInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid get DEX pair quotes input.'};
	}

	const result = await cmcKeylessGet('/v4/dex/pairs/quotes/latest', {
		network_id: parsed.data.networkId,
		contract_address: parsed.data.contractAddress,
	});
	if (!result.ok) {
		return result;
	}
	return {ok: true, data: unwrapData(result.data)};
}

export async function getSimplePrice(input: unknown): Promise<SdkResult<unknown>> {
	const parsed = GetSimplePriceInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid get simple price input.'};
	}

	const result = await cmcKeylessGet('/v1/simple/price', {
		ids: parsed.data.ids,
		convert: parsed.data.convert,
	});
	if (!result.ok) {
		return result;
	}
	return {ok: true, data: unwrapData(result.data)};
}

export async function getCryptoQuotesLatest(input: unknown): Promise<SdkResult<unknown>> {
	const parsed = GetCryptoQuotesLatestInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid get crypto quotes latest input.'};
	}

	const result = await cmcKeylessGet('/v3/cryptocurrency/quotes/latest', {
		id: parsed.data.id,
		convert: parsed.data.convert,
	});
	if (!result.ok) {
		return result;
	}
	return {ok: true, data: unwrapData(result.data)};
}

export async function getGlobalMetricsLatest(input: unknown): Promise<SdkResult<unknown>> {
	const parsed = GetGlobalMetricsLatestInputSchema.safeParse(input ?? {});
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid get global metrics latest input.'};
	}

	const result = await cmcKeylessGet('/v1/global-metrics/quotes/latest', {
		convert: parsed.data.convert,
	});
	if (!result.ok) {
		return result;
	}
	return {ok: true, data: unwrapData(result.data)};
}

export async function getFearAndGreedLatest(input: unknown): Promise<SdkResult<unknown>> {
	const parsed = GetFearAndGreedLatestInputSchema.safeParse(input ?? {});
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid get fear and greed latest input.'};
	}

	const result = await cmcKeylessGet('/v3/fear-and-greed/latest');
	if (!result.ok) {
		return result;
	}
	return {ok: true, data: unwrapData(result.data)};
}

export async function getFearAndGreedHistorical(input: unknown): Promise<SdkResult<unknown>> {
	const parsed = GetFearAndGreedHistoricalInputSchema.safeParse(input ?? {});
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid get fear and greed historical input.'};
	}

	const result = await cmcKeylessGet('/v3/fear-and-greed/historical', {
		start: parsed.data.start,
		limit: parsed.data.limit,
	});
	if (!result.ok) {
		return result;
	}
	return {ok: true, data: unwrapData(result.data)};
}

export async function getCmc100Latest(input: unknown): Promise<SdkResult<unknown>> {
	const parsed = GetCmc100LatestInputSchema.safeParse(input ?? {});
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid get CMC100 latest input.'};
	}

	const result = await cmcKeylessGet('/v3/index/cmc100-latest');
	if (!result.ok) {
		return result;
	}
	return {ok: true, data: unwrapData(result.data)};
}

export async function getAltcoinSeasonIndexLatest(input: unknown): Promise<SdkResult<unknown>> {
	const parsed = GetAltcoinSeasonIndexLatestInputSchema.safeParse(input ?? {});
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid get altcoin season index latest input.'};
	}

	const result = await cmcKeylessGet('/v1/altcoin-season-index/latest');
	if (!result.ok) {
		return result;
	}
	return {ok: true, data: unwrapData(result.data)};
}
