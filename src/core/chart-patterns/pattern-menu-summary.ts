import type {
	ChartPatternHit,
	EnrichedChartPatternHit,
	PatternMeasuredMoveSummary,
	PatternMenuEntry,
} from './types.js';

export type PatternKeyLevelSummary = {
	label: string;
	price: number;
	timeSec?: number;
};

export type PatternBarSpanSummary = {
	fromTimeSec: number;
	toTimeSec: number;
	barCount: number;
};

/** Minimum pattern span (inclusive bar count) to appear in analyze_chart_patterns menu output. */
export const CHART_PATTERN_MENU_MIN_BARS = 6;

export function patternHitBarCount(hit: ChartPatternHit): number {
	return hit.barSpan.toIndex - hit.barSpan.fromIndex + 1;
}

export function meetsChartPatternMenuMinBars(hit: ChartPatternHit): boolean {
	return patternHitBarCount(hit) >= CHART_PATTERN_MENU_MIN_BARS;
}

export function patternBarSpanSummary(hit: ChartPatternHit): PatternBarSpanSummary {
	return {
		fromTimeSec: hit.barSpan.fromTimeSec,
		toTimeSec: hit.barSpan.toTimeSec,
		barCount: hit.barSpan.toIndex - hit.barSpan.fromIndex + 1,
	};
}

/** Compact labeled price/time anchors for agent summaries (from levels + named points). */
export function buildPatternKeyLevels(hit: ChartPatternHit, max = 5): PatternKeyLevelSummary[] {
	const out: PatternKeyLevelSummary[] = [];
	const seen = new Set<string>();

	const add = (label: string, price: number, timeSec?: number) => {
		if (!Number.isFinite(price) || out.length >= max) {
			return;
		}
		const key = `${label.toLowerCase()}:${price}:${timeSec ?? ''}`;
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		out.push({
			label,
			price,
			...(timeSec != null && Number.isFinite(timeSec) ? {timeSec} : {}),
		});
	};

	for (const level of hit.levels ?? []) {
		add(level.label ?? level.kind ?? 'level', level.price);
	}
	for (const point of hit.points) {
		const label = point.label ?? point.role;
		if (label) {
			add(label, point.price, point.timeSec);
		}
	}

	return out;
}

export function buildPatternMeasuredMoveSummary(
	hit: EnrichedChartPatternHit,
): PatternMeasuredMoveSummary | undefined {
	const mm = hit.measuredMove;
	if (!mm) {
		return undefined;
	}
	return {
		targetPrice: mm.targetPrice,
		referencePrice: mm.referencePrice,
		direction: mm.direction,
		status: mm.status,
		formula: mm.formula,
	};
}

export function enrichPatternMenuEntry(
	hit: EnrichedChartPatternHit,
	base: Omit<PatternMenuEntry, 'barSpan' | 'keyLevels' | 'measuredMove'>,
): PatternMenuEntry {
	const measuredMove = buildPatternMeasuredMoveSummary(hit);
	return {
		...base,
		barSpan: patternBarSpanSummary(hit),
		keyLevels: buildPatternKeyLevels(hit),
		...(measuredMove ? {measuredMove} : {}),
	};
}
