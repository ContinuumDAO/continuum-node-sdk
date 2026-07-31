import type {CoinbaseCdpCredentials} from './credentials.js';
import {signCoinbaseCdpJwt} from './jwt.js';

export const COINBASE_API_HOST = 'api.coinbase.com';
export const COINBASE_PUBLIC_BASE = `https://${COINBASE_API_HOST}/api/v3/brokerage/market`;
export const COINBASE_AUTH_BASE = `https://${COINBASE_API_HOST}/api/v3/brokerage`;

const FETCH_TIMEOUT_MS = 15_000;

export type CoinbaseHttpResult = {
	ok: boolean;
	status: number;
	data: unknown;
	authMode: 'public' | 'authenticated';
	reason?: string;
};

async function fetchJson(
	url: string,
	headers: Record<string, string>,
): Promise<{ok: boolean; status: number; data: unknown; reason?: string}> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const resp = await fetch(url, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				'Cache-Control': 'no-cache',
				...headers,
			},
			signal: controller.signal,
		});
		const text = await resp.text();
		let data: unknown = null;
		if (text) {
			try {
				data = JSON.parse(text) as unknown;
			} catch {
				data = {raw: text};
			}
		}
		if (!resp.ok) {
			const msg =
				data && typeof data === 'object' && !Array.isArray(data)
					? String(
							(data as {message?: unknown; error?: unknown}).message ??
								(data as {error?: unknown}).error ??
								resp.statusText,
						)
					: resp.statusText;
			return {ok: false, status: resp.status, data, reason: msg || `HTTP ${resp.status}`};
		}
		return {ok: true, status: resp.status, data};
	} catch (err) {
		const reason = err instanceof Error ? err.message : 'fetch failed';
		return {ok: false, status: 0, data: null, reason};
	} finally {
		clearTimeout(timer);
	}
}

/**
 * GET a Coinbase brokerage path.
 * When credentials are set, prefer authenticated `/api/v3/brokerage/...` (non-market);
 * otherwise use public `/api/v3/brokerage/market/...`.
 */
export async function coinbaseGet(input: {
	/** Path after /market or after /brokerage (e.g. `/products/BTC-USD/candles?...`). */
	marketPath: string;
	/** Authenticated path when different (defaults to marketPath without /market prefix semantics). */
	authPath?: string;
	credentials?: CoinbaseCdpCredentials;
}): Promise<CoinbaseHttpResult> {
	const marketPath = input.marketPath.startsWith('/')
		? input.marketPath
		: `/${input.marketPath}`;
	const authPathRaw = input.authPath ?? marketPath;
	const authPath = authPathRaw.startsWith('/') ? authPathRaw : `/${authPathRaw}`;

	if (input.credentials) {
		const pathForJwt = authPath.split('?')[0] ?? authPath;
		try {
			const jwt = signCoinbaseCdpJwt({
				credentials: input.credentials,
				method: 'GET',
				host: COINBASE_API_HOST,
				path: `/api/v3/brokerage${pathForJwt}`,
			});
			const url = `${COINBASE_AUTH_BASE}${authPath}`;
			const result = await fetchJson(url, {Authorization: `Bearer ${jwt}`});
			if (result.ok) {
				return {...result, authMode: 'authenticated'};
			}
			// Fall through to public if auth fails (key misconfigured / wrong alg).
		} catch {
			/* fall through to public */
		}
	}

	const publicUrl = `${COINBASE_PUBLIC_BASE}${marketPath}`;
	const publicResult = await fetchJson(publicUrl, {});
	return {...publicResult, authMode: 'public'};
}
