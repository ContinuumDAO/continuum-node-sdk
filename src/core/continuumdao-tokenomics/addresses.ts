import {getAddress, zeroAddress} from 'viem';
import type {SdkResult} from '../result.js';
import type {ContinuumDaoApiDeps, ContinuumDaoProtocolApi} from './client.js';
import {fetchProtocolFromApi} from './client.js';
import {ETHEREUM_CHAIN_ID, LINEA_CHAIN_ID} from './constants.js';
import {
	checksumAddress,
	contractExplorerUrl,
	tokenExplorerUrl,
} from './explorer.js';
import type {ContinuumDaoOnchainDeps} from './onchain.js';
import {readVotingEscrowDerivedAddresses} from './onchain.js';
import type {CtmAddressRow, GetCtmProtocolAddressesOutput} from './schemas.js';

function sameAddr(a: string, b: string): boolean {
	try {
		return getAddress(a) === getAddress(b);
	} catch {
		return a.toLowerCase() === b.toLowerCase();
	}
}

function isUsableAddress(raw: string | undefined): raw is string {
	if (!raw?.trim()) {
		return false;
	}
	try {
		return getAddress(raw) !== zeroAddress;
	} catch {
		return false;
	}
}

function row(input: {
	id: string;
	address: string;
	chainId: number;
	role: string;
	source: CtmAddressRow['source'];
	includeTokenExplorer?: boolean;
	bothChainTokenExplorers?: boolean;
}): CtmAddressRow {
	const address = checksumAddress(input.address);
	const explorerUrl = contractExplorerUrl(input.chainId, address);
	const tokenUrl = input.includeTokenExplorer
		? tokenExplorerUrl(input.chainId, address)
		: undefined;
	const explorers = input.bothChainTokenExplorers
		? ([ETHEREUM_CHAIN_ID, LINEA_CHAIN_ID]
				.map(chainId => {
					const explorer = contractExplorerUrl(chainId, address);
					const token = tokenExplorerUrl(chainId, address);
					if (!explorer) {
						return null;
					}
					return {
						chainId,
						explorerUrl: explorer,
						...(token ? {tokenExplorerUrl: token} : {}),
					};
				})
				.filter((item): item is NonNullable<typeof item> => item != null))
		: undefined;
	return {
		id: input.id,
		address,
		chainId: input.chainId,
		role: input.role,
		source: input.source,
		...(explorerUrl ? {explorerUrl} : {}),
		...(tokenUrl ? {tokenExplorerUrl: tokenUrl} : {}),
		...(explorers?.length ? {explorers} : {}),
	};
}

export function composeProtocolAddresses(
	api: ContinuumDaoProtocolApi,
	derived: {
		token?: string;
		governor?: string;
		nodeProperties?: string;
		rewards?: string;
		treasury?: string;
		msaw?: string;
	},
	veReadWarning?: string,
): GetCtmProtocolAddressesOutput {
	const addresses: CtmAddressRow[] = [];
	const warnings: string[] = [];
	if (veReadWarning) {
		warnings.push(veReadWarning);
	}

	if (isUsableAddress(api.ctm)) {
		addresses.push(
			row({
				id: 'ctm',
				address: api.ctm,
				chainId: LINEA_CHAIN_ID,
				role: 'CTM ERC-20 (same address on Ethereum and Linea)',
				source: 'app-api',
				includeTokenExplorer: true,
				bothChainTokenExplorers: true,
			}),
		);
	}
	if (isUsableAddress(api.ve)) {
		addresses.push(
			row({
				id: 'votingEscrow',
				address: api.ve,
				chainId: LINEA_CHAIN_ID,
				role: 'VotingEscrow (veCTM NFTs)',
				source: 'app-api',
			}),
		);
	}
	if (isUsableAddress(api.dao)) {
		addresses.push(
			row({
				id: 'dao',
				address: api.dao,
				chainId: LINEA_CHAIN_ID,
				role: 'ContinuumDAO governor / Linea treasury',
				source: 'app-api',
			}),
		);
	}
	if (isUsableAddress(api.c3gov)) {
		addresses.push(
			row({
				id: 'c3governor',
				address: api.c3gov,
				chainId: ETHEREUM_CHAIN_ID,
				role: 'C3Governor / Ethereum treasury',
				source: 'app-api',
			}),
		);
	}
	if (isUsableAddress(api.dist)) {
		addresses.push(
			row({
				id: 'distribution',
				address: api.dist,
				chainId: LINEA_CHAIN_ID,
				role: 'Distribution (legacy CTMDAOVOTE claims)',
				source: 'app-api',
			}),
		);
	}

	if (isUsableAddress(derived.token) && !sameAddr(derived.token, api.ctm)) {
		addresses.push(
			row({
				id: 'votingEscrow.token',
				address: derived.token,
				chainId: LINEA_CHAIN_ID,
				role: 'VotingEscrow.token() — differs from GET /protocol/ctm (API remains canonical)',
				source: 'votingEscrow',
				includeTokenExplorer: true,
			}),
		);
		warnings.push(
			'VotingEscrow.token() differs from GET /protocol/ctm. Use the API CTM address as canonical.',
		);
	}
	if (isUsableAddress(derived.governor) && !sameAddr(derived.governor, api.dao)) {
		addresses.push(
			row({
				id: 'votingEscrow.governor',
				address: derived.governor,
				chainId: LINEA_CHAIN_ID,
				role: 'VotingEscrow.governor() — differs from GET /protocol/dao (API remains canonical)',
				source: 'votingEscrow',
			}),
		);
		warnings.push(
			'VotingEscrow.governor() differs from GET /protocol/dao. Use the API governor as canonical.',
		);
	}
	if (isUsableAddress(derived.nodeProperties)) {
		addresses.push(
			row({
				id: 'nodeProperties',
				address: derived.nodeProperties,
				chainId: LINEA_CHAIN_ID,
				role: 'NodeProperties (veCTM attach)',
				source: 'votingEscrow',
			}),
		);
	}
	if (isUsableAddress(derived.rewards)) {
		addresses.push(
			row({
				id: 'rewards',
				address: derived.rewards,
				chainId: LINEA_CHAIN_ID,
				role: 'Rewards',
				source: 'votingEscrow',
			}),
		);
	}
	if (isUsableAddress(derived.treasury)) {
		addresses.push(
			row({
				id: 'treasury',
				address: derived.treasury,
				chainId: LINEA_CHAIN_ID,
				role: 'VotingEscrow.treasury() (penalty collection)',
				source: 'votingEscrow',
			}),
		);
	}
	if (isUsableAddress(derived.msaw)) {
		addresses.push(
			row({
				id: 'msaw',
				address: derived.msaw,
				chainId: LINEA_CHAIN_ID,
				role: 'MultiSignAgentWallet (NodeProperties.msaw)',
				source: 'nodeProperties',
			}),
		);
	}

	const networks = api.networks.map(network => {
		const chainId = Number.parseInt(network.chainId, 10);
		const explorerUrl = Number.isFinite(chainId)
			? contractExplorerUrl(chainId, network.c3governor)
			: undefined;
		return {
			name: network.name,
			label: network.label,
			chainId: network.chainId,
			c3governor: isUsableAddress(network.c3governor)
				? checksumAddress(network.c3governor)
				: network.c3governor,
			...(explorerUrl ? {explorerUrl} : {}),
		};
	});

	return {addresses, networks, warnings};
}

export type ContinuumDaoAddressDeps = ContinuumDaoApiDeps & ContinuumDaoOnchainDeps;

export async function getCtmProtocolAddresses(
	deps?: ContinuumDaoAddressDeps,
): Promise<SdkResult<GetCtmProtocolAddressesOutput>> {
	const api = await fetchProtocolFromApi(deps);
	if (!api.ok) {
		return api;
	}
	const derived = await readVotingEscrowDerivedAddresses(api.data.ve, deps);
	if (!derived.ok) {
		return {
			ok: true,
			data: composeProtocolAddresses(api.data, {}, derived.reason),
		};
	}
	return {ok: true, data: composeProtocolAddresses(api.data, derived.data)};
}
