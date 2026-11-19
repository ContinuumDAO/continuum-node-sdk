import {parseGwei} from 'viem';
import {gweiToDecimalString} from './gwei.js';

function positiveGweiToWei(gwei: number): bigint {
	if (!Number.isFinite(gwei) || gwei <= 0) return 0n;
	return parseGwei(gweiToDecimalString(gwei));
}

/**
 * EIP-1559 cap and tip. A chain that reports no priority fee keeps a 0 tip when it has a base fee.
 * Substituting 1 gwei there makes the tip larger than a sub-gwei cap, which viem rejects.
 * 1 gwei tip and a 2 gwei cap are only used when both values are missing.
 */
export function resolveEip1559FeeWei(
	baseFeeGwei: number,
	priorityFeeGwei: number,
): {maxFeePerGas: bigint; maxPriorityFeePerGas: bigint} {
	const baseWei = positiveGweiToWei(baseFeeGwei);
	const tipWei = positiveGweiToWei(priorityFeeGwei);
	if (baseWei === 0n && tipWei === 0n) {
		const tip = parseGwei('1');
		return {maxFeePerGas: tip * 2n, maxPriorityFeePerGas: tip};
	}
	const maxFee = baseWei + tipWei;
	return {
		maxFeePerGas: maxFee > tipWei ? maxFee : tipWei,
		maxPriorityFeePerGas: tipWei > maxFee ? maxFee : tipWei,
	};
}
