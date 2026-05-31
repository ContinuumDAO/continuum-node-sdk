import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	addToChainRegistry,
	getChainRegistry,
	removeFromChainRegistry,
} from '../../core/registry/networks.js';
import {
	AddChainRegistryInputSchema,
	GetChainRegistryDataSchema,
	GetChainRegistryQuerySchema,
	SelectedSigningKeySchema,
} from '../../schemas/extended.js';
import {camelToSnake, wrapSdk} from '../tool-utils.js';

export function registerChainRegistryTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('getChainRegistry'),
		{
			description: 'Get chain registry entries.',
			inputSchema: GetChainRegistryQuerySchema,
			outputSchema: GetChainRegistryDataSchema,
		},
		async (query: z.infer<typeof GetChainRegistryQuerySchema>) =>
			wrapSdk(getChainRegistry(config, query)),
	);

	server.registerTool(
		camelToSnake('addToChainRegistry'),
		{
			description:
				'Add chain details to the chain registry. rpcGateway (RPC URL) is required and must be supplied by the user — do not guess or infer an RPC URL.',
			inputSchema: AddChainRegistryInputSchema,
			outputSchema: z.object({
				message: z.string(),
				selectedSigningKey: SelectedSigningKeySchema,
				signingMessage: z.string(),
			}),
		},
		async (input: z.infer<typeof AddChainRegistryInputSchema>) =>
			wrapSdk(addToChainRegistry(config, input)),
	);

	server.registerTool(
		camelToSnake('removeFromChainRegistry'),
		{
			description: 'Remove chain details from the chain registry.',
			inputSchema: z.object({
				chainId: z.union([z.string().min(1), z.number().int().nonnegative()]),
			}),
			outputSchema: z.object({
				message: z.string(),
				selectedSigningKey: SelectedSigningKeySchema,
				signingMessage: z.string(),
			}),
		},
		async ({chainId}: {chainId: string | number}) =>
			wrapSdk(removeFromChainRegistry(config, {chainId})),
	);
}
