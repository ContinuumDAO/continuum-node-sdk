import type {NodeSdkConfig} from '../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../api/management-api.js';
import {nodeId} from './general.js';
import type {SdkResult} from './result.js';
import {
	GroupRequestsResponseSchema,
	GroupResultsResponseSchema,
} from './schemas.js';
import {
	FilterSchema,
	GroupRequestSchema,
	GroupResultSchema,
	NodeIdSchema,
	type FilterType,
	type GroupRequest,
	type GroupResult,
	type NodeId,
} from './types.js';
import {clarifyGroupRequestLookupError, parseGroupRequestId} from './group-request-id.js';
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
import {z} from 'zod';

type ConfiguredNodesApiData = {
	nodes?: Array<{
		address?: string;
		available?: boolean;
		publicKey?: string;
	}>;
};

export async function availableNodeIds(
	config: NodeSdkConfig,
): Promise<SdkResult<{nodeIps: string[]; nodeIds: string[]}>> {
	const result = await managementGet<ConfiguredNodesApiData>(
		config,
		'/getConfiguredNodeKeys',
	);
	if (!result.ok) {
		return result;
	}

	const nodeIps: string[] = [];
	const nodeIds: string[] = [];

	for (const node of result.data.nodes ?? []) {
		const parsed = NodeIdSchema.safeParse(node.publicKey);
		if (!parsed.success) {
			continue;
		}

		nodeIps.push(node.address ?? '');
		nodeIds.push(parsed.data);
	}

	return {ok: true, data: {nodeIps, nodeIds}};
}

function combinationsIncluding(
	nodeIds: readonly string[],
	required: string,
	minSize: number,
): string[][] {
	const others = nodeIds.filter(id => id !== required);
	const results: string[][] = [];

	const visit = (start: number, picked: string[]): void => {
		if (picked.length >= minSize) {
			results.push([...picked].sort());
		}

		for (let index = start; index < others.length; index += 1) {
			visit(index + 1, [...picked, others[index]!]);
		}
	};

	visit(0, [required]);
	return results;
}

export async function validGroupNodeSets(
	config: NodeSdkConfig,
): Promise<SdkResult<{nodeSets: string[][]}>> {
	const [clientNode, configured] = await Promise.all([
		nodeId(config),
		availableNodeIds(config),
	]);
	if (!clientNode.ok) {
		return clientNode;
	}

	if (!configured.ok) {
		return configured;
	}

	const allowed = new Set(configured.data.nodeIds);
	allowed.add(clientNode.data.nodeId);
	const nodeSets = combinationsIncluding(
		[...allowed],
		clientNode.data.nodeId,
		2,
	);

	if (nodeSets.length === 0) {
		return {
			ok: false,
			reason: 'No valid group node sets (need at least two configured nodes).',
		};
	}

	return {ok: true, data: {nodeSets}};
}

export async function listGroupRequests(
	config: NodeSdkConfig,
	filter: FilterType = 'all',
): Promise<SdkResult<{groupRequests: GroupRequest[]}>> {
	const parsedFilter = FilterSchema.safeParse(filter);
	if (!parsedFilter.success) {
		return {ok: false, reason: 'Invalid group request filter.'};
	}

	const path = buildManagementQueryPath('/listNewGroupRequests', {
		filter: parsedFilter.data,
		pagesize: '100',
	});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}

	const rawRequests = Array.isArray(result.data) ? result.data : [];
	const groupRequestsList: GroupRequest[] = [];

	for (const entry of rawRequests) {
		const parsed = GroupRequestSchema.safeParse(entry);
		if (parsed.success) {
			groupRequestsList.push(parsed.data);
		}
	}

	const validated = GroupRequestsResponseSchema.safeParse({
		groupRequests: groupRequestsList,
	});
	if (!validated.success) {
		return {ok: false, reason: 'Group requests response failed validation.'};
	}

	return {ok: true, data: validated.data};
}

type ListGroupResultsApiData = {
	groups?: Array<{groupId?: string; nodeKeys?: string[]}>;
};

export async function listGroupResults(
	config: NodeSdkConfig,
): Promise<SdkResult<{groups: GroupResult[]}>> {
	const result = await managementGet<ListGroupResultsApiData>(
		config,
		'/listGroupResults',
	);
	if (!result.ok) {
		return result;
	}

	const groups: GroupResult[] = [];
	for (const entry of result.data.groups ?? []) {
		const parsed = GroupResultSchema.safeParse(entry);
		if (parsed.success) {
			groups.push(parsed.data);
		}
	}

	const validated = GroupResultsResponseSchema.safeParse({groups});
	if (!validated.success) {
		return {ok: false, reason: 'Group results response failed validation.'};
	}

	return {ok: true, data: validated.data};
}

function normalizeNodeIdList(nodeIds: readonly NodeId[]): NodeId[] {
	return Array.from(new Set(nodeIds)).sort();
}

function isSameNodeSet(left: NodeId[], right: NodeId[]): boolean {
	const leftNormalized = normalizeNodeIdList(left);
	const rightNormalized = normalizeNodeIdList(right);
	if (leftNormalized.length !== rightNormalized.length) {
		return false;
	}
	return leftNormalized.every((value, index) => value === rightNormalized[index]);
}

async function groupExistsForNodeIds(
	config: NodeSdkConfig,
	nodeIds: NodeId[],
): Promise<boolean> {
	const results = await listGroupResults(config);
	if (!results.ok) {
		return false;
	}
	return results.data.groups.some(group => isSameNodeSet(group.nodeKeys, nodeIds));
}

export async function buildCreateGroupRequest(
	config: NodeSdkConfig,
	input: {nodeIds: NodeId[]},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const nodeIdsParsed = z.array(NodeIdSchema).min(2).safeParse(input.nodeIds);
	if (!nodeIdsParsed.success) {
		return {ok: false, reason: 'Invalid nodeIds input.'};
	}

	const [self, configured] = await Promise.all([
		nodeId(config),
		availableNodeIds(config),
	]);
	if (!self.ok) {
		return self;
	}
	if (!configured.ok) {
		return configured;
	}

	const allowed = new Set(configured.data.nodeIds);
	allowed.add(self.data.nodeId);
	const keyList = normalizeNodeIdList(nodeIdsParsed.data);
	const invalid = keyList.filter(id => !allowed.has(id));
	if (invalid.length > 0) {
		return {
			ok: false,
			reason: 'nodeIds contains values not present in configured nodes.',
		};
	}
	if (!keyList.includes(self.data.nodeId)) {
		return {
			ok: false,
			reason: 'Selected nodeIds must include the originator node ID.',
		};
	}
	if (await groupExistsForNodeIds(config, keyList)) {
		return {ok: false, reason: 'A group with this exact node set already exists.'};
	}

	return buildManagementPostRequest(
		config,
		{
			path: '/newGroupRequest',
			buildRequestFields: () => ({
				keyList,
				BrokerArray: [],
			}),
		},
		signing,
	);
}

export async function createGroupRequest(
	config: NodeSdkConfig,
	input: {nodeIds: NodeId[]},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		groupRequestId: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const built = await buildCreateGroupRequest(config, input, signing);
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

	const requestIdParsed = parseGroupRequestId(posted.data);
	return {
		ok: true,
		data: {
			groupRequestId: requestIdParsed.ok ? requestIdParsed.data : posted.data,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigningKey(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildAcceptGroupRequest(
	config: NodeSdkConfig,
	input: {requestId: string},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const requestId = parseGroupRequestId(input.requestId);
	if (!requestId.ok) return requestId;

	const path = buildManagementQueryPath('/getNewGroupRequestById', {
		id: requestId.data,
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) {
		return {ok: false, reason: clarifyGroupRequestLookupError(raw.reason)};
	}

	const requestParsed = GroupRequestSchema.safeParse(raw.data);
	if (!requestParsed.success) {
		return {ok: false, reason: 'Group request response failed validation.'};
	}
	if (requestParsed.data.status !== 'pending') {
		return {ok: false, reason: 'Group request is not pending.'};
	}

	return buildManagementPostRequest(
		config,
		{
			path: '/newGroupRequestAgree',
			buildRequestFields: () => ({
				requestId: requestId.data,
			}),
		},
		signing,
	);
}

export async function acceptGroupRequest(
	config: NodeSdkConfig,
	input: {requestId: string},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const built = await buildAcceptGroupRequest(config, input, signing);
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
