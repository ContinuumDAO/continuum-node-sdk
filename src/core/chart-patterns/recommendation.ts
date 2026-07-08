import {buildPatternInterpretation} from './interpretation.js';
import {
	buildPatternKeyLevels,
	buildPatternMeasuredMoveSummary,
	enrichPatternMenuEntry,
	meetsChartPatternMenuMinBars,
	patternBarSpanSummary,
	CHART_PATTERN_MENU_MIN_BARS,
} from './pattern-menu-summary.js';
import {buildChartPatternTradeSetupFromHit} from './trade-setup.js';
import {classificationLabel} from './confidence.js';
import type {
	ChartPatternAnalysis,
	ChartPatternHitSummary,
	EnrichedChartPatternHit,
	PatternMenuEntry,
} from './types.js';

function hitSummary(hit: EnrichedChartPatternHit, interpretation: string): ChartPatternHitSummary {
	const measuredMove = buildPatternMeasuredMoveSummary(hit);
	return {
		id: hit.id,
		name: hit.name,
		classification: hit.classification,
		confidence: hit.confidence,
		interpretation,
		barSpan: patternBarSpanSummary(hit),
		keyLevels: buildPatternKeyLevels(hit),
		...(measuredMove ? {measuredMove} : {}),
	};
}

export function buildChartPatternAnalysis(
	hits: EnrichedChartPatternHit[],
	barCount: number,
	patternsScanned: number,
	lastClose: number,
	options?: {minConfidence?: number},
): ChartPatternAnalysis {
	const eligible = hits.filter(meetsChartPatternMenuMinBars);
	const sorted = [...eligible].sort(
		(a, b) => b.barSpan.toIndex - a.barSpan.toIndex || b.confidence - a.confidence,
	);
	const primary = sorted[0] ?? null;

	const byConfidence = [...eligible].sort(
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
			chartPatternTradeSetup: null,
			rationale:
				eligible.length === 0 && hits.length > 0
					? `Scanned ${patternsScanned} pattern types on ${barCount} bars; ${hits.length} candidate(s) were shorter than the ${CHART_PATTERN_MENU_MIN_BARS}-bar menu minimum.`
					: `Scanned ${patternsScanned} pattern types on ${barCount} bars; no completed pattern met confidence threshold.`,
		};
	}

	const interpretation = buildPatternInterpretation(primary, lastClose);
	const summary = `${primary.name}${primary.variant ? ` (${primary.variant})` : ''}, ${classificationLabel(primary.classification)}`;

	const primaryInterpretation = buildPatternInterpretation(primary, lastClose);
	const highestInterpretation = highest
		? buildPatternInterpretation(highest, lastClose)
		: primaryInterpretation;

	let primaryMenuNumber = 1;
	const patternMenu: PatternMenuEntry[] = sorted.map((hit, index) => {
		const isPrimary =
			hit.id === primary.id && hit.barSpan.toIndex === primary.barSpan.toIndex;
		if (isPrimary) {
			primaryMenuNumber = index + 1;
		}
		return enrichPatternMenuEntry(hit, {
			index,
			id: hit.id,
			name: hit.name,
			confidence: hit.confidence,
			completionState: hit.completionState,
			classification: hit.classification,
			drawable: hit.drawable,
			isPrimary,
			isHighestConfidence:
				highest != null &&
				hit.id === highest.id &&
				hit.barSpan.toIndex === highest.barSpan.toIndex &&
				Math.abs(hit.confidence - highest.confidence) < 1e-9,
		});
	});

	const chartPatternTradeSetup = buildChartPatternTradeSetupFromHit(
		primary,
		lastClose,
		primaryMenuNumber,
		{
			minConfidence: options?.minConfidence,
		},
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
		chartPatternTradeSetup,
		rationale: `Scanned ${patternsScanned} pattern types on ${barCount} bars; primary pattern "${primary.name}" ending near bar ${primary.barSpan.toIndex}.`,
	};
}
