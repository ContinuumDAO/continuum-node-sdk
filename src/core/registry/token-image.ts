import {getAddress} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {createPublicClientForChain} from '../mpc/context.js';
import {getTokenRegistry} from './tokens.js';
import {flattenTokenRegistry, type FlatTokenRegistryEntry} from './registry-lookup.js';

export const CONTINUUM_IMAGE_V1_KIND = 'continuum/image/v1' as const;

export type ContinuumImageSource = 'url' | 'erc721' | 'symbolURL' | 'search';

export type ContinuumImageItem = {
	url: string;
	resolvedUrl?: string;
	alt?: string;
	caption?: string;
	source: ContinuumImageSource;
};

export type ContinuumImageEnvelope = {
	kind: typeof CONTINUUM_IMAGE_V1_KIND;
	title?: string;
	items: ContinuumImageItem[];
};

export type ResolveTokenImageInput = {
	chainId: string | number;
	contractAddress: string;
	tokenId?: string;
	tokenType?: string;
	chainType?: string;
};

const ERC721_TOKEN_URI_ABI = [
	{
		type: 'function',
		name: 'tokenURI',
		stateMutability: 'view',
		inputs: [{name: 'tokenId', type: 'uint256'}],
		outputs: [{name: '', type: 'string'}],
	},
] as const;

function normalizeAddr(raw: string): string {
	const trimmed = raw.trim();
	try {
		return getAddress(trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`).toLowerCase();
	} catch {
		return trimmed.toLowerCase();
	}
}

function pickRegistryMatch(
	tokens: readonly FlatTokenRegistryEntry[],
	input: ResolveTokenImageInput,
): FlatTokenRegistryEntry | undefined {
	const chainId = String(input.chainId).trim();
	const addr = normalizeAddr(input.contractAddress);
	const tokenId = input.tokenId?.trim();
	const tokenType = input.tokenType?.trim();
	const chainType = input.chainType?.trim().toLowerCase();
	return tokens.find(token => {
		if (token.chainId !== chainId) return false;
		if (normalizeAddr(token.contractAddress) !== addr) return false;
		if (chainType && token.chainType.toLowerCase() !== chainType && !(chainType === 'evm' && token.chainType === 'ethereum')) {
			return false;
		}
		if (tokenType && token.tokenType !== tokenType) return false;
		if (tokenId && token.tokenId && token.tokenId !== tokenId) return false;
		return true;
	});
}

async function followTokenUriToImageUrl(tokenURI: string): Promise<string | undefined> {
	const url = tokenURI.trim();
	if (!/^https?:\/\//i.test(url)) {
		return undefined;
	}
	try {
		const res = await fetch(url, {
			headers: {Accept: 'application/json, image/*'},
			signal: AbortSignal.timeout(8000),
		});
		if (!res.ok) {
			return undefined;
		}
		const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
		if (contentType.startsWith('image/')) {
			return url;
		}
		if (!contentType.includes('application/json') && !contentType.includes('text/plain')) {
			return undefined;
		}
		const json = (await res.json()) as {image?: unknown; image_url?: unknown};
		const image =
			(typeof json.image === 'string' && json.image.trim()) ||
			(typeof json.image_url === 'string' && json.image_url.trim()) ||
			'';
		return image || undefined;
	} catch {
		return undefined;
	}
}

async function readErc721TokenUri(
	config: NodeSdkConfig,
	chainId: string | number,
	contractAddress: string,
	tokenId: string,
): Promise<string | undefined> {
	const numeric = Number(chainId);
	if (!Number.isFinite(numeric) || !tokenId.trim()) {
		return undefined;
	}
	const client = await createPublicClientForChain(config, numeric);
	if (!client.ok) {
		return undefined;
	}
	try {
		const uri = await client.data.publicClient.readContract({
			address: getAddress(contractAddress),
			abi: ERC721_TOKEN_URI_ABI,
			functionName: 'tokenURI',
			args: [BigInt(tokenId)],
		});
		const trimmed = String(uri ?? '').trim();
		return trimmed || undefined;
	} catch {
		return undefined;
	}
}

export async function resolveTokenImage(
	config: NodeSdkConfig,
	input: ResolveTokenImageInput,
): Promise<SdkResult<ContinuumImageEnvelope>> {
	const chainId = String(input.chainId ?? '').trim();
	const contractAddress = input.contractAddress?.trim() ?? '';
	if (!chainId || !contractAddress) {
		return {ok: false, reason: 'chainId and contractAddress are required.'};
	}
	const registry = await getTokenRegistry(config, {
		chainType: input.chainType === 'evm' ? 'ethereum' : input.chainType,
		chain_id: chainId,
	});
	if (!registry.ok) {
		return registry;
	}
	const flat = flattenTokenRegistry(registry.data);
	const match = pickRegistryMatch(flat, input);
	const tokenType = (input.tokenType?.trim() || match?.tokenType || 'ERC721').trim();
	const tokenId = (input.tokenId?.trim() || match?.tokenId || '').trim();
	const title = match?.symbol || match?.name || contractAddress;

	if (tokenType === 'ERC721') {
		let tokenURI = match?.tokenURI?.trim() || '';
		if (!tokenURI && tokenId) {
			tokenURI = (await readErc721TokenUri(config, chainId, contractAddress, tokenId)) ?? '';
		}
		if (!tokenURI) {
			return {
				ok: false,
				reason:
					'No ERC721 tokenURI on the registry and on-chain tokenURI() was unavailable. Pass tokenId and ensure the chain has rpcGateway, or store tokenURI via add_to_token_registry.',
			};
		}
		const imageUrl = (await followTokenUriToImageUrl(tokenURI)) || tokenURI;
		const item: ContinuumImageItem = {
			url: imageUrl,
			alt: title,
			caption: tokenId ? `${title} #${tokenId}` : title,
			source: 'erc721',
		};
		if (imageUrl !== tokenURI) {
			item.resolvedUrl = imageUrl;
		}
		return {
			ok: true,
			data: {
				kind: CONTINUUM_IMAGE_V1_KIND,
				title,
				items: [item],
			},
		};
	}

	const symbolURL = match?.symbolURL?.trim() || '';
	if (!symbolURL) {
		return {
			ok: false,
			reason: `No symbolURL stored for ${tokenType} ${contractAddress} on chain ${chainId}. Add it with add_to_token_registry.`,
		};
	}
	return {
		ok: true,
		data: {
			kind: CONTINUUM_IMAGE_V1_KIND,
			title,
			items: [
				{
					url: symbolURL,
					alt: title,
					caption: title,
					source: 'symbolURL',
				},
			],
		},
	};
}
