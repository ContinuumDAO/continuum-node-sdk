import type {NodeSdkConfig} from '../../config/schema.js';
import {
	buildManagementUrl,
	managementGet,
	managementPost,
	type ManagementClientOptions,
} from '../../api/management-api.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {
	buildManagementPostRequest,
	managementSign,
	toSelectedSigner,
} from '../management-signer.js';

export async function postSignedManagementRequest<T extends Record<string, unknown>>(
	config: NodeSdkConfig,
	path: string,
	buildRequestFields: (
		ctx: {nodeKey: string},
	) => Record<string, unknown> | Promise<Record<string, unknown>>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		data: T;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildManagementPostRequest(
		config,
		{path, buildRequestFields: ctx => buildRequestFields({nodeKey: ctx.nodeKey})},
		signing,
	);
	if (!built.ok) return built;

	const signed = await managementSign(config, signing, built.data.unsignedBody, {
		publicKey: built.data.selectedSigningKey?.value,
	});
	if (!signed.ok) return signed;

	const posted = await managementPost<unknown>(config, path, signed.data);
	if (!posted.ok) return posted;

	const data = parseRecord(posted.data);
	if (!data) {
		return {ok: false, reason: 'Unexpected management API response shape.'};
	}

	return {
		ok: true,
		data: {
			data: data as T,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function postSignedRawResponse(
	config: NodeSdkConfig,
	path: string,
	buildRequestFields: (
		ctx: {nodeKey: string},
	) => Record<string, unknown> | Promise<Record<string, unknown>>,
	options: ManagementClientOptions = {},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<{bytes: Uint8Array; headers: Headers}>> {
	const built = await buildManagementPostRequest(
		config,
		{path, buildRequestFields: ctx => buildRequestFields({nodeKey: ctx.nodeKey})},
		signing,
	);
	if (!built.ok) return built;

	const signed = await managementSign(config, signing, built.data.unsignedBody, {
		publicKey: built.data.selectedSigningKey?.value,
	});
	if (!signed.ok) return signed;

	const timeoutMs = options.timeoutMs ?? 120_000;
	const fetchImpl = config.customFetch ?? fetch;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(buildManagementUrl(config, path), {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify(signed.data),
			signal: controller.signal,
		});
		if (!response.ok) {
			let reason = `HTTP ${response.status}`;
			try {
				const json = (await response.json()) as Record<string, unknown>;
				const err = json.error ?? json.Error;
				if (typeof err === 'string' && err.trim()) {
					reason = `${reason}: ${err.trim()}`;
				}
			} catch {
				// raw error body
			}
			return {ok: false, reason};
		}
		const buffer = await response.arrayBuffer();
		return {ok: true, data: {bytes: new Uint8Array(buffer), headers: response.headers}};
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	} finally {
		clearTimeout(timeout);
	}
}

export async function postSignedMultipartBackup(
	config: NodeSdkConfig,
	path: string,
	meta: Record<string, unknown>,
	fileBytes: Uint8Array,
	filename: string,
	options: ManagementClientOptions = {},
): Promise<SdkResult<Record<string, unknown>>> {
	const timeoutMs = options.timeoutMs ?? 120_000;
	const fetchImpl = config.customFetch ?? fetch;
	const form = new FormData();
	form.append('meta', JSON.stringify(meta));
	form.append('file', new Blob([new Uint8Array(fileBytes)]), filename);

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(buildManagementUrl(config, path), {
			method: 'POST',
			body: form,
			signal: controller.signal,
		});
		const body = await response.json().catch(() => null);
		if (!response.ok || !body || typeof body !== 'object') {
			return {ok: false, reason: `HTTP ${response.status}`};
		}
		const envelope = body as Record<string, unknown>;
		const code = envelope.code ?? envelope.Code;
		if (code !== 0 && code !== '0') {
			const err = envelope.error ?? envelope.Error;
			return {
				ok: false,
				reason: typeof err === 'string' && err.trim() ? err.trim() : `API code ${String(code)}`,
			};
		}
		const data = envelope.data ?? envelope.Data;
		const record = parseRecord(data);
		if (!record) {
			return {ok: false, reason: 'Unexpected postDatabaseBackup response shape.'};
		}
		return {ok: true, data: record};
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	} finally {
		clearTimeout(timeout);
	}
}

export async function managementGetRecord(
	config: NodeSdkConfig,
	path: string,
): Promise<SdkResult<Record<string, unknown>>> {
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) return result;
	const record = parseRecord(result.data);
	if (!record) {
		return {ok: false, reason: 'Unexpected management GET response shape.'};
	}
	return {ok: true, data: record};
}

function parseRecord(value: unknown): Record<string, unknown> | null {
	if (value != null && typeof value === 'object' && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
}
