import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {resolveChainRegistryByQuery} from '../registry/networks.js';
import {resolveTokenFromRegistry} from '../registry/tokens.js';
import {humanAmountToWei} from '../registry/registry-lookup.js';
import type {TransferErc20InputSchema} from './schemas.js';
import type {z} from 'zod';

export type ResolvedErc20TransferInput = {
	readonly chainId: number;
	readonly tokenAddress: string;
	readonly amountWei: string;
	readonly transferSig?: string;
};

export async function resolveChainForTransfer(
	config: NodeSdkConfig,
	input: {chainId?: number; chainName?: string},
): Promise<SdkResult<{chainId: number; chainName: string}>> {
	const resolved = await resolveChainRegistryByQuery(config, input);
	if (!resolved.ok) {
		return resolved;
	}
	const chainId = Number.parseInt(String(resolved.data.chainId), 10);
	if (!Number.isFinite(chainId) || chainId <= 0) {
		return {ok: false, reason: 'Resolved chain has invalid chainId.'};
	}
	return {
		ok: true,
		data: {chainId, chainName: resolved.data.chainName},
	};
}

export async function resolveErc20TransferInput(
	config: NodeSdkConfig,
	parsed: z.infer<typeof TransferErc20InputSchema>,
): Promise<SdkResult<ResolvedErc20TransferInput>> {
	const chain = await resolveChainForTransfer(config, {
		chainId: parsed.chainId,
		chainName: parsed.chainName,
	});
	if (!chain.ok) {
		return chain;
	}

	const token = await resolveTokenFromRegistry(config, {
		chainType: 'ethereum',
		chainId: chain.data.chainId,
		tokenAddress: parsed.tokenAddress,
		tokenSymbol: parsed.tokenSymbol,
	});
	if (!token.ok) {
		return token;
	}

	let amountWei: string;
	if (parsed.amountWei != null && parsed.amountWei.length > 0) {
		amountWei = parsed.amountWei;
	} else if (parsed.amount != null && parsed.amount.length > 0) {
		if (token.data.decimals == null) {
			return {
				ok: false,
				reason:
					'Token registry entry is missing decimals; provide amountWei instead of amount.',
			};
		}
		const converted = humanAmountToWei(parsed.amount, token.data.decimals);
		if (!converted.ok) {
			return converted;
		}
		amountWei = converted.data;
	} else {
		return {ok: false, reason: 'Provide amountWei or amount.'};
	}

	return {
		ok: true,
		data: {
			chainId: chain.data.chainId,
			tokenAddress: token.data.contractAddress,
			amountWei,
			transferSig: parsed.transferSig ?? token.data.transferSig,
		},
	};
}
