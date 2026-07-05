import {
	classificationLabel,
	confidenceLabel,
} from './confidence.js';
import {getChartPatternCatalogEntry} from './catalog.js';
import type {ChartPatternHit, NormalizedBar} from './types.js';

const EMPTY_INTERPRETATION =
	'No completed classic chart pattern met the confidence threshold in the recent window. Do not infer directional bias from pattern geometry alone; use trend structure and key levels instead.';

export function emptyInterpretation(): string {
	return EMPTY_INTERPRETATION;
}

function nearestLevelDistancePct(hit: ChartPatternHit, lastClose: number): number | null {
	const prices = [
		...(hit.levels?.map(l => l.price) ?? []),
		...hit.points.map(p => p.price),
	];
	if (!prices.length || !Number.isFinite(lastClose)) {
		return null;
	}
	let best = Number.POSITIVE_INFINITY;
	for (const price of prices) {
		const denom = Math.max(Math.abs(lastClose), 1e-8);
		best = Math.min(best, Math.abs(price - lastClose) / denom);
	}
	return best;
}

export function buildPatternInterpretation(
	hit: ChartPatternHit,
	lastClose: number,
): string {
	const entry = getChartPatternCatalogEntry(hit.id);
	const base = entry?.interpretation ?? hit.description;
	const parts: string[] = [base];

	const state =
		hit.completionState === 'completed'
			? 'Pattern appears completed.'
			: hit.completionState === 'forming'
				? 'Pattern is still forming.'
				: null;
	if (state) {
		parts.push(state);
	}

	parts.push(
		`Classification is ${classificationLabel(hit.classification)} (${confidenceLabel(hit.confidence)} confidence, ${hit.confidence.toFixed(2)}).`,
	);

	const dist = nearestLevelDistancePct(hit, lastClose);
	if (dist != null) {
		parts.push(`Last close is ${(dist * 100).toFixed(1)}% from the nearest pattern level.`);
	}

	parts.push(
		'Standalone chart patterns are historically weak-to-moderate signals (~55–65%); combine with trend, momentum, and key levels.',
	);

	return parts.join(' ');
}

export function attachInterpretation(hit: ChartPatternHit, lastClose: number): ChartPatternHit {
	const interpretation = buildPatternInterpretation(hit, lastClose);
	return {...hit, interpretation};
}

export function lastCloseFromBars(bars: NormalizedBar[]): number {
	return bars.at(-1)?.close ?? Number.NaN;
}
