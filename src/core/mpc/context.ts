import {
	createPublicClient,
	defineChain,
	getAddress,
	http,
	type Address,
	type PublicClient,
} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import type {ChainDetailRow, KeyGenResultById} from './types.js';
import {isValidRpcUrl} from '../../evm/rpc-utils.js';
import {resolveChainRegistryEntry} from '../registry/networks.js';

function chainRegistryEntryToDetailRow(
	entry: {
		chainId: string;
		chainName: string;
		rpcGateway: string;
		legacy: boolean;
		gasLimit?: number;
		gasMultiplier?: number;
		gasPrice?: number;
		baseFee?: number | null;
		priorityFee?: number | null;
		baseFeeMultiplier?: number;
		defaultGetSigFeeSpeed?: string;
	},
): ChainDetailRow {
	return {
		chainId: entry.chainId,
		chainName: entry.chainName,
		rpcGateway: entry.rpcGateway,
		legacy: entry.legacy,
		gasLimit: entry.gasLimit,
		gasMultiplier: entry.gasMultiplier,
		gasPrice: entry.gasPrice,
		baseFee: entry.baseFee ?? undefined,
		priorityFee: entry.priorityFee ?? undefined,
		baseFeeMultiplier: entry.baseFeeMultiplier,
		defaultGetSigFeeSpeed: entry.defaultGetSigFeeSpeed,
	};
}

export async function createPublicClientForChain(
	config: NodeSdkConfig,
	chainId: number,
): Promise<
	SdkResult<{publicClient: PublicClient; chainDetail: ChainDetailRow; executor?: Address}>
> {
	const chainResult = await resolveChainRegistryEntry(config, chainId);
	if (!chainResult.ok) return chainResult;
	const chainDetail = chainRegistryEntryToDetailRow(chainResult.data);
	const rpcUrl = (chainDetail.rpcGateway ?? '').trim();
	if (!rpcUrl || !isValidRpcUrl(rpcUrl)) {
		return {ok: false, reason: 'Chain has no valid RPC URL.'};
	}
	const chain = defineChain({
		id: chainId,
		name: chainDetail.chainName ?? 'Chain',
		nativeCurrency: {decimals: 18, name: 'Ether', symbol: 'ETH'},
		rpcUrls: {default: {http: [rpcUrl]}},
	});
	const publicClient = createPublicClient({chain, transport: http(rpcUrl)});
	return {ok: true, data: {publicClient, chainDetail}};
}

export function executorAddressFromKeyGen(
	keyGenResult: KeyGenResultById,
): Address | null {
	const eth = keyGenResult.ethereumaddress?.trim();
	if (!eth || !/^0x?[a-fA-F0-9]{40}$/i.test(eth)) return null;
	return getAddress(eth.startsWith('0x') ? eth : `0x${eth}`);
}
