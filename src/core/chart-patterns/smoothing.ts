import type {NormalizedBar} from './types.js';
import {normalizeBarsFromRows} from './swings.js';

/** Savitzky-Golay quadratic smoothing coefficients (window=5, centered). */
const SG5 = [-3, 12, 17, 12, -3];
const SG5_DENOM = 35;

function centeredConvolve(values: number[], index: number, kernel: number[], denom: number): number {
	const half = Math.floor(kernel.length / 2);
	let sum = 0;
	for (let k = 0; k < kernel.length; k++) {
		const j = index - half + k;
		if (j < 0 || j >= values.length) {
			return values[index]!;
		}
		sum += kernel[k]! * values[j]!;
	}
	return sum / denom;
}

/**
 * Smooth high/low with centered Savitzky-Golay (window 5) — comparable in spirit to
 * TradingPatternScanner's scipy.signal.savgol_filter on High/Low for H&S noise reduction.
 */
export function smoothBarsForHeadShoulders(
	bars: NormalizedBar[],
	window: 3 | 5 = 5,
): NormalizedBar[] {
	if (bars.length < 3) {
		return bars;
	}
	const highs = bars.map(b => b.high);
	const lows = bars.map(b => b.low);
	const kernel = window === 5 ? SG5 : [1, 1, 1];
	const denom = window === 5 ? SG5_DENOM : 3;

	return bars.map((bar, i) => ({
		...bar,
		high: centeredConvolve(highs, i, kernel, denom),
		low: centeredConvolve(lows, i, kernel, denom),
	}));
}

export function barsToRawRows(bars: NormalizedBar[]): Record<string, unknown>[] {
	return bars.map(bar => ({
		time: bar.time,
		open: bar.open,
		high: bar.high,
		low: bar.low,
		close: bar.close,
	}));
}

export const DEFAULT_SMOOTH_HEAD_SHOULDERS = true;
export const DEFAULT_SMOOTH_WINDOW = 5;

/** High/low envelope used by H&S smoothing — may exceed raw bar wicks. */
export function patternDetectionPriceBounds(
	rawBars: Record<string, unknown>[],
	options: {smoothHeadShoulders?: boolean; smoothWindow?: 3 | 5} = {},
): {high: number; low: number} | null {
	if (options.smoothHeadShoulders === false) {
		return null;
	}
	const bars = normalizeBarsFromRows(rawBars);
	if (bars.length < 3) {
		return null;
	}
	const window = options.smoothWindow ?? DEFAULT_SMOOTH_WINDOW;
	const smoothed = smoothBarsForHeadShoulders(bars, window);
	let high = Number.NEGATIVE_INFINITY;
	let low = Number.POSITIVE_INFINITY;
	for (const bar of smoothed) {
		if (bar.high > high) {
			high = bar.high;
		}
		if (bar.low < low) {
			low = bar.low;
		}
	}
	if (!Number.isFinite(high) || !Number.isFinite(low)) {
		return null;
	}
	return {high, low};
}
