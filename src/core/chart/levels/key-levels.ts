import {coerceFiniteNumber, parseChartTimeFromRow} from '../point-normalize.js';

export type KeyLevel = {
	price: number;
	kind: 'support' | 'resistance';
	strength: number;
	touchCount: number;
};

export type CalculateKeyLevelsOptions = {
	lookback?: number;
	tolerancePct?: number;
	maxLevels?: number;
};

function barTimeSec(row: Record<string, unknown>): number | null {
	const time = parseChartTimeFromRow(row);
	if (time == null) {
		return null;
	}
	if (typeof time === 'number') {
		return time;
	}
	return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 1000);
}

export type SwingPoint = {
	price: number;
	kind: 'support' | 'resistance';
	timeSec: number;
};

export function detectSwingsFromBars(
	bars: Record<string, unknown>[],
	lookback: number,
): SwingPoint[] {
	const swings: Array<{price: number; kind: 'support' | 'resistance'; timeSec: number}> =
		[];
	for (let i = lookback; i < bars.length - lookback; i++) {
		const high = coerceFiniteNumber(bars[i]!.high);
		const low = coerceFiniteNumber(bars[i]!.low);
		const t = barTimeSec(bars[i]!);
		if (high == null || low == null || t == null) {
			continue;
		}
		let isHigh = true;
		let isLow = true;
		for (let j = i - lookback; j <= i + lookback; j++) {
			if (j === i) {
				continue;
			}
			const h = coerceFiniteNumber(bars[j]!.high);
			const l = coerceFiniteNumber(bars[j]!.low);
			if (h != null && h > high) {
				isHigh = false;
			}
			if (l != null && l < low) {
				isLow = false;
			}
		}
		if (isHigh) {
			swings.push({price: high, kind: 'resistance', timeSec: t});
		}
		if (isLow) {
			swings.push({price: low, kind: 'support', timeSec: t});
		}
	}
	return swings;
}

/** Swing-based support/resistance levels from OHLCV bars. */
export function calculateKeyLevelsFromBars(
	bars: Record<string, unknown>[],
	options: CalculateKeyLevelsOptions = {},
): KeyLevel[] {
	if (bars.length < 5) {
		return [];
	}
	const lookback = Math.max(2, Math.min(options.lookback ?? 3, Math.floor(bars.length / 8)));
	const tolerancePct = options.tolerancePct ?? 0.003;
	const maxLevels = options.maxLevels ?? 8;
	const swings = detectSwingsFromBars(bars, lookback);
	if (!swings.length) {
		return [];
	}

	type Cluster = {
		price: number;
		kind: 'support' | 'resistance';
		touchCount: number;
		lastTimeSec: number;
	};
	const clusters: Cluster[] = [];
	for (const swing of swings) {
		const tol = swing.price * tolerancePct;
		let merged = false;
		for (const c of clusters) {
			if (c.kind !== swing.kind) {
				continue;
			}
			if (Math.abs(c.price - swing.price) <= tol) {
				c.touchCount++;
				c.price = (c.price * (c.touchCount - 1) + swing.price) / c.touchCount;
				c.lastTimeSec = Math.max(c.lastTimeSec, swing.timeSec);
				merged = true;
				break;
			}
		}
		if (!merged) {
			clusters.push({
				price: swing.price,
				kind: swing.kind,
				touchCount: 1,
				lastTimeSec: swing.timeSec,
			});
		}
	}

	const latestSec = Math.max(...swings.map(s => s.timeSec));
	return clusters
		.map(c => ({
			price: c.price,
			kind: c.kind,
			touchCount: c.touchCount,
			strength: c.touchCount + (c.lastTimeSec >= latestSec - lookback * 3600 ? 1 : 0),
		}))
		.sort((a, b) => b.strength - a.strength || b.touchCount - a.touchCount)
		.slice(0, maxLevels);
}

/** Dominant swing high/low for Fibonacci anchor. */
export function calculateFibonacciRangeFromBars(
	bars: Record<string, unknown>[],
): {high: number; low: number; trend: 'up' | 'down'} | null {
	if (bars.length < 3) {
		return null;
	}
	const lookback = Math.max(2, Math.min(5, Math.floor(bars.length / 10)));
	const swings = detectSwingsFromBars(bars, lookback);
	if (swings.length < 2) {
		let high = Number.NEGATIVE_INFINITY;
		let low = Number.POSITIVE_INFINITY;
		for (const bar of bars) {
			const h = coerceFiniteNumber(bar.high);
			const l = coerceFiniteNumber(bar.low);
			if (h != null) {
				high = Math.max(high, h);
			}
			if (l != null) {
				low = Math.min(low, l);
			}
		}
		if (!Number.isFinite(high) || !Number.isFinite(low) || high === low) {
			return null;
		}
		return {high, low, trend: 'up'};
	}
	const recent = [...swings].sort((a, b) => b.timeSec - a.timeSec).slice(0, 6);
	const highSwing = recent
		.filter(s => s.kind === 'resistance')
		.sort((a, b) => b.price - a.price)[0];
	const lowSwing = recent.filter(s => s.kind === 'support').sort((a, b) => a.price - b.price)[0];
	const high = highSwing?.price ?? Math.max(...recent.map(s => s.price));
	const low = lowSwing?.price ?? Math.min(...recent.map(s => s.price));
	if (!Number.isFinite(high) || !Number.isFinite(low) || high === low) {
		return null;
	}
	const first = recent[recent.length - 1]!;
	const last = recent[0]!;
	const trend = last.price >= first.price ? 'up' : 'down';
	return {high, low, trend};
}
