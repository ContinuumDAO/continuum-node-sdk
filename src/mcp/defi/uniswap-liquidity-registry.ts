import {
	createPublicClient,
	defineChain,
	getAddress,
	http,
	type Address,
} from 'viem';
import {
	formatUniswapV4PositionNotFoundError,
	uniswapV4ListPositionsFromRegistryForMcp,
	uniswapV4PositionMintedTokenIdsFromReceipt,
	type UniswapV4RegistryErc721Row,
} from '@continuumdao/ctm-mpc-defi/protocols/evm/uniswap-v4';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	managementSign,
	buildManagementPostRequest,
} from '../../core/management-signer.js';
import {managementPost} from '../../api/management-api.js';
import {resolveChainRegistryEntry} from '../../core/registry/networks.js';
import {getTokenRegistry} from '../../core/registry/tokens.js';
import {flattenTokenRegistry} from '../../core/registry/registry-lookup.js';
import type {SdkResult} from '../../core/result.js';
import {normalizeChainId} from '../../internal/normalize.js';
import {enrichMultisignContext} from './input-adapter.js';
import {
	parseUniswapChainId,
	tryGetUniswapV4PositionManager,
} from '@continuumdao/ctm-mpc-defi/protocols/evm/uniswap-v4';

export const UNISWAP_V4_REGISTER_POSITION_NFT_TOOL_NAME =
	'ctm_uniswap_v4_register_position_nft';
export const UNISWAP_V4_REGISTER_POSITION_FROM_MINT_TX_TOOL_NAME =
	'ctm_uniswap_v4_register_position_from_mint_tx';

export function isUniswapRegisterPositionNftTool(toolName: string): boolean {
	return toolName === UNISWAP_V4_REGISTER_POSITION_NFT_TOOL_NAME;
}

export function isUniswapRegisterPositionFromMintTxTool(toolName: string): boolean {
	return toolName === UNISWAP_V4_REGISTER_POSITION_FROM_MINT_TX_TOOL_NAME;
}

async function resolveWalletAndChain(
	config: NodeSdkConfig,
	input: Record<string, unknown>,
): Promise<
	SdkResult<{chainId: number; walletAddress: Address; rpcUrl?: string}>
> {
	let chainId: number;
	try {
		chainId = parseUniswapChainId(input.chainId as string | number);
	} catch (e) {
		return {
			ok: false,
			reason: e instanceof Error ? e.message : 'Invalid chainId.',
		};
	}
	const keyGenId =
		typeof input.keyGenId === 'string' && input.keyGenId.trim()
			? input.keyGenId.trim()
			: undefined;
	if (keyGenId) {
		const enriched = await enrichMultisignContext(config, {keyGenId, chainId});
		if (!enriched.ok) return enriched;
		return {
			ok: true,
			data: {
				chainId: enriched.data.chainId,
				walletAddress: getAddress(enriched.data.executorAddress),
				rpcUrl: enriched.data.rpcUrl,
			},
		};
	}
	const wallet = input.walletAddress;
	if (typeof wallet !== 'string' || !wallet.trim()) {
		return {ok: false, reason: 'keyGenId or walletAddress is required.'};
	}
	try {
		return {
			ok: true,
			data: {
				chainId,
				walletAddress: getAddress(wallet.trim() as `0x${string}`),
				rpcUrl:
					typeof input.rpcUrl === 'string' && input.rpcUrl.trim()
						? input.rpcUrl.trim()
						: undefined,
			},
		};
	} catch {
		return {ok: false, reason: 'Invalid walletAddress.'};
	}
}

async function fetchRegistryErc721ForChain(
	config: NodeSdkConfig,
	chainId: number,
): Promise<SdkResult<UniswapV4RegistryErc721Row[]>> {
	const registry = await getTokenRegistry(config, {
		chainType: 'ethereum',
		chain_id: String(chainId),
	});
	if (!registry.ok) return registry;
	const rows = flattenTokenRegistry(registry.data)
		.filter(t => t.tokenType === 'ERC721' && t.tokenId)
		.map(
			(t): UniswapV4RegistryErc721Row => ({
				contractAddress: t.contractAddress,
				tokenId: t.tokenId!,
				name: t.name,
				symbol: t.symbol,
			}),
		);
	return {ok: true, data: rows};
}

export async function listUniswapV4PositionsFromTokenRegistryMcp(
	config: NodeSdkConfig,
	input: Record<string, unknown>,
): Promise<SdkResult<{source: 'token_registry'; positions: unknown[]}>> {
	const ctx = await resolveWalletAndChain(config, input);
	if (!ctx.ok) return ctx;
	const pm =
		typeof input.positionManagerAddress === 'string' &&
		input.positionManagerAddress.trim()
			? getAddress(input.positionManagerAddress.trim() as `0x${string}`)
			: tryGetUniswapV4PositionManager(ctx.data.chainId);
	if (!pm) {
		return {
			ok: false,
			reason: `No Uniswap V4 Position Manager configured for chainId ${ctx.data.chainId}.`,
		};
	}
	const erc721 = await fetchRegistryErc721ForChain(config, ctx.data.chainId);
	if (!erc721.ok) return erc721;
	const out = uniswapV4ListPositionsFromRegistryForMcp({
		chainId: ctx.data.chainId,
		walletAddress: ctx.data.walletAddress,
		erc721Tokens: erc721.data,
		positionManagerAddress: pm,
	});
	return {ok: true, data: out};
}

export async function assertUniswapV4PositionNftInRegistry(
	config: NodeSdkConfig,
	args: {chainId: number; tokenId: string; positionManager?: Address},
): Promise<SdkResult<{tokenId: string; positionManager: Address}>> {
	const tid = args.tokenId.trim();
	if (!tid) {
		return {ok: false, reason: 'nftTokenId / tokenId is required.'};
	}
	const pm = args.positionManager ?? tryGetUniswapV4PositionManager(args.chainId);
	if (!pm) {
		return {
			ok: false,
			reason: `No Uniswap V4 Position Manager configured for chainId ${args.chainId}.`,
		};
	}
	const erc721 = await fetchRegistryErc721ForChain(config, args.chainId);
	if (!erc721.ok) return erc721;
	const pmLower = pm.toLowerCase();
	const found = erc721.data.some(row => {
		try {
			return (
				getAddress(row.contractAddress as `0x${string}`).toLowerCase() === pmLower &&
				row.tokenId === tid
			);
		} catch {
			return false;
		}
	});
	if (!found) {
		return {
			ok: false,
			reason: formatUniswapV4PositionNotFoundError({
				tokenId: tid,
				chainId: args.chainId,
			}),
		};
	}
	return {ok: true, data: {tokenId: tid, positionManager: pm}};
}

async function addErc721PositionToRegistry(
	config: NodeSdkConfig,
	args: {
		chainId: number;
		positionManager: Address;
		tokenId: string;
		name?: string;
		symbol?: string;
		tokenURI?: string;
	},
): Promise<SdkResult<{message: string; tokenId: string; positionManager: Address}>> {
	const chainIdStr = normalizeChainId(args.chainId);
	const tokenId = args.tokenId.trim();
	const pm = getAddress(args.positionManager);
	const existing = await assertUniswapV4PositionNftInRegistry(config, {
		chainId: args.chainId,
		tokenId,
		positionManager: pm,
	});
	if (existing.ok) {
		return {
			ok: true,
			data: {
				message: `Position #${tokenId} is already in the token registry.`,
				tokenId,
				positionManager: pm,
			},
		};
	}

	const built = await buildManagementPostRequest(
		config,
		{
			path: '/addToken',
			buildRequestFields: () => ({
				chainType: 'ethereum',
				chainId: chainIdStr,
				tokenType: 'ERC721',
				contract: {
					contractAddress: pm,
					tokenId,
					name: args.name?.trim() || 'Uniswap V4 Position',
					symbol: args.symbol?.trim() || 'UNI-V4-POS',
					...(args.tokenURI?.trim() ? {tokenURI: args.tokenURI.trim()} : {}),
				},
				action: 'addToken',
			}),
		},
		DEFAULT_MANAGEMENT_SIGNING,
	);
	if (!built.ok) return built;

	const signed = await managementSign(config, DEFAULT_MANAGEMENT_SIGNING, built.data.unsignedBody);
	if (!signed.ok) return signed;

	const posted = await managementPost(config, '/addToken', signed.data);
	if (!posted.ok) return posted;

	return {
		ok: true,
		data: {
			message: `Added Uniswap V4 position #${tokenId} to the token registry.`,
			tokenId,
			positionManager: pm,
		},
	};
}

export async function registerUniswapV4PositionNftMcp(
	config: NodeSdkConfig,
	input: Record<string, unknown>,
): Promise<
	SdkResult<{message: string; tokenId: string; positionManager: Address}>
> {
	const ctx = await resolveWalletAndChain(config, input);
	if (!ctx.ok) return ctx;
	const tokenId = String(input.tokenId ?? '').trim();
	if (!tokenId) {
		return {ok: false, reason: 'tokenId is required.'};
	}
	const pm =
		typeof input.positionManagerAddress === 'string' &&
		input.positionManagerAddress.trim()
			? getAddress(input.positionManagerAddress.trim() as `0x${string}`)
			: tryGetUniswapV4PositionManager(ctx.data.chainId);
	if (!pm) {
		return {
			ok: false,
			reason: `No Uniswap V4 Position Manager configured for chainId ${ctx.data.chainId}.`,
		};
	}
	return addErc721PositionToRegistry(config, {
		chainId: ctx.data.chainId,
		positionManager: pm,
		tokenId,
		name: typeof input.name === 'string' ? input.name : undefined,
		symbol: typeof input.symbol === 'string' ? input.symbol : undefined,
		tokenURI: typeof input.tokenURI === 'string' ? input.tokenURI : undefined,
	});
}

export async function registerUniswapV4PositionFromMintTxMcp(
	config: NodeSdkConfig,
	input: Record<string, unknown>,
): Promise<
	SdkResult<{
		message: string;
		tokenId: string;
		positionManager: Address;
		registered: boolean;
	}>
> {
	const ctx = await resolveWalletAndChain(config, input);
	if (!ctx.ok) return ctx;
	const txHashRaw = String(input.txHash ?? '').trim();
	if (!txHashRaw) {
		return {ok: false, reason: 'txHash is required.'};
	}
	const txHash = (txHashRaw.startsWith('0x') ? txHashRaw : `0x${txHashRaw}`) as `0x${string}`;
	const pm =
		typeof input.positionManagerAddress === 'string' &&
		input.positionManagerAddress.trim()
			? getAddress(input.positionManagerAddress.trim() as `0x${string}`)
			: tryGetUniswapV4PositionManager(ctx.data.chainId);
	if (!pm) {
		return {
			ok: false,
			reason: `No Uniswap V4 Position Manager configured for chainId ${ctx.data.chainId}.`,
		};
	}
	let rpcUrl = ctx.data.rpcUrl;
	if (!rpcUrl?.trim()) {
		const chain = await resolveChainRegistryEntry(config, ctx.data.chainId);
		if (chain.ok) {
			rpcUrl = String(chain.data.rpcGateway ?? '').trim();
		}
	}
	if (!rpcUrl?.trim()) {
		return {
			ok: false,
			reason: `Chain registry entry for chainId ${ctx.data.chainId} has no rpcGateway (needed to read mint tx receipt).`,
		};
	}
	const chain = defineChain({
		id: ctx.data.chainId,
		name: `uniswap-v4-${ctx.data.chainId}`,
		nativeCurrency: {name: 'ETH', symbol: 'ETH', decimals: 18},
		rpcUrls: {default: {http: [rpcUrl]}},
	});
	const client = createPublicClient({chain, transport: http(rpcUrl)});
	const receipt = await client.getTransactionReceipt({hash: txHash});
	if (receipt.status !== 'success') {
		return {ok: false, reason: `Transaction ${txHash} did not succeed.`};
	}
	const ids = uniswapV4PositionMintedTokenIdsFromReceipt(
		receipt,
		pm,
		ctx.data.walletAddress,
	);
	if (ids.length === 0) {
		return {
			ok: false,
			reason:
				`No Uniswap V4 position mint found in ${txHash} for ${ctx.data.walletAddress}. ` +
				'Pass the Position Manager mint step hash from the liquidity batch.',
		};
	}
	const deduped = [...new Map(ids.map(id => [id.toString(), id])).values()].sort(
		(a, b) => (a === b ? 0 : a < b ? -1 : 1),
	);
	const first = deduped[0]!;
	const before = await assertUniswapV4PositionNftInRegistry(config, {
		chainId: ctx.data.chainId,
		tokenId: first.toString(),
		positionManager: pm,
	});
	const added = await addErc721PositionToRegistry(config, {
		chainId: ctx.data.chainId,
		positionManager: pm,
		tokenId: first.toString(),
	});
	if (!added.ok) return added;
	return {
		ok: true,
		data: {
			...added.data,
			registered: !before.ok,
		},
	};
}
