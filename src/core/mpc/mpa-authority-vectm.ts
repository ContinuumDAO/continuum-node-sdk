import {
	createPublicClient,
	defineChain,
	getAddress,
	http,
	zeroAddress,
	type Address,
	type Hex,
} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import {MPA_WALLET_CONTRACT_CONFIG, MPA_WALLET_READ_ABI} from '../../config/mpa-wallet.js';
import type {SdkResult} from '../result.js';
import {fetchKeyGenResult, getKeyGenParentGroupId} from '../keygen.js';
import {buildMultiSignProposal} from '../../evm/proposal-builder.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {assertExecutorNativeSufficientForProposal} from './gas-preflight.js';
import {nodeId} from '../general.js';
import {postSignedManagementRequest} from '../vpn/vpn-signed.js';
import {feeAddressKindForKeyGen} from './address-kind.js';
import type {MpaProposalAction} from './mpa-billing-actions.js';

const ZERO = '0x0000000000000000000000000000000000000000';

const NODE_PROPERTIES_ABI = [
	{
		inputs: [{name: 'keyGen', type: 'address'}],
		name: 'attachedTokenId',
		outputs: [{name: '', type: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{name: 'tokenId', type: 'uint256'}],
		name: 'attachedKeyGen',
		outputs: [{name: '', type: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{name: 'tokenId', type: 'uint256'}],
		name: 'nodeRequestingDetachment',
		outputs: [{name: '', type: 'bool'}],
		stateMutability: 'view',
		type: 'function',
	},
] as const;

const ERC721_OWNER_ABI = [
	{
		inputs: [{name: 'tokenId', type: 'uint256'}],
		name: 'ownerOf',
		outputs: [{name: '', type: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
] as const;

export type VeCtmNodeInfo = {
	forum?: string;
	forumHandle?: string;
	email?: string;
	hardware?: [number, number, number, number];
	ipv4?: [number, number, number, number];
	specs?: [number, number, number, number, number, number, number, number];
	ipv6?: [number, number, number, number, number, number, number, number];
	hosting?: string;
	ram?: bigint | number | string;
	cpu?: bigint | number | string;
	ip?: string;
	vps?: string;
	dIDType?: string;
	dID?: string;
	extra?: string;
};

export const VECTM_NODE_INFO_TUPLE =
	'(string,string,uint8[4],uint16[8],string,uint256,uint256,string,string,bytes)' as const;

export const ATTACH_VECTM_SIGNATURE =
	`attachVeCtm(string,uint256,${VECTM_NODE_INFO_TUPLE})` as const;

function getMpaPublicClient() {
	const chain = defineChain({
		id: MPA_WALLET_CONTRACT_CONFIG.chainId,
		name: 'Linea Mainnet',
		nativeCurrency: {decimals: 18, name: 'Ether', symbol: 'ETH'},
		rpcUrls: {default: {http: [MPA_WALLET_CONTRACT_CONFIG.rpcUrl]}},
	});
	return createPublicClient({
		chain,
		transport: http(MPA_WALLET_CONTRACT_CONFIG.rpcUrl),
	});
}

async function resolveNodeKey(config: NodeSdkConfig, override?: string): Promise<SdkResult<string>> {
	if (override?.trim()) return {ok: true, data: override.trim()};
	const self = await nodeId(config);
	if (!self.ok) return self;
	return {ok: true, data: self.data.nodeId};
}

export async function getNodeWithdrawAuthority(
	config: NodeSdkConfig,
	input: {nodeKey?: string} = {},
): Promise<SdkResult<{authority: Address; nodeKey: string}>> {
	const nodeKeyRes = await resolveNodeKey(config, input.nodeKey);
	if (!nodeKeyRes.ok) return nodeKeyRes;
	const client = getMpaPublicClient();
	const authority = await client.readContract({
		address: MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'getNodeWithdrawAuthority',
		args: [nodeKeyRes.data],
	});
	return {ok: true, data: {authority, nodeKey: nodeKeyRes.data}};
}

export function buildNodeAuthorityClaimTypedData(input: {
	nodeId: Hex;
	authority: Address;
	chainId?: number;
	verifyingContract?: Address;
}) {
	const chainId = input.chainId ?? MPA_WALLET_CONTRACT_CONFIG.chainId;
	const verifyingContract = input.verifyingContract ?? (MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address);
	return {
		types: {
			EIP712Domain: [
				{name: 'name', type: 'string'},
				{name: 'version', type: 'string'},
				{name: 'chainId', type: 'uint256'},
				{name: 'verifyingContract', type: 'address'},
			],
			NodeAuthorityClaim: [
				{name: 'nodeId', type: 'bytes32'},
				{name: 'authority', type: 'address'},
			],
		},
		primaryType: 'NodeAuthorityClaim' as const,
		domain: {
			name: 'MultiSignAgentWallet',
			version: '1',
			chainId,
			verifyingContract,
		},
		message: {
			nodeId: input.nodeId,
			authority: input.authority,
		},
	};
}

export async function claimNodeWithdrawAuthority(
	config: NodeSdkConfig,
	input: {keyGenId: string; authority?: string; nodeKey?: string; purpose?: string; useCustomGas?: boolean; startingNonce?: number},
): Promise<SdkResult<{requestId?: string; typedData?: unknown; signature?: string; reason?: string}>> {
	const kg = await fetchKeyGenResult(config, input.keyGenId);
	if (!kg.ok) return kg;
	const eth = kg.data.ethereumaddress?.trim();
	if (!eth) {
		return {ok: false, reason: 'Claim authority must be composed from a secp256k1 KeyGen with an ethereum address.'};
	}
	const authority = getAddress((input.authority ?? eth).startsWith('0x') ? (input.authority ?? eth) : `0x${input.authority ?? eth}`) as Address;
	const nodeKeyRes = await resolveNodeKey(config, input.nodeKey);
	if (!nodeKeyRes.ok) return nodeKeyRes;

	const signed = await postSignedManagementRequest(config, '/signNodeAuthorityClaim', ctx => ({
		authority,
		nodeKey: ctx.nodeKey,
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
				typedData: buildNodeAuthorityClaimTypedData({nodeId: nodeIdBytes, authority}),
				reason: 'Node key EIP-712 sign is not available; claim authority first using the returned typed data.',
			},
		};
	}

	const signature = String(signed.data.data.signature ?? '');
	if (!signature) {
		return {
			ok: true,
			data: {
				typedData: signed.data.data.typedData,
				reason: 'signNodeAuthorityClaim returned no signature.',
			},
		};
	}

	const actions: MpaProposalAction[] = [
		{
			signature: 'claimNodeWithdrawAuthority(string,address,bytes)',
			contractAddress: MPA_WALLET_CONTRACT_CONFIG.contractAddress,
			args: [
				{name: 'nodeKey', type: 'string', value: nodeKeyRes.data},
				{name: 'authority', type: 'address', value: authority},
				{name: 'signature', type: 'bytes', value: signature},
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
	return {ok: true, data: {requestId: submitted.data.requestId, signature, typedData: signed.data.data.typedData}};
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
	const addressKind = feeAddressKindForKeyGen(kg.data as Record<string, unknown>);
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
	input: {keyGenId: string; amountWei: string; token?: string; purpose?: string; useCustomGas?: boolean; startingNonce?: number},
): Promise<SdkResult<{requestId: string}>> {
	const kg = await fetchKeyGenResult(config, input.keyGenId);
	if (!kg.ok) return kg;
	const nodeKeyRes = await resolveNodeKey(config);
	if (!nodeKeyRes.ok) return nodeKeyRes;
	const amount = BigInt(input.amountWei);
	if (amount <= 0n) return {ok: false, reason: 'amountWei must be positive.'};
	const token = input.token?.trim();
	const actions: MpaProposalAction[] = token
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

export async function isVeCtmLiveOnFeeContract(): Promise<boolean> {
	const client = getMpaPublicClient();
	const mpa = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
	try {
		const [nodeProperties, rewards, ve] = await Promise.all([
			client.readContract({address: mpa, abi: MPA_WALLET_READ_ABI, functionName: 'nodeProperties'}),
			client.readContract({address: mpa, abi: MPA_WALLET_READ_ABI, functionName: 'rewards'}),
			client.readContract({address: mpa, abi: MPA_WALLET_READ_ABI, functionName: 've'}),
		]);
		return nodeProperties !== zeroAddress && rewards !== zeroAddress && ve !== zeroAddress;
	} catch {
		return false;
	}
}

export async function getVeCtmAttachStatus(
	config: NodeSdkConfig,
	input: {keyGenId: string},
): Promise<
	SdkResult<{
		live: boolean;
		tokenId?: string;
		attachedKeyGen?: string;
		detachRequested?: boolean;
		groupId?: string;
	}>
> {
	const live = await isVeCtmLiveOnFeeContract();
	if (!live) {
		return {ok: true, data: {live: false}};
	}
	const kg = await fetchKeyGenResult(config, input.keyGenId);
	if (!kg.ok) return kg;
	const parent = await getKeyGenParentGroupId(config, {id: input.keyGenId});
	const groupId = parent.ok ? parent.data.groupId : undefined;
	const eth = kg.data.ethereumaddress?.trim();
	if (!eth) {
		return {
			ok: true,
			data: {
				live: true,
				tokenId: '0',
				groupId,
			},
		};
	}
	const client = getMpaPublicClient();
	const mpa = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
	const nodeProperties = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'nodeProperties',
	});
	const keyGen = getAddress(eth.startsWith('0x') ? eth : `0x${eth}`) as Address;
	const tokenId = await client.readContract({
		address: nodeProperties,
		abi: NODE_PROPERTIES_ABI,
		functionName: 'attachedTokenId',
		args: [keyGen],
	});
	if (tokenId === 0n) {
		return {ok: true, data: {live: true, tokenId: '0', groupId}};
	}
	let attachedKeyGen: string | undefined = keyGen;
	let detachRequested = false;
	try {
		const [attached, requested] = await Promise.all([
			client.readContract({
				address: nodeProperties,
				abi: NODE_PROPERTIES_ABI,
				functionName: 'attachedKeyGen',
				args: [tokenId],
			}),
			client.readContract({
				address: nodeProperties,
				abi: NODE_PROPERTIES_ABI,
				functionName: 'nodeRequestingDetachment',
				args: [tokenId],
			}),
		]);
		attachedKeyGen = attached;
		detachRequested = requested;
	} catch {
		/* live NodeProperties may omit these views */
	}
	return {
		ok: true,
		data: {
			live: true,
			tokenId: tokenId.toString(),
			attachedKeyGen,
			detachRequested,
			groupId,
		},
	};
}

export function encodeNodeInfoTupleValue(info: VeCtmNodeInfo | undefined): string {
	const ipv4 = info?.ipv4 ?? info?.hardware ?? [0, 0, 0, 0];
	const ipv6 = info?.ipv6 ?? info?.specs ?? [0, 0, 0, 0, 0, 0, 0, 0];
	return JSON.stringify([
		info?.forumHandle ?? info?.forum ?? '',
		info?.email ?? '',
		ipv4,
		ipv6,
		info?.vps ?? info?.hosting ?? '',
		String(info?.ram ?? 0),
		String(info?.cpu ?? 0),
		info?.dIDType ?? '',
		info?.dID ?? '',
		info?.extra ?? '0x',
	]);
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
	const nodeKeyRes = await resolveNodeKey(config);
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
				args: [
					{name: 'nodeKey', type: 'string', value: nodeKeyRes.data},
					{name: 'tokenId', type: 'uint256', value: input.tokenId},
					{
						name: 'nodeInfo',
						type: VECTM_NODE_INFO_TUPLE,
						value: encodeNodeInfoTupleValue(info),
					},
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
