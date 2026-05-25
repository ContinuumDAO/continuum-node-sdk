import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import type {SdkResult} from '../result.js';
import {
	GetTokenRegistryDataSchema,
	GetTokenRegistryQuerySchema,
	TOKEN_REGISTRY_API_PATHS,
	TokenContractInputSchema,
	TokenTypeSchema,
	type GetTokenRegistryData,
	type GetTokenRegistryQuery,
	type TokenContractInput,
	type TokenType,
} from '../../schemas/extended.js';
import {normalizeChainId} from '../../internal/normalize.js';
import {
	prepareActionSignedManagementRequest,
	toSelectedSigningKey,
} from '../management-signer.js';

function normalizeContractAddress(chainType: string, address: string): string {
	const a = address.trim();
	if (chainType === 'ethereum' && /^0x[a-fA-F0-9]{40}$/.test(a)) {
		return a.toLowerCase();
	}
	return a;
}

function normalizeTokenContract(
	contract: TokenContractInput,
	chainType: string,
	tokenType: TokenType,
): Record<string, unknown> {
	const out: Record<string, unknown> = {...contract};
	out.contractAddress = normalizeContractAddress(chainType, contract.contractAddress);
	if (tokenType === 'ERC721' && contract.tokenId !== undefined) {
		out.tokenId = String(contract.tokenId).trim();
	}
	return out;
}

export async function getTokenRegistry(
	config: NodeSdkConfig,
	query: GetTokenRegistryQuery = {},
): Promise<SdkResult<GetTokenRegistryData>> {
	const parsedQuery = GetTokenRegistryQuerySchema.safeParse(query);
	if (!parsedQuery.success) {
		return {ok: false, reason: 'Invalid token registry query.'};
	}
	const path = buildManagementQueryPath(TOKEN_REGISTRY_API_PATHS.get, {
		chainType: parsedQuery.data.chainType,
		chain_id: parsedQuery.data.chain_id,
	});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}
	const parsed = GetTokenRegistryDataSchema.safeParse(result.data);
	if (!parsed.success) {
		return {ok: false, reason: 'Token registry response failed validation.'};
	}
	return {ok: true, data: parsed.data};
}

export async function addToTokenRegistry(
	config: NodeSdkConfig,
	input: {
		chainType: string;
		chainId: string | number;
		tokenType: TokenType;
		contract: TokenContractInput;
		transferSig?: string;
		transferNames?: string[];
	},
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const parsedInput = z
		.object({
			chainType: z.string().min(1),
			chainId: z.union([z.string().min(1), z.number().int().nonnegative()]),
			tokenType: TokenTypeSchema,
			contract: TokenContractInputSchema,
			transferSig: z.string().optional(),
			transferNames: z.array(z.string()).optional(),
		})
		.safeParse(input);
	if (!parsedInput.success) {
		return {ok: false, reason: 'Invalid token registry input.'};
	}

	const normalizedChainType = parsedInput.data.chainType.trim().toLowerCase();
	const chainIdStr = normalizeChainId(parsedInput.data.chainId);
	const normalizedContract = normalizeTokenContract(
		parsedInput.data.contract,
		normalizedChainType,
		parsedInput.data.tokenType,
	);

	const signed = await prepareActionSignedManagementRequest(
		config,
		({selectedSigningKey}) => ({
			nonce: selectedSigningKey.nonce,
			chainType: normalizedChainType,
			chainId: chainIdStr,
			tokenType: parsedInput.data.tokenType,
			action: 'addToken',
		}),
	);
	if (!signed.ok) {
		return signed;
	}

	const postBody: Record<string, unknown> = {
		nonce: signed.data.selectedSigningKey.nonce,
		chainType: normalizedChainType,
		chainId: parsedInput.data.chainId,
		tokenType: parsedInput.data.tokenType,
		contract: normalizedContract,
		signedMessage: signed.data.signingMessage,
		clientSig: signed.data.signature,
	};
	if (parsedInput.data.transferSig) {
		postBody.transferSig = parsedInput.data.transferSig;
	}
	if (parsedInput.data.transferNames) {
		postBody.transferNames = parsedInput.data.transferNames;
	}

	const posted = await managementPost<string>(
		config,
		TOKEN_REGISTRY_API_PATHS.add,
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

export async function removeFromTokenRegistry(
	config: NodeSdkConfig,
	input: {
		chainType: string;
		chainId: string | number;
		tokenType: TokenType;
		contractAddress: string;
		tokenId?: string;
	},
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey: ReturnType<typeof toSelectedSigningKey>;
		signingMessage: string;
	}>
> {
	const parsedInput = z
		.object({
			chainType: z.string().min(1),
			chainId: z.union([z.string().min(1), z.number().int().nonnegative()]),
			tokenType: TokenTypeSchema,
			contractAddress: z.string().min(1),
			tokenId: z.string().optional(),
		})
		.safeParse(input);
	if (!parsedInput.success) {
		return {ok: false, reason: 'Invalid token registry input.'};
	}

	const normalizedChainType = parsedInput.data.chainType.trim().toLowerCase();
	const normalizedAddress = normalizeContractAddress(
		normalizedChainType,
		parsedInput.data.contractAddress,
	);
	if (
		parsedInput.data.tokenType === 'ERC721' &&
		(parsedInput.data.tokenId === undefined ||
			parsedInput.data.tokenId.trim().length === 0)
	) {
		return {ok: false, reason: 'tokenId is required when tokenType is ERC721.'};
	}

	const signed = await prepareActionSignedManagementRequest(
		config,
		({selectedSigningKey}) => {
			const payload: Record<string, unknown> = {
				nonce: selectedSigningKey.nonce,
				chainType: normalizedChainType,
				chainId: normalizeChainId(parsedInput.data.chainId),
				tokenType: parsedInput.data.tokenType,
				contractAddress: normalizedAddress,
				action: 'removeToken',
			};
			if (parsedInput.data.tokenType === 'ERC721' && parsedInput.data.tokenId) {
				payload.tokenId = parsedInput.data.tokenId.trim();
			}
			return payload;
		},
	);
	if (!signed.ok) {
		return signed;
	}

	const postBody: Record<string, unknown> = {
		nonce: signed.data.selectedSigningKey.nonce,
		chainType: normalizedChainType,
		chainId: parsedInput.data.chainId,
		tokenType: parsedInput.data.tokenType,
		contractAddress: normalizedAddress,
		signedMessage: signed.data.signingMessage,
		clientSig: signed.data.signature,
	};
	if (parsedInput.data.tokenType === 'ERC721' && parsedInput.data.tokenId) {
		postBody.tokenId = parsedInput.data.tokenId.trim();
	}

	const posted = await managementPost<string>(
		config,
		TOKEN_REGISTRY_API_PATHS.remove,
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
