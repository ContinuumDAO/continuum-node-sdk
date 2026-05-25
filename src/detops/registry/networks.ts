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
	ChainRegistryEntrySchema,
	GetChainRegistryDataSchema,
	GetChainRegistryQuerySchema,
	type AddChainRegistryInput,
	type GetChainRegistryData,
	type GetChainRegistryQuery,
} from '../../schemas/extended.js';
import {normalizeChainId} from '../../internal/normalize.js';
import {
	prepareActionSignedManagementRequest,
	toSelectedSigningKey,
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

function buildPostChainDetailsSigningPayload(fields: {
	nonce: number;
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
		nonce: fields.nonce,
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

export async function addToChainRegistry(
	config: NodeSdkConfig,
	input: AddChainRegistryInput,
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const parsedInput = AddChainRegistryInputSchema.safeParse(input);
	if (!parsedInput.success) {
		return {ok: false, reason: 'Invalid chain registry input.'};
	}

	const chainIdStr = normalizeChainId(parsedInput.data.chainId);
	const legacy = parsedInput.data.legacy ?? false;
	const testnet = parsedInput.data.testnet ?? false;

	const signed = await prepareActionSignedManagementRequest(
		config,
		({selectedSigningKey}) =>
			buildPostChainDetailsSigningPayload({
				nonce: selectedSigningKey.nonce,
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
	);
	if (!signed.ok) {
		return signed;
	}

	const postBody: Record<string, unknown> = {
		nonce: signed.data.selectedSigningKey.nonce,
		chainName: parsedInput.data.chainName.trim(),
		chainId: parsedInput.data.chainId,
		rpcGateway: parsedInput.data.rpcGateway.trim(),
		legacy,
		testnet,
		signedMessage: signed.data.signingMessage,
		clientSig: signed.data.signature,
	};
	if (parsedInput.data.explorer) postBody.explorer = parsedInput.data.explorer.trim();
	if (parsedInput.data.gasName) postBody.gasName = parsedInput.data.gasName.trim();
	if (parsedInput.data.gasLimit !== undefined) postBody.gasLimit = parsedInput.data.gasLimit;
	if (parsedInput.data.baseFee !== undefined) postBody.baseFee = parsedInput.data.baseFee;
	if (parsedInput.data.priorityFee !== undefined) {
		postBody.priorityFee = parsedInput.data.priorityFee;
	}
	if (parsedInput.data.baseFeeMultiplier !== undefined) {
		postBody.baseFeeMultiplier = parsedInput.data.baseFeeMultiplier;
	}
	if (parsedInput.data.gasMultiplier !== undefined) {
		postBody.gasMultiplier = parsedInput.data.gasMultiplier;
	}
	if (parsedInput.data.gasPrice !== undefined) postBody.gasPrice = parsedInput.data.gasPrice;
	if (parsedInput.data.defaultGetSigFeeSpeed) {
		postBody.defaultGetSigFeeSpeed = parsedInput.data.defaultGetSigFeeSpeed;
	}

	const posted = await managementPost<string>(
		config,
		CHAIN_REGISTRY_API_PATHS.add,
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

export async function removeFromChainRegistry(
	config: NodeSdkConfig,
	input: {chainId: string | number},
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const chainIdParsed = z
		.union([z.string().min(1), z.number().int().nonnegative()])
		.safeParse(input.chainId);
	if (!chainIdParsed.success) {
		return {ok: false, reason: 'Invalid chain ID.'};
	}
	const chainIdStr = normalizeChainId(chainIdParsed.data);

	const signed = await prepareActionSignedManagementRequest(
		config,
		({selectedSigningKey}) => ({
			nonce: selectedSigningKey.nonce,
			chainId: chainIdStr,
			action: 'removeChainDetails',
		}),
	);
	if (!signed.ok) {
		return signed;
	}

	const postBody = {
		nonce: signed.data.selectedSigningKey.nonce,
		chainId: chainIdParsed.data,
		signedMessage: signed.data.signingMessage,
		clientSig: signed.data.signature,
	};
	const posted = await managementPost<string>(
		config,
		CHAIN_REGISTRY_API_PATHS.remove,
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
