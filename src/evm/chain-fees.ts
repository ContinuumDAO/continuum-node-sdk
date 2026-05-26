import {createPublicClient, defineChain, formatUnits, http} from 'viem';

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
		let priorityFeeGwei: number | undefined;
		try {
			const priorityWei = await publicClient.estimateMaxPriorityFeePerGas();
			priorityFeeGwei = parseFloat(formatUnits(priorityWei, 9));
		} catch {
			/* chain may not support eth_maxPriorityFeePerGas */
		}

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
