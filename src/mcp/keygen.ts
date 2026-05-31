import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	acceptKeyGenRequest,
	createKeyGenRequest,
	fetchGlobalNonceByKeyGenId,
	fetchKeyGenResult,
	getKeyGenParentGroupId,
	getKeyGenRequestById,
	getPreferredKeyGen,
	keyGenFilterSchema,
	listKeyGenRequests,
	postPreferredKeyGen,
	type KeyGenFilter,
} from '../core/keygen.js';
import {
	GroupIdSchema,
	KeyGenIdSchema,
	KeyGenRequestSchema,
	KeyTypeSchema,
	MsgCheckSchema,
	NodeIdSchema,
	PostPreferredKeyGenInputSchema,
	PreferredKeyGenStatusSchema,
	SelectedSigningKeySchema,
	type GroupId,
	type Key,
	type KeyGenId,
	type MsgCheck,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

const POST_PREFERRED_KEY_GEN_OUTPUT_SCHEMA = z
	.object({
		message: z.string(),
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

export function registerKeyGenTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('createKeyGenRequest'),
		{
			description:
				'Initiate a request to members of a group to generate a new MPC key pair. `gate` is the signing threshold: the minimum number of group members that must participate to sign (CGGMP24/FROST).',
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
		}) => wrapSdk(createKeyGenRequest(config, input)),
	);

	server.registerTool(
		camelToSnake('acceptKeyGenRequest'),
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
			wrapSdk(acceptKeyGenRequest(config, {requestId})),
	);

	server.registerTool(
		camelToSnake('listKeyGenRequests'),
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
		}) => wrapSdk(listKeyGenRequests(config, input)),
	);

	server.registerTool(
		camelToSnake('getKeyGenRequestById'),
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
			wrapSdk(getKeyGenRequestById(config, {id})),
	);

	server.registerTool(
		camelToSnake('fetchKeyGenResult'),
		{
			description: 'Get a single MPC key generation result by request ID.',
			inputSchema: z.object({id: KeyGenIdSchema}),
			outputSchema: z.record(z.string(), z.unknown()),
		},
		async ({id}: {id: string}) => wrapSdk(fetchKeyGenResult(config, id)),
	);

	server.registerTool(
		camelToSnake('getKeyGenParentGroupId'),
		{
			description: 'Get the parent group ID for a key generation request.',
			inputSchema: z.object({id: KeyGenIdSchema}),
			outputSchema: z.object({
				requestid: z.string(),
				groupId: GroupIdSchema,
			}),
		},
		async ({id}: {id: string}) =>
			wrapSdk(getKeyGenParentGroupId(config, {id})),
	);

	server.registerTool(
		camelToSnake('fetchGlobalNonceByKeyGenId'),
		{
			description: 'Get the global nonce for a key generation request.',
			inputSchema: z.object({id: KeyGenIdSchema}),
			outputSchema: z.object({globalNonce: z.number()}),
		},
		async ({id}: {id: string}) => {
			const result = await fetchGlobalNonceByKeyGenId(config, id);
			if (!result.ok) {
				return {
					content: [{type: 'text' as const, text: result.reason}],
					isError: true,
				};
			}
			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify({globalNonce: result.data}),
					},
				],
				structuredContent: {globalNonce: result.data},
			};
		},
	);

	server.registerTool(
		camelToSnake('getPreferredKeyGen'),
		{
			description:
				'Get the default multi-agree KeyGen for agent POST /multiSignRequest (GET /getPreferredKeyGen). Returns keyGenId, pubKey, and keyType while the stored KeyGen is still eligible; empty strings when nothing is stored or the KeyGen is no longer valid.',
			inputSchema: z.object({}).strict(),
			outputSchema: PreferredKeyGenStatusSchema,
		},
		async () => wrapSdk(getPreferredKeyGen(config)),
	);

	server.registerTool(
		camelToSnake('postPreferredKeyGen'),
		{
			description:
				'Store a multi-agree KeyGen request id as the agent default for composing multiSignRequest payloads (POST /postPreferredKeyGen, management-signed). The KeyGen must have msgCheck multi-agree, a non-ejected result with a public key, and exist on this node.',
			inputSchema: PostPreferredKeyGenInputSchema,
			outputSchema: POST_PREFERRED_KEY_GEN_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof PostPreferredKeyGenInputSchema>) =>
			wrapSdk(postPreferredKeyGen(config, input)),
	);
}

/** @deprecated Use registerKeyGenTools */
export const registerKeygenTools = registerKeyGenTools;
