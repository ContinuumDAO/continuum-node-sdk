import type {FindPeaksOptions} from './types.js';

/**
 * Local maxima with optional minimum distance and prominence.
 * Prominence ≈ height above the higher of the left/right flanking minima
 * (same spirit as scipy.signal.find_peaks without SciPy).
 */
export function findPeaks(values: Array<number | null>, options: FindPeaksOptions = {}): number[] {
	const distance = Math.max(1, Math.floor(options.distance ?? 1));
	const prominence = options.prominence;
	const n = values.length;
	if (n < 3) {
		return [];
	}

	const candidates: number[] = [];
	for (let i = 1; i < n - 1; i++) {
		const v = values[i];
		if (v == null || !Number.isFinite(v)) {
			continue;
		}
		const left = values[i - 1];
		const right = values[i + 1];
		if (left == null || right == null || !Number.isFinite(left) || !Number.isFinite(right)) {
			continue;
		}
		if (v > left && v >= right) {
			candidates.push(i);
		}
	}

	const withProminence =
		prominence != null && Number.isFinite(prominence) && prominence > 0
			? candidates.filter(i => peakProminence(values, i) >= prominence)
			: candidates;

	return enforceDistance(withProminence, values, distance);
}

export function findTroughs(values: Array<number | null>, options: FindPeaksOptions = {}): number[] {
	const negated = values.map(v => (v == null || !Number.isFinite(v) ? null : -v));
	return findPeaks(negated, options);
}

function peakProminence(values: Array<number | null>, peakIdx: number): number {
	const peak = values[peakIdx];
	if (peak == null || !Number.isFinite(peak)) {
		return 0;
	}
	let leftMin = peak;
	for (let i = peakIdx - 1; i >= 0; i--) {
		const v = values[i];
		if (v == null || !Number.isFinite(v)) {
			continue;
		}
		if (v > peak) {
			break;
		}
		leftMin = Math.min(leftMin, v);
	}
	let rightMin = peak;
	for (let i = peakIdx + 1; i < values.length; i++) {
		const v = values[i];
		if (v == null || !Number.isFinite(v)) {
			continue;
		}
		if (v > peak) {
			break;
		}
		rightMin = Math.min(rightMin, v);
	}
	const base = Math.max(leftMin, rightMin);
	return peak - base;
}

function enforceDistance(
	indices: number[],
	values: Array<number | null>,
	distance: number,
): number[] {
	if (indices.length <= 1 || distance <= 1) {
		return indices;
	}
	const sorted = [...indices].sort((a, b) => {
		const va = values[a] ?? Number.NEGATIVE_INFINITY;
		const vb = values[b] ?? Number.NEGATIVE_INFINITY;
		return (vb as number) - (va as number);
	});
	const kept: number[] = [];
	for (const idx of sorted) {
		if (kept.every(k => Math.abs(k - idx) >= distance)) {
			kept.push(idx);
		}
	}
	return kept.sort((a, b) => a - b);
}

/** Adaptive price prominence ≈ 0.5 * rolling_std(pct_change, period) * last_price. */
export function adaptivePriceProminence(prices: number[], period: number): number {
	if (prices.length < 3) {
		return 0;
	}
	const window = Math.max(2, Math.min(period, prices.length - 1));
	const changes: number[] = [];
	const start = prices.length - window;
	for (let i = Math.max(1, start); i < prices.length; i++) {
		const prev = prices[i - 1]!;
		const cur = prices[i]!;
		if (prev !== 0 && Number.isFinite(prev) && Number.isFinite(cur)) {
			changes.push((cur - prev) / prev);
		}
	}
	if (!changes.length) {
		return 0;
	}
	const mean = changes.reduce((a, b) => a + b, 0) / changes.length;
	const variance =
		changes.reduce((a, b) => a + (b - mean) * (b - mean), 0) / changes.length;
	const std = Math.sqrt(Math.max(0, variance));
	const last = prices[prices.length - 1]!;
	return 0.5 * std * Math.abs(last);
}
