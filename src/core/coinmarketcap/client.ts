import type {SdkResult} from '../result.js';

export const CMC_KEYLESS_BASE_URL = 'https://pro-api.coinmarketcap.com/public-api';
export const CMC_PRO_BASE_URL = 'https://pro-api.coinmarketcap.com';

export type CmcQueryParams = Record<string, string | number | boolean | undefined>;

export function getCmcProApiKey(): string | undefined {
	const key = process.env.COINMARKETCAP_API_KEY?.trim();
	return key || undefined;
}

function appendQueryParams(url: URL, params: CmcQueryParams): void {
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === '') {
			continue;
		}
		url.searchParams.set(key, String(value));
	}
}

async function parseCmcJsonResponse(response: Response): Promise<SdkResult<unknown>> {
	if (!response.ok) {
		if (response.status === 429) {
			return {
				ok: false,
				reason: 'CoinMarketCap API rate limit (HTTP 429). Retry with exponential backoff.',
			};
		}
		return {
			ok: false,
			reason: `CoinMarketCap API error: HTTP ${response.status}`,
		};
	}

	const body = (await response.json()) as {
		status?: {error_code?: string; error_message?: string};
	};
	const errorCode = body.status?.error_code;
	if (errorCode && errorCode !== '0') {
		return {
			ok: false,
			reason:
				body.status?.error_message?.trim() ||
				`CoinMarketCap API error code ${errorCode}`,
		};
	}
	return {ok: true, data: body};
}

export async function cmcProGet(
	path: string,
	params: CmcQueryParams = {},
): Promise<SdkResult<unknown>> {
	const apiKey = getCmcProApiKey();
	if (!apiKey) {
		return {
			ok: false,
			reason:
				'COINMARKETCAP_API_KEY is not configured on continuum-mcp. Use get_kline_candles (DEX) or fall back per chart-ohlcv-sources.',
		};
	}

	const url = new URL(`${CMC_PRO_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
	appendQueryParams(url, params);

	try {
		const response = await fetch(url, {
			headers: {
				Accept: 'application/json',
				'X-CMC_PRO_API_KEY': apiKey,
			},
		});
		return parseCmcJsonResponse(response);
	} catch (error) {
		return {
			ok: false,
			reason:
				error instanceof Error
					? `CoinMarketCap Pro API request failed: ${error.message}`
					: 'CoinMarketCap Pro API request failed.',
		};
	}
}

export async function cmcKeylessGet(
	path: string,
	params: CmcQueryParams = {},
): Promise<SdkResult<unknown>> {
	const url = new URL(`${CMC_KEYLESS_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
	appendQueryParams(url, params);

	try {
		const response = await fetch(url, {
			headers: {Accept: 'application/json'},
		});
		return parseCmcJsonResponse(response);
	} catch (error) {
		return {
			ok: false,
			reason:
				error instanceof Error
					? `CoinMarketCap keyless API request failed: ${error.message}`
					: 'CoinMarketCap keyless API request failed.',
		};
	}
}
