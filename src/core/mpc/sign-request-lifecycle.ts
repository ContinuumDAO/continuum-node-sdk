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
import {nodeId} from '../general.js';
import {
	buildManagementPostRequest,
	managementSign,
	type BuiltManagementPostRequest,
} from '../management-signer.js';
import {
	mergeSignRequestJoinListRows,
	mpcAuthEnvelopeData,
	readSignRequestListRowId,
	signRequestJoinAgreementState,
	signResultHasExecutableSignature,
} from './sign-request-utils.js';
import {mpcGetSignRequestById, mpcGetSignResultById, mpcPostUpdateSignResultStatusById} from './client.js';
import {signResultExecutionState} from './sign-result-summary.js';
import type {SignRequestDetail} from './types.js';
import {
	SignRequestAgreeInputSchema,
	ShelveSignRequestInputSchema,
	signRequestListFilterSchema,
	type SignRequestListFilter,
} from './schemas.js';
import {parseSignRequestId} from './sign-request-id.js';

export {signRequestListFilterSchema, type SignRequestListFilter} from './schemas.js';

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
		pagesize: String(options.pagesize ?? 20),
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

export type SignRequestJoinAgreementCheck = {
	readonly requestId: string;
	readonly localJoinAgreed: boolean;
	readonly isOriginatorLocal: boolean;
	readonly localAgreementPending: boolean;
	readonly joinAgreedCount: number;
	readonly joinKeyCount: number;
	readonly note: string;
};

/**
 * List sign requests shown on the node app Join tab: merge `live` + `pending`,
 * keep rows where this node is in KeyList, exclude success. Matches
 * `fetchPendingSignRequests` in continuumdao-node-app.
 */
export async function listSignRequestsAwaitingJoin(
	config: NodeSdkConfig,
): Promise<
	SdkResult<{
		localNodeId: string;
		requests: unknown[];
		joinAgreementChecks: SignRequestJoinAgreementCheck[];
	}>
> {
	const self = await nodeId(config);
	if (!self.ok) return self;

	const [liveResult, pendingResult] = await Promise.all([
		listSignRequests(config, {filter: 'live', pagenum: 0, pagesize: 0}),
		listSignRequests(config, {filter: 'pending', pagenum: 0, pagesize: 0}),
	]);
	if (!liveResult.ok) return liveResult;

	const pendingRows = pendingResult.ok ? pendingResult.data.requests : [];
	const merged = mergeSignRequestJoinListRows(
		liveResult.data.requests,
		pendingRows,
		self.data.nodeId,
	);

	const joinAgreementChecks = merged
		.filter((row): row is Record<string, unknown> => row != null && typeof row === 'object')
		.map(row => {
			const check = signRequestJoinAgreementState(row, self.data.nodeId);
			return {
				requestId: readSignRequestListRowId(row),
				localJoinAgreed: check?.localJoinAgreed ?? false,
				isOriginatorLocal: check?.isOriginatorLocal ?? false,
				localAgreementPending: check?.localAgreementPending ?? false,
				joinAgreedCount: check?.joinAgreedCount ?? 0,
				joinKeyCount: check?.joinKeyCount ?? 0,
				note: check?.note ?? 'Could not evaluate Join agreement state.',
			};
		})
		.filter(entry => entry.requestId.length > 0);

	return {
		ok: true,
		data: {
			localNodeId: self.data.nodeId,
			requests: merged,
			joinAgreementChecks,
		},
	};
}

export async function getSignRequestById(
	config: NodeSdkConfig,
	input: {requestId: string; txParams?: boolean},
): Promise<SdkResult<SignRequestDetail>> {
	const parsedId = parseSignRequestId(input.requestId);
	if (!parsedId.ok) return parsedId;
	return mpcGetSignRequestById(config, parsedId.data, {
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
	const parsed = SignRequestAgreeInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid sign request agree input.'};
	}
	const requestId = parseSignRequestId(parsed.data.requestId);
	if (!requestId.ok) return requestId;

	return buildManagementPostRequest(
		config,
		{
			path: '/signRequestAgree',
			buildRequestFields: () => {
				const fields: Record<string, unknown> = {
					requestId: requestId.data,
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

export async function buildUpdateSignResultStatusShelved(
	config: NodeSdkConfig,
	input: {requestId: string},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = ShelveSignRequestInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid shelve sign request input.'};
	}
	const requestId = parseSignRequestId(parsed.data.requestId);
	if (!requestId.ok) return requestId;

	return buildManagementPostRequest(
		config,
		{
			path: '/updateSignResultStatusById',
			buildRequestFields: () => ({
				requestId: requestId.data,
				status: 'shelved',
				shelved: true,
			}),
		},
		signing,
	);
}

function managementPostMessage(data: unknown): string {
	if (typeof data === 'string' && data.trim().length > 0) {
		return data.trim();
	}
	return 'OK';
}

async function submitShelveSignRequestPost(
	config: NodeSdkConfig,
	input: {requestId: string},
	signing: ManagementSigningMethod,
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

	return {ok: true, data: {message: managementPostMessage(posted.data)}};
}

async function submitShelveSignResultPost(
	config: NodeSdkConfig,
	input: {requestId: string},
	signing: ManagementSigningMethod,
): Promise<SdkResult<{message: string}>> {
	const built = await buildUpdateSignResultStatusShelved(config, input, signing);
	if (!built.ok) return built;

	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) return signed;

	const posted = await mpcPostUpdateSignResultStatusById(config, signed.data);
	if (!posted.ok) return posted;

	// Best-effort: also shelve the sign request lifecycle (matches node app; ignore errors).
	await submitShelveSignRequestPost(config, input, signing);

	return {ok: true, data: {message: managementPostMessage(posted.data)}};
}

export async function buildShelveSignRequest(
	config: NodeSdkConfig,
	input: {requestId: string},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsed = ShelveSignRequestInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid shelve sign request input.'};
	}
	const requestId = parseSignRequestId(parsed.data.requestId);
	if (!requestId.ok) return requestId;

	return buildManagementPostRequest(
		config,
		{
			path: '/shelveSignRequest',
			buildRequestFields: () => ({requestId: requestId.data}),
		},
		signing,
	);
}

export async function shelveSignRequest(
	config: NodeSdkConfig,
	input: {requestId: string},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<{message: string}>> {
	const parsed = ShelveSignRequestInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid shelve sign request input.'};
	}

	const requestId = parseSignRequestId(parsed.data.requestId);
	if (!requestId.ok) return requestId;

	const signResult = await mpcGetSignResultById(config, requestId.data);
	if (signResult.ok) {
		const state = signResultExecutionState(signResult.data);
		if (state.signResultStatus === 'shelved') {
			return {ok: true, data: {message: 'Sign result already shelved.'}};
		}
		if (state.executedOnChain) {
			return {
				ok: false,
				reason: 'Sign result already executed on-chain; cannot shelve.',
			};
		}
		if (signResultHasExecutableSignature(signResult.data)) {
			return submitShelveSignResultPost(config, parsed.data, signing);
		}
	}

	return submitShelveSignRequestPost(config, parsed.data, signing);
}
