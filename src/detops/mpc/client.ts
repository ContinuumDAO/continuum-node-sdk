import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import type {SignRequestDetail} from './types.js';
import {mpcAuthEnvelopeData} from './sign-request-utils.js';

export async function mpcGetSignRequestById(
	config: NodeSdkConfig,
	requestId: string,
	options?: {txParams?: boolean},
): Promise<SdkResult<SignRequestDetail>> {
	const path = buildManagementQueryPath('/getSignRequestById', {
		id: requestId,
		...(options?.txParams ? {tx_params: '1'} : {}),
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) return raw;
	const data = mpcAuthEnvelopeData(raw.data) ?? raw.data;
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return {ok: false, reason: 'Invalid getSignRequestById response.'};
	}
	return {ok: true, data: data as SignRequestDetail};
}

export async function mpcPostMultiSignRequest(
	config: NodeSdkConfig,
	body: Record<string, unknown>,
): Promise<SdkResult<string>> {
	const posted = await managementPost<unknown>(config, '/multiSignRequest', body);
	if (!posted.ok) return posted;
	const id =
		typeof posted.data === 'string'
			? posted.data
			: posted.data != null
				? String(posted.data)
				: '';
	if (!id.trim()) {
		return {ok: false, reason: 'multiSignRequest returned empty request id.'};
	}
	return {ok: true, data: id.trim()};
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
	const path = buildManagementQueryPath('/getSignResultById', {id: requestId});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) return raw;
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

export async function mpcGetChainDetails(
	config: NodeSdkConfig,
	chainId: number,
): Promise<SdkResult<unknown>> {
	const path = buildManagementQueryPath('/getChainDetails', {
		chain_id: String(chainId),
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) return raw;
	const data = mpcAuthEnvelopeData(raw.data) ?? raw.data;
	return {ok: true, data};
}
