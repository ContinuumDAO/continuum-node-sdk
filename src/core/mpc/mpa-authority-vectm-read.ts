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
import {fetchKeyGenResult, getKeyGenParentGroupId} from '../keygen-read.js';
import {nodeId} from '../general.js';
import {managementGet} from '../../api/management-api.js';

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

const VE_LOCKED_ABI = [
	{
		inputs: [{name: '_tokenId', type: 'uint256'}],
		name: 'locked',
		outputs: [
			{name: 'amount', type: 'int128'},
			{name: 'end', type: 'uint256'},
		],
		stateMutability: 'view',
		type: 'function',
	},
] as const;

export {
	ATTACH_VECTM_SIGNATURE,
	VECTM_NODE_INFO_TUPLE,
	attachVeCtmComposeArgs,
	encodeNodeInfoTupleValue,
	type VeCtmNodeInfo,
} from './mpa-authority-vectm-args.js';

/** Resolve the attaching KeyGen's mpc-auth GroupId. Empty group cannot bind a veCTM waiver. */
export async function resolveAttachVeCtmGroupId(
	config: NodeSdkConfig,
	keyGenId: string,
): Promise<SdkResult<string>> {
	const parent = await getKeyGenParentGroupId(config, {id: keyGenId});
	if (!parent.ok) return parent;
	const groupId = parent.data.groupId.trim();
	if (!groupId) {
		return {
			ok: false,
			reason: 'Empty groupId cannot attach veCTM. Use a KeyGen that belongs to an mpc-auth group.',
		};
	}
	return {ok: true, data: groupId};
}

/** On-chain attach rules: authority + owner, 1:1 KeyGen/token, locked CTM vs veCtmThresholdPower. */
export async function preflightAttachVeCtm(args: {
	nodeKey: string;
	tokenId: string;
	executor: Address;
}): Promise<SdkResult<true>> {
	const client = getMpaPublicClient();
	const mpa = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
	let tokenId: bigint;
	try {
		tokenId = BigInt(args.tokenId);
	} catch {
		return {ok: false, reason: 'tokenId must be a uint256.'};
	}
	if (tokenId <= 0n) {
		return {ok: false, reason: 'tokenId must be greater than zero.'};
	}
	const [authority, ve, threshold, nodeProperties] = await Promise.all([
		client.readContract({
			address: mpa,
			abi: MPA_WALLET_READ_ABI,
			functionName: 'getNodeWithdrawAuthority',
			args: [args.nodeKey],
		}),
		client.readContract({address: mpa, abi: MPA_WALLET_READ_ABI, functionName: 've'}),
		client.readContract({address: mpa, abi: MPA_WALLET_READ_ABI, functionName: 'veCtmThresholdPower'}),
		client.readContract({address: mpa, abi: MPA_WALLET_READ_ABI, functionName: 'nodeProperties'}),
	]);
	if (ve === zeroAddress || nodeProperties === zeroAddress) {
		return {ok: false, reason: 'veCTM is not live on the fee contract yet.'};
	}
	const [owner, locked] = await Promise.all([
		client.readContract({
			address: ve,
			abi: ERC721_OWNER_ABI,
			functionName: 'ownerOf',
			args: [tokenId],
		}),
		client.readContract({
			address: ve,
			abi: VE_LOCKED_ABI,
			functionName: 'locked',
			args: [tokenId],
		}),
	]);
	if (owner.toLowerCase() !== args.executor.toLowerCase()) {
		return {ok: false, reason: `KeyGen ${args.executor} does not own veCTM token ${args.tokenId}.`};
	}
	if (authority === zeroAddress || args.executor.toLowerCase() !== authority.toLowerCase()) {
		return {
			ok: false,
			reason: `Compose attachVeCtm from the claimed authority KeyGen (${authority}), which must own the NFT.`,
		};
	}
	const lockedRaw = Array.isArray(locked) ? locked[0] : locked.amount;
	const lockedAmount = lockedRaw < 0n ? 0n : BigInt(lockedRaw);
	if (threshold > 0n && lockedAmount < threshold) {
		return {
			ok: false,
			reason: `Locked CTM on veCTM #${args.tokenId} is below MultiSignAgentWallet.veCtmThresholdPower (${threshold.toString()} wei).`,
		};
	}
	const [attachedKey, attachedForKey] = await Promise.all([
		client.readContract({
			address: nodeProperties,
			abi: NODE_PROPERTIES_ABI,
			functionName: 'attachedKeyGen',
			args: [tokenId],
		}),
		client.readContract({
			address: nodeProperties,
			abi: NODE_PROPERTIES_ABI,
			functionName: 'attachedTokenId',
			args: [args.executor],
		}),
	]);
	if (attachedKey !== zeroAddress) {
		return {
			ok: false,
			reason: `veCTM #${args.tokenId} is already attached. You cannot replace an attached NFT.`,
		};
	}
	if (attachedForKey !== 0n) {
		return {
			ok: false,
			reason:
				`This KeyGen already has veCTM #${attachedForKey} attached. Request detach and wait for governance. ` +
				"A second group on this node attaches after rotating nodeWithdrawAuthority to that group's secp256k1 KeyGen.",
		};
	}
	return {ok: true, data: true};
}

/** Request-detach rules: NFT owner (attached KeyGen), not current authority unless they are the same. */
export async function preflightRequestVeCtmDetach(args: {
	tokenId: string;
	executor: Address;
}): Promise<SdkResult<true>> {
	const client = getMpaPublicClient();
	const mpa = MPA_WALLET_CONTRACT_CONFIG.contractAddress as Address;
	let tokenId: bigint;
	try {
		tokenId = BigInt(args.tokenId);
	} catch {
		return {ok: false, reason: 'tokenId must be a uint256.'};
	}
	const nodeProperties = await client.readContract({
		address: mpa,
		abi: MPA_WALLET_READ_ABI,
		functionName: 'nodeProperties',
	});
	if (nodeProperties === zeroAddress) {
		return {ok: false, reason: 'veCTM is not live on the fee contract yet.'};
	}
	const [attachedKey, alreadyRequested] = await Promise.all([
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
	if (attachedKey === zeroAddress) {
		return {ok: false, reason: `veCTM #${args.tokenId} is not attached to a node.`};
	}
	if (alreadyRequested) {
		return {
			ok: false,
			reason: `Detach already requested for veCTM #${args.tokenId}. The NFT stays attached until governance executes detach.`,
		};
	}
	if (attachedKey.toLowerCase() !== args.executor.toLowerCase()) {
		return {
			ok: false,
			reason: `Request detach from the attached KeyGen (${attachedKey}), which owns the NFT — not the current withdraw authority unless they are the same.`,
		};
	}
	return {ok: true, data: true};
}

export function getMpaPublicClient() {
	const chain = defineChain({
		id: MPA_WALLET_CONTRACT_CONFIG.chainId,
		name: MPA_WALLET_CONTRACT_CONFIG.chainName,
		nativeCurrency: {decimals: 18, name: 'Ether', symbol: 'ETH'},
		rpcUrls: {default: {http: [MPA_WALLET_CONTRACT_CONFIG.rpcUrl]}},
	});
	return createPublicClient({
		chain,
		transport: http(MPA_WALLET_CONTRACT_CONFIG.rpcUrl),
	});
}

export async function resolveNodeKey(
	config: NodeSdkConfig,
	override?: string,
): Promise<SdkResult<string>> {
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

export const CLAIM_NODE_AUTHORITY_DEADLINE_SECONDS = 24 * 60 * 60;

export function claimNodeAuthorityDeadlineUnix(nowMs = Date.now()): number {
	return Math.floor(nowMs / 1000) + CLAIM_NODE_AUTHORITY_DEADLINE_SECONDS;
}

export function buildNodeAuthorityClaimTypedData(input: {
	nodeId: Hex;
	authority: Address;
	deadline: bigint | number | string;
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
				{name: 'deadline', type: 'uint256'},
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
			deadline: String(input.deadline),
		},
	};
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

export type NodePrivilegeStatusData = {
	entitled: boolean;
	source: string;
	paused: boolean;
	hasattachedvectm: boolean;
	meetsthreshold: boolean;
	tokenid: string;
	thresholdpower: string;
	reason?: string;
};

export async function getNodePrivilegeStatus(
	config: NodeSdkConfig,
): Promise<SdkResult<NodePrivilegeStatusData>> {
	const raw = await managementGet<unknown>(config, '/getNodePrivilegeStatus');
	if (!raw.ok) return raw;
	const record = (raw.data ?? {}) as Record<string, unknown>;
	return {
		ok: true,
		data: {
			entitled: Boolean(record.entitled ?? record.Entitled),
			source: String(record.source ?? record.Source ?? 'vectm_attach'),
			paused: Boolean(record.paused ?? record.Paused),
			hasattachedvectm: Boolean(record.hasattachedvectm ?? record.hasAttachedVeCtm),
			meetsthreshold: Boolean(record.meetsthreshold ?? record.meetsThreshold),
			tokenid: String(record.tokenid ?? record.tokenId ?? '0'),
			thresholdpower: String(record.thresholdpower ?? record.thresholdPower ?? '0'),
			reason: record.reason != null ? String(record.reason) : undefined,
		},
	};
}

