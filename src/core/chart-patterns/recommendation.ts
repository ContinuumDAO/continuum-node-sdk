import {buildPatternInterpretation} from './interpretation.js';
import {
	buildPatternKeyLevels,
	enrichPatternMenuEntry,
	patternBarSpanSummary,
} from './pattern-menu-summary.js';
import {classificationLabel} from './confidence.js';
import type {
	ChartPatternAnalysis,
	ChartPatternHitSummary,
	EnrichedChartPatternHit,
	PatternMenuEntry,
} from './types.js';

function hitSummary(hit: EnrichedChartPatternHit, interpretation: string): ChartPatternHitSummary {
	return {
		id: hit.id,
		name: hit.name,
		classification: hit.classification,
		confidence: hit.confidence,
		interpretation,
		barSpan: patternBarSpanSummary(hit),
		keyLevels: buildPatternKeyLevels(hit),
	};
}

export function buildChartPatternAnalysis(
	hits: EnrichedChartPatternHit[],
	barCount: number,
	patternsScanned: number,
	lastClose: number,
): ChartPatternAnalysis {
	const sorted = [...hits].sort((a, b) => b.barSpan.toIndex - a.barSpan.toIndex || b.confidence - a.confidence);
	const primary = sorted[0] ?? null;

	const byConfidence = [...hits].sort(
		(a, b) => b.confidence - a.confidence || b.barSpan.toIndex - a.barSpan.toIndex,
	);
	const highest = byConfidence[0] ?? null;

	if (!primary) {
		return {
			summary: 'No obvious recent pattern found',
			classification: null,
			interpretation:
				'No completed classic chart pattern met the confidence threshold in the recent window. Do not infer directional bias from pattern geometry alone; use trend structure and key levels instead.',
			primaryPattern: null,
			highestConfidencePattern: null,
			patternMenu: [],
			pattern: null,
			patterns: [],
			rationale: `Scanned ${patternsScanned} pattern types on ${barCount} bars; no completed pattern met confidence threshold.`,
		};
	}

	const interpretation = buildPatternInterpretation(primary, lastClose);
	const summary = `${primary.name}${primary.variant ? ` (${primary.variant})` : ''}, ${classificationLabel(primary.classification)}`;

	const primaryInterpretation = buildPatternInterpretation(primary, lastClose);
	const highestInterpretation = highest
		? buildPatternInterpretation(highest, lastClose)
		: primaryInterpretation;

	const patternMenu: PatternMenuEntry[] = sorted.map((hit, index) =>
		enrichPatternMenuEntry(hit, {
			index,
			id: hit.id,
			name: hit.name,
			confidence: hit.confidence,
			completionState: hit.completionState,
			classification: hit.classification,
			drawable: hit.drawable,
			isPrimary: hit.id === primary.id && hit.barSpan.toIndex === primary.barSpan.toIndex,
			isHighestConfidence:
				highest != null &&
				hit.id === highest.id &&
				hit.barSpan.toIndex === highest.barSpan.toIndex &&
				Math.abs(hit.confidence - highest.confidence) < 1e-9,
		}),
	);

	return {
		summary,
		classification: primary.classification,
		interpretation,
		primaryPattern: hitSummary(primary, primaryInterpretation),
		highestConfidencePattern: highest ? hitSummary(highest, highestInterpretation) : null,
		patternMenu,
		pattern: primary,
		patterns: sorted,
		rationale: `Scanned ${patternsScanned} pattern types on ${barCount} bars; primary pattern "${primary.name}" ending near bar ${primary.barSpan.toIndex}.`,
	};
}
