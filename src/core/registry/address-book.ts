import type {NodeSdkConfig} from '../../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import type {SdkResult} from '../result.js';
import {
	ADDRESS_BOOK_REGISTRY_API_PATHS,
	DEFAULT_MANAGEMENT_SIGNING,
	GetKnownAddressesDataSchema,
	GetKnownAddressesQuerySchema,
	type GetKnownAddressesData,
	type GetKnownAddressesQuery,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import {normalizeKnownAddressForChain} from '../../internal/normalize.js';
import {
	buildManagementPostRequest,
	managementSign,
	toSelectedSigningKey,
	type BuiltManagementPostRequest,
} from '../management-signer.js';

export async function getAddressBookRegistry(
	config: NodeSdkConfig,
	query: GetKnownAddressesQuery = {},
): Promise<SdkResult<GetKnownAddressesData>> {
	const parsedQuery = GetKnownAddressesQuerySchema.safeParse(query);
	if (!parsedQuery.success) {
		return {ok: false, reason: 'Invalid address book query.'};
	}
	const path = buildManagementQueryPath(ADDRESS_BOOK_REGISTRY_API_PATHS.get, {
		chain_type: parsedQuery.data.chain_type,
		chain_id: parsedQuery.data.chain_id,
		is_contract: parsedQuery.data.is_contract,
	});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}
	const parsed = GetKnownAddressesDataSchema.safeParse(result.data);
	if (!parsed.success) {
		return {ok: false, reason: 'Address book response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function buildAddToAddressBookRegistry(
	config: NodeSdkConfig,
	input: {
		chainType: string;
		address: string;
		name?: string;
		chainIds?: string[];
		isContract?: boolean;
	},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	return buildManagementPostRequest(
		config,
		{
			path: ADDRESS_BOOK_REGISTRY_API_PATHS.add,
			buildRequestFields: ({selectedSigningKey}) => {
				const body: Record<string, unknown> = {
					...(selectedSigningKey ? {clientPk: selectedSigningKey.value} : {}),
					chainType: input.chainType.trim().toLowerCase(),
					address: normalizeKnownAddressForChain(input.chainType, input.address),
					chainIds: input.chainIds ?? [],
				};
				if (input.name !== undefined && input.name.length > 0) {
					body.name = input.name;
				}
				if (input.isContract !== undefined) {
					body.isContract = input.isContract;
				}
				return body;
			},
		},
		signing,
	);
}

export async function addToAddressBookRegistry(
	config: NodeSdkConfig,
	input: {
		chainType: string;
		address: string;
		name?: string;
		chainIds?: string[];
		isContract?: boolean;
	},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const built = await buildAddToAddressBookRegistry(config, input, signing);
	if (!built.ok) {
		return built;
	}

	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}

	const posted = await managementPost<string>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	return {
		ok: true,
		data: {
			message: posted.data,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigningKey(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildRemoveFromAddressBookRegistry(
	config: NodeSdkConfig,
	input: {chainType: string; address: string},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	return buildManagementPostRequest(
		config,
		{
			path: ADDRESS_BOOK_REGISTRY_API_PATHS.remove,
			buildRequestFields: ({selectedSigningKey}) => ({
				...(selectedSigningKey ? {clientPk: selectedSigningKey.value} : {}),
				chainType: input.chainType.trim().toLowerCase(),
				address: normalizeKnownAddressForChain(input.chainType, input.address),
			}),
		},
		signing,
	);
}

export async function removeFromAddressBookRegistry(
	config: NodeSdkConfig,
	input: {chainType: string; address: string},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const built = await buildRemoveFromAddressBookRegistry(config, input, signing);
	if (!built.ok) {
		return built;
	}

	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}

	const posted = await managementPost<string>(
		config,
		built.data.path,
		signed.data,
	);
	if (!posted.ok) {
		return posted;
	}
	return {
		ok: true,
		data: {
			message: posted.data,
			selectedSigningKey: built.data.selectedSigningKey
				? toSelectedSigningKey(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}
