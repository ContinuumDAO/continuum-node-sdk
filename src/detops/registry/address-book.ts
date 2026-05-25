import type {NodeSdkConfig} from '../../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import type {SdkResult} from '../result.js';
import {
	ADDRESS_BOOK_REGISTRY_API_PATHS,
	GetKnownAddressesDataSchema,
	GetKnownAddressesQuerySchema,
	NodeIdSchema,
	type GetKnownAddressesData,
	type GetKnownAddressesQuery,
} from '../../schemas/extended.js';
import {normalizeKnownAddressForChain} from '../../internal/normalize.js';
import {
	buildClientSigManagementPostBody,
	prepareSignedManagementRequest,
	toSelectedSigningKey,
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

export async function addToAddressBookRegistry(
	config: NodeSdkConfig,
	input: {
		chainType: string;
		address: string;
		name?: string;
		chainIds?: string[];
		isContract?: boolean;
	},
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const nodeKeyResult = await managementGet<string>(config, '/getNodeKey');
	if (!nodeKeyResult.ok) {
		return nodeKeyResult;
	}
	const nodeKeyParsed = NodeIdSchema.safeParse(nodeKeyResult.data);
	if (!nodeKeyParsed.success) {
		return {ok: false, reason: 'Node ID response failed validation.'};
	}

	const signed = await prepareSignedManagementRequest(
		config,
		({selectedSigningKey}) => {
			const body: Record<string, unknown> = {
				nodeKey: nodeKeyParsed.data,
				Nonce: selectedSigningKey.nonce,
				Sig: '',
				clientPk: selectedSigningKey.value,
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
	);
	if (!signed.ok) {
		return signed;
	}

	const postBody = buildClientSigManagementPostBody(
		signed.data.unsignedBody,
		signed.data.signingMessage,
		signed.data.signature,
	);
	const posted = await managementPost<string>(
		config,
		ADDRESS_BOOK_REGISTRY_API_PATHS.add,
		postBody,
	);
	if (!posted.ok) {
		return posted;
	}
	return {
		ok: true,
		data: {
			message: posted.data,
			selectedSigningKey: toSelectedSigningKey(signed.data.selectedSigningKey),
			signingMessage: signed.data.signingMessage,
		},
	};
}

export async function removeFromAddressBookRegistry(
	config: NodeSdkConfig,
	input: {chainType: string; address: string},
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const nodeKeyResult = await managementGet<string>(config, '/getNodeKey');
	if (!nodeKeyResult.ok) {
		return nodeKeyResult;
	}
	const nodeKeyParsed = NodeIdSchema.safeParse(nodeKeyResult.data);
	if (!nodeKeyParsed.success) {
		return {ok: false, reason: 'Node ID response failed validation.'};
	}

	const signed = await prepareSignedManagementRequest(
		config,
		({selectedSigningKey}) => ({
			nodeKey: nodeKeyParsed.data,
			Nonce: selectedSigningKey.nonce,
			Sig: '',
			clientPk: selectedSigningKey.value,
			chainType: input.chainType.trim().toLowerCase(),
			address: normalizeKnownAddressForChain(input.chainType, input.address),
		}),
	);
	if (!signed.ok) {
		return signed;
	}

	const postBody = buildClientSigManagementPostBody(
		signed.data.unsignedBody,
		signed.data.signingMessage,
		signed.data.signature,
	);
	const posted = await managementPost<string>(
		config,
		ADDRESS_BOOK_REGISTRY_API_PATHS.remove,
		postBody,
	);
	if (!posted.ok) {
		return posted;
	}
	return {
		ok: true,
		data: {
			message: posted.data,
			selectedSigningKey: toSelectedSigningKey(signed.data.selectedSigningKey),
			signingMessage: signed.data.signingMessage,
		},
	};
}
