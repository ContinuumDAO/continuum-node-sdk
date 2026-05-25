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
	KeyGenResultSchema,
	KeyTypeSchema,
	MsgCheckSchema,
	NodeIdSchema,
	type GroupId,
	type Key,
	type KeyGenId,
	type MsgCheck,
} from '../schemas/extended.js';
import {
	extractStatus,
	normalizeKeyGenRequest,
	normalizeKeyGenResult,
	pick,
} from '../internal/normalize.js';
import {
	prepareSignedManagementRequest,
	toSelectedSigningKey,
} from '../detops/management-signer.js';

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

/** MCP tool: create_mpc_keygen_request */
export async function createMpcKeygenRequest(
	config: NodeSdkConfig,
	input: {
		groupId: GroupId;
		gate: number;
		msgCheck: MsgCheck;
		keyType: Key;
	},
): Promise<
	SdkResult<{
		requestId: KeyGenId;
		selectedSigningKey: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const parsedInput = z
		.object({
			groupId: GroupIdSchema,
			gate: z.number().int().min(2),
			msgCheck: MsgCheckSchema,
			keyType: KeyTypeSchema,
		})
		.safeParse(input);
	if (!parsedInput.success) {
		return {ok: false, reason: 'Invalid keygen request input.'};
	}

	const nodeKeyResult = await managementGet<string>(config, '/getNodeKey');
	if (!nodeKeyResult.ok) {
		return nodeKeyResult;
	}
	const nodeKeyParsed = NodeIdSchema.safeParse(nodeKeyResult.data);
	if (!nodeKeyParsed.success) {
		return {ok: false, reason: 'Node ID response failed validation.'};
	}

	const signed = await prepareSignedManagementRequest(
		config,
		({selectedSigningKey}) => ({
			nodeKey: nodeKeyParsed.data,
			Nonce: selectedSigningKey.nonce,
			Sig: '',
			clientPk: selectedSigningKey.value,
			threshold: parsedInput.data.gate - 1,
			groupId: parsedInput.data.groupId,
			msgCheck: parsedInput.data.msgCheck,
			keyType: parsedInput.data.keyType,
		}),
	);
	if (!signed.ok) {
		return signed;
	}

	const posted = await managementPost<KeyGenId>(
		config,
		'/keyGenRequest',
		signed.data.body,
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
			selectedSigningKey: toSelectedSigningKey(signed.data.selectedSigningKey),
			signingMessage: signed.data.signingMessage,
		},
	};
}

/** MCP tool: accept_mpc_keygen_request */
export async function acceptMpcKeygenRequest(
	config: NodeSdkConfig,
	input: {requestId: KeyGenId},
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
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

	const nodeKeyResult = await managementGet<string>(config, '/getNodeKey');
	if (!nodeKeyResult.ok) {
		return nodeKeyResult;
	}
	const nodeKeyParsed = NodeIdSchema.safeParse(nodeKeyResult.data);
	if (!nodeKeyParsed.success) {
		return {ok: false, reason: 'Node ID response failed validation.'};
	}

	const signed = await prepareSignedManagementRequest(
		config,
		({selectedSigningKey}) => ({
			nodeKey: nodeKeyParsed.data,
			Nonce: selectedSigningKey.nonce,
			Sig: '',
			clientPk: selectedSigningKey.value,
			requestId: requestIdParsed.data,
		}),
	);
	if (!signed.ok) {
		return signed;
	}

	const posted = await managementPost<string>(
		config,
		'/keyGenRequestAgree',
		signed.data.body,
	);
	if (!posted.ok) {
		return posted;
	}
	return {
		ok: true,
		data: {
			message: posted.data,
			selectedSigningKey: toSelectedSigningKey(signed.data.selectedSigningKey),
			signingMessage: signed.data.signingMessage,
		},
	};
}

/** MCP tool: list_mpc_keygen_requests */
export async function listMpcKeygenRequests(
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

	const local = await managementGet<string>(config, '/getNodeKey');
	if (!local.ok) {
		return local;
	}
	const localParsed = NodeIdSchema.safeParse(local.data);
	if (!localParsed.success) {
		return {ok: false, reason: 'Node ID response failed validation.'};
	}

	const agreementChecks = requests.map(request => {
		const isOriginatorLocal = request.originator === localParsed.data;
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
			localNodeId: localParsed.data,
			requests,
			agreementChecks,
		},
	};
}

/** MCP tool: get_mpc_keygen_request_by_id */
export async function getMpcKeygenRequestById(
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
	const local = await managementGet<string>(config, '/getNodeKey');
	if (!local.ok) {
		return local;
	}
	const localParsed = NodeIdSchema.safeParse(local.data);
	if (!localParsed.success) {
		return {ok: false, reason: 'Node ID response failed validation.'};
	}
	const isOriginatorLocal = request.originator === localParsed.data;
	const agreementRequired = request.originator ? !isOriginatorLocal : true;
	return {
		ok: true,
		data: {
			request,
			localNodeId: localParsed.data,
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

/** MCP tool: get_mpc_keygen_result_by_id */
export async function getMpcKeygenResultById(
	config: NodeSdkConfig,
	input: {id: KeyGenId},
): Promise<SdkResult<z.infer<typeof KeyGenResultSchema>>> {
	const idParsed = KeyGenIdSchema.safeParse(input.id);
	if (!idParsed.success) {
		return {ok: false, reason: 'Invalid KeyGen request ID.'};
	}
	const path = buildManagementQueryPath('/getKeyGenResultById', {
		id: idParsed.data,
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return raw;
	}
	const result = normalizeKeyGenResult(raw.data);
	if (!result) {
		return {ok: false, reason: 'KeyGen result response failed validation.'};
	}
	const validated = KeyGenResultSchema.safeParse(result);
	if (!validated.success) {
		return {ok: false, reason: 'KeyGen result response failed validation.'};
	}
	return {ok: true, data: validated.data};
}

/** MCP tool: get_mpc_keygen_parent_group_id */
export async function getMpcKeygenParentGroupId(
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

/** MCP tool: get_mpc_keygen_nonce */
export async function getMpcKeygenNonce(
	config: NodeSdkConfig,
	input: {id: KeyGenId},
): Promise<SdkResult<{globalNonce: number}>> {
	const idParsed = KeyGenIdSchema.safeParse(input.id);
	if (!idParsed.success) {
		return {ok: false, reason: 'Invalid KeyGen request ID.'};
	}
	const path = buildManagementQueryPath('/getGlobalNonceByKeyGenId', {
		id: idParsed.data,
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return raw;
	}
	let globalNonce: number | undefined;
	if (typeof raw.data === 'number') {
		globalNonce = raw.data;
	} else if (raw.data && typeof raw.data === 'object') {
		const src = raw.data as Record<string, unknown>;
		const candidate = pick(src, ['globalNonce', 'GlobalNonce', 'nonce']);
		if (typeof candidate === 'number') {
			globalNonce = candidate;
		}
	}
	if (typeof globalNonce !== 'number' || Number.isNaN(globalNonce)) {
		return {
			ok: false,
			reason: 'Invalid getGlobalNonceByKeyGenId response shape.',
		};
	}
	return {ok: true, data: {globalNonce}};
}
