import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	addToAddressBookRegistry,
	getAddressBookRegistry,
	removeFromAddressBookRegistry,
} from '../../core/registry/address-book.js';
import {
	GetKnownAddressesDataSchema,
	GetKnownAddressesQuerySchema,
	SelectedSigningKeySchema,
} from '../../schemas/extended.js';
import {camelToSnake, wrapSdk} from '../tool-utils.js';

export function registerAddressBookTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('getAddressBookRegistry'),
		{
			description: 'Get known addresses from the address book registry.',
			inputSchema: GetKnownAddressesQuerySchema,
			outputSchema: GetKnownAddressesDataSchema,
		},
		async (query: z.infer<typeof GetKnownAddressesQuerySchema>) =>
			wrapSdk(getAddressBookRegistry(config, query)),
	);

	server.registerTool(
		camelToSnake('addToAddressBookRegistry'),
		{
			description: 'Add an address to the address book registry.',
			inputSchema: z.object({
				chainType: z.string().min(1),
				address: z.string().min(1),
				name: z.string().optional(),
				chainIds: z.array(z.string()).optional(),
				isContract: z.boolean().optional(),
			}),
			outputSchema: z.object({
				message: z.string(),
				selectedSigningKey: SelectedSigningKeySchema,
				signingMessage: z.string(),
			}),
		},
		async (input: {
			chainType: string;
			address: string;
			name?: string;
			chainIds?: string[];
			isContract?: boolean;
		}) => wrapSdk(addToAddressBookRegistry(config, input)),
	);

	server.registerTool(
		camelToSnake('removeFromAddressBookRegistry'),
		{
			description: 'Remove an address from the address book registry.',
			inputSchema: z.object({
				chainType: z.string().min(1),
				address: z.string().min(1),
			}),
			outputSchema: z.object({
				message: z.string(),
				selectedSigningKey: SelectedSigningKeySchema,
				signingMessage: z.string(),
			}),
		},
		async (input: {chainType: string; address: string}) =>
			wrapSdk(removeFromAddressBookRegistry(config, input)),
	);
}
