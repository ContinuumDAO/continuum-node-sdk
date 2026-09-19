import {
	CONTINUUM_DOCS_FETCH_ATTEMPTS,
	CONTINUUM_DOCS_FETCH_RETRY_DELAYS_MS,
	CONTINUUM_DOCS_FETCH_TIMEOUT_MS,
} from './config.js';

export type ContinuumDocsFetchImpl = (
	url: string,
	init?: RequestInit,
) => Promise<Response>;

export class ContinuumDocsHttpError extends Error {
	readonly status: number;

	constructor(status: number, url: string) {
		super(`HTTP ${status} fetching ${url}`);
		this.name = 'ContinuumDocsHttpError';
		this.status = status;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

/** Transient network / origin failures worth another attempt. Not 404 or 4xx (except 429). */
export function isTransientContinuumDocsFetchError(err: unknown): boolean {
	if (err instanceof ContinuumDocsHttpError) {
		return err.status === 429 || err.status === 502 || err.status === 503 || err.status === 504;
	}
	if (!(err instanceof Error)) {
		return false;
	}
	if (err.name === 'AbortError' || err.name === 'TimeoutError') {
		return true;
	}
	const msg = err.message;
	return (
		msg === 'This operation was aborted' ||
		/\b(operation was aborted|aborted|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|UND_ERR|fetch failed|network)\b/i.test(
			msg,
		)
	);
}

async function fetchContinuumDocsUrlOnce(
	url: string,
	options: {
		headers?: HeadersInit;
		fetchImpl: ContinuumDocsFetchImpl;
		timeoutMs: number;
	},
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), options.timeoutMs);
	try {
		const res = await options.fetchImpl(url, {
			signal: controller.signal,
			headers: options.headers,
		});
		if (!res.ok) {
			throw new ContinuumDocsHttpError(res.status, url);
		}
		return res;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * GET with a per-attempt timeout. Retries abort/timeout/reset and 429/502/503/504.
 * Does not retry 404 or other 4xx.
 */
export async function fetchContinuumDocsUrl(
	url: string,
	options?: {
		headers?: HeadersInit;
		fetchImpl?: ContinuumDocsFetchImpl;
		timeoutMs?: number;
		attempts?: number;
		retryDelaysMs?: readonly number[];
		sleepImpl?: (ms: number) => Promise<void>;
	},
): Promise<Response> {
	const fetchImpl = options?.fetchImpl ?? fetch;
	const timeoutMs = options?.timeoutMs ?? CONTINUUM_DOCS_FETCH_TIMEOUT_MS;
	const attempts = options?.attempts ?? CONTINUUM_DOCS_FETCH_ATTEMPTS;
	const delays = options?.retryDelaysMs ?? CONTINUUM_DOCS_FETCH_RETRY_DELAYS_MS;
	const wait = options?.sleepImpl ?? sleep;
	let lastErr: unknown;
	for (let i = 0; i < attempts; i++) {
		try {
			return await fetchContinuumDocsUrlOnce(url, {
				headers: options?.headers,
				fetchImpl,
				timeoutMs,
			});
		} catch (err) {
			lastErr = err;
			if (!isTransientContinuumDocsFetchError(err) || i === attempts - 1) {
				throw err;
			}
			const delay = delays[i] ?? delays[delays.length - 1] ?? 1000;
			await wait(delay);
		}
	}
	throw lastErr;
}
