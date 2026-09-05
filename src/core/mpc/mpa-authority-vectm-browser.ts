import {getAddress, zeroAddress, type Address} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import {MPA_WALLET_CONTRACT_CONFIG, MPA_WALLET_READ_ABI} from '../../config/mpa-wallet.js';
import type {SdkResult} from '../result.js';
import {fetchKeyGenResult} from '../keygen-read.js';
import {buildMultiSignProposalBody} from '../../evm/proposal-body.js';
import {assertExecutorNativeSufficientForProposal} from './gas-preflight.js';
import type {MpaProposalAction} from './mpa-billing-actions.js';
import {
	ATTACH_VECTM_SIGNATURE,
	attachVeCtmComposeArgs,
	buildNodeAuthorityClaimTypedData,
	claimNodeAuthorityDeadlineUnix,
	encodeNodeInfoTupleValue,
	getMpaPublicClient,
	getVeCtmAttachStatus,
	isVeCtmLiveOnFeeContract,
	resolveAttachVeCtmGroupId,
	resolveNodeKey,
	type VeCtmNodeInfo,
	VECTM_NODE_INFO_TUPLE,
} from './mpa-authority-vectm-read.js';

export {
	ATTACH_VECTM_SIGNATURE,
	VECTM_NODE_INFO_TUPLE,
	buildNodeAuthorityClaimTypedData,
	encodeNodeInfoTupleValue,
	getVeCtmAttachStatus,
	isVeCtmLiveOnFeeContract,
	type VeCtmNodeInfo,
};

const ERC721_OWNER_ABI = [
	{
		inputs: [{name: 'tokenId', type: 'uint256'}],
		name: 'ownerOf',
		outputs: [{name: '', type: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
] as const;

export async function buildAttachVeCtmMultiSignBody(
	config: NodeSdkConfig,
	input: {
		keyGenId: string;
		tokenId: string;
		nodeInfo?: VeCtmNodeInfo;
		nodeKey?: string;
		purpose?: string;
		useCustomGas?: boolean;
		startingNonce?: number;
	},
): Promise<SdkResult<{bodyForSign: Record<string, unknown>}>> {
	const live = await isVeCtmLiveOnFeeContract();
	if (!live) {
		return {ok: false, reason: 'veCTM is not live on the fee contract yet.'};
	}
	const kg = await fetchKeyGenResult(config, input.keyGenId);
	if (!kg.ok) return kg;
	const eth = kg.data.ethereumaddress?.trim();
	if (!eth) {
		return {ok: false, reason: 'Attach veCTM from the secp256k1 KeyGen that owns the NFT.'};
	}
	const client = getMpaPublicClient();
	const mpa = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
	const nodeKeyRes = await resolveNodeKey(config, input.nodeKey);
	if (!nodeKeyRes.ok) return nodeKeyRes;
	const authority = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getNodeWithdrawAuthority',
		args: [nodeKeyRes.data],
	});
	const ve = await client.readContract({address: mpa, abi: MPA_WALLET_READ_ABI, functionName: 've'});
	const owner = await client.readContract({
		address: ve,
		abi: ERC721_OWNER_ABI,
		functionName: 'ownerOf',
		args: [BigInt(input.tokenId)],
	});
	const executor = getAddress(eth.startsWith('0x') ? eth : `0x${eth}`);
	if (owner.toLowerCase() !== executor.toLowerCase()) {
		return {ok: false, reason: `KeyGen ${executor} does not own veCTM token ${input.tokenId}.`};
	}
	if (authority === zeroAddress || executor.toLowerCase() !== authority.toLowerCase()) {
		return {
			ok: false,
			reason: `Compose attachVeCtm from the claimed authority KeyGen (${authority}), which must own the NFT.`,
		};
	}
	const groupIdRes = await resolveAttachVeCtmGroupId(config, input.keyGenId);
	if (!groupIdRes.ok) return groupIdRes;
	const built = await buildMultiSignProposalBody(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		purpose: input.purpose ?? 'Attach veCTM for this KeyGen group',
		useCustomGas: input.useCustomGas,
		startingNonce: input.startingNonce,
		actions: [
			{
				signature: ATTACH_VECTM_SIGNATURE,
				contractAddress: MPA_WALLET_CONTRACT_CONFIG.contractAddress,
				args: attachVeCtmComposeArgs(nodeKeyRes.data, input.tokenId, input.nodeInfo, groupIdRes.data),
			},
		],
	});
	if (!built.ok) return built;
	const preflight = await assertExecutorNativeSufficientForProposal(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		proposal: {bodyForSign: built.data.bodyForSign},
	});
	if (!preflight.ok) return preflight;
	return {ok: true, data: {bodyForSign: built.data.bodyForSign}};
}

export async function buildRequestVeCtmDetachMultiSignBody(
	config: NodeSdkConfig,
	input: {
		keyGenId: string;
		tokenId?: string;
		nodeKey?: string;
		purpose?: string;
		useCustomGas?: boolean;
		startingNonce?: number;
	},
): Promise<SdkResult<{bodyForSign: Record<string, unknown>}>> {
	const live = await isVeCtmLiveOnFeeContract();
	if (!live) {
		return {ok: false, reason: 'veCTM is not live on the fee contract yet.'};
	}
	const status = await getVeCtmAttachStatus(config, {keyGenId: input.keyGenId});
	if (!status.ok) return status;
	const tokenId = input.tokenId ?? status.data.tokenId;
	if (!tokenId || tokenId === '0') {
		return {ok: false, reason: 'No veCTM token is attached to this KeyGen.'};
	}
	const kg = await fetchKeyGenResult(config, input.keyGenId);
	if (!kg.ok) return kg;
	const client = getMpaPublicClient();
	const nodeProperties = await client.readContract({
		address: MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'nodeProperties',
	});
	const built = await buildMultiSignProposalBody(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		purpose: input.purpose ?? 'Request veCTM detach',
		useCustomGas: input.useCustomGas,
		startingNonce: input.startingNonce,
		actions: [
			{
				signature: 'setNodeRemovalStatus(uint256,bool)',
				contractAddress: nodeProperties,
				args: [
					{name: 'tokenId', type: 'uint256', value: tokenId},
					{name: 'status', type: 'bool', value: 'true'},
				],
			},
		],
	});
	if (!built.ok) return built;
	const preflight = await assertExecutorNativeSufficientForProposal(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		proposal: {bodyForSign: built.data.bodyForSign},
	});
	if (!preflight.ok) return preflight;
	return {ok: true, data: {bodyForSign: built.data.bodyForSign}};
}

/** Browser-safe claim path when local node-key EIP-712 sign is unavailable. */
export async function claimNodeWithdrawAuthorityBrowser(
	config: NodeSdkConfig,
	input: {keyGenId: string; authority?: string; nodeKey?: string; deadline?: number},
): Promise<
	SdkResult<{
		typedData: ReturnType<typeof buildNodeAuthorityClaimTypedData>;
		reason: string;
	}>
> {
	const kg = await fetchKeyGenResult(config, input.keyGenId);
	if (!kg.ok) return kg;
	const eth = kg.data.ethereumaddress?.trim();
	if (!eth) {
		return {
			ok: false,
			reason: 'Claim authority must be composed from a secp256k1 KeyGen with an ethereum address.',
		};
	}
	const authority = getAddress(
		(input.authority ?? eth).startsWith('0x') ? (input.authority ?? eth) : `0x${input.authority ?? eth}`,
	) as Address;
	const nodeKeyRes = await resolveNodeKey(config, input.nodeKey);
	if (!nodeKeyRes.ok) return nodeKeyRes;
	const client = getMpaPublicClient();
	const nodeIdBytes = await client.readContract({
		address: MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'nodeIdOfNodeKey',
		args: [nodeKeyRes.data],
	});
	return {
		ok: true,
		data: {
			typedData: buildNodeAuthorityClaimTypedData({
				nodeId: nodeIdBytes,
				authority,
				deadline: input.deadline && input.deadline > 0 ? input.deadline : claimNodeAuthorityDeadlineUnix(),
			}),
			reason:
				'Node key EIP-712 sign is not available; claim authority first using the returned typed data.',
		},
	};
}

export async function buildClaimNodeWithdrawAuthorityMultiSignBody(
	config: NodeSdkConfig,
	input: {
		keyGenId: string;
		authority: string;
		nodeKey: string;
		signature: string;
		deadline: number | string;
		purpose?: string;
		useCustomGas?: boolean;
		startingNonce?: number;
	},
): Promise<SdkResult<{bodyForSign: Record<string, unknown>}>> {
	const kg = await fetchKeyGenResult(config, input.keyGenId);
	if (!kg.ok) return kg;
	const authority = getAddress(
		input.authority.startsWith('0x') ? input.authority : `0x${input.authority}`,
	) as Address;
	const actions: MpaProposalAction[] = [
		{
			signature: 'claimNodeWithdrawAuthority(string,address,bytes,uint256)',
			contractAddress: MPA_WALLET_CONTRACT_CONFIG.contractAddress,
			args: [
				{name: 'nodeKey', type: 'string', value: input.nodeKey},
				{name: 'authority', type: 'address', value: authority},
				{name: 'signature', type: 'bytes', value: input.signature},
				{name: 'deadline', type: 'uint256', value: String(input.deadline)},
			],
		},
	];
	const built = await buildMultiSignProposalBody(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		purpose: input.purpose ?? 'Claim node withdraw authority on Linea',
		useCustomGas: input.useCustomGas,
		startingNonce: input.startingNonce,
		actions,
	});
	if (!built.ok) return built;
	const preflight = await assertExecutorNativeSufficientForProposal(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		proposal: {bodyForSign: built.data.bodyForSign},
	});
	if (!preflight.ok) return preflight;
	return {ok: true, data: {bodyForSign: built.data.bodyForSign}};
}
