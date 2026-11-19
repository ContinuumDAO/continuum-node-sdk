import {createPublicClient, defineChain, formatUnits, http, type PublicClient} from 'viem';

/** Median of included tips. The 85th percentile on a low base fee can exceed the fee cap. */
const INCLUDED_TIP_PERCENTILE = 50;

type FeeHistoryReward = {
	reward?: (string[] | null)[];
};

/**
 * 50th percentile priority fee of the most recent block that included transactions.
 * A missing row is skipped. A reported 0 is kept: that block included 0-tip transactions.
 */
export function medianPriorityWeiFromFeeHistory(
	rewards: (string[] | null)[] | undefined,
): bigint | undefined {
	if (!Array.isArray(rewards)) return undefined;
	for (let i = rewards.length - 1; i >= 0; i--) {
		const row = rewards[i];
		if (row == null || row[0] == null) continue;
		try {
			return BigInt(row[0]);
		} catch {
			continue;
		}
	}
	return undefined;
}

async function latestIncludedPriorityFeeWei(
	publicClient: PublicClient,
): Promise<bigint | undefined> {
	try {
		const raw = (await publicClient.request({
			method: 'eth_feeHistory',
			params: ['0x5', 'latest', [INCLUDED_TIP_PERCENTILE]],
		})) as FeeHistoryReward;
		return medianPriorityWeiFromFeeHistory(raw.reward);
	} catch {
		return undefined;
	}
}

export type ChainFeeParams = {
	readonly isEip1559: boolean;
	readonly baseFeeGwei?: number;
	readonly priorityFeeGwei?: number;
	readonly gasPriceGwei?: number;
};

export async function fetchChainFeeParams(
	rpcUrl: string,
	chainId: number | string,
): Promise<ChainFeeParams> {
	const url = rpcUrl.trim();
	if (!url) return {isEip1559: false};

	const chainIdNum = typeof chainId === 'string' ? parseInt(chainId, 10) : chainId;
	if (Number.isNaN(chainIdNum)) return {isEip1559: false};

	const chain = defineChain({
		id: chainIdNum,
		name: 'Discovery',
		nativeCurrency: {decimals: 18, name: 'Ether', symbol: 'ETH'},
		rpcUrls: {default: {http: [url]}},
	});

	const publicClient = createPublicClient({chain, transport: http(url)});

	const getGasPriceGwei = async (): Promise<number> => {
		const gasPriceWei = await publicClient.getGasPrice();
		return parseFloat(formatUnits(gasPriceWei, 9));
	};

	try {
		const block = await publicClient.getBlock({blockTag: 'latest'});
		const baseFeePerGas = block?.baseFeePerGas;
		if (baseFeePerGas == null) {
			const gasPriceGwei = await getGasPriceGwei();
			return {isEip1559: false, gasPriceGwei};
		}

		const baseFeeGwei = parseFloat(formatUnits(baseFeePerGas, 9));
		let priorityWei = await latestIncludedPriorityFeeWei(publicClient);
		if (priorityWei == null) {
			try {
				priorityWei = await publicClient.estimateMaxPriorityFeePerGas();
			} catch {
				/* chain may not support eth_maxPriorityFeePerGas */
			}
		}
		const priorityFeeGwei =
			priorityWei != null ? parseFloat(formatUnits(priorityWei, 9)) : undefined;

		const gasPriceGwei = await getGasPriceGwei();
		return {isEip1559: true, baseFeeGwei, priorityFeeGwei, gasPriceGwei};
	} catch {
		try {
			const gasPriceGwei = await getGasPriceGwei();
			return {isEip1559: false, gasPriceGwei};
		} catch {
			return {isEip1559: false};
		}
	}
}
