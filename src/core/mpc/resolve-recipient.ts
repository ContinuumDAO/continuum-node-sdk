import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {getAddressBookRegistry} from '../registry/address-book.js';

export type TransferRecipientInput = {
	readonly toAddress?: string;
	readonly toContactName?: string;
	readonly chainId?: number;
	readonly chainType?: string;
};

export async function resolveTransferRecipient(
	config: NodeSdkConfig,
	input: TransferRecipientInput,
): Promise<SdkResult<string>> {
	if (input.toAddress != null && input.toAddress.length > 0) {
		return {ok: true, data: input.toAddress};
	}

	const contactName = input.toContactName?.trim();
	if (!contactName) {
		return {ok: false, reason: 'Provide toAddress or toContactName.'};
	}

	const chainType = (input.chainType ?? 'ethereum').trim().toLowerCase();
	const registry = await getAddressBookRegistry(config, {chain_type: chainType});
	if (!registry.ok) {
		return registry;
	}

	const entries = registry.data[chainType] ?? [];
	const normalizedQuery = contactName.toLowerCase();
	const chainIdStr = input.chainId != null ? String(input.chainId) : undefined;

	const matches = entries.filter(entry => {
		const name = (entry.name ?? '').trim();
		if (name.toLowerCase() !== normalizedQuery) {
			return false;
		}
		if (chainIdStr != null && entry.chainIds.length > 0) {
			return entry.chainIds.includes(chainIdStr);
		}
		return true;
	});

	if (matches.length === 0) {
		return {
			ok: false,
			reason:
				`No address book contact named "${contactName}" found for chain type ${chainType}. ` +
				'Call get_address_book_registry to list contacts.',
		};
	}
	if (matches.length > 1) {
		return {
			ok: false,
			reason:
				`Multiple address book contacts named "${contactName}" found. ` +
				'Use toAddress with the exact address instead.',
		};
	}

	return {ok: true, data: matches[0].address};
}
