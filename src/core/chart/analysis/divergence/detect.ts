import {adaptivePriceProminence, findPeaks, findTroughs} from './peaks.js';
import type {
	DivergenceHit,
	DivergenceKind,
	DivergenceOscillator,
	DivergencePivot,
	DivergencePrimary,
} from './types.js';

export type DetectDivergencesInput = {
	prices: number[];
	oscillator: Array<number | null>;
	timesSec: number[];
	oscillatorId: DivergenceOscillator;
	/** Used for adaptive peak defaults (RSI period or Stoch lookback). */
	period?: number;
	maxLag?: number;
	includeHidden?: boolean;
	allowEqual?: boolean;
	priceProminence?: number;
	oscillatorProminence?: number;
	distance?: number;
};

function cmp(
	a: number,
	b: number,
	op: 'lt' | 'gt',
	allowEqual: boolean,
): boolean {
	if (allowEqual) {
		return op === 'lt' ? a <= b : a >= b;
	}
	return op === 'lt' ? a < b : a > b;
}

function nearestOscillatorPivot(
	oscPivots: number[],
	targetIdx: number,
	maxLag: number,
	minIdxExclusive: number | null,
): number | null {
	let best: number | null = null;
	let bestDist = Number.POSITIVE_INFINITY;
	for (const idx of oscPivots) {
		if (minIdxExclusive != null && idx <= minIdxExclusive) {
			continue;
		}
		const dist = Math.abs(idx - targetIdx);
		if (dist > maxLag) {
			continue;
		}
		if (dist < bestDist || (dist === bestDist && (best == null || idx < best))) {
			best = idx;
			bestDist = dist;
		}
	}
	return best;
}

function pivotAt(
	index: number,
	values: Array<number | null>,
	timesSec: number[],
): DivergencePivot | null {
	const value = values[index];
	const timeSec = timesSec[index];
	if (value == null || !Number.isFinite(value) || timeSec == null || !Number.isFinite(timeSec)) {
		return null;
	}
	return {index, timeSec, value};
}

function pairPath(input: {
	pricePivots: number[];
	oscPivots: number[];
	prices: number[];
	oscillator: Array<number | null>;
	timesSec: number[];
	maxLag: number;
	allowEqual: boolean;
	regularKind: DivergenceKind;
	hiddenKind: DivergenceKind | null;
	/** For regular: price moves opposite to osc; for hidden: same direction vs regular. */
	regularPriceOp: 'lt' | 'gt';
	regularOscOp: 'lt' | 'gt';
}): DivergenceHit[] {
	const hits: DivergenceHit[] = [];
	const lastBar = input.prices.length - 1;
	let lastOscUsed = -1;

	for (let i = 0; i < input.pricePivots.length - 1; i++) {
		const p1Idx = input.pricePivots[i]!;
		const p2Idx = input.pricePivots[i + 1]!;
		const price1 = input.prices[p1Idx]!;
		const price2 = input.prices[p2Idx]!;

		const o1Idx = nearestOscillatorPivot(input.oscPivots, p1Idx, input.maxLag, lastOscUsed);
		if (o1Idx == null) {
			continue;
		}
		const o2Idx = nearestOscillatorPivot(input.oscPivots, p2Idx, input.maxLag, o1Idx);
		if (o2Idx == null) {
			continue;
		}

		const osc1 = input.oscillator[o1Idx];
		const osc2 = input.oscillator[o2Idx];
		if (osc1 == null || osc2 == null || !Number.isFinite(osc1) || !Number.isFinite(osc2)) {
			continue;
		}

		let kind: DivergenceKind | null = null;
		const regularPrice = cmp(price2, price1, input.regularPriceOp, input.allowEqual);
		const regularOsc = cmp(osc2, osc1, input.regularOscOp, input.allowEqual);
		if (regularPrice && regularOsc) {
			kind = input.regularKind;
		} else if (input.hiddenKind != null) {
			const hiddenPriceOp = input.regularPriceOp === 'lt' ? 'gt' : 'lt';
			const hiddenOscOp = input.regularOscOp === 'lt' ? 'gt' : 'lt';
			if (
				cmp(price2, price1, hiddenPriceOp, input.allowEqual) &&
				cmp(osc2, osc1, hiddenOscOp, input.allowEqual)
			) {
				kind = input.hiddenKind;
			}
		}
		if (kind == null) {
			continue;
		}

		const p1 = pivotAt(p1Idx, input.prices, input.timesSec);
		const p2 = pivotAt(p2Idx, input.prices, input.timesSec);
		const o1 = pivotAt(o1Idx, input.oscillator, input.timesSec);
		const o2 = pivotAt(o2Idx, input.oscillator, input.timesSec);
		if (!p1 || !p2 || !o1 || !o2) {
			continue;
		}

		hits.push({
			kind,
			oscillator: 'rsi', // overwritten by caller
			p1: {index: p1.index, timeSec: p1.timeSec, value: p1.value},
			p2: {index: p2.index, timeSec: p2.timeSec, value: p2.value},
			o1: {index: o1.index, timeSec: o1.timeSec, value: o1.value},
			o2: {index: o2.index, timeSec: o2.timeSec, value: o2.value},
			barsSinceConfirm: Math.max(0, lastBar - p2Idx),
		});
		lastOscUsed = o2Idx;
	}
	return hits;
}

export function detectDivergences(input: DetectDivergencesInput): DivergenceHit[] {
	const n = Math.min(input.prices.length, input.oscillator.length, input.timesSec.length);
	if (n < 10) {
		return [];
	}
	const prices = input.prices.slice(0, n);
	const oscillator = input.oscillator.slice(0, n);
	const timesSec = input.timesSec.slice(0, n);
	const period = input.period ?? 14;
	const maxLag = input.maxLag ?? 3;
	const includeHidden = input.includeHidden !== false;
	const allowEqual = input.allowEqual !== false;
	const distance = input.distance ?? Math.max(1, Math.floor(period / 2));
	const priceProminence =
		input.priceProminence ?? adaptivePriceProminence(prices, period);
	const oscProminence = input.oscillatorProminence ?? 5;

	const pricePeaks = findPeaks(prices, {distance, prominence: priceProminence});
	const priceTroughs = findTroughs(prices, {distance, prominence: priceProminence});
	const oscPeaks = findPeaks(oscillator, {distance, prominence: oscProminence});
	const oscTroughs = findTroughs(oscillator, {distance, prominence: oscProminence});

	const bullish = pairPath({
		pricePivots: priceTroughs,
		oscPivots: oscTroughs,
		prices,
		oscillator,
		timesSec,
		maxLag,
		allowEqual,
		regularKind: 'regular_bullish',
		hiddenKind: includeHidden ? 'hidden_bullish' : null,
		// regular bullish: price LL (p2 < p1), osc HL (o2 > o1)
		regularPriceOp: 'lt',
		regularOscOp: 'gt',
	});

	const bearish = pairPath({
		pricePivots: pricePeaks,
		oscPivots: oscPeaks,
		prices,
		oscillator,
		timesSec,
		maxLag,
		allowEqual,
		regularKind: 'regular_bearish',
		hiddenKind: includeHidden ? 'hidden_bearish' : null,
		// regular bearish: price HH (p2 > p1), osc LH (o2 < o1)
		regularPriceOp: 'gt',
		regularOscOp: 'lt',
	});

	return [...bullish, ...bearish].map(hit => ({
		...hit,
		oscillator: input.oscillatorId,
	}));
}

function isRegular(kind: DivergenceKind): boolean {
	return kind === 'regular_bullish' || kind === 'regular_bearish';
}

function sideFromKind(kind: DivergenceKind): 'long' | 'short' {
	return kind === 'regular_bullish' || kind === 'hidden_bullish' ? 'long' : 'short';
}

function oscillatorRank(id: DivergenceOscillator): number {
	return id === 'rsi' ? 0 : 1;
}

function extremityBonus(hit: DivergenceHit): number {
	const v = hit.o2.value;
	if (hit.oscillator === 'stochasticrsi') {
		if (v <= 20 || v >= 80) {
			return 0.08;
		}
		if (v <= 30 || v >= 70) {
			return 0.04;
		}
		return 0;
	}
	if (v <= 30 || v >= 70) {
		return 0.08;
	}
	if (v <= 40 || v >= 60) {
		return 0.04;
	}
	return 0;
}

export function confidenceForHit(hit: DivergenceHit): number {
	const base = isRegular(hit.kind) ? 0.55 : 0.5;
	const freshness = Math.max(0, 0.12 - hit.barsSinceConfirm * 0.015);
	const delta = Math.abs(hit.o2.value - hit.o1.value);
	const deltaBonus = Math.min(0.1, delta / 100);
	const score = base + freshness + deltaBonus + extremityBonus(hit);
	return Math.min(0.85, Math.max(0.35, Math.round(score * 100) / 100));
}

/** Deterministic PRIMARY: most recent p2, then |Δosc|, regular over hidden, RSI over Stoch. */
export function selectPrimaryDivergence(hits: DivergenceHit[]): DivergencePrimary | null {
	if (!hits.length) {
		return null;
	}
	const sorted = [...hits].sort((a, b) => {
		if (a.barsSinceConfirm !== b.barsSinceConfirm) {
			return a.barsSinceConfirm - b.barsSinceConfirm;
		}
		const da = Math.abs(a.o2.value - a.o1.value);
		const db = Math.abs(b.o2.value - b.o1.value);
		if (da !== db) {
			return db - da;
		}
		const ra = isRegular(a.kind) ? 0 : 1;
		const rb = isRegular(b.kind) ? 0 : 1;
		if (ra !== rb) {
			return ra - rb;
		}
		return oscillatorRank(a.oscillator) - oscillatorRank(b.oscillator);
	});
	const best = sorted[0]!;
	return {
		...best,
		side: sideFromKind(best.kind),
		confidence: confidenceForHit(best),
	};
}

export function kindLabel(kind: DivergenceKind): string {
	switch (kind) {
		case 'regular_bullish':
			return 'Regular bullish';
		case 'regular_bearish':
			return 'Regular bearish';
		case 'hidden_bullish':
			return 'Hidden bullish';
		case 'hidden_bearish':
			return 'Hidden bearish';
		default:
			return kind;
	}
}
