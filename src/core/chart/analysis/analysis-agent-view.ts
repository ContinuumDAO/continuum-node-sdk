/** Agent-facing analysis payload — omits heavy geometry; UI keeps full structuredContent. */
export function slimAnalysisOutputForAgent(data: {
	analysis: Record<string, unknown>;
	meta?: Record<string, unknown>;
}): Record<string, unknown> {
	const analysis = data.analysis;
	const patternMenu = Array.isArray(analysis.patternMenu)
		? (analysis.patternMenu as Record<string, unknown>[]).map(entry => ({
				index: entry.index,
				id: entry.id,
				name: entry.name,
				confidence: entry.confidence,
				classification: entry.classification,
				drawable: entry.drawable,
				isPrimary: entry.isPrimary,
				isHighestConfidence: entry.isHighestConfidence,
			}))
		: undefined;

	const slimPattern = (hit: Record<string, unknown> | null | undefined) => {
		if (!hit || typeof hit !== 'object') {
			return hit ?? null;
		}
		return {
			id: hit.id,
			name: hit.name,
			classification: hit.classification,
			confidence: hit.confidence,
			interpretation: hit.interpretation,
			completionState: hit.completionState,
			drawable: hit.drawable,
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
		},
		...(data.meta ? {meta: data.meta} : {}),
	};
}
