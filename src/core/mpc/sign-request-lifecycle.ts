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
import {MPA_HOME_DIR} from '../../config/paths.js';
import type {SdkResult} from '../result.js';
import {
	assertAgentCanSignManagementRequests,
	buildManagementPostRequest,
	getManagementSigners,
	managementSign,
	resolveManagementSigningKeyOption,
	signManagementMessage,
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

export type SignRequestAgreeBuilt = {
	readonly path: string;
	readonly unsignedBody: Record<string, unknown>;
	readonly messageToSign: string;
};

function sdkError(reason: string): Error {
	return new Error(reason);
}

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

export function buildSignRequestAgree(
	input: {
		requestId: string;
		accept?: boolean;
		thoughts?: string;
	},
): SdkResult<SignRequestAgreeBuilt> {
	const parsed = signRequestAgreeInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid sign request agree input.'};
	}

	const unsignedBody: Record<string, unknown> = {
		requestId: parsed.data.requestId,
		clientSig: '',
		accept: parsed.data.accept ?? true,
	};
	if (parsed.data.thoughts !== undefined && parsed.data.thoughts.length > 0) {
		unsignedBody.thoughts = parsed.data.thoughts;
	}

	return {
		ok: true,
		data: {
			path: '/signRequestAgree',
			unsignedBody,
			messageToSign: JSON.stringify(unsignedBody),
		},
	};
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
	const built = buildSignRequestAgree(input);
	if (!built.ok) return built;

	try {
		if (signing.kind === 'eip191') {
			const signature = await signing.signMessage(built.data.messageToSign);
			const payload = {
				...built.data.unsignedBody,
				clientSig: signature.trim().replace(/^0x/i, ''),
				signedMessage: built.data.messageToSign,
			};
			const posted = await managementPost<string>(
				config,
				built.data.path,
				payload,
			);
			if (!posted.ok) return posted;
			return {ok: true, data: {message: posted.data}};
		}

		const signersResult = await getManagementSigners(config);
		if (!signersResult.ok) return signersResult;
		const selectedResult = await resolveManagementSigningKeyOption(
			config,
			signersResult.data.signingOptions,
		);
		if (!selectedResult.ok) return selectedResult;

		const signature = await signManagementMessage(
			selectedResult.data,
			built.data.messageToSign,
			{
				keyRoot: MPA_HOME_DIR,
				toMcpApiError: sdkError,
				config,
				assertAgentCanSignManagementRequests: async () => {
					await assertAgentCanSignManagementRequests(config, {
						keyRoot: MPA_HOME_DIR,
						toMcpApiError: sdkError,
					});
				},
			},
		);
		const payload = {
			...built.data.unsignedBody,
			clientSig: signature,
			signedMessage: built.data.messageToSign,
		};
		const posted = await managementPost<string>(config, built.data.path, payload);
		if (!posted.ok) return posted;
		return {ok: true, data: {message: posted.data}};
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
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
