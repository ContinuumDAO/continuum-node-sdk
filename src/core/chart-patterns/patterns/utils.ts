import {
	classifyPattern,
	clampConfidence,
	pctDiff,
	withinPct,
} from '../confidence.js';
import {getChartPatternCatalogEntry} from '../catalog.js';
import {buildPatternInterpretation} from '../interpretation.js';
import type {
	ChartPatternHit,
	ChartPatternId,
	NormalizedBar,
} from '../types.js';

export function finalizeHit(
	partial: Omit<ChartPatternHit, 'classification' | 'interpretation' | 'confidence'> & {
		confidence?: number;
	},
	lastClose: number,
): ChartPatternHit {
	const entry = getChartPatternCatalogEntry(partial.id);
	const confidence = clampConfidence(partial.confidence ?? 0.5);
	const hit: ChartPatternHit = {
		...partial,
		name: partial.name || entry?.name || partial.id,
		confidence,
		classification: classifyPattern(partial.direction, confidence),
		interpretation: '',
	};
	hit.interpretation = buildPatternInterpretation(hit, lastClose);
	return hit;
}

export type DetectorContext = {
	bars: NormalizedBar[];
	swings: import('../types.js').OrderedSwing[];
	highs: import('../types.js').OrderedSwing[];
	lows: import('../types.js').OrderedSwing[];
	lastClose: number;
	focusFromIndex: number;
};

export function makePoint(
	bar: NormalizedBar,
	price: number,
	label?: string,
	role?: string,
): import('../types.js').ChartPatternPoint {
	return {timeSec: bar.timeSec, price, label, role};
}

export function barSpanFromIndices(
	bars: NormalizedBar[],
	fromIndex: number,
	toIndex: number,
): import('../types.js').ChartPatternBarSpan {
	const from = bars[fromIndex]!;
	const to = bars[toIndex]!;
	return {
		fromIndex,
		toIndex,
		fromTimeSec: from.timeSec,
		toTimeSec: to.timeSec,
	};
}

export function shoulderSymmetryScore(a: number, b: number, tolerancePct = 0.12): number {
	return withinPct(a, b, tolerancePct) ? 1 : Math.max(0, 1 - pctDiff(a, b) / tolerancePct);
}

export function headProminenceScore(head: number, shoulderAvg: number, minPct = 0.03): number {
	const diff = Math.abs(head - shoulderAvg) / Math.max(Math.abs(shoulderAvg), 1e-8);
	if (diff < minPct) {
		return 0.2;
	}
	return clampConfidence(Math.min(1, diff / (minPct * 3)));
}

export function depthScore(depth: number, minPct: number, maxPct: number): number {
	if (depth < minPct || depth > maxPct) {
		return Math.max(0.1, 1 - Math.abs(depth - (minPct + maxPct) / 2) / maxPct);
	}
	return 1;
}

export function pickBestHit(candidates: ChartPatternHit[]): ChartPatternHit | null {
	if (!candidates.length) {
		return null;
	}
	return candidates.sort((a, b) => {
		if (b.barSpan.toIndex !== a.barSpan.toIndex) {
			return b.barSpan.toIndex - a.barSpan.toIndex;
		}
		return b.confidence - a.confidence;
	})[0]!;
}

export function idAllowed(id: ChartPatternId, allowed?: ChartPatternId[]): boolean {
	return !allowed?.length || allowed.includes(id);
}
