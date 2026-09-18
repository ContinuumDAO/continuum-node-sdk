import {
	encodeMerklDistributorClaimData,
	fetchAllMerklDistributorClaimLeaves,
	MERKL_DISTRIBUTOR_ADDRESS,
	selectWalletWideMerklClaimLeaves,
} from '@continuumdao/ctm-mpc-defi/protocols/evm/morpho';
import {getAddress, isAddress, type Address} from 'viem';
import {fetchKeyGenResult} from '../../core/keygen.js';
import {parseKeyGenRequestId} from '../../core/keygen-id.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../../core/result.js';
import type {EnrichedMultisignContext} from './input-adapter.js';
import {parseEvmChainId} from './input-adapter.js';

export const MORPHO_FETCH_MERKL_REWARDS_TOOL = 'ctm_morpho_fetch_merkl_rewards';
export const AAVE_V4_FETCH_MERKL_REWARDS_TOOL = 'ctm_aave_v4_fetch_merkl_rewards';
export const EULER_V2_FETCH_MERKL_REWARDS_TOOL = 'ctm_euler_v2_fetch_merkl_rewards';

const MERKL_REWARDS_READ_TOOLS = new Set([
	MORPHO_FETCH_MERKL_REWARDS_TOOL,
	AAVE_V4_FETCH_MERKL_REWARDS_TOOL,
	EULER_V2_FETCH_MERKL_REWARDS_TOOL,
]);

export function isMerklRewardsReadTool(toolName: string): boolean {
	return MERKL_REWARDS_READ_TOOLS.has(toolName);
}

function parseOptionalAddress(raw: unknown): Address | undefined {
	if (typeof raw !== 'string' || !raw.trim() || !isAddress(raw.trim())) return undefined;
	return getAddress(raw.trim());
}

export async function adaptMerklRewardsReadMcpInput(
	config: NodeSdkConfig,
	toolName: string,
	input: Record<string, unknown>,
): Promise<SdkResult<Record<string, unknown>>> {
	if (!isMerklRewardsReadTool(toolName)) {
		return {ok: true, data: input};
	}

	const adapted: Record<string, unknown> = {...input};
	const chainId = parseEvmChainId(adapted.chainId);
	if (!Number.isFinite(chainId) || chainId <= 0) {
		return {ok: false, reason: 'chainId must be a positive EVM chain id.'};
	}
	adapted.chainId = chainId;

	let user = parseOptionalAddress(adapted.user);
	if (!user) {
		const keyGenIdRaw = String(adapted.keyGenId ?? '').trim();
		if (!keyGenIdRaw) {
			return {ok: false, reason: 'Pass keyGenId (preferred) or user.'};
		}
		const keyGenIdParsed = parseKeyGenRequestId(keyGenIdRaw);
		if (!keyGenIdParsed.ok) return keyGenIdParsed;
		const kg = await fetchKeyGenResult(config, keyGenIdParsed.data);
		if (!kg.ok) return kg;
		const eth = String(kg.data.ethereumaddress ?? '').trim();
		if (!eth) {
			return {ok: false, reason: 'KeyGen result missing ethereumaddress.'};
		}
		try {
			user = getAddress(eth.startsWith('0x') ? eth : `0x${eth}`);
		} catch {
			return {ok: false, reason: 'KeyGen ethereumaddress is not a valid EVM address.'};
		}
	}
	adapted.user = user;
	return {ok: true, data: adapted};
}

export async function prepareWalletWideMerklClaimInput(
	input: Record<string, unknown>,
	enriched: EnrichedMultisignContext,
): Promise<SdkResult<Record<string, unknown>>> {
	const claimData = String(input.claimData ?? '').trim();
	const distributor = parseOptionalAddress(input.distributor) ?? MERKL_DISTRIBUTOR_ADDRESS;
	const valueWei = BigInt(String(input.valueWei ?? '0'));
	const user = getAddress(enriched.executorAddress);

	if (claimData) {
		if (!claimData.startsWith('0x')) {
			return {ok: false, reason: 'claimData must be hex calldata (0x…).'};
		}
		return {
			ok: true,
			data: {
				...input,
				to: distributor,
				data: claimData as `0x${string}`,
				valueWei,
				claimLeafCount:
					typeof input.claimLeafCount === 'number' && input.claimLeafCount > 0
						? input.claimLeafCount
						: 1,
			},
		};
	}

	const all = await fetchAllMerklDistributorClaimLeaves({
		chainId: enriched.chainId,
		user,
	});
	const leaves = selectWalletWideMerklClaimLeaves(all);
	if (leaves.length === 0) {
		return {
			ok: false,
			reason: 'No claimable Merkl rewards on this chain for your address.',
		};
	}
	const data = encodeMerklDistributorClaimData({user, leaves});
	return {
		ok: true,
		data: {
			...input,
			to: distributor,
			data,
			valueWei,
			claimLeafCount: leaves.length,
		},
	};
}
