import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	addToTokenRegistry,
	getTokenRegistry,
	removeFromTokenRegistry,
} from '../../core/registry/tokens.js';
import {
	AddToTokenRegistryInputSchema,
	GetTokenRegistryDataSchema,
	GetTokenRegistryQuerySchema,
	SelectedSigningKeySchema,
	TokenTypeSchema,
} from '../../schemas/extended.js';
import {camelToSnake, wrapSdk} from '../tool-utils.js';

export function registerTokenRegistryTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('getTokenRegistry'),
		{
			description: 'Get token registry entries.',
			inputSchema: GetTokenRegistryQuerySchema,
			outputSchema: GetTokenRegistryDataSchema,
		},
		async (query: z.infer<typeof GetTokenRegistryQuerySchema>) =>
			wrapSdk(getTokenRegistry(config, query)),
	);

	server.registerTool(
		camelToSnake('addToTokenRegistry'),
		{
			description:
				'Add a token to the token registry. Requires chainType, chainId, tokenType, and contract with contractAddress, name, symbol, symbolURL, and decimals.',
			inputSchema: AddToTokenRegistryInputSchema,
			outputSchema: z.object({
				message: z.string(),
				selectedSigningKey: SelectedSigningKeySchema,
				signingMessage: z.string(),
			}),
		},
		async (input: z.infer<typeof AddToTokenRegistryInputSchema>) =>
			wrapSdk(addToTokenRegistry(config, input)),
	);

	server.registerTool(
		camelToSnake('removeFromTokenRegistry'),
		{
			description: 'Remove a token from the token registry.',
			inputSchema: z.object({
				chainType: z.string().min(1),
				chainId: z.union([z.string().min(1), z.number().int().nonnegative()]),
				tokenType: TokenTypeSchema,
				contractAddress: z.string().min(1),
				tokenId: z.string().optional(),
			}),
			outputSchema: z.object({
				message: z.string(),
				selectedSigningKey: SelectedSigningKeySchema,
				signingMessage: z.string(),
			}),
		},
		async (input: {
			chainType: string;
			chainId: string | number;
			tokenType: z.infer<typeof TokenTypeSchema>;
			contractAddress: string;
			tokenId?: string;
		}) => wrapSdk(removeFromTokenRegistry(config, input)),
	);
}
