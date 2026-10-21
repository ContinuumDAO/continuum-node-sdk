import type { McpServer } from "@modelcontextprotocol/server";
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
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('getAddressBookRegistry'),
		{
			description:
				'Get known addresses from the address book registry. Contact names can be passed as toContactName on transfer_erc20, transfer_native_gas, and transfer_erc721 instead of copying addresses manually. Ethereum contacts that are not contracts may include railgunAddress, the contact 0zk used by ctm_railgun_private_transfer.',
			inputSchema: GetKnownAddressesQuerySchema,
			outputSchema: GetKnownAddressesDataSchema,
		},
		async (query: z.infer<typeof GetKnownAddressesQuerySchema>) =>
			wrapSdk(getAddressBookRegistry(config, query)),
	);

	server.registerTool(
		camelToSnake('addToAddressBookRegistry'),
		{
			description:
				'Add or update an address book contact. For an Ethereum contact that is not a contract, railgunAddress stores that contact’s 0zk address. Pass an empty string to clear it. Omit it to leave a stored 0zk unchanged. Contract and non-Ethereum contacts cannot have a 0zk address.',
			inputSchema: z.object({
				chainType: z.string().min(1),
				address: z.string().min(1),
				name: z.string().optional(),
				chainIds: z.array(z.string()).optional(),
				isContract: z.boolean().optional(),
				railgunAddress: z
					.string()
					.optional()
					.describe('Contact 0zk address. Ethereum non-contract contacts only. Empty string clears it.'),
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
			railgunAddress?: string;
		}) => wrapSdk(addToAddressBookRegistry(config, input)),
	);

	server.registerTool(
		camelToSnake('removeFromAddressBookRegistry'),
		{
			description:
				'Remove an address book contact, including its Ethereum address and any stored 0zk address. To clear only the 0zk, call add_to_address_book_registry with railgunAddress set to an empty string.',
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
