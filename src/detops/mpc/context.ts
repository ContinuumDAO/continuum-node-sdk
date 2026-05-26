import {
	createPublicClient,
	defineChain,
	getAddress,
	http,
	type Address,
	type PublicClient,
} from 'viem';
import {buildManagementQueryPath, managementGet} from '../../api/management-api.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import type {ChainDetailRow, KeyGenResultById} from './types.js';
import {isValidRpcUrl} from '../../evm/rpc-utils.js';
import {mpcAuthEnvelopeData} from './sign-request-utils.js';

export async function fetchKeyGenResult(
	config: NodeSdkConfig,
	keyGenId: string,
): Promise<SdkResult<KeyGenResultById>> {
	const path = buildManagementQueryPath('/getKeyGenResultById', {id: keyGenId});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) return raw;
	const data = mpcAuthEnvelopeData(raw.data) ?? raw.data;
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return {ok: false, reason: 'Invalid getKeyGenResultById response.'};
	}
	return {ok: true, data: data as KeyGenResultById};
}

export async function fetchChainDetail(
	config: NodeSdkConfig,
	chainId: number,
): Promise<SdkResult<ChainDetailRow>> {
	const path = buildManagementQueryPath('/getChainDetails', {
		chain_id: String(chainId),
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) return raw;
	const data = mpcAuthEnvelopeData(raw.data) ?? raw.data;
	if (data == null) {
		return {ok: false, reason: 'Chain not configured.'};
	}
	const chainList = Array.isArray(data)
		? (data as ChainDetailRow[])
		: [data as ChainDetailRow];
	const chainDetail =
		chainList.find(c => String(c.chainId ?? '').trim() === String(chainId)) ??
		chainList[0];
	if (!chainDetail) {
		return {ok: false, reason: 'Chain not configured.'};
	}
	return {ok: true, data: chainDetail};
}

export async function fetchGlobalNonceByKeyGenId(
	config: NodeSdkConfig,
	keyGenId: string,
): Promise<SdkResult<number>> {
	const path = buildManagementQueryPath('/getGlobalNonceByKeyGenId', {
		id: keyGenId,
	});
	const raw = await managementGet<unknown>(config, path);
	if (!raw.ok) return raw;
	let globalNonce: number | undefined;
	if (typeof raw.data === 'number') {
		globalNonce = raw.data;
	} else {
		const data = mpcAuthEnvelopeData(raw.data) ?? raw.data;
		if (data && typeof data === 'object' && !Array.isArray(data)) {
			const src = data as Record<string, unknown>;
			const candidate = src.globalNonce ?? src.GlobalNonce ?? src.globalnonce;
			if (typeof candidate === 'number') globalNonce = candidate;
		}
	}
	if (typeof globalNonce !== 'number' || Number.isNaN(globalNonce)) {
		return {ok: false, reason: 'Invalid getGlobalNonceByKeyGenId response.'};
	}
	return {ok: true, data: globalNonce};
}

export async function createPublicClientForChain(
	config: NodeSdkConfig,
	chainId: number,
): Promise<
	SdkResult<{publicClient: PublicClient; chainDetail: ChainDetailRow; executor?: Address}>
> {
	const chainResult = await fetchChainDetail(config, chainId);
	if (!chainResult.ok) return chainResult;
	const chainDetail = chainResult.data;
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
