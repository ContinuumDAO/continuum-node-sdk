import type {NormalizedBar} from './types.js';

function trueRange(bar: NormalizedBar, prevClose: number | null): number | null {
	if (prevClose == null) {
		return bar.high - bar.low;
	}
	return Math.max(
		bar.high - bar.low,
		Math.abs(bar.high - prevClose),
		Math.abs(bar.low - prevClose),
	);
}

/** Wilder-style ATR value at each bar index (SMA of TR over trailing period). */
export function averageTrueRangeSeries(bars: NormalizedBar[], period = 14): Array<number | null> {
	if (!bars.length || period < 1) {
		return [];
	}
	const out: Array<number | null> = [];
	const trs: number[] = [];
	for (let i = 0; i < bars.length; i++) {
		const prevClose = i > 0 ? bars[i - 1]!.close : null;
		const tr = trueRange(bars[i]!, prevClose);
		if (tr == null || !Number.isFinite(tr)) {
			out.push(null);
			continue;
		}
		trs.push(tr);
		if (trs.length < period) {
			out.push(null);
			continue;
		}
		const slice = trs.slice(-period);
		out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
	}
	return out;
}

export function atrAtBreakout(bars: NormalizedBar[], breakIndex: number, period = 14): number | null {
	const series = averageTrueRangeSeries(bars, period);
	return series[breakIndex] ?? series.at(-1) ?? null;
}

export const DEFAULT_RETEST_ATR_PERIOD = 14;
export const DEFAULT_RETEST_ATR_MULTIPLIER = 1;

export type RetestTolerance = {
	excursionBand: number;
	atrBand: number;
	combined: number;
};

export function retestToleranceBands(
	move: number,
	retestTolerancePct: number,
	atr: number | null,
	atrMultiplier: number,
): RetestTolerance {
	const excursionBand = move * retestTolerancePct;
	const atrBand = atr != null && atr > 0 && atrMultiplier > 0 ? atr * atrMultiplier : 0;
	return {
		excursionBand,
		atrBand,
		combined: Math.max(excursionBand, atrBand),
	};
}

export type RetestBandKind = 'excursion_pct' | 'atr' | 'combined';

export function retestBandKind(
	priceDistance: number,
	bands: RetestTolerance,
): RetestBandKind {
	const withinExcursion = priceDistance <= bands.excursionBand;
	const withinAtr = bands.atrBand > 0 && priceDistance <= bands.atrBand;
	if (withinExcursion && withinAtr) {
		return 'combined';
	}
	if (withinAtr) {
		return 'atr';
	}
	return 'excursion_pct';
}
