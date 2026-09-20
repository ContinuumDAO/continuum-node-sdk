import {
	createPublicClient,
	defineChain,
	getAddress,
	http,
	parseAbiItem,
	zeroAddress,
	type Address,
	type PublicClient,
} from 'viem';
import {
	LINEA_MAINNET_DEFAULT_RPC,
	MPA_WALLET_CONTRACT_CONFIG,
} from '../../config/mpa-wallet.js';
import type {SdkResult} from '../result.js';
import {LINEA_CHAIN_ID} from './constants.js';

const VOTING_ESCROW_ADDRESS_ABI = [
	{
		inputs: [],
		name: 'token',
		outputs: [{name: '', type: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'governor',
		outputs: [{name: '', type: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'nodeProperties',
		outputs: [{name: '', type: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'rewards',
		outputs: [{name: '', type: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'treasury',
		outputs: [{name: '', type: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
] as const;

const NODE_PROPERTIES_MSAW_ABI = [
	{
		inputs: [],
		name: 'msaw',
		outputs: [{name: '', type: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
] as const;

export type VotingEscrowAddressViews = {
	token: Address;
	governor: Address;
	nodeProperties: Address;
	rewards: Address;
	treasury: Address;
};

export type VeCtmAccountVoting = {
	votingPower: bigint;
	delegates: Address;
	lastVotedAt?: number;
	lastVotedProposalId?: string;
	lastVotedNote?: string;
};

export type VeCtmLocked = {
	amount: bigint;
	end: bigint;
};

export type ContinuumDaoOnchainDeps = {
	readVotingEscrow?: (ve: Address) => Promise<VotingEscrowAddressViews>;
	readNodePropertiesMsaw?: (nodeProperties: Address) => Promise<Address>;
	readAccountVoting?: (
		ve: Address,
		governor: Address,
		account: Address,
	) => Promise<VeCtmAccountVoting>;
	readTokenOwner?: (ve: Address, tokenId: bigint) => Promise<Address>;
	readLocked?: (ve: Address, tokenId: bigint) => Promise<VeCtmLocked>;
	lineaRpcUrl?: string;
};

function lineaRpcUrl(deps?: ContinuumDaoOnchainDeps): string {
	return (
		deps?.lineaRpcUrl?.trim() ||
		process.env['LINEA_RPC_URL']?.trim() ||
		LINEA_MAINNET_DEFAULT_RPC
	);
}

export function getLineaPublicClient(deps?: ContinuumDaoOnchainDeps): PublicClient {
	const rpcUrl = lineaRpcUrl(deps);
	const chain = defineChain({
		id: LINEA_CHAIN_ID,
		name: MPA_WALLET_CONTRACT_CONFIG.chainName,
		nativeCurrency: {decimals: 18, name: 'Ether', symbol: 'ETH'},
		rpcUrls: {default: {http: [rpcUrl]}},
	});
	return createPublicClient({
		chain,
		transport: http(rpcUrl),
	});
}

async function defaultReadVotingEscrow(
	ve: Address,
	deps?: ContinuumDaoOnchainDeps,
): Promise<VotingEscrowAddressViews> {
	const client = getLineaPublicClient(deps);
	const [token, governor, nodeProperties, rewards, treasury] = await Promise.all([
		client.readContract({address: ve, abi: VOTING_ESCROW_ADDRESS_ABI, functionName: 'token'}),
		client.readContract({address: ve, abi: VOTING_ESCROW_ADDRESS_ABI, functionName: 'governor'}),
		client.readContract({
			address: ve,
			abi: VOTING_ESCROW_ADDRESS_ABI,
			functionName: 'nodeProperties',
		}),
		client.readContract({address: ve, abi: VOTING_ESCROW_ADDRESS_ABI, functionName: 'rewards'}),
		client.readContract({address: ve, abi: VOTING_ESCROW_ADDRESS_ABI, functionName: 'treasury'}),
	]);
	return {token, governor, nodeProperties, rewards, treasury};
}

async function defaultReadNodePropertiesMsaw(
	nodeProperties: Address,
	deps?: ContinuumDaoOnchainDeps,
): Promise<Address> {
	const client = getLineaPublicClient(deps);
	return client.readContract({
		address: nodeProperties,
		abi: NODE_PROPERTIES_MSAW_ABI,
		functionName: 'msaw',
	});
}

export type VotingEscrowDerivedAddresses = {
	token?: Address;
	governor?: Address;
	nodeProperties?: Address;
	rewards?: Address;
	treasury?: Address;
	msaw?: Address;
};

export async function readVotingEscrowDerivedAddresses(
	votingEscrow: string,
	deps?: ContinuumDaoOnchainDeps,
): Promise<SdkResult<VotingEscrowDerivedAddresses>> {
	let ve: Address;
	try {
		ve = getAddress(votingEscrow);
	} catch {
		return {ok: false, reason: 'VotingEscrow address from the API is not a valid EVM address.'};
	}
	if (ve === zeroAddress) {
		return {ok: false, reason: 'VotingEscrow address from the API is the zero address.'};
	}
	try {
		const views = await (deps?.readVotingEscrow
			? deps.readVotingEscrow(ve)
			: defaultReadVotingEscrow(ve, deps));
		const derived: VotingEscrowDerivedAddresses = {};
		if (views.token !== zeroAddress) {
			derived.token = getAddress(views.token);
		}
		if (views.governor !== zeroAddress) {
			derived.governor = getAddress(views.governor);
		}
		if (views.nodeProperties !== zeroAddress) {
			derived.nodeProperties = getAddress(views.nodeProperties);
		}
		if (views.rewards !== zeroAddress) {
			derived.rewards = getAddress(views.rewards);
		}
		if (views.treasury !== zeroAddress) {
			derived.treasury = getAddress(views.treasury);
		}
		if (derived.nodeProperties) {
			try {
				const msaw = await (deps?.readNodePropertiesMsaw
					? deps.readNodePropertiesMsaw(derived.nodeProperties)
					: defaultReadNodePropertiesMsaw(derived.nodeProperties, deps));
				if (msaw !== zeroAddress) {
					derived.msaw = getAddress(msaw);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					ok: false,
					reason: `NodeProperties.msaw() failed: ${message}`,
				};
			}
		}
		return {ok: true, data: derived};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: `VotingEscrow address views failed: ${message}`};
	}
}

const VE_ACCOUNT_ABI = [
	{
		inputs: [{name: 'account', type: 'address'}],
		name: 'getVotes',
		outputs: [{name: '', type: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{name: 'account', type: 'address'}],
		name: 'delegates',
		outputs: [{name: '', type: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
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

const VOTE_CAST_EVENT = parseAbiItem(
	'event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)',
);
const VOTE_CAST_WITH_PARAMS_EVENT = parseAbiItem(
	'event VoteCastWithParams(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason, bytes params)',
);

const LOG_LOOKBACK_BLOCKS = 200_000n;

async function latestVoteFromLogs(
	client: PublicClient,
	governor: Address,
	account: Address,
): Promise<{at: number; proposalId: string} | {note: string}> {
	const latest = await client.getBlockNumber();
	const fromBlock = latest > LOG_LOOKBACK_BLOCKS ? latest - LOG_LOOKBACK_BLOCKS : 0n;
	try {
		const [casts, castsWithParams] = await Promise.all([
			client.getLogs({
				address: governor,
				event: VOTE_CAST_EVENT,
				args: {voter: account},
				fromBlock,
				toBlock: latest,
			}),
			client.getLogs({
				address: governor,
				event: VOTE_CAST_WITH_PARAMS_EVENT,
				args: {voter: account},
				fromBlock,
				toBlock: latest,
			}),
		]);
		const logs = [...casts, ...castsWithParams].sort((a, b) => {
			if (a.blockNumber === b.blockNumber) {
				return Number(a.logIndex - b.logIndex);
			}
			return a.blockNumber < b.blockNumber ? -1 : 1;
		});
		const last = logs[logs.length - 1];
		if (!last) {
			return {
				note: `No VoteCast events for this address in the last ${LOG_LOOKBACK_BLOCKS} Linea blocks.`,
			};
		}
		const block = await client.getBlock({blockNumber: last.blockNumber});
		const proposalId = last.args.proposalId;
		if (proposalId == null) {
			return {note: 'Latest VoteCast log is missing proposalId.'};
		}
		return {
			at: Number(block.timestamp),
			proposalId: proposalId.toString(),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			note: `Could not read Governor VoteCast logs: ${message}. Load official etherscan for get_logs on the governor if the operator chooses it.`,
		};
	}
}

async function defaultReadAccountVoting(
	ve: Address,
	governor: Address,
	account: Address,
	deps?: ContinuumDaoOnchainDeps,
): Promise<VeCtmAccountVoting> {
	const client = getLineaPublicClient(deps);
	const [votingPower, delegates] = await Promise.all([
		client.readContract({
			address: ve,
			abi: VE_ACCOUNT_ABI,
			functionName: 'getVotes',
			args: [account],
		}),
		client.readContract({
			address: ve,
			abi: VE_ACCOUNT_ABI,
			functionName: 'delegates',
			args: [account],
		}),
	]);
	const last = await latestVoteFromLogs(client, governor, account);
	if ('at' in last) {
		return {
			votingPower,
			delegates,
			lastVotedAt: last.at,
			lastVotedProposalId: last.proposalId,
		};
	}
	return {votingPower, delegates, lastVotedNote: last.note};
}

export async function readVeCtmAccountVoting(
	votingEscrow: string,
	governor: string,
	account: string,
	deps?: ContinuumDaoOnchainDeps,
): Promise<SdkResult<VeCtmAccountVoting>> {
	let ve: Address;
	let gov: Address;
	let addr: Address;
	try {
		ve = getAddress(votingEscrow);
		gov = getAddress(governor);
		addr = getAddress(account);
	} catch {
		return {ok: false, reason: 'veCTM account voting requires valid VotingEscrow, governor, and account addresses.'};
	}
	try {
		const data = await (deps?.readAccountVoting
			? deps.readAccountVoting(ve, gov, addr)
			: defaultReadAccountVoting(ve, gov, addr, deps));
		return {ok: true, data};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: `VotingEscrow account voting views failed: ${message}`};
	}
}

export async function readVeCtmTokenOwner(
	votingEscrow: string,
	tokenId: string,
	deps?: ContinuumDaoOnchainDeps,
): Promise<SdkResult<Address>> {
	let ve: Address;
	try {
		ve = getAddress(votingEscrow);
	} catch {
		return {ok: false, reason: 'VotingEscrow address is not valid.'};
	}
	let id: bigint;
	try {
		id = BigInt(tokenId);
	} catch {
		return {ok: false, reason: 'tokenId must be a uint256.'};
	}
	try {
		const owner = await (deps?.readTokenOwner
			? deps.readTokenOwner(ve, id)
			: getLineaPublicClient(deps).readContract({
					address: ve,
					abi: VE_ACCOUNT_ABI,
					functionName: 'ownerOf',
					args: [id],
				}));
		return {ok: true, data: getAddress(owner)};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: `ownerOf(${tokenId}) failed: ${message}`};
	}
}

function absLockedAmount(amount: bigint): bigint {
	return amount < 0n ? -amount : amount;
}

function normalizeLocked(locked: unknown): VeCtmLocked {
	if (Array.isArray(locked) && locked.length >= 2) {
		return {amount: locked[0] as bigint, end: locked[1] as bigint};
	}
	if (locked && typeof locked === 'object' && 'amount' in locked && 'end' in locked) {
		const rec = locked as VeCtmLocked;
		return {amount: rec.amount, end: rec.end};
	}
	throw new Error('VotingEscrow.locked returned an unexpected shape.');
}

export async function readVeCtmLocked(
	votingEscrow: string,
	tokenId: string,
	deps?: ContinuumDaoOnchainDeps,
): Promise<SdkResult<VeCtmLocked>> {
	let ve: Address;
	try {
		ve = getAddress(votingEscrow);
	} catch {
		return {ok: false, reason: 'VotingEscrow address is not valid.'};
	}
	let id: bigint;
	try {
		id = BigInt(tokenId);
	} catch {
		return {ok: false, reason: 'tokenId must be a uint256.'};
	}
	try {
		const locked = await (deps?.readLocked
			? deps.readLocked(ve, id)
			: getLineaPublicClient(deps).readContract({
					address: ve,
					abi: VE_LOCKED_ABI,
					functionName: 'locked',
					args: [id],
				}));
		const {amount, end} = normalizeLocked(locked);
		return {
			ok: true,
			data: {
				amount: absLockedAmount(amount),
				end,
			},
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: `locked(${tokenId}) failed: ${message}`};
	}
}
