import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	addManagementSigner,
	createManagementSignerKeypair,
	getManagementSigner,
	getManagementSigners,
	getPreferredManagementSigner,
	hasEd25519ManagementSigner,
	listManagementSignersDetailed,
	setPreferredManagementSigner,
	DEFAULT_MANAGEMENT_SIGNING,
} from '../core/management-signer.js';
import {ManagementKeyEntrySchema} from '../core/schemas.js';
import {EdDSAPubKeySchema, NonceSchema, NodeIdSchema} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

export function registerManagementSignerTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('getManagementSigners'),
		{
			description: 'List allowed management signers configured on the node.',
			outputSchema: z.object({
				managementKeys: z.array(ManagementKeyEntrySchema),
			}),
		},
		async () => wrapSdk(getManagementSigners(config)),
	);

	server.registerTool(
		camelToSnake('hasManagementSigner'),
		{
			description: 'Check whether the node has an Ed25519 management signer configured.',
			outputSchema: z.object({hasEdDSAKey: z.boolean()}),
		},
		async () => wrapSdk(hasEd25519ManagementSigner(config)),
	);

	server.registerTool(
		camelToSnake('listManagementSignersDetailed'),
		{
			description:
				'List allowed management signers with local key availability details.',
			outputSchema: z.object({
				preferredSigner: z.string().optional(),
				keys: z.array(
					z.object({
						localFileName: z.string().optional(),
						kind: z.literal('EdDSA'),
						value: z.string(),
						nonce: z.number(),
						label: z.string().optional(),
						localPrivateKeyAvailable: z.boolean(),
						localPrivateKeyError: z.string().optional(),
					}),
				),
			}),
		},
		async () => wrapSdk(listManagementSignersDetailed(config)),
	);

	server.registerTool(
		camelToSnake('createManagementSignerKeypair'),
		{
			description:
				'Deprecated: generates a local keypair only (does not register on the node). Use add_management_signer instead — the node generates the key via POST /addManagementKey.',
			outputSchema: z.object({
				success: z.boolean(),
				fileName: z.string(),
				publicKey: EdDSAPubKeySchema,
				privateKeyPath: z.string(),
				publicKeyPath: z.string(),
			}),
		},
		async () => wrapSdk(createManagementSignerKeypair(config)),
	);

	server.registerTool(
		camelToSnake('addManagementSigner'),
		{
			description:
				'Add a new Ed25519 management signer on the node (server generates the key pair and writes /app/added_keys/added_key_<N>). Requires an existing signer (e.g. bootstrap) with a local private key.',
			outputSchema: z.object({
				success: z.boolean(),
				publicKey: EdDSAPubKeySchema,
				nodeKey: z.string(),
				keySlot: z.number().optional(),
				fileName: z.string().optional(),
				privateKeyPath: z.string().optional(),
				publicKeyPath: z.string().optional(),
			}),
		},
		async () => wrapSdk(addManagementSigner(config, DEFAULT_MANAGEMENT_SIGNING)),
	);

	server.registerTool(
		camelToSnake('setPreferredManagementSigner'),
		{
			description: 'Set the preferred management signer.',
			inputSchema: z.object({publicKey: EdDSAPubKeySchema}),
			outputSchema: z.object({ok: z.literal(true)}),
		},
		async ({publicKey}: {publicKey: string}) => {
			const result = await setPreferredManagementSigner(
				config,
				publicKey,
				DEFAULT_MANAGEMENT_SIGNING,
			);
			if (!result.ok) {
				return {
					content: [{type: 'text' as const, text: result.reason}],
					isError: true,
				};
			}
			return {
				content: [{type: 'text' as const, text: JSON.stringify({ok: true})}],
				structuredContent: {ok: true as const},
			};
		},
	);

	server.registerTool(
		camelToSnake('getPreferredManagementSigner'),
		{
			description: 'Get the preferred management signer public key.',
			outputSchema: z.object({publicKey: EdDSAPubKeySchema}),
		},
		async () => wrapSdk(getPreferredManagementSigner(config)),
	);

	server.registerTool(
		camelToSnake('getManagementSigner'),
		{
			description:
				'Get the preferred management signer with nonce and node key for signing.',
			outputSchema: z.object({
				publicKey: EdDSAPubKeySchema,
				nonce: NonceSchema,
				nodeKey: NodeIdSchema,
			}),
		},
		async () => wrapSdk(getManagementSigner(config)),
	);
}

/** @deprecated Use registerManagementSignerTools */
export const registerManagementKeyTools = registerManagementSignerTools;
