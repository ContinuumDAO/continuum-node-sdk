export type ProposalTxParams = {
	nonce: number;
	gasLimit: string;
	txType: 'eip1559' | 'legacy';
	maxFeePerGas?: string;
	maxPriorityFeePerGas?: string;
	gasPrice?: string;
};

export function gasLimitFromEstimateAndChainConfig(
	estimatedGas: bigint,
	chainGasLimit?: number,
): bigint {
	if (chainGasLimit == null || !Number.isFinite(chainGasLimit) || chainGasLimit <= 0) {
		return estimatedGas;
	}
	const cfg = BigInt(Math.floor(chainGasLimit));
	return cfg > estimatedGas ? cfg : estimatedGas;
}

export function composeFeePayloadToTxParams(
	p: Record<string, unknown>,
	legacy: boolean,
): ProposalTxParams | undefined {
	const gl = p.txGasLimit ?? p.txgaslimit;
	if (gl == null || String(gl).trim() === '') return undefined;
	const n = p.txNonce ?? p.txnonce;
	let nonce = 0;
	if (typeof n === 'bigint') nonce = Number(n);
	else if (typeof n === 'number') nonce = n;
	else if (n != null) nonce = parseInt(String(n), 10);
	if (!Number.isFinite(nonce)) nonce = 0;
	const gasLimit = String(gl);
	if (legacy) {
		const gp = p.txGasPrice ?? p.txgasprice;
		return {nonce, gasLimit, txType: 'legacy', gasPrice: gp != null ? String(gp) : '0'};
	}
	return {
		nonce,
		gasLimit,
		txType: 'eip1559',
		maxFeePerGas: String(p.txMaxFeePerGas ?? ''),
		maxPriorityFeePerGas: String(p.txMaxPriorityFeePerGas ?? ''),
	};
}

export function triggerTxParamsFromComposeBody(
	body: Record<string, unknown>,
): ProposalTxParams {
	const existing = body.txParams;
	if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
		const o = existing as ProposalTxParams & {gasLimit?: string};
		if (String(o.gasLimit ?? '').trim() !== '') return {...o};
	}
	const pb = body.proposalTxParams;
	if (Array.isArray(pb) && pb.length > 0 && typeof pb[0] === 'object' && pb[0] !== null) {
		const first = pb[0] as ProposalTxParams & {gasLimit?: string};
		if (String(first.gasLimit ?? '').trim() !== '') return {...first};
	}
	const fromSnapshot = composeFeePayloadToTxParams(
		body,
		body.txMaxFeePerGas == null && body.txMaxPriorityFeePerGas == null,
	);
	if (fromSnapshot) return fromSnapshot;
	return {nonce: 0, gasLimit: '', txType: 'legacy', gasPrice: '0'};
}

export function proposalTxParamsToFeeSnapshot(
	params: ProposalTxParams,
): Record<string, unknown> {
	if (params.txType === 'legacy') {
		return {
			txNonce: params.nonce,
			txGasLimit: params.gasLimit,
			txGasPrice: params.gasPrice ?? '0',
		};
	}
	return {
		txNonce: params.nonce,
		txGasLimit: params.gasLimit,
		txMaxFeePerGas: params.maxFeePerGas ?? '',
		txMaxPriorityFeePerGas: params.maxPriorityFeePerGas ?? '',
	};
}
