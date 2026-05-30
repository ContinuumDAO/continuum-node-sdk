import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../api/management-api.js';
import type {SdkResult} from './result.js';
import {
	GroupIdSchema,
	KeyGenIdSchema,
	KeyGenRequestSchema,
	KeyTypeSchema,
	MsgCheckSchema,
	type GroupId,
	type Key,
	type KeyGenId,
	type MsgCheck,
} from '../schemas/extended.js';
import {
	extractStatus,
	normalizeKeyGenRequest,
	pick,
} from '../internal/normalize.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../schemas/extended.js';
import {
	buildManagementPostRequest,
	managementSign,
	toSelectedSigningKey,
	type BuiltManagementPostRequest,
} from './management-signer.js';
import {nodeId} from './general.js';
import type {KeyGenResultById} from './mpc/types.js';
import {mpcAuthEnvelopeData} from './mpc/sign-request-utils.js';

export const keyGenFilterSchema = z.enum([
	'all',
	'pending',
	'success',
	'failed',
	'agree',
	'originator',
]);
export type KeyGenFilter = z.infer<typeof keyGenFilterSchema>;

export type KeyGenAgreementCheck = {
	requestId: KeyGenId;
	originator?: string;
	isOriginatorLocal: boolean;
	agreementRequired: boolean;
	note: string;
};

export async function fetchKeyGenResult(
	config: NodeSdkConfig,
	keyGenId: string,
): Promise<SdkResult<KeyGenResultById>> {
	const path = buildManagementQueryPath('/getKeyGenResultById', {id: keyGenId});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) return raw;
	const data = mpcAuthEnvelopeData(raw.data) ?? raw.data;
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return {ok: false, reason: 'Invalid getKeyGenResultById response.'};
	}
	return {ok: true, data: data as KeyGenResultById};
}

export async function fetchGlobalNonceByKeyGenId(
	config: NodeSdkConfig,
	keyGenId: string,
): Promise<SdkResult<number>> {
	const path = buildManagementQueryPath('/getGlobalNonceByKeyGenId', {
		id: keyGenId,
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) return raw;
	let globalNonce: number | undefined;
	if (typeof raw.data === 'number') {
		globalNonce = raw.data;
	} else {
		const data = mpcAuthEnvelopeData(raw.data) ?? raw.data;
		if (data && typeof data === 'object' && !Array.isArray(data)) {
			const src = data as Record<string, unknown>;
			const candidate = src.globalNonce ?? src.GlobalNonce ?? src.globalnonce;
			if (typeof candidate === 'number') globalNonce = candidate;
		}
	}
	if (typeof globalNonce !== 'number' || Number.isNaN(globalNonce)) {
		return {ok: false, reason: 'Invalid getGlobalNonceByKeyGenId response.'};
	}
	return {ok: true, data: globalNonce};
}

/** MCP tool: create_key_gen_request — `gate` is the CGGMP24/FROST signing threshold (min nodes to sign). */
export async function buildCreateKeyGenRequest(
	config: NodeSdkConfig,
	input: {
		groupId: GroupId;
		gate: number;
		msgCheck: MsgCheck;
		keyType: Key;
	},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsedInput = z
		.object({
			groupId: GroupIdSchema,
			gate: z.number().int().min(2),
			msgCheck: MsgCheckSchema,
			keyType: KeyTypeSchema,
		})
		.safeParse(input);
	if (!parsedInput.success) {
		return {ok: false, reason: 'Invalid KeyGen request input.'};
	}

	return buildManagementPostRequest(
		config,
		{
			path: '/keyGenRequest',
			buildRequestFields: ({selectedSigningKey}) => ({
				...(selectedSigningKey ? {clientPk: selectedSigningKey.value} : {}),
				threshold: parsedInput.data.gate,
				groupId: parsedInput.data.groupId,
				msgCheck: parsedInput.data.msgCheck,
				keyType: parsedInput.data.keyType,
			}),
		},
		signing,
	);
}

/** MCP tool: create_key_gen_request */
export async function createKeyGenRequest(
	config: NodeSdkConfig,
	input: {
		groupId: GroupId;
		gate: number;
		msgCheck: MsgCheck;
		keyType: Key;
	},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		requestId: KeyGenId;
		selectedSigningKey?: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const built = await buildCreateKeyGenRequest(config, input, signing);
	if (!built.ok) {
		return built;
	}

	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}

	const posted = await managementPost<KeyGenId>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	const requestIdParsed = KeyGenIdSchema.safeParse(posted.data);
	if (!requestIdParsed.success) {
		return {ok: false, reason: 'KeyGen request ID response failed validation.'};
	}
	return {
		ok: true,
		data: {
			requestId: requestIdParsed.data,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigningKey(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

/** MCP tool: accept_key_gen_request */
export async function buildAcceptKeyGenRequest(
	config: NodeSdkConfig,
	input: {requestId: KeyGenId},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const requestIdParsed = KeyGenIdSchema.safeParse(input.requestId);
	if (!requestIdParsed.success) {
		return {ok: false, reason: 'Invalid KeyGen request ID.'};
	}

	const path = buildManagementQueryPath('/getKeyGenRequestById', {
		id: requestIdParsed.data,
	});
	const requestRaw = await managementGet<unknown>(config, path);
	if (!requestRaw.ok) {
		return requestRaw;
	}
	const status = extractStatus(requestRaw.data);
	if (status && status !== 'pending') {
		return {ok: false, reason: 'KeyGen request is not pending.'};
	}

	return buildManagementPostRequest(
		config,
		{
			path: '/keyGenRequestAgree',
			buildRequestFields: ({selectedSigningKey}) => ({
				...(selectedSigningKey ? {clientPk: selectedSigningKey.value} : {}),
				requestId: requestIdParsed.data,
			}),
		},
		signing,
	);
}

/** MCP tool: accept_key_gen_request */
export async function acceptKeyGenRequest(
	config: NodeSdkConfig,
	input: {requestId: KeyGenId},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const built = await buildAcceptKeyGenRequest(config, input, signing);
	if (!built.ok) {
		return built;
	}

	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}

	const posted = await managementPost<string>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	return {
		ok: true,
		data: {
			message: posted.data,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigningKey(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

/** MCP tool: list_key_gen_requests */
export async function listKeyGenRequests(
	config: NodeSdkConfig,
	options: {
		filter?: KeyGenFilter;
		pagenum?: number;
		pagesize?: number;
	} = {},
): Promise<
	SdkResult<{
		localNodeId: string;
		requests: z.infer<typeof KeyGenRequestSchema>[];
		agreementChecks: KeyGenAgreementCheck[];
	}>
> {
	if (
		options.filter !== undefined &&
		!keyGenFilterSchema.safeParse(options.filter).success
	) {
		return {ok: false, reason: 'Invalid KeyGen request filter.'};
	}
	const path = buildManagementQueryPath('/listKeyGenRequests', {
		filter: options.filter,
		pagenum:
			options.pagenum === undefined ? undefined : String(options.pagenum),
		pagesize:
			options.pagesize === undefined ? undefined : String(options.pagesize),
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return raw;
	}
	const rawList = Array.isArray(raw.data) ? raw.data : [];
	const requests = rawList
		.map(entry => normalizeKeyGenRequest(entry))
		.filter(
			(entry): entry is z.infer<typeof KeyGenRequestSchema> =>
				entry !== undefined,
		);

	const self = await nodeId(config);
	if (!self.ok) {
		return self;
	}

	const agreementChecks = requests.map(request => {
		const isOriginatorLocal = request.originator === self.data.nodeId;
		const agreementRequired = request.originator ? !isOriginatorLocal : true;
		return {
			requestId: request.requestid,
			originator: request.originator,
			isOriginatorLocal,
			agreementRequired,
			note: !request.originator
				? 'Originator is not provided in this response; assuming agreement may be required.'
				: isOriginatorLocal
					? 'Originator is local node; agreement is not required.'
					: 'Originator is a different node; agreement is required.',
		};
	});

	return {
		ok: true,
		data: {
			localNodeId: self.data.nodeId,
			requests,
			agreementChecks,
		},
	};
}

/** MCP tool: get_key_gen_request_by_id */
export async function getKeyGenRequestById(
	config: NodeSdkConfig,
	input: {id: KeyGenId},
): Promise<
	SdkResult<{
		request: z.infer<typeof KeyGenRequestSchema>;
		localNodeId: string;
		isOriginatorLocal: boolean;
		agreementRequired: boolean;
		note: string;
	}>
> {
	const idParsed = KeyGenIdSchema.safeParse(input.id);
	if (!idParsed.success) {
		return {ok: false, reason: 'Invalid KeyGen request ID.'};
	}
	const path = buildManagementQueryPath('/getKeyGenRequestById', {
		id: idParsed.data,
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return raw;
	}
	const request = normalizeKeyGenRequest(raw.data);
	if (!request) {
		return {ok: false, reason: 'KeyGen request response failed validation.'};
	}
	const self = await nodeId(config);
	if (!self.ok) {
		return self;
	}
	const isOriginatorLocal = request.originator === self.data.nodeId;
	const agreementRequired = request.originator ? !isOriginatorLocal : true;
	return {
		ok: true,
		data: {
			request,
			localNodeId: self.data.nodeId,
			isOriginatorLocal,
			agreementRequired,
			note: !request.originator
				? 'Originator is not provided in this response; assuming agreement may be required.'
				: isOriginatorLocal
					? 'Originator is local node; agreement is not required.'
					: 'Originator is a different node; agreement is required.',
		},
	};
}

/** MCP tool: get_key_gen_parent_group_id */
export async function getKeyGenParentGroupId(
	config: NodeSdkConfig,
	input: {id: KeyGenId},
): Promise<SdkResult<{requestid: string; groupId: GroupId}>> {
	const idParsed = KeyGenIdSchema.safeParse(input.id);
	if (!idParsed.success) {
		return {ok: false, reason: 'Invalid KeyGen request ID.'};
	}
	const path = buildManagementQueryPath('/getKeyGenGroupId', {id: idParsed.data});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return raw;
	}
	if (!raw.data || typeof raw.data !== 'object') {
		return {ok: false, reason: 'Invalid getKeyGenGroupId response shape.'};
	}
	const src = raw.data as Record<string, unknown>;
	const requestid = pick(src, ['requestid', 'RequestId', 'id']);
	const groupId = pick(src, ['groupid', 'GroupId', 'groupId']);
	if (typeof requestid !== 'string' || typeof groupId !== 'string') {
		return {ok: false, reason: 'Invalid getKeyGenGroupId response shape.'};
	}
	const groupIdParsed = GroupIdSchema.safeParse(groupId);
	if (!groupIdParsed.success) {
		return {ok: false, reason: 'Invalid group ID in response.'};
	}
	return {ok: true, data: {requestid, groupId: groupIdParsed.data}};
}
