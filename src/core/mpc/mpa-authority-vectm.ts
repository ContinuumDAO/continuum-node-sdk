import {
	getAddress,
	zeroAddress,
	type Address,
	type Hex,
} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import {MPA_WALLET_CONTRACT_CONFIG, MPA_WALLET_READ_ABI} from '../../config/mpa-wallet.js';
import type {SdkResult} from '../result.js';
import {fetchKeyGenResult} from '../keygen-read.js';
import {buildMultiSignProposal} from '../../evm/proposal-builder.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {assertExecutorNativeSufficientForProposal} from './gas-preflight.js';
import {postSignedManagementRequest} from '../vpn/vpn-signed.js';
import {feeAddressKindForKeyGen} from './address-kind.js';
import type {MpaProposalAction} from './mpa-billing-actions.js';
import {
	ATTACH_VECTM_SIGNATURE,
	attachVeCtmComposeArgs,
	buildNodeAuthorityClaimTypedData,
	claimNodeAuthorityDeadlineUnix,
	encodeNodeInfoTupleValue,
	getMpaPublicClient,
	getNodeWithdrawAuthority,
	getVeCtmAttachStatus,
	getNodePrivilegeStatus,
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
	getNodePrivilegeStatus,
	isVeCtmLiveOnFeeContract,
	type VeCtmNodeInfo,
};

const ZERO = '0x0000000000000000000000000000000000000000';

const ERC721_OWNER_ABI = [
	{
		inputs: [{name: 'tokenId', type: 'uint256'}],
		name: 'ownerOf',
		outputs: [{name: '', type: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
] as const;

export {getNodeWithdrawAuthority};

export async function claimNodeWithdrawAuthority(
	config: NodeSdkConfig,
	input: {keyGenId: string; authority?: string; nodeKey?: string; deadline?: number; purpose?: string; useCustomGas?: boolean; startingNonce?: number},
): Promise<SdkResult<{requestId?: string; typedData?: unknown; signature?: string; reason?: string; deadline?: string}>> {
	const kg = await fetchKeyGenResult(config, input.keyGenId);
	if (!kg.ok) return kg;
	const eth = kg.data.ethereumaddress?.trim();
	if (!eth) {
		return {ok: false, reason: 'Claim authority must be composed from a secp256k1 KeyGen with an ethereum address.'};
	}
	const authority = getAddress((input.authority ?? eth).startsWith('0x') ? (input.authority ?? eth) : `0x${input.authority ?? eth}`) as Address;
	const nodeKeyRes = await resolveNodeKey(config, input.nodeKey);
	if (!nodeKeyRes.ok) return nodeKeyRes;

	const deadline = input.deadline && input.deadline > 0 ? input.deadline : claimNodeAuthorityDeadlineUnix();
	const signed = await postSignedManagementRequest(config, '/signNodeAuthorityClaim', ctx => ({
		authority,
		nodeKey: ctx.nodeKey,
		deadline,
	}));
	if (!signed.ok) {
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
				typedData: buildNodeAuthorityClaimTypedData({nodeId: nodeIdBytes, authority, deadline}),
				deadline: String(deadline),
				reason: 'Node key EIP-712 sign is not available; claim authority first using the returned typed data.',
			},
		};
	}

	const signature = String(signed.data.data.signature ?? '');
	const signedDeadline = String(signed.data.data.deadline ?? deadline);
	if (!signature) {
		return {
			ok: true,
			data: {
				typedData: signed.data.data.typedData,
				deadline: signedDeadline,
				reason: 'signNodeAuthorityClaim returned no signature.',
			},
		};
	}

	const actions: MpaProposalAction[] = [
		{
			signature: 'claimNodeWithdrawAuthority(string,address,bytes,uint256)',
			contractAddress: MPA_WALLET_CONTRACT_CONFIG.contractAddress,
			args: [
				{name: 'nodeKey', type: 'string', value: nodeKeyRes.data},
				{name: 'authority', type: 'address', value: authority},
				{name: 'signature', type: 'bytes', value: signature},
				{name: 'deadline', type: 'uint256', value: signedDeadline},
			],
		},
	];
	const built = await buildMultiSignProposal(config, {
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
		proposal: built.data,
	});
	if (!preflight.ok) return preflight;
	const submitted = await signAndSubmitMultiSignRequest(config, built.data.unsignedBody);
	if (!submitted.ok) return submitted;
	return {ok: true, data: {requestId: submitted.data.requestId, signature, typedData: signed.data.data.typedData, deadline: signedDeadline}};
}

export async function unregisterKeyGenOnLinea(
	config: NodeSdkConfig,
	input: {keyGenId: string; purpose?: string; useCustomGas?: boolean; startingNonce?: number; executorKeyGenId?: string},
): Promise<SdkResult<{requestId: string}>> {
	const kg = await fetchKeyGenResult(config, input.keyGenId);
	if (!kg.ok) return kg;
	const executorId = input.executorKeyGenId?.trim() || input.keyGenId;
	const executorKg = executorId === input.keyGenId ? kg : await fetchKeyGenResult(config, executorId);
	if (!executorKg.ok) return executorKg;
	const nodeKeyRes = await resolveNodeKey(config);
	if (!nodeKeyRes.ok) return nodeKeyRes;
	const addressKind = feeAddressKindForKeyGen(executorKg.data as Record<string, unknown>);
	const built = await buildMultiSignProposal(config, {
		keyGenResult: executorKg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		purpose: input.purpose ?? 'Unregister KeyGen from MultiSignAgentWallet',
		useCustomGas: input.useCustomGas,
		startingNonce: input.startingNonce,
		actions: [
			{
				signature: 'unregisterKeyGen(string,string,string)',
				contractAddress: MPA_WALLET_CONTRACT_CONFIG.contractAddress,
				args: [
					{name: 'keyGenId', type: 'string', value: input.keyGenId},
					{name: 'addressKind', type: 'string', value: addressKind},
					{name: 'nodeKey', type: 'string', value: nodeKeyRes.data},
				],
			},
		],
	});
	if (!built.ok) return built;
	const preflight = await assertExecutorNativeSufficientForProposal(config, {
		keyGenResult: executorKg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		proposal: built.data,
	});
	if (!preflight.ok) return preflight;
	return signAndSubmitMultiSignRequest(config, built.data.unsignedBody);
}

export async function createMpaWithdrawMultiSignRequest(
	config: NodeSdkConfig,
	input: {
		keyGenId: string;
		amountWei: string;
		token?: string;
		paymentToken?: 'fee' | 'ctm';
		purpose?: string;
		useCustomGas?: boolean;
		startingNonce?: number;
	},
): Promise<SdkResult<{requestId: string}>> {
	const kg = await fetchKeyGenResult(config, input.keyGenId);
	if (!kg.ok) return kg;
	const nodeKeyRes = await resolveNodeKey(config);
	if (!nodeKeyRes.ok) return nodeKeyRes;
	const amount = BigInt(input.amountWei);
	if (amount <= 0n) return {ok: false, reason: 'amountWei must be positive.'};
	const token = input.token?.trim();
	const actions: MpaProposalAction[] =
		input.paymentToken === 'ctm'
			? [
					{
						signature: 'withdrawCtmCredit(string,uint256)',
						contractAddress: MPA_WALLET_CONTRACT_CONFIG.contractAddress,
						args: [
							{name: 'nodeKey', type: 'string', value: nodeKeyRes.data},
							{name: 'amount', type: 'uint256', value: amount.toString()},
						],
					},
				]
			: token
				? [
						{
							signature: 'withdrawFeeCredit(string,address,uint256)',
							contractAddress: MPA_WALLET_CONTRACT_CONFIG.contractAddress,
							args: [
								{name: 'nodeKey', type: 'string', value: nodeKeyRes.data},
								{name: 'token', type: 'address', value: getAddress(token)},
								{name: 'amount', type: 'uint256', value: amount.toString()},
							],
						},
					]
				: [
						{
							signature: 'withdrawCredit(string,uint256)',
							contractAddress: MPA_WALLET_CONTRACT_CONFIG.contractAddress,
							args: [
								{name: 'nodeKey', type: 'string', value: nodeKeyRes.data},
								{name: 'amount', type: 'uint256', value: amount.toString()},
							],
						},
					];
	const built = await buildMultiSignProposal(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		purpose: input.purpose ?? 'Withdraw MPA node credit',
		useCustomGas: input.useCustomGas,
		startingNonce: input.startingNonce,
		actions,
	});
	if (!built.ok) return built;
	const preflight = await assertExecutorNativeSufficientForProposal(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		proposal: built.data,
	});
	if (!preflight.ok) return preflight;
	return signAndSubmitMultiSignRequest(config, built.data.unsignedBody);
}

export async function attachVeCtmToNode(
	config: NodeSdkConfig,
	input: {
		keyGenId: string;
		tokenId: string;
		nodeInfo?: VeCtmNodeInfo;
		purpose?: string;
		useCustomGas?: boolean;
		startingNonce?: number;
		nodeKey?: string;
	},
): Promise<SdkResult<{requestId: string}>> {
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
	const info = input.nodeInfo ?? {};
	const built = await buildMultiSignProposal(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		purpose: input.purpose ?? 'Attach veCTM for this KeyGen group',
		useCustomGas: input.useCustomGas,
		startingNonce: input.startingNonce,
		actions: [
			{
				signature: ATTACH_VECTM_SIGNATURE,
				contractAddress: MPA_WALLET_CONTRACT_CONFIG.contractAddress,
				args: attachVeCtmComposeArgs(nodeKeyRes.data, input.tokenId, info, groupIdRes.data),
			},
		],
	});
	if (!built.ok) return built;
	const preflight = await assertExecutorNativeSufficientForProposal(config, {
		keyGenResult: kg.data,
		chainId: MPA_WALLET_CONTRACT_CONFIG.chainId,
		proposal: built.data,
	});
	if (!preflight.ok) return preflight;
	return signAndSubmitMultiSignRequest(config, built.data.unsignedBody);
}

export async function requestVeCtmDetach(
	config: NodeSdkConfig,
	input: {keyGenId: string; tokenId?: string; purpose?: string; useCustomGas?: boolean; startingNonce?: number},
): Promise<SdkResult<{requestId: string}>> {
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
	const built = await buildMultiSignProposal(config, {
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
		proposal: built.data,
	});
	if (!preflight.ok) return preflight;
	return signAndSubmitMultiSignRequest(config, built.data.unsignedBody);
}

export {ZERO as ZERO_ADDRESS};
