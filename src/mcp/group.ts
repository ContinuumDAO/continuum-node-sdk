import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	acceptGroupRequest,
	createGroupRequest,
	listGroupRequests,
	listGroupResults,
} from '../core/groups.js';
import {
	GroupRequestIdSchema,
	GroupRequestSchema,
	GroupResultSchema,
	NodeIdSchema,
	FilterSchema,
} from '../core/types.js';
import {SelectedSigningKeySchema} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

export function registerGroupTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('listGroupRequests'),
		{
			description: 'List MPC group requests with an optional filter.',
			inputSchema: z.object({filter: FilterSchema.optional()}),
			outputSchema: z.object({groupRequests: z.array(GroupRequestSchema)}),
		},
		async ({filter}: {filter?: z.infer<typeof FilterSchema>}) =>
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
}
