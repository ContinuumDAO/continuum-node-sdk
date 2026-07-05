import {buildPatternInterpretation} from './interpretation.js';
import {classificationLabel} from './confidence.js';
import type {ChartPatternAnalysis, ChartPatternHit} from './types.js';

export function buildChartPatternAnalysis(
	hits: ChartPatternHit[],
	barCount: number,
	patternsScanned: number,
	lastClose: number,
): ChartPatternAnalysis {
	const sorted = [...hits].sort((a, b) => b.barSpan.toIndex - a.barSpan.toIndex);
	const primary = sorted[0] ?? null;

	if (!primary) {
		return {
			summary: 'No obvious recent pattern found',
			classification: null,
			interpretation:
				'No completed classic chart pattern met the confidence threshold in the recent window. Do not infer directional bias from pattern geometry alone; use trend structure and key levels instead.',
			primaryPattern: null,
			pattern: null,
			patterns: [],
			rationale: `Scanned ${patternsScanned} pattern types on ${barCount} bars; no completed pattern met confidence threshold.`,
		};
	}

	const interpretation = buildPatternInterpretation(primary, lastClose);
	const summary = `${primary.name}${primary.variant ? ` (${primary.variant})` : ''}, ${classificationLabel(primary.classification)}`;

	return {
		summary,
		classification: primary.classification,
		interpretation,
		primaryPattern: {
			id: primary.id,
			name: primary.name,
			classification: primary.classification,
			confidence: primary.confidence,
			interpretation,
		},
		pattern: primary,
		patterns: sorted,
		rationale: `Scanned ${patternsScanned} pattern types on ${barCount} bars; primary pattern "${primary.name}" ending near bar ${primary.barSpan.toIndex}.`,
	};
}
