import type {SdkResult} from '../result.js';
import {
	ARKHAM_API_BASE_URL,
	ARKHAM_API_KEY_HEADER,
	getArkhamApiKeyFromEnv,
	missingArkhamApiKeyReason,
} from './api-key.js';
import type {ArkhamApiRequestInput, ArkhamApiRequestOutput} from './schemas.js';

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_CHARS = 200_000;
const USER_AGENT =
	'ArkhamIntelMcp/1.0 (+https://arkm.com/api/docs)';

export type ArkhamRequestDeps = {
	fetchImpl?: typeof fetch;
	apiKey?: string;
};

const PATH_RE = /^\/[A-Za-z0-9._~%+-]+(?:\/[A-Za-z0-9._~%+-]+)*\/?$/;

export function normalizeArkhamPath(
	raw: string,
): SdkResult<{path: string}> {
	const trimmed = raw.trim();
	if (!trimmed.startsWith('/')) {
		return {ok: false, reason: 'path must start with / (REST path only, not a full URL).'};
	}
	if (trimmed.includes('://') || trimmed.startsWith('//')) {
		return {ok: false, reason: 'path must be a relative REST path on api.arkm.com.'};
	}
	if (trimmed.includes('?') || trimmed.includes('#')) {
		return {ok: false, reason: 'Put query string fields in query_params, not in path.'};
	}
	if (trimmed.includes('..')) {
		return {ok: false, reason: 'path must not contain ..'};
	}
	if (!PATH_RE.test(trimmed)) {
		return {ok: false, reason: 'path contains unsupported characters.'};
	}
	const path = trimmed.replace(/\/+$/, '') || '/';
	if (path === '/ws' || path.startsWith('/ws/')) {
		return {
			ok: false,
			reason: 'WebSocket paths are not supported. Use documented REST endpoints only.',
		};
	}
	return {ok: true, data: {path}};
}

function appendQueryParams(
	url: URL,
	params: Record<string, string | number | boolean> | undefined,
): void {
	if (!params) {
		return;
	}
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === '') {
			continue;
		}
		url.searchParams.set(key, String(value));
	}
}

function transferBillingWarning(path: string): string | undefined {
	if (path === '/transfers' || path.startsWith('/transfers/')) {
		return 'Arkham bills /transfers per row. Keep time range and limit tight.';
	}
	return undefined;
}

async function parseBody(response: Response): Promise<{data: unknown; truncated: boolean}> {
	const text = await response.text();
	if (!text) {
		return {data: null, truncated: false};
	}
	const truncated = text.length > MAX_RESPONSE_CHARS;
	const slice = truncated ? text.slice(0, MAX_RESPONSE_CHARS) : text;
	try {
		return {data: JSON.parse(slice), truncated};
	} catch {
		return {data: slice, truncated};
	}
}

export async function arkhamApiRequest(
	input: ArkhamApiRequestInput,
	deps: ArkhamRequestDeps = {},
): Promise<SdkResult<ArkhamApiRequestOutput>> {
	const apiKey = deps.apiKey?.trim() || getArkhamApiKeyFromEnv();
	if (!apiKey) {
		return {ok: false, reason: missingArkhamApiKeyReason()};
	}

	const normalized = normalizeArkhamPath(input.path);
	if (!normalized.ok) {
		return normalized;
	}

	const method = input.method ?? 'GET';
	const url = new URL(
		`${ARKHAM_API_BASE_URL}${normalized.data.path}`,
	);
	appendQueryParams(url, input.query_params);

	if ((method === 'GET' || method === 'DELETE') && input.body) {
		return {ok: false, reason: `${method} must not include a JSON body.`};
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const response = await (deps.fetchImpl ?? fetch)(url, {
			method,
			headers: {
				Accept: 'application/json',
				[ARKHAM_API_KEY_HEADER]: apiKey,
				...(input.body ? {'Content-Type': 'application/json'} : {}),
				'User-Agent': USER_AGENT,
			},
			body: input.body ? JSON.stringify(input.body) : undefined,
			signal: controller.signal,
			redirect: 'error',
		});
		const parsed = await parseBody(response);
		if (!response.ok) {
			const detail =
				parsed.data && typeof parsed.data === 'object'
					? JSON.stringify(parsed.data)
					: String(parsed.data ?? '');
			return {
				ok: false,
				reason: detail
					? `Arkham Intel API error: HTTP ${response.status} — ${detail.slice(0, 500)}`
					: `Arkham Intel API error: HTTP ${response.status}`,
			};
		}
		return {
			ok: true,
			data: {
				method,
				path: normalized.data.path,
				status: response.status,
				truncated: parsed.truncated,
				warning: transferBillingWarning(normalized.data.path),
				data: parsed.data,
			},
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: `Arkham Intel API request failed: ${message}`};
	} finally {
		clearTimeout(timer);
	}
}
