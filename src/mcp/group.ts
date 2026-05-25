import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	acceptGroupRequest,
	createGroupRequest,
	getMcpGroupRequestById,
	getMcpGroupResultById,
	listAvailableNodeIds,
	listMcpGroupRequests,
	listMcpGroupResults,
	listValidGroupNodeSetsMcp,
} from '../detops/group-actions.js';
import {listGroupRequests, listGroupResults} from '../detops/groups.js';
import {GroupRequestSchema, GroupResultSchema, FilterSchema as DetOpsFilterSchema} from '../detops/types.js';
import {
	FilterSchema,
	GroupIdSchema,
	GroupRequestIdSchema,
	McpGroupRequestSchema,
	McpGroupResultSchema,
	NodeIdSchema,
	SelectedSigningKeySchema,
	type Filter,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

export function registerGroupTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('listGroupRequests'),
		{
			description: 'List MPC group requests with an optional filter.',
			inputSchema: z.object({filter: DetOpsFilterSchema.optional()}),
			outputSchema: z.object({groupRequests: z.array(GroupRequestSchema)}),
		},
		async ({filter}: {filter?: z.infer<typeof DetOpsFilterSchema>}) =>
			wrapSdk(listGroupRequests(config, filter)),
	);

	server.registerTool(
		camelToSnake('listGroupResults'),
		{
			description: 'List completed MPC group results.',
			outputSchema: z.object({groups: z.array(GroupResultSchema)}),
		},
		async () => wrapSdk(listGroupResults(config)),
	);

	server.registerTool(
		camelToSnake('listAvailableNodeIds'),
		{
			description:
				'List configured node IDs available for group selection, with index and self marker.',
			outputSchema: z.object({
				selfNodeId: NodeIdSchema,
				nodes: z.array(
					z.object({
						index: z.number().int().positive(),
						ip: z.string(),
						nodeId: NodeIdSchema,
						isSelf: z.boolean(),
					}),
				),
				nodeIdByIp: z.record(z.string(), NodeIdSchema),
			}),
		},
		async () => wrapSdk(listAvailableNodeIds(config)),
	);

	server.registerTool(
		camelToSnake('createGroupRequest'),
		{
			description: 'Create a new MPC group request for the given node IDs.',
			inputSchema: z.object({nodeIds: z.array(NodeIdSchema).min(2)}),
			outputSchema: z.object({
				groupRequestId: z.string(),
				selectedSigningKey: SelectedSigningKeySchema,
				signingMessage: z.string(),
			}),
		},
		async ({nodeIds}: {nodeIds: string[]}) =>
			wrapSdk(createGroupRequest(config, {nodeIds})),
	);

	server.registerTool(
		camelToSnake('acceptGroupRequest'),
		{
			description: 'Accept a pending MPC group request.',
			inputSchema: z.object({requestId: GroupRequestIdSchema}),
			outputSchema: z.object({
				message: z.string(),
				selectedSigningKey: SelectedSigningKeySchema,
				signingMessage: z.string(),
			}),
		},
		async ({requestId}: {requestId: string}) =>
			wrapSdk(acceptGroupRequest(config, {requestId})),
	);

	server.registerTool(
		camelToSnake('listValidGroupNodeSetsMcp'),
		{
			description:
				'List valid two-node group sets that do not already exist for the originator.',
			outputSchema: z.object({
				selfNodeId: NodeIdSchema,
				configuredNodeIds: z.array(NodeIdSchema),
				validPairs: z.array(z.array(NodeIdSchema)),
			}),
		},
		async () => wrapSdk(listValidGroupNodeSetsMcp(config)),
	);

	server.registerTool(
		camelToSnake('listMcpGroupRequests'),
		{
			description: 'List MPC group requests with optional filter and pagination.',
			inputSchema: z.object({
				filter: FilterSchema.optional(),
				pagenum: z.number().int().nonnegative().optional(),
				pagesize: z.number().int().positive().optional(),
			}),
			outputSchema: z.object({
				localNodeId: NodeIdSchema,
				requests: z.array(McpGroupRequestSchema),
				agreementChecks: z.array(
					z.object({
						requestId: GroupRequestIdSchema,
						originator: NodeIdSchema.optional(),
						isOriginatorLocal: z.boolean(),
						agreementRequired: z.boolean(),
						note: z.string(),
					}),
				),
			}),
		},
		async (input: {
			filter?: Filter;
			pagenum?: number;
			pagesize?: number;
		}) => wrapSdk(listMcpGroupRequests(config, input)),
	);

	server.registerTool(
		camelToSnake('listMcpGroupResults'),
		{
			description: 'List MPC group results with optional filter and pagination.',
			inputSchema: z.object({
				filter: FilterSchema.optional(),
				pagenum: z.number().int().nonnegative().optional(),
				pagesize: z.number().int().positive().optional(),
			}),
			outputSchema: z.object({results: z.array(McpGroupResultSchema)}),
		},
		async (input: {
			filter?: Filter;
			pagenum?: number;
			pagesize?: number;
		}) => wrapSdk(listMcpGroupResults(config, input)),
	);

	server.registerTool(
		camelToSnake('getMcpGroupRequestById'),
		{
			description: 'Get a single MPC group request by ID.',
			inputSchema: z.object({id: GroupRequestIdSchema}),
			outputSchema: z.object({
				request: McpGroupRequestSchema,
				localNodeId: NodeIdSchema,
				isOriginatorLocal: z.boolean(),
				agreementRequired: z.boolean(),
				note: z.string(),
			}),
		},
		async ({id}: {id: string}) =>
			wrapSdk(getMcpGroupRequestById(config, {id})),
	);

	server.registerTool(
		camelToSnake('getMcpGroupResultById'),
		{
			description: 'Get a single MPC group result by request ID or group ID.',
			inputSchema: z
				.object({
					id: GroupRequestIdSchema.optional(),
					group_id: GroupIdSchema.optional(),
				})
				.refine(
					data =>
						(data.id !== undefined) !== (data.group_id !== undefined),
					'Provide exactly one of id or group_id.',
				),
			outputSchema: McpGroupResultSchema,
		},
		async (input: {id?: string; group_id?: string}) =>
			wrapSdk(getMcpGroupResultById(config, input)),
	);
}
