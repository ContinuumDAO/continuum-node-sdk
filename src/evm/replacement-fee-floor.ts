import type {Address, PublicClient, Transaction} from 'viem';
import {getAddress, parseGwei} from 'viem';

export const REPLACEMENT_FEE_MIN_BUMP_BPS = 1000;

export function replacementFeeBumpPercentLabel(): string {
	return `${Number(REPLACEMENT_FEE_MIN_BUMP_BPS) / 100}%`;
}

function ceilReplacementMinWei(wei: bigint): bigint {
	if (wei <= 0n) return parseGwei('0.001');
	const bps = BigInt(REPLACEMENT_FEE_MIN_BUMP_BPS);
	const bumped = (wei * (10000n + bps) + 9999n) / 10000n;
	return bumped > wei ? bumped : wei + 1n;
}

async function getPendingPoolTransactions(
	publicClient: PublicClient,
): Promise<Transaction[]> {
	try {
		const block = await publicClient.getBlock({
			blockTag: 'pending',
			includeTransactions: true,
		});
		const txs = block.transactions;
		if (!Array.isArray(txs)) return [];
		const out: Transaction[] = [];
		for (const t of txs) {
			if (typeof t === 'string') continue;
			out.push(t as Transaction);
		}
		return out;
	} catch {
		return [];
	}
}

function findTxBySenderAndNonce(
	txs: Transaction[],
	executor: Address,
	nonce: number,
): Transaction | undefined {
	const want = getAddress(executor);
	return txs.find(tx => {
		if (tx.from == null) return false;
		try {
			if (getAddress(tx.from) !== want) return false;
		} catch {
			return false;
		}
		const n = typeof tx.nonce === 'bigint' ? Number(tx.nonce) : Number(tx.nonce);
		return n === nonce;
	});
}

type ReplacementFeeCandidate = {
	maxFeePerGas?: bigint;
	maxPriorityFeePerGas?: bigint;
	gasPrice?: bigint;
};

function hexQuantityToBigInt(h: unknown): bigint | null {
	if (h == null) return null;
	const s = String(h).trim();
	if (!s.startsWith('0x')) return null;
	try {
		return BigInt(s);
	} catch {
		return null;
	}
}

function parseTxpoolRpcTx(obj: unknown): ReplacementFeeCandidate | null {
	if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
	const o = obj as Record<string, unknown>;
	const mf = hexQuantityToBigInt(o.maxFeePerGas);
	const mp = hexQuantityToBigInt(o.maxPriorityFeePerGas);
	const gp = hexQuantityToBigInt(o.gasPrice);
	const out: ReplacementFeeCandidate = {};
	if (mf != null && mf > 0n) out.maxFeePerGas = mf;
	if (mp != null && mp > 0n) out.maxPriorityFeePerGas = mp;
	if (gp != null && gp > 0n) out.gasPrice = gp;
	if (out.maxFeePerGas == null && out.gasPrice == null) return null;
	return out;
}

function txpoolNonceKeyMatches(key: string, nonce: number): boolean {
	const k = key.trim().toLowerCase();
	if (k.startsWith('0x')) {
		try {
			return Number(BigInt(k)) === nonce;
		} catch {
			return false;
		}
	}
	const n = Number(k);
	return Number.isFinite(n) && n === nonce;
}

async function findFeesInTxpoolContent(
	publicClient: PublicClient,
	executor: Address,
	nonce: number,
): Promise<ReplacementFeeCandidate | null> {
	try {
		const raw = (await publicClient.request({
			method: 'txpool_content',
			params: [],
		} as Parameters<PublicClient['request']>[0])) as {
			pending?: Record<string, Record<string, unknown>>;
		};
		const pending = raw?.pending;
		if (!pending || typeof pending !== 'object') return null;
		const wantLc = getAddress(executor).toLowerCase();
		let bucket: Record<string, unknown> | undefined;
		for (const k of Object.keys(pending)) {
			if (k.toLowerCase() === wantLc) {
				bucket = pending[k] as Record<string, unknown>;
				break;
			}
		}
		if (!bucket) return null;
		for (const nKey of Object.keys(bucket)) {
			if (!txpoolNonceKeyMatches(nKey, nonce)) continue;
			const parsed = parseTxpoolRpcTx(bucket[nKey]);
			if (parsed && (parsed.maxFeePerGas != null || parsed.gasPrice != null)) {
				return parsed;
			}
		}
		return null;
	} catch {
		return null;
	}
}

async function getReplacementFeeCandidate(
	publicClient: PublicClient,
	executor: Address,
	nonce: number,
): Promise<ReplacementFeeCandidate | null> {
	const blockTxs = await getPendingPoolTransactions(publicClient);
	const bt = findTxBySenderAndNonce(blockTxs, executor, nonce);
	if (bt) {
		if (bt.maxFeePerGas != null && bt.maxPriorityFeePerGas != null) {
			return {maxFeePerGas: bt.maxFeePerGas, maxPriorityFeePerGas: bt.maxPriorityFeePerGas};
		}
		if (bt.gasPrice != null) return {gasPrice: bt.gasPrice};
	}
	return findFeesInTxpoolContent(publicClient, executor, nonce);
}

export async function fetchEip1559ReplacementFloorWei(
	publicClient: PublicClient,
	executor: Address,
	startNonce: number,
	legCount: number,
	legNonces?: readonly number[] | null,
): Promise<{maxFeePerGas: bigint; maxPriorityFeePerGas: bigint} | null> {
	if (legCount <= 0 || !Number.isFinite(startNonce) || startNonce < 0) return null;

	const block = await publicClient.getBlock({blockTag: 'latest'});
	const baseWei = block.baseFeePerGas ?? 0n;

	let aggPri = 0n;
	let aggMax = 0n;
	let foundAny = false;

	for (let i = 0; i < legCount; i++) {
		const useLeg =
			legNonces != null &&
			legNonces.length === legCount &&
			Number.isFinite(legNonces[i] as number) &&
			(legNonces[i] as number) >= 0;
		const nonce = useLeg ? Number(legNonces![i]) : startNonce + i;
		const c = await getReplacementFeeCandidate(publicClient, executor, nonce);
		if (!c) continue;
		if (c.maxFeePerGas != null && c.maxPriorityFeePerGas != null) {
			foundAny = true;
			const priF = ceilReplacementMinWei(c.maxPriorityFeePerGas);
			const maxF = ceilReplacementMinWei(c.maxFeePerGas);
			if (priF > aggPri) aggPri = priF;
			if (maxF > aggMax) aggMax = maxF;
		} else if (c.gasPrice != null) {
			foundAny = true;
			const g = ceilReplacementMinWei(c.gasPrice);
			if (g > aggPri) aggPri = g;
			if (g > aggMax) aggMax = g;
		}
	}

	if (!foundAny) return null;

	if (baseWei > 0n && aggMax < baseWei + aggPri) {
		aggMax = baseWei + aggPri + parseGwei('0.001');
	}

	return {maxFeePerGas: aggMax, maxPriorityFeePerGas: aggPri};
}

export async function fetchLegacyReplacementGasPriceFloorWei(
	publicClient: PublicClient,
	executor: Address,
	startNonce: number,
	legCount: number,
	legNonces?: readonly number[] | null,
): Promise<bigint | null> {
	if (legCount <= 0 || !Number.isFinite(startNonce) || startNonce < 0) return null;

	let agg = 0n;
	let foundAny = false;
	for (let i = 0; i < legCount; i++) {
		const useLeg =
			legNonces != null &&
			legNonces.length === legCount &&
			Number.isFinite(legNonces[i] as number) &&
			(legNonces[i] as number) >= 0;
		const nonce = useLeg ? Number(legNonces![i]) : startNonce + i;
		const c = await getReplacementFeeCandidate(publicClient, executor, nonce);
		if (!c) continue;
		const gp = c.gasPrice ?? (c.maxFeePerGas != null ? c.maxFeePerGas : null);
		if (gp == null) continue;
		foundAny = true;
		const g = ceilReplacementMinWei(gp);
		if (g > agg) agg = g;
	}
	return foundAny ? agg : null;
}
