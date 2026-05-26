/**
 * Get Sig / Get Sigs: EIP-1559 tiers use `eth_feeHistory` reward percentiles for priority fee;
 * legacy tiers scale `eth_gasPrice`. Custom Gas (chain detail) remains min/floor and multipliers at call sites.
 */

import type {PublicClient} from 'viem';
import {formatUnits, parseGwei} from 'viem';
import type {ChainDetailRow} from '../detops/mpc/types.js';
import {gweiToDecimalString} from './gwei.js';
import type {ChainFeeParams} from './chain-fees.js';

export type GetSigFeeSpeedTier = 'slow' | 'normal' | 'fast' | 'advanced';

const REWARD_PERCENTILES = [15, 50, 85] as const;

const PERCENTILE_INDEX: Record<'slow' | 'normal' | 'fast', number> = {
	slow: 0,
	normal: 1,
	fast: 2,
};

const TIER_BASE_COMPONENT_EXTRA_PCT: Record<'slow' | 'normal' | 'fast', number> = {
	slow: 0,
	normal: 0,
	fast: 12,
};

const LEGACY_GAS_PRICE_SCALE_PERMILLE: Record<'slow' | 'normal' | 'fast', number> = {
	slow: 920,
	normal: 1000,
	fast: 1180,
};

type FeeHistoryRpc = {
	baseFeePerGas?: string[];
	reward?: (string[] | null)[];
};

export function normalizeGetSigFeeSpeedTier(raw: unknown): 'slow' | 'normal' | 'fast' {
	const s = raw == null ? '' : String(raw).trim().toLowerCase();
	if (s === 'slow' || s === 'normal' || s === 'fast') return s;
	return 'normal';
}

export function getDefaultGetSigFeeSpeedFromChainDetail(
	chain: ChainDetailRow | undefined | null,
): 'slow' | 'normal' | 'fast' {
	if (!chain) return 'normal';
	const c = chain as Record<string, unknown>;
	const v = c.defaultGetSigFeeSpeed ?? c.default_get_sig_fee_speed;
	return normalizeGetSigFeeSpeedTier(v);
}

function parsePositiveGweiToWei(input: string): bigint | null {
	const t = input.trim().replace(/,/g, '');
	if (!t) return null;
	const n = Number(t);
	if (!Number.isFinite(n) || n <= 0) return null;
	try {
		return parseGwei(t as `${number}`);
	} catch {
		try {
			return parseGwei(String(n) as `${number}`);
		} catch {
			return null;
		}
	}
}

async function fetchTierPriorityFeeWei(
	publicClient: PublicClient,
	tier: 'slow' | 'normal' | 'fast',
): Promise<bigint> {
	const idx = PERCENTILE_INDEX[tier];
	let priorityWei: bigint | undefined;

	try {
		const raw = (await publicClient.request({
			method: 'eth_feeHistory',
			params: ['0x14', 'latest', [...REWARD_PERCENTILES]],
		})) as FeeHistoryRpc;
		const rewards = raw.reward;
		if (Array.isArray(rewards) && rewards.length > 0) {
			const last = rewards[rewards.length - 1];
			if (last != null && last[idx] != null) {
				const w = BigInt(last[idx] as string);
				if (w > 0n) priorityWei = w;
			}
		}
	} catch {
		/* fallback below */
	}

	if (priorityWei == null || priorityWei === 0n) {
		try {
			priorityWei = await publicClient.estimateMaxPriorityFeePerGas();
		} catch {
			priorityWei = parseGwei('1.5');
		}
	}

	const tierScale = tier === 'slow' ? 88n : tier === 'fast' ? 125n : 100n;
	priorityWei = (priorityWei * tierScale) / 100n;
	if (priorityWei < parseGwei('0.001')) priorityWei = parseGwei('1');
	return priorityWei;
}

export async function fetchNormalTierGweiHintsForAdvanced(
	publicClient: PublicClient,
	feeParams: ChainFeeParams,
	chainDetail: ChainDetailRow,
): Promise<{maxFeeGwei: string; maxPriorityGwei: string; gasPriceGwei: string}> {
	const legacy = Boolean(chainDetail?.legacy) || !feeParams.isEip1559;
	if (legacy) {
		const gasPriceWei = await publicClient.getGasPrice();
		const g = formatUnits(gasPriceWei, 9);
		return {maxFeeGwei: '', maxPriorityGwei: '', gasPriceGwei: trimGweiDisplay(g)};
	}

	const fetchedBase = feeParams.baseFeeGwei ?? 0;
	const configuredBase = chainDetail?.baseFee != null ? Number(chainDetail.baseFee) : 0;
	const configuredPriority =
		chainDetail?.priorityFee != null ? Number(chainDetail.priorityFee) : 0;
	const fetchedPriorityFallback = feeParams.priorityFeeGwei ?? 0;
	const priorityWei = await fetchTierPriorityFeeWei(publicClient, 'normal');
	const tierPriGwei = parseFloat(formatUnits(priorityWei, 9));
	const effectiveBaseFeeGwei = Math.max(fetchedBase, configuredBase);
	const effectivePriorityFeeGwei = Math.max(
		tierPriGwei,
		configuredPriority,
		fetchedPriorityFallback,
	);
	const baseFeeMultiplierPct =
		chainDetail?.baseFeeMultiplier != null
			? Math.max(100, Number(chainDetail.baseFeeMultiplier))
			: 100;
	let baseComponentGwei = (effectiveBaseFeeGwei * baseFeeMultiplierPct) / 100;
	const extra = TIER_BASE_COMPONENT_EXTRA_PCT.normal;
	if (extra !== 0) {
		baseComponentGwei = (baseComponentGwei * (100 + extra)) / 100;
	}
	const maxFeePerGasGwei = baseComponentGwei + effectivePriorityFeeGwei;

	let maxPriorityFeePerGas =
		effectivePriorityFeeGwei > 0
			? parseGwei(gweiToDecimalString(effectivePriorityFeeGwei))
			: parseGwei('1');
	let maxFeePerGas = parseGwei(gweiToDecimalString(maxFeePerGasGwei));

	const block = await publicClient.getBlock({blockTag: 'latest'});
	const baseWei = block.baseFeePerGas ?? 0n;
	if (baseWei > 0n && maxFeePerGas < baseWei + maxPriorityFeePerGas) {
		maxFeePerGas = baseWei + maxPriorityFeePerGas + parseGwei('0.001');
	}

	return {
		maxFeeGwei: trimGweiDisplay(formatUnits(maxFeePerGas, 9)),
		maxPriorityGwei: trimGweiDisplay(formatUnits(maxPriorityFeePerGas, 9)),
		gasPriceGwei: '',
	};
}

export function trimGweiDisplay(s: string): string {
	const n = Number(s);
	if (!Number.isFinite(n)) return s;
	if (n >= 100) return n.toFixed(2).replace(/\.?0+$/, '');
	if (n >= 1) return n.toFixed(4).replace(/\.?0+$/, '');
	return n.toFixed(6).replace(/\.?0+$/, '');
}

function finalizeEip1559GetSigFees(
	maxFeePerGas: bigint,
	maxPriorityFeePerGas: bigint,
	floor: {maxFeePerGas: bigint; maxPriorityFeePerGas: bigint} | null | undefined,
	baseWei: bigint,
): ResolvedGetSigEip1559Fees {
	let maxP = maxPriorityFeePerGas;
	let maxF = maxFeePerGas;
	if (floor) {
		if (maxP < floor.maxPriorityFeePerGas) maxP = floor.maxPriorityFeePerGas;
		if (maxF < floor.maxFeePerGas) maxF = floor.maxFeePerGas;
	}
	if (baseWei > 0n && maxF < baseWei + maxP) {
		maxF = baseWei + maxP + parseGwei('0.001');
	}
	if (maxF < maxP) {
		maxF = baseWei > 0n ? baseWei + maxP + parseGwei('0.001') : maxP * 2n;
	}
	return {maxFeePerGas: maxF, maxPriorityFeePerGas: maxP};
}

export function alignEip1559FeesWithLatestBase(
	maxFeePerGas: bigint,
	maxPriorityFeePerGas: bigint,
	latestBlockBaseFeeWei: bigint,
): ResolvedGetSigEip1559Fees {
	return finalizeEip1559GetSigFees(
		maxFeePerGas,
		maxPriorityFeePerGas,
		null,
		latestBlockBaseFeeWei,
	);
}

export function mergeAdvancedGweiHintsWithReplacementFloors(
	hints: {maxFeeGwei: string; maxPriorityGwei: string; gasPriceGwei: string},
	eip1559Floor: {maxFeePerGas: bigint; maxPriorityFeePerGas: bigint} | null,
	legacyGasPriceWei: bigint | null,
	legacy: boolean,
): {maxFeeGwei: string; maxPriorityGwei: string; gasPriceGwei: string} {
	if (legacy && legacyGasPriceWei != null && legacyGasPriceWei > 0n) {
		const g = Number(formatUnits(legacyGasPriceWei, 9));
		const hint = parseFloat(hints.gasPriceGwei) || 0;
		return {...hints, gasPriceGwei: trimGweiDisplay(String(Math.max(hint, g)))};
	}
	if (!legacy && eip1559Floor != null) {
		const priN = Number(formatUnits(eip1559Floor.maxPriorityFeePerGas, 9));
		const maxN = Number(formatUnits(eip1559Floor.maxFeePerGas, 9));
		const hintPri = parseFloat(hints.maxPriorityGwei) || 0;
		const hintMax = parseFloat(hints.maxFeeGwei) || 0;
		return {
			...hints,
			maxPriorityGwei: trimGweiDisplay(String(Math.max(hintPri, priN))),
			maxFeeGwei: trimGweiDisplay(String(Math.max(hintMax, maxN))),
		};
	}
	return hints;
}

export type ResolvedGetSigLegacyFees = {gasPriceWei: bigint};

export type ResolvedGetSigEip1559Fees = {
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
};

export type ResolveGetSigFeesArgs = {
	publicClient: PublicClient;
	feeParams: ChainFeeParams;
	chainDetail: ChainDetailRow;
	legacy: boolean;
	tier: GetSigFeeSpeedTier;
	advancedMaxFeeGwei?: string;
	advancedPriorityFeeGwei?: string;
	advancedGasPriceGwei?: string;
	gasFeeMultiplier?: number;
	eip1559ReplacementFloorWei?: {
		maxFeePerGas: bigint;
		maxPriorityFeePerGas: bigint;
	} | null;
	legacyReplacementGasPriceWei?: bigint | null;
};

export async function resolveGetSigFeeWei(
	args: ResolveGetSigFeesArgs,
): Promise<ResolvedGetSigLegacyFees | ResolvedGetSigEip1559Fees> {
	const {publicClient, feeParams, chainDetail, legacy, tier, gasFeeMultiplier} = args;
	const gm = gasFeeMultiplier != null && gasFeeMultiplier > 0 ? gasFeeMultiplier : 0;

	if (legacy) {
		let gasPriceWei = await publicClient.getGasPrice();
		if (tier === 'advanced') {
			const custom = parsePositiveGweiToWei(args.advancedGasPriceGwei ?? '');
			if (custom == null) throw new Error('Advanced: enter a valid gas price (gwei).');
			gasPriceWei = custom;
		} else if (tier !== 'normal') {
			const m = LEGACY_GAS_PRICE_SCALE_PERMILLE[tier];
			gasPriceWei = (gasPriceWei * BigInt(m)) / 1000n;
		}
		if (gm > 0) gasPriceWei = (gasPriceWei * BigInt(100 + gm)) / 100n;
		const configuredGasPriceGwei =
			chainDetail?.gasPrice != null ? Number(chainDetail.gasPrice) : undefined;
		const configuredGasPriceWei =
			configuredGasPriceGwei != null && configuredGasPriceGwei > 0
				? parseGwei(String(configuredGasPriceGwei) as `${number}`)
				: 0n;
		let out = configuredGasPriceWei > gasPriceWei ? configuredGasPriceWei : gasPriceWei;
		const rep = args.legacyReplacementGasPriceWei;
		if (rep != null && rep > out) out = rep;
		return {gasPriceWei: out};
	}

	if (tier === 'advanced') {
		const p = parsePositiveGweiToWei(args.advancedPriorityFeeGwei ?? '');
		const f = parsePositiveGweiToWei(args.advancedMaxFeeGwei ?? '');
		if (p == null || f == null) {
			throw new Error('Advanced: enter valid max fee and priority fee (gwei).');
		}
		let maxPriorityFeePerGas = p;
		let maxFeePerGas = f;
		if (gm > 0) {
			maxPriorityFeePerGas = (maxPriorityFeePerGas * BigInt(100 + gm)) / 100n;
			maxFeePerGas = (maxFeePerGas * BigInt(100 + gm)) / 100n;
		}
		const block = await publicClient.getBlock({blockTag: 'latest'});
		const baseWei = block.baseFeePerGas ?? 0n;
		if (baseWei > 0n && maxFeePerGas < baseWei + maxPriorityFeePerGas) {
			maxFeePerGas = baseWei + maxPriorityFeePerGas + parseGwei('0.001');
		}
		return finalizeEip1559GetSigFees(
			maxFeePerGas,
			maxPriorityFeePerGas,
			args.eip1559ReplacementFloorWei,
			baseWei,
		);
	}

	const speedTier = tier as 'slow' | 'normal' | 'fast';
	const fetchedBase = feeParams.baseFeeGwei ?? 0;
	const fetchedPriorityFallback = feeParams.priorityFeeGwei ?? 0;
	const configuredBase = chainDetail?.baseFee != null ? Number(chainDetail.baseFee) : 0;
	const configuredPriority =
		chainDetail?.priorityFee != null ? Number(chainDetail.priorityFee) : 0;

	const priorityWei = await fetchTierPriorityFeeWei(publicClient, speedTier);
	const tierPriGwei = parseFloat(formatUnits(priorityWei, 9));
	const effectiveBaseFeeGwei = Math.max(fetchedBase, configuredBase);
	const effectivePriorityFeeGwei = Math.max(
		tierPriGwei,
		configuredPriority,
		fetchedPriorityFallback > 0 ? fetchedPriorityFallback : 0,
	);

	const baseFeeMultiplierPct =
		chainDetail?.baseFeeMultiplier != null
			? Math.max(100, Number(chainDetail.baseFeeMultiplier))
			: 100;
	let baseComponentGwei = (effectiveBaseFeeGwei * baseFeeMultiplierPct) / 100;
	const extra = TIER_BASE_COMPONENT_EXTRA_PCT[speedTier];
	if (extra !== 0) {
		baseComponentGwei = (baseComponentGwei * (100 + extra)) / 100;
	}
	const maxFeePerGasGwei = baseComponentGwei + effectivePriorityFeeGwei;

	let maxPriorityFeePerGas =
		effectivePriorityFeeGwei > 0
			? parseGwei(gweiToDecimalString(effectivePriorityFeeGwei))
			: parseGwei('1');
	let maxFeePerGas =
		effectiveBaseFeeGwei > 0
			? parseGwei(gweiToDecimalString(maxFeePerGasGwei))
			: maxPriorityFeePerGas * 2n;

	if (gm > 0) {
		maxPriorityFeePerGas = (maxPriorityFeePerGas * BigInt(100 + gm)) / 100n;
		maxFeePerGas = (maxFeePerGas * BigInt(100 + gm)) / 100n;
	}

	const block = await publicClient.getBlock({blockTag: 'latest'});
	const baseWei = block.baseFeePerGas ?? 0n;
	if (baseWei > 0n && maxFeePerGas < baseWei + maxPriorityFeePerGas) {
		maxFeePerGas = baseWei + maxPriorityFeePerGas + parseGwei('0.001');
	}

	return finalizeEip1559GetSigFees(
		maxFeePerGas,
		maxPriorityFeePerGas,
		args.eip1559ReplacementFloorWei,
		baseWei,
	);
}

export type GetSigTierFeePreviewLines = {
	legacy: boolean;
	slow: string;
	normal: string;
	fast: string;
};

export async function fetchGetSigTierFeePreviewLines(
	publicClient: PublicClient,
	feeParams: ChainFeeParams,
	chainDetail: ChainDetailRow,
): Promise<GetSigTierFeePreviewLines> {
	const legacy = Boolean(chainDetail?.legacy) || !feeParams.isEip1559;
	const gasFeeMultiplier =
		chainDetail?.gasMultiplier != null ? Number(chainDetail.gasMultiplier) : undefined;
	const gm = gasFeeMultiplier != null && gasFeeMultiplier > 0 ? gasFeeMultiplier : undefined;
	const tiers = ['slow', 'normal', 'fast'] as const;
	const lines = await Promise.all(
		tiers.map(async tier => {
			const r = await resolveGetSigFeeWei({
				publicClient,
				feeParams,
				chainDetail,
				legacy,
				tier,
				gasFeeMultiplier: gm,
			});
			if (legacy) {
				const w = (r as ResolvedGetSigLegacyFees).gasPriceWei;
				return `${trimGweiDisplay(formatUnits(w, 9))} gwei`;
			}
			const e = r as ResolvedGetSigEip1559Fees;
			const maxG = trimGweiDisplay(formatUnits(e.maxFeePerGas, 9));
			const priG = trimGweiDisplay(formatUnits(e.maxPriorityFeePerGas, 9));
			return `max ${maxG} · ${priG} gwei`;
		}),
	);
	return {legacy, slow: lines[0]!, normal: lines[1]!, fast: lines[2]!};
}
