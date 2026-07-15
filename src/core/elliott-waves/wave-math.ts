import type {PivotPoint} from './types.js';

export function logPrice(value: number): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new RangeError(`Log requires a positive price, got ${value}`);
	}
	return Math.log(value);
}

export function logDistance(priceA: number, priceB: number): number {
	return Math.abs(logPrice(priceA) - logPrice(priceB));
}

export function exceedsInDirection(priceA: number, priceB: number, isUptrend: boolean): boolean {
	return isUptrend ? priceA > priceB : priceA < priceB;
}

export function findCandleIndex(bars: {timeSec: number}[], timeSec: number): number {
	let lo = 0;
	let hi = bars.length - 1;
	while (lo <= hi) {
		const mid = Math.floor((lo + hi) / 2);
		const t = bars[mid]!.timeSec;
		if (t === timeSec) {
			return mid;
		}
		if (t < timeSec) {
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	if (lo >= bars.length) {
		return bars.length - 1;
	}
	if (lo === 0) {
		return 0;
	}
	return Math.abs(bars[lo]!.timeSec - timeSec) <= Math.abs(bars[lo - 1]!.timeSec - timeSec)
		? lo
		: lo - 1;
}

export function detectExtension(pivots: PivotPoint[]): 'Extended1' | 'Extended3' | 'Extended5' | null {
	if (pivots.length < 6) {
		return null;
	}
	const w1Len = logDistance(pivots[1]!.price, pivots[0]!.price);
	const w3Len = logDistance(pivots[3]!.price, pivots[2]!.price);
	const w5Len = logDistance(pivots[5]!.price, pivots[4]!.price);
	const ext = 1.618;
	if (w1Len >= w3Len * ext && w1Len >= w5Len * ext) {
		return 'Extended1';
	}
	if (w3Len >= w1Len * ext && w3Len >= w5Len * ext) {
		return 'Extended3';
	}
	if (w5Len >= w1Len * ext && w5Len >= w3Len * ext) {
		return 'Extended5';
	}
	return null;
}

export function withinLogTolerance(price: number, target: number, toleranceLog: number): boolean {
	return logDistance(price, target) <= toleranceLog;
}
