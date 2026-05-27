import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';
import {
	buildManagementPostRequest,
	managementSign,
	type BuiltManagementPostRequest,
} from '../management-signer.js';
import {mpcAuthEnvelopeData} from './sign-request-utils.js';
import {mpcGetSignRequestById} from './client.js';
import type {SignRequestDetail} from './types.js';

export const signRequestListFilterSchema = z.enum([
	'all',
	'pending',
	'success',
	'failed',
	'originator',
	'live',
	'shelved',
	'blocked',
]);
export type SignRequestListFilter = z.infer<typeof signRequestListFilterSchema>;

const signRequestAgreeInputSchema = z.object({
	requestId: z.string().min(1),
	accept: z.boolean().optional(),
	thoughts: z.string().max(256).optional(),
});

export async function listSignRequests(
	config: NodeSdkConfig,
	options: {
		filter?: SignRequestListFilter;
		pagenum?: number;
		pagesize?: number;
		fromTime?: number;
		toTime?: number;
	} = {},
): Promise<SdkResult<{requests: unknown[]; total?: number}>> {
	if (
		options.filter !== undefined &&
		!signRequestListFilterSchema.safeParse(options.filter).success
	) {
		return {ok: false, reason: 'Invalid sign request list filter.'};
	}

	const path = buildManagementQueryPath('/listSignRequests', {
		filter: options.filter,
		pagenum:
			options.pagenum === undefined ? undefined : String(options.pagenum),
		pagesize:
			options.pagesize === undefined ? undefined : String(options.pagesize),
		fromTime:
			options.fromTime === undefined ? undefined : String(options.fromTime),
		toTime: options.toTime === undefined ? undefined : String(options.toTime),
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) return raw;

	const envelope = raw.data;
	if (envelope && typeof envelope === 'object' && !Array.isArray(envelope)) {
		const record = envelope as Record<string, unknown>;
		const data = mpcAuthEnvelopeData(envelope) ?? record.data ?? record.Data;
		const totalRaw = record.total ?? record.Total;
		const total =
			typeof totalRaw === 'number' && Number.isFinite(totalRaw)
				? totalRaw
				: undefined;
		return {
			ok: true,
			data: {
				requests: Array.isArray(data) ? data : [],
				total,
			},
		};
	}

	return {
		ok: true,
		data: {requests: Array.isArray(envelope) ? envelope : []},
	};
}

export async function getSignRequestById(
	config: NodeSdkConfig,
	input: {requestId: string; txParams?: boolean},
): Promise<SdkResult<SignRequestDetail>> {
	const requestId = input.requestId.trim();
	if (requestId.length === 0) {
		return {ok: false, reason: 'Invalid sign request ID.'};
	}
	return mpcGetSignRequestById(config, requestId, {
		txParams: input.txParams,
	});
}

export async function buildSignRequestAgree(
	config: NodeSdkConfig,
	input: {
		requestId: string;
		accept?: boolean;
		thoughts?: string;
	},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = signRequestAgreeInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid sign request agree input.'};
	}

	return buildManagementPostRequest(
		config,
		{
			path: '/signRequestAgree',
			buildRequestFields: () => {
				const fields: Record<string, unknown> = {
					requestId: parsed.data.requestId,
					accept: parsed.data.accept ?? true,
				};
				if (
					parsed.data.thoughts !== undefined &&
					parsed.data.thoughts.length > 0
				) {
					fields.thoughts = parsed.data.thoughts;
				}
				return fields;
			},
		},
		signing,
	);
}

export async function signRequestAgree(
	config: NodeSdkConfig,
	input: {
		requestId: string;
		accept?: boolean;
		thoughts?: string;
	},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<{message: string}>> {
	const built = await buildSignRequestAgree(config, input, signing);
	if (!built.ok) return built;

	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) return signed;

	const posted = await managementPost<string>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) return posted;

	return {ok: true, data: {message: posted.data}};
}

export async function buildShelveSignRequest(
	config: NodeSdkConfig,
	input: {requestId: string},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const requestId = input.requestId.trim();
	if (requestId.length === 0) {
		return {ok: false, reason: 'Invalid sign request ID.'};
	}

	return buildManagementPostRequest(
		config,
		{
			path: '/shelveSignRequest',
			buildRequestFields: () => ({requestId}),
		},
		signing,
	);
}

export async function shelveSignRequest(
	config: NodeSdkConfig,
	input: {requestId: string},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<{message: string}>> {
	const built = await buildShelveSignRequest(config, input, signing);
	if (!built.ok) return built;

	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) return signed;

	const posted = await managementPost<string>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) return posted;

	return {ok: true, data: {message: posted.data}};
}
