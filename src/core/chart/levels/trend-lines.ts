import {coerceFiniteNumber, parseChartTimeFromRow} from '../point-normalize.js';
import {detectSwingsFromBars, type SwingPoint} from './key-levels.js';

export type TrendLinePoint = {
	time: number;
	price: number;
};

export type TrendLine = {
	kind: 'support' | 'resistance';
	pointA: TrendLinePoint;
	pointB: TrendLinePoint;
	slope: number;
	touchCount: number;
	score: number;
};

export type CalculateTrendLinesOptions = {
	lookback?: number;
	tolerancePct?: number;
	minTouches?: number;
	maxLines?: number;
	/** When set, only compute lines of this kind (avoids support lines crowding out resistance). */
	kindFilter?: 'support' | 'resistance';
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

export function linePriceAt(timeSec: number, pointA: TrendLinePoint, pointB: TrendLinePoint): number | null {
	const dt = pointB.time - pointA.time;
	if (dt === 0) {
		return null;
	}
	const slope = (pointB.price - pointA.price) / dt;
	return pointA.price + slope * (timeSec - pointA.time);
}

function countLineTouches(
	bars: Record<string, unknown>[],
	pointA: TrendLinePoint,
	pointB: TrendLinePoint,
	kind: 'support' | 'resistance',
	tolerancePct: number,
): number {
	const tMin = Math.min(pointA.time, pointB.time);
	const tMax = Math.max(pointA.time, pointB.time);
	let touches = 0;
	for (const bar of bars) {
		const t = barTimeSec(bar);
		if (t == null || t < tMin || t > tMax) {
			continue;
		}
		const linePrice = linePriceAt(t, pointA, pointB);
		if (linePrice == null || !Number.isFinite(linePrice)) {
			continue;
		}
		const tol = Math.max(Math.abs(linePrice) * tolerancePct, 1e-8);
		if (kind === 'support') {
			const low = coerceFiniteNumber(bar.low);
			if (low != null && Math.abs(low - linePrice) <= tol) {
				touches++;
			}
		} else {
			const high = coerceFiniteNumber(bar.high);
			if (high != null && Math.abs(high - linePrice) <= tol) {
				touches++;
			}
		}
	}
	return touches;
}

function swingToPoint(swing: SwingPoint): TrendLinePoint {
	return {time: swing.timeSec, price: swing.price};
}

function candidateLines(
	swings: SwingPoint[],
	kind: 'support' | 'resistance',
): Array<{pointA: TrendLinePoint; pointB: TrendLinePoint}> {
	const filtered = swings
		.filter(s => s.kind === kind)
		.sort((a, b) => a.timeSec - b.timeSec);
	const out: Array<{pointA: TrendLinePoint; pointB: TrendLinePoint}> = [];
	for (let i = 0; i < filtered.length; i++) {
		for (let j = i + 1; j < filtered.length; j++) {
			const a = filtered[i]!;
			const b = filtered[j]!;
			if (kind === 'support' && b.price < a.price) {
				continue;
			}
			if (kind === 'resistance' && b.price > a.price) {
				continue;
			}
			out.push({pointA: swingToPoint(a), pointB: swingToPoint(b)});
		}
	}
	return out;
}

function lineKey(line: TrendLine): string {
	return `${line.kind}:${line.pointA.time}:${line.pointA.price.toFixed(4)}:${line.pointB.time}:${line.pointB.price.toFixed(4)}`;
}

/** Diagonal support/resistance trend lines from swing pivot pairs. */
export function calculateTrendLinesFromBars(
	bars: Record<string, unknown>[],
	options: CalculateTrendLinesOptions = {},
): TrendLine[] {
	if (bars.length < 8) {
		return [];
	}

	const lookback = Math.max(2, Math.min(options.lookback ?? 3, Math.floor(bars.length / 8)));
	const tolerancePct = options.tolerancePct ?? 0.004;
	const minTouches = Math.max(2, options.minTouches ?? 2);
	const maxLines = Math.min(options.maxLines ?? 4, 8);
	const swings = detectSwingsFromBars(bars, lookback);
	if (swings.length < 2) {
		return [];
	}

	const latestSec = Math.max(...swings.map(s => s.timeSec));
	const candidates: TrendLine[] = [];
	const kinds: Array<'support' | 'resistance'> = options.kindFilter
		? [options.kindFilter]
		: ['support', 'resistance'];

	for (const kind of kinds) {
		for (const {pointA, pointB} of candidateLines(swings, kind)) {
			const dt = pointB.time - pointA.time;
			if (dt <= 0) {
				continue;
			}
			const slope = (pointB.price - pointA.price) / dt;
			const touchCount = countLineTouches(bars, pointA, pointB, kind, tolerancePct);
			if (touchCount < minTouches) {
				continue;
			}
			const recency =
				Math.max(pointA.time, pointB.time) >= latestSec - lookback * 3600 ? 1 : 0;
			candidates.push({
				kind,
				pointA,
				pointB,
				slope,
				touchCount,
				score: touchCount * 2 + recency,
			});
		}
	}

	const seen = new Set<string>();
	return candidates
		.sort((a, b) => b.score - a.score || b.touchCount - a.touchCount)
		.filter(line => {
			const key = lineKey(line);
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		})
		.slice(0, maxLines);
}
