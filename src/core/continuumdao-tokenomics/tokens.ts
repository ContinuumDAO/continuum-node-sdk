import {formatUnits, getAddress} from 'viem';
import type {SdkResult} from '../result.js';
import type {ContinuumDaoAddressDeps} from './addresses.js';
import type {ContinuumDaoApiDeps} from './client.js';
import {
	fetchProtocolFromApi,
	fetchTokensFromApi,
	fetchUserTokensFromApi,
	type ApiVeTokenRow,
} from './client.js';
import {CTM_DECIMALS, LOCKED_ADDRESSES_MAX, TOKENS_IDS_BATCH_MAX} from './constants.js';
import {veNftExplorerUrl, walletExplorerUrl} from './explorer.js';
import type {VeCtmAccountVoting} from './onchain.js';
import {readVeCtmAccountVoting, readVeCtmLocked, readVeCtmTokenOwner} from './onchain.js';
import type {
	GetVeCtmPositionInput,
	GetVeCtmPositionOutput,
	GetVeCtmLockedForAddressesInput,
	GetVeCtmLockedForAddressesOutput,
	GetVeCtmTokensInput,
	GetVeCtmTokensOutput,
	VeCtmAccountVoting as VeCtmAccountVotingOut,
	VeCtmLastVoted,
	VeCtmTokenRow,
} from './schemas.js';

function formatCtmAmount(wei: string | bigint): string {
	try {
		return formatUnits(typeof wei === 'bigint' ? wei : BigInt(wei), CTM_DECIMALS);
	} catch {
		return String(wei);
	}
}

function unixToIso(seconds: number): string {
	return new Date(seconds * 1000).toISOString();
}

export function unlockFields(end: number, nowSec = Math.floor(Date.now() / 1000)): {
	unlocksAt: string;
	unlocked: boolean;
} {
	return {
		unlocksAt: unixToIso(end),
		unlocked: end > 0 && end <= nowSec,
	};
}

export function lastVotedFromAccount(voting: VeCtmAccountVoting): VeCtmLastVoted {
	if (voting.lastVotedAt != null) {
		return {
			at: voting.lastVotedAt,
			atIso: unixToIso(voting.lastVotedAt),
			proposalId: voting.lastVotedProposalId ?? null,
			...(voting.lastVotedNote ? {note: voting.lastVotedNote} : {}),
		};
	}
	return {
		at: null,
		atIso: null,
		proposalId: null,
		note:
			voting.lastVotedNote ??
			'No Governor VoteCast found for this address in the recent Linea log window.',
	};
}

export function accountVotingOut(
	address: string,
	voting: VeCtmAccountVoting,
): VeCtmAccountVotingOut {
	const checksummed = getAddress(address);
	return {
		address: checksummed,
		explorerUrl: walletExplorerUrl(checksummed),
		votingPower: voting.votingPower.toString(),
		votingPowerCtm: formatCtmAmount(voting.votingPower),
		delegates: getAddress(voting.delegates),
		lastVoted: lastVotedFromAccount(voting),
	};
}

export type LockedOverlay = {
	amount: bigint;
	end: number;
};

function applyLockedOverlay(
	token: ApiVeTokenRow,
	overlay?: LockedOverlay,
): {locked: string; end: number} {
	if (!overlay) {
		return {locked: token.locked, end: token.end};
	}
	return {
		locked: overlay.amount.toString(),
		end: overlay.end,
	};
}

export function decorateVeTokenRows(
	tokens: readonly ApiVeTokenRow[],
	votingEscrow: string,
	owners?: ReadonlyMap<string, VeCtmAccountVotingOut>,
	nowSec?: number,
	locks?: ReadonlyMap<string, LockedOverlay>,
): VeCtmTokenRow[] {
	return tokens.map(token => {
		const lock = applyLockedOverlay(token, locks?.get(token.id));
		const unlock = unlockFields(lock.end, nowSec);
		const owner = owners?.get(token.id);
		return {
			id: token.id,
			locked: lock.locked,
			lockedCtm: formatCtmAmount(lock.locked),
			end: lock.end,
			unlocksAt: unlock.unlocksAt,
			unlocked: unlock.unlocked,
			votes: token.votes,
			votesPower: formatCtmAmount(token.votes),
			explorerUrl: veNftExplorerUrl(votingEscrow, token.id),
			...(owner ? {owner} : {}),
		};
	});
}

async function loadLockedOverlays(
	votingEscrow: string,
	tokens: readonly ApiVeTokenRow[],
	deps?: ContinuumDaoAddressDeps,
): Promise<Map<string, LockedOverlay>> {
	const locks = new Map<string, LockedOverlay>();
	await Promise.all(
		tokens.map(async token => {
			const locked = await readVeCtmLocked(votingEscrow, token.id, deps);
			if (!locked.ok) {
				return;
			}
			locks.set(token.id, {
				amount: locked.data.amount,
				end: Number(locked.data.end),
			});
		}),
	);
	return locks;
}

function sumLocked(locks: ReadonlyMap<string, LockedOverlay>, tokens: readonly ApiVeTokenRow[]): bigint {
	let total = 0n;
	for (const token of tokens) {
		const overlay = locks.get(token.id);
		if (overlay) {
			total += overlay.amount;
			continue;
		}
		try {
			total += BigInt(token.locked);
		} catch {
			/* skip unreadable API amount */
		}
	}
	return total;
}

const emptyLastVoted: VeCtmLastVoted = {
	at: null,
	atIso: null,
	proposalId: null,
	note: 'Account voting power and last vote were not read on-chain.',
};

async function loadAccountVoting(
	ve: string,
	governor: string,
	account: string,
	deps?: ContinuumDaoAddressDeps,
): Promise<SdkResult<VeCtmAccountVoting>> {
	return readVeCtmAccountVoting(ve, governor, account, deps);
}

export async function getVeCtmPosition(
	input: GetVeCtmPositionInput,
	deps?: ContinuumDaoAddressDeps,
): Promise<SdkResult<GetVeCtmPositionOutput>> {
	const [protocol, tokens] = await Promise.all([
		fetchProtocolFromApi(deps),
		fetchUserTokensFromApi(input.address, deps),
	]);
	if (!protocol.ok) {
		return protocol;
	}
	if (!tokens.ok) {
		return tokens;
	}
	const [voting, locks] = await Promise.all([
		loadAccountVoting(protocol.data.ve, protocol.data.dao, input.address, deps),
		loadLockedOverlays(protocol.data.ve, tokens.data, deps),
	]);
	const lockedTotal = sumLocked(locks, tokens.data);
	const account = voting.ok
		? accountVotingOut(input.address, voting.data)
		: {
				address: input.address,
				explorerUrl: walletExplorerUrl(input.address),
				votingPower: '0',
				votingPowerCtm: '0',
				delegates: input.address,
				lastVoted: {
					...emptyLastVoted,
					note: voting.ok
						? emptyLastVoted.note
						: voting.reason,
				},
			};
	return {
		ok: true,
		data: {
			address: account.address,
			explorerUrl: account.explorerUrl,
			votingPower: account.votingPower,
			votingPowerCtm: account.votingPowerCtm,
			delegates: account.delegates,
			lastVoted: account.lastVoted,
			lockedTotal: lockedTotal.toString(),
			lockedTotalCtm: formatCtmAmount(lockedTotal),
			tokens: decorateVeTokenRows(tokens.data, protocol.data.ve, undefined, undefined, locks),
		},
	};
}

export async function getVeCtmTokens(
	input: GetVeCtmTokensInput,
	deps?: ContinuumDaoAddressDeps,
): Promise<SdkResult<GetVeCtmTokensOutput>> {
	if (input.ids && input.ids.length > TOKENS_IDS_BATCH_MAX) {
		return {
			ok: false,
			reason: `Too many ids. Maximum is ${TOKENS_IDS_BATCH_MAX}.`,
		};
	}
	const [protocol, fetched] = await Promise.all([
		fetchProtocolFromApi(deps),
		fetchTokensFromApi({page: input.page, ids: input.ids}, deps),
	]);
	if (!protocol.ok) {
		return protocol;
	}
	if (!fetched.ok) {
		return fetched;
	}
	const owners = new Map<string, VeCtmAccountVotingOut>();
	const ownerCache = new Map<string, VeCtmAccountVotingOut>();
	const locks = await loadLockedOverlays(protocol.data.ve, fetched.data.tokens, deps);
	await Promise.all(
		fetched.data.tokens.map(async token => {
			const ownerResult = await readVeCtmTokenOwner(protocol.data.ve, token.id, deps);
			if (!ownerResult.ok) {
				return;
			}
			const ownerAddr = ownerResult.data;
			const cached = ownerCache.get(ownerAddr.toLowerCase());
			if (cached) {
				owners.set(token.id, cached);
				return;
			}
			const voting = await loadAccountVoting(
				protocol.data.ve,
				protocol.data.dao,
				ownerAddr,
				deps,
			);
			if (!voting.ok) {
				return;
			}
			const out = accountVotingOut(ownerAddr, voting.data);
			ownerCache.set(ownerAddr.toLowerCase(), out);
			owners.set(token.id, out);
		}),
	);
	return {
		ok: true,
		data: {
			...(fetched.data.total !== undefined ? {total: fetched.data.total} : {}),
			tokens: decorateVeTokenRows(
				fetched.data.tokens,
				protocol.data.ve,
				owners,
				undefined,
				locks,
			),
		},
	};
}

export async function getVeCtmLockedForAddresses(
	input: GetVeCtmLockedForAddressesInput,
	deps?: ContinuumDaoAddressDeps,
): Promise<SdkResult<GetVeCtmLockedForAddressesOutput>> {
	if (input.addresses.length > LOCKED_ADDRESSES_MAX) {
		return {
			ok: false,
			reason: `Too many addresses. Maximum is ${LOCKED_ADDRESSES_MAX}.`,
		};
	}
	const protocol = await fetchProtocolFromApi(deps);
	if (!protocol.ok) {
		return protocol;
	}
	const rows = await Promise.all(
		input.addresses.map(async raw => {
			const address = getAddress(raw);
			const tokens = await fetchUserTokensFromApi(address, deps);
			if (!tokens.ok) {
				return {
					address,
					explorerUrl: walletExplorerUrl(address),
					lockedTotal: '0',
					lockedTotalCtm: '0',
					tokenCount: 0,
					tokens: [],
					note: tokens.reason,
				};
			}
			const locks = await loadLockedOverlays(protocol.data.ve, tokens.data, deps);
			const lockedTotal = sumLocked(locks, tokens.data);
			const nowSec = Math.floor(Date.now() / 1000);
			return {
				address,
				explorerUrl: walletExplorerUrl(address),
				lockedTotal: lockedTotal.toString(),
				lockedTotalCtm: formatCtmAmount(lockedTotal),
				tokenCount: tokens.data.length,
				tokens: tokens.data.map(token => {
					const lock = applyLockedOverlay(token, locks.get(token.id));
					const unlock = unlockFields(lock.end, nowSec);
					return {
						id: token.id,
						locked: lock.locked,
						lockedCtm: formatCtmAmount(lock.locked),
						end: lock.end,
						unlocksAt: unlock.unlocksAt,
						unlocked: unlock.unlocked,
					};
				}),
				...(tokens.data.length === 0
					? {note: 'No veCTM NFTs for this address; VotingEscrow.locked sum is 0.'}
					: {}),
			};
		}),
	);
	return {ok: true, data: {addresses: rows}};
}

export type {ContinuumDaoApiDeps};
