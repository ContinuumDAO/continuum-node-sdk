import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import type {SignRequestDetail} from './types.js';
import {
	clarifySignRequestLookupError,
	parseSignRequestId,
} from './sign-request-id.js';
import {mpcAuthEnvelopeData} from './sign-request-utils.js';

function resolveSignRequestId(requestId: string): SdkResult<string> {
	return parseSignRequestId(requestId);
}

export async function mpcGetSignRequestById(
	config: NodeSdkConfig,
	requestId: string,
	options?: {txParams?: boolean},
): Promise<SdkResult<SignRequestDetail>> {
	const resolved = resolveSignRequestId(requestId);
	if (!resolved.ok) return resolved;

	const path = buildManagementQueryPath('/getSignRequestById', {
		id: resolved.data,
		...(options?.txParams ? {tx_params: '1'} : {}),
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return {ok: false, reason: clarifySignRequestLookupError(raw.reason)};
	}
	const data = mpcAuthEnvelopeData(raw.data) ?? raw.data;
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return {ok: false, reason: 'Invalid getSignRequestById response.'};
	}
	return {ok: true, data: data as SignRequestDetail};
}

function extractMultiSignRequestIdRaw(data: unknown): string | undefined {
	if (typeof data === 'string') {
		const trimmed = data.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}
	if (data != null && typeof data === 'object' && !Array.isArray(data)) {
		const record = data as Record<string, unknown>;
		for (const key of ['requestId', 'RequestId', 'id', 'Id']) {
			const value = record[key];
			if (typeof value === 'string' && value.trim().length > 0) {
				return value.trim();
			}
		}
	}
	return undefined;
}

export async function mpcPostMultiSignRequest(
	config: NodeSdkConfig,
	body: Record<string, unknown>,
): Promise<SdkResult<string>> {
	const posted = await managementPost<unknown>(config, '/multiSignRequest', body);
	if (!posted.ok) return posted;
	const rawId = extractMultiSignRequestIdRaw(posted.data);
	if (!rawId) {
		return {ok: false, reason: 'multiSignRequest returned empty request id.'};
	}
	return parseSignRequestId(rawId);
}

export async function mpcListSignRequestsReady(
	config: NodeSdkConfig,
	options?: {pagenum?: number; pagesize?: number},
): Promise<SdkResult<unknown[]>> {
	const path = buildManagementQueryPath('/listSignRequestsReady', {
		pagenum:
			options?.pagenum === undefined ? undefined : String(options.pagenum),
		pagesize:
			options?.pagesize === undefined ? undefined : String(options.pagesize),
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) return raw;
	const data = mpcAuthEnvelopeData(raw.data) ?? raw.data;
	return {ok: true, data: Array.isArray(data) ? data : []};
}

export async function mpcPostTriggerSignRequestById(
	config: NodeSdkConfig,
	body: Record<string, unknown>,
): Promise<SdkResult<unknown>> {
	const posted = await managementPost<unknown>(
		config,
		'/triggerSignRequestById',
		body,
	);
	if (!posted.ok) return posted;
	return {ok: true, data: posted.data};
}

export async function mpcGetSignResultById(
	config: NodeSdkConfig,
	requestId: string,
): Promise<SdkResult<Record<string, unknown>>> {
	const resolved = resolveSignRequestId(requestId);
	if (!resolved.ok) return resolved;

	const path = buildManagementQueryPath('/getSignResultById', {id: resolved.data});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return {ok: false, reason: clarifySignRequestLookupError(raw.reason)};
	}
	const data = mpcAuthEnvelopeData(raw.data) ?? raw.data;
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return {ok: false, reason: 'Invalid getSignResultById response.'};
	}
	return {ok: true, data: data as Record<string, unknown>};
}

export async function mpcPostUpdateSignResultStatusById(
	config: NodeSdkConfig,
	body: Record<string, unknown>,
): Promise<SdkResult<unknown>> {
	return managementPost<unknown>(config, '/updateSignResultStatusById', body);
}
