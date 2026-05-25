import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../api/management-api.js';
import type {SdkResult} from '../detops/result.js';
import {
	FilterSchema,
	GroupIdSchema,
	GroupRequestIdSchema,
	McpGroupRequestSchema,
	NodeIdSchema,
	type Filter,
	type GroupId,
	type McpGroupRequest,
	type McpGroupResult,
	type NodeId,
} from '../schemas/extended.js';
import {
	isSameNodeSet,
	normalizeGroupRequest,
	normalizeGroupResult,
	normalizeLegacyGroupListEntry,
	normalizeNodeIdList,
} from '../internal/normalize.js';
import {
	prepareSignedManagementRequest,
	toSelectedSigningKey,
} from '../detops/management-signer.js';

async function fetchNodeIdByIp(
	config: NodeSdkConfig,
): Promise<SdkResult<Record<string, NodeId>>> {
	const configured = await managementGet<{
		nodes: Array<{address: string; available: boolean}>;
	}>(config, '/getConfiguredNodeKeys');
	if (!configured.ok) {
		return configured;
	}

	const entries: Array<[string, NodeId]> = [];
	for (const node of configured.data.nodes ?? []) {
		try {
			const parsed = new URL(node.address);
			const ip = parsed.hostname;
			const port = parsed.port || '18080';
			const url = `${parsed.protocol}//${ip}:${port}/getNodeKey`;
			const response = await fetch(url, {method: 'GET'});
			if (!response.ok) {
				continue;
			}
			const body = (await response.json()) as {
				Code?: number;
				Data?: string;
				code?: number;
				data?: string;
			};
			const code = body.Code ?? body.code;
			const data = body.Data ?? body.data;
			if (code !== 0 && String(code) !== '0') {
				continue;
			}
			const nodeIdParsed = NodeIdSchema.safeParse(data);
			if (nodeIdParsed.success) {
				entries.push([ip, nodeIdParsed.data]);
			}
		} catch {
			// skip unreachable nodes
		}
	}

	return {ok: true, data: Object.fromEntries(entries)};
}

async function groupExistsForNodeIds(
	config: NodeSdkConfig,
	nodeIds: NodeId[],
): Promise<boolean> {
	const list = await listMcpGroupResults(config, {});
	if (!list.ok) {
		return false;
	}
	return list.data.results.some(result =>
		isSameNodeSet(result.KeyList, nodeIds),
	);
}

export async function listAvailableNodeIds(
	config: NodeSdkConfig,
): Promise<
	SdkResult<{
		selfNodeId: NodeId;
		nodes: Array<{
			index: number;
			ip: string;
			nodeId: NodeId;
			isSelf: boolean;
		}>;
		nodeIdByIp: Record<string, NodeId>;
	}>
> {
	const [nodeIdByIpResult, selfResult] = await Promise.all([
		fetchNodeIdByIp(config),
		managementGet<string>(config, '/getNodeKey'),
	]);
	if (!nodeIdByIpResult.ok) {
		return nodeIdByIpResult;
	}
	if (!selfResult.ok) {
		return selfResult;
	}
	const selfParsed = NodeIdSchema.safeParse(selfResult.data);
	if (!selfParsed.success) {
		return {ok: false, reason: 'Node ID response failed validation.'};
	}
	const selfNodeId = selfParsed.data;
	const nodeIdByIp = nodeIdByIpResult.data;
	const nodes = Object.entries(nodeIdByIp).map(([ip, nodeId], idx) => ({
		index: idx + 1,
		ip,
		nodeId,
		isSelf: nodeId === selfNodeId,
	}));
	return {ok: true, data: {selfNodeId, nodes, nodeIdByIp}};
}

export async function createGroupRequest(
	config: NodeSdkConfig,
	input: {nodeIds: NodeId[]},
): Promise<
	SdkResult<{
		groupRequestId: string;
		selectedSigningKey: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const nodeIdsParsed = z.array(NodeIdSchema).min(2).safeParse(input.nodeIds);
	if (!nodeIdsParsed.success) {
		return {ok: false, reason: 'Invalid nodeIds input.'};
	}

	const available = await listAvailableNodeIds(config);
	if (!available.ok) {
		return available;
	}
	const configuredSet = new Set(Object.values(available.data.nodeIdByIp));
	const keyList = normalizeNodeIdList(nodeIdsParsed.data);
	const invalid = keyList.filter(id => !configuredSet.has(id));
	if (invalid.length > 0) {
		return {
			ok: false,
			reason: 'nodeIds contains values not present in configured nodes.',
		};
	}
	if (!keyList.includes(available.data.selfNodeId)) {
		return {
			ok: false,
			reason: 'Selected nodeIds must include the originator node ID.',
		};
	}
	if (await groupExistsForNodeIds(config, keyList)) {
		return {ok: false, reason: 'A group with this exact node set already exists.'};
	}

	const signed = await prepareSignedManagementRequest(config, ({selectedSigningKey}) => ({
		nodeKey: available.data.selfNodeId,
		Nonce: selectedSigningKey.nonce,
		Sig: '',
		keyList,
		BrokerArray: [],
	}));
	if (!signed.ok) {
		return signed;
	}

	const posted = await managementPost<string>(config, '/newGroupRequest', signed.data.body);
	if (!posted.ok) {
		return posted;
	}
	const requestIdParsed = GroupRequestIdSchema.safeParse(posted.data);
	return {
		ok: true,
		data: {
			groupRequestId: requestIdParsed.success ? requestIdParsed.data : posted.data,
			selectedSigningKey: toSelectedSigningKey(signed.data.selectedSigningKey),
			signingMessage: signed.data.signingMessage,
		},
	};
}

export async function acceptGroupRequest(
	config: NodeSdkConfig,
	input: {requestId: string},
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const requestIdParsed = GroupRequestIdSchema.safeParse(input.requestId);
	if (!requestIdParsed.success) {
		return {ok: false, reason: 'Invalid group request ID.'};
	}

	const path = buildManagementQueryPath('/getNewGroupRequestById', {
		id: requestIdParsed.data,
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return raw;
	}
	const request = normalizeGroupRequest(raw.data);
	if (!request) {
		return {ok: false, reason: 'Group request response failed validation.'};
	}
	if (request.status !== 'pending') {
		return {ok: false, reason: 'Group request is not pending.'};
	}

	const nodeKeyResult = await managementGet<string>(config, '/getNodeKey');
	if (!nodeKeyResult.ok) {
		return nodeKeyResult;
	}
	const nodeKeyParsed = NodeIdSchema.safeParse(nodeKeyResult.data);
	if (!nodeKeyParsed.success) {
		return {ok: false, reason: 'Node ID response failed validation.'};
	}

	const signed = await prepareSignedManagementRequest(config, ({selectedSigningKey}) => ({
		nodeKey: nodeKeyParsed.data,
		requestId: requestIdParsed.data,
		Nonce: selectedSigningKey.nonce,
		Sig: '',
	}));
	if (!signed.ok) {
		return signed;
	}

	const posted = await managementPost<string>(
		config,
		'/newGroupRequestAgree',
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

export async function listValidGroupNodeSetsMcp(
	config: NodeSdkConfig,
): Promise<
	SdkResult<{
		selfNodeId: NodeId;
		configuredNodeIds: NodeId[];
		validPairs: NodeId[][];
	}>
> {
	const available = await listAvailableNodeIds(config);
	if (!available.ok) {
		return available;
	}
	const configuredNodeIds = normalizeNodeIdList(
		Object.values(available.data.nodeIdByIp),
	);
	const selfNodeId = available.data.selfNodeId;
	if (!configuredNodeIds.includes(selfNodeId)) {
		return {
			ok: false,
			reason: 'Originator node ID is not present in configured nodes.',
		};
	}
	const others = configuredNodeIds.filter(id => id !== selfNodeId);
	const validPairs: NodeId[][] = [];
	for (const other of others) {
		const pair = normalizeNodeIdList([selfNodeId, other]);
		if (!(await groupExistsForNodeIds(config, pair))) {
			validPairs.push(pair);
		}
	}
	return {ok: true, data: {selfNodeId, configuredNodeIds, validPairs}};
}

function buildAgreementChecks(
	localNodeId: NodeId,
	requests: McpGroupRequest[],
) {
	return requests.map(request => {
		const isOriginatorLocal = request.originator === localNodeId;
		return {
			requestId: request.RequestId,
			originator: request.originator,
			isOriginatorLocal,
			agreementRequired: !isOriginatorLocal,
			note: isOriginatorLocal
				? 'Originator is local node; agreement is not required.'
				: 'Originator is a different node; agreement is required.',
		};
	});
}

export async function listMcpGroupRequests(
	config: NodeSdkConfig,
	options: {
		filter?: Filter;
		pagenum?: number;
		pagesize?: number;
	} = {},
): Promise<
	SdkResult<{
		localNodeId: NodeId;
		requests: McpGroupRequest[];
		agreementChecks: ReturnType<typeof buildAgreementChecks>;
	}>
> {
	const filterParsed =
		options.filter === undefined
			? {success: true as const, data: 'all' as Filter}
			: FilterSchema.safeParse(options.filter);
	if (!filterParsed.success) {
		return {ok: false, reason: 'Invalid group request filter.'};
	}
	const path = buildManagementQueryPath('/listNewGroupRequests', {
		filter: filterParsed.data,
		pagenum:
			options.pagenum === undefined ? undefined : String(options.pagenum),
		pagesize:
			options.pagesize === undefined ? undefined : String(options.pagesize),
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return raw;
	}
	const rawRequests = Array.isArray(raw.data) ? raw.data : [];
	const requests: McpGroupRequest[] = [];
	for (const entry of rawRequests) {
		const parsed = normalizeGroupRequest(entry);
		if (parsed) {
			requests.push(parsed);
		}
	}
	const local = await managementGet<string>(config, '/getNodeKey');
	if (!local.ok) {
		return local;
	}
	const localParsed = NodeIdSchema.safeParse(local.data);
	if (!localParsed.success) {
		return {ok: false, reason: 'Node ID response failed validation.'};
	}
	return {
		ok: true,
		data: {
			localNodeId: localParsed.data,
			requests,
			agreementChecks: buildAgreementChecks(localParsed.data, requests),
		},
	};
}

async function fetchMcpGroupResultsRaw(
	config: NodeSdkConfig,
	params: Record<string, string | undefined>,
): Promise<McpGroupResult[]> {
	const path = buildManagementQueryPath('/listNewGroupResults', params);
	try {
		const data = await managementGet<unknown[]>(config, path);
		if (data.ok && Array.isArray(data.data)) {
			return data.data
				.map(entry => normalizeGroupResult(entry))
				.filter((entry): entry is McpGroupResult => entry !== undefined);
		}
	} catch {
		// fall through
	}

	const fallbackPath = buildManagementQueryPath('/listGroupResults', params);
	const fallback = await managementGet<unknown>(config, fallbackPath);
	if (!fallback.ok) {
		return [];
	}
	const groups =
		typeof fallback.data === 'object' &&
		fallback.data !== null &&
		Array.isArray((fallback.data as {groups?: unknown[]}).groups)
			? (fallback.data as {groups: unknown[]}).groups
			: [];
	return groups
		.map(entry => normalizeLegacyGroupListEntry(entry))
		.filter((entry): entry is McpGroupResult => entry !== undefined);
}

export async function listMcpGroupResults(
	config: NodeSdkConfig,
	options: {
		filter?: Filter;
		pagenum?: number;
		pagesize?: number;
	} = {},
): Promise<SdkResult<{results: McpGroupResult[]}>> {
	const params: Record<string, string | undefined> = {};
	if (options.filter !== undefined) {
		params.filter = options.filter;
	}
	if (options.pagenum !== undefined) {
		params.pagenum = String(options.pagenum);
	}
	if (options.pagesize !== undefined) {
		params.pagesize = String(options.pagesize);
	}
	const results = await fetchMcpGroupResultsRaw(config, params);
	return {ok: true, data: {results}};
}

export async function getMcpGroupRequestById(
	config: NodeSdkConfig,
	input: {id: string},
): Promise<
	SdkResult<{
		request: McpGroupRequest;
		localNodeId: NodeId;
		isOriginatorLocal: boolean;
		agreementRequired: boolean;
		note: string;
	}>
> {
	const idParsed = GroupRequestIdSchema.safeParse(input.id);
	if (!idParsed.success) {
		return {ok: false, reason: 'Invalid group request ID.'};
	}
	const path = buildManagementQueryPath('/getNewGroupRequestById', {
		id: idParsed.data,
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return raw;
	}
	const request = normalizeGroupRequest(raw.data);
	if (!request) {
		return {ok: false, reason: 'Group request response failed validation.'};
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
	return {
		ok: true,
		data: {
			request,
			localNodeId: localParsed.data,
			isOriginatorLocal,
			agreementRequired: !isOriginatorLocal,
			note: isOriginatorLocal
				? 'Originator is local node; agreement is not required.'
				: 'Originator is a different node; agreement is required.',
		},
	};
}

export async function getMcpGroupResultById(
	config: NodeSdkConfig,
	input: {id?: string; group_id?: string},
): Promise<SdkResult<McpGroupResult>> {
	const hasId = input.id !== undefined;
	const hasGroupId = input.group_id !== undefined;
	if (hasId === hasGroupId) {
		return {ok: false, reason: 'Provide exactly one of id or group_id.'};
	}
	const params: Record<string, string> = {};
	if (input.id !== undefined) {
		const parsed = GroupRequestIdSchema.safeParse(input.id);
		if (!parsed.success) {
			return {ok: false, reason: 'Invalid group request ID.'};
		}
		params.id = parsed.data;
	} else if (input.group_id !== undefined) {
		const parsed = GroupIdSchema.safeParse(input.group_id);
		if (!parsed.success) {
			return {ok: false, reason: 'Invalid group ID.'};
		}
		params.group_id = parsed.data;
	}
	const path = buildManagementQueryPath('/getNewGroupResultById', params);
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return raw;
	}
	const result = normalizeGroupResult(raw.data);
	if (!result) {
		return {ok: false, reason: 'Group result response failed validation.'};
	}
	return {ok: true, data: result};
}
