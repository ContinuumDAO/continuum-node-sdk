import {buildManagementBaseUrl} from '../config/management-url.js';
import type {NodeSdkConfig} from '../config/schema.js';
import {parseApiEnvelope} from './envelope.js';

const DEFAULT_TIMEOUT_MS = 10_000;

export type ManagementClientOptions = {
	readonly timeoutMs?: number;
};

function resolveManagementBase(config: NodeSdkConfig): string {
	const override = config.node.managementBaseUrl?.trim();
	if (override) {
		return override.replace(/\/+$/, '');
	}
	return buildManagementBaseUrl(
		config.node.baseUrl,
		config.node.managementPort,
	);
}

export function buildManagementUrl(config: NodeSdkConfig, path: string): string {
	const base = resolveManagementBase(config);
	const normalized = path.startsWith('/') ? path : `/${path}`;
	return `${base}${normalized}`;
}

function configFetch(
	config: NodeSdkConfig,
): (url: string, init?: RequestInit) => Promise<Response> {
	return config.customFetch ?? fetch;
}

async function fetchWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs: number,
	fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<Response> {
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
	}, timeoutMs);

	try {
		return await fetchImpl(url, {...init, signal: controller.signal});
	} finally {
		clearTimeout(timeout);
	}
}

export function buildManagementQueryPath(
	path: string,
	params: Record<string, string | readonly string[] | undefined>,
): string {
	const normalized = path.startsWith('/') ? path : `/${path}`;
	const search = new URLSearchParams();

	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) {
			continue;
		}

		if (Array.isArray(value)) {
			for (const entry of value) {
				search.append(key, entry);
			}
		} else if (typeof value === 'string') {
			search.set(key, value);
		}
	}

	const query = search.toString();
	return query.length > 0 ? `${normalized}?${query}` : normalized;
}

export async function managementGet<T>(
	config: NodeSdkConfig,
	path: string,
	options: ManagementClientOptions = {},
): Promise<{ok: true; data: T} | {ok: false; reason: string}> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	try {
		const response = await fetchWithTimeout(
			buildManagementUrl(config, path),
			{method: 'GET'},
			timeoutMs,
			configFetch(config),
		);
		const parsed = await parseApiEnvelope<T>(response);
		if (!parsed.ok) {
			return {ok: false, reason: parsed.reason};
		}

		return {ok: true, data: parsed.data};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: message};
	}
}

export async function managementPost<T>(
	config: NodeSdkConfig,
	path: string,
	body: unknown,
	options: ManagementClientOptions = {},
): Promise<{ok: true; data: T} | {ok: false; reason: string}> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	try {
		const response = await fetchWithTimeout(
			buildManagementUrl(config, path),
			{
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(body),
			},
			timeoutMs,
			configFetch(config),
		);
		const parsed = await parseApiEnvelope<T>(response);
		if (!parsed.ok) {
			return {ok: false, reason: parsed.reason};
		}

		return {ok: true, data: parsed.data};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: message};
	}
}

export type NonceData = {
	key: string;
	nonce: number;
};

export async function fetchEd25519ManagementNonce(
	config: NodeSdkConfig,
	publicKey?: string,
): Promise<{ok: true; data: NonceData} | {ok: false; reason: string}> {
	const query =
		publicKey && publicKey.length > 0
			? `?publicKey=${encodeURIComponent(publicKey)}`
			: '';
	return managementGet<NonceData>(config, `/getPublicMgtKeyNonce${query}`);
}

export async function fetchEIP191ManagementNonce(
	config: NodeSdkConfig,
): Promise<{ok: true; data: NonceData} | {ok: false; reason: string}> {
	return managementGet<NonceData>(config, '/getNodeMgtKeyNonce');
}
