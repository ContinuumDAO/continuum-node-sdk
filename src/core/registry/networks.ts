import type {NodeSdkConfig} from '../../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import type {SdkResult} from '../result.js';
import {
	AddChainRegistryInputSchema,
	CHAIN_REGISTRY_API_PATHS,
	RPC_GATEWAY_REQUIRED_MESSAGE,
	ChainRegistryEntrySchema,
	DEFAULT_MANAGEMENT_SIGNING,
	GetChainRegistryDataSchema,
	GetChainRegistryQuerySchema,
	type AddChainRegistryInput,
	type GetChainRegistryData,
	type GetChainRegistryQuery,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import {normalizeChainId} from '../../internal/normalize.js';
import {
	buildManagementPostRequest,
	managementSign,
	toSelectedSigningKey,
	type BuiltManagementPostRequest,
} from '../management-signer.js';
import {z} from 'zod';

function normalizeGetChainDetailsResponse(
	raw: unknown,
): z.infer<typeof ChainRegistryEntrySchema>[] {
	if (raw === null || raw === undefined) {
		return [];
	}
	if (Array.isArray(raw)) {
		return raw
			.map(entry => ChainRegistryEntrySchema.safeParse(entry))
			.filter(parsed => parsed.success)
			.map(parsed => parsed.data);
	}
	if (typeof raw === 'object') {
		const parsed = ChainRegistryEntrySchema.safeParse(raw);
		return parsed.success ? [parsed.data] : [];
	}
	return [];
}

function buildPostChainDetailsRequestFields(fields: {
	chainName: string;
	chainId: string;
	rpcGateway: string;
	explorer?: string;
	legacy: boolean;
	testnet: boolean;
	gasName?: string;
	gasLimit?: number;
	baseFee?: number | null;
	priorityFee?: number | null;
	baseFeeMultiplier?: number;
	gasMultiplier?: number;
	gasPrice?: number;
	defaultGetSigFeeSpeed?: string;
}): Record<string, unknown> {
	const payload: Record<string, unknown> = {
		chainName: fields.chainName,
		chainId: fields.chainId,
		rpcGateway: fields.rpcGateway,
		legacy: fields.legacy,
		testnet: fields.testnet,
	};
	if (fields.explorer) payload.explorer = fields.explorer;
	if (fields.gasName) payload.gasName = fields.gasName;
	if (fields.gasLimit !== undefined) payload.gasLimit = fields.gasLimit;
	if (fields.baseFee !== undefined) payload.baseFee = fields.baseFee;
	if (fields.priorityFee !== undefined) payload.priorityFee = fields.priorityFee;
	if (fields.baseFeeMultiplier !== undefined) {
		payload.baseFeeMultiplier = fields.baseFeeMultiplier;
	}
	if (fields.gasMultiplier !== undefined) payload.gasMultiplier = fields.gasMultiplier;
	if (fields.gasPrice !== undefined) payload.gasPrice = fields.gasPrice;
	if (fields.defaultGetSigFeeSpeed) {
		payload.defaultGetSigFeeSpeed = fields.defaultGetSigFeeSpeed;
	}
	return payload;
}

export async function getChainRegistry(
	config: NodeSdkConfig,
	query: GetChainRegistryQuery = {},
): Promise<SdkResult<GetChainRegistryData>> {
	const parsedQuery = GetChainRegistryQuerySchema.safeParse(query);
	if (!parsedQuery.success) {
		return {ok: false, reason: 'Invalid chain registry query.'};
	}
	const path = buildManagementQueryPath(CHAIN_REGISTRY_API_PATHS.get, {
		chain_id: parsedQuery.data.chain_id,
	});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}
	const chains = normalizeGetChainDetailsResponse(result.data);
	const parsed = GetChainRegistryDataSchema.safeParse({chains});
	if (!parsed.success) {
		return {ok: false, reason: 'Chain registry response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function resolveChainRegistryEntry(
	config: NodeSdkConfig,
	chainId: number | string,
): Promise<SdkResult<z.infer<typeof ChainRegistryEntrySchema>>> {
	const registry = await getChainRegistry(config, {chain_id: String(chainId)});
	if (!registry.ok) {
		return registry;
	}
	const chain =
		registry.data.chains.find(
			entry => String(entry.chainId).trim() === String(chainId),
		) ?? registry.data.chains[0];
	if (!chain) {
		return {ok: false, reason: 'Chain not configured.'};
	}
	return {ok: true, data: chain};
}

export async function buildAddToChainRegistry(
	config: NodeSdkConfig,
	input: AddChainRegistryInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsedInput = AddChainRegistryInputSchema.safeParse(input);
	if (!parsedInput.success) {
		const missingRpc = parsedInput.error.issues.some(
			issue => issue.path[0] === 'rpcGateway',
		);
		return {
			ok: false,
			reason: missingRpc
				? RPC_GATEWAY_REQUIRED_MESSAGE
				: 'Invalid chain registry input.',
		};
	}

	const chainIdStr = normalizeChainId(parsedInput.data.chainId);
	const legacy = parsedInput.data.legacy ?? false;
	const testnet = parsedInput.data.testnet ?? false;

	return buildManagementPostRequest(
		config,
		{
			path: CHAIN_REGISTRY_API_PATHS.add,
			buildRequestFields: () =>
				buildPostChainDetailsRequestFields({
					chainName: parsedInput.data.chainName.trim(),
					chainId: chainIdStr,
					rpcGateway: parsedInput.data.rpcGateway.trim(),
					explorer: parsedInput.data.explorer?.trim(),
					legacy,
					testnet,
					gasName: parsedInput.data.gasName?.trim(),
					gasLimit: parsedInput.data.gasLimit,
					baseFee: parsedInput.data.baseFee,
					priorityFee: parsedInput.data.priorityFee,
					baseFeeMultiplier: parsedInput.data.baseFeeMultiplier,
					gasMultiplier: parsedInput.data.gasMultiplier,
					gasPrice: parsedInput.data.gasPrice,
					defaultGetSigFeeSpeed: parsedInput.data.defaultGetSigFeeSpeed,
				}),
		},
		signing,
	);
}

export async function addToChainRegistry(
	config: NodeSdkConfig,
	input: AddChainRegistryInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const built = await buildAddToChainRegistry(config, input, signing);
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

export async function buildRemoveFromChainRegistry(
	config: NodeSdkConfig,
	input: {chainId: string | number},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const chainIdParsed = z
		.union([z.string().min(1), z.number().int().nonnegative()])
		.safeParse(input.chainId);
	if (!chainIdParsed.success) {
		return {ok: false, reason: 'Invalid chain ID.'};
	}
	const chainIdStr = normalizeChainId(chainIdParsed.data);

	return buildManagementPostRequest(
		config,
		{
			path: CHAIN_REGISTRY_API_PATHS.remove,
			buildRequestFields: () => ({
				chainId: chainIdStr,
				action: 'removeChainDetails',
			}),
		},
		signing,
	);
}

export async function removeFromChainRegistry(
	config: NodeSdkConfig,
	input: {chainId: string | number},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const built = await buildRemoveFromChainRegistry(config, input, signing);
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
