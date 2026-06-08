import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	buildManagementQueryPath,
	managementGet,
	managementPost,
} from '../../api/management-api.js';
import type {SdkResult} from '../result.js';
import {
	ADD_TOKEN_REGISTRY_REQUIRED_FIELDS_MESSAGE,
	AddToTokenRegistryInputSchema,
	DEFAULT_MANAGEMENT_SIGNING,
	GetTokenRegistryDataSchema,
	GetTokenRegistryQuerySchema,
	TOKEN_REGISTRY_API_PATHS,
	TokenTypeSchema,
	type AddToTokenRegistryInput,
	type GetTokenRegistryData,
	type GetTokenRegistryQuery,
	type ManagementSigningMethod,
	type TokenContractInput,
	type TokenType,
} from '../../schemas/extended.js';
import {normalizeChainId} from '../../internal/normalize.js';
import {
	flattenTokenRegistry,
	tokensMatchingSymbol,
	type FlatTokenRegistryEntry,
} from './registry-lookup.js';
import {
	buildManagementPostRequest,
	managementSign,
	toSelectedSigner,
	type BuiltManagementPostRequest,
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

function formatAddTokenRegistryValidationError(error: z.ZodError): string {
	const details = error.issues.map(issue => {
		const field = issue.path.length > 0 ? issue.path.join('.') : 'input';
		return `${field}: ${issue.message}`;
	});
	return `${ADD_TOKEN_REGISTRY_REQUIRED_FIELDS_MESSAGE} ${details.join('; ')}`;
}

const removeFromTokenRegistryInputSchema = z.object({
	chainType: z.string().min(1),
	chainId: z.union([z.string().min(1), z.number().int().nonnegative()]),
	tokenType: TokenTypeSchema,
	contractAddress: z.string().min(1),
	tokenId: z.string().optional(),
});

function filterTokenRegistryBySymbol(
	data: GetTokenRegistryData,
	symbol: string,
	chainId?: string,
): GetTokenRegistryData {
	const matches = tokensMatchingSymbol(flattenTokenRegistry(data), symbol).filter(
		token => chainId == null || token.chainId === chainId,
	);
	const filtered: GetTokenRegistryData = {};
	for (const token of matches) {
		const chainEntries = filtered[token.chainType] ?? [];
		let entry = chainEntries.find(
			item =>
				typeof item === 'object' &&
				item != null &&
				String((item as Record<string, unknown>).chainId) === token.chainId,
		) as Record<string, unknown> | undefined;
		if (!entry) {
			entry = {chainId: token.chainId};
			chainEntries.push(entry);
			filtered[token.chainType] = chainEntries;
		}
		const bucket =
			(entry[token.tokenType] as Record<string, unknown> | undefined) ?? {};
		const contracts = Array.isArray(bucket.contracts)
			? [...(bucket.contracts as unknown[])]
			: [];
		contracts.push({
			contractAddress: token.contractAddress,
			symbol: token.symbol,
			...(token.name ? {name: token.name} : {}),
			...(token.decimals != null ? {decimals: token.decimals} : {}),
		});
		entry[token.tokenType] = {
			...bucket,
			...(token.transferSig ? {transferSig: token.transferSig} : {}),
			contracts,
		};
	}
	return filtered;
}

export async function getTokenRegistry(
	config: NodeSdkConfig,
	query: GetTokenRegistryQuery = {},
): Promise<SdkResult<GetTokenRegistryData>> {
	const parsedQuery = GetTokenRegistryQuerySchema.safeParse(query);
	if (!parsedQuery.success) {
		return {ok: false, reason: 'Invalid token registry query.'};
	}
	const wantsSymbolFilter = Boolean(parsedQuery.data.symbol?.trim());
	const path = buildManagementQueryPath(TOKEN_REGISTRY_API_PATHS.get, {
		chainType: parsedQuery.data.chainType,
		chain_id: wantsSymbolFilter ? undefined : parsedQuery.data.chain_id,
	});
	const result = await managementGet<unknown>(config, path);
	if (!result.ok) {
		return result;
	}
	let parsed = GetTokenRegistryDataSchema.safeParse(result.data);
	if (!parsed.success) {
		return {ok: false, reason: 'Token registry response failed validation.'};
	}
	if (parsedQuery.data.symbol?.trim()) {
		parsed = {
			success: true,
			data: filterTokenRegistryBySymbol(
				parsed.data,
				parsedQuery.data.symbol,
				parsedQuery.data.chain_id,
			),
		};
	}
	return {ok: true, data: parsed.data};
}

export async function resolveTokenFromRegistry(
	config: NodeSdkConfig,
	query: {
		chainType?: string;
		chainId?: number | string;
		tokenAddress?: string;
		tokenSymbol?: string;
	},
): Promise<SdkResult<FlatTokenRegistryEntry>> {
	if (query.tokenAddress != null && query.tokenAddress.length > 0) {
		return {
			ok: true,
			data: {
				chainType: (query.chainType ?? 'ethereum').trim().toLowerCase(),
				chainId: query.chainId != null ? String(query.chainId) : '',
				tokenType: 'ERC20',
				contractAddress: query.tokenAddress,
				symbol: query.tokenSymbol ?? '',
			},
		};
	}

	const tokenSymbol = query.tokenSymbol?.trim();
	if (!tokenSymbol) {
		return {ok: false, reason: 'Provide tokenAddress or tokenSymbol.'};
	}
	if (query.chainId == null) {
		return {
			ok: false,
			reason: 'chainId is required when resolving tokenSymbol.',
		};
	}

	const registry = await getTokenRegistry(config, {
		chainType: query.chainType ?? 'ethereum',
		chain_id: String(query.chainId),
		symbol: tokenSymbol,
	});
	if (!registry.ok) {
		return registry;
	}

	const matches = tokensMatchingSymbol(
		flattenTokenRegistry(registry.data),
		tokenSymbol,
	).filter(token => token.chainId === String(query.chainId));

	if (matches.length === 0) {
		const allOnChain = await getTokenRegistry(config, {
			chainType: query.chainType ?? 'ethereum',
			chain_id: String(query.chainId),
		});
		if (allOnChain.ok) {
			const symbols = flattenTokenRegistry(allOnChain.data)
				.map(token => token.symbol)
				.filter(Boolean);
			const uniqueSymbols = [...new Set(symbols)];
			return {
				ok: false,
				reason:
					`No token "${tokenSymbol}" on chain ${query.chainId}. ` +
					`Saved tokens on this chain: ${uniqueSymbols.join(', ') || '(none)'}. ` +
					'Call get_token_registry with symbol or chain_id from get_chain_registry — do not guess chain IDs.',
			};
		}
		return {
			ok: false,
			reason: `No token "${tokenSymbol}" found on chain ${query.chainId}.`,
		};
	}
	if (matches.length > 1) {
		return {
			ok: false,
			reason:
				`Multiple "${tokenSymbol}" tokens on chain ${query.chainId}. ` +
				`Use tokenAddress to disambiguate: ${matches.map(token => token.contractAddress).join(', ')}.`,
		};
	}
	return {ok: true, data: matches[0]};
}

export async function buildAddToTokenRegistry(
	config: NodeSdkConfig,
	input: AddToTokenRegistryInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsedInput = AddToTokenRegistryInputSchema.safeParse(input);
	if (!parsedInput.success) {
		return {
			ok: false,
			reason: formatAddTokenRegistryValidationError(parsedInput.error),
		};
	}

	const normalizedChainType = parsedInput.data.chainType.trim().toLowerCase();
	const chainIdStr = normalizeChainId(parsedInput.data.chainId);
	const normalizedContract = normalizeTokenContract(
		parsedInput.data.contract,
		normalizedChainType,
		parsedInput.data.tokenType,
	);

	return buildManagementPostRequest(
		config,
		{
			path: TOKEN_REGISTRY_API_PATHS.add,
			buildRequestFields: () => {
				const payload: Record<string, unknown> = {
					chainType: normalizedChainType,
					chainId: chainIdStr,
					tokenType: parsedInput.data.tokenType,
					contract: normalizedContract,
					action: 'addToken',
				};
				if (parsedInput.data.transferSig) {
					payload.transferSig = parsedInput.data.transferSig;
				}
				if (parsedInput.data.transferNames) {
					payload.transferNames = parsedInput.data.transferNames;
				}
				return payload;
			},
		},
		signing,
	);
}

export async function addToTokenRegistry(
	config: NodeSdkConfig,
	input: AddToTokenRegistryInput,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildAddToTokenRegistry(config, input, signing);
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
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}

export async function buildRemoveFromTokenRegistry(
	config: NodeSdkConfig,
	input: z.infer<typeof removeFromTokenRegistryInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsedInput = removeFromTokenRegistryInputSchema.safeParse(input);
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

	return buildManagementPostRequest(
		config,
		{
			path: TOKEN_REGISTRY_API_PATHS.remove,
			buildRequestFields: () => {
				const payload: Record<string, unknown> = {
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
		},
		signing,
	);
}

export async function removeFromTokenRegistry(
	config: NodeSdkConfig,
	input: z.infer<typeof removeFromTokenRegistryInputSchema>,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		message: string;
		selectedSigningKey?: ReturnType<typeof toSelectedSigner>;
		signingMessage: string;
	}>
> {
	const built = await buildRemoveFromTokenRegistry(config, input, signing);
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
				? toSelectedSigner(built.data.selectedSigningKey)
				: undefined,
			signingMessage: built.data.canonicalJson,
		},
	};
}
