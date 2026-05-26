import {formatUnits, parseGwei, parseTransaction} from 'viem';
import {fetchChainFeeParams, type ChainFeeParams} from './chain-fees.js';
import {gweiToDecimalString} from './gwei.js';

export type NativeTxChainDetailForGas = {
	readonly legacy?: boolean;
	readonly gasLimit?: number;
	readonly gasMultiplier?: number;
	readonly gasPrice?: number;
	readonly baseFee?: number;
	readonly priorityFee?: number;
	readonly baseFeeMultiplier?: number;
};

export function maxGasCostWeiForSingleTx(args: {
	readonly legacy: boolean;
	readonly gasLimit: bigint;
	readonly chainDetail: NativeTxChainDetailForGas | null | undefined;
	readonly feeParams: ChainFeeParams;
}): bigint {
	const {gasLimit, chainDetail, feeParams, legacy} = args;
	const gasFeeMultiplier =
		chainDetail?.gasMultiplier != null ? Number(chainDetail.gasMultiplier) : undefined;
	if (legacy || !feeParams.isEip1559) {
		const gasPriceGwei = feeParams.gasPriceGwei ?? 0;
		let gasPriceWei = parseGwei(gweiToDecimalString(gasPriceGwei));
		if (gasFeeMultiplier != null && gasFeeMultiplier > 0) {
			gasPriceWei = (gasPriceWei * BigInt(100 + gasFeeMultiplier)) / 100n;
		}
		if (chainDetail?.gasPrice != null && chainDetail.gasPrice > 0) {
			const configured = parseGwei(gweiToDecimalString(Number(chainDetail.gasPrice)));
			if (configured > gasPriceWei) gasPriceWei = configured;
		}
		return gasLimit * gasPriceWei;
	}
	const fetchedBase = feeParams.baseFeeGwei ?? 0;
	const fetchedPriority = feeParams.priorityFeeGwei ?? 0;
	const configuredBase = chainDetail?.baseFee != null ? Number(chainDetail.baseFee) : 0;
	const configuredPriority =
		chainDetail?.priorityFee != null ? Number(chainDetail.priorityFee) : 0;
	const effectiveBaseFeeGwei = Math.max(fetchedBase, configuredBase);
	const effectivePriorityFeeGwei = Math.max(fetchedPriority, configuredPriority);
	const baseFeeMultiplierPct =
		chainDetail?.baseFeeMultiplier != null
			? Math.max(100, Number(chainDetail.baseFeeMultiplier))
			: 100;
	const baseComponentGwei = (effectiveBaseFeeGwei * baseFeeMultiplierPct) / 100;
	const maxFeePerGasGwei = baseComponentGwei + effectivePriorityFeeGwei;
	let maxPriorityFeePerGas =
		effectivePriorityFeeGwei > 0
			? parseGwei(gweiToDecimalString(effectivePriorityFeeGwei))
			: parseGwei('1');
	let maxFeePerGas =
		effectiveBaseFeeGwei > 0
			? parseGwei(gweiToDecimalString(maxFeePerGasGwei))
			: maxPriorityFeePerGas * 2n;
	if (gasFeeMultiplier != null && gasFeeMultiplier > 0) {
		maxPriorityFeePerGas = (maxPriorityFeePerGas * BigInt(100 + gasFeeMultiplier)) / 100n;
		maxFeePerGas = (maxFeePerGas * BigInt(100 + gasFeeMultiplier)) / 100n;
	}
	return gasLimit * maxFeePerGas;
}

export async function doesOriginatorHaveSufficientNativeForValuePlusGasMax(args: {
	readonly originatorBalanceWei: bigint;
	readonly valueWei: bigint;
	readonly gasLimit: bigint;
	readonly chainDetail: NativeTxChainDetailForGas | null | undefined;
	readonly rpcUrl: string;
	readonly chainId: number;
}): Promise<{
	sufficient: boolean;
	maxGasCostWei: bigint;
	totalRequiredWei: bigint;
	shortfallWei: bigint;
}> {
	const {originatorBalanceWei, valueWei, gasLimit, chainDetail, rpcUrl, chainId} = args;
	const feeParams = await fetchChainFeeParams(rpcUrl, chainId);
	const legacy = Boolean(chainDetail?.legacy) || !feeParams.isEip1559;
	const maxGasCostWei = maxGasCostWeiForSingleTx({legacy, gasLimit, chainDetail, feeParams});
	const totalRequiredWei = valueWei + maxGasCostWei;
	const sufficient = originatorBalanceWei >= totalRequiredWei;
	const shortfallWei = sufficient ? 0n : totalRequiredWei - originatorBalanceWei;
	return {sufficient, maxGasCostWei, totalRequiredWei, shortfallWei};
}

export function maxWeiRequiredFromSignedSerializedTxHex(hex: string): bigint | null {
	try {
		const h = (hex.trim().startsWith('0x') ? hex.trim() : `0x${hex.trim()}`) as `0x${string}`;
		const t = parseTransaction(h);
		const v = t.value ?? 0n;
		const g = t.gas ?? 0n;
		if (g === 0n) return v;
		if (t.type === 'eip1559' || t.type === 'eip2930') {
			const m = t.maxFeePerGas;
			if (m == null) return null;
			return v + g * m;
		}
		if (t.type === 'legacy') {
			const gp = t.gasPrice;
			if (gp == null) return null;
			return v + g * gp;
		}
		const gp = (t as {gasPrice?: bigint}).gasPrice;
		if (gp != null) return v + g * gp;
		const mf = (t as {maxFeePerGas?: bigint}).maxFeePerGas;
		if (mf != null) return v + g * mf;
		return v;
	} catch {
		return null;
	}
}

export function shortfallNativeDisplay(
	shortfallWei: bigint,
	symbol: string,
	decimals = 18,
): string {
	if (shortfallWei <= 0n) return '';
	const t = formatUnits(shortfallWei, decimals);
	const n = Number(t);
	const amt =
		!Number.isFinite(n) || n > 0.0001
			? n < 0.0001
				? n.toExponential(2)
				: n.toFixed(4)
			: n.toExponential(2);
	return `Short by about ${amt} ${symbol} (need enough for the transaction value and max gas).`;
}
