/** Agent-facing analysis payload — omits heavy geometry; UI keeps full structuredContent. */
export function slimAnalysisOutputForAgent(data: {
	analysis: Record<string, unknown>;
	meta?: Record<string, unknown>;
}): Record<string, unknown> {
	const analysis = data.analysis;
	const patternMenu = Array.isArray(analysis.patternMenu)
		? (analysis.patternMenu as Record<string, unknown>[]).map(entry => ({
				index: entry.index,
				patternNumber: typeof entry.index === 'number' ? entry.index + 1 : undefined,
				id: entry.id,
				name: entry.name,
				confidence: entry.confidence,
				classification: entry.classification,
				drawable: entry.drawable,
				isPrimary: entry.isPrimary,
				isHighestConfidence: entry.isHighestConfidence,
				barSpan: entry.barSpan,
				keyLevels: entry.keyLevels,
			}))
		: undefined;

	const slimPattern = (hit: Record<string, unknown> | null | undefined) => {
		if (!hit || typeof hit !== 'object') {
			return hit ?? null;
		}
		const rawBarSpan = hit.barSpan as Record<string, unknown> | undefined;
		const barSpan =
			rawBarSpan &&
			typeof rawBarSpan.fromTimeSec === 'number' &&
			typeof rawBarSpan.toTimeSec === 'number'
				? {
						fromTimeSec: rawBarSpan.fromTimeSec,
						toTimeSec: rawBarSpan.toTimeSec,
						barCount:
							typeof rawBarSpan.barCount === 'number'
								? rawBarSpan.barCount
								: typeof rawBarSpan.fromIndex === 'number' &&
									  typeof rawBarSpan.toIndex === 'number'
									? rawBarSpan.toIndex - rawBarSpan.fromIndex + 1
									: undefined,
					}
				: undefined;
		return {
			id: hit.id,
			name: hit.name,
			classification: hit.classification,
			confidence: hit.confidence,
			interpretation: hit.interpretation,
			completionState: hit.completionState,
			drawable: hit.drawable,
			...(barSpan?.barCount != null ? {barSpan} : {}),
			...(Array.isArray(hit.keyLevels) ? {keyLevels: hit.keyLevels} : {}),
		};
	};

	return {
		agentView: 'slim',
		analysis: {
			summary: analysis.summary,
			classification: analysis.classification,
			interpretation: analysis.interpretation,
			rationale: analysis.rationale,
			primaryPattern: slimPattern(analysis.primaryPattern as Record<string, unknown> | null),
			highestConfidencePattern: slimPattern(
				analysis.highestConfidencePattern as Record<string, unknown> | null,
			),
			...(patternMenu ? {patternMenu} : {}),
			pattern: slimPattern(analysis.pattern as Record<string, unknown> | null),
			patternCount: Array.isArray(analysis.patterns) ? analysis.patterns.length : 0,
			applyHint:
				patternMenu?.length ?
					'To draw a menu row on the chart, call apply_chart_pattern_drawings with { title, ohlcvDigest, patternNumber } (patternNumber is 1-based). Do not describe overlays in prose without that tool.'
				: undefined,
		},
		...(data.meta ? {meta: data.meta} : {}),
	};
}
