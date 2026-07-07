import type {ChartPatternHit, EnrichedChartPatternHit, PatternMenuEntry} from './types.js';

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

export function enrichPatternMenuEntry(
	hit: EnrichedChartPatternHit,
	base: Omit<PatternMenuEntry, 'barSpan' | 'keyLevels'>,
): PatternMenuEntry {
	return {
		...base,
		barSpan: patternBarSpanSummary(hit),
		keyLevels: buildPatternKeyLevels(hit),
	};
}
