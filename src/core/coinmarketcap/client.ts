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
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		body = undefined;
	}
	const status =
		body && typeof body === 'object' && 'status' in body
			? (body as {status?: {error_code?: string; error_message?: string}}).status
			: undefined;

	if (!response.ok) {
		const detail = status?.error_message?.trim();
		if (response.status === 429) {
			return {
				ok: false,
				reason: detail || 'CoinMarketCap API rate limit (HTTP 429). Retry with exponential backoff.',
			};
		}
		if (response.status === 403 && detail) {
			return {
				ok: false,
				reason: `CoinMarketCap API error: HTTP 403 — ${detail}`,
			};
		}
		return {
			ok: false,
			reason: detail
				? `CoinMarketCap API error: HTTP ${response.status} — ${detail}`
				: `CoinMarketCap API error: HTTP ${response.status}`,
		};
	}

	const errorCode = status?.error_code;
	if (errorCode && errorCode !== '0') {
		return {
			ok: false,
			reason:
				status?.error_message?.trim() ||
				`CoinMarketCap API error code ${errorCode}`,
		};
	}
	return {ok: true, data: body};
}

export async function cmcProGet(
	path: string,
	params: CmcQueryParams = {},
	apiKey?: string,
): Promise<SdkResult<unknown>> {
	const resolvedKey = apiKey?.trim() || getCmcProApiKey();
	if (!resolvedKey) {
		return {
			ok: false,
			reason:
				'COINMARKETCAP_API_KEY is not configured. Add it via Node → AI Agent → Variables (add_environment_variable). Use get_kline_candles for keyless DEX OHLCV.',
		};
	}

	const url = new URL(`${CMC_PRO_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
	appendQueryParams(url, params);

	try {
		const response = await fetch(url, {
			headers: {
				Accept: 'application/json',
				'X-CMC_PRO_API_KEY': resolvedKey,
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
