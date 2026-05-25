import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	addManagementSigner,
	createManagementSignerKeypair,
	getPreferredManagementSigner,
	hasManagementSigner,
	listManagementSigners,
	listManagementSignersDetailed,
	setPreferredManagementSigner,
} from '../detops/management-signer.js';
import {ManagementKeyEntrySchema} from '../detops/schemas.js';
import {EdDSAPubKeySchema, NonceSchema, NodeIdSchema} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

export function registerManagementSignerTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('listManagementSigners'),
		{
			description: 'List allowed management signers configured on the node.',
			outputSchema: z.object({
				managementKeys: z.array(ManagementKeyEntrySchema),
			}),
		},
		async () => wrapSdk(listManagementSigners(config)),
	);

	server.registerTool(
		camelToSnake('hasManagementSigner'),
		{
			description: 'Check whether the node has a management signer configured.',
			outputSchema: z.object({hasEdDSAKey: z.boolean()}),
		},
		async () => wrapSdk(hasManagementSigner(config)),
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
			description: 'Generate a new local management signer keypair.',
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
			description: 'Add a new management signer public key to the node.',
			inputSchema: z.object({newPublicKey: z.string()}),
			outputSchema: z.object({
				success: z.boolean(),
				publicKey: EdDSAPubKeySchema,
				nodeKey: z.string(),
			}),
		},
		async ({newPublicKey}: {newPublicKey: string}) =>
			wrapSdk(addManagementSigner(config, {newPublicKey})),
	);

	server.registerTool(
		camelToSnake('setPreferredManagementSigner'),
		{
			description: 'Set the preferred management signer.',
			inputSchema: z.object({publicKeyHex: EdDSAPubKeySchema}),
			outputSchema: z.object({
				success: z.boolean(),
				publicKeyHex: EdDSAPubKeySchema,
				signerPublicKey: z.string(),
				nodeKey: z.string(),
				Nonce: NonceSchema,
				signedMessage: z.string(),
				clientSig: z.string(),
				fileName: z.string(),
			}),
		},
		async ({publicKeyHex}: {publicKeyHex: string}) =>
			wrapSdk(setPreferredManagementSigner(config, {publicKeyHex})),
	);

	server.registerTool(
		camelToSnake('getPreferredManagementSigner'),
		{
			description: 'Get the currently preferred management signer.',
			outputSchema: z.object({
				publicKey: EdDSAPubKeySchema,
				nonce: NonceSchema,
				nodeKey: NodeIdSchema,
			}),
		},
		async () => wrapSdk(getPreferredManagementSigner(config)),
	);
}

/** @deprecated Use registerManagementSignerTools */
export const registerManagementKeyTools = registerManagementSignerTools;
