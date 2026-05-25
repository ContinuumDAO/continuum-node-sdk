import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	acceptMpcKeygenRequest,
	createMpcKeygenRequest,
	getMpcKeygenNonce,
	getMpcKeygenParentGroupId,
	getMpcKeygenRequestById,
	getMpcKeygenResultById,
	keyGenFilterSchema,
	listMpcKeygenRequests,
	type KeyGenFilter,
} from '../detops/keygen.js';
import {
	GroupIdSchema,
	KeyGenIdSchema,
	KeyGenRequestSchema,
	KeyGenResultSchema,
	KeyTypeSchema,
	MsgCheckSchema,
	NodeIdSchema,
	SelectedSigningKeySchema,
	type GroupId,
	type Key,
	type KeyGenId,
	type MsgCheck,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

export function registerKeygenTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('createMpcKeygenRequest'),
		{
			description:
				'Initiate a request to members of a group to generate a new MPC key pair.',
			inputSchema: z.object({
				groupId: GroupIdSchema,
				gate: z.number().int().min(2),
				msgCheck: MsgCheckSchema,
				keyType: KeyTypeSchema,
			}),
			outputSchema: z.object({
				requestId: KeyGenIdSchema,
				selectedSigningKey: SelectedSigningKeySchema,
				signingMessage: z.string(),
			}),
		},
		async (input: {
			groupId: GroupId;
			gate: number;
			msgCheck: MsgCheck;
			keyType: Key;
		}) => wrapSdk(createMpcKeygenRequest(config, input)),
	);

	server.registerTool(
		camelToSnake('acceptMpcKeygenRequest'),
		{
			description: 'Accept a pending MPC key generation request.',
			inputSchema: z.object({requestId: KeyGenIdSchema}),
			outputSchema: z.object({
				message: z.string(),
				selectedSigningKey: SelectedSigningKeySchema,
				signingMessage: z.string(),
			}),
		},
		async ({requestId}: {requestId: string}) =>
			wrapSdk(acceptMpcKeygenRequest(config, {requestId})),
	);

	server.registerTool(
		camelToSnake('listMpcKeygenRequests'),
		{
			description:
				'List MPC key generation requests with optional filter and pagination.',
			inputSchema: z.object({
				filter: keyGenFilterSchema.optional(),
				pagenum: z.number().int().nonnegative().optional(),
				pagesize: z.number().int().positive().optional(),
			}),
			outputSchema: z.object({
				localNodeId: NodeIdSchema,
				requests: z.array(KeyGenRequestSchema),
				agreementChecks: z.array(
					z.object({
						requestId: KeyGenIdSchema,
						originator: NodeIdSchema.optional(),
						isOriginatorLocal: z.boolean(),
						agreementRequired: z.boolean(),
						note: z.string(),
					}),
				),
			}),
		},
		async (input: {
			filter?: KeyGenFilter;
			pagenum?: number;
			pagesize?: number;
		}) => wrapSdk(listMpcKeygenRequests(config, input)),
	);

	server.registerTool(
		camelToSnake('getMpcKeygenRequestById'),
		{
			description: 'Get a single MPC key generation request by ID.',
			inputSchema: z.object({id: KeyGenIdSchema}),
			outputSchema: z.object({
				request: KeyGenRequestSchema,
				localNodeId: NodeIdSchema,
				isOriginatorLocal: z.boolean(),
				agreementRequired: z.boolean(),
				note: z.string(),
			}),
		},
		async ({id}: {id: string}) =>
			wrapSdk(getMpcKeygenRequestById(config, {id})),
	);

	server.registerTool(
		camelToSnake('getMpcKeygenResultById'),
		{
			description: 'Get a single MPC key generation result by request ID.',
			inputSchema: z.object({id: KeyGenIdSchema}),
			outputSchema: KeyGenResultSchema,
		},
		async ({id}: {id: string}) =>
			wrapSdk(getMpcKeygenResultById(config, {id})),
	);

	server.registerTool(
		camelToSnake('getMpcKeygenParentGroupId'),
		{
			description: 'Get the parent group ID for a key generation request.',
			inputSchema: z.object({id: KeyGenIdSchema}),
			outputSchema: z.object({
				requestid: z.string(),
				groupId: GroupIdSchema,
			}),
		},
		async ({id}: {id: string}) =>
			wrapSdk(getMpcKeygenParentGroupId(config, {id})),
	);

	server.registerTool(
		camelToSnake('getMpcKeygenNonce'),
		{
			description: 'Get the global nonce for a key generation request.',
			inputSchema: z.object({id: KeyGenIdSchema}),
			outputSchema: z.object({globalNonce: z.number()}),
		},
		async ({id}: {id: string}) => wrapSdk(getMpcKeygenNonce(config, {id})),
	);
}
