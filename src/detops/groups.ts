import type {NodeSdkConfig} from '../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
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
} from './types.js';

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
